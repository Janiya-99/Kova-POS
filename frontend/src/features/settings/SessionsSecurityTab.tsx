import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Clock,
  Laptop,
  LogOut,
  MonitorSmartphone,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { confirmDestructiveAction } from '@/lib/swal';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export interface UserSessionItem {
  id: string;
  business_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  branch_id?: string;
  branch_name: string;
  terminal_id?: string;
  terminal_name: string;
  role_code: string;
  ip_address: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SessionPolicyDTO {
  ttl_hours: number;
  idle_timeout_minutes: number;
  max_concurrent: number;
  rate_limit_enabled: boolean;
  api_rpm: number;
  login_max_attempts: number;
  pin_max_attempts: number;
}

export interface RateLimitPolicyMetric {
  name: string;
  label: string;
  description: string;
  scope: string;
  limit: number;
  window_seconds: number;
  total_allowed: number;
  total_blocked: number;
  backend: string;
}

interface SecurityOverviewResponse {
  current_session_id: string;
  can_view_org: boolean;
  can_manage_org: boolean;
  policy: SessionPolicyDTO;
  my_sessions: UserSessionItem[];
  company_sessions: UserSessionItem[];
  rate_limits: RateLimitPolicyMetric[];
}

function fmtRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const absMins = Math.round(Math.abs(diffMs) / 60000);
  if (absMins < 1) return diffMs >= 0 ? 'Just now' : '< 1m';
  if (absMins < 60) return diffMs >= 0 ? `${absMins}m ago` : `in ${absMins}m`;
  const hrs = Math.round(absMins / 60);
  if (hrs < 48) return diffMs >= 0 ? `${hrs}h ago` : `in ${hrs}h`;
  return d.toLocaleDateString();
}

function fmtTimestamp(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RateLimitPolicyGrid({
  rateLimits,
}: {
  rateLimits: RateLimitPolicyMetric[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
      {rateLimits.map((rl) => (
        <div
          key={rl.name}
          className="h-full flex flex-col justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-3.5"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-ink">{rl.label}</h3>
                <p className="font-mono text-[10px] text-ink-muted">{rl.scope}</p>
              </div>
              <Badge variant={rl.total_blocked > 0 ? 'negative' : 'positive'}>
                {rl.limit} / {rl.window_seconds >= 60 ? `${Math.round(rl.window_seconds / 60)}m` : `${rl.window_seconds}s`}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-ink-muted leading-snug">
              {rl.description}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-border-theme/70 flex items-center justify-between text-[11px] tabular-nums">
            <span className="text-ink-muted">
              Allowed: <strong className="text-ink">{rl.total_allowed.toLocaleString()}</strong>
            </span>
            <span className={rl.total_blocked > 0 ? 'text-[#EF4444] font-semibold' : 'text-ink-muted'}>
              Blocked: {rl.total_blocked.toLocaleString()}
            </span>
            <Badge variant="outline" className="text-[9.5px] uppercase">
              {rl.backend}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export interface SessionsSecurityTabProps {
  onOpenSecuritySettings?: () => void;
}

export function SessionsSecurityTab({ onOpenSecuritySettings }: SessionsSecurityTabProps) {
  const { context, setSession } = useAuthStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState('');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [refreshingToken, setRefreshingToken] = React.useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['security-overview', context?.business_id, context?.session_id],
    queryFn: () => apiFetch<SecurityOverviewResponse>('/api/v1/security/overview'),
    enabled: Boolean(context?.business_id),
    refetchInterval: 30000,
  });

  const handleRefreshSessionToken = async () => {
    setRefreshingToken(true);
    try {
      const res = await apiFetch<any>('/api/v1/auth/refresh', { method: 'POST' });
      if (res?.token && res?.context) {
        setSession(res);
      }
      toast.success('Current session extended and token refreshed');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Unable to refresh session');
    } finally {
      setRefreshingToken(false);
    }
  };

  const handleRevokeMySession = async (sess: UserSessionItem) => {
    const ok = await confirmDestructiveAction({
      title: 'Terminate Device Session?',
      text: `Sign out ${sess.device_label || 'device'} (${sess.ip_address || 'unknown IP'}) immediately?`,
      confirmLabel: 'Terminate Session',
    });
    if (!ok) return;
    setBusyId(sess.id);
    try {
      await apiFetch(`/api/v1/auth/sessions/${sess.id}`, { method: 'DELETE' });
      toast.success('Session revoked');
      queryClient.invalidateQueries({ queryKey: ['security-overview'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke session');
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeOthers = async () => {
    const otherCount = (data?.my_sessions || []).filter((s) => !s.is_current).length;
    if (otherCount === 0) {
      toast.info('No other active sessions found for your account');
      return;
    }
    const ok = await confirmDestructiveAction({
      title: 'Sign Out All Other Devices?',
      text: `Terminate ${otherCount} other active session(s) while keeping this device signed in?`,
      confirmLabel: 'Sign Out Others',
    });
    if (!ok) return;
    setBusyId('revoke-others');
    try {
      const res = await apiFetch<{ revoked_count: number }>('/api/v1/auth/sessions/revoke-others', {
        method: 'POST',
      });
      toast.success(`Signed out ${res.revoked_count ?? otherCount} other session(s)`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to sign out other sessions');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdminRevokeSession = async (sess: UserSessionItem) => {
    const ok = await confirmDestructiveAction({
      title: 'Force-Terminate Staff Session?',
      text: `Immediately disconnect ${sess.user_name} (${sess.device_label} · ${sess.branch_name})?`,
      confirmLabel: 'Force Terminate',
    });
    if (!ok) return;
    setBusyId(sess.id);
    try {
      await apiFetch(`/api/v1/security/sessions/${sess.id}`, { method: 'DELETE' });
      toast.success(`Terminated ${sess.user_name}'s session`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to terminate session');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdminTerminateUser = async (userId: string, userName: string) => {
    const ok = await confirmDestructiveAction({
      title: `Sign Out ${userName} Everywhere?`,
      text: `Revoke every active session for ${userName} across all branches and terminals?`,
      confirmLabel: 'Terminate All Sessions',
    });
    if (!ok) return;
    setBusyId(`user-${userId}`);
    try {
      const res = await apiFetch<{ revoked_count: number }>(
        `/api/v1/security/sessions/revoke-user/${userId}`,
        { method: 'POST' }
      );
      toast.success(`Terminated ${res.revoked_count} active session(s) for ${userName}`);
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to terminate user sessions');
    } finally {
      setBusyId(null);
    }
  };

  const mySessions = data?.my_sessions || [];
  const companySessions = data?.company_sessions || [];
  const policy = data?.policy || {
    ttl_hours: 24,
    idle_timeout_minutes: 480,
    max_concurrent: 5,
    rate_limit_enabled: true,
    api_rpm: 240,
    login_max_attempts: 10,
    pin_max_attempts: 5,
  };
  const rateLimits = data?.rate_limits || [];

  const filteredOrgSessions = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companySessions;
    return companySessions.filter((s) =>
      [s.user_name, s.user_email, s.branch_name, s.terminal_name, s.device_label, s.ip_address, s.role_code]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [companySessions, search]);

  const totalBlocked = React.useMemo(
    () => rateLimits.reduce((acc, r) => acc + (r.total_blocked || 0), 0),
    [rateLimits]
  );

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-[104px] w-full" />
          ))}
        </div>
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="sessions-security-tab">
      {/* 4-Column Symmetrical Security KPI Bento Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">My Active Sessions</span>
            <MonitorSmartphone className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {mySessions.length}
            <span className="ml-1.5 text-xs font-semibold text-ink-muted">
              / {policy.max_concurrent > 0 ? policy.max_concurrent : '∞'}
            </span>
          </p>
          <p className="text-[11px] text-ink-muted">Concurrent sessions allowed per user</p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Session Lifetime &amp; Idle</span>
            <Clock className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {policy.ttl_hours}h
            <span className="ml-1.5 text-xs font-semibold text-ink-muted">
              · {policy.idle_timeout_minutes}m idle
            </span>
          </p>
          <p className="text-[11px] text-ink-muted">Inherited across Business / Branch / Terminal</p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">API Rate Protection</span>
            <ShieldCheck className="h-4 w-4 text-[#22C55E]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {policy.rate_limit_enabled ? `${policy.api_rpm}/min` : 'Paused'}
          </p>
          <p className="text-[11px] text-ink-muted">
            Login cap {policy.login_max_attempts}/min · PIN {policy.pin_max_attempts}/5m
          </p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">
              {data?.can_view_org ? 'Org Sessions & Blocks' : 'Current Session'}
            </span>
            <Activity className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {data?.can_view_org ? companySessions.length : 'Verified'}
            {data?.can_view_org && (
              <span className="ml-2 text-xs font-semibold text-[#EF4444]">
                ({totalBlocked} blocked)
              </span>
            )}
          </p>
          <p className="text-[11px] text-ink-muted">
            {data?.can_view_org
              ? 'Active logins across branches & POS registers'
              : 'Redis + PostgreSQL backed session token'}
          </p>
        </div>
      </div>

      {/* Personal Active Sessions Card */}
      <section className="zona-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
              <Laptop className="h-4 w-4 text-accent" />
              Your Active Sessions
            </h2>
            <p className="text-[11px] text-ink-muted">
              Every browser tab and POS terminal login holds a tracked session ID backed by Redis &amp; PostgreSQL.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh List
            </Button>
            <Button
              type="button"
              size="sm"
              variant="soft"
              onClick={handleRefreshSessionToken}
              disabled={refreshingToken}
              data-testid="refresh-current-session-btn"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {refreshingToken ? 'Extending...' : 'Extend This Session'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={handleRevokeOthers}
              disabled={busyId === 'revoke-others'}
              data-testid="revoke-other-sessions-btn"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out Other Devices
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[var(--theme-radius-inner)] border border-border-theme">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device &amp; Browser</TableHead>
                <TableHead>Branch / Terminal</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mySessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                    No active session records found. Sign out and sign in to establish a tracked session.
                  </TableCell>
                </TableRow>
              ) : (
                mySessions.map((sess) => (
                  <TableRow key={sess.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink">
                          {sess.device_label || 'Web Session'}
                        </span>
                        {sess.is_current && (
                          <Badge variant="positive">This Device</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-ink-muted">
                        Signed in {fmtTimestamp(sess.created_at)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-ink">{sess.branch_name}</p>
                      <p className="text-[10.5px] text-ink-muted">{sess.terminal_name}</p>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-ink-muted">
                      {sess.ip_address || '127.0.0.1'}
                    </TableCell>
                    <TableCell className="text-[11px] tabular-nums text-ink">
                      {fmtRelativeTime(sess.last_seen_at)}
                    </TableCell>
                    <TableCell className="text-[11px] tabular-nums text-ink-muted">
                      <div>{fmtTimestamp(sess.expires_at)}</div>
                      <div className="text-[10px]">Idle: {fmtTimestamp(sess.idle_expires_at)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      {sess.is_current ? (
                        <Badge variant="outline">Active Now</Badge>
                      ) : (
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          disabled={busyId === sess.id}
                          onClick={() => handleRevokeMySession(sess)}
                        >
                          <Trash2 className="h-3 w-3" />
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Organization-Wide Sessions & Multi-Tier Rate Limit Telemetry */}
      {data?.can_view_org && (
        <>
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
                  <Shield className="h-4 w-4 text-accent" />
                  Organization Active Sessions ({filteredOrgSessions.length})
                </h2>
                <p className="text-[11px] text-ink-muted">
                  Real-time session oversight across every branch and POS register in this tenant database.
                </p>
              </div>
              <div className="relative w-full sm:w-[270px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter staff, branch, IP, device..."
                  className="pl-8 h-9 text-xs"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-[var(--theme-radius-inner)] border border-border-theme">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staff Member</TableHead>
                    <TableHead>Role &amp; Branch</TableHead>
                    <TableHead>Device &amp; IP</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead className="text-right">Controls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrgSessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-ink-muted">
                        No active organization sessions match your filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrgSessions.map((sess) => (
                      <TableRow key={sess.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{sess.user_name}</span>
                            {sess.is_current && <Badge variant="positive">You</Badge>}
                          </div>
                          <p className="text-[10.5px] text-ink-muted">{sess.user_email}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="lavender">{formatDisplayLabel(sess.role_code)}</Badge>
                          <p className="mt-1 text-[10.5px] text-ink-muted">
                            {sess.branch_name} · {sess.terminal_name}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-ink">{sess.device_label}</p>
                          <p className="font-mono text-[10.5px] text-ink-muted">{sess.ip_address || '127.0.0.1'}</p>
                        </TableCell>
                        <TableCell className="text-[11px] tabular-nums text-ink-muted">
                          <div className="font-semibold text-ink">{fmtRelativeTime(sess.last_seen_at)}</div>
                          <div className="text-[10px]">Exp {fmtTimestamp(sess.expires_at)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {data.can_manage_org && !sess.is_current ? (
                            <div className="inline-flex items-center gap-1.5">
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={busyId === sess.id}
                                onClick={() => handleAdminRevokeSession(sess)}
                              >
                                Revoke
                              </Button>
                              <Button
                                type="button"
                                size="xs"
                                variant="destructive"
                                disabled={busyId === `user-${sess.user_id}`}
                                onClick={() => handleAdminTerminateUser(sess.user_id, sess.user_name)}
                              >
                                Kick All
                              </Button>
                            </div>
                          ) : (
                            <Badge variant="outline">{sess.is_current ? 'Current' : 'Read-Only'}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Multi-Tier Rate Limit Telemetry Panel */}
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13.5px] font-bold text-ink flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-accent" />
                  Rate Limiting Tiers &amp; Live Enforcement
                </h2>
                <p className="text-[11px] text-ink-muted">
                  Redis atomic sliding-window counters (with automatic Go memory fallback) protecting logins, 6-digit PINs, POS checkout, and reports.
                </p>
              </div>

              {onOpenSecuritySettings && (
                <Button type="button" size="sm" variant="outline" onClick={onOpenSecuritySettings}>
                  <Sliders className="h-3.5 w-3.5 text-accent" />
                  Tune Limits in Scope Rules
                </Button>
              )}
            </div>

            <RateLimitPolicyGrid rateLimits={rateLimits} />
          </section>
        </>
      )}
    </div>
  );
}
