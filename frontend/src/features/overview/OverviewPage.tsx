import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Loader2, Monitor, Shield, Store, Sun, Moon, Sunrise, Sunset } from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { apiFetch } from '@/lib/api';
import { hasAllBranchesAccess, hasMultiBranchAccess } from '@/lib/branchAccess';
import { useAuthStore, type AuthSessionPayload } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { OverviewBentoSkeleton } from '@/components/skeletons/OverviewBentoSkeleton';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { CompanyBranchTerminalOverviewCard } from './components/CompanyBranchTerminalOverviewCard';
import { RoleQuickFunctionsBar } from './components/RoleQuickFunctionsBar';
import { SalesAnalyticsCard } from './components/SalesAnalyticsCard';
import { TopSalesByCountryCard } from './components/TopSalesByCountryCard';
import { LastActivityCard } from './components/LastActivityCard';
import { ProductSalesTableCard } from './components/ProductSalesTableCard';
import { KPICardsStack } from './components/KPICardsStack';
import { PaymentMixCard } from './components/PaymentMixCard';
import { PendingHeldOrdersCard } from './components/PendingHeldOrdersCard';
import { LowStockAlertsCard } from './components/LowStockAlertsCard';
import { GLJournalsOverviewCard } from './components/GLJournalsOverviewCard';
import { CategoryMixCard } from './components/CategoryMixCard';
import { ProductVisualAnalysisCards } from './components/ProductVisualAnalysisCards';
import type { OverviewPeriod, OverviewResponse } from './types';

interface OverviewPageProps {
  onOpenPOS: () => void;
  onNavigate?: (route: AppRoute) => void;
}

const PERIOD_OPTIONS: { id: OverviewPeriod; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'year', label: 'Year' },
];

function getColomboTimeGreeting(now: Date): {
  greeting: string;
  subtitle: string;
  timeText: string;
  dateText: string;
  periodIcon: 'morning' | 'afternoon' | 'evening' | 'night';
} {
  try {
    const hourStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Colombo',
      hour: 'numeric',
      hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    const timeText = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);
    const dateText = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Colombo',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(now);

    if (hour >= 5 && hour < 12) {
      return {
        greeting: 'Good Morning',
        subtitle: 'Colombo Morning Trading Session • Live Multi-Branch Telemetry',
        timeText,
        dateText,
        periodIcon: 'morning',
      };
    }
    if (hour >= 12 && hour < 17) {
      return {
        greeting: 'Good Afternoon',
        subtitle: 'Colombo Peak Counter Session • Real-Time Register & FIFO Sync',
        timeText,
        dateText,
        periodIcon: 'afternoon',
      };
    }
    if (hour >= 17 && hour < 21) {
      return {
        greeting: 'Good Evening',
        subtitle: 'Colombo Evening Rush & Settlement Window • Live Ledger Sync',
        timeText,
        dateText,
        periodIcon: 'evening',
      };
    }
    return {
      greeting: 'Good Night',
      subtitle: 'Colombo Late Shift & End-of-Day Reconciliation Window',
      timeText,
      dateText,
      periodIcon: 'night',
    };
  } catch {
    return {
      greeting: 'Welcome back',
      subtitle: 'Live Enterprise Operations Telemetry',
      timeText: now.toLocaleTimeString(),
      dateText: now.toLocaleDateString(),
      periodIcon: 'afternoon',
    };
  }
}

export function OverviewPage({ onOpenPOS, onNavigate }: OverviewPageProps) {
  const queryClient = useQueryClient();
  const { context, branches, terminals, setSession, setRequestedSettingsTab } = useAuthStore();
  const { t } = useT();
  const [period, setPeriod] = React.useState<OverviewPeriod>('month');
  const canMultiBranch = hasMultiBranchAccess(context, branches.length);
  const isAllBranchesUser = hasAllBranchesAccess(context);

  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(() =>
    canMultiBranch ? 'ALL' : context?.branch_id || 'ALL'
  );
  const [selectedTerminalId, setSelectedTerminalId] = React.useState<string>('ALL');
  const [colomboNow, setColomboNow] = React.useState<Date>(() => new Date());

  React.useEffect(() => {
    const timer = window.setInterval(() => setColomboNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    if (!canMultiBranch && context?.branch_id) {
      setSelectedBranchId(context.branch_id);
    }
  }, [canMultiBranch, context?.branch_id]);

  const branchQuery = !canMultiBranch
    ? context?.branch_id
      ? `&branch_id=${encodeURIComponent(context.branch_id)}`
      : ''
    : selectedBranchId !== 'ALL'
    ? `&branch_id=${encodeURIComponent(selectedBranchId)}`
    : '';

  const terminalQuery =
    selectedTerminalId !== 'ALL'
      ? `&terminal_id=${encodeURIComponent(selectedTerminalId)}`
      : '';

  const effectiveScopeKey = `${canMultiBranch ? selectedBranchId : context?.branch_id || ''}:${selectedTerminalId}`;

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['overview', context?.business_id, context?.role_code, effectiveScopeKey, period],
    queryFn: () =>
      apiFetch<OverviewResponse>(`/api/v1/overview?period=${period}${branchQuery}${terminalQuery}`),
    placeholderData: (prev) => prev,
  });

  if (isLoading && !data) {
    return <OverviewBentoSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="zona-card flex flex-col items-center justify-center p-10 text-center">
        <p className="text-[14px] font-bold text-ink">{t.overview.unableToLoad}</p>
        <p className="mt-1 text-xs text-ink-muted">{(error as Error)?.message || 'Network error'}</p>
        <div className="mt-4 flex gap-3">
          <DynamicButton variant="obsidian" onClick={() => refetch()}>
            {t.common.retry}
          </DynamicButton>
          <DynamicButton variant="lavender" icon={<Store className="h-4 w-4" />} onClick={onOpenPOS}>
            {t.overview.openPosTerminal}
          </DynamicButton>
        </div>
      </div>
    );
  }

  const persona = data.role_persona;
  const caps = data.capabilities;
  const lowStockCount =
    data.inventory_summary?.low_stock_count ?? data.low_stock_alerts?.length ?? 0;

  const colomboGreeting = getColomboTimeGreeting(colomboNow);
  const visibleBranches = data.branch_sales?.length
    ? data.branch_sales.map((b) => ({
        id: b.branch_id,
        code: b.branch_code,
        name: b.branch_name,
      }))
    : branches.map((b) => ({ id: b.id, code: b.code, name: b.name }));

  const visibleTerminals = (
    data.terminal_sales?.length
      ? data.terminal_sales.map((tm) => ({
          id: tm.terminal_id,
          branch_id: tm.branch_id,
          code: tm.terminal_code,
          name: tm.terminal_name,
        }))
      : terminals
  ).filter((tm) => selectedBranchId === 'ALL' || tm.branch_id === selectedBranchId);

  const handleSelectBranchScope = (nextBranchId: string) => {
    setSelectedBranchId(nextBranchId);
    if (nextBranchId !== 'ALL' && selectedTerminalId !== 'ALL') {
      const termStillInBranch = (data.terminal_sales || []).some(
        (tm) => tm.terminal_id === selectedTerminalId && tm.branch_id === nextBranchId
      );
      if (!termStillInBranch) {
        setSelectedTerminalId('ALL');
      }
    }
  };

  const handleSelectTerminalScope = (nextTerminalId: string, parentBranchId?: string) => {
    setSelectedTerminalId(nextTerminalId);
    if (nextTerminalId !== 'ALL' && parentBranchId && !canMultiBranch) {
      setSelectedBranchId(parentBranchId);
    }
  };

  const handleLaunchTerminalPOS = async (branchId: string, terminalId: string) => {
    if (context?.business_id && (branchId !== context.branch_id || terminalId !== context.terminal_id)) {
      try {
        const res = await apiFetch<AuthSessionPayload>('/api/v1/auth/switch-context', {
          method: 'POST',
          body: JSON.stringify({
            business_id: context.business_id,
            branch_id: branchId,
            terminal_id: terminalId,
          }),
        });
        setSession(res);
        await queryClient.invalidateQueries();
      } catch {
        // Proceed to open POS with current context if switch skipped
      }
    }
    onOpenPOS();
  };

  const handleNavigateSettingsTab = (tab: string) => {
    setRequestedSettingsTab(tab);
    onNavigate?.('/settings');
  };

  return (
    <div className="space-y-5" data-testid="overview-page" data-persona={persona}>
      {/* Colombo (Asia/Colombo) Time-Aware Greeting Banner */}
      <div
        className="zona-card flex flex-col gap-3 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between"
        data-testid="overview-colombo-greeting"
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent/15 text-accent">
            {colomboGreeting.periodIcon === 'morning' && <Sunrise className="h-5 w-5" />}
            {colomboGreeting.periodIcon === 'afternoon' && <Sun className="h-5 w-5" />}
            {colomboGreeting.periodIcon === 'evening' && <Sunset className="h-5 w-5" />}
            {colomboGreeting.periodIcon === 'night' && <Moon className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className="text-base sm:text-lg font-extrabold tracking-tight text-ink"
                data-testid="overview-greeting-headline"
              >
                {colomboGreeting.greeting}, {context?.full_name || 'Store Leader'}!
              </h2>
              <span className="zona-glass-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-ink">
                <Shield className="h-3 w-3 text-accent" />
                {formatDisplayLabel(context?.designation_name || data.role_name || data.role_code)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">{colomboGreeting.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="zona-glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink"
            data-testid="overview-colombo-clock"
          >
            <Clock className="h-3.5 w-3.5 text-accent shrink-0" />
            <span className="font-semibold">Colombo (GMT+5:30)</span>
            <span className="text-ink-muted">•</span>
            <span className="font-mono font-bold tabular-nums">{colomboGreeting.timeText}</span>
            <span className="hidden sm:inline text-ink-muted">• {colomboGreeting.dateText}</span>
          </div>
        </div>
      </div>

      {/* Role Quick Functions + Multi-Branch & Terminal Scope Filter Bar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="zona-glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-ink"
            data-testid="overview-role-scope"
          >
            <Shield className="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{formatDisplayLabel(data.role_name || data.role_code)}</span>
            <span className="text-ink-muted">•</span>
            <span className="text-ink-muted">
              {selectedBranchId === 'ALL'
                ? isAllBranchesUser
                  ? 'All Branches'
                  : `Assigned Branches (${visibleBranches.length})`
                : visibleBranches.find((b) => b.id === selectedBranchId)?.name || data.branch_scope}
            </span>
            {selectedTerminalId !== 'ALL' && (
              <>
                <span className="text-ink-muted">•</span>
                <span className="font-mono text-accent">
                  {visibleTerminals.find((tm) => tm.id === selectedTerminalId)?.code || 'Terminal'}
                </span>
              </>
            )}
          </div>

          <RoleQuickFunctionsBar
            persona={persona}
            heldCount={data.kpi.held_bill_count}
            lowStockCount={lowStockCount}
            onOpenPOS={onOpenPOS}
            onNavigate={onNavigate}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start xl:self-auto">
          {isFetching && (
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label="Refreshing metrics" />
          )}

          {/* Branch Scope Pills (All Branches + Every Accessible Branch) */}
          {canMultiBranch && (
            <div
              className="zona-nav-glass inline-flex flex-wrap items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="Overview branch scope"
              data-testid="overview-branch-scope-toggle"
            >
              <button
                type="button"
                onClick={() => handleSelectBranchScope('ALL')}
                data-testid="overview-scope-all"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  selectedBranchId === 'ALL'
                    ? 'bg-obsidian text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {isAllBranchesUser ? 'All Branches' : `All My Branches (${visibleBranches.length})`}
              </button>
              {visibleBranches.map((br) => {
                const active = selectedBranchId === br.id;
                return (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => handleSelectBranchScope(br.id)}
                    data-testid={`overview-scope-branch-${br.code}`}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-obsidian text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {br.code} • {br.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Terminal Scope Pills (All Terminals + Accessible Terminals) */}
          {visibleTerminals.length > 1 && (
            <div
              className="zona-nav-glass inline-flex flex-wrap items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="Overview terminal scope"
              data-testid="overview-terminal-scope-toggle"
            >
              <button
                type="button"
                onClick={() => handleSelectTerminalScope('ALL')}
                data-testid="overview-terminal-all"
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  selectedTerminalId === 'ALL'
                    ? 'bg-obsidian text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Monitor className="h-3 w-3" />
                <span>All Terminals</span>
              </button>
              {visibleTerminals.map((tm) => {
                const active = selectedTerminalId === tm.id;
                return (
                  <button
                    key={tm.id}
                    type="button"
                    onClick={() => handleSelectTerminalScope(tm.id, tm.branch_id)}
                    data-testid={`overview-terminal-${tm.code}`}
                    className={`rounded-full px-2.5 py-1.5 font-mono text-[11px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {tm.code}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="zona-nav-glass inline-flex items-center gap-1 rounded-full p-1"
            role="tablist"
            aria-label="Overview timeframe filter"
            data-testid="overview-period-filter"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPeriod(opt.id)}
                  data-testid={`overview-period-${opt.id}`}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    active
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multi-Branch, Terminal-Wise & Full Company Overview Command Center */}
      {(persona === 'EXECUTIVE' ||
        persona === 'BRANCH_MANAGER' ||
        persona === 'ACCOUNTANT' ||
        persona === 'INVENTORY' ||
        canMultiBranch ||
        (data.terminal_sales?.length ?? 0) > 0) && (
        <ScrollReveal>
          <CompanyBranchTerminalOverviewCard
            company={data.company_overview}
            branches={data.branch_sales || []}
            terminals={data.terminal_sales || []}
            periodLabel={data.period_label}
            canViewProfit={caps.can_view_profit}
            canManageSettings={caps.can_manage_settings}
            selectedBranchId={selectedBranchId}
            selectedTerminalId={selectedTerminalId}
            onSelectBranch={handleSelectBranchScope}
            onSelectTerminal={handleSelectTerminalScope}
            onLaunchTerminalPOS={caps.can_view_pos ? handleLaunchTerminalPOS : undefined}
            onNavigateSettings={handleNavigateSettingsTab}
            onNavigate={onNavigate}
          />
        </ScrollReveal>
      )}

      {/* Role-Specific Symmetrical 12-Column Bento Dashboard */}
      {persona === 'CASHIER' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
          <div className="flex flex-col gap-5 xl:col-span-8">
            <ScrollReveal>
              <SalesAnalyticsCard
                data={data.sales_analytics}
                period={data.period}
                periodLabel={data.period_label}
                persona={persona}
                canViewProfit={false}
                canViewTaxDetail={false}
              />
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <PendingHeldOrdersCard
                  heldOrders={data.held_orders || []}
                  onOpenPOS={onOpenPOS}
                  canUsePOS={caps.can_view_pos}
                />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <LastActivityCard
                  activities={data.recent_activity || []}
                  onRefresh={() => refetch()}
                  canViewGL={false}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
            </div>

            <ScrollReveal delayMs={60}>
              <ProductSalesTableCard
                products={data.product_sales || []}
                showValuation={false}
                defaultView="grid"
                periodLabel={data.period_label}
              />
            </ScrollReveal>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-4">
            <KPICardsStack overview={data} />
            <ScrollReveal delayMs={80}>
              <PaymentMixCard items={data.payment_mix || []} periodLabel={data.period_label} />
            </ScrollReveal>
            <ProductVisualAnalysisCards
              overview={data}
              onNavigate={onNavigate}
              showSecondaryDigest={false}
            />
          </div>
        </div>
      )}

      {persona === 'ACCOUNTANT' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
          <div className="flex flex-col gap-5 xl:col-span-8">
            <ScrollReveal>
              <SalesAnalyticsCard
                data={data.sales_analytics}
                period={data.period}
                periodLabel={data.period_label}
                persona={persona}
                canViewProfit={caps.can_view_profit}
                canViewTaxDetail={caps.can_view_tax_detail}
              />
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <GLJournalsOverviewCard
                  glSummary={data.gl_summary}
                  recentJournals={data.recent_journals || []}
                  taxBreakdown={data.tax_breakdown || []}
                  periodLabel={data.period_label}
                  onNavigate={onNavigate}
                />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <LastActivityCard
                  activities={data.recent_activity || []}
                  onRefresh={() => refetch()}
                  canViewGL={caps.can_view_gl}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <PaymentMixCard items={data.payment_mix || []} periodLabel={data.period_label} />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <TopSalesByCountryCard
                  countries={data.top_countries || []}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
            </div>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-4">
            <KPICardsStack overview={data} />
            <ProductVisualAnalysisCards overview={data} onNavigate={onNavigate} />
          </div>
        </div>
      )}

      {persona === 'INVENTORY' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
          <div className="flex flex-col gap-5 xl:col-span-8">
            <ScrollReveal>
              <SalesAnalyticsCard
                data={data.sales_analytics}
                period={data.period}
                periodLabel={data.period_label}
                persona={persona}
                canViewProfit={false}
                canViewTaxDetail={false}
              />
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <LowStockAlertsCard
                  alerts={data.low_stock_alerts || []}
                  onNavigate={onNavigate}
                  canViewInventory={caps.can_view_inventory}
                />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <TopSalesByCountryCard
                  countries={data.top_countries || []}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
            </div>

            <ScrollReveal delayMs={60}>
              <ProductSalesTableCard
                products={data.product_sales || []}
                showValuation={caps.can_view_inventory}
                defaultView="grid"
                periodLabel={data.period_label}
              />
            </ScrollReveal>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-4">
            <KPICardsStack overview={data} />
            <ScrollReveal delayMs={80}>
              <CategoryMixCard
                items={data.category_mix || []}
                periodLabel={data.period_label}
                hideRevenue={true}
              />
            </ScrollReveal>
            <ProductVisualAnalysisCards
              overview={data}
              onNavigate={onNavigate}
              showSecondaryDigest={false}
            />
          </div>
        </div>
      )}

      {(persona === 'EXECUTIVE' || persona === 'BRANCH_MANAGER') && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
          <div className="flex flex-col gap-5 xl:col-span-8">
            <ScrollReveal>
              <SalesAnalyticsCard
                data={data.sales_analytics}
                period={data.period}
                periodLabel={data.period_label}
                persona={persona}
                canViewProfit={caps.can_view_profit}
                canViewTaxDetail={caps.can_view_tax_detail}
              />
            </ScrollReveal>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <TopSalesByCountryCard
                  countries={data.top_countries || []}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <LastActivityCard
                  activities={data.recent_activity || []}
                  onRefresh={() => refetch()}
                  canViewGL={caps.can_view_gl}
                  periodLabel={data.period_label}
                />
              </ScrollReveal>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
              <ScrollReveal className="h-full" delayMs={40}>
                <PendingHeldOrdersCard
                  heldOrders={data.held_orders || []}
                  onOpenPOS={onOpenPOS}
                  canUsePOS={caps.can_view_pos}
                />
              </ScrollReveal>
              <ScrollReveal className="h-full" delayMs={90}>
                <PaymentMixCard items={data.payment_mix || []} periodLabel={data.period_label} />
              </ScrollReveal>
            </div>

            <ScrollReveal delayMs={60}>
              <ProductSalesTableCard
                products={data.product_sales || []}
                showValuation={caps.can_view_profit}
                defaultView="table"
                periodLabel={data.period_label}
              />
            </ScrollReveal>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-4">
            <KPICardsStack overview={data} />
            <ProductVisualAnalysisCards overview={data} onNavigate={onNavigate} />
          </div>
        </div>
      )}

      {persona === 'LIMITED' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
          <div className="flex flex-col gap-5 xl:col-span-8">
            <ScrollReveal>
              <SalesAnalyticsCard
                data={data.sales_analytics}
                period={data.period}
                periodLabel={data.period_label}
                persona={persona}
                canViewProfit={false}
                canViewTaxDetail={false}
              />
            </ScrollReveal>

            <ScrollReveal delayMs={60}>
              <ProductSalesTableCard
                products={data.product_sales || []}
                showValuation={false}
                defaultView="grid"
                periodLabel={data.period_label}
              />
            </ScrollReveal>
          </div>

          <div className="flex flex-col gap-4 xl:col-span-4">
            <KPICardsStack overview={data} />
            <ProductVisualAnalysisCards overview={data} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </div>
  );
}
