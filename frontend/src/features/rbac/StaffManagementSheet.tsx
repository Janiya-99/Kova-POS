import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  Check,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';
import {
  DesignationEditorForm,
  RoleEditorForm,
  type AccessUserRow,
  type AccessUsersResponse,
} from './RoleDesignationModals';

interface StaffManagementSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultView?: 'directory' | 'user_form';
}

type SheetView = 'directory' | 'user_form' | 'role_form' | 'designation_form';

/**
 * Reusable Staff, Role & Designation Management Drawer for both Settings and 4-Pane POS.
 * Switches smoothly between staff directory, user creation, custom role creation,
 * and designation creation without overlapping nested modal focus traps.
 */
export function StaffManagementSheet({
  open,
  onOpenChange,
  defaultView = 'directory',
}: StaffManagementSheetProps) {
  const queryClient = useQueryClient();
  const { context, branches, hasPermission } = useAuthStore();
  const canViewRbac = hasPermission('rbac:view') || hasPermission('rbac:manage');

  const [view, setView] = React.useState<SheetView>(defaultView);
  const [search, setSearch] = React.useState('');
  const [editingUser, setEditingUser] = React.useState<AccessUserRow | null>(null);

  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [roleId, setRoleId] = React.useState('');
  const [designationId, setDesignationId] = React.useState('NONE');
  const [branchId, setBranchId] = React.useState('ALL');
  const [allBranches, setAllBranches] = React.useState(false);
  const [allowedBranchIds, setAllowedBranchIds] = React.useState<string[]>([]);
  const [allowedTerminalIds, setAllowedTerminalIds] = React.useState<string[]>([]);
  const [supervisorPin, setSupervisorPin] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = React.useState(false);

  const { data: accessData, isLoading } = useQuery({
    queryKey: ['access-users', context?.business_id],
    queryFn: () => apiFetch<AccessUsersResponse>('/api/v1/access/users'),
    enabled: open && canViewRbac && Boolean(context?.business_id),
  });

  const availableBranches = accessData?.branches || branches;
  const availableTerminals = accessData?.terminals || [];
  const defaultConcreteBranchId = availableBranches[0]?.id || context?.branch_id || '';
  const selectedRoleCode =
    (accessData?.roles || []).find((r) => r.id === roleId)?.code || '';
  const selectedRoleSupportsAll = isMultiBranchRole(selectedRoleCode);

  const handleRoleChange = (nextRoleId: string) => {
    setRoleId(nextRoleId);
    const nextCode =
      (accessData?.roles || []).find((r) => r.id === nextRoleId)?.code || '';
    if (isMultiBranchRole(nextCode)) {
      setAllBranches(true);
      setBranchId('ALL');
    } else if (!allBranches && allowedBranchIds.length === 0 && defaultConcreteBranchId) {
      setAllowedBranchIds([defaultConcreteBranchId]);
      setBranchId(defaultConcreteBranchId);
    }
  };

  React.useEffect(() => {
    if (open) {
      setView(defaultView);
      if (defaultView === 'user_form') {
        const defaultRole =
          accessData?.roles.find((r) => r.code === 'Cashier') ||
          accessData?.roles[0];
        const isOwner = isMultiBranchRole(defaultRole?.code);
        setEditingUser(null);
        setFullName('');
        setEmail('');
        setPassword('');
        setRoleId(defaultRole?.id || '');
        setDesignationId(accessData?.designations[0]?.id || 'NONE');
        setAllBranches(isOwner);
        setAllowedBranchIds(defaultConcreteBranchId ? [defaultConcreteBranchId] : []);
        setAllowedTerminalIds([]);
        setBranchId(
          isOwner
            ? 'ALL'
            : defaultConcreteBranchId || 'ALL'
        );
        setSupervisorPin('');
        setIsActive(true);
        setFieldErrors({});
      }
    }
  }, [open, defaultView, accessData?.roles, accessData?.designations, defaultConcreteBranchId]);

  const filteredUsers = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = accessData?.users || [];
    if (!q) return list;
    return list.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role_name.toLowerCase().includes(q) ||
        u.designation_name.toLowerCase().includes(q)
    );
  }, [accessData?.users, search]);

  const openNewUserForm = () => {
    const defaultRole =
      accessData?.roles.find((r) => r.code === 'Cashier') ||
      accessData?.roles[0];
    const isOwner = isMultiBranchRole(defaultRole?.code);
    setEditingUser(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setRoleId(defaultRole?.id || '');
    setDesignationId(accessData?.designations[0]?.id || 'NONE');
    setAllBranches(isOwner);
    setAllowedBranchIds(defaultConcreteBranchId ? [defaultConcreteBranchId] : []);
    setAllowedTerminalIds([]);
    setBranchId(
      isOwner
        ? 'ALL'
        : defaultConcreteBranchId
    );
    setSupervisorPin('');
    setIsActive(true);
    setFieldErrors({});
    setView('user_form');
  };

  const openEditUserForm = (row: AccessUserRow) => {
    setEditingUser(row);
    setFullName(row.full_name);
    setEmail(row.email);
    setPassword('');
    setRoleId(row.role_id);
    setDesignationId(row.designation_id || 'NONE');
    const rowAll = Boolean(row.all_branches_access || isMultiBranchRole(row.role_code));
    const existingBranches =
      row.allowed_branch_ids && row.allowed_branch_ids.length > 0
        ? row.allowed_branch_ids
        : row.branch_id
        ? [row.branch_id]
        : defaultConcreteBranchId
        ? [defaultConcreteBranchId]
        : [];
    setAllBranches(rowAll);
    setAllowedBranchIds(existingBranches);
    setAllowedTerminalIds(row.allowed_terminal_ids || []);
    setBranchId(
      row.branch_id ||
        (rowAll ? 'ALL' : existingBranches[0] || defaultConcreteBranchId)
    );
    setSupervisorPin('');
    setIsActive(row.is_active);
    setFieldErrors({});
    setView('user_form');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!fullName.trim()) {
      errs.fullName = 'Full name is required';
    }
    if (!editingUser && (!email.trim() || !email.includes('@'))) {
      errs.email = 'Valid work email is required';
    }
    if (supervisorPin.trim() && supervisorPin.trim().length !== 6) {
      errs.pin = 'Supervisor PIN must be exactly 6 digits';
    }
    if (!roleId) {
      errs.role = 'Please select a role';
    }
    if (!allBranches && allowedBranchIds.length === 0 && (!branchId || branchId === 'ALL')) {
      errs.branch = 'Select at least one branch or enable All Branches';
    }
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    setFieldErrors({});

    setSavingUser(true);
    try {
      const effectiveAllowedBranches = allBranches
        ? []
        : allowedBranchIds.length > 0
        ? allowedBranchIds
        : branchId && branchId !== 'ALL'
        ? [branchId]
        : [];
      const primaryBranchId =
        branchId && branchId !== 'ALL'
          ? branchId
          : effectiveAllowedBranches[0] || null;
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role_id: roleId,
        designation_id: designationId !== 'NONE' ? designationId : null,
        branch_id: primaryBranchId,
        all_branches_access: allBranches,
        allowed_branch_ids: effectiveAllowedBranches,
        allowed_terminal_ids: allowedTerminalIds,
        is_active: isActive,
      };
      if (supervisorPin.trim()) payload.supervisor_pin = supervisorPin.trim();
      if (!editingUser && password.trim()) payload.password = password.trim();

      if (editingUser) {
        await apiFetch(`/api/v1/access/users/${editingUser.user_business_role_id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, user_id: editingUser.user_id }),
        });
        toast.success(`Updated access for ${fullName.trim()}`);
      } else {
        await apiFetch('/api/v1/access/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created staff account for ${fullName.trim()}`);
      }

      await queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] });
      setView('directory');
    } catch (err: any) {
      toast.error(err.message || 'Unable to save staff user');
    } finally {
      setSavingUser(false);
    }
  };

  const sheetTitle =
    view === 'user_form'
      ? editingUser
        ? `Edit Staff: ${editingUser.full_name}`
        : 'Add POS / Company Staff User'
      : view === 'role_form'
      ? 'Create Custom RBAC Role'
      : view === 'designation_form'
      ? 'Create Designation & Department'
      : 'Staff Directory & Quick Creation';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[540px] flex flex-col overflow-hidden"
        data-testid="pos-staff-sheet"
      >
        <SheetHeader className="border-b border-border-theme pb-3">
          <div className="flex items-center gap-2">
            {view !== 'directory' && (
              <button
                type="button"
                onClick={() => setView('directory')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/60 cursor-pointer"
                aria-label="Back to staff list"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
            <Users className="h-4 w-4 text-accent" />
            <SheetTitle>{sheetTitle}</SheetTitle>
          </div>
          <SheetDescription>
            {context?.trade_name || context?.business_name} • Create users, custom roles, and
            designation discount caps without leaving your register.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pt-4 pr-1 space-y-3">
          {view === 'directory' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search staff name, email or role..."
                    className="pl-8"
                    data-testid="pos-staff-search"
                  />
                </div>

                <Can permission="rbac:manage">
                  <DynamicButton
                    variant="obsidian"
                    icon={<UserPlus className="h-3.5 w-3.5" />}
                    onClick={openNewUserForm}
                    data-testid="pos-staff-add-user-btn"
                  >
                    Add User
                  </DynamicButton>
                </Can>
              </div>

              <Can permission="rbac:manage">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setView('role_form')}
                    className="justify-start gap-1.5 text-xs"
                    data-testid="pos-staff-new-role-btn"
                  >
                    <Shield className="h-3.5 w-3.5 text-accent" />
                    + Create Custom Role
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setView('designation_form')}
                    className="justify-start gap-1.5 text-xs"
                    data-testid="pos-staff-new-designation-btn"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-accent" />
                    + Create Designation
                  </Button>
                </div>
              </Can>

              <div className="space-y-2">
                {isLoading ? (
                  <p className="py-8 text-center text-xs text-ink-muted">Loading company staff...</p>
                ) : filteredUsers.length === 0 ? (
                  <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme p-6 text-center text-xs text-ink-muted">
                    No matching staff accounts found in this business.
                  </div>
                ) : (
                  filteredUsers.map((row) => (
                    <div
                      key={row.user_business_role_id}
                      className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-3"
                      data-testid={`pos-staff-row-${row.email}`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-ink">{row.full_name}</p>
                          <Badge variant={row.is_active ? 'positive' : 'outline'}>
                            {row.is_active ? 'Active' : 'Disabled'}
                          </Badge>
                          {row.has_pin && (
                            <Badge variant="lavender">
                              <KeyRound className="mr-1 h-2.5 w-2.5" />
                              PIN
                            </Badge>
                          )}
                        </div>
                        <p className="truncate text-[10.5px] text-ink-muted">{row.email}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                          <span className="font-semibold text-ink">{row.role_name}</span>
                          {row.designation_name && (
                            <span className="text-ink-muted">
                              • {row.designation_name} ({row.max_pos_discount_pct}% max disc)
                            </span>
                          )}
                          <span className="text-ink-muted">
                            • {row.branch_name || 'All Branches'}
                          </span>
                        </div>
                      </div>

                      <Can permission="rbac:manage">
                        <Button
                          type="button"
                          variant="info"
                          size="xs"
                          onClick={() => openEditUserForm(row)}
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </Button>
                      </Can>
                    </div>
                  ))
                )}
              </div>
            </>
          )}

          {view === 'user_form' && (
            <form onSubmit={handleSaveUser} noValidate className="space-y-3" data-testid="pos-staff-user-form">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Full Name *</label>
                  <Input
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      if (fieldErrors.fullName) setFieldErrors((prev) => ({ ...prev, fullName: '' }));
                    }}
                    placeholder="e.g., Nimali Perera"
                    data-testid="pos-staff-fullname-input"
                  />
                  {fieldErrors.fullName && (
                    <p className="text-[11px] font-medium text-red-500">{fieldErrors.fullName}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Work Email *</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    disabled={Boolean(editingUser)}
                    placeholder="cashier@company.com"
                    data-testid="pos-staff-email-input"
                  />
                  {fieldErrors.email && (
                    <p className="text-[11px] font-medium text-red-500">{fieldErrors.email}</p>
                  )}
                </div>
              </div>

              {!editingUser && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">
                    Initial Password <span className="text-ink-muted">(default: PosAdmin2026!)</span>
                  </label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank for PosAdmin2026!"
                    data-testid="pos-staff-password-input"
                  />
                </div>
              )}

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-ink">Assigned Role</label>
                  <button
                    type="button"
                    onClick={() => setView('role_form')}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    New Role
                  </button>
                </div>
                <Select value={roleId} onValueChange={handleRoleChange}>
                  <SelectTrigger data-testid="pos-staff-role-select">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(accessData?.roles || []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-ink">Designation</label>
                  <button
                    type="button"
                    onClick={() => setView('designation_form')}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    New Designation
                  </button>
                </div>
                <Select value={designationId} onValueChange={setDesignationId}>
                  <SelectTrigger data-testid="pos-staff-designation-select">
                    <SelectValue placeholder="Select Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Designation</SelectItem>
                    {(accessData?.designations || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.max_pos_discount_pct}% max disc)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Multi-Branch & Multi-Terminal Assignment */}
              <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-ink">Branch Access (1, Multiple, or All)</span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink cursor-pointer">
                    <Switch
                      checked={allBranches}
                      disabled={selectedRoleSupportsAll}
                      onCheckedChange={(checked) => {
                        setAllBranches(checked);
                        if (checked) {
                          setBranchId('ALL');
                          setFieldErrors((prev) => ({ ...prev, branch: '' }));
                        } else if (allowedBranchIds.length === 0 && defaultConcreteBranchId) {
                          setAllowedBranchIds([defaultConcreteBranchId]);
                          setBranchId(defaultConcreteBranchId);
                        }
                      }}
                    />
                    <span>All Branches</span>
                  </label>
                </div>

                {!allBranches && (
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {availableBranches.map((b) => {
                      const checked = allowedBranchIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => {
                            setAllowedBranchIds((prev) => {
                              const next = prev.includes(b.id)
                                ? prev.filter((id) => id !== b.id)
                                : [...prev, b.id];
                              if (next.length > 0 && (!branchId || branchId === 'ALL' || !next.includes(branchId))) {
                                setBranchId(next[0]);
                              }
                              return next;
                            });
                            setFieldErrors((prev) => ({ ...prev, branch: '' }));
                          }}
                          className={`flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border px-2 py-1 text-left text-[11px] transition cursor-pointer ${
                            checked
                              ? 'border-accent bg-accent-soft/30 font-bold text-ink'
                              : 'border-border-theme bg-surface text-ink-muted'
                          }`}
                        >
                          <span className="truncate">{b.code} • {b.name}</span>
                          {checked && <Check className="h-3 w-3 text-accent shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
                {fieldErrors.branch && (
                  <p className="text-[11px] font-medium text-red-500">{fieldErrors.branch}</p>
                )}

                {availableTerminals.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <span className="text-[10.5px] font-semibold text-ink-muted">
                      POS Terminals (optional filter — leave unchecked for all branch registers)
                    </span>
                    <div className="grid grid-cols-2 gap-1">
                      {availableTerminals
                        .filter((tm) => allBranches || allowedBranchIds.includes(tm.branch_id))
                        .map((tm) => {
                          const checked = allowedTerminalIds.includes(tm.id);
                          return (
                            <button
                              key={tm.id}
                              type="button"
                              onClick={() =>
                                setAllowedTerminalIds((prev) =>
                                  prev.includes(tm.id)
                                    ? prev.filter((id) => id !== tm.id)
                                    : [...prev, tm.id]
                                )
                              }
                              className={`flex items-center justify-between gap-1 rounded-[var(--theme-radius-control)] border px-2 py-1 text-left font-mono text-[10.5px] transition cursor-pointer ${
                                checked
                                  ? 'border-accent bg-accent-soft/30 font-bold text-ink'
                                  : 'border-border-theme bg-surface text-ink-muted'
                              }`}
                            >
                              <span className="truncate">{tm.code}</span>
                              {checked && <Check className="h-3 w-3 text-accent shrink-0" />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">
                    Default Branch
                  </label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger data-testid="pos-staff-branch-select">
                      <SelectValue
                        placeholder={allBranches ? 'All Branches' : 'Select Branch'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {allBranches && (
                        <SelectItem value="ALL">All Branches</SelectItem>
                      )}
                      {availableBranches
                        .filter((b) => allBranches || allowedBranchIds.includes(b.id))
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">
                    6-Digit Supervisor PIN
                  </label>
                  <Input
                    value={supervisorPin}
                    maxLength={6}
                    inputMode="numeric"
                    onChange={(e) => {
                      setSupervisorPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (fieldErrors.pin) setFieldErrors((prev) => ({ ...prev, pin: '' }));
                    }}
                    placeholder="Enter 6-digit PIN"
                    className="font-mono tabular-nums"
                    data-testid="pos-staff-pin-input"
                  />
                  {fieldErrors.pin && (
                    <p className="text-[11px] font-medium text-red-500">{fieldErrors.pin}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2">
                <span className="text-xs font-semibold text-ink">Account Active</span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setView('directory')}>
                  Cancel
                </Button>
                <DynamicButton
                  type="submit"
                  variant="obsidian"
                  loading={savingUser}
                  data-testid="pos-staff-submit-btn"
                >
                  {editingUser ? 'Save Staff User' : 'Create Staff Login'}
                </DynamicButton>
              </div>
            </form>
          )}

          {view === 'role_form' && (
            <RoleEditorForm
              testIdPrefix="pos-role"
              onCancel={() => setView('user_form')}
              onSaved={(newRoleId) => {
                setRoleId(newRoleId);
                setView('user_form');
              }}
            />
          )}

          {view === 'designation_form' && (
            <DesignationEditorForm
              departments={accessData?.departments || []}
              testIdPrefix="pos-desig"
              onCancel={() => setView('user_form')}
              onSaved={(newDesigId) => {
                setDesignationId(newDesigId);
                setView('user_form');
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

