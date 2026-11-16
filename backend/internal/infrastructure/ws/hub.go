package ws

import (
	"encoding/json"
	"sync"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
)

// Event represents a real-time WebSocket message pushed to connected tenant or admin terminals.
type Event struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type clientConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (c *clientConn) writeText(msg []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	return c.conn.WriteMessage(websocket.TextMessage, msg)
}

// Hub manages WebSocket connections grouped by business_id for strict tenant isolation,
// plus isolated Platform SuperAdmin control-plane sockets.
type Hub struct {
	mu           sync.RWMutex
	clients      map[uuid.UUID]map[*websocket.Conn]*clientConn
	adminClients map[*websocket.Conn]*clientConn
}

// NewHub initializes a thread-safe tenant and admin WebSocket hub.
func NewHub() *Hub {
	return &Hub{
		clients:      make(map[uuid.UUID]map[*websocket.Conn]*clientConn),
		adminClients: make(map[*websocket.Conn]*clientConn),
	}
}

// Register binds a WebSocket connection to a specific business_id.
func (h *Hub) Register(businessID uuid.UUID, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.clients[businessID] == nil {
		h.clients[businessID] = make(map[*websocket.Conn]*clientConn)
	}
	h.clients[businessID][conn] = &clientConn{conn: conn}
}

// Unregister removes a closed tenant WebSocket connection.
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

// RegisterAdmin binds an authenticated Platform SuperAdmin WebSocket connection.
func (h *Hub) RegisterAdmin(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.adminClients[conn] = &clientConn{conn: conn}
}

// UnregisterAdmin removes a closed Platform SuperAdmin WebSocket connection.
func (h *Hub) UnregisterAdmin(conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.adminClients, conn)
}

// WriteDirect writes an event directly to one tracked WebSocket connection safely with mutex synchronization.
func (h *Hub) WriteDirect(conn *websocket.Conn, businessID uuid.UUID, eventType string, payload any) error {
	msgBytes, err := json.Marshal(Event{
		Type:    eventType,
		Payload: payload,
	})
	if err != nil {
		return err
	}

	h.mu.RLock()
	var cc *clientConn
	if businessID != uuid.Nil {
		if conns := h.clients[businessID]; conns != nil {
			cc = conns[conn]
		}
	} else {
		cc = h.adminClients[conn]
	}
	h.mu.RUnlock()

	if cc == nil {
		return conn.WriteMessage(websocket.TextMessage, msgBytes)
	}
	return cc.writeText(msgBytes)
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
	conns := make([]*clientConn, 0, len(h.clients[businessID]))
	for _, cc := range h.clients[businessID] {
		conns = append(conns, cc)
	}
	h.mu.RUnlock()

	for _, cc := range conns {
		if err := cc.writeText(msgBytes); err != nil {
			h.Unregister(businessID, cc.conn)
			_ = cc.conn.Close()
		}
	}
}

// BroadcastAdmin sends a JSON event to every active Platform SuperAdmin connection.
func (h *Hub) BroadcastAdmin(eventType string, payload any) {
	msgBytes, err := json.Marshal(Event{
		Type:    eventType,
		Payload: payload,
	})
	if err != nil {
		return
	}

	h.mu.RLock()
	conns := make([]*clientConn, 0, len(h.adminClients))
	for _, cc := range h.adminClients {
		conns = append(conns, cc)
	}
	h.mu.RUnlock()

	for _, cc := range conns {
		if err := cc.writeText(msgBytes); err != nil {
			h.UnregisterAdmin(cc.conn)
			_ = cc.conn.Close()
		}
	}
}
