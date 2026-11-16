import * as React from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe,
  KeyRound,
  Layers3,
  Lock,
  Monitor,
  Package,
  Palette,
  Pencil,
  Percent,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Sliders,
  Store,
  Tags,
  UserPlus,
} from 'lucide-react';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  SortableTableHead,
} from '@/components/ui/table';
import {
  DataTablePagination,
  usePagination,
  useSortableData,
} from '@/components/ui/data-table-pagination';
import { MagneticDropZone } from '@/components/dqnamo/MagneticDropZone';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton';
import { Can } from '@/features/auth/Can';
import { apiFetch } from '@/lib/api';
import { isMultiBranchRole } from '@/lib/branchAccess';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { confirmAction, confirmDestructiveAction } from '@/lib/swal';
import { useAuthStore } from '@/store/authStore';
import { BranchesTerminalsTab } from './BranchesTerminalsTab';
import {
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
  useI18nStore,
  useT,
} from '@/store/i18nStore';
import {
  CORNER_PRESETS,
  LIGHT_THEMES,
  POS_THEMES,
  useThemeStore,
  type CornerPreset,
} from '@/store/themeStore';
import { toast } from 'sonner';
import type { POSBootstrapResponse } from '../pos/types';
import {
  INDUSTRY_PRESETS,
  isSettingRelevantForIndustry,
  normalizeIndustryMode,
  type IndustryLayoutMode,
} from '../pos/components/capabilities';
import { TaxationSettingsTab } from './TaxationSettingsTab';
import { SessionsSecurityTab } from './SessionsSecurityTab';
import {
  DesignationEditorDialog,
  RoleEditorDialog,
  type AccessUserRow,
  type AccessUsersResponse,
  type DesignationRow,
  type RoleEditorTarget,
} from '../rbac/RoleDesignationModals';

type ScopeLevel = 'SYSTEM' | 'BUSINESS' | 'BRANCH' | 'TERMINAL' | 'CATEGORY' | 'PRODUCT';

interface ResolvedSettingDTO {
  key: string;
  label: string;
  category: string;
  description: string;
  value_type: string;
  effective_json: string;
  inherited_from: ScopeLevel;
  scope_target_id?: string;
  is_overridden: boolean;
}

interface RoleMatrixDTO {
  role_id: string;
  role_code: string;
  role_name: string;
  description: string;
  permissions: string[];
}

interface SettingsResponse {
  settings: ResolvedSettingDTO[];
  roles: RoleMatrixDTO[];
  cache_source?: string;
  cached_at?: string;
}

interface CompanySettingsResponse {
  profile: {
    id: string;
    name: string;
    trade_name?: string;
    legal_name: string;
    tax_registration_no: string;
    base_currency: string;
    logo_light_url?: string;
    logo_dark_url?: string;
    logo_receipt_url?: string;
    primary_color_hex?: string;
    default_language?: string;
  };
  require_po_approval: boolean;
  require_grn_approval: boolean;
}

interface AccountingPeriodsResponse {
  fiscal_periods?: Array<{
    id: string;
    period_name: string;
    start_date: string;
    end_date: string;
    is_locked: boolean;
  }>;
}

const SCOPE_ORDER: ScopeLevel[] = [
  'SYSTEM',
  'BUSINESS',
  'BRANCH',
  'TERMINAL',
  'CATEGORY',
  'PRODUCT',
];

const SCOPE_META: Record<
  ScopeLevel,
  { label: string; hint: string; icon: React.ComponentType<{ className?: string }> }
> = {
  SYSTEM: { label: 'System Default', hint: 'Global baseline', icon: Globe },
  BUSINESS: { label: 'Business', hint: 'Company-wide', icon: Building2 },
  BRANCH: { label: 'Branch', hint: 'Store location', icon: Store },
  TERMINAL: { label: 'Terminal', hint: 'POS register', icon: Monitor },
  CATEGORY: { label: 'Category', hint: 'Product group', icon: Tags },
  PRODUCT: { label: 'Product SKU', hint: 'Item override', icon: Package },
};

interface SettingSelectOption {
  value: string;
  label: string;
  shortLabel?: string;
}

const SETTING_OPTIONS_MAP: Record<
  string,
  {
    options?: SettingSelectOption[];
    presets?: Array<{ value: string; label: string }>;
    unit?: string;
    trueLabel?: string;
    falseLabel?: string;
  }
> = {
  'accounting.base_currency': {
    options: [
      { value: 'USD', label: 'USD — US Dollar ($)', shortLabel: 'USD' },
      { value: 'LKR', label: 'LKR — Sri Lankan Rupee (Rs)', shortLabel: 'LKR' },
      { value: 'EUR', label: 'EUR — Euro (€)', shortLabel: 'EUR' },
      { value: 'GBP', label: 'GBP — British Pound (£)', shortLabel: 'GBP' },
      { value: 'INR', label: 'INR — Indian Rupee (₹)', shortLabel: 'INR' },
      { value: 'AUD', label: 'AUD — Australian Dollar (A$)', shortLabel: 'AUD' },
      { value: 'SGD', label: 'SGD — Singapore Dollar (S$)', shortLabel: 'SGD' },
    ],
  },
  'system.default_language': {
    options: [
      { value: 'en', label: 'EN — English', shortLabel: 'English' },
      { value: 'si', label: 'සිං — Sinhala (සිංහල)', shortLabel: 'සිංහල' },
      { value: 'ta', label: 'தமி — Tamil (தமிழ்)', shortLabel: 'தமிழ்' },
    ],
  },
  'pos.thermal_paper_width': {
    options: [
      { value: '80mm', label: '80mm — Wide Thermal Receipt', shortLabel: '80mm' },
      { value: '76.2mm', label: '76.2mm — Standard Impact Roll', shortLabel: '76.2mm' },
      { value: '58mm', label: '58mm — Compact Pocket / Bt', shortLabel: '58mm' },
    ],
  },
  'tax.rounding_mode': {
    options: [
      { value: 'HALF_UP', label: 'Half Up — Commercial Standard', shortLabel: 'Half Up' },
      { value: 'HALF_EVEN', label: "Half Even — Banker's Rounding", shortLabel: 'Half Even' },
      { value: 'UP', label: 'Round Up — Always Ceiling', shortLabel: 'Round Up' },
      { value: 'DOWN', label: 'Round Down — Floor / Truncate', shortLabel: 'Round Down' },
    ],
  },
  'pos.max_cashier_discount_pct': {
    unit: '%',
    presets: [
      { value: '0', label: '0%' },
      { value: '5', label: '5%' },
      { value: '10', label: '10%' },
      { value: '15', label: '15%' },
      { value: '20', label: '20%' },
      { value: '25', label: '25%' },
    ],
  },
  'pos.loyalty_points_per_unit': {
    unit: 'pts',
    presets: [
      { value: '0', label: 'Off (0)' },
      { value: '1', label: '1 pt' },
      { value: '2', label: '2 pts' },
      { value: '5', label: '5 pts' },
      { value: '10', label: '10 pts' },
    ],
  },
  'pos.allow_negative_fifo_stock': {
    trueLabel: 'Allow Oversell',
    falseLabel: 'Strict Block',
  },
  'pos.auto_kick_cash_drawer': {
    trueLabel: 'Auto-Kick Pulse',
    falseLabel: 'Manual Only',
  },
  'inventory.auto_po_on_low_stock': {
    trueLabel: 'Auto-Draft PO',
    falseLabel: 'Manual Reorder',
  },
  'warehouse.po.require_approval': {
    trueLabel: 'Require Sign-off',
    falseLabel: 'Instant Issue',
  },
  'warehouse.grn.require_approval': {
    trueLabel: 'Review Queue',
    falseLabel: 'Direct FIFO Post',
  },
  'pos.ui.layout_mode': {
    options: [
      { value: 'retail', label: 'retail — Fashion & Retail (Matrix Variants)', shortLabel: 'Retail' },
      { value: 'restaurant', label: 'restaurant — Restaurant & F&B (Tables & KOT)', shortLabel: 'Restaurant' },
      { value: 'hardware', label: 'hardware — Hardware & Building (Fractional / UOM)', shortLabel: 'Hardware' },
      { value: 'garage', label: 'garage — Auto Service & Garage (Bays & Plate)', shortLabel: 'Garage' },
      { value: 'mobile', label: 'mobile — Mobile & Electronics (Mandatory IMEI)', shortLabel: 'Mobile' },
      { value: 'stationery', label: 'stationery — Stationery & High-Velocity (7-Col Grid)', shortLabel: 'Stationery' },
    ],
  },
  'pos.layout.fullscreen_on_load': {
    trueLabel: 'Auto-Fullscreen',
    falseLabel: 'Windowed Shell',
  },
  'pos.layout.show_categories_pane': {
    trueLabel: 'Show Pane 1',
    falseLabel: 'Hide Pane 1',
  },
  'pos.layout.show_outgoing_orders_pane': {
    trueLabel: 'Show Pane 3',
    falseLabel: 'Expand Grid (7 Cols)',
  },
  'pos.layout.footer_quick_edit_sidebar': {
    trueLabel: 'Show Quick-Edit',
    falseLabel: 'Hide Quick-Edit',
  },
  'pos.features.enable_tables': {
    trueLabel: 'Dining Tables On',
    falseLabel: 'Counter Only',
  },
  'pos.features.enable_kot': {
    trueLabel: 'Kitchen KOT On',
    falseLabel: 'KOT Off',
  },
  'pos.features.allow_fractional_qty': {
    trueLabel: 'Decimal Qty On',
    falseLabel: 'Integer Qty',
  },
  'pos.features.multi_uom_toggle': {
    trueLabel: 'Multi-UOM On',
    falseLabel: 'Base UOM Only',
  },
  'pos.features.require_vehicle_plate': {
    trueLabel: 'Plate Mandatory',
    falseLabel: 'Plate Optional',
  },
  'pos.features.split_labor_parts': {
    trueLabel: 'Split Parts / Labor',
    falseLabel: 'Unified List',
  },
  'pos.features.matrix_variants': {
    trueLabel: 'Variant Picker On',
    falseLabel: 'Flat SKUs',
  },
  'pos.features.require_serial_imei': {
    trueLabel: 'IMEI Mandatory',
    falseLabel: 'Serial Optional',
  },
  'pos.features.enable_bundles': {
    trueLabel: 'Bundles Enabled',
    falseLabel: 'Bundles Off',
  },
  'security.session.ttl_hours': {
    unit: 'hrs',
    presets: [
      { value: '8', label: '8h Shift' },
      { value: '12', label: '12h Day' },
      { value: '24', label: '24h Standard' },
      { value: '72', label: '3 Days' },
      { value: '168', label: '7 Days' },
    ],
  },
  'security.session.idle_timeout_minutes': {
    unit: 'min',
    presets: [
      { value: '15', label: '15m Strict' },
      { value: '30', label: '30m Register' },
      { value: '60', label: '1 Hour' },
      { value: '240', label: '4 Hours' },
      { value: '480', label: '8h Shift' },
    ],
  },
  'security.session.max_concurrent': {
    unit: 'sess',
    presets: [
      { value: '1', label: 'Single (1)' },
      { value: '3', label: '3 Devices' },
      { value: '5', label: '5 Standard' },
      { value: '10', label: '10 Multi-Tab' },
      { value: '0', label: 'Unlimited' },
    ],
  },
  'security.rate_limit.enabled': {
    trueLabel: 'Enforced',
    falseLabel: 'Paused',
  },
  'security.rate_limit.api_rpm': {
    unit: 'rpm',
    presets: [
      { value: '60', label: '60 / min' },
      { value: '120', label: '120 / min' },
      { value: '240', label: '240 Std' },
      { value: '600', label: '600 High' },
    ],
  },
  'security.rate_limit.login_max_attempts': {
    unit: 'tries',
    presets: [
      { value: '5', label: '5 Strict' },
      { value: '10', label: '10 Std' },
      { value: '15', label: '15 Relaxed' },
    ],
  },
  'security.rate_limit.pin_max_attempts': {
    unit: 'tries',
    presets: [
      { value: '3', label: '3 Strict' },
      { value: '5', label: '5 Std' },
      { value: '10', label: '10 Relaxed' },
    ],
  },
};

const QUICK_ACCENT_SWATCHES = ['#7C5DFA', '#2563EB', '#10B981', '#F43F5E', '#D97706', '#141416'];

function extractInitials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || 'AD'
  );
}

export function SettingsInheritancePage() {
  const queryClient = useQueryClient();
  const {
    context,
    branches,
    terminals,
    requestedSettingsTab,
    setRequestedSettingsTab,
    updateBusinessContext,
    setResolvedSettings,
  } = useAuthStore();
  const canMultiBranch = isMultiBranchRole(context?.role_code);
  const { t } = useT();
  const {
    themeId,
    colorMode,
    setTheme,
    customAccent,
    customCanvas,
    customSurface,
    cornerPreset,
    setCustomAccent,
    setCustomCanvas,
    setCustomSurface,
    setCornerPreset,
    resetCustomAppearance,
  } = useThemeStore();

  const [activeScope, setActiveScope] = React.useState<ScopeLevel>('TERMINAL');
  const [branchId, setBranchId] = React.useState<string>(context?.branch_id || '');
  const [terminalId, setTerminalId] = React.useState<string>(context?.terminal_id || '');
  const [categoryId, setCategoryId] = React.useState<string>('');
  const [productId, setProductId] = React.useState<string>('');
  const [draftValues, setDraftValues] = React.useState<Record<string, string>>({});

  // Company & Org 3-Column Bento State
  const [companyName, setCompanyName] = React.useState('');
  const [tradeName, setTradeName] = React.useState('');
  const [legalName, setLegalName] = React.useState('');
  const [vatNo, setVatNo] = React.useState('');
  const [baseCurrency, setBaseCurrency] = React.useState('USD');
  const [defaultLanguage, setDefaultLanguage] = React.useState('en');
  const [primaryColorHex, setPrimaryColorHex] = React.useState('#877FC1');
  const [logoLight, setLogoLight] = React.useState('');
  const [logoDark, setLogoDark] = React.useState('');
  const [logoReceipt, setLogoReceipt] = React.useState('');
  const [requirePOApproval, setRequirePOApproval] = React.useState(false);
  const [requireGRNApproval, setRequireGRNApproval] = React.useState(false);
  const [savingCompany, setSavingCompany] = React.useState(false);
  const [lockPeriodId, setLockPeriodId] = React.useState('');
  const [lockDate, setLockDate] = React.useState<Date | undefined>(new Date());

  // Manage Access (row-wise logins, roles, designations), Branches & Taxation
  const [activeTab, setActiveTab] = React.useState<
    'company' | 'branches' | 'taxation' | 'inheritance' | 'rbac' | 'sessions'
  >('company');

  React.useEffect(() => {
    if (
      requestedSettingsTab &&
      (['company', 'branches', 'taxation', 'inheritance', 'rbac', 'sessions'] as const).includes(
        requestedSettingsTab as any
      )
    ) {
      setActiveTab(requestedSettingsTab as any);
      setRequestedSettingsTab(null);
    }
  }, [requestedSettingsTab, setRequestedSettingsTab]);
  const [showAllRoles, setShowAllRoles] = React.useState(true);
  const [roleModalOpen, setRoleModalOpen] = React.useState(false);
  const [editingRoleTarget, setEditingRoleTarget] = React.useState<RoleEditorTarget | null>(null);
  const [desigModalOpen, setDesigModalOpen] = React.useState(false);
  const [editingDesignation, setEditingDesignation] = React.useState<DesignationRow | null>(null);
  const [cacheSourceLabel, setCacheSourceLabel] = React.useState<string>('REDIS_CACHE');
  const [lastCachedAt, setLastCachedAt] = React.useState<string>('');
  const [appearanceDirty, setAppearanceDirty] = React.useState(false);
  const [accessSearch, setAccessSearch] = React.useState('');
  const [userModalOpen, setUserModalOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<AccessUserRow | null>(null);
  const [formFullName, setFormFullName] = React.useState('');
  const [formEmail, setFormEmail] = React.useState('');
  const [formPassword, setFormPassword] = React.useState('');
  const [formRoleId, setFormRoleId] = React.useState('');
  const [formDesigId, setFormDesigId] = React.useState('');
  const [formBranchId, setFormBranchId] = React.useState('ALL');
  const [formAllBranches, setFormAllBranches] = React.useState(false);
  const [formAllowedBranchIds, setFormAllowedBranchIds] = React.useState<string[]>([]);
  const [formAllowedTerminalIds, setFormAllowedTerminalIds] = React.useState<string[]>([]);
  const [formDefaultTerminalId, setFormDefaultTerminalId] = React.useState('AUTO');
  const [formActive, setFormActive] = React.useState(true);
  const [formPin, setFormPin] = React.useState('');
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = React.useState(false);
  const [inheritanceSearch, setInheritanceSearch] = React.useState('');
  const [inheritanceCategory, setInheritanceCategory] = React.useState<string>('ALL');
  const [inheritanceFilter, setInheritanceFilter] = React.useState<'ALL' | 'OVERRIDDEN' | 'INHERITED'>('ALL');
  const [accessRoleFilter, setAccessRoleFilter] = React.useState<string>('ALL');
  const [accessStatusFilter, setAccessStatusFilter] = React.useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  React.useEffect(() => {
    setBranchId(context?.branch_id || '');
    setTerminalId(context?.terminal_id || '');
    setCategoryId('');
    setProductId('');
  }, [context?.business_id, context?.branch_id, context?.terminal_id]);

  // Unified cache keys prevent extra fetches/flashes across tabs
  const { data: catalog } = useQuery({
    queryKey: ['pos-bootstrap', context?.business_id, context?.branch_id],
    queryFn: () => apiFetch<POSBootstrapResponse>('/api/v1/pos/bootstrap'),
  });

  const { data: companyData, refetch: refetchCompany } = useQuery({
    queryKey: ['company-settings', context?.business_id],
    queryFn: () => apiFetch<CompanySettingsResponse>('/api/v1/company/settings'),
  });

  const { data: accountingPeriods, refetch: refetchPeriods } = useQuery({
    queryKey: ['accounting', context?.business_id],
    queryFn: () => apiFetch<AccountingPeriodsResponse>('/api/v1/accounting'),
  });

  const { data: accessData } = useQuery({
    queryKey: ['access-users', context?.business_id],
    queryFn: () => apiFetch<AccessUsersResponse>('/api/v1/access/users'),
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (!companyData?.profile) return;
    setCompanyName(companyData.profile.name || '');
    setTradeName(companyData.profile.trade_name || companyData.profile.name || '');
    setLegalName(companyData.profile.legal_name || '');
    setVatNo(companyData.profile.tax_registration_no || '');
    setBaseCurrency(companyData.profile.base_currency || 'USD');
    setDefaultLanguage(normalizeLanguage(companyData.profile.default_language));
    setPrimaryColorHex(companyData.profile.primary_color_hex || '#877FC1');
    setLogoLight(companyData.profile.logo_light_url || '');
    setLogoDark(companyData.profile.logo_dark_url || '');
    setLogoReceipt(companyData.profile.logo_receipt_url || '');
    setRequirePOApproval(Boolean(companyData.require_po_approval));
    setRequireGRNApproval(Boolean(companyData.require_grn_approval));
  }, [companyData]);

  React.useEffect(() => {
    const openPeriod = accountingPeriods?.fiscal_periods?.find((p) => !p.is_locked);
    if (openPeriod) {
      setLockPeriodId(openPeriod.id);
    }
  }, [accountingPeriods]);

  const resolvedTargetId = React.useMemo(() => {
    switch (activeScope) {
      case 'SYSTEM':
        return null;
      case 'BUSINESS':
        return context?.business_id || null;
      case 'BRANCH':
        return branchId || context?.branch_id || null;
      case 'TERMINAL':
        return terminalId || context?.terminal_id || null;
      case 'CATEGORY':
        return categoryId || catalog?.categories?.[0]?.id || null;
      case 'PRODUCT':
        return productId || catalog?.products?.[0]?.id || null;
    }
  }, [activeScope, context, branchId, terminalId, categoryId, productId, catalog]);

  const queryParams = React.useMemo(() => {
    const p = new URLSearchParams();
    if (activeScope === 'BRANCH' || activeScope === 'TERMINAL') {
      if (branchId) p.set('branch_id', branchId);
    }
    if (activeScope === 'TERMINAL' && terminalId) p.set('terminal_id', terminalId);
    if (activeScope === 'CATEGORY' && (categoryId || catalog?.categories?.[0]?.id)) {
      p.set('category_id', categoryId || catalog?.categories?.[0]?.id || '');
    }
    if (activeScope === 'PRODUCT' && (productId || catalog?.products?.[0]?.id)) {
      p.set('product_id', productId || catalog?.products?.[0]?.id || '');
    }
    return p.toString();
  }, [activeScope, branchId, terminalId, categoryId, productId, catalog]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['settings-resolved', context?.business_id, activeScope, queryParams],
    queryFn: () =>
      apiFetch<SettingsResponse>(`/api/v1/settings/resolved?${queryParams}`),
    placeholderData: keepPreviousData,
  });

  React.useEffect(() => {
    if (!data?.settings) return;
    setResolvedSettings(data.settings);
    const next: Record<string, string> = {};
    for (const s of data.settings) {
      try {
        const parsed = JSON.parse(s.effective_json);
        next[s.key] = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      } catch {
        next[s.key] = s.effective_json;
      }
    }
    setDraftValues(next);
    if (data.cache_source) setCacheSourceLabel(data.cache_source);
    if (data.cached_at) setLastCachedAt(data.cached_at);
    if (context?.business_id) {
      try {
        localStorage.setItem(
          `zona_settings_cache:${context.business_id}:${activeScope}:${queryParams || 'default'}`,
          JSON.stringify({
            cached_at: data.cached_at || new Date().toISOString(),
            cache_source: data.cache_source || 'REDIS_CACHE',
            settings: data.settings,
          })
        );
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [data, context?.business_id, activeScope, queryParams]);

  const activeIndustryMode = React.useMemo<IndustryLayoutMode>(() => {
    const rawLayout = data?.settings?.find((x) => x.key === 'pos.ui.layout_mode')?.effective_json;
    let parsedLayout = '';
    if (rawLayout) {
      try {
        parsedLayout = String(JSON.parse(rawLayout));
      } catch {
        parsedLayout = rawLayout.replace(/"/g, '');
      }
    }
    return normalizeIndustryMode(context?.industry_profile || parsedLayout);
  }, [context?.industry_profile, data?.settings]);

  const industryScopedSettings = React.useMemo(() => {
    return (data?.settings || []).filter(
      (s) => s.key !== 'pos.ui.layout_mode' && isSettingRelevantForIndustry(s.key, activeIndustryMode)
    );
  }, [data?.settings, activeIndustryMode]);

  const inheritanceCategories = React.useMemo(() => {
    const cats = new Set<string>();
    industryScopedSettings.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return ['ALL', ...Array.from(cats)];
  }, [industryScopedSettings]);

  const filteredSettings = React.useMemo(() => {
    const q = inheritanceSearch.trim().toLowerCase();
    return industryScopedSettings.filter((s) => {
      const isOverriddenHere = s.inherited_from === activeScope;
      if (inheritanceCategory !== 'ALL' && s.category !== inheritanceCategory) return false;
      if (inheritanceFilter === 'OVERRIDDEN' && !isOverriddenHere) return false;
      if (inheritanceFilter === 'INHERITED' && isOverriddenHere) return false;
      if (!q) return true;
      return (
        s.label.toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });
  }, [industryScopedSettings, activeScope, inheritanceCategory, inheritanceFilter, inheritanceSearch]);

  const filteredAccessUsers = React.useMemo(() => {
    const q = accessSearch.trim().toLowerCase();
    return (accessData?.users || []).filter((u) => {
      const isSuperAdminLogin =
        u.role_code === 'SuperAdmin' ||
        u.role_code === 'BusinessOwner' ||
        u.role_code.toLowerCase().includes('admin');
      if (!showAllRoles && !isSuperAdminLogin) return false;
      if (accessRoleFilter !== 'ALL' && u.role_code !== accessRoleFilter) return false;
      if (accessStatusFilter === 'ACTIVE' && !u.is_active) return false;
      if (accessStatusFilter === 'INACTIVE' && u.is_active) return false;
      if (!q) return true;
      return (
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role_name.toLowerCase().includes(q) ||
        u.designation_name.toLowerCase().includes(q)
      );
    });
  }, [accessData?.users, showAllRoles, accessRoleFilter, accessStatusFilter, accessSearch]);

  const accessSort = useSortableData(
    filteredAccessUsers,
    { key: 'full_name', dir: 'asc' },
    (row, key) => {
      if (key === 'branch_name') return row.branch_name || 'All Branches';
      if (key === 'has_pin') return row.has_pin ? 1 : 0;
      if (key === 'is_active') return row.is_active ? 1 : 0;
      return (row as Record<string, any>)[key];
    }
  );

  const accessPagination = usePagination(accessSort.sortedItems, 6);

  if (isLoading && !data) {
    return <SettingsSkeleton />;
  }

  const persistLocalSettingsCache = (
    cacheSource: string | undefined,
    cachedAt: string | undefined,
    nextSettings?: ResolvedSettingDTO[]
  ) => {
    const source = cacheSource || 'REDIS_CACHE';
    const ts = cachedAt || new Date().toISOString();
    setCacheSourceLabel(source);
    setLastCachedAt(ts);
    if (nextSettings && context?.business_id) {
      queryClient.setQueryData<SettingsResponse>(
        ['settings-resolved', context.business_id, activeScope, queryParams],
        (prev) => ({
          settings: nextSettings,
          roles: prev?.roles || data?.roles || [],
          cache_source: source,
          cached_at: ts,
        })
      );
      try {
        localStorage.setItem(
          `zona_settings_cache:${context.business_id}:${activeScope}:${queryParams || 'default'}`,
          JSON.stringify({ cached_at: ts, cache_source: source, settings: nextSettings })
        );
      } catch {
        // Ignore storage errors
      }
    }
  };

  const invalidateGlobalFinancialCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    queryClient.invalidateQueries({ queryKey: ['settings-resolved'] });
    queryClient.invalidateQueries({ queryKey: ['public-branding'] });
    queryClient.invalidateQueries({ queryKey: ['pos-bootstrap'] });
    queryClient.invalidateQueries({ queryKey: ['overview'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['reports'] });
    queryClient.invalidateQueries({ queryKey: ['accounting'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
  };

  const saveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedTradeName = (tradeName || companyName || '').trim();
    const normalizedColor = /^#[0-9A-Fa-f]{6}$/.test(primaryColorHex.trim())
      ? primaryColorHex.trim()
      : '#877FC1';
    const normalizedLang = normalizeLanguage(defaultLanguage);

    const ok = await confirmAction({
      title: 'Confirm & Cache Company Settings?',
      text: `Save changes for "${resolvedTradeName || 'Company Profile'}" (${baseCurrency}, ${normalizedLang.toUpperCase()}) and broadcast across connected terminals?`,
      confirmLabel: 'Confirm & Cache Settings',
    });
    if (!ok) return;

    setSavingCompany(true);
    try {
      const res = await apiFetch<{
        profile: Record<string, unknown>;
        cache_source?: string;
        cached_at?: string;
      }>('/api/v1/company/settings', {
        method: 'PUT',
        body: JSON.stringify({
          name: companyName || resolvedTradeName,
          trade_name: resolvedTradeName,
          legal_name: legalName,
          tax_registration_no: vatNo,
          base_currency: baseCurrency,
          primary_color_hex: normalizedColor,
          default_language: normalizedLang,
          logo_light_url: logoLight,
          logo_dark_url: logoDark,
          logo_receipt_url: logoReceipt,
          require_po_approval: requirePOApproval,
          require_grn_approval: requireGRNApproval,
        }),
      });
      persistLocalSettingsCache(res.cache_source, res.cached_at);
      setResolvedSettings({
        'accounting.base_currency': JSON.stringify(baseCurrency),
        'system.default_language': JSON.stringify(normalizedLang),
      });
      updateBusinessContext(
        {
          base_currency: baseCurrency,
          business_name: companyName || resolvedTradeName || context?.business_name,
          trade_name: resolvedTradeName || context?.trade_name,
          tax_registration_no: vatNo,
          primary_color_hex: normalizedColor,
          default_language: normalizedLang,
          logo_light_url: logoLight,
          logo_dark_url: logoDark,
          logo_sidebar_url: logoLight || logoDark || context?.logo_sidebar_url,
          logo_receipt_url: logoReceipt || context?.logo_receipt_url,
        },
        { forceLanguage: true }
      );
      useI18nStore.getState().resetToTenantDefault(normalizedLang);
      setCustomAccent(normalizedColor);
      toast.success('Confirmed — company branding & localization synced across all terminals');
      await Promise.all([refetchCompany(), refetch()]);
      invalidateGlobalFinancialCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save company settings');
    } finally {
      setSavingCompany(false);
    }
  };

  const handleLockFiscalPeriod = async () => {
    const openPeriod =
      accountingPeriods?.fiscal_periods?.find((p) => p.id === lockPeriodId && !p.is_locked) ||
      accountingPeriods?.fiscal_periods?.find((p) => !p.is_locked);

    if (!openPeriod) {
      toast.info('All available fiscal periods are already locked');
      return;
    }

    const ok = await confirmDestructiveAction({
      title: 'Lock Fiscal Period?',
      text: 'No transactions can be posted or edited before this date.',
      cancelLabel: 'Cancel',
      confirmLabel: 'Yes, Lock Period',
    });
    if (!ok) return;

    try {
      await apiFetch(`/api/v1/accounting/fiscal-periods/${openPeriod.id}/lock`, {
        method: 'POST',
      });
      toast.success(`Fiscal period ${openPeriod.period_name} locked`);
      refetchPeriods();
      queryClient.invalidateQueries({ queryKey: ['accounting'] });
    } catch (err: any) {
      toast.error(err.message || 'Unable to lock fiscal period');
    }
  };

  const saveOverride = async (setting: ResolvedSettingDTO, rawValue: any) => {
    const typeUpper = setting.value_type.toUpperCase();
    let valueJSON: any = rawValue;
    if (typeUpper === 'NUMBER') valueJSON = Number(rawValue);
    else if (typeUpper === 'BOOLEAN') valueJSON = Boolean(rawValue);
    else if (typeof rawValue === 'string') {
      try {
        valueJSON = JSON.parse(rawValue);
      } catch {
        valueJSON = rawValue;
      }
    }

    const ok = await confirmAction({
      title: `Confirm & Cache "${setting.label}"?`,
      text: `Apply value "${typeof valueJSON === 'object' ? JSON.stringify(valueJSON) : String(valueJSON)}" at ${activeScope} scope and refresh Redis + client settings cache?`,
      confirmLabel: 'Confirm & Cache Override',
    });
    if (!ok) return;

    try {
      const res = await apiFetch<{
        status: string;
        cache_source?: string;
        cached_at?: string;
        settings?: ResolvedSettingDTO[];
      }>('/api/v1/settings/override', {
        method: 'PUT',
        body: JSON.stringify({
          setting_key: setting.key,
          scope_level: activeScope,
          scope_target_id: resolvedTargetId,
          value_json: valueJSON,
        }),
      });
      persistLocalSettingsCache(res.cache_source, res.cached_at, res.settings);
      if (res.settings) {
        setResolvedSettings(res.settings);
      }
      if (setting.key === 'accounting.base_currency' && typeof valueJSON === 'string') {
        setBaseCurrency(valueJSON);
        updateBusinessContext({ base_currency: valueJSON });
      }
      if (setting.key === 'system.default_language' && typeof valueJSON === 'string') {
        const nextLang = normalizeLanguage(valueJSON);
        setDefaultLanguage(nextLang);
        updateBusinessContext({ default_language: nextLang }, { forceLanguage: true });
        useI18nStore.getState().resetToTenantDefault(nextLang);
      }
      toast.success(`Saved & cached ${setting.label} at ${activeScope} scope`);
      await Promise.all([refetch(), refetchCompany()]);
      invalidateGlobalFinancialCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to save setting override');
    }
  };

  const resetOverride = async (setting: ResolvedSettingDTO) => {
    const ok = await confirmAction({
      title: `Reset & Re-Cache "${setting.label}"?`,
      text: `Remove override at ${activeScope} scope so parent inheritance resumes, and update Redis + client cache?`,
      confirmLabel: 'Confirm Reset & Re-Cache',
    });
    if (!ok) return;

    try {
      const res = await apiFetch<{
        status: string;
        cache_source?: string;
        cached_at?: string;
        settings?: ResolvedSettingDTO[];
      }>('/api/v1/settings/reset', {
        method: 'POST',
        body: JSON.stringify({
          setting_key: setting.key,
          scope_level: activeScope,
          scope_target_id: resolvedTargetId,
        }),
      });
      persistLocalSettingsCache(res.cache_source, res.cached_at, res.settings);
      if (res.settings) {
        setResolvedSettings(res.settings);
      }
      toast.success(`Reset & re-cached ${setting.label} to inherit parent scope`);
      await Promise.all([refetch(), refetchCompany()]);
      if (setting.key === 'accounting.base_currency' && res.settings) {
        const resolvedCur = res.settings.find((x) => x.key === 'accounting.base_currency');
        if (resolvedCur) {
          try {
            const parsed = JSON.parse(resolvedCur.effective_json);
            if (typeof parsed === 'string') {
              setBaseCurrency(parsed);
              updateBusinessContext({ base_currency: parsed });
            }
          } catch {
            // Ignore JSON parse fallback
          }
        }
      }
      if (setting.key === 'system.default_language' && res.settings) {
        const resolvedLang = res.settings.find((x) => x.key === 'system.default_language');
        if (resolvedLang) {
          const nextLang = normalizeLanguage(resolvedLang.effective_json);
          setDefaultLanguage(nextLang);
          updateBusinessContext({ default_language: nextLang }, { forceLanguage: true });
          useI18nStore.getState().resetToTenantDefault(nextLang);
        }
      }
      invalidateGlobalFinancialCaches();
    } catch (err: any) {
      toast.error(err.message || 'Unable to reset setting override');
    }
  };

  const handleConfirmThemeChange = async (nextThemeId: typeof themeId, nextThemeName: string) => {
    const ok = await confirmAction({
      title: `Apply & Cache "${nextThemeName}" Theme?`,
      text: 'Switch active color tokens across all screens and cache the updated theme profile locally.',
      confirmLabel: 'Confirm & Cache Theme',
    });
    if (!ok) return;

    setTheme(nextThemeId);
    setAppearanceDirty(false);
    const nowIso = new Date().toISOString();
    setLastCachedAt(nowIso);
    try {
      localStorage.setItem(
        `zona_appearance_cache:${context?.business_id || 'default'}`,
        JSON.stringify({
          themeId: nextThemeId,
          cornerPreset,
          customAccent,
          customCanvas,
          customSurface,
          cached_at: nowIso,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
    toast.success(`Theme "${nextThemeName}" confirmed & cached`);
  };

  const handleConfirmCacheAppearance = async () => {
    const ok = await confirmAction({
      title: 'Confirm & Cache Appearance Settings?',
      text: `Lock in theme "${currentTheme.name}", corner geometry "${CORNER_PRESETS[cornerPreset].label}", and custom colors in settings cache?`,
      confirmLabel: 'Confirm & Cache Appearance',
    });
    if (!ok) return;

    setAppearanceDirty(false);
    const nowIso = new Date().toISOString();
    setLastCachedAt(nowIso);
    try {
      localStorage.setItem(
        `zona_appearance_cache:${context?.business_id || 'default'}`,
        JSON.stringify({
          themeId,
          cornerPreset,
          customAccent,
          customCanvas,
          customSurface,
          cached_at: nowIso,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
    toast.success('Colors, theme & corner geometry confirmed & cached');
  };

  const handleResetAppearance = async () => {
    const ok = await confirmDestructiveAction({
      title: 'Reset Colors & Corners to Defaults?',
      text: 'Revert custom palette colors and corner radius overrides back to standard defaults and re-cache.',
      confirmLabel: 'Confirm Reset & Re-Cache',
    });
    if (!ok) return;

    resetCustomAppearance();
    setAppearanceDirty(false);
    const nowIso = new Date().toISOString();
    setLastCachedAt(nowIso);
    try {
      localStorage.removeItem(`zona_appearance_cache:${context?.business_id || 'default'}`);
    } catch {
      // Ignore storage errors
    }
    toast.success('Custom colors & corners reset to standard (8–12px) and re-cached');
  };

  const availableAccessBranches = accessData?.branches || branches;
  const availableAccessTerminals = React.useMemo(
    () =>
      accessData?.terminals ||
      terminals.map((tm) => {
        const br = availableAccessBranches.find((b) => b.id === tm.branch_id);
        return {
          id: tm.id,
          branch_id: tm.branch_id,
          branch_code: br?.code || '',
          branch_name: br?.name || '',
          code: tm.code,
          name: tm.name,
        };
      }),
    [accessData?.terminals, terminals, availableAccessBranches]
  );
  const defaultConcreteBranchId =
    availableAccessBranches[0]?.id || context?.branch_id || '';
  const selectedFormRoleCode =
    (accessData?.roles || []).find((r) => r.id === formRoleId)?.code || '';
  const selectedRoleSupportsAllBranches = isMultiBranchRole(selectedFormRoleCode);

  const handleFormRoleChange = (nextRoleId: string) => {
    setFormRoleId(nextRoleId);
    const nextRoleCode =
      (accessData?.roles || []).find((r) => r.id === nextRoleId)?.code || '';
    if (isMultiBranchRole(nextRoleCode)) {
      setFormAllBranches(true);
      setFormBranchId('ALL');
    } else if (!formAllBranches && formAllowedBranchIds.length === 0 && defaultConcreteBranchId) {
      setFormAllowedBranchIds([defaultConcreteBranchId]);
      setFormBranchId(defaultConcreteBranchId);
    }
  };

  const toggleAllowedBranch = (bid: string) => {
    setFormAllowedBranchIds((prev) => {
      const next = prev.includes(bid) ? prev.filter((id) => id !== bid) : [...prev, bid];
      if (next.length > 0 && (!formBranchId || formBranchId === 'ALL' || !next.includes(formBranchId))) {
        setFormBranchId(next[0]);
      }
      return next;
    });
    setFormErrors((prev) => ({ ...prev, branch: '' }));
  };

  const toggleAllowedTerminal = (tid: string) => {
    setFormAllowedTerminalIds((prev) =>
      prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
    );
  };

  const openCreateAccessModal = () => {
    const defaultRole =
      accessData?.roles.find((r) => r.code === 'SuperAdmin') ||
      accessData?.roles.find((r) => r.code === 'BusinessOwner') ||
      accessData?.roles[0];
    const isOwner = isMultiBranchRole(defaultRole?.code);
    setEditingUser(null);
    setFormFullName('');
    setFormEmail('');
    setFormPassword('');
    setFormRoleId(defaultRole?.id || '');
    setFormDesigId(accessData?.designations[0]?.id || 'NONE');
    setFormAllBranches(isOwner);
    setFormAllowedBranchIds(
      isOwner
        ? availableAccessBranches.map((b) => b.id)
        : defaultConcreteBranchId
        ? [defaultConcreteBranchId]
        : []
    );
    setFormBranchId(isOwner ? 'ALL' : defaultConcreteBranchId);
    setFormAllowedTerminalIds([]);
    setFormDefaultTerminalId('AUTO');
    setFormActive(true);
    setFormPin('');
    setFormErrors({});
    setUserModalOpen(true);
  };

  const openEditAccessModal = (row: AccessUserRow) => {
    setEditingUser(row);
    setFormFullName(row.full_name);
    setFormEmail(row.email);
    setFormPassword('');
    setFormRoleId(row.role_id);
    setFormDesigId(row.designation_id || 'NONE');
    const rowAll = Boolean(row.all_branches_access || isMultiBranchRole(row.role_code));
    const existingBranches =
      row.allowed_branch_ids && row.allowed_branch_ids.length > 0
        ? row.allowed_branch_ids
        : row.branch_id
        ? [row.branch_id]
        : defaultConcreteBranchId
        ? [defaultConcreteBranchId]
        : [];
    setFormAllBranches(rowAll);
    setFormAllowedBranchIds(existingBranches);
    setFormBranchId(
      row.branch_id || (rowAll ? 'ALL' : existingBranches[0] || defaultConcreteBranchId)
    );
    setFormAllowedTerminalIds(row.allowed_terminal_ids || []);
    setFormDefaultTerminalId(row.default_terminal_id || 'AUTO');
    setFormActive(row.is_active);
    setFormPin('');
    setFormErrors({});
    setUserModalOpen(true);
  };

  const updateRowInline = async (
    row: AccessUserRow,
    patch: Partial<{
      role_id: string;
      designation_id: string;
      branch_id: string | null;
      all_branches_access: boolean;
      allowed_branch_ids: string[];
      is_active: boolean;
    }>
  ) => {
    const nextRoleId = patch.role_id ?? row.role_id;
    const nextRoleCode =
      (accessData?.roles || []).find((r) => r.id === nextRoleId)?.code ||
      row.role_code;
    let nextBranchId: string | null =
      patch.branch_id !== undefined ? patch.branch_id : row.branch_id || null;
    const nextAllBranches =
      patch.all_branches_access !== undefined
        ? patch.all_branches_access
        : patch.branch_id === null
        ? true
        : patch.branch_id
        ? false
        : Boolean(row.all_branches_access || isMultiBranchRole(nextRoleCode));
    const nextAllowedBranches =
      patch.allowed_branch_ids !== undefined
        ? patch.allowed_branch_ids
        : patch.branch_id
        ? [patch.branch_id]
        : row.allowed_branch_ids || (nextBranchId ? [nextBranchId] : []);
    if (!nextAllBranches && !nextBranchId && nextAllowedBranches.length === 0) {
      nextBranchId = defaultConcreteBranchId || null;
    }
    try {
      await apiFetch(`/api/v1/access/users/${row.user_business_role_id}`, {
        method: 'PUT',
        body: JSON.stringify({
          user_id: row.user_id,
          full_name: row.full_name,
          role_id: nextRoleId,
          designation_id: (patch.designation_id ?? row.designation_id) || null,
          branch_id: nextBranchId,
          all_branches_access: nextAllBranches,
          allowed_branch_ids: nextAllowedBranches,
          allowed_terminal_ids: row.allowed_terminal_ids || [],
          is_active: patch.is_active ?? row.is_active,
        }),
      });
      toast.success(`Updated access for ${row.full_name}`);
      await queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] });
    } catch (err: any) {
      toast.error(err.message || 'Unable to update user access');
    }
  };

  const handleSaveAccessUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formFullName.trim()) {
      errs.fullName = 'Full name is required';
    }
    if (!editingUser && (!formEmail.trim() || !formEmail.includes('@'))) {
      errs.email = 'Valid work email is required';
    }
    if (!formAllBranches && formAllowedBranchIds.length === 0 && (!formBranchId || formBranchId === 'ALL')) {
      errs.branch = 'Select at least one branch or enable All Branches access';
    }
    if (formPin.trim() && formPin.trim().length !== 6) {
      errs.pin = 'Supervisor PIN must be exactly 6 digits';
    }
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      toast.error(Object.values(errs)[0]);
      return;
    }
    setFormErrors({});

    setSavingUser(true);
    try {
      const effectiveAllowedBranches = formAllBranches
        ? []
        : formAllowedBranchIds.length > 0
        ? formAllowedBranchIds
        : formBranchId && formBranchId !== 'ALL'
        ? [formBranchId]
        : [];
      const primaryBranchId =
        formBranchId && formBranchId !== 'ALL'
          ? formBranchId
          : effectiveAllowedBranches[0] || null;

      const payload: Record<string, unknown> = {
        full_name: formFullName.trim(),
        email: formEmail.trim().toLowerCase(),
        role_id: formRoleId,
        designation_id: formDesigId && formDesigId !== 'NONE' ? formDesigId : null,
        branch_id: primaryBranchId,
        all_branches_access: formAllBranches,
        allowed_branch_ids: effectiveAllowedBranches,
        allowed_terminal_ids: formAllowedTerminalIds,
        default_terminal_id:
          formDefaultTerminalId && formDefaultTerminalId !== 'AUTO'
            ? formDefaultTerminalId
            : null,
        is_active: formActive,
      };
      if (formPin.trim()) payload.supervisor_pin = formPin.trim();
      if (!editingUser && formPassword.trim()) payload.password = formPassword.trim();

      if (editingUser) {
        await apiFetch(`/api/v1/access/users/${editingUser.user_business_role_id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...payload,
            user_id: editingUser.user_id,
          }),
        });
        toast.success(`Saved ${formFullName}`);
      } else {
        await apiFetch('/api/v1/access/users', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast.success(`Created login for ${formFullName}`);
      }

      setUserModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['access-users', context?.business_id] });
    } catch (err: any) {
      toast.error(err.message || 'Unable to save admin login');
    } finally {
      setSavingUser(false);
    }
  };

  const openPeriods = (accountingPeriods?.fiscal_periods || []).filter((p) => !p.is_locked);
  const currentTheme =
    LIGHT_THEMES.find((t) => t.id === themeId) ||
    POS_THEMES.find((t) => t.id === themeId) ||
    LIGHT_THEMES[0];

  return (
    <>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="company" data-testid="settings-tab-company">
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              {t.settings.companyTab}
            </TabsTrigger>
            <TabsTrigger value="branches" data-testid="settings-tab-branches">
              <Store className="mr-1.5 h-3.5 w-3.5" />
              {t.settings.branchesTab}
            </TabsTrigger>
            <TabsTrigger value="taxation" data-testid="settings-tab-taxation">
              <Percent className="mr-1.5 h-3.5 w-3.5" />
              Taxation &amp; SL VAT
            </TabsTrigger>
            <TabsTrigger value="inheritance" data-testid="settings-tab-inheritance">
              <Layers3 className="mr-1.5 h-3.5 w-3.5" />
              {t.settings.inheritanceTab}
            </TabsTrigger>
            <TabsTrigger value="rbac" data-testid="settings-tab-rbac">
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              {t.settings.rbacTab} ({filteredAccessUsers.length})
            </TabsTrigger>
            <TabsTrigger value="sessions" data-testid="settings-tab-sessions">
              <Lock className="mr-1.5 h-3.5 w-3.5" />
              Sessions &amp; Security
            </TabsTrigger>
          </TabsList>
        </div>

        {/* TAB: Sessions & Rate-Limiting Security */}
        <TabsContent value="sessions" className="space-y-4">
          <SessionsSecurityTab
            onOpenSecuritySettings={() => {
              setInheritanceCategory('Security & Sessions');
              setActiveTab('inheritance');
            }}
          />
        </TabsContent>

        {/* TAB: Company Branches & POS Terminals */}
        <TabsContent value="branches" className="space-y-4">
          <BranchesTerminalsTab />
        </TabsContent>

        {/* TAB 2 (Promoted): Multi-Tier Taxation & Sri Lankan IRD VAT (18%) / SSCL (2.5%) */}
        <TabsContent value="taxation" className="space-y-4">
          <TaxationSettingsTab onTaxConfigUpdated={invalidateGlobalFinancialCaches} />
        </TabsContent>

        {/* TAB 1: Company Settings 3-Column Bento + Appearance, Custom Colors & Corners Studio */}
        <TabsContent value="company" className="space-y-4">
          <form onSubmit={saveCompanySettings} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 items-stretch">
              {/* Column 1: Brand Assets & Primary Brand Color */}
              <section className="zona-card flex flex-col justify-between p-4 space-y-3">
                <div>
                  <h2 className="text-[13px] font-bold text-ink">{t.settings.brandAssets}</h2>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {t.settings.brandAssetsHint}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-ink">{t.settings.lightModeLogo}</span>
                    <MagneticDropZone
                      maxSizeMB={2}
                      maxFiles={1}
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      previewUrls={logoLight ? [logoLight] : []}
                      onFilesChanged={(items) => setLogoLight(items[0]?.dataUrl || '')}
                      onFileSelected={() => {}}
                      label="Drop Light Header Logo"
                      helperText="Shown on sidebar, login & invoices"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-ink">{t.settings.darkSidebarLogo}</span>
                    <MagneticDropZone
                      maxSizeMB={2}
                      maxFiles={1}
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      previewUrls={logoDark ? [logoDark] : []}
                      onFilesChanged={(items) => setLogoDark(items[0]?.dataUrl || '')}
                      onFileSelected={() => {}}
                      label="Drop Dark Theme Logo"
                      helperText="Shown on Obsidian & dark surfaces"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-ink">{t.settings.receiptLogo}</span>
                    <MagneticDropZone
                      maxSizeMB={2}
                      maxFiles={1}
                      accept=".png,.jpg,.jpeg,.webp,.svg"
                      previewUrls={logoReceipt ? [logoReceipt] : []}
                      onFilesChanged={(items) => setLogoReceipt(items[0]?.dataUrl || '')}
                      onFileSelected={() => {}}
                      label="Drop Monochrome Receipt Mark"
                      helperText="Printed at top of ESC/POS receipts"
                    />
                  </div>

                  <div className="space-y-1.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 p-2.5">
                    <label
                      htmlFor="company-primary-color-hex"
                      className="text-[11px] font-semibold text-ink"
                    >
                      {t.settings.primaryBrandColor}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="company-primary-color-picker"
                        type="color"
                        value={/^#[0-9A-Fa-f]{6}$/.test(primaryColorHex) ? primaryColorHex : '#877FC1'}
                        onChange={(e) => {
                          setPrimaryColorHex(e.target.value);
                          setCustomAccent(e.target.value);
                        }}
                        className="h-9 w-11 shrink-0 cursor-pointer rounded-[var(--theme-radius-control)] border border-border-theme bg-surface p-0.5"
                      />
                      <Input
                        id="company-primary-color-hex"
                        data-testid="company-primary-color-input"
                        value={primaryColorHex}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPrimaryColorHex(v);
                          if (/^#[0-9A-Fa-f]{6}$/.test(v.trim())) {
                            setCustomAccent(v.trim());
                          }
                        }}
                        placeholder="#877FC1"
                        className="h-9 font-mono text-xs uppercase tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Column 2: White-Label Identity & Localization */}
              <section className="zona-card flex flex-col justify-between p-4 space-y-3">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-[13px] font-bold text-ink">{t.settings.legalAndLocale}</h2>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {t.settings.legalAndLocaleHint}
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="space-y-1">
                      <label htmlFor="company-trade-name" className="text-[11px] font-semibold text-ink">
                        {t.settings.systemTradeName}
                      </label>
                      <Input
                        id="company-trade-name"
                        data-testid="company-trade-name-input"
                        value={tradeName}
                        onChange={(e) => {
                          setTradeName(e.target.value);
                          if (!companyName) setCompanyName(e.target.value);
                        }}
                        placeholder="e.g., Atelier Retail"
                      />
                    </div>

                    <div className="space-y-1">
                      <label htmlFor="company-legal-name" className="text-[11px] font-semibold text-ink">
                        {t.settings.legalEntity}
                      </label>
                      <Input
                        id="company-legal-name"
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                        placeholder="e.g., Acme Retail Holdings (Pvt) Ltd"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="company-vat-reg" className="text-[11px] font-semibold text-ink">
                          {t.settings.vatRegNo}
                        </label>
                        <button
                          type="button"
                          onClick={() => setActiveTab('taxation')}
                          className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                          data-testid="company-to-taxation-link"
                        >
                          <Percent className="h-3 w-3" />
                          VAT 18% / SSCL Rules &rarr;
                        </button>
                      </div>
                      <Input
                        id="company-vat-reg"
                        value={vatNo}
                        onChange={(e) => setVatNo(e.target.value)}
                        placeholder="e.g., VAT-999-888"
                        className="font-mono tabular-nums"
                        data-testid="vat-reg-input"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-ink">{t.settings.baseCurrency}</label>
                        <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                          <SelectTrigger data-testid="company-currency-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="USD">USD — US Dollar ($)</SelectItem>
                            <SelectItem value="LKR">LKR — Sri Lankan Rupee (Rs)</SelectItem>
                            <SelectItem value="EUR">EUR — Euro (€)</SelectItem>
                            <SelectItem value="GBP">GBP — British Pound (£)</SelectItem>
                            <SelectItem value="INR">INR — Indian Rupee (₹)</SelectItem>
                            <SelectItem value="AUD">AUD — Australian Dollar (A$)</SelectItem>
                            <SelectItem value="SGD">SGD — Singapore Dollar (S$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-ink">{t.settings.systemLanguage}</label>
                        <Select
                          value={defaultLanguage}
                          onValueChange={(val) => setDefaultLanguage(normalizeLanguage(val))}
                        >
                          <SelectTrigger data-testid="company-language-select">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_LANGUAGES.map((langOpt) => (
                              <SelectItem key={langOpt.code} value={langOpt.code}>
                                {langOpt.shortCode} — {langOpt.nativeLabel}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[var(--theme-radius-inner)] bg-surface-muted p-3 text-[11px] text-ink-muted">
                  Redis cache key:{' '}
                  <code className="font-mono text-ink">
                    settings:biz:{context?.business_id?.slice(0, 8)}:resolved
                  </code>
                </div>
              </section>

              {/* Column 3: Fiscal / GL & Warehouse Approval Switches */}
              <section className="zona-card flex flex-col justify-between p-4 space-y-3">
                <div className="space-y-3">
                  <div>
                    <h2 className="text-[13px] font-bold text-ink">{t.settings.fiscalAndApprovals}</h2>
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      Redis-cached purchasing gates and immutable General Ledger cutoff locks.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3 rounded-[var(--theme-radius-inner)] bg-surface-muted p-3">
                      <div>
                        <p className="text-xs font-semibold text-ink">Require PO Approval</p>
                        <p className="mt-0.5 text-[10.5px] text-ink-muted">
                          Routes purchase orders above threshold through manager review.
                        </p>
                      </div>
                      <Switch
                        checked={requirePOApproval}
                        onCheckedChange={setRequirePOApproval}
                        data-testid="toggle-po-approval"
                      />
                    </div>

                    <div className="flex items-start justify-between gap-3 rounded-[var(--theme-radius-inner)] bg-surface-muted p-3">
                      <div>
                        <p className="text-xs font-semibold text-ink">Require GRN Approval</p>
                        <p className="mt-0.5 text-[10.5px] text-ink-muted">
                          Switches GRN modal to &ldquo;Submit for Approval&rdquo; before FIFO/AP.
                        </p>
                      </div>
                      <Switch
                        checked={requireGRNApproval}
                        onCheckedChange={setRequireGRNApproval}
                        data-testid="toggle-grn-approval"
                      />
                    </div>

                    <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-ink">Fiscal Cutoff Lock</span>
                        <Badge variant={openPeriods.length > 0 ? 'positive' : 'default'}>
                          {openPeriods.length} Open
                        </Badge>
                      </div>

                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-8 w-full items-center justify-between rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted px-3 text-xs font-medium text-ink cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2">
                              <CalendarIcon className="h-3.5 w-3.5 text-accent" />
                              <span>
                                {lockDate ? format(lockDate, 'yyyy-MM-dd') : 'Select Fiscal Cutoff Date'}
                              </span>
                            </span>
                            <span className="text-[10.5px] text-ink-muted">Calendar</span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-auto p-2">
                          <Calendar mode="single" selected={lockDate} onSelect={setLockDate} />
                        </PopoverContent>
                      </Popover>

                      <TactileButton
                        type="button"
                        tone="soft"
                        onClick={handleLockFiscalPeriod}
                        className="w-full min-h-[34px] text-xs"
                      >
                        <Lock className="mr-1.5 h-3.5 w-3.5" />
                        Lock Active Fiscal Period
                      </TactileButton>
                    </div>
                  </div>
                </div>

                <Can permission="settings:manage">
                  <DynamicButton
                    type="submit"
                    variant="lavender"
                    disabled={savingCompany}
                    icon={<Save className="h-3.5 w-3.5" />}
                    className="w-full"
                    data-testid="save-company-settings-btn"
                  >
                    {savingCompany ? 'Saving & Caching Redis...' : t.settings.saveCompanySettings}
                  </DynamicButton>
                </Can>
              </section>
            </div>
          </form>

          {/* Theme Presets, Custom Colors & Standard Corner Geometry Studio */}
          <section className="zona-card p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-accent" />
                <div>
                  <h3 className="text-[13px] font-bold text-ink">
                    Appearance, Custom Colors &amp; Corner Geometry
                  </h3>
                  <p className="text-[11px] text-ink-muted">
                    Palette colors, accent highlights, and standard corner radii update across cards, modals, buttons &amp; POS tiles instantly.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="lavender">Light Palette: {currentTheme.name}</Badge>
                <Badge variant="outline">
                  Active Mode: {colorMode === 'dark' ? 'Dark Mode (Topbar)' : 'Light Mode'}
                </Badge>
                <Badge
                  variant={appearanceDirty ? 'outline' : 'positive'}
                  data-testid="settings-cache-status"
                >
                  {appearanceDirty
                    ? 'Preview Uncached'
                    : `Cached (${formatDisplayLabel(cacheSourceLabel)})${
                        lastCachedAt
                          ? ` • ${new Date(lastCachedAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : ''
                      }`}
                </Badge>
                <Button
                  type="button"
                  variant="success"
                  size="xs"
                  data-testid="confirm-cache-appearance-btn"
                  onClick={handleConfirmCacheAppearance}
                >
                  <Check className="h-3 w-3" />
                  Confirm &amp; Cache Appearance
                </Button>
                <Button
                  type="button"
                  variant="warning"
                  size="xs"
                  onClick={handleResetAppearance}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Defaults
                </Button>
              </div>
            </div>

            {/* Light Mode Theme Presets Grid (Dark Mode toggles separately from the Top Header) */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {LIGHT_THEMES.map((t) => {
                const selected = themeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (t.id !== themeId) {
                        void handleConfirmThemeChange(t.id, t.name);
                      }
                    }}
                    className={`flex items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-accent bg-accent-soft/45 ring-1 ring-accent/40'
                        : 'border-border-theme bg-surface-muted/70 hover:bg-surface-muted'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-bold text-ink">{t.name}</span>
                        <Badge variant="outline" className="text-[9.5px] px-1.5 py-0">
                          {t.mode}
                        </Badge>
                      </div>
                      <p className="truncate text-[10.5px] text-ink-muted mt-0.5">{t.tagline}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.swatches.map((hex, i) => (
                        <span
                          key={i}
                          className="h-3.5 w-3.5 rounded-[var(--theme-radius-badge)] border border-black/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                      {selected && <Check className="ml-1 h-3.5 w-3.5 text-accent" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Custom Color Pickers + Corner Scale Controls */}
            <div className="grid grid-cols-1 gap-4 border-t border-border-theme pt-3.5 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <Sliders className="h-3.5 w-3.5 text-accent" />
                  Corner Style
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(CORNER_PRESETS) as CornerPreset[]).map((key) => {
                    const p = CORNER_PRESETS[key];
                    const active = cornerPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        data-testid={`corner-preset-${key}`}
                        onClick={() => {
                          setCornerPreset(key);
                          setAppearanceDirty(true);
                        }}
                        className={`rounded-[var(--theme-radius-control)] border px-3 py-2 text-left transition-colors cursor-pointer ${
                          active
                            ? 'border-accent bg-accent-soft/50 text-ink'
                            : 'border-border-theme bg-surface-muted/60 text-ink-muted hover:text-ink'
                        }`}
                      >
                        <div className="text-[11.5px] font-bold text-ink">{p.label}</div>
                        <div className="text-[10px] text-ink-muted truncate">{p.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-ink">Custom Palette Overrides</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/65 px-2.5 py-2 cursor-pointer">
                    <div>
                      <div className="text-[11px] font-semibold text-ink">Accent</div>
                      <div className="text-[10px] font-mono text-ink-muted">
                        {customAccent || currentTheme.tokens['--theme-accent']}
                      </div>
                    </div>
                    <input
                      type="color"
                      aria-label="Custom accent color"
                      data-testid="custom-accent-picker"
                      value={customAccent || currentTheme.tokens['--theme-accent']}
                      onChange={(e) => {
                        setCustomAccent(e.target.value);
                        setAppearanceDirty(true);
                      }}
                      className="h-7 w-9 cursor-pointer rounded border border-border-theme bg-transparent p-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/65 px-2.5 py-2 cursor-pointer">
                    <div>
                      <div className="text-[11px] font-semibold text-ink">Canvas</div>
                      <div className="text-[10px] font-mono text-ink-muted">
                        {customCanvas || currentTheme.tokens['--theme-canvas']}
                      </div>
                    </div>
                    <input
                      type="color"
                      aria-label="Custom canvas background color"
                      data-testid="custom-canvas-picker"
                      value={customCanvas || currentTheme.tokens['--theme-canvas']}
                      onChange={(e) => {
                        setCustomCanvas(e.target.value);
                        setAppearanceDirty(true);
                      }}
                      className="h-7 w-9 cursor-pointer rounded border border-border-theme bg-transparent p-0"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/65 px-2.5 py-2 cursor-pointer">
                    <div>
                      <div className="text-[11px] font-semibold text-ink">Card Surface</div>
                      <div className="text-[10px] font-mono text-ink-muted">
                        {customSurface || currentTheme.tokens['--theme-surface']}
                      </div>
                    </div>
                    <input
                      type="color"
                      aria-label="Custom card surface color"
                      data-testid="custom-surface-picker"
                      value={customSurface || currentTheme.tokens['--theme-surface']}
                      onChange={(e) => {
                        setCustomSurface(e.target.value);
                        setAppearanceDirty(true);
                      }}
                      className="h-7 w-9 cursor-pointer rounded border border-border-theme bg-transparent p-0"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[10.5px] text-ink-muted mr-1">Quick accent:</span>
                  {QUICK_ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Apply accent ${hex}`}
                      onClick={() => {
                        setCustomAccent(hex);
                        setAppearanceDirty(true);
                      }}
                      className="h-5 w-5 rounded-[var(--theme-radius-badge)] border border-black/15 cursor-pointer transition-transform hover:scale-110"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* TAB 2: 6-Level Settings Inheritance */}
        <TabsContent value="inheritance" className="space-y-4">
          <section className="zona-card p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-bold text-ink">
                  6-Level Configuration Inheritance Studio
                </h2>
                <p className="text-[11.5px] text-ink-muted">
                  Choose any hierarchy scope via stepper or dropdowns. More specific levels override parent defaults with Redis write-through caching.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="positive">Cache: {formatDisplayLabel(cacheSourceLabel)}</Badge>
                <Badge variant="lavender">Inspecting: {SCOPE_META[activeScope].label}</Badge>
                <Badge variant="outline">
                  {filteredSettings.length} / {data?.settings?.length || 0} Keys
                </Badge>
              </div>
            </div>

            {/* Interactive 6-Level Precedence Chain */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/55 p-2">
              {SCOPE_ORDER.map((scope, idx) => {
                const meta = SCOPE_META[scope];
                const Icon = meta.icon;
                const active = activeScope === scope;
                return (
                  <React.Fragment key={scope}>
                    <button
                      type="button"
                      onClick={() => setActiveScope(scope)}
                      data-testid={`scope-step-${scope.toLowerCase()}`}
                      className={`flex flex-1 min-w-[125px] items-center gap-2 rounded-[var(--theme-radius-control)] px-2.5 py-2 text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-accent text-accent-fg shadow-sm'
                          : 'bg-surface/75 text-ink hover:bg-surface border border-border-theme/70'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--theme-radius-badge)] text-[10.5px] font-bold ${
                          active
                            ? 'bg-white/20 text-accent-fg'
                            : 'bg-surface-muted text-accent'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[11px] font-bold">
                          {idx + 1}. {meta.label}
                        </div>
                        <div
                          className={`truncate text-[9.5px] ${
                            active ? 'text-accent-fg/80' : 'text-ink-muted'
                          }`}
                        >
                          {meta.hint}
                        </div>
                      </div>
                    </button>
                    {idx < SCOPE_ORDER.length - 1 && (
                      <ChevronRight className="hidden xl:block h-3.5 w-3.5 shrink-0 text-ink-muted/60" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Dropdown Context Selectors + Filter Bar */}
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                  Inheritance Scope
                </label>
                <Select
                  value={activeScope}
                  onValueChange={(v) => setActiveScope(v as ScopeLevel)}
                >
                  <SelectTrigger data-testid="inheritance-scope-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_ORDER.map((scope, idx) => (
                      <SelectItem key={scope} value={scope}>
                        Level {idx + 1}: {SCOPE_META[scope].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(activeScope === 'BRANCH' || activeScope === 'TERMINAL') && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Target Branch
                  </label>
                  {canMultiBranch ? (
                    <Select value={branchId} onValueChange={setBranchId}>
                      <SelectTrigger data-testid="inheritance-branch-select">
                        <SelectValue placeholder="Select Branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex h-9 items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/65 px-3 text-xs font-semibold text-ink">
                      <Lock className="h-3.5 w-3.5 text-ink-muted" />
                      <span className="truncate">
                        {branches.find((b) => b.id === context?.branch_id)?.name || 'Assigned Branch'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {activeScope === 'TERMINAL' && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Target Register / Terminal
                  </label>
                  <Select value={terminalId} onValueChange={setTerminalId}>
                    <SelectTrigger data-testid="inheritance-terminal-select">
                      <SelectValue placeholder="Select Terminal" />
                    </SelectTrigger>
                    <SelectContent>
                      {terminals
                        .filter((t) => {
                          const targetBr = canMultiBranch ? branchId : context?.branch_id;
                          return !targetBr || t.branch_id === targetBr;
                        })
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.code})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeScope === 'CATEGORY' && catalog?.categories && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Target Category
                  </label>
                  <Select
                    value={categoryId || catalog.categories[0]?.id}
                    onValueChange={setCategoryId}
                  >
                    <SelectTrigger data-testid="inheritance-category-select">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeScope === 'PRODUCT' && catalog?.products && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Target Product SKU
                  </label>
                  <Select
                    value={productId || catalog.products[0]?.id}
                    onValueChange={setProductId}
                  >
                    <SelectTrigger data-testid="inheritance-product-select">
                      <SelectValue placeholder="Select Product SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalog.products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku} • {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(activeScope === 'SYSTEM' || activeScope === 'BUSINESS') && (
                <div className="space-y-1">
                  <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    Target Entity
                  </label>
                  <div className="flex h-9 items-center rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted/65 px-3 text-xs font-semibold text-ink">
                    {activeScope === 'SYSTEM'
                      ? 'All Tenants (Global Defaults)'
                      : context?.business_name || 'Current Business'}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                  Setting Category
                </label>
                <Select value={inheritanceCategory} onValueChange={setInheritanceCategory}>
                  <SelectTrigger data-testid="inheritance-group-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {inheritanceCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat === 'ALL' ? 'All Categories' : cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-border-theme pt-3">
              <div className="relative w-full sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={inheritanceSearch}
                  onChange={(e) => setInheritanceSearch(e.target.value)}
                  placeholder="Search keys, labels or rules..."
                  className="pl-8"
                  data-testid="inheritance-search-input"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'All Keys' },
                    { id: 'OVERRIDDEN', label: `Overridden @ ${activeScope}` },
                    { id: 'INHERITED', label: 'Inherited Only' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setInheritanceFilter(pill.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      inheritanceFilter === pill.id
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'bg-surface-muted/80 text-ink-muted hover:text-ink border border-border-theme'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Active Business Vertical (Bound at Company Creation) */}
            <div className="border-t border-border-theme pt-3">
              {(() => {
                const preset = INDUSTRY_PRESETS[activeIndustryMode];
                return (
                  <div
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/65 p-3"
                    data-testid="active-industry-vertical-card"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Assigned Business Vertical:
                        </span>
                        <Badge variant="lavender">{preset.label}</Badge>
                      </div>
                      <p className="text-[11px] text-ink-muted">
                        {preset.tagline}. Settings keys and POS terminal options are scoped exclusively to this business vertical.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setActiveTab('taxation')}
                      data-testid="shortcut-to-taxation-tab"
                    >
                      <Percent className="h-3 w-3" />
                      Tax &amp; SL VAT Setup
                    </Button>
                  </div>
                );
              })()}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 items-stretch">
            {filteredSettings.map((s) => {
              const typeUpper = s.value_type.toUpperCase();
              const isBool = typeUpper === 'BOOLEAN';
              const isNum = typeUpper === 'NUMBER';
              const optionMeta = SETTING_OPTIONS_MAP[s.key];

              let boolVal = false;
              let effectiveString = s.effective_json;
              try {
                const parsed = JSON.parse(s.effective_json);
                boolVal = Boolean(parsed);
                effectiveString = typeof parsed === 'string' ? parsed : String(parsed);
              } catch {
                boolVal = s.effective_json === 'true';
              }

              const currentDraft = draftValues[s.key] ?? effectiveString;
              const isOverriddenHere = s.inherited_from === activeScope;
              const inheritedIdx = SCOPE_ORDER.indexOf(s.inherited_from);

              return (
                <div
                  key={s.key}
                  data-testid={`setting-card-${s.key}`}
                  className={`zona-card flex flex-col justify-between p-4 transition-all ${
                    isOverriddenHere ? 'ring-1 ring-accent/35' : ''
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[9.5px] px-1.5 py-0">
                            {formatDisplayLabel(s.category)}
                          </Badge>
                          <span className="text-[10px] font-medium text-ink-muted">
                            {s.key.split('.').map(formatDisplayLabel).join(' › ')}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] font-bold text-ink">{s.label}</p>
                      </div>
                      <Badge
                        variant={isOverriddenHere ? 'accent' : 'lavender'}
                        className="shrink-0"
                      >
                        {isOverriddenHere ? (
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                        ) : null}
                        {isOverriddenHere
                          ? `Override @ ${SCOPE_META[s.inherited_from]?.label || formatDisplayLabel(s.inherited_from)}`
                          : `From ${SCOPE_META[s.inherited_from]?.label || formatDisplayLabel(s.inherited_from)}`}
                      </Badge>
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-ink-muted">
                      {s.description}
                    </p>

                    {/* Mini 6-Level Inheritance Trail */}
                    <div className="flex items-center gap-1 pt-0.5">
                      {SCOPE_ORDER.map((lvl, idx) => {
                        const isSource = idx === inheritedIdx;
                        const isSelected = lvl === activeScope;
                        return (
                          <span
                            key={lvl}
                            title={`${SCOPE_META[lvl].label}${isSource ? ' (Active Source)' : ''}`}
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide transition-colors ${
                              isSource
                                ? 'bg-accent text-accent-fg'
                                : isSelected
                                ? 'border border-accent/50 bg-accent-soft/50 text-ink'
                                : 'bg-surface-muted/80 text-ink-muted'
                            }`}
                          >
                            {lvl.slice(0, 3)}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <Can permission="settings:manage">
                    <div className="mt-3.5 space-y-2.5 border-t border-border-theme pt-3">
                      {isBool ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <Switch
                              checked={boolVal}
                              onCheckedChange={(checked) => saveOverride(s, checked)}
                              aria-label={`Toggle ${s.label}`}
                              data-testid={`setting-switch-${s.key}`}
                            />
                            <span className="text-xs font-semibold text-ink">
                              {boolVal
                                ? optionMeta?.trueLabel || 'Enabled'
                                : optionMeta?.falseLabel || 'Disabled'}
                            </span>
                          </div>

                          <div className="inline-flex rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted p-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                if (!boolVal) void saveOverride(s, true);
                              }}
                              className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                                boolVal
                                  ? 'bg-[#22C55E] text-white shadow-xs'
                                  : 'text-ink-muted hover:text-ink'
                              }`}
                            >
                              {optionMeta?.trueLabel || 'On'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (boolVal) void saveOverride(s, false);
                              }}
                              className={`rounded-[calc(var(--theme-radius-control)-2px)] px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                                !boolVal
                                  ? 'bg-ink text-surface shadow-xs'
                                  : 'text-ink-muted hover:text-ink'
                              }`}
                            >
                              {optionMeta?.falseLabel || 'Off'}
                            </button>
                          </div>
                        </div>
                      ) : optionMeta?.options ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Select
                              value={effectiveString}
                              onValueChange={(val) => {
                                setDraftValues((prev) => ({ ...prev, [s.key]: val }));
                                void saveOverride(s, val);
                              }}
                            >
                              <SelectTrigger
                                className="h-9 flex-1 text-xs font-semibold"
                                data-testid={`setting-select-${s.key}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {optionMeta.options.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {optionMeta.options.slice(0, 5).map((opt) => {
                              const selected = effectiveString === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    if (!selected) {
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [s.key]: opt.value,
                                      }));
                                      void saveOverride(s, opt.value);
                                    }
                                  }}
                                  className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                                    selected
                                      ? 'bg-accent text-accent-fg shadow-xs'
                                      : 'border border-border-theme bg-surface-muted/75 text-ink-muted hover:text-ink'
                                  }`}
                                >
                                  {opt.shortLabel || opt.value}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {optionMeta?.presets && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {optionMeta.presets.map((preset) => {
                                const selected = effectiveString === preset.value;
                                return (
                                  <button
                                    key={preset.value}
                                    type="button"
                                    onClick={() => {
                                      setDraftValues((prev) => ({
                                        ...prev,
                                        [s.key]: preset.value,
                                      }));
                                      void saveOverride(s, preset.value);
                                    }}
                                    className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-all cursor-pointer ${
                                      selected
                                        ? 'bg-accent text-accent-fg shadow-xs'
                                        : 'border border-border-theme bg-surface-muted/75 text-ink-muted hover:text-ink'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          <div className="flex flex-1 items-center gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={isNum ? 'number' : 'text'}
                                value={currentDraft}
                                onChange={(e) =>
                                  setDraftValues((prev) => ({
                                    ...prev,
                                    [s.key]: e.target.value,
                                  }))
                                }
                                className="h-8 min-h-[32px] pr-10 tabular-nums"
                                data-testid={`setting-input-${s.key}`}
                              />
                              {optionMeta?.unit && (
                                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10.5px] font-bold text-ink-muted">
                                  {optionMeta.unit}
                                </span>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="lavender"
                              size="xs"
                              onClick={() => saveOverride(s, currentDraft)}
                              className="shrink-0"
                            >
                              <Save className="h-3 w-3" />
                              Apply &amp; Cache
                            </Button>
                          </div>
                        </div>
                      )}

                      {isOverriddenHere && activeScope !== 'SYSTEM' && (
                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="warning"
                            size="xs"
                            onClick={() => resetOverride(s)}
                            data-testid={`setting-reset-${s.key}`}
                          >
                            <RotateCcw className="h-3 w-3" />
                            Reset to Parent Scope
                          </Button>
                        </div>
                      )}
                    </div>
                  </Can>
                </div>
              );
            })}
            {filteredSettings.length === 0 && (
              <div className="zona-card md:col-span-2 p-8 text-center text-xs text-ink-muted">
                No configuration keys match your search or category filter.
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 3: Modern Row-Wise Editable Manage Access (Super Admin / Admin Logins) */}
        <TabsContent value="rbac" className="space-y-4">
          <div className="zona-card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-bold text-ink">
                  {showAllRoles ? 'All Business Logins & Roles' : 'Super Admin & Owner Logins'}
                </h2>
                <p className="text-[11px] text-ink-muted">
                  Row-wise account access management. Edit assigned roles, branch scope, active access, or 6-digit supervisor PINs inline.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-2 rounded-[var(--theme-radius-control)] border border-border-theme bg-surface-muted px-2.5 py-1.5 text-[11px] font-semibold text-ink cursor-pointer">
                  <Switch
                    checked={showAllRoles}
                    onCheckedChange={setShowAllRoles}
                    data-testid="access-show-all-switch"
                  />
                  <span>Show all staff roles</span>
                </label>

                <Can permission="rbac:manage">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingRoleTarget(null);
                        setRoleModalOpen(true);
                      }}
                      data-testid="add-custom-role-btn"
                    >
                      <Shield className="h-3.5 w-3.5 text-accent" />
                      New Role
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingDesignation(null);
                        setDesigModalOpen(true);
                      }}
                      data-testid="add-designation-btn"
                    >
                      <Briefcase className="h-3.5 w-3.5 text-accent" />
                      New Designation
                    </Button>
                    <DynamicButton
                      variant="obsidian"
                      icon={<UserPlus className="h-3.5 w-3.5" />}
                      onClick={openCreateAccessModal}
                      data-testid="add-access-user-btn"
                    >
                      Add User Login
                    </DynamicButton>
                  </div>
                </Can>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative flex-1 min-w-[210px] max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={accessSearch}
                  onChange={(e) => setAccessSearch(e.target.value)}
                  placeholder="Search admin name, email or role..."
                  className="pl-8"
                  data-testid="access-search-input"
                />
              </div>

              <Select value={accessRoleFilter} onValueChange={setAccessRoleFilter}>
                <SelectTrigger className="h-9 w-[170px] text-xs">
                  <SelectValue placeholder="Filter Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Roles</SelectItem>
                  {(accessData?.roles || []).map((r) => (
                    <SelectItem key={r.id} value={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="inline-flex items-center gap-1">
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setAccessStatusFilter(st)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-all cursor-pointer ${
                      accessStatusFilter === st
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'border border-border-theme bg-surface-muted/80 text-ink-muted hover:text-ink'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : st === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </button>
                ))}
              </div>
            </div>

            <Table data-testid="access-users-table">
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="full_name"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Admin User
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="role_name"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Assigned Role
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="designation_name"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Designation
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="branch_name"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Branch Scope
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="has_pin"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Supervisor PIN
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="is_active"
                    activeSortKey={accessSort.sortConfig?.key}
                    sortDir={accessSort.sortConfig?.dir}
                    onSort={accessSort.requestSort}
                  >
                    Active
                  </SortableTableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessPagination.pagedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                      No matching logins found.
                    </TableCell>
                  </TableRow>
                ) : (
                  accessPagination.pagedItems.map((row) => (
                    <TableRow key={row.user_business_role_id} data-testid={`access-row-${row.email}`}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] bg-accent text-[11px] font-bold text-accent-fg">
                            {extractInitials(row.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-ink">{row.full_name}</p>
                            <p className="truncate text-[10.5px] text-ink-muted">{row.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Can
                          permission="rbac:manage"
                          fallback={<Badge variant="lavender">{row.role_name}</Badge>}
                        >
                          <Select
                            value={row.role_id}
                            onValueChange={(val) => updateRowInline(row, { role_id: val })}
                          >
                            <SelectTrigger className="h-8 min-w-[140px] text-[11.5px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(accessData?.roles || []).map((r) => (
                                <SelectItem key={r.id} value={r.id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Can>
                      </TableCell>
                      <TableCell>
                        <Can
                          permission="rbac:manage"
                          fallback={<span className="text-xs text-ink-muted">{row.designation_name || '—'}</span>}
                        >
                          <Select
                            value={row.designation_id || 'NONE'}
                            onValueChange={(val) =>
                              updateRowInline(row, { designation_id: val === 'NONE' ? '' : val })
                            }
                          >
                            <SelectTrigger className="h-8 min-w-[140px] text-[11.5px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NONE">No Designation</SelectItem>
                              {(accessData?.designations || []).map((d) => (
                                <SelectItem key={d.id} value={d.id}>
                                  {d.name} ({d.max_pos_discount_pct}% disc)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Can>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <Can
                            permission="rbac:manage"
                            fallback={
                              <span className="text-[11.5px] font-medium text-ink">
                                {row.all_branches_access || isMultiBranchRole(row.role_code)
                                  ? 'All Branches'
                                  : (row.allowed_branch_ids?.length ?? 0) > 1
                                  ? `${row.allowed_branch_ids?.length} Branches`
                                  : row.branch_name || 'All Branches'}
                              </span>
                            }
                          >
                            <Select
                              value={
                                row.all_branches_access || isMultiBranchRole(row.role_code)
                                  ? 'ALL'
                                  : row.branch_id || defaultConcreteBranchId
                              }
                              onValueChange={(val) =>
                                updateRowInline(row, {
                                  branch_id: val === 'ALL' ? null : val,
                                  all_branches_access: val === 'ALL',
                                  allowed_branch_ids: val === 'ALL' ? [] : [val],
                                })
                              }
                            >
                              <SelectTrigger
                                className="h-8 min-w-[155px] text-[11.5px]"
                                data-testid={`access-row-branch-${row.email}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALL">All Branches</SelectItem>
                                {availableAccessBranches.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Can>
                          <div className="flex flex-wrap items-center gap-1">
                            {row.all_branches_access || isMultiBranchRole(row.role_code) ? (
                              <Badge variant="lavender" className="text-[9.5px] px-1.5 py-0">
                                All Branches ({availableAccessBranches.length})
                              </Badge>
                            ) : (row.allowed_branch_ids?.length ?? 0) > 1 ? (
                              <Badge variant="accent" className="text-[9.5px] px-1.5 py-0">
                                {row.allowed_branch_ids?.length} Branches Assigned
                              </Badge>
                            ) : null}
                            {(row.allowed_terminal_ids?.length ?? 0) > 0 ? (
                              <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 font-mono">
                                {row.allowed_terminal_ids?.length} POS Term
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-ink-muted">All Branch POS</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.has_pin ? 'positive' : 'outline'}>
                          <KeyRound className="mr-1 h-3 w-3" />
                          {row.has_pin ? 'PIN Ready' : 'Not Set'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.is_active}
                          onCheckedChange={(checked) => updateRowInline(row, { is_active: checked })}
                          aria-label={`Toggle active status for ${row.full_name}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Can permission="rbac:manage">
                          <Button
                            type="button"
                            variant="info"
                            size="xs"
                            onClick={() => openEditAccessModal(row)}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        </Can>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <DataTablePagination
              page={accessPagination.page}
              pageSize={accessPagination.pageSize}
              totalItems={accessPagination.totalItems}
              totalPages={accessPagination.totalPages}
              onPageChange={accessPagination.setPage}
              onPageSizeChange={accessPagination.setPageSize}
              pageSizeOptions={[4, 6, 10, 20]}
              itemLabel="accounts"
              testIdPrefix="access-pagination"
            />
          </div>

          {/* Roles Matrix & Staff Designations (2-Column Symmetrical Bento) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-stretch">
            <section className="zona-card flex flex-col justify-between p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-bold text-ink">
                      RBAC Roles &amp; Permission Bundles
                    </h3>
                    <p className="text-[11px] text-ink-muted">
                      System baseline roles &amp; tenant custom permission profiles.
                    </p>
                  </div>
                  <Can permission="rbac:manage">
                    <Button
                      type="button"
                      size="xs"
                      variant="lavender"
                      onClick={() => {
                        setEditingRoleTarget(null);
                        setRoleModalOpen(true);
                      }}
                      data-testid="rbac-create-role-card-btn"
                    >
                      <Plus className="h-3 w-3" />
                      Create Role
                    </Button>
                  </Can>
                </div>

                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                  {(accessData?.roles || []).map((r) => {
                    const rolePerms =
                      data?.roles?.find((rm) => rm.role_id === r.id)?.permissions || [];
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/60 px-3 py-2"
                        data-testid={`rbac-role-row-${r.code}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-ink">{r.name}</p>
                            <Badge variant={r.is_system ? 'outline' : 'lavender'}>
                              {r.is_system ? 'System' : 'Custom'}
                            </Badge>
                          </div>
                          <p className="truncate text-[10.5px] text-ink-muted">
                            {formatDisplayLabel(r.code)} • {rolePerms.length} permissions
                          </p>
                        </div>
                        <Can permission="rbac:manage">
                          <Button
                            type="button"
                            size="xs"
                            variant="info"
                            onClick={() => {
                              setEditingRoleTarget({
                                id: r.id,
                                code: r.is_system ? `${r.code}_CUSTOM` : r.code,
                                name: r.is_system ? `${r.name} Custom` : r.name,
                                description: r.description,
                                is_system: r.is_system,
                                permissions: rolePerms,
                              });
                              setRoleModalOpen(true);
                            }}
                          >
                            {r.is_system ? 'Clone' : 'Edit'}
                          </Button>
                        </Can>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="zona-card flex flex-col justify-between p-4 space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[13px] font-bold text-ink">
                      Departments &amp; Staff Designations
                    </h3>
                    <p className="text-[11px] text-ink-muted">
                      Controls hierarchical job titles and maximum POS cashier discount authority.
                    </p>
                  </div>
                  <Can permission="rbac:manage">
                    <Button
                      type="button"
                      size="xs"
                      variant="lavender"
                      onClick={() => {
                        setEditingDesignation(null);
                        setDesigModalOpen(true);
                      }}
                      data-testid="rbac-create-desig-card-btn"
                    >
                      <Plus className="h-3 w-3" />
                      Create Designation
                    </Button>
                  </Can>
                </div>

                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-0.5">
                  {(accessData?.designations || []).length === 0 ? (
                    <div className="rounded-[var(--theme-radius-inner)] border border-dashed border-border-theme p-5 text-center text-xs text-ink-muted">
                      No staff designations created yet.
                    </div>
                  ) : (
                    (accessData?.designations || []).map((d) => {
                      const dept = (accessData?.departments || []).find(
                        (dp) => dp.id === d.department_id
                      );
                      return (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/60 px-3 py-2"
                          data-testid={`rbac-desig-row-${d.code}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-xs font-bold text-ink">{d.name}</p>
                              <Badge variant="positive" className="tabular-nums">
                                Max {d.max_pos_discount_pct}% Disc
                              </Badge>
                            </div>
                            <p className="truncate text-[10.5px] text-ink-muted">
                              {dept ? dept.name : 'General'} • {d.code}
                            </p>
                          </div>
                          <Can permission="rbac:manage">
                            <Button
                              type="button"
                              size="xs"
                              variant="info"
                              onClick={() => {
                                setEditingDesignation(d);
                                setDesigModalOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </Can>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create / Edit Admin Login Dialog */}
      <Dialog open={userModalOpen} onOpenChange={setUserModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? `Edit Access & Branch/Terminal Scope: ${editingUser.full_name}` : 'Add Admin / Staff Login'}
            </DialogTitle>
            <DialogDescription>
              Configure tenant role assignment, designation discount cap, multi-branch &amp; POS terminal access, and 6-digit Supervisor PIN.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAccessUser} noValidate className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Full Name *</label>
                <Input
                  value={formFullName}
                  onChange={(e) => {
                    setFormFullName(e.target.value);
                    if (formErrors.fullName) setFormErrors((prev) => ({ ...prev, fullName: '' }));
                  }}
                  placeholder="e.g., Alex Fernando"
                  aria-invalid={Boolean(formErrors.fullName)}
                />
                {formErrors.fullName && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="user-fullname-error">
                    {formErrors.fullName}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Work Email *</label>
                <Input
                  type="email"
                  value={formEmail}
                  onChange={(e) => {
                    setFormEmail(e.target.value);
                    if (formErrors.email) setFormErrors((prev) => ({ ...prev, email: '' }));
                  }}
                  disabled={Boolean(editingUser)}
                  placeholder="admin@company.com"
                  aria-invalid={Boolean(formErrors.email)}
                />
                {formErrors.email && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="user-email-error">
                    {formErrors.email}
                  </p>
                )}
              </div>
            </div>

            {!editingUser && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  Initial Password <span className="text-ink-muted">(min 8 chars)</span>
                </label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Set account password"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-ink">Role</label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRoleTarget(null);
                      setRoleModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    New Role
                  </button>
                </div>
                <Select value={formRoleId} onValueChange={handleFormRoleChange}>
                  <SelectTrigger data-testid="access-user-role-select">
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
                    onClick={() => {
                      setEditingDesignation(null);
                      setDesigModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    <Plus className="h-3 w-3" />
                    New Designation
                  </button>
                </div>
                <Select value={formDesigId} onValueChange={setFormDesigId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Designation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Designation</SelectItem>
                    {(accessData?.designations || []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Multi-Branch Scope Assignment Box */}
            <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-ink">Branch Access Scope (1, Multiple, or All Branches)</p>
                  <p className="text-[10.5px] text-ink-muted">
                    Users with multiple branches can switch branches in the header and view consolidated multi-branch overviews.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-full border border-border-theme bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink cursor-pointer">
                  <Switch
                    checked={formAllBranches}
                    disabled={selectedRoleSupportsAllBranches}
                    onCheckedChange={(checked) => {
                      setFormAllBranches(checked);
                      if (checked) {
                        setFormBranchId('ALL');
                        setFormErrors((prev) => ({ ...prev, branch: '' }));
                      } else if (formAllowedBranchIds.length === 0 && defaultConcreteBranchId) {
                        setFormAllowedBranchIds([defaultConcreteBranchId]);
                        setFormBranchId(defaultConcreteBranchId);
                      }
                    }}
                    data-testid="access-user-all-branches-switch"
                  />
                  <span>All Company Branches</span>
                </label>
              </div>

              {!formAllBranches && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {availableAccessBranches.map((b) => {
                    const checked = formAllowedBranchIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleAllowedBranch(b.id)}
                        data-testid={`access-branch-check-${b.code}`}
                        className={`flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                          checked
                            ? 'border-accent bg-accent-soft/30 font-bold text-ink'
                            : 'border-border-theme bg-surface text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span className="truncate">
                          <strong className="font-mono text-[10.5px]">{b.code}</strong> • {b.name}
                        </span>
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-accent bg-accent text-white' : 'border-border-theme'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {formErrors.branch && (
                <p className="text-[11px] font-medium text-red-500" data-testid="user-branch-error">
                  {formErrors.branch}
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 pt-1">
                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-ink">
                    Default / Primary Branch on Login
                  </label>
                  <Select value={formBranchId} onValueChange={setFormBranchId}>
                    <SelectTrigger data-testid="access-user-branch-select" className="h-8 text-xs">
                      <SelectValue placeholder="Select Primary Branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {formAllBranches && <SelectItem value="ALL">All Branches (Consolidated)</SelectItem>}
                      {availableAccessBranches
                        .filter((b) => formAllBranches || formAllowedBranchIds.includes(b.id))
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.code} — {b.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10.5px] font-semibold text-ink">
                    Default POS Terminal on Login
                  </label>
                  <Select value={formDefaultTerminalId} onValueChange={setFormDefaultTerminalId}>
                    <SelectTrigger data-testid="access-user-default-terminal-select" className="h-8 text-xs">
                      <SelectValue placeholder="Auto-select First Terminal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Auto (First Branch Terminal)</SelectItem>
                      {availableAccessTerminals
                        .filter(
                          (tm) =>
                            (formAllBranches || formAllowedBranchIds.includes(tm.branch_id)) &&
                            (formAllowedTerminalIds.length === 0 || formAllowedTerminalIds.includes(tm.id))
                        )
                        .map((tm) => (
                          <SelectItem key={tm.id} value={tm.id}>
                            {tm.code} — {tm.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Multi-Terminal Assignment Box */}
            <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-ink">POS Terminal Assignment</p>
                  <p className="text-[10.5px] text-ink-muted">
                    Leave all unchecked to allow all terminals in the user&apos;s assigned branches, or select specific registers.
                  </p>
                </div>
                {formAllowedTerminalIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFormAllowedTerminalIds([])}
                    className="text-[10.5px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    Allow All Terminals ({formAllowedTerminalIds.length} selected)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {availableAccessTerminals
                  .filter((tm) => formAllBranches || formAllowedBranchIds.includes(tm.branch_id))
                  .map((tm) => {
                    const checked = formAllowedTerminalIds.includes(tm.id);
                    return (
                      <button
                        key={tm.id}
                        type="button"
                        onClick={() => toggleAllowedTerminal(tm.id)}
                        data-testid={`access-terminal-check-${tm.code}`}
                        className={`flex items-center justify-between gap-2 rounded-[var(--theme-radius-control)] border px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                          checked
                            ? 'border-accent bg-accent-soft/30 font-bold text-ink'
                            : 'border-border-theme bg-surface text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span className="truncate">
                          <strong className="font-mono text-[10.5px]">{tm.code}</strong> • {tm.name}
                        </span>
                        <span
                          className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked ? 'border-accent bg-accent text-white' : 'border-border-theme'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">
                  6-Digit Supervisor PIN {editingUser?.has_pin ? '(optional overwrite)' : ''}
                </label>
                <Input
                  value={formPin}
                  maxLength={6}
                  inputMode="numeric"
                  onChange={(e) => {
                    setFormPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (formErrors.pin) setFormErrors((prev) => ({ ...prev, pin: '' }));
                  }}
                  placeholder="Enter 6-digit PIN"
                  className="font-mono tabular-nums"
                  aria-invalid={Boolean(formErrors.pin)}
                />
                {formErrors.pin && (
                  <p className="text-[11px] font-medium text-red-500" data-testid="user-pin-error">
                    {formErrors.pin}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2 self-end h-10">
                <span className="text-xs font-semibold text-ink">Account Active</span>
                <Switch checked={formActive} onCheckedChange={setFormActive} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setUserModalOpen(false)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingUser}>
                {editingUser ? 'Save Access Changes' : 'Create Admin Login'}
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <RoleEditorDialog
        open={roleModalOpen}
        onOpenChange={setRoleModalOpen}
        editingRole={editingRoleTarget}
        onSaved={(newRoleId) => {
          if (userModalOpen) {
            setFormRoleId(newRoleId);
          }
        }}
      />

      <DesignationEditorDialog
        open={desigModalOpen}
        onOpenChange={setDesigModalOpen}
        departments={accessData?.departments || []}
        editingDesignation={editingDesignation}
        onSaved={(newDesigId) => {
          if (userModalOpen) {
            setFormDesigId(newDesigId);
          }
        }}
      />
    </>
  );
}
