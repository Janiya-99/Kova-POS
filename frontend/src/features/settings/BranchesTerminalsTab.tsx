import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Cpu,
  Globe,
  Lock,
  MapPin,
  Monitor,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Store,
  Users,
  Warehouse,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import {
  BRANCH_COUNTRY_OPTIONS,
  hasMultiBranchAccess,
  isMultiBranchRole,
  resolveCountryNameFromCode,
} from '@/lib/branchAccess';
import { useAuthStore, type AuthSessionPayload } from '@/store/authStore';

export interface BranchManagementRow {
  id: string;
  business_id: string;
  code: string;
  name: string;
  country_code: string;
  country_name: string;
  city: string;
  address: string;
  is_warehouse: boolean;
  is_active: boolean;
  created_at: string;
  terminal_count: number;
  active_terminal_count: number;
  warehouse_count: number;
  assigned_user_count: number;
}

export interface TerminalManagementRow {
  id: string;
  business_id: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  code: string;
  name: string;
  hardware_serial: string;
  is_active: boolean;
  created_at: string;
}

interface BranchesListResponse {
  branches: BranchManagementRow[];
  can_manage_branches: boolean;
  can_switch_branch: boolean;
}

interface TerminalsListResponse {
  terminals: TerminalManagementRow[];
  can_manage_terminals: boolean;
}

export function BranchesTerminalsTab() {
  const queryClient = useQueryClient();
  const { context, branches, terminals, setSession } = useAuthStore();
  const isOwnerRole = isMultiBranchRole(context?.role_code);
  const canMultiBranch = hasMultiBranchAccess(context, branches.length);

  const [branchSearch, setBranchSearch] = React.useState('');
  const [branchCountryFilter, setBranchCountryFilter] = React.useState('ALL');
  const [terminalSearch, setTerminalSearch] = React.useState('');
  const [terminalBranchFilter, setTerminalBranchFilter] = React.useState(
    canMultiBranch ? 'ALL' : context?.branch_id || 'ALL'
  );

  // Branch create/edit modal state
  const [branchModalOpen, setBranchModalOpen] = React.useState(false);
  const [editingBranch, setEditingBranch] = React.useState<BranchManagementRow | null>(null);
  const [branchCode, setBranchCode] = React.useState('');
  const [branchName, setBranchName] = React.useState('');
  const [branchNameError, setBranchNameError] = React.useState('');
  const [countryCode, setCountryCode] = React.useState('LK');
  const [countrySearch, setCountrySearch] = React.useState('');
  const [branchCity, setBranchCity] = React.useState('');
  const [branchAddress, setBranchAddress] = React.useState('');
  const [isWarehouse, setIsWarehouse] = React.useState(false);
  const [branchActive, setBranchActive] = React.useState(true);
  const [createDefaultTerminal, setCreateDefaultTerminal] = React.useState(true);
  const [initialTerminalCode, setInitialTerminalCode] = React.useState('');
  const [initialTerminalName, setInitialTerminalName] = React.useState('');
  const [savingBranch, setSavingBranch] = React.useState(false);

  // Terminal create/edit modal state
  const [terminalModalOpen, setTerminalModalOpen] = React.useState(false);
  const [editingTerminal, setEditingTerminal] = React.useState<TerminalManagementRow | null>(null);
  const [termBranchId, setTermBranchId] = React.useState('');
  const [termCode, setTermCode] = React.useState('');
  const [termName, setTermName] = React.useState('');
  const [termSerial, setTermSerial] = React.useState('');
  const [termActive, setTermActive] = React.useState(true);
  const [termErrors, setTermErrors] = React.useState<{ branch?: string; name?: string; code?: string }>({});
  const [savingTerminal, setSavingTerminal] = React.useState(false);
  const [switchingKey, setSwitchingKey] = React.useState('');

  React.useEffect(() => {
    if (!canMultiBranch && context?.branch_id) {
      setTerminalBranchFilter(context.branch_id);
    }
  }, [canMultiBranch, context?.branch_id]);

  const { data: branchesResp, isLoading: branchesLoading } = useQuery({
    queryKey: ['company-branches', context?.business_id, context?.role_code, context?.branch_id],
    queryFn: () => apiFetch<BranchesListResponse>('/api/v1/branches'),
    enabled: Boolean(context?.business_id),
  });

  const { data: terminalsResp, isLoading: terminalsLoading } = useQuery({
    queryKey: ['company-terminals', context?.business_id, context?.role_code, context?.branch_id],
    queryFn: () => apiFetch<TerminalsListResponse>('/api/v1/terminals'),
    enabled: Boolean(context?.business_id),
  });

  const branchRows = branchesResp?.branches || [];
  const terminalRows = terminalsResp?.terminals || [];
  const canManageBranches = Boolean(isOwnerRole && (branchesResp?.can_manage_branches ?? true));
  const canManageTerminals = Boolean(isOwnerRole && (terminalsResp?.can_manage_terminals ?? true));

  const syncWorkspaceSession = async (targetBranchId?: string, targetTerminalId?: string) => {
    if (!context?.business_id) return;
    try {
      const payload = await apiFetch<AuthSessionPayload>('/api/v1/auth/switch-context', {
        method: 'POST',
        body: JSON.stringify({
          business_id: context.business_id,
          branch_id: targetBranchId || context.branch_id,
          terminal_id: targetTerminalId || context.terminal_id,
        }),
      });
      setSession(payload);
    } catch {
      // Context refresh may be skipped silently if current branch/terminal unchanged
    }
  };

  const invalidateBranchAndTerminalQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['company-branches'] }),
      queryClient.invalidateQueries({ queryKey: ['company-terminals'] }),
      queryClient.invalidateQueries({ queryKey: ['access-users'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory-fifo'] }),
      queryClient.invalidateQueries({ queryKey: ['overview'] }),
      queryClient.invalidateQueries({ queryKey: ['reports-summary'] }),
    ]);
  };

  const openCreateBranchModal = () => {
    setEditingBranch(null);
    setBranchCode('');
    setBranchName('');
    setBranchNameError('');
    setCountryCode('LK');
    setCountrySearch('');
    setBranchCity('');
    setBranchAddress('');
    setIsWarehouse(false);
    setBranchActive(true);
    setCreateDefaultTerminal(true);
    setInitialTerminalCode('');
    setInitialTerminalName('');
    setBranchModalOpen(true);
  };

  const openEditBranchModal = (b: BranchManagementRow) => {
    setEditingBranch(b);
    setBranchCode(b.code);
    setBranchName(b.name);
    setBranchNameError('');
    setCountryCode(b.country_code || 'LK');
    setCountrySearch('');
    setBranchCity(b.city || '');
    setBranchAddress(b.address || '');
    setIsWarehouse(b.is_warehouse);
    setBranchActive(b.is_active);
    setCreateDefaultTerminal(false);
    setInitialTerminalCode('');
    setInitialTerminalName('');
    setBranchModalOpen(true);
  };

  const openCreateTerminalModal = (presetBranchId?: string) => {
    const defaultBr =
      presetBranchId ||
      (terminalBranchFilter !== 'ALL' ? terminalBranchFilter : '') ||
      context?.branch_id ||
      branchRows[0]?.id ||
      '';
    const matchedBranch = branchRows.find((b) => b.id === defaultBr);
    const nextSeq =
      terminalRows.filter((t) => t.branch_id === defaultBr).length + 1;
    const padded = String(nextSeq).padStart(2, '0');
    const autoCode = matchedBranch ? `${matchedBranch.code}-POS${padded}` : '';

    setEditingTerminal(null);
    setTermBranchId(defaultBr);
    setTermCode(autoCode);
    setTermName(matchedBranch ? `${matchedBranch.name} POS #${padded}` : '');
    setTermSerial(autoCode ? `ZPRO-${autoCode}` : '');
    setTermActive(true);
    setTermErrors({});
    setTerminalModalOpen(true);
  };

  const openEditTerminalModal = (t: TerminalManagementRow) => {
    setEditingTerminal(t);
    setTermBranchId(t.branch_id);
    setTermCode(t.code);
    setTermName(t.name);
    setTermSerial(t.hardware_serial || '');
    setTermActive(t.is_active);
    setTermErrors({});
    setTerminalModalOpen(true);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      setBranchNameError('Branch name is required');
      toast.error('Branch name is required');
      return;
    }
    setBranchNameError('');
    setSavingBranch(true);
    try {
      const payload = {
        code: branchCode.trim().toUpperCase(),
        name: branchName.trim(),
        country_code: countryCode,
        country_name: resolveCountryNameFromCode(countryCode),
        city: branchCity.trim(),
        address: branchAddress.trim(),
        is_warehouse: isWarehouse,
        is_active: branchActive,
        create_default_terminal: !editingBranch ? createDefaultTerminal : undefined,
        initial_terminal_code: !editingBranch && createDefaultTerminal ? initialTerminalCode.trim().toUpperCase() : '',
        initial_terminal_name: !editingBranch && createDefaultTerminal ? initialTerminalName.trim() : '',
      };

      if (editingBranch) {
        await apiFetch(`/api/v1/branches/${editingBranch.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated branch ${branchName.trim()}`);
      } else {
        await apiFetch('/api/v1/branches', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created branch ${branchName.trim()} & linked warehouse`);
      }

      setBranchModalOpen(false);
      await invalidateBranchAndTerminalQueries();
      await syncWorkspaceSession();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save branch');
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSaveTerminal = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { branch?: string; name?: string; code?: string } = {};
    if (!termBranchId) {
      errs.branch = 'Assigned branch is required';
    }
    if (!termName.trim()) {
      errs.name = 'Terminal name is required';
    }
    if (!termCode.trim()) {
      errs.code = 'Terminal code is required';
    }
    if (Object.keys(errs).length > 0) {
      setTermErrors(errs);
      toast.error(errs.branch || errs.name || errs.code || 'Please complete required terminal fields');
      return;
    }
    setTermErrors({});
    setSavingTerminal(true);
    try {
      const payload = {
        branch_id: termBranchId,
        code: termCode.trim().toUpperCase(),
        name: termName.trim(),
        hardware_serial: termSerial.trim(),
        is_active: termActive,
      };
      if (editingTerminal) {
        await apiFetch(`/api/v1/terminals/${editingTerminal.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated terminal ${termName.trim()}`);
      } else {
        await apiFetch('/api/v1/terminals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created POS terminal ${termName.trim()}`);
      }
      setTerminalModalOpen(false);
      await invalidateBranchAndTerminalQueries();
      await syncWorkspaceSession();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save POS terminal');
    } finally {
      setSavingTerminal(false);
    }
  };

  const toggleTerminalActive = async (row: TerminalManagementRow, nextActive: boolean) => {
    try {
      await apiFetch(`/api/v1/terminals/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          branch_id: row.branch_id,
          code: row.code,
          name: row.name,
          hardware_serial: row.hardware_serial,
          is_active: nextActive,
        }),
      });
      toast.success(`${row.name} ${nextActive ? 'activated' : 'paused'}`);
      await invalidateBranchAndTerminalQueries();
      await syncWorkspaceSession();
    } catch (err: any) {
      toast.error(err.message || 'Unable to update terminal status');
    }
  };

  const handleSwitchBranchOrTerminal = async (targetBranchId: string, targetTerminalId?: string, label?: string) => {
    if (!context?.business_id) return;
    const key = `${targetBranchId}:${targetTerminalId || ''}`;
    setSwitchingKey(key);
    try {
      const firstBranchTerminal = terminalRows.find(
        (t) => t.branch_id === targetBranchId && t.is_active
      );
      const payload = await apiFetch<AuthSessionPayload>('/api/v1/auth/switch-context', {
        method: 'POST',
        body: JSON.stringify({
          business_id: context.business_id,
          branch_id: targetBranchId,
          terminal_id: targetTerminalId || firstBranchTerminal?.id || '',
        }),
      });
      setSession(payload);
      await invalidateBranchAndTerminalQueries();
      const switchedBranchName =
        payload.branches?.find((b) => b.id === payload.context.branch_id)?.name || 'selected branch';
      toast.success(`Switched workspace context to ${label || switchedBranchName}`);
    } catch (err: any) {
      toast.error(err.message || 'Context switch blocked by role policy');
    } finally {
      setSwitchingKey('');
    }
  };

  const availableCountries = React.useMemo(() => {
    const map = new Map<string, string>();
    branchRows.forEach((b) => {
      if (b.country_code) map.set(b.country_code, b.country_name || b.country_code);
    });
    return Array.from(map.entries());
  }, [branchRows]);

  const filteredBranches = React.useMemo(() => {
    const q = branchSearch.trim().toLowerCase();
    return branchRows.filter((b) => {
      if (branchCountryFilter !== 'ALL' && b.country_code !== branchCountryFilter) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.country_name.toLowerCase().includes(q)
      );
    });
  }, [branchRows, branchSearch, branchCountryFilter]);

  const filteredTerminals = React.useMemo(() => {
    const q = terminalSearch.trim().toLowerCase();
    return terminalRows.filter((t) => {
      if (terminalBranchFilter !== 'ALL' && t.branch_id !== terminalBranchFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        t.branch_name.toLowerCase().includes(q) ||
        t.hardware_serial.toLowerCase().includes(q)
      );
    });
  }, [terminalRows, terminalSearch, terminalBranchFilter]);

  const terminalSort = useSortableData(
    filteredTerminals,
    { key: 'code', dir: 'asc' },
    (row, key) => {
      if (key === 'is_active') return row.is_active ? 1 : 0;
      return (row as unknown as Record<string, any>)[key];
    }
  );
  const terminalPagination = usePagination(terminalSort.sortedItems, 6);

  const activeBranchesCount = branchRows.filter((b) => b.is_active).length;
  const activeTerminalsCount = terminalRows.filter((t) => t.is_active).length;
  const warehousesTotal = branchRows.reduce((sum, b) => sum + (b.warehouse_count || 0), 0);
  const assignedStaffTotal = branchRows.reduce((sum, b) => sum + (b.assigned_user_count || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Symmetrical 3-Column KPI Bento Strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-stretch">
        <section className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Branch Locations
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-ink">
                  {activeBranchesCount}
                </span>
                <span className="text-xs text-ink-muted">/ {branchRows.length} configured</span>
              </div>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent/15 text-accent">
              <Building2 className="h-4.5 w-4.5" />
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-theme pt-2.5 text-[11px] text-ink-muted">
            <span>{canMultiBranch ? 'Multi-Branch Owner Access' : 'Single Assigned Branch Scope'}</span>
            <Badge variant={canMultiBranch ? 'lavender' : 'outline'}>
              {canMultiBranch ? 'Multi-Branch' : '1-Branch Lock'}
            </Badge>
          </div>
        </section>

        <section className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                POS Terminals &amp; Registers
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-ink">
                  {activeTerminalsCount}
                </span>
                <span className="text-xs text-ink-muted">/ {terminalRows.length} registers</span>
              </div>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-emerald-500/15 text-emerald-700">
              <Monitor className="h-4.5 w-4.5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme pt-2.5 text-[11px] text-ink-muted">
            <span>Active Session Register</span>
            <span className="truncate font-semibold text-ink">
              {terminalRows.find((t) => t.id === context?.terminal_id)?.name ||
                terminals.find((t) => t.id === context?.terminal_id)?.name ||
                'No Terminal Selected'}
            </span>
          </div>
        </section>

        <section className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Warehouses &amp; Pinned Staff
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tabular-nums text-ink">
                  {warehousesTotal}
                </span>
                <span className="text-xs text-ink-muted">
                  warehouses • {assignedStaffTotal} staff pinned
                </span>
              </div>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--theme-radius-control)] bg-amber-500/15 text-amber-700">
              <Warehouse className="h-4.5 w-4.5" />
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border-theme pt-2.5 text-[11px] text-ink-muted">
            <span>FIFO &amp; Accounting Linked</span>
            <span className="font-semibold text-ink">
              {availableCountries.length || 1}{' '}
              {(availableCountries.length || 1) === 1 ? 'Country' : 'Countries'}
            </span>
          </div>
        </section>
      </div>

      {/* Section 1: Branches Grid Directory */}
      <section className="zona-card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-bold text-ink">Company Branches</h2>
              {!canMultiBranch && (
                <Badge variant="outline">
                  <Lock className="mr-1 h-3 w-3" />
                  Assigned Branch Only ({context?.role_code || 'Staff'})
                </Badge>
              )}
            </div>
            <p className="text-[11.5px] text-ink-muted">
              {canMultiBranch
                ? 'Create branches with linked FIFO warehouses and starter POS terminals. Switch branches live without signing out.'
                : 'Your role is restricted to one assigned branch. Only Company Owners and SuperAdmins can create or switch branches.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManageBranches && (
              <DynamicButton
                variant="obsidian"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={openCreateBranchModal}
                data-testid="create-branch-btn"
              >
                New Branch
              </DynamicButton>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <Input
              value={branchSearch}
              onChange={(e) => setBranchSearch(e.target.value)}
              placeholder="Search branch name, code, city..."
              className="pl-8"
              data-testid="branch-search-input"
            />
          </div>

          {availableCountries.length > 1 && (
            <Select value={branchCountryFilter} onValueChange={setBranchCountryFilter}>
              <SelectTrigger className="h-9 w-[170px] text-xs">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Countries</SelectItem>
                {availableCountries.map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name} ({code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {branchesLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/60 animate-pulse"
              />
            ))}
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme py-10 text-center text-xs text-ink-muted">
            No branches matched your filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 items-stretch">
            {filteredBranches.map((b) => {
              const isCurrent = b.id === context?.branch_id;
              return (
                <article
                  key={b.id}
                  data-testid={`branch-card-${b.code}`}
                  className={`h-full flex flex-col justify-between rounded-[var(--theme-radius-inner)] border p-3.5 transition-all ${
                    isCurrent
                      ? 'border-accent/60 bg-accent/5 shadow-xs'
                      : 'border-border-theme bg-surface hover:border-ink/25'
                  }`}
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="font-mono text-[10.5px]">
                          {b.code}
                        </Badge>
                        {isCurrent && (
                          <Badge variant="positive" className="text-[10px]">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Active Branch
                          </Badge>
                        )}
                        {b.is_warehouse && (
                          <Badge variant="lavender" className="text-[10px]">
                            Hub
                          </Badge>
                        )}
                      </div>
                      <Badge variant={b.is_active ? 'positive' : 'negative'}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div>
                      <h3 className="text-[13.5px] font-bold text-ink">{b.name}</h3>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                        <Globe className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {b.country_name || b.country_code}
                          {b.city ? ` • ${b.city}` : ''}
                        </span>
                      </p>
                      {b.address && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-ink-muted/85">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{b.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    <div className="grid grid-cols-3 gap-1.5 rounded-[var(--theme-radius-control)] bg-surface-muted/75 px-2.5 py-2 text-center">
                      <div>
                        <p className="text-[10px] text-ink-muted">Terminals</p>
                        <p className="text-xs font-bold tabular-nums text-ink">
                          {b.active_terminal_count}/{b.terminal_count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-muted">Warehouse</p>
                        <p className="text-xs font-bold tabular-nums text-ink">
                          {b.warehouse_count}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-ink-muted">Staff</p>
                        <p className="inline-flex items-center justify-center gap-1 text-xs font-bold tabular-nums text-ink">
                          <Users className="h-3 w-3 text-ink-muted" />
                          {b.assigned_user_count}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-theme pt-2.5">
                      {canMultiBranch ? (
                        <>
                          <div className="flex items-center gap-1.5">
                            {!isCurrent && b.is_active && (
                              <Button
                                type="button"
                                variant="info"
                                size="xs"
                                disabled={switchingKey.startsWith(b.id)}
                                onClick={() => handleSwitchBranchOrTerminal(b.id, undefined, b.name)}
                                data-testid={`switch-branch-${b.code}`}
                              >
                                <Store className="h-3 w-3" />
                                Switch
                              </Button>
                            )}
                            {canManageTerminals && (
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => openCreateTerminalModal(b.id)}
                                data-testid={`add-terminal-branch-${b.code}`}
                              >
                                <Plus className="h-3 w-3" />
                                POS
                              </Button>
                            )}
                          </div>
                          {canManageBranches && (
                            <Button
                              type="button"
                              variant="outline"
                              size="xs"
                              onClick={() => openEditBranchModal(b)}
                              data-testid={`edit-branch-${b.code}`}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="flex w-full items-center justify-between text-[11px] text-ink-muted">
                          <span className="inline-flex items-center gap-1 font-medium text-ink">
                            <Lock className="h-3 w-3 text-accent" />
                            Pinned Branch
                          </span>
                          <span>1-Branch Policy</span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: POS Terminals & Registers Table */}
      <section className="zona-card p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold text-ink">POS Terminals &amp; Registers</h2>
            <p className="text-[11.5px] text-ink-muted">
              Manage physical or browser POS stations attached to each branch and hardware serial.
            </p>
          </div>

          {canManageTerminals && (
            <DynamicButton
              variant="obsidian"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => openCreateTerminalModal()}
              data-testid="create-terminal-btn"
            >
              Add POS Terminal
            </DynamicButton>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
            <Input
              value={terminalSearch}
              onChange={(e) => setTerminalSearch(e.target.value)}
              placeholder="Search terminal name, code, serial..."
              className="pl-8"
              data-testid="terminal-search-input"
            />
          </div>

          {canMultiBranch && branchRows.length > 0 && (
            <Select value={terminalBranchFilter} onValueChange={setTerminalBranchFilter}>
              <SelectTrigger className="h-9 w-[210px] text-xs" data-testid="terminal-branch-filter">
                <SelectValue placeholder="Filter by branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Branches</SelectItem>
                {branchRows.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                sortKey="code"
                activeSortKey={terminalSort.sortConfig?.key}
                sortDir={terminalSort.sortConfig?.dir}
                onSort={terminalSort.requestSort}
              >
                Terminal Register
              </SortableTableHead>
              <SortableTableHead
                sortKey="branch_name"
                activeSortKey={terminalSort.sortConfig?.key}
                sortDir={terminalSort.sortConfig?.dir}
                onSort={terminalSort.requestSort}
              >
                Assigned Branch
              </SortableTableHead>
              <SortableTableHead
                sortKey="hardware_serial"
                activeSortKey={terminalSort.sortConfig?.key}
                sortDir={terminalSort.sortConfig?.dir}
                onSort={terminalSort.requestSort}
              >
                Hardware Serial
              </SortableTableHead>
              <SortableTableHead
                sortKey="is_active"
                activeSortKey={terminalSort.sortConfig?.key}
                sortDir={terminalSort.sortConfig?.dir}
                onSort={terminalSort.requestSort}
              >
                Status
              </SortableTableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {terminalsLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-muted">
                  Loading POS registers...
                </TableCell>
              </TableRow>
            ) : terminalPagination.pagedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-xs text-ink-muted">
                  No POS terminals registered for this scope.
                </TableCell>
              </TableRow>
            ) : (
              terminalPagination.pagedItems.map((row) => {
                const isCurrentTerm = row.id === context?.terminal_id;
                const canSelectThisTerminal =
                  row.is_active && (canMultiBranch || row.branch_id === context?.branch_id);
                return (
                  <TableRow key={row.id} data-testid={`terminal-row-${row.code}`}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-ink">
                          <Monitor className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-ink">{row.name}</p>
                            {isCurrentTerm && (
                              <Badge variant="positive" className="text-[10px]">
                                Current
                              </Badge>
                            )}
                          </div>
                          <p className="font-mono text-[10.5px] text-ink-muted">{row.code}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-semibold text-ink">{row.branch_name}</p>
                        <p className="font-mono text-[10px] text-ink-muted">{row.branch_code}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-ink-muted">
                        <Cpu className="h-3.5 w-3.5 shrink-0" />
                        {row.hardware_serial || 'Unpaired Hardware'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canManageTerminals ? (
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(checked) => void toggleTerminalActive(row, checked)}
                          aria-label={`Toggle active status for ${row.name}`}
                        />
                      ) : (
                        <Badge variant={row.is_active ? 'positive' : 'outline'}>
                          {row.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canSelectThisTerminal && !isCurrentTerm && (
                          <Button
                            type="button"
                            variant="info"
                            size="xs"
                            disabled={switchingKey === `${row.branch_id}:${row.id}`}
                            onClick={() =>
                              handleSwitchBranchOrTerminal(
                                row.branch_id,
                                row.id,
                                `${row.branch_name} • ${row.name}`
                              )
                            }
                            data-testid={`use-terminal-${row.code}`}
                          >
                            Use POS
                          </Button>
                        )}
                        {canManageTerminals && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => openEditTerminalModal(row)}
                            data-testid={`edit-terminal-${row.code}`}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <DataTablePagination
          page={terminalPagination.page}
          pageSize={terminalPagination.pageSize}
          totalItems={terminalPagination.totalItems}
          totalPages={terminalPagination.totalPages}
          onPageChange={terminalPagination.setPage}
          onPageSizeChange={terminalPagination.setPageSize}
          pageSizeOptions={[4, 6, 10, 20]}
          itemLabel="terminals"
        />
      </section>

      {/* Branch Create / Edit Dialog */}
      <Dialog open={branchModalOpen} onOpenChange={setBranchModalOpen}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <DialogTitle>{editingBranch ? `Edit Branch • ${editingBranch.code}` : 'Create Company Branch'}</DialogTitle>
            <DialogDescription>
              Provision a store location with an automatically linked FIFO warehouse and optional starter POS terminal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveBranch} noValidate className="space-y-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Branch Name *</label>
                <Input
                  value={branchName}
                  onChange={(e) => {
                    setBranchName(e.target.value);
                    if (branchNameError) setBranchNameError('');
                  }}
                  placeholder="Kandy Flagship Store"
                  aria-invalid={Boolean(branchNameError)}
                  data-testid="branch-name-input"
                />
                {branchNameError && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="branch-name-error">
                    {branchNameError}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Branch Code</label>
                <Input
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
                  placeholder="KND-01 (auto if blank)"
                  className="font-mono uppercase"
                  data-testid="branch-code-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Country</label>
                <Select value={countryCode} onValueChange={setCountryCode}>
                  <SelectTrigger data-testid="branch-country-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <div className="p-1.5 border-b border-border-theme">
                      <Input
                        value={countrySearch}
                        onChange={(e) => setCountrySearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="Search country..."
                        className="h-7 text-xs"
                        data-testid="branch-country-search"
                      />
                    </div>
                    {BRANCH_COUNTRY_OPTIONS.filter((c) => {
                      const q = countrySearch.trim().toLowerCase();
                      if (!q) return true;
                      return c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
                    }).map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">City / Region</label>
                <Input
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  placeholder="Kandy"
                  data-testid="branch-city-input"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Street Address</label>
              <Input
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder="No. 42 Dalada Veediya"
                data-testid="branch-address-input"
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2 cursor-pointer">
                <span className="text-xs font-semibold text-ink">Warehouse Distribution Hub</span>
                <Switch checked={isWarehouse} onCheckedChange={setIsWarehouse} />
              </label>
              {editingBranch ? (
                <label className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2 cursor-pointer">
                  <span className="text-xs font-semibold text-ink">Branch Active</span>
                  <Switch checked={branchActive} onCheckedChange={setBranchActive} />
                </label>
              ) : (
                <label className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2 cursor-pointer">
                  <span className="text-xs font-semibold text-ink">Create Starter POS Register</span>
                  <Switch
                    checked={createDefaultTerminal}
                    onCheckedChange={setCreateDefaultTerminal}
                    data-testid="branch-starter-terminal-switch"
                  />
                </label>
              )}
            </div>

            {!editingBranch && createDefaultTerminal && (
              <div className="grid grid-cols-1 gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-ink">
                    Starter POS Code (optional)
                  </label>
                  <Input
                    value={initialTerminalCode}
                    onChange={(e) => setInitialTerminalCode(e.target.value.toUpperCase())}
                    placeholder={branchCode ? `${branchCode}-POS01` : 'Auto-generated'}
                    className="font-mono uppercase"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-ink">
                    Starter POS Name (optional)
                  </label>
                  <Input
                    value={initialTerminalName}
                    onChange={(e) => setInitialTerminalName(e.target.value)}
                    placeholder={branchName ? `${branchName} POS #01` : 'Front Counter #01'}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Auto-links FIFO stock warehouse
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setBranchModalOpen(false)}>
                  Cancel
                </Button>
                <DynamicButton
                  type="submit"
                  variant="obsidian"
                  loading={savingBranch}
                  data-testid="save-branch-submit"
                >
                  {editingBranch ? 'Save Branch Changes' : 'Create Branch'}
                </DynamicButton>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* POS Terminal Create / Edit Dialog */}
      <Dialog open={terminalModalOpen} onOpenChange={setTerminalModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingTerminal ? `Edit POS Terminal • ${editingTerminal.code}` : 'Add POS Terminal'}
            </DialogTitle>
            <DialogDescription>
              Register a cashier checkout station and bind it to one specific store branch.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveTerminal} noValidate className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Assigned Branch *</label>
              <Select
                value={termBranchId}
                onValueChange={(val) => {
                  setTermBranchId(val);
                  if (termErrors.branch) setTermErrors((prev) => ({ ...prev, branch: undefined }));
                }}
              >
                <SelectTrigger data-testid="terminal-branch-select">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branchRows.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {termErrors.branch && (
                <p className="text-[11px] font-medium text-red-500" data-testid="terminal-branch-error">
                  {termErrors.branch}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Terminal Name *</label>
                <Input
                  value={termName}
                  onChange={(e) => {
                    setTermName(e.target.value);
                    if (termErrors.name) setTermErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="Front Desk POS #02"
                  aria-invalid={Boolean(termErrors.name)}
                  data-testid="terminal-name-input"
                />
                {termErrors.name && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="terminal-name-error">
                    {termErrors.name}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Terminal Code *</label>
                <Input
                  value={termCode}
                  onChange={(e) => {
                    setTermCode(e.target.value.toUpperCase());
                    if (termErrors.code) setTermErrors((prev) => ({ ...prev, code: undefined }));
                  }}
                  placeholder="KND-POS02"
                  className="font-mono uppercase"
                  aria-invalid={Boolean(termErrors.code)}
                  data-testid="terminal-code-input"
                />
                {termErrors.code && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="terminal-code-error">
                    {termErrors.code}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Hardware Serial / Device ID</label>
              <Input
                value={termSerial}
                onChange={(e) => setTermSerial(e.target.value)}
                placeholder="ZPRO-KND-POS02"
                className="font-mono"
                data-testid="terminal-serial-input"
              />
            </div>

            {editingTerminal && (
              <label className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2 cursor-pointer">
                <span className="text-xs font-semibold text-ink">Terminal Active</span>
                <Switch checked={termActive} onCheckedChange={setTermActive} />
              </label>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setTerminalModalOpen(false)}>
                Cancel
              </Button>
              <DynamicButton
                type="submit"
                variant="obsidian"
                loading={savingTerminal}
                data-testid="save-terminal-submit"
              >
                {editingTerminal ? 'Save Terminal Changes' : 'Create Terminal'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
