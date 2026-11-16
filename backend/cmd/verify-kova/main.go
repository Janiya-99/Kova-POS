package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type loginResp struct {
	Token   string `json:"token"`
	Context struct {
		BusinessID  string `json:"business_id"`
		BranchID    string `json:"branch_id"`
		TerminalID  string `json:"terminal_id"`
		CompanySlug string `json:"company_slug"`
		RoleName    string `json:"role_name"`
	} `json:"context"`
	Error string `json:"error"`
}

type checkoutResp struct {
	InvoiceID     string `json:"invoice_id"`
	InvoiceNumber string `json:"invoice_number"`
	GrandTotal    string `json:"grand_total"`
	Error         string `json:"error"`
}

type latencyStats struct {
	Endpoint string
	Runs     int
	Errors   int
	MinMs    float64
	AvgMs    float64
	P50Ms    float64
	P95Ms    float64
	P99Ms    float64
	MaxMs    float64
}

func envOr(k, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return fallback
}

func replaceDBInURL(raw, newDB string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	u.Path = "/" + newDB
	return u.String()
}

func computeStats(name string, samples []float64, errs int) latencyStats {
	if len(samples) == 0 {
		return latencyStats{Endpoint: name, Runs: 0, Errors: errs}
	}
	sorted := append([]float64(nil), samples...)
	sort.Float64s(sorted)
	sum := 0.0
	for _, s := range sorted {
		sum += s
	}
	pct := func(p float64) float64 {
		idx := int(float64(len(sorted)-1) * p)
		if idx < 0 {
			idx = 0
		}
		if idx >= len(sorted) {
			idx = len(sorted) - 1
		}
		return sorted[idx]
	}
	return latencyStats{
		Endpoint: name,
		Runs:     len(sorted),
		Errors:   errs,
		MinMs:    sorted[0],
		AvgMs:    sum / float64(len(sorted)),
		P50Ms:    pct(0.50),
		P95Ms:    pct(0.95),
		P99Ms:    pct(0.99),
		MaxMs:    sorted[len(sorted)-1],
	}
}

func httpJSON(client *http.Client, method, fullURL, token, idemKey string, body any) (int, http.Header, []byte, float64, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return 0, nil, nil, 0, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, fullURL, reader)
	if err != nil {
		return 0, nil, nil, 0, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if idemKey != "" {
		req.Header.Set("X-Idempotency-Key", idemKey)
	}
	start := time.Now()
	resp, err := client.Do(req)
	elapsedMs := float64(time.Since(start).Microseconds()) / 1000.0
	if err != nil {
		return 0, nil, nil, elapsedMs, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	return resp.StatusCode, resp.Header, raw, elapsedMs, err
}

func loginStaff(client *http.Client, apiBase, email, password string) (loginResp, float64, error) {
	code, _, raw, ms, err := httpJSON(client, http.MethodPost, apiBase+"/auth/login", "", "", map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil {
		return loginResp{}, ms, err
	}
	var out loginResp
	_ = json.Unmarshal(raw, &out)
	if code != http.StatusOK || out.Token == "" {
		return out, ms, fmt.Errorf("login %s failed status=%d body=%s", email, code, string(raw))
	}
	return out, ms, nil
}

func loginAdmin(client *http.Client, apiBase, email, password string) (string, float64, error) {
	code, _, raw, ms, err := httpJSON(client, http.MethodPost, apiBase+"/admin/login", "", "", map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil {
		return "", ms, err
	}
	var out struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(raw, &out)
	if code != http.StatusOK || out.Token == "" {
		return "", ms, fmt.Errorf("admin login failed status=%d body=%s", code, string(raw))
	}
	return out.Token, ms, nil
}

func tamperJWTPayload(jwtToken string) string {
	parts := strings.Split(jwtToken, ".")
	if len(parts) != 3 {
		return jwtToken + "tamper"
	}
	rawPayload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return parts[0] + ".invalid." + parts[2]
	}
	mutated := strings.Replace(string(rawPayload), "kova-mobile", "evil-tenant", 1)
	if mutated == string(rawPayload) {
		mutated = string(rawPayload) + " "
	}
	parts[1] = base64.RawURLEncoding.EncodeToString([]byte(mutated))
	return strings.Join(parts, ".")
}

func runExplain(ctx context.Context, pool *pgxpool.Pool, label, sqlText string, args ...any) (string, error) {
	// Warm buffer pool once first
	_, _ = pool.Exec(ctx, sqlText, args...)
	rows, err := pool.Query(ctx, "EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) "+sqlText, args...)
	if err != nil {
		return "", fmt.Errorf("%s explain failed: %w", label, err)
	}
	defer rows.Close()
	var lines []string
	for rows.Next() {
		var line string
		if err := rows.Scan(&line); err != nil {
			return "", err
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n"), rows.Err()
}

func main() {
	ctx := context.Background()
	masterURL := envOr("DATABASE_URL", "postgres://pos_admin:pos_secret@localhost:5432/enterprise_pos?sslmode=disable")
	tenantURL := envOr("TENANT_DB_URL", replaceDBInURL(masterURL, "pos_tenant_kova_mobile"))
	redisAddr := envOr("REDIS_ADDR", "localhost:6379")
	apiBase := strings.TrimRight(envOr("API_BASE_URL", "http://localhost:8080/api/v1"), "/")

	masterPool, err := pgxpool.New(ctx, masterURL)
	if err != nil {
		log.Fatalf("connect master db: %v", err)
	}
	defer masterPool.Close()

	tenantPool, err := pgxpool.New(ctx, tenantURL)
	if err != nil {
		log.Fatalf("connect tenant db: %v", err)
	}
	defer tenantPool.Close()

	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("connect redis: %v", err)
	}

	// Ensure clean rate-limit buckets before starting benchmark
	for _, pat := range []string{"rl:*"} {
		if keys, err := rdb.Keys(ctx, pat).Result(); err == nil && len(keys) > 0 {
			_ = rdb.Del(ctx, keys...).Err()
		}
	}

	client := &http.Client{
		Timeout: 20 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        200,
			MaxIdleConnsPerHost: 200,
			IdleConnTimeout:     60 * time.Second,
		},
	}

	fmt.Println("=== KOVA MOBILE HUB: EMPIRICAL VERIFICATION, BENCHMARK & SECURITY SUITE ===")
	fmt.Printf("Timestamp: %s\n", time.Now().Format(time.RFC3339))
	fmt.Printf("API Base:  %s\n\n", apiBase)

	// -------------------------------------------------------------------------
	// 1. DATABASE ISOLATION & 2023-2027 COVERAGE AUDIT
	// -------------------------------------------------------------------------
	fmt.Println("## 1. Database Isolation, Row Counts & Double-Entry Integrity")
	var zonaDBCount int
	if err := masterPool.QueryRow(ctx, `SELECT COUNT(*) FROM pg_database WHERE datname = 'pos_tenant_zona_retail'`).Scan(&zonaDBCount); err != nil {
		log.Fatalf("check zona db: %v", err)
	}
	var companyCount int
	var registeredSlug, registeredDB string
	if err := masterPool.QueryRow(ctx, `SELECT COUNT(*) FROM platform_companies`).Scan(&companyCount); err != nil {
		log.Fatalf("count platform_companies: %v", err)
	}
	if err := masterPool.QueryRow(ctx, `SELECT slug, db_name FROM platform_companies LIMIT 1`).Scan(&registeredSlug, &registeredDB); err != nil {
		log.Fatalf("read platform_companies: %v", err)
	}
	fmt.Printf("- Legacy Zona DB count (`pos_tenant_zona_retail`): %d\n", zonaDBCount)
	fmt.Printf("- Active Registered Companies: %d (`%s` -> `%s`)\n", companyCount, registeredSlug, registeredDB)
	if zonaDBCount != 0 || companyCount != 1 || registeredSlug != "kova-mobile" {
		log.Fatalf("tenant isolation precheck failed: zonaDBCount=%d companyCount=%d slug=%s", zonaDBCount, companyCount, registeredSlug)
	}

	tableQueries := []struct {
		Label string
		Table string
	}{
		{"branches", "branches"},
		{"terminals", "terminals"},
		{"users", "users"},
		{"categories", "categories"},
		{"brands", "brands"},
		{"products", "products"},
		{"suppliers", "suppliers"},
		{"customers", "customers"},
		{"fiscal_periods", "fiscal_periods"},
		{"purchase_orders", "purchase_orders"},
		{"purchase_order_items", "purchase_order_items"},
		{"purchase_invoices", "purchase_invoices"},
		{"inventory_batches", "inventory_batches"},
		{"stock_ledger_entries", "stock_ledger_entries"},
		{"pos_shifts", "pos_shifts"},
		{"sales_invoices", "sales_invoices"},
		{"sales_invoice_items", "sales_invoice_items"},
		{"journal_entries", "journal_entries"},
		{"journal_lines", "journal_lines"},
		{"suspended_bills", "suspended_bills"},
		{"suspended_bill_items", "suspended_bill_items"},
		{"print_templates", "print_templates"},
		{"system_notifications", "system_notifications"},
		{"scoped_settings", "scoped_settings"},
	}

	totalRows := 0
	for _, tq := range tableQueries {
		var cnt int
		if err := tenantPool.QueryRow(ctx, "SELECT COUNT(*) FROM "+tq.Table).Scan(&cnt); err != nil {
			log.Fatalf("count %s: %v", tq.Table, err)
		}
		totalRows += cnt
		fmt.Printf("  - %-24s %6d rows\n", tq.Label+":", cnt)
	}
	var masterAuditCount int
	_ = masterPool.QueryRow(ctx, `SELECT COUNT(*) FROM audit_logs`).Scan(&masterAuditCount)
	fmt.Printf("  - %-24s %6d rows\n", "master_audit_logs:", masterAuditCount)
	fmt.Printf("- TOTAL SEEDED TENANT RECORDS (pre-stress-test): %d rows\n\n", totalRows)

	fmt.Println("### Multi-Year Distribution (`sales_invoices`: 2023–2027)")
	yrRows, err := tenantPool.Query(ctx, `
		SELECT EXTRACT(YEAR FROM created_at)::int AS yr,
		       COUNT(*) AS total_cnt,
		       COUNT(*) FILTER (WHERE status = 'PAID') AS paid_cnt,
		       COUNT(*) FILTER (WHERE status = 'VOIDED') AS voided_cnt,
		       COUNT(*) FILTER (WHERE status = 'REFUNDED') AS refunded_cnt,
		       COALESCE(SUM(grand_total) FILTER (WHERE status = 'PAID'), 0)::text AS revenue_lkr
		FROM sales_invoices
		GROUP BY yr
		ORDER BY yr`)
	if err != nil {
		log.Fatalf("yearly invoice distribution: %v", err)
	}
	for yrRows.Next() {
		var yr, tot, comp, voided, ref int
		var rev string
		if err := yrRows.Scan(&yr, &tot, &comp, &voided, &ref, &rev); err != nil {
			log.Fatalf("scan yr: %v", err)
		}
		fmt.Printf("  - Year %d: total=%d (PAID=%d, VOIDED=%d, REFUNDED=%d), revenue=LKR %s\n", yr, tot, comp, voided, ref, rev)
	}
	yrRows.Close()

	var poHistoric, poFuture int
	_ = tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_orders WHERE expected_date < '2027-01-01'`).Scan(&poHistoric)
	_ = tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM purchase_orders WHERE expected_date >= '2027-01-01'`).Scan(&poFuture)
	fmt.Printf("- Purchase Orders: 2023-2026=%d, 2027 future scheduled=%d\n", poHistoric, poFuture)

	var unbalancedCount int
	var sumDebit, sumCredit string
	if err := tenantPool.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING SUM(debit) <> SUM(credit)
		) u`).Scan(&unbalancedCount); err != nil {
		log.Fatalf("check unbalanced gl: %v", err)
	}
	if err := tenantPool.QueryRow(ctx, `SELECT COALESCE(SUM(debit),0)::text, COALESCE(SUM(credit),0)::text FROM journal_lines`).Scan(&sumDebit, &sumCredit); err != nil {
		log.Fatalf("sum gl: %v", err)
	}
	var badBatchCount int
	if err := tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM inventory_batches WHERE remaining_qty < 0 OR remaining_qty > initial_qty`).Scan(&badBatchCount); err != nil {
		log.Fatalf("bad batch check: %v", err)
	}
	fmt.Printf("- Double-Entry Unbalanced Journals: %d | Total DR=LKR %s | Total CR=LKR %s\n", unbalancedCount, sumDebit, sumCredit)
	fmt.Printf("- FIFO Batch Integrity Violations (`remaining_qty < 0 or > initial_qty`): %d\n\n", badBatchCount)
	if unbalancedCount != 0 || sumDebit != sumCredit || badBatchCount != 0 {
		log.Fatalf("accounting/inventory invariant check failed")
	}

	// -------------------------------------------------------------------------
	// 2. POSTGRESQL EXPLAIN ANALYZE QUERY PLANS
	// -------------------------------------------------------------------------
	fmt.Println("## 2. PostgreSQL EXPLAIN (ANALYZE, BUFFERS) Query Performance")
	var bizUUID, sampleProdUUID uuid.UUID
	if err := tenantPool.QueryRow(ctx, `SELECT id FROM businesses LIMIT 1`).Scan(&bizUUID); err != nil {
		log.Fatalf("get business id: %v", err)
	}
	if err := tenantPool.QueryRow(ctx, `SELECT product_id FROM inventory_batches WHERE business_id = $1 AND remaining_qty > 0 LIMIT 1`, bizUUID).Scan(&sampleProdUUID); err != nil {
		log.Fatalf("get sample product id: %v", err)
	}

	plans := []struct {
		Title string
		SQL   string
		Args  []any
	}{
		{
			Title: "Q1 Overview Sales Aggregation (2023-2027 Paid Invoices)",
			SQL:   `SELECT COUNT(*), COALESCE(SUM(grand_total),0), COALESCE(SUM(tax_total),0) FROM sales_invoices WHERE business_id = $1 AND status = 'PAID' AND created_at >= '2023-01-01'`,
			Args:  []any{bizUUID},
		},
		{
			Title: "Q2 FIFO Active Batch Lookup (Product Stock Depletion Order)",
			SQL:   `SELECT id, batch_number, remaining_qty, unit_cost FROM inventory_batches WHERE business_id = $1 AND product_id = $2 AND remaining_qty > 0 ORDER BY received_at ASC`,
			Args:  []any{bizUUID, sampleProdUUID},
		},
		{
			Title: "Q3 General Ledger Journal + Line Aggregation (Top 50 Recent Entries)",
			SQL:   `SELECT je.id, je.entry_number, je.entry_date, COALESCE(SUM(jl.debit),0) FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id = je.id WHERE je.business_id = $1 GROUP BY je.id ORDER BY je.entry_date DESC, je.created_at DESC LIMIT 50`,
			Args:  []any{bizUUID},
		},
		{
			Title: "Q4 Top 25 CRM Customers by Lifetime Spend",
			SQL:   `SELECT c.id, c.name, COUNT(si.id), COALESCE(SUM(si.grand_total),0) FROM customers c LEFT JOIN sales_invoices si ON si.customer_id = c.id AND si.business_id = c.business_id WHERE c.business_id = $1 GROUP BY c.id ORDER BY COALESCE(SUM(si.grand_total),0) DESC LIMIT 25`,
			Args:  []any{bizUUID},
		},
	}
	for _, p := range plans {
		out, err := runExplain(ctx, tenantPool, p.Title, p.SQL, p.Args...)
		if err != nil {
			log.Fatalf("%v", err)
		}
		fmt.Printf("### %s\n```text\n%s\n```\n", p.Title, out)
	}
	fmt.Println()

	// -------------------------------------------------------------------------
	// 3. AUTHENTICATION & REDIS CACHE / API LATENCY BENCHMARKS
	// -------------------------------------------------------------------------
	fmt.Println("## 3. Authentication, Redis Settings Cache & HTTP API Latency")
	ownerLogin, ownerLoginMs, err := loginStaff(client, apiBase, "owner@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	managerLogin, _, err := loginStaff(client, apiBase, "manager@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	specialistLogin, _, err := loginStaff(client, apiBase, "specialist@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	cashierLogin, _, err := loginStaff(client, apiBase, "cashier@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	accountantLogin, _, err := loginStaff(client, apiBase, "accountant@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	adminToken, adminLoginMs, err := loginAdmin(client, apiBase, "admin@kovapos.com", "Kova@2026!")
	if err != nil {
		log.Fatalf("%v", err)
	}
	fmt.Printf("- `POST /api/v1/auth/login` (bcrypt verify + JWT + PG session): %.2f ms\n", ownerLoginMs)
	fmt.Printf("- `POST /api/v1/admin/login` (SuperAdmin JWT + PG session): %.2f ms\n", adminLoginMs)

	// Measure Cold vs Warm Settings Cache (flush settings keys first)
	if skeys, err := rdb.Keys(ctx, "settings:*").Result(); err == nil && len(skeys) > 0 {
		_ = rdb.Del(ctx, skeys...).Err()
	}
	coldCode, _, coldRaw, coldMs, err := httpJSON(client, http.MethodGet, apiBase+"/settings/resolved", ownerLogin.Token, "", nil)
	if err != nil || coldCode != 200 {
		log.Fatalf("cold settings fetch failed: code=%d err=%v body=%s", coldCode, err, string(coldRaw))
	}
	var warmSamples []float64
	warmErrs := 0
	for i := 0; i < 25; i++ {
		c, _, _, ms, e := httpJSON(client, http.MethodGet, apiBase+"/settings/resolved", ownerLogin.Token, "", nil)
		if e != nil || c != 200 {
			warmErrs++
		} else {
			warmSamples = append(warmSamples, ms)
		}
	}
	warmStats := computeStats("GET /api/v1/settings/resolved (Redis HIT)", warmSamples, warmErrs)
	fmt.Printf("- `GET /api/v1/settings/resolved` COLD (PostgreSQL 6-level resolve): %.2f ms\n", coldMs)
	fmt.Printf("- `GET /api/v1/settings/resolved` WARM (Redis Cache HIT, n=%d): avg=%.2f ms, p50=%.2f ms, p95=%.2f ms, max=%.2f ms (speedup: %.1fx)\n\n",
		warmStats.Runs, warmStats.AvgMs, warmStats.P50Ms, warmStats.P95Ms, warmStats.MaxMs, coldMs/warmStats.AvgMs)

	benchTargets := []struct {
		Name   string
		Path   string
		Tokens []string
		N      int
	}{
		{"GET /api/v1/health", "/health", []string{""}, 25},
		{"GET /api/v1/auth/discover", "/auth/discover?email=owner@kovamobile.lk", []string{""}, 20},
		{"GET /api/v1/pos/bootstrap", "/pos/bootstrap", []string{ownerLogin.Token, managerLogin.Token}, 20},
		{"GET /api/v1/brands", "/brands", []string{ownerLogin.Token, managerLogin.Token}, 20},
		{"GET /api/v1/inventory", "/inventory", []string{ownerLogin.Token, managerLogin.Token}, 20},
		{"GET /api/v1/customers", "/customers", []string{ownerLogin.Token, cashierLogin.Token}, 20},
		{"GET /api/v1/overview?period=1Y", "/overview?period=1Y", []string{ownerLogin.Token, accountantLogin.Token}, 16},
		{"GET /api/v1/reports/summary (2023-2027)", "/reports/summary?from=2023-01-01&to=2027-12-31", []string{ownerLogin.Token, accountantLogin.Token}, 16},
		{"GET /api/v1/accounting", "/accounting", []string{ownerLogin.Token, accountantLogin.Token}, 16},
	}

	fmt.Println("| Endpoint | Runs | Errors | Min (ms) | Avg (ms) | P50 (ms) | P95 (ms) | Max (ms) |")
	fmt.Println("| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
	for _, bt := range benchTargets {
		var samples []float64
		errs := 0
		for i := 0; i < bt.N; i++ {
			tok := bt.Tokens[i%len(bt.Tokens)]
			c, _, _, ms, e := httpJSON(client, http.MethodGet, apiBase+bt.Path, tok, "", nil)
			if e != nil || c != http.StatusOK {
				errs++
			} else {
				samples = append(samples, ms)
			}
		}
		st := computeStats(bt.Name, samples, errs)
		fmt.Printf("| `%s` | %d | %d | %.2f | %.2f | %.2f | %.2f | %.2f |\n",
			st.Endpoint, st.Runs, st.Errors, st.MinMs, st.AvgMs, st.P50Ms, st.P95Ms, st.MaxMs)
	}
	fmt.Println()

	// -------------------------------------------------------------------------
	// 4. MULTI-THREADING & CONCURRENCY STRESS TESTS
	// -------------------------------------------------------------------------
	fmt.Println("## 4. Multi-Threading & Concurrency Stress Tests")

	// Clear rate limit keys cleanly before burst stress
	if keys, err := rdb.Keys(ctx, "rl:*").Result(); err == nil && len(keys) > 0 {
		_ = rdb.Del(ctx, keys...).Err()
	}

	// Pick a non-serialized high-stock product in managerLogin's assigned branch
	mgrBranchID, err := uuid.Parse(managerLogin.Context.BranchID)
	if err != nil {
		log.Fatalf("parse manager branch id: %v", err)
	}
	var stressProdID uuid.UUID
	var stressProdSKU string
	var beforeStock float64
	if err := tenantPool.QueryRow(ctx, `
		SELECT p.id, p.sku, COALESCE(SUM(ib.remaining_qty), 0)::double precision AS total_rem
		FROM products p
		JOIN inventory_batches ib ON ib.product_id = p.id
		WHERE p.business_id = $1
		  AND ib.branch_id = $2
		  AND COALESCE(p.enable_serial_tracking, false) = false
		GROUP BY p.id, p.sku
		HAVING COALESCE(SUM(ib.remaining_qty), 0) >= 35
		ORDER BY total_rem DESC
		LIMIT 1`, bizUUID, mgrBranchID).Scan(&stressProdID, &stressProdSKU, &beforeStock); err != nil {
		log.Fatalf("pick high-stock non-serialized sku: %v", err)
	}

	// Test A: 25 Concurrent Checkouts (Unique Idempotency Keys)
	const concurrentCheckouts = 25
	var okCheckouts, failCheckouts atomic.Int64
	var wg sync.WaitGroup
	checkoutSamples := make([]float64, concurrentCheckouts)
	tStartA := time.Now()
	for i := 0; i < concurrentCheckouts; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			idem := uuid.NewString()
			c, _, raw, ms, e := httpJSON(client, http.MethodPost, apiBase+"/pos/checkout", managerLogin.Token, idem, map[string]any{
				"payment_method":  "CASH",
				"tendered_amount": "1000000",
				"order_channel":   "COUNTER",
				"items": []map[string]any{
					{"product_id": stressProdID.String(), "qty": "1"},
				},
			})
			checkoutSamples[idx] = ms
			if e == nil && c == http.StatusCreated {
				okCheckouts.Add(1)
			} else {
				failCheckouts.Add(1)
				log.Printf("concurrent checkout[%d] unexpected status=%d err=%v body=%s", idx, c, e, string(raw))
			}
		}(i)
	}
	wg.Wait()
	elapsedA := time.Since(tStartA)

	var afterStock float64
	if err := tenantPool.QueryRow(ctx, `
		SELECT COALESCE(SUM(remaining_qty), 0)::double precision
		FROM inventory_batches
		WHERE business_id = $1 AND branch_id = $2 AND product_id = $3`, bizUUID, mgrBranchID, stressProdID).Scan(&afterStock); err != nil {
		log.Fatalf("read afterStock: %v", err)
	}
	stA := computeStats("25 Concurrent POS Checkouts", checkoutSamples, int(failCheckouts.Load()))
	fmt.Printf("### Test A: 25 Concurrent Checkouts on Shared SKU (`%s`)\n", stressProdSKU)
	fmt.Printf("- Results: %d/%d HTTP 201 Created in %.1f ms (throughput: %.1f tx/sec)\n",
		okCheckouts.Load(), concurrentCheckouts, float64(elapsedA.Microseconds())/1000.0, float64(okCheckouts.Load())/elapsedA.Seconds())
	fmt.Printf("- Latency: avg=%.2f ms, p50=%.2f ms, p95=%.2f ms, max=%.2f ms\n", stA.AvgMs, stA.P50Ms, stA.P95Ms, stA.MaxMs)
	fmt.Printf("- FIFO Batch Stock Conservation (`branch=%s`): before=%.0f, after=%.0f, expected=%.0f\n",
		mgrBranchID.String()[:8], beforeStock, afterStock, beforeStock-float64(okCheckouts.Load()))
	if okCheckouts.Load() != concurrentCheckouts || int(beforeStock-afterStock) != concurrentCheckouts {
		log.Fatalf("Test A failed: ok=%d before=%.0f after=%.0f", okCheckouts.Load(), beforeStock, afterStock)
	}

	// Test B: 20-Goroutine Simultaneous Idempotency Key Replay Race
	specBranchID, err := uuid.Parse(specialistLogin.Context.BranchID)
	if err != nil {
		log.Fatalf("parse specialist branch id: %v", err)
	}
	var specProdID uuid.UUID
	if err := tenantPool.QueryRow(ctx, `
		SELECT p.id
		FROM products p
		JOIN inventory_batches ib ON ib.product_id = p.id
		WHERE p.business_id = $1
		  AND ib.branch_id = $2
		  AND COALESCE(p.enable_serial_tracking, false) = false
		GROUP BY p.id
		HAVING COALESCE(SUM(ib.remaining_qty), 0) >= 5
		ORDER BY COALESCE(SUM(ib.remaining_qty), 0) DESC
		LIMIT 1`, bizUUID, specBranchID).Scan(&specProdID); err != nil {
		log.Fatalf("pick specialist non-serialized sku: %v", err)
	}
	const replayThreads = 20
	sharedIdemKey := uuid.NewString()
	invoiceIDs := make([]string, replayThreads)
	var replayCodes [replayThreads]int
	var wgB sync.WaitGroup
	tStartB := time.Now()
	for i := 0; i < replayThreads; i++ {
		wgB.Add(1)
		go func(idx int) {
			defer wgB.Done()
			c, _, raw, _, e := httpJSON(client, http.MethodPost, apiBase+"/pos/checkout", specialistLogin.Token, sharedIdemKey, map[string]any{
				"payment_method":  "CARD",
				"tendered_amount": "1000000",
				"order_channel":   "COUNTER",
				"items": []map[string]any{
					{"product_id": specProdID.String(), "qty": "1"},
				},
			})
			replayCodes[idx] = c
			if e == nil && (c == http.StatusCreated || c == http.StatusOK) {
				var cr checkoutResp
				_ = json.Unmarshal(raw, &cr)
				invoiceIDs[idx] = cr.InvoiceID
			}
		}(i)
	}
	wgB.Wait()
	elapsedB := time.Since(tStartB)

	var replayDBCount int
	if err := tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM sales_invoices WHERE idempotency_key = $1`, sharedIdemKey).Scan(&replayDBCount); err != nil {
		log.Fatalf("count idempotent invoice: %v", err)
	}
	uniqueInvMap := map[string]bool{}
	http2xx := 0
	httpConflictOrReplay := 0
	for i := 0; i < replayThreads; i++ {
		if replayCodes[i] == http.StatusCreated || replayCodes[i] == http.StatusOK {
			http2xx++
			if invoiceIDs[i] != "" {
				uniqueInvMap[invoiceIDs[i]] = true
			}
		} else if replayCodes[i] == http.StatusConflict {
			httpConflictOrReplay++
		}
	}
	fmt.Printf("\n### Test B: %d-Goroutine Concurrent Idempotency Replay Race (`key=%s`)\n", replayThreads, sharedIdemKey[:8])
	fmt.Printf("- Elapsed: %.1f ms | HTTP 200/201 replies=%d, HTTP 409/in-flight=%d | Unique invoice IDs returned=%d\n",
		float64(elapsedB.Microseconds())/1000.0, http2xx, httpConflictOrReplay, len(uniqueInvMap))
	fmt.Printf("- PostgreSQL `sales_invoices` rows committed for identical idempotency key: **%d** (Expected: 1)\n", replayDBCount)
	if replayDBCount != 1 {
		log.Fatalf("idempotency race failed: created %d rows", replayDBCount)
	}

	// Test C: Multi-User Parallel Read & Analytics Storm (100 concurrent calls across 5 staff tokens)
	type stormTask struct {
		Tok  string
		Path string
	}
	var stormTasks []stormTask
	rolePools := []struct {
		Tok   string
		Paths []string
	}{
		{ownerLogin.Token, []string{"/pos/bootstrap", "/inventory", "/brands", "/overview?period=1M"}},
		{managerLogin.Token, []string{"/pos/bootstrap", "/inventory", "/customers", "/brands"}},
		{specialistLogin.Token, []string{"/pos/bootstrap", "/inventory", "/reports/summary?from=2025-01-01&to=2027-12-31", "/brands"}},
		{cashierLogin.Token, []string{"/pos/bootstrap", "/customers", "/brands", "/pos/held-bills"}},
		{accountantLogin.Token, []string{"/accounting", "/overview?period=1Y", "/reports/summary?from=2023-01-01&to=2027-12-31", "/settings/resolved"}},
	}
	for round := 0; round < 5; round++ {
		for _, rp := range rolePools {
			for _, p := range rp.Paths {
				stormTasks = append(stormTasks, stormTask{Tok: rp.Tok, Path: p})
			}
		}
	}
	// Clear rate limit keys right before read storm so each user has fresh 240/45 RPM window
	if keys, err := rdb.Keys(ctx, "rl:*").Result(); err == nil && len(keys) > 0 {
		_ = rdb.Del(ctx, keys...).Err()
	}
	var stormOK, stormErr atomic.Int64
	stormSamples := make([]float64, len(stormTasks))
	sem := make(chan struct{}, 25)
	var wgC sync.WaitGroup
	tStartC := time.Now()
	for i, task := range stormTasks {
		wgC.Add(1)
		go func(idx int, t stormTask) {
			defer wgC.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			c, _, _, ms, e := httpJSON(client, http.MethodGet, apiBase+t.Path, t.Tok, "", nil)
			stormSamples[idx] = ms
			if e == nil && c == http.StatusOK {
				stormOK.Add(1)
			} else {
				stormErr.Add(1)
				log.Printf("storm[%d] %s status=%d err=%v", idx, t.Path, c, e)
			}
		}(i, task)
	}
	wgC.Wait()
	elapsedC := time.Since(tStartC)
	stC := computeStats("100 Multi-User Concurrent Read Storm", stormSamples, int(stormErr.Load()))
	fmt.Printf("\n### Test C: %d Multi-User Parallel API Read & Analytics Storm (25 concurrent workers x 5 staff roles)\n", len(stormTasks))
	fmt.Printf("- Results: %d/%d HTTP 200 OK in %.1f ms (throughput: %.1f req/sec)\n",
		stormOK.Load(), len(stormTasks), float64(elapsedC.Microseconds())/1000.0, float64(stormOK.Load())/elapsedC.Seconds())
	fmt.Printf("- Latency: min=%.2f ms, avg=%.2f ms, p50=%.2f ms, p95=%.2f ms, max=%.2f ms\n\n",
		stC.MinMs, stC.AvgMs, stC.P50Ms, stC.P95Ms, stC.MaxMs)
	if stormErr.Load() != 0 {
		log.Fatalf("Test C had %d errors", stormErr.Load())
	}

	// Double-check GL balance AFTER stress checkouts too!
	if err := tenantPool.QueryRow(ctx, `
		SELECT COUNT(*) FROM (
			SELECT journal_entry_id FROM journal_lines GROUP BY journal_entry_id HAVING SUM(debit) <> SUM(credit)
		) u`).Scan(&unbalancedCount); err != nil || unbalancedCount != 0 {
		log.Fatalf("post-stress unbalanced GL journals=%d err=%v", unbalancedCount, err)
	}
	fmt.Printf("- Post-Stress Double-Entry GL Unbalanced Count: %d\n\n", unbalancedCount)

	// -------------------------------------------------------------------------
	// 5. SECURITY, RBAC, SQLi, PIN OVERRIDE, SESSION REVOCATION & DB TRIGGERS
	// -------------------------------------------------------------------------
	fmt.Println("## 5. Security, Access Control & Database Invariant Verification")

	type secResult struct {
		Check  string
		Status string
		Detail string
	}
	var secResults []secResult
	recordSec := func(name string, pass bool, detail string) {
		status := "FAIL"
		if pass {
			status = "PASS"
		}
		secResults = append(secResults, secResult{name, status, detail})
		if !pass {
			log.Fatalf("SECURITY CHECK FAILED [%s]: %s", name, detail)
		}
	}

	// 5.1 JWT Scope Isolation (Admin vs Tenant)
	cAdminToTenant, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/overview", adminToken, "", nil)
	cTenantToAdmin, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/admin/companies", ownerLogin.Token, "", nil)
	recordSec("JWT Boundary (Admin->Tenant & Tenant->Admin)",
		(cAdminToTenant == 401 || cAdminToTenant == 403) && (cTenantToAdmin == 401 || cTenantToAdmin == 403),
		fmt.Sprintf("admin_on_tenant=%d, owner_on_admin=%d", cAdminToTenant, cTenantToAdmin))

	// 5.2 JWT Signature Tamper Rejection
	tampered := tamperJWTPayload(ownerLogin.Token)
	cTamper, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/overview", tampered, "", nil)
	recordSec("JWT Signature Verification (Tampered Claim)", cTamper == 401, fmt.Sprintf("http_status=%d", cTamper))

	// 5.3 Unauthenticated Access Denial
	cNoAuth, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/inventory", "", "", nil)
	recordSec("Unauthenticated Endpoint Rejection", cNoAuth == 401, fmt.Sprintf("http_status=%d", cNoAuth))

	// 5.4 RBAC Privilege Escalation Block (Cashier token)
	c1, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/accounting", cashierLogin.Token, "", nil)
	c2, _, _, _, _ := httpJSON(client, http.MethodPost, apiBase+"/inventory/grns", cashierLogin.Token, "", map[string]any{})
	c3, _, _, _, _ := httpJSON(client, http.MethodPut, apiBase+"/settings/override", cashierLogin.Token, "", map[string]any{})
	c4, _, _, _, _ := httpJSON(client, http.MethodPost, apiBase+"/access/users", cashierLogin.Token, "", map[string]any{})
	recordSec("RBAC Least-Privilege Matrix (Cashier)", c1 == 403 && c2 == 403 && c3 == 403 && c4 == 403,
		fmt.Sprintf("accounting=%d, grn_create=%d, settings=%d, rbac_users=%d", c1, c2, c3, c4))

	// 5.5 SQL Injection Parameterization Resilience
	var custBefore, custAfter int
	_ = tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM customers`).Scan(&custBefore)
	sqli1 := url.QueryEscape("' OR '1'='1")
	sqli2 := url.QueryEscape("'; DROP TABLE customers;--")
	cSq1, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/customers?q="+sqli2, ownerLogin.Token, "", nil)
	cSq2, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/inventory?q="+sqli1, ownerLogin.Token, "", nil)
	cSq3, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/auth/discover?email="+sqli1, "", "", nil)
	_ = tenantPool.QueryRow(ctx, `SELECT COUNT(*) FROM customers`).Scan(&custAfter)
	recordSec("SQL Injection Resilience (sqlc / Parameterized pgx)", custBefore == custAfter && cSq1 < 500 && cSq2 < 500 && cSq3 < 500,
		fmt.Sprintf("customers_before=%d, customers_after=%d, statuses=%d/%d/%d", custBefore, custAfter, cSq1, cSq2, cSq3))

	// 5.6 Supervisor 6-Digit PIN Override (Deny wrong PIN -> Approve 123456)
	cBadPin, _, _, _, _ := httpJSON(client, http.MethodPost, apiBase+"/auth/verify-pin", cashierLogin.Token, "", map[string]string{
		"pin": "000000", "action": "VOID_INVOICE", "reason": "QA security negative test",
	})
	cGoodPin, _, rawGoodPin, _, _ := httpJSON(client, http.MethodPost, apiBase+"/auth/verify-pin", cashierLogin.Token, "", map[string]string{
		"pin": "123456", "action": "VOID_INVOICE", "reason": "QA security positive test",
	})
	var pinResp struct {
		OverrideToken string `json:"override_token"`
	}
	_ = json.Unmarshal(rawGoodPin, &pinResp)
	recordSec("Supervisor 6-Digit PIN Override", cBadPin == 401 && cGoodPin == 200 && pinResp.OverrideToken != "",
		fmt.Sprintf("wrong_pin=%d, valid_pin=%d, token_issued=%t", cBadPin, cGoodPin, pinResp.OverrideToken != ""))

	// 5.7 Session Revocation (Logout immediately invalidates live JWT in Redis/PG)
	tempSession, _, err := loginStaff(client, apiBase, "inventory@kovamobile.lk", "Kova@2026!")
	if err != nil {
		log.Fatalf("temp login for logout check: %v", err)
	}
	cBeforeLogout, _, _, _, _ := httpJSON(client, http.MethodGet, apiBase+"/inventory", tempSession.Token, "", nil)
	cLogout, _, _, _, _ := httpJSON(client, http.MethodPost, apiBase+"/auth/logout", tempSession.Token, "", nil)
	cAfterLogout, _, rawAfterLogout, _, _ := httpJSON(client, http.MethodGet, apiBase+"/inventory", tempSession.Token, "", nil)
	recordSec("Instant JWT Session Revocation (`POST /auth/logout`)", cBeforeLogout == 200 && cLogout == 200 && cAfterLogout == 401 && strings.Contains(string(rawAfterLogout), "SESSION_INVALID"),
		fmt.Sprintf("before=%d, logout=%d, after=%d (%s)", cBeforeLogout, cLogout, cAfterLogout, strings.TrimSpace(string(rawAfterLogout))))

	// 5.8 PostgreSQL Triggers (trg_verify_journal_balance, trg_prevent_locked_period_posting, trg_immutable_stock_ledger_entries)
	tx1, err := tenantPool.Begin(ctx)
	if err != nil {
		log.Fatalf("begin tx1: %v", err)
	}
	testJE := uuid.New()
	var openPeriodID, cashAcctID, salesAcctID uuid.UUID
	if err := tenantPool.QueryRow(ctx, `SELECT id FROM fiscal_periods WHERE business_id = $1 AND is_locked = FALSE LIMIT 1`, bizUUID).Scan(&openPeriodID); err != nil {
		log.Fatalf("find open period: %v", err)
	}
	if err := tenantPool.QueryRow(ctx, `SELECT id FROM chart_of_accounts WHERE business_id = $1 AND code = '1010'`, bizUUID).Scan(&cashAcctID); err != nil {
		log.Fatalf("find cash account: %v", err)
	}
	if err := tenantPool.QueryRow(ctx, `SELECT id FROM chart_of_accounts WHERE business_id = $1 AND code = '4000'`, bizUUID).Scan(&salesAcctID); err != nil {
		log.Fatalf("find sales account: %v", err)
	}
	_, err1 := tx1.Exec(ctx, `INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, entry_date) VALUES ($1,$2,$3,$4,'JE-TEST-UNBAL','SYSTEM',$1,'Unbalanced test', NOW()::DATE)`,
		testJE, bizUUID, mgrBranchID, openPeriodID)
	_, err2 := tx1.Exec(ctx, `INSERT INTO journal_lines (business_id, journal_entry_id, account_id, debit, credit, memo) VALUES ($1,$2,$3,1000.0000,0,'DR'), ($1,$2,$4,0,500.0000,'CR')`,
		bizUUID, testJE, cashAcctID, salesAcctID)
	commitErr := tx1.Commit(ctx)
	_ = tx1.Rollback(ctx)
	recordSec("DB Trigger `trg_verify_journal_balance`", err1 == nil && err2 == nil && commitErr != nil,
		fmt.Sprintf("commit_rejected=%v", commitErr))

	var lockedPeriodID uuid.UUID
	if err := tenantPool.QueryRow(ctx, `SELECT id FROM fiscal_periods WHERE business_id = $1 AND is_locked = TRUE ORDER BY start_date ASC LIMIT 1`, bizUUID).Scan(&lockedPeriodID); err != nil {
		log.Fatalf("find locked period: %v", err)
	}
	_, lockErr := tenantPool.Exec(ctx, `INSERT INTO journal_entries (id, business_id, branch_id, fiscal_period_id, entry_number, source_type, source_id, description, entry_date) VALUES ($1,$2,$3,$4,'JE-TEST-LOCKED','SYSTEM',$1,'Locked period test','2023-02-15'::DATE)`,
		uuid.New(), bizUUID, mgrBranchID, lockedPeriodID)
	recordSec("DB Trigger `trg_prevent_locked_period_posting` (`FY2023-Q1` LOCKED)", lockErr != nil, fmt.Sprintf("insert_rejected=%v", lockErr))

	var anyLedgerID uuid.UUID
	_ = tenantPool.QueryRow(ctx, `SELECT id FROM stock_ledger_entries LIMIT 1`).Scan(&anyLedgerID)
	_, updLedgerErr := tenantPool.Exec(ctx, `UPDATE stock_ledger_entries SET qty_delta = 999 WHERE id = $1`, anyLedgerID)
	recordSec("DB Trigger `trg_immutable_stock_ledger_entries`", updLedgerErr != nil, fmt.Sprintf("update_rejected=%v", updLedgerErr))

	// 5.9 Auth Brute-Force Rate Limiting (10/min policy on /auth/login) -> Run LAST then clean Redis rl keys!
	rate429Seen := false
	retryAfterHdr := ""
	attempts := 0
	for i := 0; i < 15; i++ {
		attempts++
		c, hdr, _, _, e := httpJSON(client, http.MethodPost, apiBase+"/auth/login", "", "", map[string]string{
			"email":    "ratelimit-probe@kovamobile.lk",
			"password": "WrongPassword!999",
		})
		if e == nil && c == http.StatusTooManyRequests {
			rate429Seen = true
			retryAfterHdr = hdr.Get("Retry-After")
			break
		}
	}
	// Clean rate limit keys immediately so developer/Playwright logins are unblocked
	if keys, err := rdb.Keys(ctx, "rl:*").Result(); err == nil && len(keys) > 0 {
		_ = rdb.Del(ctx, keys...).Err()
	}
	recordSec("Auth Brute-Force Rate-Limit (`auth_login` 10 RPM -> 429)", rate429Seen && retryAfterHdr != "",
		fmt.Sprintf("triggered_on_attempt=%d, retry_after=%ss (Redis rl:* cleared post-probe)", attempts, retryAfterHdr))

	fmt.Println("| Security Control | Result | Empirical Evidence |")
	fmt.Println("| :--- | :---: | :--- |")
	for _, sr := range secResults {
		fmt.Printf("| %s | **%s** | `%s` |\n", sr.Check, sr.Status, sr.Detail)
	}
	fmt.Println("\nALL EMPIRICAL CHECKS PASSED.")
}

