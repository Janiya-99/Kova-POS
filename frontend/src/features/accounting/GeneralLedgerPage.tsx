import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Lock, LockOpen, Calendar as CalendarIcon, Loader2, ArrowUpRight, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  SortableTableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { parseLocalYMD } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { HoldToConfirm } from '@/components/dqnamo/HoldToConfirm';
import { AccountingSkeleton } from '@/components/skeletons/AccountingSkeleton';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { confirmDestructiveAction } from '@/lib/swal';
import { useCurrency } from '@/hooks/useCurrency';
import { formatDisplayLabel, formatDisplayText } from '@/lib/formatLabel';
import { toast } from 'sonner';

interface AccountDTO {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface FiscalPeriodDTO {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  is_locked: boolean;
  locked_at?: string | null;
}

interface JournalDTO {
  id: string;
  entry_number: string;
  source_type: string;
  source_id?: string | null;
  description: string;
  entry_date: string;
  total_debit: string | number;
  total_credit: string | number;
}

interface JournalLineDTO {
  id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit: string | number;
  credit: string | number;
  memo: string;
}

interface AccountingResponse {
  accounts: AccountDTO[];
  fiscal_periods: FiscalPeriodDTO[];
  journals: JournalDTO[];
}

export function GeneralLedgerPage() {
  const { context } = useAuthStore();
  const { formatMoney } = useCurrency();
  const { t } = useT();
  const [selectedJournal, setSelectedJournal] = React.useState<JournalDTO | null>(null);
  const [lines, setLines] = React.useState<JournalLineDTO[]>([]);
  const [loadingLines, setLoadingLines] = React.useState(false);
  const [journalSearch, setJournalSearch] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState('ALL');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounting', context?.business_id],
    queryFn: () => apiFetch<AccountingResponse>('/api/v1/accounting'),
  });

  const rawJournals = data?.journals || [];
  const sourceTypes = React.useMemo(
    () => Array.from(new Set(rawJournals.map((j) => j.source_type))).filter(Boolean),
    [rawJournals]
  );
  const filteredJournals = React.useMemo(() => {
    const q = journalSearch.trim().toLowerCase();
    return rawJournals.filter((j) => {
      if (sourceFilter !== 'ALL' && j.source_type !== sourceFilter) return false;
      if (!q) return true;
      return (
        j.entry_number.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.source_type.toLowerCase().includes(q)
      );
    });
  }, [rawJournals, journalSearch, sourceFilter]);

  const { sortedItems: sortedJournals, sortConfig, requestSort } = useSortableData(
    filteredJournals,
    { key: 'entry_date', dir: 'desc' },
    (j, key) => {
      if (key === 'total_debit') return Number(j.total_debit || 0);
      if (key === 'total_credit') return Number(j.total_credit || 0);
      return (j as Record<string, any>)[key] ?? '';
    }
  );
  const journalPagination = usePagination(sortedJournals, 8);

  if (isLoading || !data) {
    return <AccountingSkeleton />;
  }

  const openJournal = async (journal: JournalDTO) => {
    setSelectedJournal(journal);
    setLoadingLines(true);
    setLines([]);
    try {
      const res = await apiFetch<{ lines: JournalLineDTO[] }>(
        `/api/v1/accounting/journals/${journal.id}/lines`
      );
      setLines(res.lines || []);
    } catch (err: any) {
      toast.error(err.message || 'Unable to load journal lines');
    } finally {
      setLoadingLines(false);
    }
  };

  const handleLockPeriod = async (period: FiscalPeriodDTO) => {
    const ok = await confirmDestructiveAction({
      title: 'Lock Fiscal Period?',
      text: 'No transactions can be posted or edited before this date.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Yes, Lock Period',
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/v1/accounting/fiscal-periods/${period.id}/lock`, {
        method: 'POST',
      });
      toast.success(`${period.period_name} permanently locked`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Unable to lock fiscal period');
    }
  };

  const totalDebits = data.journals.reduce((acc, j) => acc + Number(j.total_debit || 0), 0);
  const lockedCount = data.fiscal_periods.filter((p) => p.is_locked).length;

  return (
    <>
      <div className="space-y-5">
        {/* Symmetrical 3-Card Summary Row */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-[var(--theme-radius-card)] border border-border-theme bg-contrast flex flex-col justify-between p-5 text-contrast-fg shadow-[var(--theme-shadow)]">
            <span className="text-[11px] font-semibold text-accent uppercase">{t.accounting.totalDebits}</span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold tabular-nums">{formatMoney(totalDebits)}</p>
            <span className="mt-1.5 text-[11px] opacity-75">Σ Debits = Σ Credits Enforced by PG Trigger</span>
          </div>

          <div className="zona-card flex flex-col justify-between p-5">
            <span className="text-[11px] font-semibold text-ink-muted uppercase">{t.accounting.coaTab}</span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold text-ink tabular-nums">
              {data.accounts.length}
            </p>
            <span className="mt-1.5 text-[11px] font-semibold text-accent">Asset / Liability / Equity / Rev / Exp</span>
          </div>

          <div className="rounded-[var(--theme-radius-card)] border border-border-theme bg-sand flex flex-col justify-between p-5 text-ink shadow-[var(--theme-shadow)]">
            <span className="text-[11px] font-semibold text-ink-muted uppercase">{t.accounting.periodsTab}</span>
            <p className="mt-1.5 text-[20px] sm:text-[22px] font-bold tabular-nums">
              {data.fiscal_periods.length - lockedCount} {t.accounting.open}
            </p>
            <span className="mt-1.5 text-[11px] text-ink-muted">{lockedCount} {t.accounting.locked}</span>
          </div>
        </div>

        {/* Main Accounting Tabs */}
        <section className="zona-card p-6">
          <Tabs defaultValue="journals">
            <TabsList className="mb-5">
              <TabsTrigger value="journals">
                <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                {t.accounting.journalsTab} ({data.journals.length})
              </TabsTrigger>
              <TabsTrigger value="periods">{t.accounting.periodsTab}</TabsTrigger>
              <TabsTrigger value="coa">{t.accounting.coaTab}</TabsTrigger>
            </TabsList>

            <TabsContent value="journals">
              <div className="mb-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                <div className="relative flex-1 max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <Input
                    value={journalSearch}
                    onChange={(e) => setJournalSearch(e.target.value)}
                    placeholder="Filter journal #, source, description..."
                    className="pl-8 h-9 text-xs"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSourceFilter('ALL')}
                    className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                      sourceFilter === 'ALL'
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    All Sources
                  </button>
                  {sourceTypes.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setSourceFilter(st)}
                      className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 font-semibold transition cursor-pointer ${
                        sourceFilter === st
                          ? 'bg-accent text-accent-fg shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {formatDisplayLabel(st)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        sortKey="entry_number"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                      >
                        {t.accounting.entryNumber}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="source_type"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                      >
                        {t.accounting.source}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="description"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                      >
                        {t.accounting.description}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="entry_date"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                      >
                        {t.accounting.date}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="total_debit"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                        align="right"
                      >
                        {t.accounting.debit}
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="total_credit"
                        activeSortKey={sortConfig?.key}
                        sortDir={sortConfig?.dir}
                        onSort={requestSort}
                        align="right"
                      >
                        {t.accounting.credit}
                      </SortableTableHead>
                      <TableHead className="text-right">{t.accounting.action}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {journalPagination.pagedItems.map((j) => (
                      <TableRow
                        key={j.id}
                        onClick={() => openJournal(j)}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-bold tabular-nums">{j.entry_number}</TableCell>
                        <TableCell>
                          <Badge variant="lavender">{formatDisplayLabel(j.source_type)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-ink-muted">
                          {formatDisplayText(j.description)}
                        </TableCell>
                        <TableCell className="text-xs text-ink-muted tabular-nums">
                          {j.entry_date}
                        </TableCell>
                        <TableCell className="text-right font-bold text-[#22C55E] tabular-nums">
                          {formatMoney(j.total_debit)}
                        </TableCell>
                        <TableCell className="text-right font-bold text-accent tabular-nums">
                          {formatMoney(j.total_credit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="info"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openJournal(j);
                            }}
                          >
                            <ArrowUpRight className="h-3 w-3" />
                            {t.common.inspect}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 gap-3 md:hidden">
                {journalPagination.pagedItems.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => openJournal(j)}
                    className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-4 text-left space-y-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink tabular-nums">
                        {j.entry_number}
                      </span>
                      <Badge variant="lavender">{formatDisplayLabel(j.source_type)}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted line-clamp-1">{formatDisplayText(j.description)}</p>
                    <div className="flex justify-between text-xs font-bold tabular-nums">
                      <span className="text-[#22C55E]">DR {formatMoney(j.total_debit)}</span>
                      <span className="text-accent">CR {formatMoney(j.total_credit)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <DataTablePagination
                page={journalPagination.page}
                pageSize={journalPagination.pageSize}
                totalItems={journalPagination.totalItems}
                totalPages={journalPagination.totalPages}
                onPageChange={journalPagination.setPage}
                onPageSizeChange={journalPagination.setPageSize}
                itemLabel="journal entries"
                testIdPrefix="journals-pagination"
              />
            </TabsContent>

            <TabsContent value="periods">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {data.fiscal_periods.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-5"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[13.5px] font-bold text-ink">{p.period_name}</h3>
                        <Badge variant={p.is_locked ? 'negative' : 'positive'}>
                          {p.is_locked ? (
                            <span className="inline-flex items-center gap-1">
                              <Lock className="h-3 w-3" /> Locked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <LockOpen className="h-3 w-3" /> Open
                            </span>
                          )}
                        </Badge>
                      </div>

                      <div className="mt-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-full border border-border-theme bg-surface px-3.5 py-1.5 text-xs font-semibold text-ink shadow-xs cursor-pointer"
                            >
                              <CalendarIcon className="h-3.5 w-3.5 text-accent" />
                              <span className="tabular-nums">
                                {p.start_date} → {p.end_date}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-auto p-2">
                            <Calendar
                              mode="range"
                              selected={{
                                from: parseLocalYMD(p.start_date),
                                to: parseLocalYMD(p.end_date),
                              }}
                              defaultMonth={parseLocalYMD(p.start_date)}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-border-theme">
                      {p.is_locked ? (
                        <p className="text-xs text-ink-muted">
                          Period closed for immutability compliance.
                        </p>
                      ) : (
                        <Can permission="accounting:lock_period">
                          <HoldToConfirm
                            label="Hold to Lock Period"
                            holdingLabel="Locking..."
                            icon={<Lock className="h-3.5 w-3.5" />}
                            onConfirm={() => handleLockPeriod(p)}
                            className="w-full"
                          />
                        </Can>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="coa">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-4"
                  >
                    <div>
                      <p className="text-xs font-bold text-accent tabular-nums">{acc.code}</p>
                      <p className="text-[13px] font-bold text-ink">{acc.name}</p>
                    </div>
                    <Badge variant="outline">{acc.account_type}</Badge>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      {/* Immutable Journal Lines Inspector Sheet */}
      <Sheet open={!!selectedJournal} onOpenChange={(o) => !o && setSelectedJournal(null)}>
        <SheetContent side="right" className="overflow-y-auto">
          {selectedJournal && (
            <>
              <SheetHeader>
                <div className="mb-2">
                  <Badge variant="lavender">{formatDisplayLabel(selectedJournal.source_type)}</Badge>
                </div>
                <SheetTitle>{selectedJournal.entry_number}</SheetTitle>
                <SheetDescription>
                  {formatDisplayText(selectedJournal.description)} • {selectedJournal.entry_date}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-2.5">
                {loadingLines ? (
                  <div className="flex items-center justify-center py-8 text-xs text-ink-muted">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin text-accent" />
                    Loading balanced lines...
                  </div>
                ) : (
                  lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-3.5 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-ink">
                          {line.account_code} • {line.account_name}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">{formatDisplayText(line.memo)}</p>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        {Number(line.debit) > 0 && (
                          <span className="font-bold text-[#22C55E]">
                            DR {formatMoney(line.debit)}
                          </span>
                        )}
                        {Number(line.credit) > 0 && (
                          <span className="font-bold text-accent">
                            CR {formatMoney(line.credit)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
