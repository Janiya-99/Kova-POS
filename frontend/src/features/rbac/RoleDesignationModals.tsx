import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CheckSquare, Plus, Shield, Square } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import { formatPermissionActionLabel } from '@/lib/formatLabel';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export interface PermissionCatalogItem {
  id: string;
  module: string;
  action: string;
  code: string;
  description: string;
}

export interface RoleCatalogRow {
  id: string;
  business_id?: string | { UUID?: string; Valid?: boolean } | null;
  code: string;
  name: string;
  description: string;
  is_system?: boolean;
}

export interface RoleMatrixItem {
  role_id: string;
  role_code: string;
  role_name: string;
  description: string;
  permissions: string[];
}

export interface DepartmentRow {
  id: string;
  business_id?: string;
  code: string;
  name: string;
}

export interface DesignationRow {
  id: string;
  business_id?: string;
  department_id: string;
  code: string;
  name: string;
  max_pos_discount_pct: string;
}

export interface AccessUserRow {
  user_business_role_id: string;
  user_id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  business_id: string;
  branch_id?: string | null;
  branch_name: string;
  role_id: string;
  role_code: string;
  role_name: string;
  designation_id?: string;
  designation_name: string;
  max_pos_discount_pct: string;
  is_active: boolean;
  has_pin: boolean;
  all_branches_access?: boolean;
  allowed_branch_ids?: string[];
  allowed_terminal_ids?: string[];
  default_terminal_id?: string | null;
}

export interface AccessUsersResponse {
  users: AccessUserRow[];
  roles: RoleCatalogRow[];
  departments?: DepartmentRow[];
  designations: DesignationRow[];
  branches: Array<{ id: string; code: string; name: string }>;
  terminals?: Array<{
    id: string;
    branch_id: string;
    branch_code: string;
    branch_name: string;
    code: string;
    name: string;
  }>;
}

export interface RoleEditorTarget {
  id?: string;
  code: string;
  name: string;
  description: string;
  is_system?: boolean;
  permissions: string[];
}

interface RoleEditorFormProps {
  editingRole?: RoleEditorTarget | null;
  onCancel?: () => void;
  onSaved?: (roleId: string, roleName: string) => void;
  testIdPrefix?: string;
}

/**
 * Shared RBAC custom role builder form with module-grouped permission matrix.
 * Filters out `platform:admin` so tenant operators cannot elevate into platform SuperAdmin.
 */
export function RoleEditorForm({
  editingRole,
  onCancel,
  onSaved,
  testIdPrefix = 'role-editor',
}: RoleEditorFormProps) {
  const queryClient = useQueryClient();
  const { context } = useAuthStore();
  const isEditExisting = Boolean(editingRole?.id && !editingRole?.is_system);

  const [roleName, setRoleName] = React.useState(editingRole?.name || '');
  const [roleCode, setRoleCode] = React.useState(editingRole?.code || '');
  const [description, setDescription] = React.useState(editingRole?.description || '');
  const [selectedPerms, setSelectedPerms] = React.useState<string[]>(
    () => (editingRole?.permissions || []).filter((p) => p !== 'platform:admin')
  );
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setRoleName(editingRole?.name || '');
    setRoleCode(editingRole?.code || '');
    setDescription(editingRole?.description || '');
    setSelectedPerms((editingRole?.permissions || []).filter((p) => p !== 'platform:admin'));
  }, [editingRole]);

  const { data: permCatalogData, isLoading: loadingPerms } = useQuery({
    queryKey: ['access-permissions'],
    queryFn: () => apiFetch<{ permissions: PermissionCatalogItem[] }>('/api/v1/access/permissions'),
  });

  const groupedPermissions = React.useMemo(() => {
    const map = new Map<string, PermissionCatalogItem[]>();
    for (const p of permCatalogData?.permissions || []) {
      if (p.code === 'platform:admin') continue;
      const mod = (p.module || 'general').toUpperCase();
      const existing = map.get(mod) || [];
      existing.push(p);
      map.set(mod, existing);
    }
    return Array.from(map.entries());
  }, [permCatalogData?.permissions]);

  const togglePermission = (code: string) => {
    setSelectedPerms((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code]
    );
  };

  const toggleModuleGroup = (items: PermissionCatalogItem[]) => {
    const codes = items.map((i) => i.code);
    const allSelected = codes.every((c) => selectedPerms.includes(c));
    if (allSelected) {
      setSelectedPerms((prev) => prev.filter((c) => !codes.includes(c)));
    } else {
      setSelectedPerms((prev) => Array.from(new Set([...prev, ...codes])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = roleName.trim();
    if (!cleanName) {
      toast.error('Role name is required');
      return;
    }
    const cleanCode = (
      roleCode.trim() || cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    )
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_');

    setSaving(true);
    try {
      const payload = {
        code: cleanCode,
        name: cleanName,
        description: description.trim(),
        permissions: selectedPerms,
      };
      const res = isEditExisting && editingRole?.id
        ? await apiFetch<{ role: RoleCatalogRow; permissions: string[] }>(
            `/api/v1/access/roles/${editingRole.id}`,
            {
              method: 'PUT',
              body: JSON.stringify(payload),
            }
          )
        : await apiFetch<{ role: RoleCatalogRow; permissions: string[] }>('/api/v1/access/roles', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      toast.success(
        isEditExisting
          ? `Updated role "${res.role.name}"`
          : `Created custom role "${res.role.name}" (${selectedPerms.length} permissions)`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] }),
        queryClient.invalidateQueries({ queryKey: ['settings-resolved', context?.business_id] }),
      ]);
      onSaved?.(res.role.id, res.role.name);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save custom role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid={`${testIdPrefix}-form`}>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-ink">Role Display Name</label>
          <Input
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g., Floor Supervisor"
            required
            data-testid={`${testIdPrefix}-name-input`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-ink">Role Code</label>
          <Input
            value={roleCode}
            onChange={(e) => setRoleCode(e.target.value.toUpperCase())}
            disabled={isEditExisting}
            placeholder="e.g., FLOOR_SUPERVISOR"
            className="font-mono uppercase"
            data-testid={`${testIdPrefix}-code-input`}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-ink">Description</label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Summary of responsibilities & approval scope..."
          data-testid={`${testIdPrefix}-desc-input`}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-ink">Granular Permissions</span>
          <Badge variant="lavender" className="tabular-nums">
            {selectedPerms.length} selected
          </Badge>
        </div>

        <div className="max-h-[260px] space-y-2 overflow-y-auto rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-2.5">
          {loadingPerms ? (
            <p className="py-4 text-center text-xs text-ink-muted">Loading permission catalog...</p>
          ) : (
            groupedPermissions.map(([moduleName, perms]) => {
              const allChecked = perms.every((p) => selectedPerms.includes(p.code));
              return (
                <div
                  key={moduleName}
                  className="rounded-[var(--theme-radius-control)] border border-border-theme bg-surface p-2.5 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10.5px] font-bold tracking-wider uppercase text-ink">
                      {moduleName}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleModuleGroup(perms)}
                      className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                    >
                      {allChecked ? (
                        <CheckSquare className="h-3 w-3" />
                      ) : (
                        <Square className="h-3 w-3" />
                      )}
                      {allChecked ? 'Clear Module' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {perms.map((perm) => {
                      const checked = selectedPerms.includes(perm.code);
                      return (
                        <label
                          key={perm.code}
                          className={`flex items-start gap-2 rounded-[var(--theme-radius-control)] border px-2 py-1.5 text-[11px] transition-colors cursor-pointer ${
                            checked
                              ? 'border-accent/45 bg-accent-soft/45 text-ink'
                              : 'border-border-theme bg-surface-muted/40 text-ink-muted hover:text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(perm.code)}
                            className="mt-0.5 h-3.5 w-3.5 rounded accent-[var(--theme-accent)]"
                            data-testid={`${testIdPrefix}-perm-${perm.code}`}
                          />
                          <div className="min-w-0 leading-tight">
                            <p className="text-[11px] font-bold text-ink truncate">
                              {formatPermissionActionLabel(perm.code)}
                            </p>
                            <p className="text-[10px] text-ink-muted line-clamp-1">
                              {perm.description || formatPermissionActionLabel(perm.action)}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <DynamicButton
          type="submit"
          variant="obsidian"
          loading={saving}
          icon={<Shield className="h-3.5 w-3.5" />}
          data-testid={`${testIdPrefix}-save-btn`}
        >
          {isEditExisting ? 'Save Role Changes' : 'Create Role'}
        </DynamicButton>
      </div>
    </form>
  );
}

interface RoleEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRole?: RoleEditorTarget | null;
  onSaved?: (roleId: string, roleName: string) => void;
}

export function RoleEditorDialog({
  open,
  onOpenChange,
  editingRole,
  onSaved,
}: RoleEditorDialogProps) {
  const isEditExisting = Boolean(editingRole?.id && !editingRole?.is_system);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditExisting ? `Edit Custom Role: ${editingRole?.name}` : 'Create Custom RBAC Role'}
          </DialogTitle>
          <DialogDescription>
            Define a tenant-scoped permission bundle for staff logins in the active company.
          </DialogDescription>
        </DialogHeader>
        <RoleEditorForm
          editingRole={editingRole}
          onCancel={() => onOpenChange(false)}
          onSaved={(id, name) => {
            onOpenChange(false);
            onSaved?.(id, name);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface DesignationEditorFormProps {
  departments: DepartmentRow[];
  editingDesignation?: DesignationRow | null;
  onCancel?: () => void;
  onSaved?: (designationId: string, designationName: string) => void;
  testIdPrefix?: string;
}

/**
 * Shared Department & Designation creator/editor with maximum POS cashier discount cap (%).
 */
export function DesignationEditorForm({
  departments,
  editingDesignation,
  onCancel,
  onSaved,
  testIdPrefix = 'designation-editor',
}: DesignationEditorFormProps) {
  const queryClient = useQueryClient();
  const { context } = useAuthStore();

  const [localDepartments, setLocalDepartments] = React.useState<DepartmentRow[]>(departments);
  const [departmentId, setDepartmentId] = React.useState(
    editingDesignation?.department_id || departments[0]?.id || ''
  );
  const [name, setName] = React.useState(editingDesignation?.name || '');
  const [code, setCode] = React.useState(editingDesignation?.code || '');
  const [maxDiscountPct, setMaxDiscountPct] = React.useState(
    editingDesignation?.max_pos_discount_pct || '5'
  );
  const [showNewDept, setShowNewDept] = React.useState(departments.length === 0);
  const [newDeptName, setNewDeptName] = React.useState('');
  const [newDeptCode, setNewDeptCode] = React.useState('');
  const [savingDept, setSavingDept] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLocalDepartments(departments);
    if (!departmentId && departments[0]?.id) {
      setDepartmentId(departments[0].id);
    }
  }, [departments, departmentId]);

  React.useEffect(() => {
    setDepartmentId(editingDesignation?.department_id || localDepartments[0]?.id || '');
    setName(editingDesignation?.name || '');
    setCode(editingDesignation?.code || '');
    setMaxDiscountPct(editingDesignation?.max_pos_discount_pct || '5');
  }, [editingDesignation, localDepartments]);

  const handleCreateDepartment = async () => {
    const cleanName = newDeptName.trim();
    if (!cleanName) {
      toast.error('Department name is required');
      return;
    }
    setSavingDept(true);
    try {
      const created = await apiFetch<DepartmentRow>('/api/v1/access/departments', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          code: newDeptCode.trim().toUpperCase(),
        }),
      });
      setLocalDepartments((prev) => [...prev, created]);
      setDepartmentId(created.id);
      setNewDeptName('');
      setNewDeptCode('');
      setShowNewDept(false);
      toast.success(`Department "${created.name}" created`);
      await queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] });
    } catch (err: any) {
      toast.error(err.message || 'Unable to create department');
    } finally {
      setSavingDept(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      toast.error('Designation title is required');
      return;
    }
    if (!departmentId) {
      toast.error('Please select or create a department first');
      return;
    }

    const numericDisc = Number(maxDiscountPct);
    const sanitizedDisc =
      Number.isFinite(numericDisc) && numericDisc >= 0 && numericDisc <= 100
        ? numericDisc.toFixed(2)
        : '0.00';

    setSaving(true);
    try {
      const payload = {
        department_id: departmentId,
        code:
          code.trim().toUpperCase() ||
          cleanName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, ''),
        name: cleanName,
        max_pos_discount_pct: sanitizedDisc,
      };
      const saved = editingDesignation?.id
        ? await apiFetch<DesignationRow>(`/api/v1/access/designations/${editingDesignation.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch<DesignationRow>('/api/v1/access/designations', {
            method: 'POST',
            body: JSON.stringify(payload),
          });

      toast.success(
        editingDesignation
          ? `Updated designation "${saved.name}"`
          : `Created designation "${saved.name}" (max ${saved.max_pos_discount_pct}% POS disc)`
      );
      await queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] });
      onSaved?.(saved.id, saved.name);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save designation');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3" data-testid={`${testIdPrefix}-form`}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-ink">Department</label>
          <button
            type="button"
            onClick={() => setShowNewDept((v) => !v)}
            className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
            data-testid={`${testIdPrefix}-toggle-dept-btn`}
          >
            <Plus className="h-3 w-3" />
            {showNewDept ? 'Use Existing Dept' : 'New Department'}
          </button>
        </div>

        {showNewDept ? (
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/65 p-2.5 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Dept Name (e.g., Floor Sales)"
                data-testid={`${testIdPrefix}-new-dept-name`}
              />
              <Input
                value={newDeptCode}
                onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                placeholder="Code (optional, e.g. SALES)"
                className="font-mono uppercase"
              />
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="lavender"
                disabled={savingDept}
                onClick={handleCreateDepartment}
                data-testid={`${testIdPrefix}-save-dept-btn`}
              >
                {savingDept ? 'Saving...' : 'Create Department'}
              </Button>
            </div>
          </div>
        ) : (
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger data-testid={`${testIdPrefix}-dept-select`}>
              <SelectValue placeholder="Select Department" />
            </SelectTrigger>
            <SelectContent>
              {localDepartments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-ink">Designation Title</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Senior Cashier"
            required
            data-testid={`${testIdPrefix}-name-input`}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-ink">Designation Code</label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g., SNR_CASHIER"
            className="font-mono uppercase"
            data-testid={`${testIdPrefix}-code-input`}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-[11px] font-semibold text-ink">
          Max POS Cashier Discount Cap (%)
        </label>
        <div className="relative">
          <Input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={maxDiscountPct}
            onChange={(e) => setMaxDiscountPct(e.target.value)}
            className="pr-8 font-mono tabular-nums"
            data-testid={`${testIdPrefix}-discount-input`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-muted">
            %
          </span>
        </div>
        <p className="text-[10.5px] text-ink-muted">
          Discounts above this threshold require a 6-digit Supervisor PIN at POS checkout.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <DynamicButton
          type="submit"
          variant="obsidian"
          loading={saving}
          icon={<Briefcase className="h-3.5 w-3.5" />}
          data-testid={`${testIdPrefix}-save-btn`}
        >
          {editingDesignation ? 'Save Designation' : 'Create Designation'}
        </DynamicButton>
      </div>
    </form>
  );
}

interface DesignationEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: DepartmentRow[];
  editingDesignation?: DesignationRow | null;
  onSaved?: (designationId: string, designationName: string) => void;
}

export function DesignationEditorDialog({
  open,
  onOpenChange,
  departments,
  editingDesignation,
  onSaved,
}: DesignationEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>
            {editingDesignation
              ? `Edit Designation: ${editingDesignation.name}`
              : 'Create Staff Designation & Department'}
          </DialogTitle>
          <DialogDescription>
            Link a staff job title to a department and define its maximum POS discount authority.
          </DialogDescription>
        </DialogHeader>
        <DesignationEditorForm
          departments={departments}
          editingDesignation={editingDesignation}
          onCancel={() => onOpenChange(false)}
          onSaved={(id, name) => {
            onOpenChange(false);
            onSaved?.(id, name);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

