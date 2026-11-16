package http

import (
	"strings"
	"time"

	"github.com/enterprise-pos/backend/internal/delivery/http/middleware"
	"github.com/enterprise-pos/backend/internal/infrastructure/tenant"
	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// RegisterRoutes wires Master Control Plane routes separately from strict Database-per-Company tenant routes.
func RegisterRoutes(app *fiber.App, h *Handler, masterAuth *usecase.AuthUsecase, tenants *tenant.TenantManager, hub *ws.Hub) {
	v1 := app.Group("/api/v1")

	publicLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "public_discovery",
		KeyFn:      func(c *fiber.Ctx) string { return "ip:" + c.IP() },
		OnBlocked:  h.onRateLimitBlocked,
	})
	authLoginLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "auth_login",
		KeyFn:      func(c *fiber.Ctx) string { return "ip:" + c.IP() },
		OnBlocked:  h.onRateLimitBlocked,
	})
	adminLoginLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "admin_login",
		KeyFn:      func(c *fiber.Ctx) string { return "ip:" + c.IP() },
		OnBlocked:  h.onRateLimitBlocked,
	})
	recoveryLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "auth_recovery",
		KeyFn:      func(c *fiber.Ctx) string { return "ip:" + c.IP() },
		OnBlocked:  h.onRateLimitBlocked,
	})
	pinLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "pin_verify",
		KeyFn: func(c *fiber.Ctx) string {
			if tc, ok := middleware.GetTenantContext(c); ok {
				return tc.BusinessID.String() + ":" + tc.UserID.String() + ":" + c.IP()
			}
			return "ip:" + c.IP()
		},
		DynamicLimitFn: func(c *fiber.Ctx) (bool, int) {
			if tc, ok := middleware.GetTenantContext(c); ok {
				p := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
				return p.RateLimitEnabled, p.PINMaxAttempts * 3
			}
			return true, 0
		},
		OnBlocked: h.onRateLimitBlocked,
	})
	tenantAPILimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "tenant_api",
		KeyFn: func(c *fiber.Ctx) string {
			if tc, ok := middleware.GetTenantContext(c); ok {
				return tc.BusinessID.String() + ":" + tc.UserID.String()
			}
			return "ip:" + c.IP()
		},
		DynamicLimitFn: func(c *fiber.Ctx) (bool, int) {
			if tc, ok := middleware.GetTenantContext(c); ok {
				p := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
				return p.RateLimitEnabled, p.APIRPM
			}
			return true, 0
		},
		OnBlocked: h.onRateLimitBlocked,
	})
	posBurstLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "pos_burst",
		KeyFn: func(c *fiber.Ctx) string {
			if tc, ok := middleware.GetTenantContext(c); ok {
				return tc.BusinessID.String() + ":" + tc.UserID.String() + ":" + tc.TerminalID.String()
			}
			return "ip:" + c.IP()
		},
		DynamicLimitFn: func(c *fiber.Ctx) (bool, int) {
			if tc, ok := middleware.GetTenantContext(c); ok {
				p := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
				return p.RateLimitEnabled, 0
			}
			return true, 0
		},
		OnBlocked: h.onRateLimitBlocked,
	})
	analyticsHeavyLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "analytics_heavy",
		KeyFn: func(c *fiber.Ctx) string {
			if tc, ok := middleware.GetTenantContext(c); ok {
				return tc.BusinessID.String() + ":" + tc.UserID.String()
			}
			return "ip:" + c.IP()
		},
		DynamicLimitFn: func(c *fiber.Ctx) (bool, int) {
			if tc, ok := middleware.GetTenantContext(c); ok {
				p := h.authUC(c).ResolveSessionPolicy(c.UserContext(), tc.BusinessID, tc.BranchID, tc.TerminalID)
				return p.RateLimitEnabled, 0
			}
			return true, 0
		},
		OnBlocked: h.onRateLimitBlocked,
	})
	wsLimiter := middleware.RateLimit(h.rateLimiter, middleware.RateLimitOptions{
		PolicyName: "ws_upgrade",
		KeyFn:      func(c *fiber.Ctx) string { return "ip:" + c.IP() },
		OnBlocked:  h.onRateLimitBlocked,
	})

	// Health Readiness
	v1.Get("/health", h.Health)

	// Standalone Platform Admin Control Plane (Master DB Only — never mixed with Company ERP Auth)
	v1.Get("/platform/setup-status", publicLimiter, h.PlatformSetupStatus)
	v1.Post("/platform/bootstrap", adminLoginLimiter, h.PlatformBootstrap)
	v1.Post("/admin/login", adminLoginLimiter, h.AdminLogin)

	adminGroup := v1.Group("/admin", middleware.PlatformAdminMiddleware(masterAuth), h.RealtimeAdminMutationMiddleware())
	adminGroup.Post("/logout", h.AdminLogout)
	adminGroup.Post("/refresh", h.AdminRefreshSession)
	adminGroup.Get("/sessions", h.AdminListSessions)
	adminGroup.Delete("/sessions/:id", h.AdminRevokeSession)
	adminGroup.Post("/sessions/revoke-others", h.AdminRevokeOtherSessions)
	adminGroup.Get("/security/overview", h.AdminGetSecurityOverview)
	adminGroup.Get("/companies", h.AdminListCompanies)
	adminGroup.Post("/companies", h.AdminCreateCompany)
	adminGroup.Put("/companies/:id", h.AdminUpdateCompany)
	adminGroup.Get("/logs", h.AdminListAuditLogs)
	adminGroup.Get("/platform-users", h.AdminListPlatformUsers)
	adminGroup.Post("/platform-users", h.AdminCreatePlatformUser)
	adminGroup.Put("/platform-users/:id", h.AdminUpdatePlatformUser)

	// Public 1-to-1 Company Portal Directory & Tenant Auth
	v1.Get("/auth/companies", publicLimiter, h.GetPublicCompanies)
	v1.Get("/auth/branding", publicLimiter, h.GetPublicBranding)
	v1.Get("/auth/discover", publicLimiter, h.DiscoverWorkspaceByEmail)
	v1.Post("/auth/login", authLoginLimiter, h.Login)
	v1.Post("/auth/forgot-password", recoveryLimiter, h.ForgotPassword)
	v1.Post("/auth/reset-password", recoveryLimiter, h.ResetPassword)

	// WebSocket Real-Time Channel (Tenant-scoped JWT + verified active session + company DB)
	app.Use("/ws", wsLimiter, func(c *fiber.Ctx) error {
		if c.Path() == "/ws/admin" {
			return c.Next()
		}
		if websocket.IsWebSocketUpgrade(c) {
			tok := c.Query("token")
			tc, err := masterAuth.ParseJWT(tok)
			if err != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized websocket"})
			}
			bundle, tErr := tenants.GetByBusinessID(c.UserContext(), tc.BusinessID)
			if tErr != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "inactive or unknown tenant database"})
			}
			if bundle.Auth != nil {
				if sErr := bundle.Auth.ValidateTenantSession(c.UserContext(), tc); sErr != nil {
					return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": sErr.Error(), "code": "SESSION_INVALID"})
				}
			}
			c.Locals("ws_business_id", tc.BusinessID)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		bizID, ok := c.Locals("ws_business_id").(uuid.UUID)
		if !ok || bizID == uuid.Nil {
			tc, err := masterAuth.ParseJWT(c.Query("token"))
			if err != nil {
				_ = c.Close()
				return
			}
			bizID = tc.BusinessID
		}
		hub.Register(bizID, c)
		defer hub.Unregister(bizID, c)

		_ = hub.WriteDirect(c, bizID, "CONNECTED", map[string]any{"ts": time.Now().UTC().UnixMilli()})

		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(25 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := hub.WriteDirect(c, bizID, "PING", map[string]any{"ts": time.Now().UTC().UnixMilli()}); err != nil {
						return
					}
				}
			}
		}()

		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				break
			}
			if strings.Contains(strings.ToLower(string(msg)), "ping") {
				_ = hub.WriteDirect(c, bizID, "PONG", map[string]any{"ts": time.Now().UTC().UnixMilli()})
			}
		}
	}))

	// Isolated Platform Control Plane WebSocket Channel (/ws/admin)
	app.Use("/ws/admin", wsLimiter, func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			tok := c.Query("token")
			adminCtx, err := masterAuth.ParsePlatformAdminJWT(tok)
			if err != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized platform admin websocket"})
			}
			if sErr := masterAuth.ValidatePlatformAdminSession(c.UserContext(), adminCtx); sErr != nil {
				return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": sErr.Error(), "code": "SESSION_INVALID"})
			}
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})
	app.Get("/ws/admin", websocket.New(func(c *websocket.Conn) {
		hub.RegisterAdmin(c)
		defer hub.UnregisterAdmin(c)

		_ = hub.WriteDirect(c, uuid.Nil, "CONNECTED", map[string]any{"ts": time.Now().UTC().UnixMilli()})

		done := make(chan struct{})
		defer close(done)
		go func() {
			ticker := time.NewTicker(25 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-done:
					return
				case <-ticker.C:
					if err := hub.WriteDirect(c, uuid.Nil, "PING", map[string]any{"ts": time.Now().UTC().UnixMilli()}); err != nil {
						return
					}
				}
			}
		}()

		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				break
			}
			if strings.Contains(strings.ToLower(string(msg)), "ping") {
				_ = hub.WriteDirect(c, uuid.Nil, "PONG", map[string]any{"ts": time.Now().UTC().UnixMilli()})
			}
		}
	}))

	// Authenticated Tenant Company Routes (100% dispatched to that company's dedicated pos_tenant_<slug> DB)
	protected := v1.Group("", middleware.TenantAuthMiddleware(masterAuth, tenants), tenantAPILimiter, h.RealtimeTenantMutationMiddleware())

	protected.Post("/auth/logout", h.Logout)
	protected.Post("/auth/refresh", h.RefreshSession)
	protected.Get("/auth/sessions", h.ListMySessions)
	protected.Delete("/auth/sessions/:id", h.RevokeMySession)
	protected.Post("/auth/sessions/revoke-others", h.RevokeOtherSessions)
	protected.Post("/auth/switch-context", h.SwitchContext)
	protected.Post("/auth/verify-pin", pinLimiter, h.VerifySupervisorPIN)
	protected.Post("/auth/verify-supervisor-pin", pinLimiter, h.VerifySupervisorPIN)
	protected.Post("/auth/change-password", recoveryLimiter, h.ChangePassword)

	// Security Overview & Admin Session Governance
	protected.Get("/security/overview", h.GetSecurityOverview)
	protected.Get("/security/sessions", middleware.RequireAnyPermission(masterAuth, "security:sessions_view", "rbac:view"), h.ListBusinessSessions)
	protected.Delete("/security/sessions/:id", middleware.RequireAnyPermission(masterAuth, "security:sessions_manage", "rbac:manage"), h.AdminRevokeTenantSession)
	protected.Post("/security/sessions/revoke-user/:userId", middleware.RequireAnyPermission(masterAuth, "security:sessions_manage", "rbac:manage"), h.AdminRevokeAllUserSessions)

	// Overview Bento Analytics
	protected.Get("/overview", analyticsHeavyLimiter, middleware.RequirePermission(masterAuth, "analytics:view"), h.GetOverview)

	// CRM Customers & Catalog Product Management
	protected.Get("/customers", middleware.RequirePermission(masterAuth, "customers:view"), h.ListCustomers)
	protected.Post("/customers", middleware.RequirePermission(masterAuth, "customers:manage"), h.CreateCustomer)
	protected.Put("/customers/:id", middleware.RequirePermission(masterAuth, "customers:manage"), h.UpdateCustomer)
	protected.Get("/categories", middleware.RequirePermission(masterAuth, "catalog:view"), h.ListCategories)
	protected.Post("/categories", middleware.RequirePermission(masterAuth, "catalog:manage"), h.CreateCategory)
	protected.Put("/categories/:id", middleware.RequirePermission(masterAuth, "catalog:manage"), h.UpdateCategory)
	protected.Delete("/categories/:id", middleware.RequirePermission(masterAuth, "catalog:manage"), h.DeleteCategory)
	protected.Post("/products", middleware.RequirePermission(masterAuth, "catalog:manage"), h.CreateProduct)
	protected.Post("/products/bulk-discount", middleware.RequirePermission(masterAuth, "catalog:manage"), h.BulkDiscountProducts)
	protected.Put("/products/:id", middleware.RequirePermission(masterAuth, "catalog:manage"), h.UpdateProduct)
	protected.Delete("/products/:id", middleware.RequirePermission(masterAuth, "catalog:manage"), h.DeleteOrArchiveProduct)

	// Reporting & Persistent Notifications
	protected.Get("/reports/summary", analyticsHeavyLimiter, middleware.RequirePermission(masterAuth, "analytics:view"), h.GetEnterpriseReports)
	protected.Get("/notifications", h.ListNotifications)
	protected.Post("/notifications/:id/read", h.MarkNotificationRead)
	protected.Post("/notifications/read-all", h.MarkAllNotificationsRead)

	// POS Terminal & Held Bills
	protected.Get("/pos/bootstrap", middleware.RequirePermission(masterAuth, "pos:view"), h.BootstrapPOS)
	protected.Post("/pos/checkout", posBurstLimiter, middleware.RequirePermission(masterAuth, "pos:checkout"), h.POSCheckout)
	protected.Post("/pos/invoices/:id/void", middleware.RequirePermission(masterAuth, "pos:void_bill"), h.VoidInvoice)
	protected.Post("/pos/invoices/:id/refund", middleware.RequirePermission(masterAuth, "pos:refund"), h.RefundInvoice)
	protected.Get("/pos/held-bills", middleware.RequirePermission(masterAuth, "pos:hold_bill"), h.ListHeldBills)
	protected.Post("/pos/held-bills", posBurstLimiter, middleware.RequirePermission(masterAuth, "pos:hold_bill"), h.CreateHeldBill)
	protected.Patch("/pos/held-bills/:id/status", posBurstLimiter, middleware.RequirePermission(masterAuth, "pos:hold_bill"), h.UpdateHeldBillWorkflow)
	protected.Delete("/pos/held-bills/:id", middleware.RequirePermission(masterAuth, "pos:void_bill"), h.VoidHeldBill)

	// Inventory, Suppliers & GRN Intake
	protected.Get("/suppliers", middleware.RequirePermission(masterAuth, "inventory:view"), h.ListSuppliers)
	protected.Post("/suppliers", middleware.RequirePermission(masterAuth, "inventory:grn_create"), h.CreateSupplier)
	protected.Put("/suppliers/:id", middleware.RequirePermission(masterAuth, "inventory:grn_create"), h.UpdateSupplier)
	protected.Delete("/suppliers/:id", middleware.RequirePermission(masterAuth, "inventory:grn_create"), h.DeleteSupplier)
	protected.Get("/inventory", middleware.RequirePermission(masterAuth, "inventory:view"), h.ListInventory)
	protected.Get("/inventory/grns/:id", middleware.RequirePermission(masterAuth, "inventory:view"), h.GetGRNDetail)
	protected.Post("/inventory/grns", middleware.RequirePermission(masterAuth, "inventory:grn_create"), h.CreateGRN)
	protected.Put("/inventory/grns/:id", middleware.RequirePermission(masterAuth, "inventory:grn_create"), h.UpdateGRN)
	protected.Post("/inventory/grns/:id/approve", middleware.RequirePermission(masterAuth, "inventory:grn_approve"), h.ApproveGRN)
	protected.Post("/inventory/low-stock/scan", middleware.RequirePermission(masterAuth, "inventory:po_create"), h.ScanLowStockAutoPO)
	protected.Put("/procurement/invoices/:id/status", middleware.RequirePermission(masterAuth, "inventory:po_create"), h.UpdatePurchaseInvoiceStatus)

	// General Ledger Accounting
	protected.Get("/accounting", analyticsHeavyLimiter, middleware.RequirePermission(masterAuth, "accounting:view"), h.GetAccountingWorkspace)
	protected.Get("/accounting/journals/:id/lines", middleware.RequirePermission(masterAuth, "accounting:view"), h.GetJournalLines)
	protected.Get("/accounting/sources/:sourceId/journals", middleware.RequirePermission(masterAuth, "accounting:view"), h.GetSourceJournals)
	protected.Post("/accounting/fiscal-periods/:id/lock", middleware.RequirePermission(masterAuth, "accounting:lock_period"), h.LockFiscalPeriod)

	// 6-Level Settings Inheritance, Company Profile & RBAC Matrix
	protected.Get("/settings/resolved", middleware.RequirePermission(masterAuth, "settings:view"), h.GetResolvedSettings)
	protected.Put("/settings/override", middleware.RequirePermission(masterAuth, "settings:manage"), h.UpsertSettingOverride)
	protected.Post("/settings/reset", middleware.RequirePermission(masterAuth, "settings:manage"), h.ResetSettingOverride)
	protected.Post("/settings/industry-preset", middleware.RequirePermission(masterAuth, "settings:manage"), h.ApplyIndustryPreset)
	protected.Get("/company/settings", middleware.RequirePermission(masterAuth, "settings:view"), h.GetCompanySettings)
	protected.Put("/company/settings", middleware.RequirePermission(masterAuth, "settings:manage"), h.UpdateCompanySettings)

	// Company Branches & POS Terminals Management (Multi-branch creation/editing strictly Company Owner)
	protected.Get("/branches", middleware.RequirePermission(masterAuth, "branches:view"), h.ListBranches)
	protected.Post("/branches", middleware.RequirePermission(masterAuth, "branches:manage"), h.CreateBranch)
	protected.Put("/branches/:id", middleware.RequirePermission(masterAuth, "branches:manage"), h.UpdateBranch)
	protected.Get("/terminals", middleware.RequirePermission(masterAuth, "branches:view"), h.ListTerminals)
	protected.Post("/terminals", middleware.RequirePermission(masterAuth, "branches:manage"), h.CreateTerminal)
	protected.Put("/terminals/:id", middleware.RequirePermission(masterAuth, "branches:manage"), h.UpdateTerminal)

	// Access Management (Row-Wise Logins, Roles, Departments, Designations & PIN Control — strictly tenant scope)
	protected.Get("/access/users", middleware.RequirePermission(masterAuth, "rbac:view"), h.ListAccessUsers)
	protected.Post("/access/users", middleware.RequirePermission(masterAuth, "rbac:manage"), h.CreateAccessUser)
	protected.Put("/access/users/:id", middleware.RequirePermission(masterAuth, "rbac:manage"), h.UpdateAccessUser)
	protected.Get("/access/permissions", middleware.RequirePermission(masterAuth, "rbac:view"), h.ListAllPermissions)
	protected.Post("/access/roles", middleware.RequirePermission(masterAuth, "rbac:manage"), h.CreateCustomRole)
	protected.Put("/access/roles/:id", middleware.RequirePermission(masterAuth, "rbac:manage"), h.UpdateCustomRole)
	protected.Get("/access/departments", middleware.RequirePermission(masterAuth, "rbac:view"), h.ListDepartmentsAndDesignations)
	protected.Post("/access/departments", middleware.RequirePermission(masterAuth, "rbac:manage"), h.CreateDepartment)
	protected.Get("/access/designations", middleware.RequirePermission(masterAuth, "rbac:view"), h.ListDepartmentsAndDesignations)
	protected.Post("/access/designations", middleware.RequirePermission(masterAuth, "rbac:manage"), h.CreateDesignation)
	protected.Put("/access/designations/:id", middleware.RequirePermission(masterAuth, "rbac:manage"), h.UpdateDesignation)

	// Multi-Tier Tax Groups, Rules & Sri Lankan IRD Tax Presets
	protected.Get("/tax-groups", middleware.RequirePermission(masterAuth, "settings:view"), h.ListTaxGroupsAndRules)
	protected.Post("/tax-groups", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.CreateTaxGroup)
	protected.Put("/tax-groups/:id", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.UpdateTaxGroup)
	protected.Post("/tax-groups/sl-preset", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.ApplySLTaxPreset)
	protected.Post("/tax-rules", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.CreateTaxRule)
	protected.Put("/tax-rules/:id", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.UpdateTaxRule)
	protected.Delete("/tax-rules/:id", middleware.RequirePermission(masterAuth, "accounting:tax_manage"), h.DeleteTaxRule)

	// Receipt & Invoice Print Studio (Templates & Hardware Profiles)
	protected.Get("/print-templates", middleware.RequirePermission(masterAuth, "print:view"), h.ListPrintTemplates)
	protected.Post("/print-templates", middleware.RequirePermission(masterAuth, "print:manage"), h.CreatePrintTemplate)
	protected.Put("/print-templates/:id", middleware.RequirePermission(masterAuth, "print:manage"), h.UpdatePrintTemplate)
	protected.Post("/print-templates/:id/default", middleware.RequirePermission(masterAuth, "print:manage"), h.SetDefaultPrintTemplate)
	protected.Delete("/print-templates/:id", middleware.RequirePermission(masterAuth, "print:manage"), h.DeletePrintTemplate)
}
