import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Search,
  ChevronDown,
  Building2,
  MapPin,
  Warehouse,
  Monitor,
  Wifi,
  WifiOff,
  LogOut,
  Check,
  Sun,
  Moon,
  Globe,
  Lock,
  X,
  CheckCheck,
  ExternalLink,
  KeyRound,
  Eye,
  EyeOff,
  Store,
  ShieldCheck,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { SessionsSecurityTab } from '@/features/settings/SessionsSecurityTab';
import { KovaMark } from '@/components/brand/KovaLogo';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { useRealtimeStore } from '@/lib/realtime';
import { getDisplayTradeName, useAuthStore } from '@/store/authStore';
import { usePOSStore } from '@/store/posStore';
import { useThemeStore } from '@/store/themeStore';
import { SUPPORTED_LANGUAGES, useT } from '@/store/i18nStore';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { AppRoute } from './FloatingSidebar';

export interface NotificationAlert {
  id: string;
  title: string;
  body: string;
  time: string;
  kind: 'stock' | 'settings' | 'sync' | 'invoice';
  isRead?: boolean;
  route?: AppRoute;
}

interface TopHeaderProps {
  title: string;
  subtitle: string;
  onNavigate: (route: AppRoute) => void;
  alerts: NotificationAlert[];
  onDismissAlert?: (id: string) => void;
  onClearAllAlerts?: () => void;
  rightExtra?: React.ReactNode;
}

export function TopHeader({
  title,
  subtitle,
  onNavigate,
  alerts,
  onDismissAlert,
  onClearAllAlerts,
  rightExtra,
}: TopHeaderProps) {
  const queryClient = useQueryClient();
  const {
    context,
    publicBranding,
    branches,
    warehouses,
    terminals,
    activeWarehouseId,
    setActiveWarehouseId,
    setRequestedSettingsTab,
    hasPermission,
    setSession,
    logout,
  } = useAuthStore();
  const { pendingOutboxCount } = usePOSStore();
  const { wsStatus, lastSyncedAt } = useRealtimeStore();
  const { colorMode, toggleColorMode } = useThemeStore();
  const { language, setLanguage, t } = useT();
  const tradeName = getDisplayTradeName(context, publicBranding);
  const logoLightUrl = context?.logo_light_url || publicBranding?.logo_light_url || '';
  const activeLanguageMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [mySessionsOpen, setMySessionsOpen] = React.useState(false);
  const [changePwOpen, setChangePwOpen] = React.useState(false);
  const [currPw, setCurrPw] = React.useState('');
  const [newPw, setNewPw] = React.useState('');
  const [confirmPw, setConfirmPw] = React.useState('');
  const [showPwFields, setShowPwFields] = React.useState(false);
  const [savingPw, setSavingPw] = React.useState(false);
  const [online, setOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleSwitchContext = async (bizId?: string, branchId?: string, terminalId?: string) => {
    const switchingBusiness = Boolean(bizId && bizId !== context?.business_id);
    try {
      const res = await apiFetch<any>('/api/v1/auth/switch-context', {
        method: 'POST',
        body: JSON.stringify({
          business_id: bizId || context?.business_id || '',
          branch_id: switchingBusiness ? branchId || '' : branchId || context?.branch_id || '',
          terminal_id: switchingBusiness
            ? terminalId || ''
            : branchId && branchId !== context?.branch_id
            ? ''
            : terminalId || context?.terminal_id || '',
        }),
      });
      setSession(res);
      if (switchingBusiness) {
        usePOSStore.getState().clearCart();
      }
      await queryClient.invalidateQueries();
      const targetBranch = res.branches?.find((b: any) => b.id === res.context.branch_id);
      toast.success(
        `Active: ${res.context.business_name} • ${targetBranch?.name || 'Branch'}`
      );
    } catch (err: any) {
      toast.error(err.message || 'Unable to switch context');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('New password and confirmation do not match');
      return;
    }
    setSavingPw(true);
    try {
      await apiFetch('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currPw,
          new_password: newPw,
        }),
      });
      toast.success('Account password updated cleanly');
      setChangePwOpen(false);
      setCurrPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwFields(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to update password');
    } finally {
      setSavingPw(false);
    }
  };

  const isMultiBranch = isMultiBranchRole(context?.role_code);
  const canManageBranches =
    isMultiBranch && (hasPermission('branches:manage') || hasPermission('settings:manage'));

  const activeBranch =
    branches.find((b) => b.id === context?.branch_id) || branches[0] || null;
  const accessibleWarehouses = warehouses.length > 0
    ? isMultiBranch
      ? warehouses
      : warehouses.filter((w) => !context?.branch_id || w.branch_id === context.branch_id)
    : [];
  const warehouseBranches = (isMultiBranch
    ? branches
    : branches.filter((b) => !context?.branch_id || b.id === context.branch_id)
  ).filter((b) => Boolean(b.is_warehouse));
  const activeWarehouseRecord =
    accessibleWarehouses.find((w) => w.id === activeWarehouseId) ||
    accessibleWarehouses.find((w) => w.branch_id === context?.branch_id) ||
    accessibleWarehouses.find((w) => w.is_primary) ||
    accessibleWarehouses[0] ||
    null;
  const activeWarehouseBranch =
    (activeBranch?.is_warehouse ? activeBranch : warehouseBranches[0]) || activeBranch;

  const branchTerminals = terminals.filter(
    (tm) => !context?.branch_id || tm.branch_id === context.branch_id
  );
  const activeTerminal = branchTerminals.find((t) => t.id === context?.terminal_id) || branchTerminals[0] || null;

  const canSwitchBranch = isMultiBranch && (branches.length > 1 || canManageBranches);
  const warehouseOptionsCount = accessibleWarehouses.length || warehouseBranches.length || (isMultiBranch ? branches.length : 1);
  const canSwitchWarehouse = isMultiBranch && warehouseOptionsCount > 1;

  const initials = (context?.full_name || 'ZR')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="zona-nav-glass print:hidden mb-4 rounded-[var(--theme-radius-card)] border border-border-theme px-4 py-3 sm:px-5">
      <div className="flex flex-col gap-3.5">
        {/* Top Row: Brand Identity + Screen Title + Status Badge & Language/Theme/Search/Alerts/Profile */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            {logoLightUrl ? (
              <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] border border-border-theme bg-white/95 overflow-hidden shadow-xs">
                <img
                  src={logoLightUrl}
                  alt={tradeName}
                  data-testid="header-brand-logo"
                  className="h-7 w-7 object-contain"
                />
              </div>
            ) : (
              <KovaMark
                data-testid="header-brand-logo"
                className="hidden sm:block h-9 w-9 rounded-[var(--theme-radius-control)]"
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[15px] sm:text-[16px] font-bold tracking-[-0.015em] text-ink leading-tight">
                  {title}
                </h1>
                <span
                  data-testid="header-trade-name"
                  className="zona-glass-pill hidden md:inline-flex items-center rounded-[var(--theme-radius-badge)] border px-2 py-0.5 text-[10.5px] font-bold text-ink"
                >
                  {tradeName}
                </span>
                <Badge
                  variant={online ? (wsStatus === 'live' ? 'positive' : 'outline') : 'negative'}
                  title={
                    lastSyncedAt
                      ? `Real-time sync (${wsStatus}) · Last update ${new Date(lastSyncedAt).toLocaleTimeString()}`
                      : `Connection status: ${wsStatus}`
                  }
                  className="text-[10.5px] font-semibold gap-1.5"
                >
                  {online ? (
                    <>
                      {wsStatus === 'live' ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                      ) : (
                        <Wifi className="h-3 w-3" />
                      )}
                      <span>
                        {wsStatus === 'live'
                          ? `Live • ${t.common.synced}`
                          : wsStatus === 'reconnecting'
                            ? 'Reconnecting...'
                            : t.common.synced}
                        {pendingOutboxCount > 0 ? ` • ${pendingOutboxCount} ${t.common.pending}` : ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" />
                      <span>{t.common.offlineEdge} • {pendingOutboxCount} {t.common.queued}</span>
                    </>
                  )}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-muted line-clamp-1">{subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {rightExtra}

            {/* Subtle Instant Language Switcher (en / si / ta) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-testid="language-switcher"
                  aria-label={t.header.language}
                  title={t.header.language}
                  className="zona-glass-pill inline-flex h-9 items-center gap-1.5 rounded-[var(--theme-radius-control)] border px-2.5 text-ink hover:bg-accent-soft/45 transition cursor-pointer"
                >
                  <Globe className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] font-bold tracking-tight">
                    {activeLanguageMeta.shortCode}
                  </span>
                  <ChevronDown className="h-3 w-3 text-ink-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  {t.header.language}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    data-testid={`lang-option-${lang.code}`}
                    onClick={() => setLanguage(lang.code)}
                  >
                    <span className="flex-1 text-xs font-semibold">{lang.nativeLabel}</span>
                    <span className="text-[10px] font-mono uppercase text-ink-muted mr-1">
                      {lang.code}
                    </span>
                    {language === lang.code && <Check className="h-3.5 w-3.5 text-[#22C55E]" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Dedicated Light / Dark Mode Switch (light-mode colors remain exclusively in Settings) */}
            <button
              type="button"
              onClick={toggleColorMode}
              aria-label={colorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              title={colorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              data-testid="color-mode-toggle"
              className="zona-glass-pill inline-flex h-9 items-center gap-1.5 rounded-[var(--theme-radius-control)] border px-2.5 text-ink hover:bg-accent-soft/45 transition cursor-pointer"
            >
              {colorMode === 'dark' ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-400" />
                  <span className="hidden md:inline text-[11px] font-semibold">{t.common.light}</span>
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5 text-accent" />
                  <span className="hidden md:inline text-[11px] font-semibold">{t.common.dark}</span>
                </>
              )}
            </button>

            {/* Cmd+K Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Global search (Cmd+K)"
              className="zona-glass-pill inline-flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] border text-ink hover:bg-accent-soft/45 transition cursor-pointer"
            >
              <Search className="h-4 w-4" />
            </button>

            {/* Floating Dropdown Notifications (closes on outside click; click dismisses alert) */}
            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="notification-bell-trigger"
                  aria-label="Notifications"
                  className="zona-glass-pill relative inline-flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] border text-ink hover:bg-accent-soft/45 transition cursor-pointer"
                >
                  <Bell className="h-4 w-4" />
                  {alerts.length > 0 && (
                    <span
                      data-testid="notification-unread-badge"
                      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-[var(--theme-radius-badge)] bg-[#22C55E] px-1 text-[9.5px] font-bold text-white tabular-nums ring-2 ring-surface"
                    >
                      {alerts.length}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                data-testid="notification-floating-dropdown"
                className="w-[350px] max-w-[calc(100vw-1.5rem)] p-0 overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-border-theme px-3.5 py-2.5">
                  <div>
                    <div className="text-xs font-bold text-ink">Notifications & Auto-PO Alerts</div>
                    <div className="text-[10.5px] text-ink-muted">
                      {alerts.length > 0
                        ? `${alerts.length} unread • click alert to remove & open`
                        : 'All alerts caught up'}
                    </div>
                  </div>
                  {alerts.length > 0 && onClearAllAlerts && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearAllAlerts();
                        setNotifOpen(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-[var(--theme-radius-badge)] bg-surface-muted px-2 py-1 text-[10.5px] font-semibold text-ink hover:bg-accent-soft/50 transition cursor-pointer"
                    >
                      <CheckCheck className="h-3 w-3 text-accent" />
                      Clear all
                    </button>
                  )}
                </div>

                <div className="max-h-[300px] overflow-y-auto pos-clean-scroll p-2 space-y-1.5">
                  {alerts.length === 0 ? (
                    <div className="py-6 text-center text-xs text-ink-muted">
                      No unread stock or invoice alerts right now.
                    </div>
                  ) : (
                    alerts.map((al) => (
                      <div
                        key={al.id}
                        className="group flex items-start justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-2.5 hover:border-accent/60 hover:bg-accent-soft/25 transition"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onDismissAlert?.(al.id);
                            setNotifOpen(false);
                            if (al.route) {
                              onNavigate(al.route);
                            }
                          }}
                          className="min-w-0 flex-1 text-left cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[11.5px] font-bold text-ink">
                              {al.title}
                            </span>
                            <span className="shrink-0 text-[10px] text-ink-muted tabular-nums">
                              {al.time}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-ink-muted leading-snug line-clamp-2">
                            {al.body}
                          </p>
                        </button>
                        <button
                          type="button"
                          aria-label="Remove notification"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismissAlert?.(al.id);
                          }}
                          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--theme-radius-badge)] text-ink-muted hover:bg-accent-soft hover:text-ink transition cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-border-theme bg-surface-muted/50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigate('/reports');
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    Auto-PO & Invoices Report
                    <ExternalLink className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen(false);
                      onNavigate('/inventory');
                    }}
                    className="text-[11px] font-semibold text-ink-muted hover:text-ink cursor-pointer"
                  >
                    Inventory →
                  </button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Profile & Terminal Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="zona-glass-pill inline-flex min-h-[38px] items-center gap-2 rounded-[var(--theme-radius-control)] border pl-1.5 pr-3 py-1 text-left hover:bg-accent-soft/35 transition cursor-pointer"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={context?.avatar_url} alt={context?.full_name || 'User'} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden sm:block leading-tight">
                    <div className="text-xs font-bold text-ink">{context?.full_name}</div>
                    <div className="text-[11px] text-ink-muted">
                      {context?.designation_name || formatDisplayLabel(context?.role_name)}
                    </div>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  {context?.business_name} • {formatDisplayLabel(context?.role_name || context?.role_code)}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />

                {branchTerminals.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                      Branch POS Terminals ({branchTerminals.length})
                    </DropdownMenuLabel>
                    {branchTerminals.map((tm) => (
                      <DropdownMenuItem
                        key={tm.id}
                        onClick={() =>
                          handleSwitchContext(context?.business_id, context?.branch_id, tm.id)
                        }
                      >
                        <Monitor className="h-4 w-4 text-accent" />
                        <span className="flex-1 truncate">{tm.name}</span>
                        {tm.id === context?.terminal_id && (
                          <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuItem
                  onClick={() => {
                    if (hasPermission('settings:view')) {
                      setRequestedSettingsTab('sessions');
                      onNavigate('/settings');
                    } else {
                      setMySessionsOpen(true);
                    }
                  }}
                  data-testid="header-sessions-security-item"
                >
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span>Active Sessions &amp; Security</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setCurrPw('');
                    setNewPw('');
                    setConfirmPw('');
                    setShowPwFields(false);
                    setChangePwOpen(true);
                  }}
                  data-testid="header-change-password-item"
                >
                  <KeyRound className="h-4 w-4 text-accent" />
                  <span>Change Password</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="text-[#EF4444] focus:text-[#EF4444]"
                >
                  <LogOut className="h-4 w-4" />
                  <span>{t.common.signOut}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bottom Modern Context Strip: Strictly Scoped to Logged-In Company (1-to-1 Lock) & Accessible Branches/Warehouses */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--theme-nav-pill-border)] pt-3">
          {/* 1-to-1 Locked Company Identity Pill (Zero cross-company switching) */}
          <div
            data-testid="header-company-locked-badge"
            title={
              context?.company_slug
                ? `Dedicated 1-to-1 Company Portal (/c/${context.company_slug}/login)`
                : tradeName
            }
            className="zona-glass-pill inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-[var(--theme-radius-control)] border px-3 py-1 text-xs font-semibold text-ink cursor-default"
          >
            <Building2 className="h-3.5 w-3.5 shrink-0 text-accent" />
            <span className="text-[11px] font-medium text-ink-muted">{t.header.business}:</span>
            <span className="truncate font-bold">{tradeName}</span>
            <Lock className="h-3 w-3 shrink-0 text-ink-muted" />
          </div>

          {/* Active Branch Dropdown (Scoped cleanly to accessible branches) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Select branch"
                disabled={!canSwitchBranch}
                className="zona-glass-pill inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-[var(--theme-radius-control)] border px-3 py-1 text-xs font-semibold text-ink hover:bg-accent-soft/40 disabled:cursor-default disabled:opacity-90 transition cursor-pointer"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="text-[11px] font-medium text-ink-muted">{t.header.branch}:</span>
                <span className="truncate font-bold">
                  {activeBranch ? `${activeBranch.name} (${activeBranch.country_code})` : 'Select Branch'}
                </span>
                {canSwitchBranch ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                ) : (
                  <Lock className="h-3 w-3 shrink-0 text-ink-muted" />
                )}
              </button>
            </DropdownMenuTrigger>
            {canSwitchBranch && (
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  {t.header.accessibleBranches} ({branches.length})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {branches.map((br) => (
                  <DropdownMenuItem
                    key={br.id}
                    onClick={() => handleSwitchContext(context?.business_id, br.id)}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-accent" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-semibold">{br.name}</p>
                      <p className="text-[10px] text-ink-muted">
                        {br.code} • {br.country_name}
                        {br.is_warehouse ? ' • Warehouse Hub' : ''}
                      </p>
                    </div>
                    {br.id === context?.branch_id && (
                      <Check className="h-4 w-4 text-[#22C55E]" />
                    )}
                  </DropdownMenuItem>
                ))}
                {canManageBranches && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setRequestedSettingsTab('branches');
                        onNavigate('/settings');
                      }}
                      data-testid="header-manage-branches-item"
                    >
                      <Store className="h-4 w-4 shrink-0 text-accent" />
                      <span className="font-semibold">Manage Branches &amp; Terminals</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            )}
          </DropdownMenu>

          {/* Warehouse / Fulfillment Hub Selector (Persists activeWarehouseId & syncs branch if scoped) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Select warehouse"
                disabled={!canSwitchWarehouse}
                className="zona-glass-pill inline-flex min-h-[34px] max-w-full items-center gap-1.5 rounded-[var(--theme-radius-control)] border bg-accent-soft/45 px-3 py-1 text-xs font-semibold text-ink hover:bg-accent-soft/65 disabled:cursor-default disabled:opacity-90 transition cursor-pointer"
              >
                <Warehouse className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="text-[11px] font-medium text-ink-muted">{t.header.warehouse}:</span>
                <span className="truncate font-bold">
                  {activeWarehouseRecord
                    ? `${activeWarehouseRecord.name} (${activeWarehouseRecord.code})`
                    : activeWarehouseBranch
                    ? `${activeWarehouseBranch.name} (${activeWarehouseBranch.code})`
                    : 'Main Hub'}
                </span>
                {canSwitchWarehouse ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                ) : (
                  <Lock className="h-3 w-3 shrink-0 text-ink-muted" />
                )}
              </button>
            </DropdownMenuTrigger>
            {canSwitchWarehouse && (
              <DropdownMenuContent align="start" className="w-72">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  {t.header.accessibleWarehouses} ({warehouseOptionsCount})
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {accessibleWarehouses.length > 0
                  ? accessibleWarehouses.map((wh) => (
                      <DropdownMenuItem
                        key={wh.id}
                        onClick={() => {
                          setActiveWarehouseId(wh.id);
                          if (wh.branch_id && wh.branch_id !== context?.branch_id) {
                            handleSwitchContext(context?.business_id, wh.branch_id);
                          } else {
                            toast.success(`Active warehouse: ${wh.name}`);
                          }
                        }}
                      >
                        <Warehouse className="h-4 w-4 shrink-0 text-accent" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold">{wh.name}</p>
                          <p className="text-[10px] text-ink-muted">
                            {wh.code} • {wh.address || 'FIFO Fulfillment Hub'}
                          </p>
                        </div>
                        {(activeWarehouseRecord?.id === wh.id) && (
                          <Check className="h-4 w-4 text-[#22C55E]" />
                        )}
                      </DropdownMenuItem>
                    ))
                  : (warehouseBranches.length > 0 ? warehouseBranches : branches).map((wh) => (
                      <DropdownMenuItem
                        key={wh.id}
                        onClick={() => handleSwitchContext(context?.business_id, wh.id)}
                      >
                        <Warehouse className="h-4 w-4 shrink-0 text-accent" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold">{wh.name}</p>
                          <p className="text-[10px] text-ink-muted">
                            {wh.code} • FIFO Fulfillment Hub ({wh.country_name})
                          </p>
                        </div>
                        {wh.id === context?.branch_id && (
                          <Check className="h-4 w-4 text-[#22C55E]" />
                        )}
                      </DropdownMenuItem>
                    ))}
              </DropdownMenuContent>
            )}
          </DropdownMenu>

          {/* Compact Scoped Role & Terminal Pill */}
          <div className="zona-glass-pill ml-auto hidden lg:flex items-center gap-1.5 rounded-[var(--theme-radius-control)] border px-2.5 py-1 text-[11px] text-ink-muted">
            <Monitor className="h-3.5 w-3.5 text-accent" />
            <span className="font-semibold text-ink">{activeTerminal?.name || 'No Terminal'}</span>
            <span className="opacity-45">•</span>
            <span className="font-semibold text-accent">{context?.base_currency || 'USD'}</span>
            <span className="opacity-45">•</span>
            <span>
              {branches.length} {branches.length === 1 ? 'Branch' : 'Branches'}
            </span>
          </div>
        </div>
      </div>

      {/* Authenticated Password Rotation Dialog */}
      <Dialog open={changePwOpen} onOpenChange={setChangePwOpen}>
        <DialogContent className="sm:max-w-[420px]" data-testid="change-password-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Change Account Password
            </DialogTitle>
            <DialogDescription>
              Rotate the login password for {context?.email || context?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Current Password</label>
              <div className="relative">
                <Input
                  type={showPwFields ? 'text' : 'password'}
                  value={currPw}
                  onChange={(e) => setCurrPw(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwFields((v) => !v)}
                  aria-label={showPwFields ? 'Hide passwords' : 'Show passwords'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  {showPwFields ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">New Password (min 8 chars)</label>
              <Input
                type={showPwFields ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="New password"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Confirm New Password</label>
              <Input
                type={showPwFields ? 'text' : 'password'}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm password"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setChangePwOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingPw}>
                Save Password
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Cmd+K Command Palette Dialog (filtered to permitted routes) */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="p-2 max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Quick Navigation</DialogTitle>
          </DialogHeader>
          <Command>
            <CommandInput placeholder="Jump to Overview, POS, Inventory, Ledger, Settings..." />
            <CommandList>
              <CommandEmpty>No matching workspace route.</CommandEmpty>
              {(
                [
                  { label: 'Executive Overview Dashboard', route: '/overview', perm: 'analytics:view' },
                  { label: 'Edge POS Terminal Checkout', route: '/pos', perm: 'pos:view' },
                  { label: 'Product Catalog & Add SKU', route: '/products', perm: 'catalog:view' },
                  { label: 'Categories Management', route: '/categories', perm: 'catalog:view' },
                  { label: 'Customers Directory & CRM', route: '/customers', perm: 'customers:view' },
                  { label: 'Suppliers & Vendor Master', route: '/suppliers', perm: 'inventory:view' },
                  { label: 'Inventory FIFO & GRN Intake', route: '/inventory', perm: 'inventory:view' },
                  { label: 'Reports, Invoices & Auto-PO', route: '/reports', perm: 'analytics:view' },
                  { label: 'General Ledger & Fiscal Periods', route: '/accounting', perm: 'accounting:view' },
                  { label: 'Settings, Taxes, Roles & Access', route: '/settings', perm: 'settings:view' },
                ] as const
              )
                .filter((entry) => hasPermission(entry.perm))
                .map((entry) => (
                  <CommandItem
                    key={entry.route}
                    onSelect={() => {
                      onNavigate(entry.route);
                      setSearchOpen(false);
                    }}
                  >
                    <span>{entry.label}</span>
                    <span className="text-[11px] text-ink-muted">{entry.route}</span>
                  </CommandItem>
                ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>

      {/* Personal Sessions & Security Dialog (accessible to every staff role) */}
      <Dialog open={mySessionsOpen} onOpenChange={setMySessionsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto pos-clean-scroll">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Active Sessions &amp; Security
            </DialogTitle>
            <DialogDescription>
              Inspect active devices signed into your account, extend your current token, or revoke idle registers.
            </DialogDescription>
          </DialogHeader>
          <SessionsSecurityTab />
        </DialogContent>
      </Dialog>
    </header>
  );
}
