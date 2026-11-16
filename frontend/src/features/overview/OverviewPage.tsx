import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Shield, Store } from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { apiFetch } from '@/lib/api';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { OverviewBentoSkeleton } from '@/components/skeletons/OverviewBentoSkeleton';
import { ScrollReveal } from '@/components/dqnamo/ScrollReveal';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
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

export function OverviewPage({ onOpenPOS, onNavigate }: OverviewPageProps) {
  const { context, branches } = useAuthStore();
  const { t } = useT();
  const [period, setPeriod] = React.useState<OverviewPeriod>('month');
  const canMultiBranch = isMultiBranchRole(context?.role_code);
  const [branchScopeMode, setBranchScopeMode] = React.useState<'ALL' | 'BRANCH'>('ALL');

  const branchQuery = !canMultiBranch
    ? context?.branch_id
      ? `&branch_id=${encodeURIComponent(context.branch_id)}`
      : ''
    : branchScopeMode === 'BRANCH' && context?.branch_id
    ? `&branch_id=${encodeURIComponent(context.branch_id)}`
    : '';

  const effectiveScopeKey = !canMultiBranch
    ? context?.branch_id || ''
    : branchScopeMode === 'ALL'
    ? 'ALL'
    : context?.branch_id || '';

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['overview', context?.business_id, context?.role_code, effectiveScopeKey, period],
    queryFn: () =>
      apiFetch<OverviewResponse>(`/api/v1/overview?period=${period}${branchQuery}`),
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

  return (
    <div className="space-y-5" data-testid="overview-page" data-persona={persona}>
      {/* Role Quick Functions + Period Scope Bar */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="zona-glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold text-ink"
            data-testid="overview-role-scope"
          >
            <Shield className="h-3.5 w-3.5 text-accent shrink-0" />
            <span>{formatDisplayLabel(data.role_name || data.role_code)}</span>
            <span className="text-ink-muted">•</span>
            <span className="text-ink-muted">{data.branch_scope}</span>
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
          {canMultiBranch && (
            <div
              className="zona-nav-glass inline-flex items-center gap-1 rounded-full p-1"
              role="group"
              aria-label="Overview branch scope"
              data-testid="overview-branch-scope-toggle"
            >
              <button
                type="button"
                onClick={() => setBranchScopeMode('ALL')}
                data-testid="overview-scope-all"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  branchScopeMode === 'ALL'
                    ? 'bg-obsidian text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                All Branches
              </button>
              <button
                type="button"
                onClick={() => setBranchScopeMode('BRANCH')}
                data-testid="overview-scope-branch"
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  branchScopeMode === 'BRANCH'
                    ? 'bg-obsidian text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {branches.find((b) => b.id === context?.branch_id)?.name || 'Current Branch'}
              </button>
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
