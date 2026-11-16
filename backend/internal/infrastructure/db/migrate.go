package dbinfra

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

var validDBNameRegex = regexp.MustCompile(`^[a-z][a-z0-9_]{2,60}$`)

// ValidateDatabaseName ensures database identifiers only contain safe lowercase ASCII, digits, and underscores.
func ValidateDatabaseName(dbName string) error {
	if !validDBNameRegex.MatchString(dbName) {
		return fmt.Errorf("invalid database identifier %q", dbName)
	}
	return nil
}

// BuildDatabaseURLWithDB clones baseURL and swaps the database path to targetDB.
func BuildDatabaseURLWithDB(baseURL, targetDB string) (string, error) {
	if err := ValidateDatabaseName(targetDB); err != nil {
		return "", err
	}
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse database url: %w", err)
	}
	u.Path = "/" + targetDB
	return u.String(), nil
}

// DatabaseExists checks pg_database for dbName.
func DatabaseExists(ctx context.Context, pool *pgxpool.Pool, dbName string) (bool, error) {
	if err := ValidateDatabaseName(dbName); err != nil {
		return false, err
	}
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)`, dbName).Scan(&exists)
	return exists, err
}

// CreateDatabase creates a standalone PostgreSQL database if it does not already exist.
func CreateDatabase(ctx context.Context, pool *pgxpool.Pool, dbName string) error {
	if err := ValidateDatabaseName(dbName); err != nil {
		return err
	}
	exists, err := DatabaseExists(ctx, pool, dbName)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	// Identifier already strictly validated via validDBNameRegex (`^[a-z][a-z0-9_]{2,60}$`).
	_, err = pool.Exec(ctx, fmt.Sprintf(`CREATE DATABASE %s ENCODING 'UTF8'`, dbName))
	if err != nil {
		return fmt.Errorf("create database %s: %w", dbName, err)
	}
	return nil
}

// DropDatabase terminates active connections and drops the target tenant database.
func DropDatabase(ctx context.Context, pool *pgxpool.Pool, dbName string) error {
	if err := ValidateDatabaseName(dbName); err != nil {
		return err
	}
	_, _ = pool.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, dbName)
	_, err := pool.Exec(ctx, fmt.Sprintf(`DROP DATABASE IF EXISTS %s`, dbName))
	return err
}

// RunMigrations executes any unapplied *.up.sql scripts in migrationsDir idempotently on the Master DB.
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, migrationsDir string) error {
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return err
	}

	// If database was already initialized via docker-entrypoint-initdb.d, mark 000001 and 000002 applied.
	var hasBusinesses bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='businesses')`).Scan(&hasBusinesses); err == nil && hasBusinesses {
		var count int
		if cErr := pool.QueryRow(ctx, `SELECT COUNT(*) FROM businesses`).Scan(&count); cErr == nil && count > 0 {
			_, _ = pool.Exec(ctx, `
				INSERT INTO schema_migrations (filename)
				VALUES ('000001_init_3nf_schema.up.sql'), ('000002_seed_demo_data.up.sql')
				ON CONFLICT (filename) DO NOTHING
			`)
		}
	}

	return applyMigrationsFiltered(ctx, pool, migrationsDir, func(base string) bool {
		return true
	})
}

// RunTenantMigrations executes isolated company schema migrations (excluding Master control plane migrations, and optionally 000002 demo seed).
func RunTenantMigrations(ctx context.Context, pool *pgxpool.Pool, migrationsDir string, includeDemoSeed bool) error {
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`); err != nil {
		return err
	}

	return applyMigrationsFiltered(ctx, pool, migrationsDir, func(base string) bool {
		if strings.HasPrefix(base, "000010_") || strings.HasPrefix(base, "000012_") || strings.HasPrefix(base, "000014_") {
			return false
		}
		if !includeDemoSeed && strings.HasPrefix(base, "000002_") {
			return false
		}
		return true
	})
}

func applyMigrationsFiltered(ctx context.Context, pool *pgxpool.Pool, migrationsDir string, allow func(base string) bool) error {
	files, err := filepath.Glob(filepath.Join(migrationsDir, "*.up.sql"))
	if err != nil {
		return err
	}
	sort.Strings(files)

	for _, f := range files {
		base := filepath.Base(f)
		if !allow(base) {
			continue
		}
		var alreadyApplied bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE filename = $1)`, base).Scan(&alreadyApplied); err != nil {
			return err
		}
		if alreadyApplied {
			continue
		}

		raw, rErr := os.ReadFile(f)
		if rErr != nil {
			return rErr
		}
		log.Printf("Executing SQL migration: %s", base)
		if _, execErr := pool.Exec(ctx, string(raw)); execErr != nil {
			return fmt.Errorf("migration %s failed: %w", base, execErr)
		}
		if _, insErr := pool.Exec(ctx, `INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`, base); insErr != nil {
			return insErr
		}
	}
	return nil
}
