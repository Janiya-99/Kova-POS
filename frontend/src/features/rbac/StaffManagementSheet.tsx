import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
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
  const [supervisorPin, setSupervisorPin] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [savingUser, setSavingUser] = React.useState(false);

  const { data: accessData, isLoading } = useQuery({
    queryKey: ['access-users', context?.business_id],
    queryFn: () => apiFetch<AccessUsersResponse>('/api/v1/access/users'),
    enabled: open && canViewRbac && Boolean(context?.business_id),
  });

  const availableBranches = accessData?.branches || branches;
  const defaultConcreteBranchId = availableBranches[0]?.id || context?.branch_id || '';
  const selectedRoleCode =
    (accessData?.roles || []).find((r) => r.id === roleId)?.code || '';
  const selectedRoleSupportsAll = isMultiBranchRole(selectedRoleCode);

  const handleRoleChange = (nextRoleId: string) => {
    setRoleId(nextRoleId);
    const nextCode =
      (accessData?.roles || []).find((r) => r.id === nextRoleId)?.code || '';
    if (!isMultiBranchRole(nextCode) && (!branchId || branchId === 'ALL')) {
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
        setEditingUser(null);
        setFullName('');
        setEmail('');
        setPassword('');
        setRoleId(defaultRole?.id || '');
        setDesignationId(accessData?.designations[0]?.id || 'NONE');
        setBranchId(
          isMultiBranchRole(defaultRole?.code)
            ? 'ALL'
            : defaultConcreteBranchId || 'ALL'
        );
        setSupervisorPin('');
        setIsActive(true);
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
    setEditingUser(null);
    setFullName('');
    setEmail('');
    setPassword('');
    setRoleId(defaultRole?.id || '');
    setDesignationId(accessData?.designations[0]?.id || 'NONE');
    setBranchId(
      isMultiBranchRole(defaultRole?.code)
        ? 'ALL'
        : defaultConcreteBranchId
    );
    setSupervisorPin('');
    setIsActive(true);
    setView('user_form');
  };

  const openEditUserForm = (row: AccessUserRow) => {
    setEditingUser(row);
    setFullName(row.full_name);
    setEmail(row.email);
    setPassword('');
    setRoleId(row.role_id);
    setDesignationId(row.designation_id || 'NONE');
    setBranchId(
      row.branch_id ||
        (isMultiBranchRole(row.role_code) ? 'ALL' : defaultConcreteBranchId)
    );
    setSupervisorPin('');
    setIsActive(row.is_active);
    setView('user_form');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!editingUser && (!email.trim() || !email.includes('@'))) {
      toast.error('Valid work email is required');
      return;
    }
    if (supervisorPin.trim() && supervisorPin.trim().length !== 6) {
      toast.error('Supervisor PIN must be exactly 6 digits');
      return;
    }
    if (!roleId) {
      toast.error('Please select a role');
      return;
    }
    if (!selectedRoleSupportsAll && (!branchId || branchId === 'ALL')) {
      toast.error('Branch assignment is required for this role (only Owner / SuperAdmin access multiple branches)');
      return;
    }

    setSavingUser(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role_id: roleId,
        designation_id: designationId !== 'NONE' ? designationId : null,
        branch_id: branchId !== 'ALL' ? branchId : null,
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
            <form onSubmit={handleSaveUser} className="space-y-3" data-testid="pos-staff-user-form">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Full Name</label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Nimali Perera"
                    required
                    data-testid="pos-staff-fullname-input"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Work Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={Boolean(editingUser)}
                    placeholder="cashier@company.com"
                    required
                    data-testid="pos-staff-email-input"
                  />
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

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">
                    Branch Assignment {!selectedRoleSupportsAll ? '*' : ''}
                  </label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger data-testid="pos-staff-branch-select">
                      <SelectValue
                        placeholder={selectedRoleSupportsAll ? 'All Branches' : 'Select Branch'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedRoleSupportsAll && (
                        <SelectItem value="ALL">All Branches</SelectItem>
                      )}
                      {availableBranches.map((b) => (
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
                    onChange={(e) => setSupervisorPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit PIN"
                    className="font-mono tabular-nums"
                    data-testid="pos-staff-pin-input"
                  />
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

