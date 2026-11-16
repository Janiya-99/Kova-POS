import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, LogOut, Radio } from 'lucide-react';
import { KovaMark } from '@/components/brand/KovaLogo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { invalidateQueriesForRealtimeEvent, useRealtimeStore } from '@/lib/realtime';
import { usePlatformAdminStore } from '@/store/platformAdminStore';
import { AdminLoginPage } from './AdminLoginPage';
import { AdminPortalPage } from './AdminPortalPage';

interface AdminPortalAppProps {
  onNavigatePath: (path: string) => void;
}

/**
 * Completely isolated Platform Admin Portal entrypoint (`/admin` and `/admin/login`).
 * Connects a real-time `/ws/admin` socket for live multi-tenant audit, company, and session telemetry.
 */
export function AdminPortalApp({ onNavigatePath }: AdminPortalAppProps) {
  const { token, admin, logout } = usePlatformAdminStore();
  const queryClient = useQueryClient();
  const { adminWsStatus, setAdminWsStatus, recordSync } = useRealtimeStore();

  React.useEffect(() => {
    if (token && admin) {
      document.title = 'Kova POS — Master Control Plane';
    }
  }, [token, admin]);

  React.useEffect(() => {
    if (!token) {
      setAdminWsStatus('offline');
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;
    let closedByCleanup = false;

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
        setAdminWsStatus('offline');
        return;
      }
      clearTimers();
      setAdminWsStatus(attempt > 0 ? 'reconnecting' : 'connecting');

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws/admin?token=${encodeURIComponent(token)}`);

      ws.onopen = () => {
        attempt = 0;
        setAdminWsStatus('live');
        recordSync('ADMIN_CONNECTED');
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
            setAdminWsStatus('live');
            recordSync(msg.type);
            return;
          }
          invalidateQueriesForRealtimeEvent(queryClient, msg.type, msg.payload);
        } catch {
          // Ignore malformed keepalive frames
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (closedByCleanup) return;
        attempt += 1;
        setAdminWsStatus('reconnecting');
        const delayMs = Math.min(15_000, 1000 * Math.pow(2, Math.min(attempt - 1, 4)));
        reconnectTimer = window.setTimeout(connect, delayMs);
      };
    };

    const handleVisibleOrOnline = () => {
      if (document.visibilityState === 'hidden') return;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        attempt = 0;
        connect();
      } else if (ws.readyState === WebSocket.OPEN) {
        void invalidateQueriesForRealtimeEvent(queryClient, 'ADMIN_SYNC');
      }
    };

    connect();
    window.addEventListener('online', handleVisibleOrOnline);
    document.addEventListener('visibilitychange', handleVisibleOrOnline);
    return () => {
      closedByCleanup = true;
      clearTimers();
      window.removeEventListener('online', handleVisibleOrOnline);
      document.removeEventListener('visibilitychange', handleVisibleOrOnline);
      ws?.close();
    };
  }, [token, queryClient, setAdminWsStatus, recordSync]);

  if (!token || !admin) {
    return <AdminLoginPage onNavigatePath={onNavigatePath} />;
  }

  const handleSignOut = () => {
    logout();
    onNavigatePath('/admin/login');
  };

  return (
    <div className="min-h-screen w-full bg-canvas text-ink" data-testid="admin-portal-shell">
      <header className="sticky top-0 z-30 border-b border-border-theme bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <KovaMark className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[14.5px] font-bold tracking-tight text-ink">
                  Kova POS Control Plane
                </h1>
                <Badge variant="lavender" className="hidden sm:inline-flex text-[10px]">
                  Master DB Scope
                </Badge>
                <Badge
                  variant={adminWsStatus === 'live' ? 'positive' : 'outline'}
                  className="hidden sm:inline-flex items-center gap-1.5 text-[10px]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      adminWsStatus === 'live' ? 'bg-[#22C55E] animate-pulse' : 'bg-ink-muted'
                    }`}
                  />
                  <Radio className="h-2.5 w-2.5" />
                  <span>{adminWsStatus === 'live' ? 'Live Telemetry' : 'Syncing...'}</span>
                </Badge>
              </div>
              <p className="truncate text-[11px] text-ink-muted">
                Separate PostgreSQL Database Provisioning &amp; 1-to-1 Company Login Registry
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden md:flex items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/70 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              <div className="text-right">
                <p className="text-[11px] font-bold leading-none text-ink">{admin.full_name}</p>
                <p className="mt-0.5 text-[10px] leading-none text-ink-muted">{admin.email}</p>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onNavigatePath('/login')}
              data-testid="admin-header-company-directory-btn"
            >
              <Building2 className="h-3.5 w-3.5" />
              Company Portals
            </Button>

            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handleSignOut}
              data-testid="admin-header-signout-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <AdminPortalPage />
      </main>
    </div>
  );
}
