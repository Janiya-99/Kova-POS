import { CheckCircle2, Landmark, ShieldCheck } from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { Badge } from '@/components/ui/badge';
import { ScrollFadeList } from '@/components/dqnamo/ScrollFadeList';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel, formatDisplayText } from '@/lib/formatLabel';
import type { GLSummary, JournalEntrySummary, TaxBreakdownItem } from '../types';

interface GLJournalsOverviewCardProps {
  glSummary?: GLSummary;
  recentJournals: JournalEntrySummary[];
  taxBreakdown: TaxBreakdownItem[];
  periodLabel: string;
  onNavigate?: (route: AppRoute) => void;
}

export function GLJournalsOverviewCard({
  glSummary,
  recentJournals,
  taxBreakdown,
  periodLabel,
  onNavigate,
}: GLJournalsOverviewCardProps) {
  const { formatMoney } = useCurrency();

  return (
    <section
      className="zona-card flex h-full flex-col justify-between p-6"
      data-testid="gl-journals-overview-card"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold tracking-[-0.01em] text-ink">
            Double-Entry GL &amp; Tax Ledger
          </h3>
          <p className="text-[11px] text-ink-muted">
            {periodLabel} balanced journals •{' '}
            <strong className="text-ink">
              {glSummary?.current_fiscal_period_name || 'Current Fiscal Period'}
            </strong>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="positive" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            DR = CR
          </Badge>
          {glSummary && (
            <Badge variant="outline" className="tabular-nums">
              {glSummary.period_journal_count} entries
            </Badge>
          )}
        </div>
      </div>

      {taxBreakdown.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {taxBreakdown.map((tax, idx) => (
            <div
              key={`${tax.tax_name}-${idx}`}
              className="flex items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted px-2.5 py-1.5 text-[11px] tabular-nums"
            >
              <span className="font-semibold text-ink">{tax.tax_name}</span>
              <span className="text-ink-muted">({Number(tax.rate_percent)}%)</span>
              <span className="font-bold text-accent">{formatMoney(tax.tax_collected)}</span>
            </div>
          ))}
        </div>
      )}

      {recentJournals.length === 0 ? (
        <div className="my-4 flex flex-1 flex-col items-center justify-center rounded-[var(--theme-radius-inner)] bg-surface-muted/70 p-6 text-center">
          <p className="text-xs font-semibold text-ink">No GL journals posted in {periodLabel.toLowerCase()}</p>
          <p className="mt-1 text-[11px] text-ink-muted">
            POS checkouts, refunds, and GRN stock intakes post automatically.
          </p>
        </div>
      ) : (
        <ScrollFadeList maxHeightClass="max-h-[240px]" className="space-y-2 pr-1">
          {recentJournals.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] bg-surface-muted px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-ink">
                    {entry.entry_number}
                  </span>
                  <Badge variant="lavender" className="px-1.5 py-0 text-[9.5px]">
                    {formatDisplayLabel(entry.source_type)}
                  </Badge>
                  {entry.is_balanced && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" />
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-muted">{formatDisplayText(entry.description)}</p>
              </div>
              <div className="text-right shrink-0 tabular-nums">
                <p className="text-xs font-bold text-ink">{formatMoney(entry.total_debit)}</p>
                <p className="text-[10px] text-ink-muted">{entry.entry_date}</p>
              </div>
            </div>
          ))}
        </ScrollFadeList>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme/70 pt-3">
        <span className="text-[11px] text-ink-muted tabular-nums">
          Total debits:{' '}
          <strong className="text-ink">
            {formatMoney(glSummary?.period_total_debits || '0.00')}
          </strong>
        </span>
        {onNavigate && (
          <DynamicButton
            variant="obsidian"
            icon={<Landmark className="h-3.5 w-3.5" />}
            onClick={() => onNavigate('/accounting')}
            className="min-h-[34px] px-3 py-1.5 text-xs"
            data-testid="open-gl-ledger-btn"
          >
            Inspect GL Ledger
          </DynamicButton>
        )}
      </div>
    </section>
  );
}

