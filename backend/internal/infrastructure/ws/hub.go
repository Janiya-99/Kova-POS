package ws

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
)

// Event represents a real-time WebSocket message pushed to connected tenant terminals.
type Event struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// Hub manages WebSocket connections grouped by business_id for strict tenant isolation.
type Hub struct {
	mu      sync.RWMutex
	clients map[uuid.UUID]map[*websocket.Conn]struct{}
}

// NewHub initializes a thread-safe tenant-scoped WebSocket hub.
func NewHub() *Hub {
	return &Hub{
		clients: make(map[uuid.UUID]map[*websocket.Conn]struct{}),
	}
}

// Register binds a WebSocket connection to a specific business_id.
func (h *Hub) Register(businessID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[businessID] == nil {
		h.clients[businessID] = make(map[*websocket.Conn]struct{})
	}
	h.clients[businessID][conn] = struct{}{}
}

// Unregister removes a closed WebSocket connection.
func (h *Hub) Unregister(businessID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if conns, ok := h.clients[businessID]; ok {
		delete(conns, conn)
		if len(conns) == 0 {
			delete(h.clients, businessID)
		}
	}
}

// BroadcastTenant sends a JSON event to every active connection belonging to businessID.
func (h *Hub) BroadcastTenant(businessID uuid.UUID, eventType string, payload any) {
	msgBytes, err := json.Marshal(Event{
		Type:    eventType,
		Payload: payload,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	conns := make([]*websocket.Conn, 0, len(h.clients[businessID]))
	for c := range h.clients[businessID] {
		conns = append(conns, c)
	}
	h.mu.RUnlock()

	for _, c := range conns {
		if err := c.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
			h.Unregister(businessID, c)
			_ = c.Close()
		}
	}
}

