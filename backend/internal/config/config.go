package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// Config holds runtime configuration for the KOVA POS API server.
type Config struct {
	Port             string
	DatabaseURL      string
	RedisAddr        string
	JWTSecret        string
	PinTokenSecret   string
	CORSAllowOrigins string
}

// Load loads optional .env files first (without overwriting real OS environment
// variables) and returns the resolved Config with safe local defaults.
func Load() Config {
	loadDotEnvFiles(".env", filepath.Join("..", ".env"))
	return Config{
		Port:             getEnv("PORT", "8080"),
		DatabaseURL:      getEnv("DATABASE_URL", "postgres://pos_admin:pos_secret@localhost:5432/enterprise_pos?sslmode=disable"),
		RedisAddr:        getEnv("REDIS_ADDR", "localhost:6379"),
		JWTSecret:        getEnv("JWT_SECRET", "zona-pro-enterprise-pos-jwt-secret-2026"),
		PinTokenSecret:   getEnv("PIN_TOKEN_SECRET", "zona-pro-supervisor-pin-secret-2026"),
		CORSAllowOrigins: getEnv("CORS_ALLOW_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadDotEnvFiles(paths ...string) {
	for _, p := range paths {
		loadDotEnvFile(p)
	}
}

func loadDotEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer func() { _ = f.Close() }()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		idx := strings.IndexByte(line, '=')
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}
