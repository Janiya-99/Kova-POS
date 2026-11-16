import * as React from 'react';
import {
  Building2,
  CheckCircle2,
  CreditCard,
  Layers3,
  MapPin,
  Monitor,
  Package,
  QrCode,
  Sliders,
  Store,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency';
import { formatDisplayLabel } from '@/lib/formatLabel';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import type {
  BranchSalesPerformanceItem,
  CompanyOverviewSummary,
  TerminalSalesPerformanceItem,
} from '../types';

interface CompanyBranchTerminalOverviewCardProps {
  company?: CompanyOverviewSummary;
  branches: BranchSalesPerformanceItem[];
  terminals: TerminalSalesPerformanceItem[];
  periodLabel: string;
  canViewProfit: boolean;
  canManageSettings: boolean;
  selectedBranchId: string; // 'ALL' or branch UUID
  selectedTerminalId: string; // 'ALL' or terminal UUID
  onSelectBranch: (branchId: string) => void;
  onSelectTerminal: (terminalId: string, branchId?: string) => void;
  onLaunchTerminalPOS?: (branchId: string, terminalId: string) => void;
  onNavigateSettings?: (tab: string) => void;
  onNavigate?: (route: AppRoute) => void;
}

export function CompanyBranchTerminalOverviewCard({
  company,
  branches,
  terminals,
  periodLabel,
  canViewProfit,
  canManageSettings,
  selectedBranchId,
  selectedTerminalId,
  onSelectBranch,
  onSelectTerminal,
  onLaunchTerminalPOS,
  onNavigateSettings,
}: CompanyBranchTerminalOverviewCardProps) {
  const [activeTab, setActiveTab] = React.useState<'branches' | 'terminals' | 'company'>('branches');

  if (!company && branches.length === 0 && terminals.length === 0) {
    return null;
  }

  return (
    <section
      className="zona-card p-4 sm:p-5 space-y-4"
      data-testid="company-branch-terminal-overview-card"
    >
      {/* Top Header Strip: Company Identity + Tab Switcher + Quick Settings */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between border-b border-border-theme pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent/15 text-accent">
              <Building2 className="h-4 w-4" />
            </span>
            <h2 className="text-[14px] sm:text-[15px] font-bold tracking-tight text-ink">
              {company?.trade_name || company?.business_name || 'Enterprise'} — Multi-Branch &amp; Terminal Command Center
            </h2>
            {company?.industry_profile && (
              <Badge variant="lavender" className="text-[10px] uppercase">
                {formatDisplayLabel(company.industry_profile)} Vertical
              </Badge>
            )}
            {company?.tax_registration_no && (
              <Badge variant="outline" className="font-mono text-[10px]">
                TIN: {company.tax_registration_no}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-ink-muted">
            Consolidated company footprint, branch-wise performance, and POS terminal-wise sales telemetry ({periodLabel}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="zona-nav-glass inline-flex items-center gap-1 rounded-full p-1"
            role="tablist"
            aria-label="Enterprise breakdown view"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'branches'}
              onClick={() => setActiveTab('branches')}
              data-testid="overview-tab-branches"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'branches'
                  ? 'bg-obsidian text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Store className="h-3.5 w-3.5" />
              <span>Branch-Wise ({branches.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'terminals'}
              onClick={() => setActiveTab('terminals')}
              data-testid="overview-tab-terminals"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'terminals'
                  ? 'bg-obsidian text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Terminal-Wise Sales ({terminals.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'company'}
              onClick={() => setActiveTab('company')}
              data-testid="overview-tab-company"
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                activeTab === 'company'
                  ? 'bg-obsidian text-white shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Layers3 className="h-3.5 w-3.5" />
              <span>Company Details</span>
            </button>
          </div>

          {canManageSettings && onNavigateSettings && (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onNavigateSettings('branches')}
                data-testid="overview-manage-branches-btn"
              >
                <Store className="h-3 w-3 text-accent" />
                Branches &amp; Terminals
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onNavigateSettings('rbac')}
                data-testid="overview-manage-staff-btn"
              >
                <Users className="h-3 w-3 text-accent" />
                Staff Scope
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Enterprise KPI Strip (6 Symmetrical Summary Tiles) */}
      {company && (
        <div
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6"
          data-testid="company-footprint-strip"
        >
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>Branches &amp; Stores</span>
              <Store className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="mt-1 text-base font-extrabold text-ink tabular-nums">
              {company.active_branches} / {company.total_branches}
            </p>
            <p className="text-[10px] text-ink-muted">
              {company.total_warehouses} Active Warehouses
            </p>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>POS Terminals</span>
              <Monitor className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="mt-1 text-base font-extrabold text-ink tabular-nums">
              {company.active_terminals} / {company.total_terminals}
            </p>
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {company.open_shift_terminals} Open Shifts Live
            </p>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>Staff &amp; Operators</span>
              <Users className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="mt-1 text-base font-extrabold text-ink tabular-nums">
              {company.active_staff} / {company.total_staff}
            </p>
            <p className="text-[10px] text-ink-muted">
              {company.total_customers} CRM Customers
            </p>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>Catalog &amp; Brands</span>
              <Package className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="mt-1 text-base font-extrabold text-ink tabular-nums">
              {company.active_skus} SKUs
            </p>
            <p className="text-[10px] text-ink-muted">
              {company.total_brands} Brands • {company.total_categories} Categories
            </p>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>FIFO Stock Valuation</span>
              <Layers3 className="h-3.5 w-3.5 text-accent" />
            </div>
            <p className="mt-1 text-sm sm:text-base font-extrabold text-ink tabular-nums truncate">
              {formatCurrency(company.total_fifo_valuation)}
            </p>
            <p className="text-[10px] text-ink-muted">
              {Number(company.total_stock_units || 0).toLocaleString()} Units On Hand
            </p>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3">
            <div className="flex items-center justify-between text-[10.5px] font-semibold text-ink-muted">
              <span>Period Net Sales</span>
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <p className="mt-1 text-sm sm:text-base font-extrabold text-ink tabular-nums truncate">
              {formatCurrency(company.period_paid_revenue)}
            </p>
            <p className="text-[10px] text-ink-muted">
              {company.period_paid_orders.toLocaleString()} Paid Orders ({periodLabel})
            </p>
          </div>
        </div>
      )}

      {/* TAB 1: Branch-Wise Sales & Operational Breakdown */}
      {activeTab === 'branches' && (
        <div className="space-y-3" data-testid="overview-branch-sales-panel">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3 items-stretch">
            {branches.map((br) => {
              const isSelected = selectedBranchId === br.branch_id;
              const shareNum = Math.min(100, Math.max(0, parseFloat(br.revenue_share_pct || '0')));
              return (
                <div
                  key={br.branch_id}
                  data-testid={`branch-perf-card-${br.branch_code}`}
                  className={`flex flex-col justify-between rounded-[var(--theme-radius-inner)] border p-4 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent-soft/20 ring-1 ring-accent'
                      : 'border-border-theme bg-surface-muted/45 hover:border-accent/50'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="default" className="font-mono text-[10px]">
                            {br.branch_code}
                          </Badge>
                          <h3 className="text-xs sm:text-[13px] font-bold text-ink truncate">
                            {br.branch_name}
                          </h3>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-ink-muted">
                          <MapPin className="h-3 w-3 shrink-0 text-accent" />
                          <span className="truncate">
                            {br.city ? `${br.city}, ` : ''}
                            {br.country_name}
                          </span>
                        </p>
                      </div>
                      <Badge variant={br.is_active ? 'positive' : 'outline'} className="shrink-0">
                        {br.open_shift_count > 0
                          ? `${br.open_shift_count}/${br.active_terminal_count} Live`
                          : `${br.active_terminal_count} POS`}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-[var(--theme-radius-control)] bg-surface/85 p-2.5 border border-border-theme/70">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          Period Revenue
                        </span>
                        <p className="text-sm font-extrabold text-ink tabular-nums">
                          {formatCurrency(br.paid_revenue)}
                        </p>
                        <span className="text-[10px] text-ink-muted">
                          {br.paid_orders.toLocaleString()} orders • {br.units_sold.toLocaleString()} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                          {canViewProfit ? 'Gross Profit & Margin' : 'Average Ticket (AOV)'}
                        </span>
                        <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {canViewProfit && br.gross_profit
                            ? formatCurrency(br.gross_profit)
                            : formatCurrency(br.average_order_value)}
                        </p>
                        <span className="text-[10px] text-ink-muted">
                          {canViewProfit && br.margin_pct
                            ? `${br.margin_pct}% Margin • Tax ${formatCurrency(br.tax_total)}`
                            : `Tax ${formatCurrency(br.tax_total)}`}
                        </span>
                      </div>
                    </div>

                    {/* Revenue Share Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10.5px]">
                        <span className="font-semibold text-ink-muted">Company Revenue Share</span>
                        <span className="font-bold text-ink tabular-nums">{br.revenue_share_pct}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${shareNum}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10.5px] text-ink-muted pt-0.5">
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/65 px-2 py-1">
                        <span className="block text-[9.5px] uppercase">FIFO Stock</span>
                        <strong className="text-ink tabular-nums">
                          {Number(br.fifo_stock_units || 0).toLocaleString()} u
                        </strong>
                      </div>
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/65 px-2 py-1">
                        <span className="block text-[9.5px] uppercase">Held Bills</span>
                        <strong className="text-ink tabular-nums">{br.held_bill_count}</strong>
                      </div>
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/65 px-2 py-1">
                        <span className="block text-[9.5px] uppercase">Staff</span>
                        <strong className="text-ink tabular-nums">{br.staff_count} users</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme/70 pt-2.5">
                    <span className="text-[10.5px] font-semibold text-ink-muted truncate">
                      Val: {formatCurrency(br.fifo_valuation)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="xs"
                        variant={isSelected ? 'default' : 'lavender'}
                        onClick={() => onSelectBranch(isSelected ? 'ALL' : br.branch_id)}
                        data-testid={`branch-filter-btn-${br.branch_code}`}
                      >
                        {isSelected ? 'Showing Branch (Reset)' : 'Filter Branch'}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Terminal-Wise Sales & Register Telemetry */}
      {activeTab === 'terminals' && (
        <div className="space-y-3" data-testid="overview-terminal-sales-panel">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-4 items-stretch">
            {terminals.map((tm) => {
              const isSelected = selectedTerminalId === tm.terminal_id;
              const isOpen = tm.shift_status === 'OPEN';
              return (
                <div
                  key={tm.terminal_id}
                  data-testid={`terminal-perf-card-${tm.terminal_code}`}
                  className={`flex flex-col justify-between rounded-[var(--theme-radius-inner)] border p-3.5 transition-all ${
                    isSelected
                      ? 'border-accent bg-accent-soft/20 ring-1 ring-accent'
                      : 'border-border-theme bg-surface-muted/45 hover:border-accent/50'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="default" className="font-mono text-[10px]">
                            {tm.terminal_code}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {tm.branch_code}
                          </Badge>
                        </div>
                        <h3 className="mt-1 text-xs font-bold text-ink truncate">
                          {tm.terminal_name}
                        </h3>
                        <p className="text-[10px] text-ink-muted truncate">
                          {tm.branch_name} • Cashier: <strong className="text-ink">{tm.active_cashier_name}</strong>
                        </p>
                      </div>
                      <Badge variant={isOpen ? 'positive' : 'outline'} className="shrink-0 text-[10px]">
                        {isOpen ? 'SHIFT OPEN' : 'CLOSED'}
                      </Badge>
                    </div>

                    <div className="rounded-[var(--theme-radius-control)] border border-border-theme/70 bg-surface/85 p-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase text-ink-muted">
                          Terminal Sales
                        </span>
                        <span className="text-[10px] font-bold text-accent tabular-nums">
                          {tm.revenue_share_pct}% share
                        </span>
                      </div>
                      <p className="text-sm font-extrabold text-ink tabular-nums">
                        {formatCurrency(tm.paid_revenue)}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-ink-muted">
                        <span>{tm.paid_orders.toLocaleString()} orders ({tm.units_sold} u)</span>
                        <span>AOV: {formatCurrency(tm.average_order_value)}</span>
                      </div>
                    </div>

                    {/* Tender Breakdown (Cash / Card / QR) */}
                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/70 px-2 py-1.5">
                        <span className="flex items-center gap-1 text-ink-muted">
                          <Wallet className="h-2.5 w-2.5 text-emerald-500" />
                          Cash
                        </span>
                        <strong className="mt-0.5 block truncate text-ink tabular-nums">
                          {formatCurrency(tm.cash_sales)}
                        </strong>
                      </div>
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/70 px-2 py-1.5">
                        <span className="flex items-center gap-1 text-ink-muted">
                          <CreditCard className="h-2.5 w-2.5 text-accent" />
                          Card
                        </span>
                        <strong className="mt-0.5 block truncate text-ink tabular-nums">
                          {formatCurrency(tm.card_sales)}
                        </strong>
                      </div>
                      <div className="rounded-[var(--theme-radius-control)] bg-surface/70 px-2 py-1.5">
                        <span className="flex items-center gap-1 text-ink-muted">
                          <QrCode className="h-2.5 w-2.5 text-sky-500" />
                          QR/Other
                        </span>
                        <strong className="mt-0.5 block truncate text-ink tabular-nums">
                          {formatCurrency(tm.qr_other_sales)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-ink-muted">
                      <span>
                        Last Bill:{' '}
                        <strong className="font-mono text-ink">
                          {tm.last_invoice_number || 'None'}
                        </strong>
                      </span>
                      <span>Held: {tm.held_bill_count}</span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-1.5 border-t border-border-theme/70 pt-2.5">
                    <Button
                      type="button"
                      size="xs"
                      variant={isSelected ? 'default' : 'outline'}
                      onClick={() =>
                        onSelectTerminal(isSelected ? 'ALL' : tm.terminal_id, tm.branch_id)
                      }
                      data-testid={`terminal-filter-btn-${tm.terminal_code}`}
                    >
                      {isSelected ? 'Reset Filter' : 'Filter Sales'}
                    </Button>
                    {onLaunchTerminalPOS && (
                      <Button
                        type="button"
                        size="xs"
                        variant="lavender"
                        onClick={() => onLaunchTerminalPOS(tm.branch_id, tm.terminal_id)}
                        data-testid={`terminal-launch-pos-${tm.terminal_code}`}
                      >
                        Open POS
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Full Company Details Overview */}
      {activeTab === 'company' && company && (
        <div
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
          data-testid="overview-company-details-panel"
        >
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <Building2 className="h-4 w-4 text-accent" />
              <span>Corporate &amp; Tax Identity</span>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Company Name:</dt>
                <dd className="font-bold text-ink text-right">{company.business_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Trade / Brand Name:</dt>
                <dd className="font-semibold text-ink text-right">{company.trade_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Legal Entity:</dt>
                <dd className="font-semibold text-ink text-right">{company.legal_name || company.business_name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Tax Registration (TIN/VAT):</dt>
                <dd className="font-mono font-semibold text-ink">{company.tax_registration_no || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Base Currency &amp; Vertical:</dt>
                <dd className="font-semibold text-ink">
                  {company.base_currency} • {formatDisplayLabel(company.industry_profile)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Multi-Branch &amp; Terminal Topology</span>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Registered Branches:</dt>
                <dd className="font-bold text-ink tabular-nums">
                  {company.active_branches} Active / {company.total_branches} Total
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Stock Warehouses:</dt>
                <dd className="font-semibold text-ink tabular-nums">{company.total_warehouses} Linked</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">POS Register Terminals:</dt>
                <dd className="font-bold text-ink tabular-nums">
                  {company.active_terminals} Active ({company.open_shift_terminals} Open Shifts)
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Authorized Staff Accounts:</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {company.active_staff} Active / {company.total_staff} Total
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">CRM Customers &amp; Suppliers:</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {company.total_customers} Customers • {company.total_suppliers} Suppliers
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <Sliders className="h-4 w-4 text-accent" />
              <span>Financial &amp; Inventory Snapshot ({periodLabel})</span>
            </div>
            <dl className="space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Period Settled Revenue:</dt>
                <dd className="font-extrabold text-ink tabular-nums">
                  {formatCurrency(company.period_paid_revenue)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Period Tax Collected:</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {formatCurrency(company.period_tax_collected)}
                </dd>
              </div>
              {canViewProfit && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink-muted">Period Gross Profit:</dt>
                  <dd className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatCurrency(company.period_gross_profit)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">FIFO Inventory Valuation:</dt>
                <dd className="font-bold text-ink tabular-nums">
                  {formatCurrency(company.total_fifo_valuation)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink-muted">Active Brands &amp; SKUs:</dt>
                <dd className="font-semibold text-ink tabular-nums">
                  {company.total_brands} Brands • {company.active_skus} SKUs
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
