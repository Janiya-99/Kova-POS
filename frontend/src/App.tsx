import * as React from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/AppShell';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import type { NotificationAlert } from '@/components/layout/TopHeader';
import { LoginPage } from '@/features/auth/LoginPage';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { POSTerminalPage } from '@/features/pos/POSTerminalPage';
import { ProductsPage } from '@/features/catalog/ProductsPage';
import { CategoriesPage } from '@/features/catalog/CategoriesPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { SuppliersPage } from '@/features/suppliers/SuppliersPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { GeneralLedgerPage } from '@/features/accounting/GeneralLedgerPage';
import { PrintStudioPage } from '@/features/print-studio/PrintStudioPage';
import { SettingsInheritancePage } from '@/features/settings/SettingsInheritancePage';
import { AdminPortalApp } from '@/features/admin/AdminPortalApp';
import { dexieDB, flushSyncOutbox } from '@/lib/dexie-db';
import { invalidateQueriesForRealtimeEvent, useRealtimeStore } from '@/lib/realtime';
import { syncPrintTemplatesCache } from '@/features/print-studio/engine/offlinePrintCache';
import type { PrintTemplateRecord } from '@/features/print-studio/types';
import { apiFetch } from '@/lib/api';
import {
  getActiveCompanySlug,
  getCompanyLoginPath,
  getDisplayTradeName,
  normalizeCompanySlug,
  useAuthStore,
} from '@/store/authStore';
import { normalizeLanguage, useI18nStore, useT } from '@/store/i18nStore';
import { usePOSStore } from '@/store/posStore';
import { toast } from 'sonner';

interface ApiNotificationRow {
  id: string;
  business_id: string;
  branch_id?: string | null;
  category: string;
  severity: string;
  title: string;
  body: string;
  reference_type?: string;
  reference_id?: string | null;
  is_read: boolean;
  created_at: string;
}

interface NotificationsPayload {
  items: ApiNotificationRow[];
  unread_count: number;
}

const VALID_ROUTES: AppRoute[] = [
  '/overview',
  '/pos',
  '/products',
  '/categories',
  '/customers',
  '/suppliers',
  '/inventory',
  '/reports',
  '/accounting',
  '/print-studio',
  '/settings',
];

function normalizeRoute(path: string): AppRoute {
  const match = VALID_ROUTES.find((r) => path === r || path.startsWith(`${r}/`));
  return match || '/overview';
}

function parseCompanySlugFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/c\/([a-zA-Z0-9-]+)(?:\/login)?\/?$/i);
  return match ? normalizeCompanySlug(match[1]) : null;
}

const ROUTE_PERMISSION_MAP: Record<AppRoute, string> = {
  '/overview': 'analytics:view',
  '/pos': 'pos:view',
  '/products': 'catalog:view',
  '/categories': 'catalog:view',
  '/customers': 'customers:view',
  '/suppliers': 'inventory:view',
  '/inventory': 'inventory:view',
  '/reports': 'analytics:view',
  '/accounting': 'accounting:view',
  '/print-studio': 'print:view',
  '/settings': 'settings:view',
};

function getDefaultPermittedRoute(hasPermission: (perm: string) => boolean): AppRoute {
  const orderedCandidates: AppRoute[] = [
    '/overview',
    '/pos',
    '/products',
    '/inventory',
    '/customers',
    '/accounting',
    '/settings',
    '/print-studio',
    '/reports',
    '/categories',
    '/suppliers',
  ];
  return (
    orderedCandidates.find((candidate) => hasPermission(ROUTE_PERMISSION_MAP[candidate])) ||
    '/pos'
  );
}

const ROUTE_META: Record<AppRoute, { title: string; subtitle: string }> = {
  '/overview': {
    title: 'Overview',
    subtitle: 'Executive analytics, live POS telemetry & double-entry revenue',
  },
  '/pos': {
    title: 'Edge POS Terminal',
    subtitle: 'Barcode scan, multi-tier tax engine & offline IndexedDB sync',
  },
  '/products': {
    title: 'Products & Pricing',
    subtitle: 'Catalog SKUs, minimum stock reorder rules & auto-PO triggers',
  },
  '/categories': {
    title: 'Product Categories',
    subtitle: 'Menu taxonomy, merchandising segments & category inheritance',
  },
  '/customers': {
    title: 'Customers & CRM',
    subtitle: 'Loyalty tiers, credit limits & lifetime purchase ledgers',
  },
  '/suppliers': {
    title: 'Suppliers & Vendors',
    subtitle: 'Vendor profiles, payment terms, VAT IDs & procurement links',
  },
  '/inventory': {
    title: 'Inventory & GRN',
    subtitle: 'FIFO batch cost layers, supplier intake & stock receipts',
  },
  '/reports': {
    title: 'Reports & Procurement',
    subtitle: 'Sales summaries, auto-drafted POs, vendor invoices & FIFO valuation',
  },
  '/accounting': {
    title: 'General Ledger',
    subtitle: 'Immutable balanced journals, COA & fiscal period locks',
  },
  '/print-studio': {
    title: 'Receipt & Invoice Studio',
    subtitle: 'Canva-style template designer, A4 vector PDF & WebUSB thermal print hardware',
  },
  '/settings': {
    title: 'Settings & RBAC',
    subtitle: '6-level scope inheritance hierarchy, appearance & admin access',
  },
};

function mapNotificationKind(category: string): NotificationAlert['kind'] {
  const cat = (category || '').toUpperCase();
  if (cat.includes('INVOICE')) return 'invoice';
  if (cat.includes('STOCK') || cat.includes('PO')) return 'stock';
  if (cat.includes('SETTING')) return 'settings';
  return 'sync';
}

function mapNotificationRoute(category: string): AppRoute {
  const cat = (category || '').toUpperCase();
  if (cat.includes('PO') || cat.includes('INVOICE')) return '/reports';
  if (cat.includes('STOCK')) return '/inventory';
  if (cat.includes('SETTING')) return '/settings';
  return '/reports';
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'Just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface TenantWorkspaceAppProps {
  pathname: string;
  onNavigatePath: (path: string) => void;
  onReplacePath: (path: string) => void;
}

function TenantWorkspaceApp({
  pathname,
  onNavigatePath,
  onReplacePath,
}: TenantWorkspaceAppProps) {
  const queryClient = useQueryClient();
  const { token, context, publicBranding, hasPermission, updateBusinessContext, setResolvedSettings } =
    useAuthStore();
  const { setPendingOutboxCount } = usePOSStore();
  const { t, language } = useT();

  const [route, setRoute] = React.useState<AppRoute>(() => normalizeRoute(pathname));
  const [visitedRoutes, setVisitedRoutes] = React.useState<AppRoute[]>(() => [
    normalizeRoute(pathname),
  ]);
  const [localAlerts, setLocalAlerts] = React.useState<NotificationAlert[]>([]);

  React.useEffect(() => {
    const next = normalizeRoute(pathname);
    setRoute(next);
    setVisitedRoutes((prev) => (prev.includes(next) ? prev : [...prev, next]));
  }, [pathname]);

  const navigate = React.useCallback(
    (nextRoute: AppRoute) => {
      setRoute(nextRoute);
      setVisitedRoutes((prev) => (prev.includes(nextRoute) ? prev : [...prev, nextRoute]));
      onNavigatePath(nextRoute);
    },
    [onNavigatePath]
  );

  React.useEffect(() => {
    setVisitedRoutes([route]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context?.business_id]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < VALID_ROUTES.length) {
        e.preventDefault();
        navigate(VALID_ROUTES[idx]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [navigate]);

  // Poll/sync Dexie outbox count & replay pending offline checkouts on reconnect
  React.useEffect(() => {
    if (!token) return;

    const refreshAndFlush = async () => {
      const pendingBefore = await dexieDB.sync_outbox
        .where('status')
        .equals('PENDING')
        .count();
      setPendingOutboxCount(pendingBefore);
      if (pendingBefore > 0 && navigator.onLine) {
        const synced = await flushSyncOutbox(token, (n) => {
          toast.success(`Synced ${n} queued offline checkout(s) to ledger`);
          setLocalAlerts((prev) => [
            {
              id: `sync-${Date.now()}`,
              title: 'Offline Outbox Synced',
              body: `${n} offline invoice(s) posted cleanly to PostgreSQL.`,
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              kind: 'sync',
              route: '/reports',
            },
            ...prev.slice(0, 7),
          ]);
          invalidateQueriesForRealtimeEvent(queryClient, 'SALE_COMPLETED', { source: 'outbox_flush' });
        });
        if (synced > 0) {
          const remaining = await dexieDB.sync_outbox
            .where('status')
            .equals('PENDING')
            .count();
          setPendingOutboxCount(remaining);
        }
      }
    };

    refreshAndFlush();
    window.addEventListener('online', refreshAndFlush);
    return () => window.removeEventListener('online', refreshAndFlush);
  }, [token, queryClient, setPendingOutboxCount]);

  // Periodic silent session refresh while online and active
  React.useEffect(() => {
    if (!token) return;
    const interval = window.setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const res = await apiFetch<any>('/api/v1/auth/refresh', { method: 'POST' });
        if (res?.token && res?.context) {
          useAuthStore.getState().setSession(res);
        }
      } catch {
        // 401 is handled by apiFetch; transient offline/429 ignores silently until next cycle
      }
    }, 15 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [token]);

  // Real-time WebSocket tenant updates with keepalive, exponential reconnect & zero-refresh live cache sync
  React.useEffect(() => {
    if (!token) {
      useRealtimeStore.getState().setWsStatus('offline');
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;
    let closedByCleanup = false;
    const { setWsStatus, recordSync } = useRealtimeStore.getState();

    const clearTimers = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const connect = () => {
      if (closedByCleanup) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setWsStatus('offline');
        return;
      }
      clearTimers();
      setWsStatus(attempt > 0 ? 'reconnecting' : 'connecting');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        attempt = 0;
        setWsStatus('live');
        recordSync('CONNECTED');
        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20_000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (!msg?.type) return;

          if (msg.type === 'PING' || msg.type === 'PONG' || msg.type === 'CONNECTED') {
            setWsStatus('live');
            recordSync(msg.type);
            return;
          }

          invalidateQueriesForRealtimeEvent(queryClient, msg.type, msg.payload);

          if (msg.type === 'SETTINGS_UPDATED') {
            if (msg.payload?.resolved_map && typeof msg.payload.resolved_map === 'object') {
              setResolvedSettings(msg.payload.resolved_map as Record<string, string>);
            }
            if (msg.payload?.profile && typeof msg.payload.profile === 'object') {
              const p = msg.payload.profile as Record<string, string | undefined>;
              updateBusinessContext(
                {
                  ...(p.business_name ? { business_name: p.business_name } : {}),
                  ...(p.trade_name !== undefined ? { trade_name: p.trade_name } : {}),
                  ...(p.tax_registration_no !== undefined
                    ? { tax_registration_no: p.tax_registration_no }
                    : {}),
                  ...(p.base_currency ? { base_currency: p.base_currency } : {}),
                  ...(p.primary_color_hex ? { primary_color_hex: p.primary_color_hex } : {}),
                  ...(p.default_language ? { default_language: p.default_language } : {}),
                  ...(p.logo_light_url !== undefined
                    ? { logo_light_url: p.logo_light_url, logo_sidebar_url: p.logo_light_url }
                    : {}),
                  ...(p.logo_dark_url !== undefined ? { logo_dark_url: p.logo_dark_url } : {}),
                  ...(p.logo_receipt_url !== undefined
                    ? { logo_receipt_url: p.logo_receipt_url }
                    : {}),
                  ...(p.industry_profile ? { industry_profile: p.industry_profile } : {}),
                },
                { forceLanguage: Boolean(p.default_language) }
              );
              if (p.default_language) {
                useI18nStore.getState().resetToTenantDefault(p.default_language);
              }
            }

            if (
              typeof msg.payload?.industry_profile === 'string' &&
              msg.payload.industry_profile
            ) {
              updateBusinessContext({ industry_profile: msg.payload.industry_profile });
            }

            if (msg.payload?.setting_key === 'accounting.base_currency' && typeof msg.payload?.value_json === 'string') {
              const code = msg.payload.value_json.replace(/^"|"$/g, '').trim().toUpperCase();
              if (code) updateBusinessContext({ base_currency: code });
            }
            if (msg.payload?.setting_key === 'system.default_language' && typeof msg.payload?.value_json === 'string') {
              const nextLang = normalizeLanguage(msg.payload.value_json);
              updateBusinessContext({ default_language: nextLang }, { forceLanguage: true });
              useI18nStore.getState().resetToTenantDefault(nextLang);
            }
            if (msg.payload?.setting_key) {
              toast.info(
                `Settings synced: ${msg.payload.setting_key} (${msg.payload.scope_level || 'SCOPE'})`
              );
            }
          } else if (msg.type === 'PRINT_TEMPLATE_UPDATED') {
            toast.info('Print Studio template synced across terminals');
          } else if (msg.type === 'SESSION_REVOKED') {
            const revokedSessionID = msg.payload?.session_id;
            const revokedUserID = msg.payload?.user_id;
            const authState = useAuthStore.getState();
            const currentSessionID = authState.context?.session_id;
            const currentUserID = authState.context?.user_id;
            const matchesThisSession =
              (revokedSessionID && currentSessionID && revokedSessionID === currentSessionID) ||
              (!currentSessionID && revokedUserID && revokedUserID === currentUserID);
            if (matchesThisSession) {
              toast.error('Your session was terminated on the server. Please sign in again.');
              authState.forceLocalLogout();
            }
          } else if (msg.type === 'LOW_STOCK_ALERT' && msg.payload?.po_number) {
            toast.warning(
              `Low Stock (${msg.payload.product_name || msg.payload.sku}): Auto-PO ${msg.payload.po_number} & Invoice ${msg.payload.invoice_number} created.`
            );
          }
        } catch {
          // Ignore malformed heartbeat frames
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (closedByCleanup) return;
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          setWsStatus('offline');
          return;
        }
        attempt += 1;
        setWsStatus('reconnecting');
        const delayMs = Math.min(15_000, 1000 * Math.pow(2, Math.min(attempt - 1, 4)));
        reconnectTimer = window.setTimeout(connect, delayMs);
      };
    };

    const handleOnlineOrVisible = () => {
      if (document.visibilityState === 'hidden') return;
      if (!navigator.onLine) {
        setWsStatus('offline');
        return;
      }
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        attempt = 0;
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        void queryClient.invalidateQueries({ refetchType: 'active' });
      }
    };

    connect();
    window.addEventListener('online', handleOnlineOrVisible);
    document.addEventListener('visibilitychange', handleOnlineOrVisible);

    return () => {
      closedByCleanup = true;
      clearTimers();
      window.removeEventListener('online', handleOnlineOrVisible);
      document.removeEventListener('visibilitychange', handleOnlineOrVisible);
      ws?.close();
    };
  }, [token, queryClient, updateBusinessContext, setResolvedSettings]);

  // Keep business currency, company branding, accent color, language, vertical & logos synchronized across all pages
  const canViewSettings = hasPermission('settings:view');
  const canViewPrint = hasPermission('print:view');
  const canViewAnalytics = hasPermission('analytics:view');

  React.useEffect(() => {
    if (!token || !context) return;
    const isRootOrPortalLogin =
      pathname === '/' || pathname === '' || Boolean(parseCompanySlugFromPath(pathname));
    const permitted = hasPermission(ROUTE_PERMISSION_MAP[route]);
    if (isRootOrPortalLogin || !permitted) {
      const target = getDefaultPermittedRoute(hasPermission);
      if (target !== route) {
        setRoute(target);
        setVisitedRoutes((prev) => (prev.includes(target) ? prev : [...prev, target]));
        onReplacePath(target);
      } else if (isRootOrPortalLogin) {
        onReplacePath(target);
      }
    }
  }, [token, context, route, pathname, hasPermission, onReplacePath]);

  const { data: syncedPrintTemplates } = useQuery({
    queryKey: ['print-templates', context?.business_id],
    queryFn: async () => {
      const res = await apiFetch<{ templates: PrintTemplateRecord[] }>('/api/v1/print-templates');
      return res.templates || [];
    },
    enabled: Boolean(token && context && canViewPrint),
  });

  React.useEffect(() => {
    if (context?.business_id && syncedPrintTemplates?.length) {
      void syncPrintTemplatesCache(context.business_id, syncedPrintTemplates);
    }
  }, [context?.business_id, syncedPrintTemplates]);
  const { data: syncedCompanyData } = useQuery({
    queryKey: ['company-settings', context?.business_id],
    queryFn: () =>
      apiFetch<{
        profile: {
          name?: string;
          trade_name?: string;
          base_currency?: string;
          tax_registration_no?: string;
          primary_color_hex?: string;
          default_language?: string;
          industry_profile?: string;
          logo_light_url?: string;
          logo_dark_url?: string;
          logo_sidebar_url?: string;
          logo_receipt_url?: string;
        };
      }>('/api/v1/company/settings'),
    enabled: Boolean(token && context && canViewSettings),
  });

  const { data: syncedResolvedData } = useQuery({
    queryKey: [
      'settings-resolved',
      context?.business_id,
      context?.branch_id || '',
      context?.terminal_id || '',
      '',
      '',
    ],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (context?.branch_id) qs.set('branch_id', context.branch_id);
      if (context?.terminal_id) qs.set('terminal_id', context.terminal_id);
      return apiFetch<{
        settings: Array<{ key: string; effective_json: string }>;
      }>(`/api/v1/settings/resolved?${qs.toString()}`);
    },
    enabled: Boolean(token && context && canViewSettings),
  });

  React.useEffect(() => {
    if (syncedResolvedData?.settings?.length) {
      setResolvedSettings(syncedResolvedData.settings);
    }
  }, [syncedResolvedData?.settings, setResolvedSettings]);

  React.useEffect(() => {
    const p = syncedCompanyData?.profile;
    if (!p || !context) return;
    const nextCurrency = p.base_currency || context.base_currency;
    const nextName = p.name || context.business_name;
    const nextTradeName = p.trade_name || p.name || context.trade_name || context.business_name;
    const nextTaxReg = p.tax_registration_no ?? context.tax_registration_no ?? '';
    const nextPrimaryHex = p.primary_color_hex || context.primary_color_hex || '#877FC1';
    const nextLang = p.default_language || context.default_language || 'en';
    const nextIndustry = p.industry_profile || context.industry_profile || 'retail';
    const nextLightLogo = p.logo_light_url ?? p.logo_sidebar_url ?? context.logo_light_url ?? context.logo_sidebar_url ?? '';
    const nextDarkLogo = p.logo_dark_url ?? context.logo_dark_url ?? '';
    const nextReceiptLogo = p.logo_receipt_url ?? context.logo_receipt_url ?? '';
    if (
      nextCurrency !== context.base_currency ||
      nextName !== context.business_name ||
      nextTradeName !== (context.trade_name || context.business_name) ||
      nextTaxReg !== (context.tax_registration_no ?? '') ||
      nextPrimaryHex !== (context.primary_color_hex || '#877FC1') ||
      nextLang !== (context.default_language || 'en') ||
      nextIndustry !== (context.industry_profile || 'retail') ||
      nextLightLogo !== (context.logo_light_url ?? context.logo_sidebar_url ?? '') ||
      nextDarkLogo !== (context.logo_dark_url ?? '') ||
      nextReceiptLogo !== (context.logo_receipt_url ?? '')
    ) {
      updateBusinessContext({
        base_currency: nextCurrency,
        business_name: nextName,
        trade_name: nextTradeName,
        tax_registration_no: nextTaxReg,
        primary_color_hex: nextPrimaryHex,
        default_language: nextLang,
        industry_profile: nextIndustry,
        logo_light_url: nextLightLogo,
        logo_dark_url: nextDarkLogo,
        logo_sidebar_url: nextLightLogo,
        logo_receipt_url: nextReceiptLogo,
      });
    }
  }, [syncedCompanyData?.profile, context, updateBusinessContext]);

  React.useEffect(() => {
    const tradeTitle = getDisplayTradeName(context, publicBranding);
    const routeTitle = t.routes[route]?.title || ROUTE_META[route].title;
    document.title = context ? `${tradeTitle} — ${routeTitle}` : tradeTitle;
  }, [context, publicBranding, route, language, t]);

  // Shared overview query (same key as OverviewPage to avoid duplicate fetches on tab change)
  const overviewBranchQuery = context?.branch_id
    ? `&branch_id=${encodeURIComponent(context.branch_id)}`
    : '';
  const { data: overviewData } = useQuery({
    queryKey: ['overview', context?.business_id, context?.branch_id || '', 'month'],
    queryFn: () =>
      apiFetch<{ kpi: { held_bill_count: number } }>(
        `/api/v1/overview?period=month${overviewBranchQuery}`
      ),
    enabled: Boolean(token && context && canViewAnalytics),
  });

  // Live persisted notifications feed
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', context?.business_id],
    queryFn: () => apiFetch<NotificationsPayload>('/api/v1/notifications'),
    enabled: Boolean(token && context),
  });

  const alerts = React.useMemo<NotificationAlert[]>(() => {
    const dbUnread = (notificationsData?.items || [])
      .filter((item) => !item.is_read)
      .map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        time: formatRelativeTime(item.created_at),
        kind: mapNotificationKind(item.category),
        isRead: item.is_read,
        route: mapNotificationRoute(item.category),
      }));
    return [...localAlerts, ...dbUnread];
  }, [notificationsData?.items, localAlerts]);

  const handleDismissAlert = React.useCallback(
    async (id: string) => {
      if (id.startsWith('sync-')) {
        setLocalAlerts((prev) => prev.filter((a) => a.id !== id));
        return;
      }
      queryClient.setQueryData<NotificationsPayload>(
        ['notifications', context?.business_id],
        (prev) => {
          if (!prev) return prev;
          const nextItems = prev.items.map((n) => (n.id === id ? { ...n, is_read: true } : n));
          return {
            items: nextItems,
            unread_count: nextItems.filter((n) => !n.is_read).length,
          };
        }
      );
      try {
        await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'POST' });
      } catch {
        // Optimistic dismissal kept cleanly; next sync reconciles
      }
    },
    [queryClient, context?.business_id]
  );

  const handleClearAllAlerts = React.useCallback(async () => {
    setLocalAlerts([]);
    queryClient.setQueryData<NotificationsPayload>(
      ['notifications', context?.business_id],
      (prev) => {
        if (!prev) return prev;
        return {
          items: prev.items.map((n) => ({ ...n, is_read: true })),
          unread_count: 0,
        };
      }
    );
    try {
      await apiFetch('/api/v1/notifications/read-all', { method: 'POST' });
    } catch {
      // Ignore transient offline error
    }
  }, [queryClient, context?.business_id]);

  if (route === '/pos') {
    const exitTarget = canViewAnalytics
      ? '/overview'
      : getDefaultPermittedRoute(hasPermission);
    return (
      <POSTerminalPage
        activeRoute={route}
        onNavigate={navigate}
        onExitPOS={() => navigate(exitTarget)}
      />
    );
  }

  const meta = t.routes[route] || ROUTE_META[route];

  return (
    <AppShell
      activeRoute={route}
      onNavigate={navigate}
      title={meta.title}
      subtitle={meta.subtitle}
      heldCount={overviewData?.kpi?.held_bill_count}
      alerts={alerts}
      onDismissAlert={handleDismissAlert}
      onClearAllAlerts={handleClearAllAlerts}
    >
      {route === '/overview' && canViewAnalytics && (
        <OverviewPage onOpenPOS={() => navigate('/pos')} onNavigate={navigate} />
      )}
      {visitedRoutes.includes('/products') && (
        <div className={route === '/products' ? 'block' : 'hidden'}>
          <ProductsPage />
        </div>
      )}
      {visitedRoutes.includes('/categories') && (
        <div className={route === '/categories' ? 'block' : 'hidden'}>
          <CategoriesPage />
        </div>
      )}
      {visitedRoutes.includes('/customers') && (
        <div className={route === '/customers' ? 'block' : 'hidden'}>
          <CustomersPage />
        </div>
      )}
      {visitedRoutes.includes('/suppliers') && (
        <div className={route === '/suppliers' ? 'block' : 'hidden'}>
          <SuppliersPage />
        </div>
      )}
      {visitedRoutes.includes('/inventory') && (
        <div className={route === '/inventory' ? 'block' : 'hidden'}>
          <InventoryPage />
        </div>
      )}
      {route === '/reports' && canViewAnalytics && <ReportsPage />}
      {visitedRoutes.includes('/accounting') && (
        <div className={route === '/accounting' ? 'block' : 'hidden'}>
          <GeneralLedgerPage />
        </div>
      )}
      {visitedRoutes.includes('/print-studio') && (
        <div className={route === '/print-studio' ? 'block' : 'hidden'}>
          <PrintStudioPage />
        </div>
      )}
      {visitedRoutes.includes('/settings') && (
        <div className={route === '/settings' ? 'block' : 'hidden'}>
          <SettingsInheritancePage />
        </div>
      )}
    </AppShell>
  );
}

export function App() {
  const { token, context, publicBranding } = useAuthStore();
  const [pathname, setPathname] = React.useState<string>(() => window.location.pathname || '/');

  const navigatePath = React.useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  const replacePath = React.useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  React.useEffect(() => {
    const onPop = () => {
      setPathname(window.location.pathname || '/');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const portalSlug = parseCompanySlugFromPath(pathname);
  const activeSlug = getActiveCompanySlug(context, publicBranding);

  React.useEffect(() => {
    if (isAdminRoute) return;
    if (!token || !context) {
      if (pathname !== '/' && pathname !== '/login' && !portalSlug) {
        const targetLogin = getCompanyLoginPath(activeSlug);
        replacePath(targetLogin);
      }
    }
  }, [isAdminRoute, token, context, pathname, portalSlug, activeSlug, replacePath]);

  if (isAdminRoute) {
    return <AdminPortalApp onNavigatePath={navigatePath} />;
  }

  if (!token || !context) {
    return <LoginPage companySlug={portalSlug} onNavigatePath={navigatePath} />;
  }

  if (pathname === '/login') {
    return <LoginPage companySlug={null} onNavigatePath={navigatePath} />;
  }

  if (
    portalSlug &&
    context.company_slug &&
    normalizeCompanySlug(context.company_slug) !== portalSlug
  ) {
    return <LoginPage companySlug={portalSlug} onNavigatePath={navigatePath} />;
  }

  return (
    <TenantWorkspaceApp
      pathname={pathname}
      onNavigatePath={navigatePath}
      onReplacePath={replacePath}
    />
  );
}

export default App;
