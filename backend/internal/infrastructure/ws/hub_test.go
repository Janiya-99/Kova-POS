package ws

import (
	"testing"

	"github.com/google/uuid"
)

func TestHubInitializationAndNilUnregisterSafe(t *testing.T) {
	hub := NewHub()
	bizID := uuid.New()

	// Empty broadcasts & unregisters should remain non-panicking no-ops
	hub.BroadcastTenant(bizID, "SALE_COMPLETED", map[string]any{"total": "10.00"})
	hub.BroadcastAdmin("ADMIN_SYNC", map[string]any{"action": "COMPANY_UPDATED"})
	hub.Unregister(bizID, nil)
	hub.UnregisterAdmin(nil)

	if len(hub.clients) != 0 || len(hub.adminClients) != 0 {
		t.Fatalf("expected empty hub client maps, got tenant=%d admin=%d", len(hub.clients), len(hub.adminClients))
	}
}

