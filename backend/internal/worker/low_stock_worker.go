package worker

import (
	"context"
	"encoding/json"
	"log"

	"github.com/enterprise-pos/backend/internal/infrastructure/ws"
	"github.com/enterprise-pos/backend/internal/usecase"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

const TaskCheckLowStock = "inventory:check_low_stock"

// TenantInventoryResolver resolves the dedicated database-per-company InventoryFIFOUsecase.
type TenantInventoryResolver interface {
	GetInventoryUsecase(ctx context.Context, businessID uuid.UUID) (*usecase.InventoryFIFOUsecase, error)
}

// LowStockPayload identifies the product and branch to check after a POS checkout.
type LowStockPayload struct {
	BusinessID uuid.UUID `json:"business_id"`
	BranchID   uuid.UUID `json:"branch_id"`
	ProductID  uuid.UUID `json:"product_id"`
}

// LowStockClient enqueues Asynq low-stock verification tasks.
type LowStockClient struct {
	client *asynq.Client
}

// NewLowStockClient creates a Redis-backed Asynq task client.
func NewLowStockClient(redisAddr string) *LowStockClient {
	return &LowStockClient{
		client: asynq.NewClient(asynq.RedisClientOpt{Addr: redisAddr}),
	}
}

// Close releases the underlying Asynq Redis connection.
func (c *LowStockClient) Close() error {
	if c.client != nil {
		return c.client.Close()
	}
	return nil
}

// EnqueueLowStockCheck schedules an asynchronous reorder check.
func (c *LowStockClient) EnqueueLowStockCheck(businessID, branchID, productID uuid.UUID) {
	if c.client == nil {
		return
	}
	raw, err := json.Marshal(LowStockPayload{
		BusinessID: businessID,
		BranchID:   branchID,
		ProductID:  productID,
	})
	if err != nil {
		return
	}
	_, err = c.client.Enqueue(asynq.NewTask(TaskCheckLowStock, raw))
	if err != nil {
		log.Printf("asynq enqueue warning: %v", err)
	}
}

// StartLowStockWorker runs the Asynq worker server resolving each task strictly into its company's DB pool.
func StartLowStockWorker(redisAddr string, resolver TenantInventoryResolver, hub *ws.Hub) *asynq.Server {
	srv := asynq.NewServer(
		asynq.RedisClientOpt{Addr: redisAddr},
		asynq.Config{Concurrency: 4},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc(TaskCheckLowStock, func(ctx context.Context, t *asynq.Task) error {
		var payload LowStockPayload
		if err := json.Unmarshal(t.Payload(), &payload); err != nil {
			return err
		}
		if resolver == nil {
			return nil
		}
		invUC, err := resolver.GetInventoryUsecase(ctx, payload.BusinessID)
		if err != nil {
			return err
		}
		poNumber, remQty, err := invUC.CheckAndDraftLowStockPO(ctx, payload.BusinessID, payload.BranchID, payload.ProductID)
		if err != nil {
			return err
		}
		if poNumber != "" {
			log.Printf("Asynq drafted low-stock Auto-PO %s (remaining=%s) for business=%s", poNumber, remQty.StringFixed(0), payload.BusinessID)
		}
		return nil
	})

	go func() {
		if err := srv.Run(mux); err != nil {
			log.Printf("asynq server stopped: %v", err)
		}
	}()

	return srv
}
