import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Activity,
  Building2,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  KeyRound,
  Laptop,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { adminApiFetch } from '@/lib/api';
import { formatDisplayLabel, formatPermissionActionLabel } from '@/lib/formatLabel';
import { RateLimitPolicyGrid, type RateLimitPolicyMetric } from '@/features/settings/SessionsSecurityTab';
import { getCompanyLoginPath, normalizeCompanySlug } from '@/store/authStore';
import { usePlatformAdminStore } from '@/store/platformAdminStore';
import { toast } from 'sonner';
import {
  INDUSTRY_BLUEPRINTS,
  INDUSTRY_MODE_LIST,
  INDUSTRY_PRESETS,
  normalizeIndustryMode,
  type IndustryLayoutMode,
} from '../pos/components/capabilities';

function buildUniqueCompanySlug(rawName: string, existingSlugs: Set<string>): string {
  let base = normalizeCompanySlug(rawName);
  if (!base) return '';
  if (['admin', 'login', 'platform', 'api'].includes(base)) {
    base = `${base}-co`;
  }
  if (!existingSlugs.has(base)) {
    return base;
  }
  for (let suffix = 2; suffix <= 99; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }
  return base;
}

interface AdminCompanyRow {
  id: string;
  slug: string;
  db_name: string;
  login_path: string;
  name: string;
  trade_name: string;
  legal_name: string;
  tax_registration_no: string;
  base_currency: string;
  default_language: string;
  primary_color_hex: string;
  industry_profile: string;
  owner_email: string;
  is_active: boolean;
  created_at: string;
  branch_count: number;
  terminal_count: number;
  user_count: number;
  invoice_count: number;
}

interface PlatformAdminRow {
  id: string;
  email: string;
  full_name: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdminAuditLogRow {
  id: string;
  business_id?: string | { UUID?: string; Valid?: boolean } | null;
  company_slug?: string;
  company_name: string;
  company_industry: string;
  db_name?: string;
  branch_name: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  module: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  ip_address: string;
  status: 'SUCCESS' | 'DENIED' | 'ERROR' | string;
  created_at: string;
}

interface AdminLogsResponse {
  logs: AdminAuditLogRow[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminSessionRow {
  id: string;
  admin_id: string;
  admin_email: string;
  admin_name: string;
  admin_title: string;
  ip_address: string;
  device_label: string;
  created_at: string;
  last_seen_at: string;
  idle_expires_at: string;
  expires_at: string;
  is_current: boolean;
}

interface AdminSecurityOverviewResponse {
  current_session_id: string;
  sessions: AdminSessionRow[];
  rate_limits: RateLimitPolicyMetric[];
}

const AUDIT_MODULES = [
  'ALL',
  'AUTH',
  'SECURITY',
  'PLATFORM',
  'POS',
  'INVENTORY',
  'ACCOUNTING',
  'SETTINGS',
  'RBAC',
  'TAX',
];

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const s = String(val ?? '').replace(/"/g, '""');
  return `"${s}"`;
}

function deriveDbPreview(slug: string): string {
  const clean = normalizeCompanySlug(slug);
  if (!clean) return 'pos_tenant_new_company';
  return `pos_tenant_${clean.replace(/-/g, '_')}`;
}

/**
 * Isolated Platform SuperAdmin Control Portal (`/admin`):
 * 1) Companies & Separate PostgreSQL Databases (`pos_tenant_<slug>`) + 1-to-1 login provisioning
 * 2) Platform SuperAdmins management (`platform_admins` in master DB)
 * 3) Cross-Company Security, Provisioning & Audit Logs with CSV Export
 * Zero ERP/tenant impersonation or workspace switching.
 */
export function AdminPortalPage() {
  const { admin: currentAdmin, setAdminSession } = usePlatformAdminStore();

  const [activeTab, setActiveTab] = React.useState<'companies' | 'admins' | 'logs' | 'security'>('companies');
  const [securityBusyId, setSecurityBusyId] = React.useState<string | null>(null);

  // Create Company + Database + First Owner modal state
  const [createOpen, setCreateOpen] = React.useState(false);
  const [compName, setCompName] = React.useState('');
  const [compSlug, setCompSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [compTradeName, setCompTradeName] = React.useState('');
  const [tradeNameTouched, setTradeNameTouched] = React.useState(false);
  const [compLegalName, setCompLegalName] = React.useState('');
  const [compIndustry, setCompIndustry] = React.useState<IndustryLayoutMode>('restaurant');
  const [compCurrency, setCompCurrency] = React.useState('LKR');
  const [compLanguage, setCompLanguage] = React.useState('en');
  const [compVatReg, setCompVatReg] = React.useState('');
  const [compAccent] = React.useState('#877FC1');
  const [compApplySlTax, setCompApplySlTax] = React.useState(true);
  const [branchName, setBranchName] = React.useState(INDUSTRY_BLUEPRINTS.restaurant.defaultBranchName);
  const [branchCode, setBranchCode] = React.useState(INDUSTRY_BLUEPRINTS.restaurant.defaultBranchCode);
  const [branchTouched, setBranchTouched] = React.useState(false);
  const [branchCity, setBranchCity] = React.useState('Colombo');
  const [ownerFullName, setOwnerFullName] = React.useState('');
  const [ownerEmail, setOwnerEmail] = React.useState('');
  const [ownerPassword, setOwnerPassword] = React.useState('');
  const [showOwnerPassword, setShowOwnerPassword] = React.useState(false);
  const [ownerPin, setOwnerPin] = React.useState('');
  const [creatingCompany, setCreatingCompany] = React.useState(false);

  // Edit Company modal state
  const [editCompany, setEditCompany] = React.useState<AdminCompanyRow | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editTradeName, setEditTradeName] = React.useState('');
  const [editCurrency, setEditCurrency] = React.useState('USD');
  const [editIndustry, setEditIndustry] = React.useState<IndustryLayoutMode>('retail');
  const [editActive, setEditActive] = React.useState(true);
  const [savingEditCompany, setSavingEditCompany] = React.useState(false);

  // Platform SuperAdmin create/edit modal state
  const [createAdminOpen, setCreateAdminOpen] = React.useState(false);
  const [newAdminName, setNewAdminName] = React.useState('');
  const [newAdminEmail, setNewAdminEmail] = React.useState('');
  const [newAdminTitle, setNewAdminTitle] = React.useState('Platform Administrator');
  const [newAdminPassword, setNewAdminPassword] = React.useState('');
  const [showNewAdminPassword, setShowNewAdminPassword] = React.useState(false);
  const [creatingAdmin, setCreatingAdmin] = React.useState(false);

  const [editAdmin, setEditAdmin] = React.useState<PlatformAdminRow | null>(null);
  const [editAdminName, setEditAdminName] = React.useState('');
  const [editAdminTitle, setEditAdminTitle] = React.useState('');
  const [editAdminActive, setEditAdminActive] = React.useState(true);
  const [savingAdminEdit, setSavingAdminEdit] = React.useState(false);

  // Audit Log filter & pagination state
  const [logBusinessId, setLogBusinessId] = React.useState<string>('ALL');
  const [logModule, setLogModule] = React.useState<string>('ALL');
  const [logStatus, setLogStatus] = React.useState<'ALL' | 'SUCCESS' | 'DENIED' | 'ERROR'>('ALL');
  const [logSearch, setLogSearch] = React.useState<string>('');
  const [logOffset, setLogOffset] = React.useState<number>(0);
  const LOG_PAGE_SIZE = 50;

  const { data: companiesData, isLoading: loadingCompanies, refetch: refetchCompanies } = useQuery({
    queryKey: ['platform-admin-companies'],
    queryFn: () => adminApiFetch<{ companies: AdminCompanyRow[] }>('/api/v1/admin/companies'),
    placeholderData: keepPreviousData,
  });

  const { data: adminsData, isLoading: loadingAdmins, refetch: refetchAdmins } = useQuery({
    queryKey: ['platform-admin-users'],
    queryFn: () => adminApiFetch<{ admins: PlatformAdminRow[] }>('/api/v1/admin/platform-users'),
    placeholderData: keepPreviousData,
  });

  const logsQueryString = React.useMemo(() => {
    const p = new URLSearchParams();
    if (logBusinessId !== 'ALL') p.set('business_id', logBusinessId);
    if (logModule !== 'ALL') p.set('module', logModule);
    if (logStatus !== 'ALL') p.set('status', logStatus);
    if (logSearch.trim()) p.set('q', logSearch.trim());
    p.set('limit', String(LOG_PAGE_SIZE));
    p.set('offset', String(logOffset));
    return p.toString();
  }, [logBusinessId, logModule, logStatus, logSearch, logOffset]);

  const { data: logsData, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['platform-admin-logs', logsQueryString],
    queryFn: () => adminApiFetch<AdminLogsResponse>(`/api/v1/admin/logs?${logsQueryString}`),
    placeholderData: keepPreviousData,
  });

  const { data: securityData, refetch: refetchSecurity } = useQuery({
    queryKey: ['platform-admin-security'],
    queryFn: () => adminApiFetch<AdminSecurityOverviewResponse>('/api/v1/admin/security/overview'),
    refetchInterval: 30000,
  });

  const handleRefreshAdminSession = async () => {
    setSecurityBusyId('refresh');
    try {
      const res = await adminApiFetch<{ token: string; admin: any }>('/api/v1/admin/refresh', {
        method: 'POST',
      });
      if (res?.token && res?.admin) {
        setAdminSession(res.token, res.admin);
      }
      toast.success('Platform admin session extended');
      await refetchSecurity();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to refresh platform session');
    } finally {
      setSecurityBusyId(null);
    }
  };

  const handleRevokeAdminSession = async (sessionId: string) => {
    setSecurityBusyId(sessionId);
    try {
      await adminApiFetch(`/api/v1/admin/sessions/${sessionId}`, { method: 'DELETE' });
      toast.success('Platform session terminated');
      await Promise.all([refetchSecurity(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to revoke platform session');
    } finally {
      setSecurityBusyId(null);
    }
  };

  const handleRevokeOtherAdminSessions = async () => {
    setSecurityBusyId('revoke-others');
    try {
      const res = await adminApiFetch<{ revoked_count: number }>(
        '/api/v1/admin/sessions/revoke-others',
        { method: 'POST' }
      );
      toast.success(`Terminated ${res.revoked_count} other platform session(s)`);
      await Promise.all([refetchSecurity(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to revoke other platform sessions');
    } finally {
      setSecurityBusyId(null);
    }
  };

  const companies = companiesData?.companies || [];
  const platformAdmins = adminsData?.admins || [];
  const totalUsersAcrossPlatform = companies.reduce((sum, c) => sum + (c.user_count || 0), 0);
  const totalInvoicesAcrossPlatform = companies.reduce((sum, c) => sum + (c.invoice_count || 0), 0);

  const existingSlugSet = React.useMemo(
    () => new Set(companies.map((c) => normalizeCompanySlug(c.slug))),
    [companies]
  );
  const duplicateCompanyName = React.useMemo(() => {
    const clean = compName.trim().toLowerCase();
    if (!clean) return false;
    return companies.some((c) => c.name.trim().toLowerCase() === clean);
  }, [companies, compName]);

  const effectiveSlug = slugTouched
    ? normalizeCompanySlug(compSlug)
    : compSlug || buildUniqueCompanySlug(compName, existingSlugSet);
  const duplicateSlug = Boolean(effectiveSlug) && existingSlugSet.has(effectiveSlug);
  const previewDbName = deriveDbPreview(effectiveSlug);
  const previewLoginPath = getCompanyLoginPath(effectiveSlug);
  const activeBlueprint = INDUSTRY_BLUEPRINTS[compIndustry];

  const handleSelectIndustryVertical = (nextMode: IndustryLayoutMode) => {
    setCompIndustry(nextMode);
    if (!branchTouched) {
      const nextBp = INDUSTRY_BLUEPRINTS[nextMode];
      setBranchName(nextBp.defaultBranchName);
      setBranchCode(nextBp.defaultBranchCode);
    }
  };

  const resetCreateCompanyForm = () => {
    const defaultBp = INDUSTRY_BLUEPRINTS.restaurant;
    setCompName('');
    setCompSlug('');
    setSlugTouched(false);
    setCompTradeName('');
    setTradeNameTouched(false);
    setCompLegalName('');
    setCompIndustry('restaurant');
    setCompCurrency('LKR');
    setCompLanguage('en');
    setCompVatReg('');
    setCompApplySlTax(true);
    setBranchName(defaultBp.defaultBranchName);
    setBranchCode(defaultBp.defaultBranchCode);
    setBranchTouched(false);
    setBranchCity('Colombo');
    setOwnerFullName('');
    setOwnerEmail('');
    setOwnerPassword('');
    setShowOwnerPassword(false);
    setOwnerPin('');
  };

  const handleCopyLoginLink = async (loginPath: string, companyName: string) => {
    const fullUrl = `${window.location.origin}${loginPath}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success(`Copied 1-to-1 login URL for ${companyName}: ${loginPath}`);
    } catch {
      toast.info(`1-to-1 Login URL: ${fullUrl}`);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) {
      toast.error('Company name is required');
      return;
    }
    if (duplicateCompanyName) {
      toast.error(`A company named "${compName.trim()}" already exists`);
      return;
    }
    if (!effectiveSlug) {
      toast.error('Valid company portal slug is required');
      return;
    }
    if (duplicateSlug) {
      toast.error(`Portal slug "${effectiveSlug}" already exists — choose a unique identity`);
      return;
    }
    if (!ownerEmail.trim() || !ownerEmail.includes('@')) {
      toast.error('Valid company owner/superadmin email is required');
      return;
    }
    if (ownerPassword.trim().length < 6) {
      toast.error('Owner password must be at least 6 characters');
      return;
    }
    if (ownerPin.trim() && ownerPin.trim().length !== 6) {
      toast.error('Supervisor PIN must be 6 digits');
      return;
    }

    setCreatingCompany(true);
    try {
      const res = await adminApiFetch<{
        company: {
          id: string;
          slug: string;
          db_name: string;
          login_path: string;
          name: string;
          owner_email: string;
        };
      }>('/api/v1/admin/companies', {
        method: 'POST',
        body: JSON.stringify({
          slug: effectiveSlug,
          name: compName.trim(),
          trade_name: (compTradeName || compName).trim(),
          legal_name: (compLegalName || compName).trim(),
          industry_profile: compIndustry,
          base_currency: compCurrency,
          default_language: compLanguage,
          tax_registration_no: compVatReg.trim(),
          primary_color_hex: compAccent,
          apply_sl_tax: compApplySlTax,
          branch_name: branchName.trim() || 'Main Flagship',
          branch_code: branchCode.trim().toUpperCase() || 'MAIN-01',
          country_code: compCurrency === 'LKR' ? 'LK' : 'US',
          country_name: compCurrency === 'LKR' ? 'Sri Lanka' : 'Global',
          city: branchCity.trim() || 'Colombo',
          address: '',
          owner_full_name: ownerFullName.trim() || `${compName.trim()} Owner`,
          owner_email: ownerEmail.trim().toLowerCase(),
          owner_password: ownerPassword.trim(),
          supervisor_pin: ownerPin.trim(),
        }),
      });
      toast.success(
        `Created "${res.company.name}" • Database: ${res.company.db_name} • Portal: ${res.company.login_path}`
      );
      setCreateOpen(false);
      resetCreateCompanyForm();
      await Promise.all([refetchCompanies(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to provision company database');
    } finally {
      setCreatingCompany(false);
    }
  };

  const openEditCompanyModal = (c: AdminCompanyRow) => {
    setEditCompany(c);
    setEditName(c.name);
    setEditTradeName(c.trade_name || c.name);
    setEditCurrency(c.base_currency || 'USD');
    setEditIndustry(normalizeIndustryMode(c.industry_profile));
    setEditActive(c.is_active);
  };

  const handleSaveCompanyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompany) return;
    setSavingEditCompany(true);
    try {
      await adminApiFetch(`/api/v1/admin/companies/${editCompany.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editName.trim(),
          trade_name: editTradeName.trim(),
          base_currency: editCurrency,
          industry_profile: editIndustry,
          is_active: editActive,
        }),
      });
      toast.success(`Updated "${editTradeName || editName}" (${INDUSTRY_PRESETS[editIndustry].label})`);
      setEditCompany(null);
      await Promise.all([refetchCompanies(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to update company');
    } finally {
      setSavingEditCompany(false);
    }
  };

  const handleToggleCompanyActive = async (c: AdminCompanyRow, nextActive: boolean) => {
    try {
      await adminApiFetch(`/api/v1/admin/companies/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: nextActive }),
      });
      toast.success(`${c.trade_name || c.name} is now ${nextActive ? 'Active' : 'Suspended'}`);
      await Promise.all([refetchCompanies(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to toggle company status');
    }
  };

  const handleCreatePlatformAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      toast.error('Valid email is required');
      return;
    }
    if (newAdminPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setCreatingAdmin(true);
    try {
      const res = await adminApiFetch<{ admin: PlatformAdminRow }>('/api/v1/admin/platform-users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newAdminName.trim(),
          email: newAdminEmail.trim().toLowerCase(),
          title: newAdminTitle.trim() || 'Platform Administrator',
          password: newAdminPassword,
        }),
      });
      toast.success(`Added Platform SuperAdmin "${res.admin.full_name}"`);
      setCreateAdminOpen(false);
      setNewAdminName('');
      setNewAdminEmail('');
      setNewAdminTitle('Platform Administrator');
      setNewAdminPassword('');
      setShowNewAdminPassword(false);
      await Promise.all([refetchAdmins(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to create Platform SuperAdmin');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const openEditAdminModal = (a: PlatformAdminRow) => {
    setEditAdmin(a);
    setEditAdminName(a.full_name);
    setEditAdminTitle(a.title);
    setEditAdminActive(a.is_active);
  };

  const handleSaveAdminEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAdmin) return;
    if (editAdmin.id === currentAdmin?.admin_id && !editAdminActive) {
      toast.error('You cannot deactivate your own active Platform SuperAdmin account');
      return;
    }

    setSavingAdminEdit(true);
    try {
      await adminApiFetch(`/api/v1/admin/platform-users/${editAdmin.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: editAdminName.trim(),
          title: editAdminTitle.trim() || 'Platform Administrator',
          is_active: editAdminActive,
        }),
      });
      toast.success(`Updated Platform SuperAdmin "${editAdminName.trim()}"`);
      setEditAdmin(null);
      await Promise.all([refetchAdmins(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to update Platform SuperAdmin');
    } finally {
      setSavingAdminEdit(false);
    }
  };

  const handleToggleAdminActive = async (a: PlatformAdminRow, nextActive: boolean) => {
    if (a.id === currentAdmin?.admin_id && !nextActive) {
      toast.error('You cannot suspend your own signed-in SuperAdmin account');
      return;
    }
    try {
      await adminApiFetch(`/api/v1/admin/platform-users/${a.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          full_name: a.full_name,
          title: a.title,
          is_active: nextActive,
        }),
      });
      toast.success(`${a.full_name} is now ${nextActive ? 'Active' : 'Suspended'}`);
      await Promise.all([refetchAdmins(), refetchLogs()]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to update status');
    }
  };

  const handleExportLogsCsv = () => {
    const rows = logsData?.logs || [];
    if (rows.length === 0) {
      toast.info('No audit log entries to export');
      return;
    }
    const headers = [
      'Timestamp',
      'Company',
      'Slug',
      'Database',
      'Industry',
      'Branch',
      'Actor Name',
      'Actor Email',
      'Actor Role',
      'Module',
      'Action',
      'Status',
      'Summary',
      'IP Address',
    ];
    const lines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((r) =>
        [
          r.created_at,
          r.company_name,
          r.company_slug || '',
          r.db_name || '',
          r.company_industry,
          r.branch_name,
          r.actor_name,
          r.actor_email,
          r.actor_role,
          r.module,
          r.action,
          r.status,
          r.summary,
          r.ip_address,
        ]
          .map(escapeCsvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kova-platform-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} audit log rows`);
  };

  return (
    <div className="space-y-4" data-testid="admin-portal-page">
      {/* KPI Bento Strip (Balanced Horizontal Flex/Grid Row) */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Company Databases</span>
            <Database className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {companies.length}
          </p>
          <p className="text-[11px] text-ink-muted">
            {companies.filter((c) => c.is_active).length} active dedicated DBs
          </p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Platform SuperAdmins</span>
            <ShieldCheck className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {platformAdmins.length}
          </p>
          <p className="text-[11px] text-ink-muted">
            {platformAdmins.filter((a) => a.is_active).length} active master operators
          </p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tenant Footprints</span>
            <Store className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {totalInvoicesAcrossPlatform}
          </p>
          <p className="text-[11px] text-ink-muted">
            Invoices across {totalUsersAcrossPlatform} isolated users
          </p>
        </div>

        <div className="zona-card h-full flex flex-col justify-between p-4">
          <div className="flex items-center justify-between text-ink-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider">Audit Log Trail</span>
            <Activity className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-ink">
            {logsData?.total ?? 0}
          </p>
          <p className="text-[11px] text-ink-muted">Master &amp; per-DB telemetry</p>
        </div>
      </div>

      {/* Main Platform Portal Tabs (Companies & DBs | Platform SuperAdmins | All-Company Audit Logs) */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="companies" data-testid="admin-tab-companies">
              <Building2 className="mr-1.5 h-3.5 w-3.5" />
              Companies &amp; Databases ({companies.length})
            </TabsTrigger>
            <TabsTrigger value="admins" data-testid="admin-tab-admins">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Platform SuperAdmins ({platformAdmins.length})
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="admin-tab-logs">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              All-Company Audit Logs ({logsData?.total ?? 0})
            </TabsTrigger>
            <TabsTrigger value="security" data-testid="admin-tab-security">
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              Sessions &amp; Rate Limits ({securityData?.sessions?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'companies' && (
            <DynamicButton
              variant="obsidian"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => setCreateOpen(true)}
              data-testid="admin-new-company-btn"
            >
              Create Company &amp; Database
            </DynamicButton>
          )}

          {activeTab === 'admins' && (
            <DynamicButton
              variant="obsidian"
              icon={<UserPlus className="h-3.5 w-3.5" />}
              onClick={() => setCreateAdminOpen(true)}
              data-testid="admin-new-platform-user-btn"
            >
              Add Platform SuperAdmin
            </DynamicButton>
          )}
        </div>

        {/* TAB 1: Companies, Separate PostgreSQL Databases & 1-to-1 Login Portals */}
        <TabsContent value="companies" className="space-y-4">
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div>
              <h2 className="text-[14px] font-bold text-ink">
                Isolated Company Databases &amp; 1-to-1 Login Portals
              </h2>
              <p className="text-[11.5px] text-ink-muted">
                Each company runs in its own physical PostgreSQL database and has an exclusive 1-to-1 login portal URL. Platform SuperAdmins cannot enter company workspaces directly.
              </p>
            </div>

            <Table data-testid="admin-companies-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Company &amp; Owner</TableHead>
                  <TableHead>Dedicated Database &amp; 1-to-1 Portal</TableHead>
                  <TableHead>Business Vertical</TableHead>
                  <TableHead>Currency / VAT</TableHead>
                  <TableHead className="text-center">Footprint</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingCompanies ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                      Loading provisioned company databases...
                    </TableCell>
                  </TableRow>
                ) : companies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-xs text-ink-muted">
                      No company databases provisioned yet. Click &ldquo;Create Company &amp; Database&rdquo; to provision your first isolated company.
                    </TableCell>
                  </TableRow>
                ) : (
                  companies.map((c) => {
                    const mode = normalizeIndustryMode(c.industry_profile);
                    const preset = INDUSTRY_PRESETS[mode];
                    const loginPath = c.login_path || getCompanyLoginPath(c.slug);
                    return (
                      <TableRow key={c.id} data-testid={`admin-company-row-${c.slug || c.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-8 w-8 shrink-0 rounded-[var(--theme-radius-control)] border border-black/10 flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: c.primary_color_hex || '#222026' }}
                            >
                              {(c.trade_name || c.name).slice(0, 2).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs font-bold text-ink">
                                {c.trade_name || c.name}
                              </p>
                              <p className="truncate text-[10.5px] text-ink-muted">
                                Owner: {c.owner_email || c.legal_name || c.name}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <div className="space-y-1">
                            <div className="inline-flex items-center gap-1 rounded bg-surface-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-ink">
                              <Database className="h-3 w-3 text-accent" />
                              <span data-testid={`admin-company-db-${c.slug}`}>{c.db_name}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <code className="font-mono text-[10.5px] font-semibold text-accent">
                                {loginPath}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopyLoginLink(loginPath, c.trade_name || c.name)}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink cursor-pointer"
                                title={`Copy ${loginPath}`}
                                data-testid={`admin-copy-login-${c.slug}`}
                              >
                                <Copy className="h-3 w-3" />
                                Copy
                              </button>
                              <a
                                href={loginPath}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink"
                                title={`Open ${loginPath} in new tab`}
                                data-testid={`admin-open-login-${c.slug}`}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Portal
                              </a>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant="lavender">{preset.label}</Badge>
                          <p className="mt-0.5 text-[10px] text-ink-muted truncate max-w-[190px]">
                            {preset.tagline}
                          </p>
                        </TableCell>

                        <TableCell>
                          <span className="font-mono text-xs font-bold text-ink">
                            {c.base_currency}
                          </span>
                          <p className="font-mono text-[10px] text-ink-muted">
                            {c.tax_registration_no || 'No VAT ID'}
                          </p>
                        </TableCell>

                        <TableCell className="text-center font-mono text-[11px] tabular-nums text-ink-muted">
                          {c.branch_count}B · {c.terminal_count}T · {c.user_count}U · {c.invoice_count} Inv
                        </TableCell>

                        <TableCell className="text-center">
                          <Switch
                            checked={c.is_active}
                            onCheckedChange={(checked) => handleToggleCompanyActive(c, checked)}
                            aria-label={`Toggle active status for ${c.name}`}
                          />
                        </TableCell>

                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="info"
                            onClick={() => openEditCompanyModal(c)}
                            data-testid={`admin-edit-company-${c.slug}`}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        {/* TAB 2: Platform SuperAdmins (Master Control Plane Operators) */}
        <TabsContent value="admins" className="space-y-4">
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div>
              <h2 className="text-[14px] font-bold text-ink">
                Platform SuperAdmins (Master Database Scope)
              </h2>
              <p className="text-[11.5px] text-ink-muted">
                Platform administrators sign in exclusively at <code className="font-mono text-ink">/admin/login</code> to provision company databases and monitor global telemetry. They do not belong to any company tenant table.
              </p>
            </div>

            <Table data-testid="admin-platform-users-table">
              <TableHeader>
                <TableRow>
                  <TableHead>SuperAdmin Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAdmins ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                      Loading platform administrators...
                    </TableCell>
                  </TableRow>
                ) : platformAdmins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                      No platform administrators found.
                    </TableCell>
                  </TableRow>
                ) : (
                  platformAdmins.map((a) => {
                    const isSelf = a.id === currentAdmin?.admin_id;
                    return (
                      <TableRow key={a.id} data-testid={`admin-user-row-${a.email}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sidebar text-[10px] font-bold text-white">
                              {a.full_name.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-ink">{a.full_name}</span>
                                {isSelf && (
                                  <Badge variant="positive" className="text-[9.5px]">
                                    Signed In
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-ink">{a.email}</TableCell>
                        <TableCell>
                          <Badge variant="lavender">{a.title}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-[10.5px] text-ink-muted">
                          {formatDateTime(a.created_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={a.is_active}
                            disabled={isSelf}
                            onCheckedChange={(checked) => handleToggleAdminActive(a, checked)}
                            aria-label={`Toggle active status for ${a.email}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="xs"
                            variant="info"
                            onClick={() => openEditAdminModal(a)}
                            data-testid={`admin-edit-user-${a.email}`}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        {/* TAB 3: All-Company Immutable Audit Logs */}
        <TabsContent value="logs" className="space-y-4">
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-bold text-ink">
                  Cross-Company Security, Provisioning &amp; Audit Logs
                </h2>
                <p className="text-[11.5px] text-ink-muted">
                  Inspect platform admin actions, isolated database provisioning, company logins, tax schedule updates, and POS telemetry.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => refetchLogs()}
                  data-testid="admin-refresh-logs-btn"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="lavender"
                  onClick={handleExportLogsCsv}
                  data-testid="admin-export-logs-btn"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={logSearch}
                  onChange={(e) => {
                    setLogSearch(e.target.value);
                    setLogOffset(0);
                  }}
                  placeholder="Search actor, database, or event..."
                  className="pl-8"
                  data-testid="admin-logs-search"
                />
              </div>

              <Select
                value={logBusinessId}
                onValueChange={(v) => {
                  setLogBusinessId(v);
                  setLogOffset(0);
                }}
              >
                <SelectTrigger data-testid="admin-logs-company-filter">
                  <SelectValue placeholder="All Companies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Companies</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.trade_name || c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={logModule}
                onValueChange={(v) => {
                  setLogModule(v);
                  setLogOffset(0);
                }}
              >
                <SelectTrigger data-testid="admin-logs-module-filter">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m === 'ALL' ? 'All Modules' : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                {(['ALL', 'SUCCESS', 'DENIED', 'ERROR'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setLogStatus(st);
                      setLogOffset(0);
                    }}
                    className={`flex-1 rounded-full py-1.5 text-[10.5px] font-bold transition-colors cursor-pointer ${
                      logStatus === st
                        ? 'bg-accent text-accent-fg shadow-xs'
                        : 'border border-border-theme bg-surface-muted/80 text-ink-muted hover:text-ink'
                    }`}
                  >
                    {st === 'ALL' ? 'All' : formatDisplayLabel(st)}
                  </button>
                ))}
              </div>
            </div>

            <Table data-testid="admin-audit-logs-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Company / DB</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Module / Action</TableHead>
                  <TableHead>Event Summary</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingLogs ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                      Loading audit events...
                    </TableCell>
                  </TableRow>
                ) : (logsData?.logs || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-xs text-ink-muted">
                      No audit events match the active filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  (logsData?.logs || []).map((log) => (
                    <TableRow key={log.id} data-testid={`admin-log-row-${log.action}`}>
                      <TableCell className="whitespace-nowrap font-mono text-[10.5px] tabular-nums text-ink-muted">
                        {formatDateTime(log.created_at)}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-bold text-ink">{log.company_name || 'Platform Master'}</p>
                        <p className="font-mono text-[10px] text-ink-muted">
                          {log.db_name || 'enterprise_pos'}
                          {log.branch_name ? ` • ${log.branch_name}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-semibold text-ink">
                          {log.actor_name || log.actor_email || 'System'}
                        </p>
                        <p className="text-[10px] text-ink-muted">
                          {log.actor_email} {log.actor_role ? `• ${formatDisplayLabel(log.actor_role)}` : ''}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="mr-1.5 text-[9.5px]">
                          {formatDisplayLabel(log.module)}
                        </Badge>
                        <span className="text-[11px] font-bold text-ink">
                          {formatPermissionActionLabel(log.action)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[340px]">
                        <p className="text-xs text-ink line-clamp-2">{log.summary}</p>
                        {log.ip_address && (
                          <p className="font-mono text-[9.5px] text-ink-muted">
                            IP: {log.ip_address}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            log.status === 'SUCCESS'
                              ? 'positive'
                              : log.status === 'DENIED'
                              ? 'lavender'
                              : 'negative'
                          }
                        >
                          {formatDisplayLabel(log.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-theme pt-3 text-xs text-ink-muted">
              <span className="tabular-nums">
                Showing {logsData?.logs?.length ? logOffset + 1 : 0}–
                {logOffset + (logsData?.logs?.length || 0)} of {logsData?.total ?? 0} events
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={logOffset === 0}
                  onClick={() => setLogOffset((prev) => Math.max(0, prev - LOG_PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={logOffset + LOG_PAGE_SIZE >= (logsData?.total ?? 0)}
                  onClick={() => setLogOffset((prev) => prev + LOG_PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* TAB 4: Platform Sessions & Rate Limiting Telemetry */}
        <TabsContent value="security" className="space-y-4">
          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-bold text-ink flex items-center gap-2">
                  <Laptop className="h-4 w-4 text-accent" />
                  Active Platform Control Plane Sessions ({securityData?.sessions?.length ?? 0})
                </h2>
                <p className="text-[11.5px] text-ink-muted">
                  Server-tracked Master Control Plane JWT sessions (12h TTL · 4h idle timeout) backed by Redis &amp; PostgreSQL.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refetchSecurity()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  disabled={securityBusyId === 'refresh'}
                  onClick={handleRefreshAdminSession}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {securityBusyId === 'refresh' ? 'Extending...' : 'Extend Current'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={securityBusyId === 'revoke-others'}
                  onClick={handleRevokeOtherAdminSessions}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out Other Devices
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-[var(--theme-radius-inner)] border border-border-theme">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SuperAdmin</TableHead>
                    <TableHead>Device &amp; Browser</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(securityData?.sessions || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-xs text-ink-muted">
                        No tracked master sessions active yet. Sign in to establish a session row.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (securityData?.sessions || []).map((sess) => (
                      <TableRow key={sess.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{sess.admin_name}</span>
                            {sess.is_current && <Badge variant="positive">This Device</Badge>}
                          </div>
                          <p className="text-[10.5px] text-ink-muted">
                            {sess.admin_email} · {sess.admin_title}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-ink">
                          {sess.device_label || 'Web Session'}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-ink-muted">
                          {sess.ip_address || '127.0.0.1'}
                        </TableCell>
                        <TableCell className="text-[11px] tabular-nums text-ink">
                          {formatDateTime(sess.last_seen_at)}
                        </TableCell>
                        <TableCell className="text-[11px] tabular-nums text-ink-muted">
                          <div>{formatDateTime(sess.expires_at)}</div>
                          <div className="text-[10px]">Idle: {formatDateTime(sess.idle_expires_at)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          {sess.is_current ? (
                            <Badge variant="outline">Current</Badge>
                          ) : (
                            <Button
                              type="button"
                              size="xs"
                              variant="destructive"
                              disabled={securityBusyId === sess.id}
                              onClick={() => handleRevokeAdminSession(sess.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="zona-card p-4 sm:p-5 space-y-3">
            <div>
              <h2 className="text-[14px] font-bold text-ink flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-accent" />
                Global Gateway Rate-Limit Tiers &amp; Telemetry
              </h2>
              <p className="text-[11.5px] text-ink-muted">
                Real-time counters across public authentication, PIN brute-force lockouts, tenant API quotas, POS checkout bursts, and WebSockets.
              </p>
            </div>

            <RateLimitPolicyGrid rateLimits={securityData?.rate_limits || []} />
          </section>
        </TabsContent>
      </Tabs>

      {/* Provision New Company + Dedicated PostgreSQL Database Modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              Create Isolated Company &amp; Dedicated Database
            </DialogTitle>
            <DialogDescription>
              Creates a dedicated PostgreSQL database (<code className="font-mono text-ink">pos_tenant_*</code>), initializes schema &amp; tax rules, creates the company&apos;s first SuperAdmin Owner account, and generates its 1-to-1 login URL.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCompany} className="space-y-4 pt-1">
            {/* Step 1: First Company Owner / SuperAdmin User */}
            <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3.5 space-y-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5 text-accent" />
                1. First Company Owner / SuperAdmin User
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">
                    Owner Full Name <span className="text-ink-muted font-normal">(auto-filled if blank)</span>
                  </label>
                  <Input
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    placeholder={
                      compName.trim() ? `${compName.trim()} Owner` : 'e.g., Kavinda Silva'
                    }
                    data-testid="admin-create-owner-name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Owner Login Email</label>
                  <Input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@lankaspice.lk"
                    required
                    data-testid="admin-create-owner-email"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Initial Password</label>
                  <div className="relative">
                    <Input
                      type={showOwnerPassword ? 'text' : 'password'}
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      className="pr-9"
                      data-testid="admin-create-owner-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOwnerPassword((v) => !v)}
                      aria-label={showOwnerPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {showOwnerPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">6-Digit Supervisor PIN (Optional)</label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    value={ownerPin}
                    maxLength={6}
                    onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit PIN"
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Company Basic Details & Dedicated Slug/Database Preview */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-ink">
                  2. Company Basic Details &amp; Isolated Database Identity
                </p>
                {duplicateCompanyName ? (
                  <span className="inline-flex items-center rounded-full bg-[#EF4444]/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#EF4444]">
                    Duplicate company name
                  </span>
                ) : duplicateSlug ? (
                  <span className="inline-flex items-center rounded-full bg-[#EF4444]/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#EF4444]">
                    Duplicate slug in use
                  </span>
                ) : effectiveSlug ? (
                  <span className="inline-flex items-center rounded-full bg-[#22C55E]/12 px-2.5 py-0.5 text-[10.5px] font-semibold text-[#16A34A]">
                    Unique DB &amp; Portal Ready
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Company Name</label>
                  <Input
                    value={compName}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCompName(next);
                      if (!slugTouched) {
                        setCompSlug(buildUniqueCompanySlug(next, existingSlugSet));
                      }
                      if (!tradeNameTouched) {
                        setCompTradeName(next);
                      }
                    }}
                    placeholder="e.g., Lanka Spice Co"
                    required
                    data-testid="admin-create-comp-name"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <label className="text-[11px] font-semibold text-ink">Company Slug (Auto)</label>
                    {slugTouched && compName.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setSlugTouched(false);
                          setCompSlug(buildUniqueCompanySlug(compName, existingSlugSet));
                        }}
                        className="text-[10px] font-semibold text-accent hover:underline cursor-pointer"
                      >
                        Reset Auto
                      </button>
                    )}
                  </div>
                  <Input
                    value={effectiveSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setCompSlug(normalizeCompanySlug(e.target.value));
                    }}
                    placeholder="lanka-spice-co"
                    className="font-mono lowercase"
                    required
                    data-testid="admin-create-comp-slug"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Trade Name (Auto)</label>
                  <Input
                    value={compTradeName}
                    onChange={(e) => {
                      setTradeNameTouched(true);
                      setCompTradeName(e.target.value);
                    }}
                    placeholder="Shown in header & receipts"
                  />
                </div>
              </div>

              {/* Live DB + 1-to-1 URL Preview Banner (Clean Static Card, NOT dismissal alert banner) */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-sidebar/5 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-ink-muted">Dedicated DB</span>
                  <code className="font-mono text-[11px] font-bold text-ink">{previewDbName}</code>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-ink-muted">1-to-1 Login URL</span>
                  <code className="font-mono text-[11px] font-bold text-accent">{previewLoginPath}</code>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Base Currency</label>
                  <Select value={compCurrency} onValueChange={setCompCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LKR">LKR (Rs)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                      <SelectItem value="INR">INR (₹)</SelectItem>
                      <SelectItem value="SGD">SGD (S$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Default Language</label>
                  <Select value={compLanguage} onValueChange={setCompLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (EN)</SelectItem>
                      <SelectItem value="si">Sinhala (සිංහල)</SelectItem>
                      <SelectItem value="ta">Tamil (தமிழ்)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Primary Branch</label>
                  <Input
                    value={branchName}
                    onChange={(e) => {
                      setBranchTouched(true);
                      setBranchName(e.target.value);
                    }}
                    placeholder={activeBlueprint.defaultBranchName}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">VAT Reg / TIN</label>
                  <Input
                    value={compVatReg}
                    onChange={(e) => setCompVatReg(e.target.value)}
                    placeholder="e.g., 100456789-7000"
                    className="font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Step 3: Business Vertical Selector */}
            <div className="space-y-2.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-ink">
                3. Business Vertical (Auto-Migrates Settings, Designations &amp; POS Mode)
              </label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {INDUSTRY_MODE_LIST.map((preset) => {
                  const selected = compIndustry === preset.mode;
                  return (
                    <button
                      key={preset.mode}
                      type="button"
                      onClick={() => handleSelectIndustryVertical(preset.mode)}
                      data-testid={`admin-select-industry-${preset.mode}`}
                      className={`flex flex-col items-start justify-between rounded-[var(--theme-radius-inner)] border p-2.5 text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-[#222026] bg-[#222026] text-white shadow-sm'
                          : 'border-border-theme bg-surface-muted/55 text-ink hover:border-accent hover:bg-surface'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-1">
                        <span className="text-[11.5px] font-bold">{preset.label}</span>
                        {selected && <CheckCircle2 className="h-3.5 w-3.5 text-[#22C55E]" />}
                      </div>
                      <span
                        className={`mt-1 text-[10px] leading-snug ${
                          selected ? 'text-white/75' : 'text-ink-muted'
                        }`}
                      >
                        {preset.tagline}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Live Auto-Migrated Settings, Departments & Designations Preview */}
              <div
                className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/45 p-3 space-y-2.5"
                data-testid="admin-industry-blueprint-preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink">
                    Auto-Generated for {INDUSTRY_PRESETS[compIndustry].label}
                  </span>
                  <span className="font-mono text-[10px] font-semibold text-ink-muted">
                    Branch: {branchCode} · Paper: {activeBlueprint.thermalPaperWidth} · {activeBlueprint.approvalsSummary}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      Migrated Settings &amp; Features
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {activeBlueprint.settingsSummary.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center rounded-md border border-border-theme bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      Migrated Designations ({activeBlueprint.designations.length}) &amp; Categories ({activeBlueprint.categories.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {activeBlueprint.designations.map((dg) => (
                        <span
                          key={dg.title}
                          className="inline-flex items-center rounded-md border border-border-theme bg-surface px-1.5 py-0.5 text-[10px] font-medium text-ink"
                        >
                          {dg.title} ({dg.maxDiscountPct}%)
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      Migrated Starter Brands ({activeBlueprint.brands.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {activeBlueprint.brands.map((br) => (
                        <span
                          key={br}
                          className="inline-flex items-center rounded-md border border-accent/30 bg-accent-soft/45 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft-fg"
                        >
                          {br}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/75 px-3 py-2.5">
              <div>
                <p className="text-xs font-bold text-ink">
                  Enable Sri Lankan VAT (18%) + SSCL (2.5%) Tax Schedule
                </p>
                <p className="text-[10.5px] text-ink-muted">
                  Seeds IRD tax tiers directly inside the new isolated PostgreSQL database.
                </p>
              </div>
              <Switch checked={compApplySlTax} onCheckedChange={setCompApplySlTax} />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <DynamicButton
                type="submit"
                variant="obsidian"
                loading={creatingCompany}
                disabled={duplicateCompanyName || duplicateSlug}
                data-testid="admin-submit-company-btn"
              >
                Create Isolated Company &amp; DB
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Existing Company Metadata Modal */}
      <Dialog open={Boolean(editCompany)} onOpenChange={(o) => !o && setEditCompany(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Company: {editCompany?.name}</DialogTitle>
            <DialogDescription>
              Updates both Master Control Plane metadata and the company&apos;s dedicated database profile.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCompanyEdit} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Company Legal Name</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Trade Name</label>
              <Input
                value={editTradeName}
                onChange={(e) => setEditTradeName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Business Vertical</label>
                <Select
                  value={editIndustry}
                  onValueChange={(v) => setEditIndustry(normalizeIndustryMode(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDUSTRY_MODE_LIST.map((p) => (
                      <SelectItem key={p.mode} value={p.mode}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Base Currency</label>
                <Select value={editCurrency} onValueChange={setEditCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LKR">LKR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="SGD">SGD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2">
              <span className="text-xs font-semibold text-ink">Company Portal Active</span>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditCompany(null)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingEditCompany}>
                Save Company Profile
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Platform SuperAdmin Modal */}
      <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Add Platform SuperAdmin
            </DialogTitle>
            <DialogDescription>
              Creates a master control plane operator for `/admin/login`. Separate from tenant staff logins.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreatePlatformAdmin} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Full Name</label>
              <Input
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="e.g., Nimali Perera"
                data-testid="admin-create-superadmin-name"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">SuperAdmin Email</label>
              <Input
                type="email"
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="operator@kovapos.com"
                data-testid="admin-create-superadmin-email"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Title / Designation</label>
              <Input
                value={newAdminTitle}
                onChange={(e) => setNewAdminTitle(e.target.value)}
                placeholder="Platform Operations Lead"
                data-testid="admin-create-superadmin-title"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Password (min 8 chars)</label>
              <div className="relative">
                <Input
                  type={showNewAdminPassword ? 'text' : 'password'}
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-9"
                  data-testid="admin-create-superadmin-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewAdminPassword((v) => !v)}
                  aria-label={showNewAdminPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                >
                  {showNewAdminPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateAdminOpen(false)}>
                Cancel
              </Button>
              <DynamicButton
                type="submit"
                variant="obsidian"
                loading={creatingAdmin}
                data-testid="admin-submit-superadmin-btn"
              >
                Create SuperAdmin
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Platform SuperAdmin Modal */}
      <Dialog open={Boolean(editAdmin)} onOpenChange={(o) => !o && setEditAdmin(null)}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit Platform SuperAdmin</DialogTitle>
            <DialogDescription>{editAdmin?.email}</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveAdminEdit} className="space-y-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Full Name</label>
              <Input
                value={editAdminName}
                onChange={(e) => setEditAdminName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Title</label>
              <Input
                value={editAdminTitle}
                onChange={(e) => setEditAdminTitle(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-[var(--theme-radius-inner)] bg-surface-muted px-3 py-2">
              <span className="text-xs font-semibold text-ink">Account Active</span>
              <Switch
                checked={editAdminActive}
                disabled={editAdmin?.id === currentAdmin?.admin_id}
                onCheckedChange={setEditAdminActive}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditAdmin(null)}>
                Cancel
              </Button>
              <DynamicButton type="submit" variant="obsidian" loading={savingAdminEdit}>
                Save Changes
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
