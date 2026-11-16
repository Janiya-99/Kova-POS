package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/enterprise-pos/backend/internal/config"
	deliveryhttp "github.com/enterprise-pos/backend/internal/delivery/http"
	dbinfra "github.com/enterprise-pos/backend/internal/infrastructure/db"
	"github.com/enterprise-pos/backend/internal/infrastructure/mailer"
	"github.com/enterprise-pos/backend/internal/infrastructure/ratelimit"
	"github.com/enterprise-pos/backend/internal/infrastructure/tenant"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/repository/sqlc/db"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/enterprise-pos/backend/internal/worker"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	masterPool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to Master PostgreSQL DB: %v", err)
	}
	defer masterPool.Close()

	if err := masterPool.Ping(ctx); err != nil {
		log.Fatalf("failed to ping Master PostgreSQL DB: %v", err)
	}

	if err := dbinfra.RunMigrations(ctx, masterPool, "./migrations"); err != nil {
		log.Fatalf("master migration execution failed: %v", err)
	}

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("Redis ping warning (continuing without cache until ready): %v", err)
	}
	defer func() { _ = rdb.Close() }()

	masterQueries := db.New(masterPool)
	hub := ws.NewHub()

	masterAuthUC := usecase.NewAuthUsecase(masterQueries, rdb, cfg.JWTSecret, cfg.PinTokenSecret)
	lowStockClient := worker.NewLowStockClient(cfg.RedisAddr)
	defer func() { _ = lowStockClient.Close() }()

	tenantMgr := tenant.NewTenantManager(
		masterPool,
		masterQueries,
		cfg.DatabaseURL,
		"./migrations",
		rdb,
		hub,
		lowStockClient,
		cfg.JWTSecret,
		cfg.PinTokenSecret,
	)
	defer tenantMgr.CloseAll()

	if err := tenantMgr.BootstrapZonaRetailTenantDB(ctx); err != nil {
		log.Fatalf("bootstrap standalone Zona Retail DB failed: %v", err)
	}

	adminAuditUC := usecase.NewAdminAuditUsecase(masterPool, masterQueries, nil, rdb)
	adminAuditUC.SetProvisioner(tenantMgr)
	adminAuditUC.SetHub(hub)
	masterAuthUC.SetHub(hub)
	mailClient := mailer.New(mailer.Config{
		Host:       cfg.SMTPHost,
		Port:       cfg.SMTPPort,
		User:       cfg.SMTPUser,
		Password:   cfg.SMTPPassword,
		From:       cfg.SMTPFrom,
		AppBaseURL: cfg.AppBaseURL,
	})
	masterAuthUC.SetMailer(mailClient)
	tenantMgr.SetMailer(mailClient)
	limiter := ratelimit.NewLimiter(rdb)

	asynqServer := worker.StartLowStockWorker(cfg.RedisAddr, tenantMgr, hub)
	defer asynqServer.Shutdown()

	app := fiber.New(fiber.Config{
		AppName:                 "Enterprise Multi-Business POS API v2.0 (Database-Per-Company)",
		EnableTrustedProxyCheck: true,
		TrustedProxies:          []string{"127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"},
		ProxyHeader:             fiber.HeaderXForwardedFor,
		EnableIPValidation:      true,
	})
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:  cfg.CORSAllowOrigins,
		AllowHeaders:  "Origin, Content-Type, Accept, Authorization, X-Idempotency-Key, X-Supervisor-Override-Token",
		AllowMethods:  "GET, POST, PUT, PATCH, DELETE, OPTIONS",
		ExposeHeaders: "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Policy",
	}))

	handler := deliveryhttp.NewHandler(masterAuthUC, adminAuditUC, tenantMgr)
	handler.SetRateLimiter(limiter)
	handler.SetHub(hub)
	deliveryhttp.RegisterRoutes(app, handler, masterAuthUC, tenantMgr, hub)

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		_ = app.Shutdown()
	}()

	log.Printf("Enterprise POS API listening on :%s (Master + Isolated Tenant DBs)", cfg.Port)
	if err := app.Listen(":" + cfg.Port); err != nil {
		log.Fatalf("server exited: %v", err)
	}
}
