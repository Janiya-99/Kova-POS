import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Search, Crown, ShieldCheck, Pencil } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  SortableTableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { CustomerFormSheet } from '../pos/CustomerFormSheet';
import type { POSCustomer } from '../pos/types';
import { apiFetch } from '@/lib/api';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuthStore } from '@/store/authStore';

interface CRMCustomerRow extends POSCustomer {
  tier?: string;
  credit_enabled?: boolean;
  credit_limit?: string;
  is_walk_in?: boolean;
}

export function CustomersPage() {
  const { context } = useAuthStore();
  const queryClient = useQueryClient();
  const { formatMoney } = useCurrency();

  const [search, setSearch] = React.useState('');
  const [tierFilter, setTierFilter] = React.useState('ALL');
  const [creditFilter, setCreditFilter] = React.useState<'ALL' | 'CREDIT' | 'CASH'>('ALL');
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editingCustomer, setEditingCustomer] = React.useState<CRMCustomerRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', context?.business_id],
    queryFn: () => apiFetch<{ customers: CRMCustomerRow[] }>('/api/v1/customers'),
    enabled: Boolean(context?.business_id),
  });

  const customers = data?.customers || [];
  const getTier = React.useCallback(
    (c: CRMCustomerRow) => c.tier || c.loyalty_tier || 'Bronze',
    []
  );
  const filtered = React.useMemo(
    () =>
      customers.filter((c) => {
        if (tierFilter !== 'ALL' && getTier(c) !== tierFilter) return false;
        if (creditFilter === 'CREDIT' && !c.credit_enabled) return false;
        if (creditFilter === 'CASH' && c.credit_enabled) return false;
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      }),
    [customers, tierFilter, creditFilter, search, getTier]
  );

  const { sortedItems, sortConfig, requestSort } = useSortableData(
    filtered,
    { key: 'name', dir: 'asc' },
    (c, key) => {
      if (key === 'tier') return getTier(c);
      if (key === 'loyalty_points') return Number(c.loyalty_points || 0);
      if (key === 'credit_limit') return c.credit_enabled ? Number(c.credit_limit || 0) : -1;
      return (c as Record<string, any>)[key] ?? '';
    }
  );
  const pagination = usePagination(sortedItems, 8);

  if (isLoading || !data) {
    return (
      <div className="zona-card p-5 space-y-3">
        <Skeleton className="h-9 w-72" />
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const vipCount = customers.filter((c) => getTier(c) === 'Gold' || getTier(c) === 'Silver').length;
  const creditCount = customers.filter((c) => c.credit_enabled).length;
  const totalPoints = customers.reduce((sum, c) => sum + Number(c.loyalty_points || 0), 0);

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="zona-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Registered Members</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{customers.length}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">CRM customer profiles</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent-soft text-accent-soft-fg">
            <Users className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Gold & Silver VIPs</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{vipCount}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">Priority tier accounts</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-accent">
            <Crown className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Credit Lines Enabled</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">{creditCount}</p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">Approved credit terms</p>
          </div>
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-[#22C55E]/15 text-[#22C55E]">
            <ShieldCheck className="h-4 w-4" />
          </span>
        </div>

        <div className="zona-card p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-ink-muted">Loyalty Points</p>
            <p className="mt-1 text-xl font-bold text-ink tabular-nums">
              {totalPoints.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[10.5px] text-ink-muted">Active member balance</p>
          </div>
          <Badge variant="lavender">CRM</Badge>
        </div>
      </section>

      <section className="zona-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer name, phone, or email..."
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {['ALL', 'Gold', 'Silver', 'Bronze', 'Standard'].map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => setTierFilter(tier)}
                className={`rounded-[var(--theme-radius-badge)] px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                  tierFilter === tier
                    ? 'bg-accent text-accent-fg'
                    : 'bg-surface-muted text-ink-muted hover:text-ink'
                }`}
              >
                {tier === 'ALL' ? 'All Tiers' : tier}
              </button>
            ))}

            <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5 text-[11px]">
              {(
                [
                  { id: 'ALL', label: 'All Terms' },
                  { id: 'CREDIT', label: 'Credit Line' },
                  { id: 'CASH', label: 'Cash Only' },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCreditFilter(c.id)}
                  className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2 py-1 font-semibold transition cursor-pointer ${
                    creditFilter === c.id
                      ? 'bg-accent text-accent-fg shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="lavender"
              size="sm"
              data-testid="add-customer-btn"
              onClick={() => {
                setEditingCustomer(null);
                setSheetOpen(true);
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Customer
            </Button>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                sortKey="name"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Customer
              </SortableTableHead>
              <SortableTableHead
                sortKey="phone"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Phone
              </SortableTableHead>
              <SortableTableHead
                sortKey="email"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Email
              </SortableTableHead>
              <SortableTableHead
                sortKey="tier"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
              >
                Tier
              </SortableTableHead>
              <SortableTableHead
                sortKey="loyalty_points"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
                align="right"
              >
                Points
              </SortableTableHead>
              <SortableTableHead
                sortKey="credit_limit"
                activeSortKey={sortConfig?.key}
                sortDir={sortConfig?.dir}
                onSort={requestSort}
                align="right"
              >
                Credit Line
              </SortableTableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.pagedItems.map((cust) => {
              const initials = cust.name
                .split(/\s+/)
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <TableRow key={cust.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={cust.avatar_url} alt={cust.name} />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-ink">{cust.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-xs text-ink-muted">
                    {cust.phone || '—'}
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">{cust.email || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={getTier(cust) === 'Gold' ? 'accent' : 'lavender'}>
                      {getTier(cust)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {Number(cust.loyalty_points || 0).toLocaleString()} pts
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {cust.credit_enabled ? (
                      <Badge variant="positive">
                        {formatMoney(cust.credit_limit || 0)}
                      </Badge>
                    ) : (
                      <span className="text-xs text-ink-muted">Cash/Card</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="info"
                      size="xs"
                      onClick={() => {
                        setEditingCustomer(cust);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {pagination.pagedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                  No customers match your filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
          totalPages={pagination.totalPages}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          itemLabel="customers"
          testIdPrefix="customers-pagination"
        />
      </section>

      <CustomerFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        customer={editingCustomer}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: ['customers', context?.business_id] });
          queryClient.invalidateQueries({
            queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
          });
        }}
      />
    </div>
  );
}
