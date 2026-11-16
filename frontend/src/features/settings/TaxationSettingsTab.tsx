import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Pencil,
  Percent,
  Plus,
  Receipt,
  Save,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { confirmAction, confirmDestructiveAction } from '@/lib/swal';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

interface TaxGroupRow {
  id: string;
  business_id: string;
  code: string;
  name: string;
  is_default: boolean;
}

interface TaxRuleDetailedRow {
  id: string;
  business_id: string;
  tax_group_id: string;
  tax_group_code: string;
  tax_group_name: string;
  code: string;
  name: string;
  tax_type: string;
  rate_percent: string;
  priority: number;
  is_active: boolean;
}

interface TaxGroupsResponse {
  tax_groups: TaxGroupRow[];
  tax_rules: TaxRuleDetailedRow[];
  tax_registration_no: string;
  rounding_mode: string;
}

interface TaxationSettingsTabProps {
  onTaxConfigUpdated?: () => void;
}

/**
 * Multi-Tier Taxation Studio & Sri Lankan IRD Tax Engine Controls (VAT 18% + SSCL 2.5%).
 * Lets authorized operators inspect & configure Tax Groups, Multi-Tier Tax Rules,
 * VAT Registration Numbers, Rounding Modes, and one-click Sri Lanka statutory presets.
 */
export function TaxationSettingsTab({ onTaxConfigUpdated }: TaxationSettingsTabProps) {
  const queryClient = useQueryClient();
  const { context, updateBusinessContext, setResolvedSettings } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tax-groups', context?.business_id],
    queryFn: () => apiFetch<TaxGroupsResponse>('/api/v1/tax-groups'),
    placeholderData: keepPreviousData,
    enabled: Boolean(context?.business_id),
  });

  // Sri Lankan IRD Tax Preset form state
  const [slApplyVat, setSlApplyVat] = React.useState(false);
  const [slApplySscl, setSlApplySscl] = React.useState(false);
  const [slVatRegNo, setSlVatRegNo] = React.useState('');
  const [slRoundingMode, setSlRoundingMode] = React.useState('HALF_UP');
  const [slApplyCategories, setSlApplyCategories] = React.useState(true);
  const [savingPreset, setSavingPreset] = React.useState(false);

  // Tax Group modal state
  const [groupDialogOpen, setGroupDialogOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<TaxGroupRow | null>(null);
  const [groupCode, setGroupCode] = React.useState('');
  const [groupName, setGroupName] = React.useState('');
  const [groupIsDefault, setGroupIsDefault] = React.useState(false);
  const [savingGroup, setSavingGroup] = React.useState(false);

  // Tax Rule modal state
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<TaxRuleDetailedRow | null>(null);
  const [ruleGroupId, setRuleGroupId] = React.useState('');
  const [ruleCode, setRuleCode] = React.useState('');
  const [ruleName, setRuleName] = React.useState('');
  const [ruleType, setRuleType] = React.useState('PERCENTAGE');
  const [ruleRate, setRuleRate] = React.useState('18.00');
  const [rulePriority, setRulePriority] = React.useState('1');
  const [ruleActive, setRuleActive] = React.useState(true);
  const [savingRule, setSavingRule] = React.useState(false);

  React.useEffect(() => {
    if (!data) return;
    setSlVatRegNo(data.tax_registration_no || '');
    setSlRoundingMode(data.rounding_mode || 'HALF_UP');

    const rules = data.tax_rules || [];
    const vatRule = rules.find(
      (r) =>
        r.is_active &&
        (r.code.toUpperCase().includes('VAT') || r.name.toUpperCase().includes('VAT'))
    );
    const ssclRule = rules.find(
      (r) =>
        r.is_active &&
        (r.code.toUpperCase().includes('SSCL') || r.name.toUpperCase().includes('SSCL'))
    );
    setSlApplyVat(Boolean(vatRule));
    setSlApplySscl(Boolean(ssclRule));
  }, [data]);

  const invalidateAllTaxCaches = async () => {
    onTaxConfigUpdated?.();
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: ['tax-groups', context?.business_id] }),
      queryClient.invalidateQueries({ queryKey: ['company-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['settings-resolved'] }),
      queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] }),
    ]);
  };

  const handleApplySLPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirmAction({
      title: 'Apply Sri Lankan Tax Preset & Cache Settings?',
      text: `Updates VAT (18%): ${slApplyVat ? 'ON' : 'OFF'}, SSCL (2.5%): ${
        slApplySscl ? 'ON' : 'OFF'
      }, Rounding: ${slRoundingMode}. Applies immediately to POS checkout and IRD receipts.`,
      confirmLabel: 'Apply & Cache Tax Rules',
    });
    if (!ok) return;

    setSavingPreset(true);
    try {
      await apiFetch('/api/v1/tax-groups/sl-preset', {
        method: 'POST',
        body: JSON.stringify({
          apply_vat: slApplyVat,
          apply_sscl: slApplySscl,
          tax_registration_no: slVatRegNo.trim(),
          rounding_mode: slRoundingMode,
          apply_to_all_categories: slApplyCategories,
        }),
      });
      setResolvedSettings({ 'tax.rounding_mode': JSON.stringify(slRoundingMode) });
      updateBusinessContext({ tax_registration_no: slVatRegNo.trim() });
      toast.success('Sri Lankan tax schedule & rounding settings applied and cached');
      await invalidateAllTaxCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to apply Sri Lankan tax preset');
    } finally {
      setSavingPreset(false);
    }
  };

  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupCode('');
    setGroupName('');
    setGroupIsDefault(false);
    setGroupDialogOpen(true);
  };

  const openEditGroup = (group: TaxGroupRow) => {
    setEditingGroup(group);
    setGroupCode(group.code);
    setGroupName(group.name);
    setGroupIsDefault(group.is_default);
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error('Tax group name is required');
      return;
    }
    setSavingGroup(true);
    try {
      const payload = {
        code: groupCode.trim().toUpperCase(),
        name: groupName.trim(),
        is_default: groupIsDefault,
      };
      if (editingGroup) {
        await apiFetch(`/api/v1/tax-groups/${editingGroup.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated tax group "${payload.name}"`);
      } else {
        await apiFetch('/api/v1/tax-groups', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created tax group "${payload.name}"`);
      }
      setGroupDialogOpen(false);
      await invalidateAllTaxCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save tax group');
    } finally {
      setSavingGroup(false);
    }
  };

  const openCreateRule = () => {
    const defaultGroup = data?.tax_groups.find((g) => g.is_default) || data?.tax_groups[0];
    setEditingRule(null);
    setRuleGroupId(defaultGroup?.id || '');
    setRuleCode('');
    setRuleName('');
    setRuleType('PERCENTAGE');
    setRuleRate('18.00');
    setRulePriority('1');
    setRuleActive(true);
    setRuleDialogOpen(true);
  };

  const openEditRule = (rule: TaxRuleDetailedRow) => {
    setEditingRule(rule);
    setRuleGroupId(rule.tax_group_id);
    setRuleCode(rule.code);
    setRuleName(rule.name);
    setRuleType(rule.tax_type || 'PERCENTAGE');
    setRuleRate(rule.rate_percent || '0.00');
    setRulePriority(String(rule.priority || 1));
    setRuleActive(rule.is_active);
    setRuleDialogOpen(true);
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleGroupId) {
      toast.error('Please select a tax group');
      return;
    }
    if (!ruleName.trim()) {
      toast.error('Tax rule name is required');
      return;
    }
    const parsedRate = Number(ruleRate);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      toast.error('Valid non-negative tax rate is required');
      return;
    }
    const parsedPriority = parseInt(rulePriority, 10) || 1;

    setSavingRule(true);
    try {
      const payload = {
        tax_group_id: ruleGroupId,
        code:
          ruleCode.trim().toUpperCase() ||
          ruleName
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '_'),
        name: ruleName.trim(),
        tax_type: ruleType,
        rate_percent: parsedRate.toFixed(4),
        priority: parsedPriority,
        is_active: ruleActive,
      };
      if (editingRule) {
        await apiFetch(`/api/v1/tax-rules/${editingRule.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast.success(`Updated tax rule "${payload.name}"`);
      } else {
        await apiFetch('/api/v1/tax-rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created tax rule "${payload.name}"`);
      }
      setRuleDialogOpen(false);
      await invalidateAllTaxCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save tax rule');
    } finally {
      setSavingRule(false);
    }
  };

  const handleToggleRuleActive = async (rule: TaxRuleDetailedRow, nextActive: boolean) => {
    try {
      await apiFetch(`/api/v1/tax-rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          tax_group_id: rule.tax_group_id,
          code: rule.code,
          name: rule.name,
          tax_type: rule.tax_type,
          rate_percent: rule.rate_percent,
          priority: rule.priority,
          is_active: nextActive,
        }),
      });
      toast.success(`${rule.name} ${nextActive ? 'enabled' : 'disabled'}`);
      await invalidateAllTaxCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to toggle tax rule');
    }
  };

  const handleDeleteRule = async (rule: TaxRuleDetailedRow) => {
    const ok = await confirmDestructiveAction({
      title: `Delete Tax Rule "${rule.name}"?`,
      text: 'This removes the tax tier from future invoices while preserving posted GL journal snapshots.',
      confirmLabel: 'Delete Tax Rule',
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/v1/tax-rules/${rule.id}`, { method: 'DELETE' });
      toast.success(`Deleted tax rule "${rule.name}"`);
      await invalidateAllTaxCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to delete tax rule');
    }
  };

  const activeRules = (data?.tax_rules || []).filter((r) => r.is_active);
  const combinedPct = activeRules
    .filter((r) => r.tax_type.toUpperCase() !== 'FIXED')
    .reduce((acc, r) => acc + (parseFloat(r.rate_percent) || 0), 0);

  return (
    <div className="space-y-4" data-testid="taxation-settings-panel">
      {/* Row 1: Sri Lanka IRD VAT & SSCL Preset + Active Tax Summary (2-Col Symmetrical Bento) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-stretch">
        <form
          onSubmit={handleApplySLPreset}
          className="zona-card lg:col-span-2 flex flex-col justify-between p-4 sm:p-5 space-y-4"
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-bold text-ink">
                  Sri Lanka IRD VAT &amp; SSCL Tax Configuration
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  One-click compliance preset for IRD Standard VAT (18.0%), Social Security Contribution Levy (SSCL 2.5%), VAT Reg No, and rounding rules.
                </p>
              </div>
              <Badge variant="lavender" className="tabular-nums">
                {activeRules.length} Active Tiers ({combinedPct.toFixed(2)}%)
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="sl-tax-vat-reg"
                  className="text-[11px] font-semibold text-ink"
                >
                  IRD VAT / TIN Registration No
                </label>
                <Input
                  id="sl-tax-vat-reg"
                  value={slVatRegNo}
                  onChange={(e) => setSlVatRegNo(e.target.value)}
                  placeholder="e.g., 100234567-7000"
                  className="font-mono tabular-nums"
                  data-testid="tax-vat-reg-input"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  Tax Rounding Strategy
                </label>
                <Select value={slRoundingMode} onValueChange={setSlRoundingMode}>
                  <SelectTrigger data-testid="tax-rounding-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HALF_UP">Half Up — Commercial Standard</SelectItem>
                    <SelectItem value="HALF_EVEN">Half Even — Banker&apos;s Rounding</SelectItem>
                    <SelectItem value="UP">Round Up — Always Ceiling</SelectItem>
                    <SelectItem value="DOWN">Round Down — Floor / Truncate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-3">
                <div>
                  <p className="text-xs font-bold text-ink">Apply VAT (18%)</p>
                  <p className="text-[10.5px] text-ink-muted">IRD Standard Rate</p>
                </div>
                <Switch
                  checked={slApplyVat}
                  onCheckedChange={setSlApplyVat}
                  data-testid="tax-sl-vat-switch"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-3">
                <div>
                  <p className="text-xs font-bold text-ink">Apply SSCL (2.5%)</p>
                  <p className="text-[10.5px] text-ink-muted">Turnover Levy Tier</p>
                </div>
                <Switch
                  checked={slApplySscl}
                  onCheckedChange={setSlApplySscl}
                  data-testid="tax-sl-sscl-switch"
                />
              </div>

              <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-3">
                <div>
                  <p className="text-xs font-bold text-ink">Sync Categories</p>
                  <p className="text-[10.5px] text-ink-muted">Bind default group</p>
                </div>
                <Switch
                  checked={slApplyCategories}
                  onCheckedChange={setSlApplyCategories}
                  data-testid="tax-sl-sync-cat-switch"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-theme pt-3">
            <p className="text-[11px] text-ink-muted">
              SL Preset Preview (Rs. 1,000.00 subtotal) &rarr;{' '}
              <span className="font-mono font-bold text-ink tabular-nums">
                Tax Rs. {slApplyVat && slApplySscl ? '205.00' : slApplyVat ? '180.00' : slApplySscl ? '25.00' : '0.00'}
              </span>{' '}
              (printed itemized on POS receipts &amp; GL Credit 2100).
            </p>
            <Can permission="accounting:tax_manage">
              <DynamicButton
                type="submit"
                variant="obsidian"
                disabled={savingPreset}
                icon={<Save className="h-3.5 w-3.5" />}
                data-testid="apply-sl-tax-preset-btn"
              >
                {savingPreset ? 'Applying Preset...' : 'Apply & Cache SL Tax Preset'}
              </DynamicButton>
            </Can>
          </div>
        </form>

        {/* Column 3: Tax Groups Summary & Quick Add */}
        <section className="zona-card flex flex-col justify-between p-4 sm:p-5 space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-[13px] font-bold text-ink">Tax Groups</h3>
                <p className="text-[11px] text-ink-muted">
                  Assigned at Category or Product SKU level.
                </p>
              </div>
              <Can permission="accounting:tax_manage">
                <Button
                  type="button"
                  size="xs"
                  variant="lavender"
                  onClick={openCreateGroup}
                  data-testid="add-tax-group-btn"
                >
                  <Plus className="h-3 w-3" />
                  New Group
                </Button>
              </Can>
            </div>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5">
              {(data?.tax_groups || []).length === 0 ? (
                <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme p-4 text-center text-xs text-ink-muted">
                  No custom tax groups configured yet.
                </div>
              ) : (
                (data?.tax_groups || []).map((grp) => (
                  <div
                    key={grp.id}
                    className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/65 px-3 py-2"
                    data-testid={`tax-group-card-${grp.code}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs font-bold text-ink">{grp.name}</p>
                        {grp.is_default && (
                          <Badge variant="positive" className="text-[9.5px]">
                            <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-[10px] text-ink-muted">{grp.code}</p>
                    </div>
                    <Can permission="accounting:tax_manage">
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => openEditGroup(grp)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </Can>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted p-2.5 text-[10.5px] text-ink-muted">
            <Receipt className="mr-1.5 inline h-3.5 w-3.5 text-accent" />
            GL Liability Account <code className="font-mono font-bold text-ink">2100</code> credits exact decimal tax totals in real time.
          </div>
        </section>
      </div>

      {/* Row 2: Full Multi-Tier Tax Rules Matrix */}
      <section className="zona-card p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[13.5px] font-bold text-ink">Multi-Tier Tax Rules</h3>
            <p className="text-[11px] text-ink-muted">
              Ordered by Priority. Every active rule attached to a product&apos;s Tax Group executes cleanly via `shopspring/decimal` at POS checkout.
            </p>
          </div>
          <Can permission="accounting:tax_manage">
            <DynamicButton
              variant="lavender"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={openCreateRule}
              data-testid="add-tax-rule-btn"
            >
              Add Tax Rule
            </DynamicButton>
          </Can>
        </div>

        <Table data-testid="tax-rules-table">
          <TableHeader>
            <TableRow>
              <TableHead>Rule Name &amp; Code</TableHead>
              <TableHead>Tax Group</TableHead>
              <TableHead>Calculation Type</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-center">Priority</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                  Loading tax rules...
                </TableCell>
              </TableRow>
            ) : (data?.tax_rules || []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                  No tax rules defined yet. Apply the Sri Lankan preset above or add a custom tax tier.
                </TableCell>
              </TableRow>
            ) : (
              (data?.tax_rules || []).map((rule) => (
                <TableRow key={rule.id} data-testid={`tax-rule-row-${rule.code}`}>
                  <TableCell>
                    <p className="text-xs font-bold text-ink">{rule.name}</p>
                    <p className="text-[10px] font-medium text-ink-muted">{formatDisplayLabel(rule.code)}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{rule.tax_group_name}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium text-ink">{formatDisplayLabel(rule.tax_type)}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold tabular-nums text-ink">
                    {parseFloat(rule.rate_percent).toFixed(2)}
                    {rule.tax_type.toUpperCase() === 'FIXED' ? '' : '%'}
                  </TableCell>
                  <TableCell className="text-center font-mono tabular-nums text-xs text-ink-muted">
                    #{rule.priority}
                  </TableCell>
                  <TableCell className="text-center">
                    <Can
                      permission="accounting:tax_manage"
                      fallback={
                        <Badge variant={rule.is_active ? 'positive' : 'outline'}>
                          {rule.is_active ? 'Active' : 'Off'}
                        </Badge>
                      }
                    >
                      <Switch
                        checked={rule.is_active}
                        onCheckedChange={(checked) => handleToggleRuleActive(rule, checked)}
                        aria-label={`Toggle tax rule ${rule.name}`}
                        data-testid={`tax-rule-switch-${rule.code}`}
                      />
                    </Can>
                  </TableCell>
                  <TableCell className="text-right">
                    <Can permission="accounting:tax_manage">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          type="button"
                          size="xs"
                          variant="info"
                          onClick={() => openEditRule(rule)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="destructive"
                          onClick={() => handleDeleteRule(rule)}
                          data-testid={`delete-tax-rule-${rule.code}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </Can>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {/* Create / Edit Tax Group Modal */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingGroup ? 'Edit Tax Group' : 'Create Tax Group'}</DialogTitle>
            <DialogDescription>
              Group tax rules together for Categories or Product SKUs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveGroup} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Tax Group Name</label>
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g., Standard Taxable Goods"
                required
                data-testid="tax-group-name-input"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Group Code</label>
              <Input
                value={groupCode}
                onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
                placeholder="e.g., Standard Tax"
                className="font-mono uppercase"
                data-testid="tax-group-code-input"
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2">
              <span className="text-xs font-semibold text-ink">Set as Default Business Tax Group</span>
              <Switch checked={groupIsDefault} onCheckedChange={setGroupIsDefault} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setGroupDialogOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingGroup}>
                {editingGroup ? 'Save Group' : 'Create Group'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Multi-Tier Tax Rule Modal */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{editingRule ? `Edit Tax Rule: ${editingRule.name}` : 'Add Tax Rule'}</DialogTitle>
            <DialogDescription>
              Configure percentage or fixed levy tier calculated accurately at POS checkout.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRule} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Parent Tax Group</label>
              <Select value={ruleGroupId} onValueChange={setRuleGroupId}>
                <SelectTrigger data-testid="tax-rule-group-select">
                  <SelectValue placeholder="Select Tax Group" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.tax_groups || []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({formatDisplayLabel(g.code)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Rule Name</label>
                <Input
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g., Service Charge"
                  required
                  data-testid="tax-rule-name-input"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Rule Code</label>
                <Input
                  value={ruleCode}
                  onChange={(e) => setRuleCode(e.target.value.toUpperCase())}
                  placeholder="e.g., Service 10"
                  className="font-mono uppercase"
                  data-testid="tax-rule-code-input"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Type</label>
                <Select value={ruleType} onValueChange={setRuleType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENTAGE">PERCENTAGE (%)</SelectItem>
                    <SelectItem value="FIXED">FIXED AMOUNT</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Rate (%)</label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ruleRate}
                    onChange={(e) => setRuleRate(e.target.value)}
                    className="pr-7 font-mono tabular-nums"
                    data-testid="tax-rule-rate-input"
                  />
                  <Percent className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-muted" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Priority</label>
                <Input
                  type="number"
                  min="1"
                  value={rulePriority}
                  onChange={(e) => setRulePriority(e.target.value)}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2">
              <span className="text-xs font-semibold text-ink">Active at POS Checkout</span>
              <Switch checked={ruleActive} onCheckedChange={setRuleActive} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingRule} data-testid="tax-rule-save-btn">
                {editingRule ? 'Save Rule' : 'Add Tax Rule'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

