import * as React from 'react';
import {
  Building2,
  Calendar,
  Clock,
  Menu,
  Monitor,
  Store,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { KovaMark } from '@/components/brand/KovaLogo';
import { useRealtimeStore } from '@/lib/realtime';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { getDisplayTradeName, useAuthStore } from '@/store/authStore';
import type { POSCapabilities } from './capabilities';

export interface TerminalTopBarProps {
  activeBranchName: string;
  capabilities: POSCapabilities;
  currencyCode: string;
  isOnline: boolean;
  pendingOutboxCount: number;
  zoomLevel: '0.8' | '1';
  onToggleZoom: () => void;
  onOpenSidebar: () => void;
}

/**
 * Full-width POS Top Bar displaying:
 * - Left navigation sidebar trigger
 * - Company branding, trade name & assigned business vertical badge
 * - Branch, register terminal, cashier & online sync status
 * - Mandatory live ticking Date & Time clock
 */
export function TerminalTopBar({
  activeBranchName,
  capabilities,
  currencyCode,
  isOnline,
  pendingOutboxCount,
  zoomLevel,
  onToggleZoom,
  onOpenSidebar,
}: TerminalTopBarProps) {
  const { context, publicBranding, terminals } = useAuthStore();
  const { wsStatus, lastSyncedAt } = useRealtimeStore();
  const [now, setNow] = React.useState<Date>(() => new Date());
  const activeTerminalName =
    terminals.find((term) => term.id === context?.terminal_id)?.name || 'Terminal #01';

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const tradeName = getDisplayTradeName(context, publicBranding);
  const logoUrl =
    context?.logo_light_url ||
    publicBranding?.logo_light_url ||
    context?.logo_dark_url ||
    context?.logo_sidebar_url ||
    '';

  const dateText = now.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
  const timeText = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <header
      data-testid="pos-top-bar"
      className="h-[54px] shrink-0 border-b border-border-theme/80 bg-white px-2.5 sm:px-4 flex items-center justify-between gap-2 shadow-[0_2px_10px_rgba(34,32,38,0.04)]"
    >
      {/* Left: Sidebar Toggle + Company Logo, Trade Name & Business Vertical */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={onOpenSidebar}
          data-testid="pos-open-sidebar-btn"
          aria-label="Open Navigation Sidebar"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-border-theme bg-[#222026] text-white shadow-xs transition-transform active:scale-95 hover:opacity-90 cursor-pointer"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={tradeName}
              className="h-8 w-8 shrink-0 rounded-[9px] border border-border-theme object-contain bg-white p-0.5"
            />
          ) : (
            <KovaMark className="h-8 w-8 rounded-[9px]" />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Building2 className="hidden sm:inline h-3.5 w-3.5 shrink-0 text-accent" />
              <span
                className="truncate text-[13px] font-extrabold tracking-[-0.01em] text-[#222026]"
                data-testid="pos-topbar-company-name"
              >
                {tradeName}
              </span>
              <Badge variant="lavender" className="hidden sm:inline-flex shrink-0 text-[10px]">
                {capabilities.preset.label}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-[10.5px] text-ink-muted truncate">
              <span className="inline-flex items-center gap-1 truncate">
                <Store className="h-3 w-3 shrink-0 text-accent" />
                <span className="truncate font-semibold text-ink">{activeBranchName}</span>
              </span>
              <span className="hidden md:inline text-border-theme">•</span>
              <span className="hidden md:inline-flex items-center gap-1">
                <Monitor className="h-3 w-3 text-ink-muted" />
                <span>{activeTerminalName}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Telemetry Chips (Tablet/Desktop) */}
      <div className="hidden lg:flex items-center gap-2 text-[11px]">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border-theme bg-[#F5F6FA] px-2.5 py-1 text-ink">
          <UserCheck className="h-3.5 w-3.5 text-accent" />
          <span className="font-bold">{context?.full_name || 'Cashier'}</span>
          <span className="text-ink-muted">({formatDisplayLabel(context?.role_name || context?.role_code) || 'Staff'})</span>
        </div>

        <span className="inline-flex items-center rounded-full border border-border-theme bg-[#F5F6FA] px-2.5 py-1 font-mono font-bold text-ink">
          {currencyCode}
        </span>

        <span
          title={
            lastSyncedAt
              ? `Real-time sync (${wsStatus}) · Last update ${new Date(lastSyncedAt).toLocaleTimeString()}`
              : `Connection status: ${wsStatus}`
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${
            isOnline
              ? 'border-[#22C55E]/30 bg-[#22C55E]/10 text-[#15803D]'
              : 'border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#B45309]'
          }`}
        >
          {isOnline ? (
            wsStatus === 'live' ? (
              <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
            ) : (
              <Wifi className="h-3 w-3" />
            )
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span>
            {isOnline ? (wsStatus === 'live' ? 'Live' : 'Syncing...') : 'Offline Edge'}
            {pendingOutboxCount > 0 ? ` (${pendingOutboxCount})` : ''}
          </span>
        </span>

        <button
          type="button"
          onClick={onToggleZoom}
          data-testid="pos-topbar-zoom-pill"
          title="Toggle POS Workspace Scale (80% Compact / 100% Standard)"
          className="hidden md:inline-flex items-center rounded-full border border-border-theme bg-[#F5F6FA] px-2.5 py-1 font-mono text-[10.5px] font-bold text-ink hover:border-accent cursor-pointer"
        >
          Zoom: {zoomLevel === '0.8' ? '80%' : '100%'}
        </button>
      </div>

      {/* Right: Mandatory Live Date & Ticking Clock */}
      <div
        data-testid="pos-topbar-clock"
        className="flex shrink-0 items-center gap-2 rounded-[12px] bg-[#222026] px-2.5 sm:px-3.5 py-1.5 text-white shadow-xs"
      >
        <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          <Calendar className="h-3.5 w-3.5 text-accent-soft" />
          <span className="tabular-nums whitespace-nowrap">{dateText}</span>
        </div>
        <span className="hidden sm:inline h-3.5 w-px bg-white/20" aria-hidden="true" />
        <div className="flex items-center gap-1.5 font-mono text-[12px] sm:text-[13px] font-extrabold tracking-tight tabular-nums whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 text-[#22C55E]" />
          <span>{timeText}</span>
        </div>
      </div>
    </header>
  );
}
