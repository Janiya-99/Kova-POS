import { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

export type LiveConnectionStatus = 'live' | 'connecting' | 'reconnecting' | 'offline';

interface RealtimeState {
  wsStatus: LiveConnectionStatus;
  adminWsStatus: LiveConnectionStatus;
  lastSyncedAt: string | null;
  lastEventType: string | null;
  setWsStatus: (status: LiveConnectionStatus) => void;
  setAdminWsStatus: (status: LiveConnectionStatus) => void;
  recordSync: (eventType: string) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  wsStatus: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  adminWsStatus: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  lastSyncedAt: null,
  lastEventType: null,
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setAdminWsStatus: (adminWsStatus) => set({ adminWsStatus }),
  recordSync: (eventType) =>
    set({
      lastSyncedAt: new Date().toISOString(),
      lastEventType: eventType,
    }),
}));

const CHANNEL_NAME = 'kova_pos_realtime_sync';
let globalQueryClient: QueryClient | null = null;
let broadcastChannel: BroadcastChannel | null = null;
let broadcastBound = false;

export function registerRealtimeQueryClient(qc: QueryClient) {
  globalQueryClient = qc;
  if (broadcastBound || typeof BroadcastChannel === 'undefined') {
    return;
  }
  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (evt: MessageEvent<{ eventType?: string; payload?: unknown }>) => {
      if (!globalQueryClient || !evt.data?.eventType) return;
      invalidateQueriesForRealtimeEvent(globalQueryClient, evt.data.eventType, evt.data.payload, {
        broadcastLocal: false,
      });
    };
    broadcastBound = true;
  } catch {
    // Environments without BroadcastChannel simply rely on WebSocket + query refetch
  }
}

const EVENT_QUERY_KEY_MAP: Record<string, string[]> = {
  SALE_COMPLETED: [
    'overview',
    'pos-bootstrap',
    'inventory',
    'inventory-fifo',
    'reports',
    'reports-summary',
    'accounting',
    'customers',
    'notifications',
  ],
  INVOICE_UPDATED: [
    'overview',
    'pos-bootstrap',
    'inventory',
    'inventory-fifo',
    'reports',
    'reports-summary',
    'accounting',
    'customers',
    'notifications',
  ],
  HELD_BILL_SYNC: ['pos-bootstrap', 'overview'],
  CATALOG_UPDATED: [
    'products',
    'categories',
    'brands',
    'pos-bootstrap',
    'inventory',
    'inventory-fifo',
    'overview',
    'reports',
    'reports-summary',
    'notifications',
  ],
  CUSTOMER_UPDATED: ['customers', 'pos-bootstrap', 'overview', 'reports', 'reports-summary'],
  SUPPLIER_UPDATED: ['suppliers', 'inventory', 'inventory-fifo', 'reports', 'reports-summary'],
  INVENTORY_UPDATED: [
    'inventory',
    'inventory-fifo',
    'pos-bootstrap',
    'overview',
    'reports',
    'reports-summary',
    'accounting',
    'notifications',
  ],
  LOW_STOCK_ALERT: ['notifications', 'inventory', 'inventory-fifo', 'reports', 'reports-summary', 'pos-bootstrap'],
  NOTIFICATION_CREATED: ['notifications', 'inventory', 'reports', 'reports-summary'],
  NOTIFICATION_UPDATED: ['notifications'],
  ACCOUNTING_UPDATED: ['accounting', 'reports', 'reports-summary', 'overview'],
  TAX_UPDATED: [
    'tax-groups',
    'company-settings',
    'settings-resolved',
    'pos-bootstrap',
    'overview',
    'reports',
    'reports-summary',
  ],
  BRANCH_UPDATED: [
    'company-branches',
    'company-terminals',
    'access-users',
    'inventory',
    'inventory-fifo',
    'pos-bootstrap',
    'overview',
    'reports',
    'reports-summary',
  ],
  RBAC_UPDATED: [
    'access-users',
    'access-roles',
    'access-permissions',
    'access-departments',
    'access-designations',
    'security-overview',
    'company-branches',
  ],
  SECURITY_UPDATED: ['security-overview'],
  SESSION_REVOKED: ['security-overview'],
  PRINT_TEMPLATE_UPDATED: ['print-templates'],
  SETTINGS_UPDATED: [
    'settings-resolved',
    'company-settings',
    'public-branding',
    'pos-bootstrap',
    'overview',
    'inventory',
    'inventory-fifo',
    'reports',
    'reports-summary',
    'accounting',
    'products',
    'categories',
    'brands',
    'customers',
    'suppliers',
    'tax-groups',
  ],
  ADMIN_SYNC: [
    'platform-admin-companies',
    'platform-admin-users',
    'platform-admin-logs',
    'platform-admin-security',
  ],
};

export function resolveEventFromApiPath(path: string): string | null {
  const clean = path.split('?')[0] || '';
  if (clean.startsWith('/api/v1/admin/') || clean.startsWith('/api/v1/platform/')) {
    if (clean.includes('/login') || clean.includes('/logout') || clean.includes('/refresh')) {
      return null;
    }
    return 'ADMIN_SYNC';
  }
  if (clean.startsWith('/api/v1/pos/held-bills')) return 'HELD_BILL_SYNC';
  if (clean.startsWith('/api/v1/pos/checkout') || clean.startsWith('/api/v1/pos/invoices')) {
    return 'SALE_COMPLETED';
  }
  if (
    clean.startsWith('/api/v1/products') ||
    clean.startsWith('/api/v1/categories') ||
    clean.startsWith('/api/v1/brands')
  ) {
    return 'CATALOG_UPDATED';
  }
  if (clean.startsWith('/api/v1/customers')) return 'CUSTOMER_UPDATED';
  if (clean.startsWith('/api/v1/suppliers')) return 'SUPPLIER_UPDATED';
  if (clean.startsWith('/api/v1/inventory') || clean.startsWith('/api/v1/procurement')) {
    return 'INVENTORY_UPDATED';
  }
  if (clean.startsWith('/api/v1/accounting')) return 'ACCOUNTING_UPDATED';
  if (clean.startsWith('/api/v1/tax-groups') || clean.startsWith('/api/v1/tax-rules')) {
    return 'TAX_UPDATED';
  }
  if (clean.startsWith('/api/v1/branches') || clean.startsWith('/api/v1/terminals')) {
    return 'BRANCH_UPDATED';
  }
  if (clean.startsWith('/api/v1/access')) return 'RBAC_UPDATED';
  if (clean.startsWith('/api/v1/security') || clean.startsWith('/api/v1/auth/sessions')) {
    return 'SECURITY_UPDATED';
  }
  if (clean.startsWith('/api/v1/notifications')) return 'NOTIFICATION_UPDATED';
  if (clean.startsWith('/api/v1/print-templates')) return 'PRINT_TEMPLATE_UPDATED';
  if (clean.startsWith('/api/v1/settings') || clean.startsWith('/api/v1/company/settings')) {
    return 'SETTINGS_UPDATED';
  }
  return null;
}

export function invalidateQueriesForRealtimeEvent(
  qc: QueryClient,
  eventType: string,
  payload?: unknown,
  options: { broadcastLocal?: boolean } = {}
) {
  const keys = EVENT_QUERY_KEY_MAP[eventType];
  if (!keys || keys.length === 0) return;

  useRealtimeStore.getState().recordSync(eventType);

  for (const key of keys) {
    void qc.invalidateQueries({
      queryKey: [key],
      refetchType: 'all',
    });
  }

  if (options.broadcastLocal && broadcastChannel) {
    try {
      broadcastChannel.postMessage({ eventType, payload });
    } catch {
      // Ignore closed channel errors
    }
  }
}

export function notifyLocalMutation(path: string) {
  if (!globalQueryClient) return;
  const eventType = resolveEventFromApiPath(path);
  if (!eventType) return;
  invalidateQueriesForRealtimeEvent(
    globalQueryClient,
    eventType,
    { source: 'local_mutation', path },
    { broadcastLocal: true }
  );
}

