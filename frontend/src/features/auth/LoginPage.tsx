import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Sun,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { KovaLogo } from '@/components/brand/KovaLogo';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch, ApiError } from '@/lib/api';
import {
  normalizeCompanySlug,
  useAuthStore,
  type PublicBranding,
} from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import {
  SUPPORTED_LANGUAGES,
  useI18nStore,
  useT,
} from '@/store/i18nStore';
import { toast } from 'sonner';

interface DirectoryCompanyItem {
  id: string;
  slug: string;
  name: string;
  trade_name: string;
  industry_profile: string;
  base_currency: string;
  default_language: string;
  primary_color_hex: string;
  logo_light_url?: string;
}

interface LoginPageProps {
  companySlug?: string | null;
  onNavigatePath: (path: string) => void;
}

export function LoginPage({ companySlug, onNavigatePath }: LoginPageProps) {
  const cleanSlug = companySlug ? normalizeCompanySlug(companySlug) : '';
  const { token, context, setSession, publicBranding, setPublicBranding } = useAuthStore();
  const { colorMode, toggleColorMode, customAccent } = useThemeStore();
  const { language, setLanguage, t } = useT();

  // Workspace companies catalog & selected slug
  const [companies, setCompanies] = React.useState<DirectoryCompanyItem[]>([]);
  const [selectedSlug, setSelectedSlug] = React.useState<string>(
    cleanSlug || normalizeCompanySlug(publicBranding?.slug) || ''
  );

  // Company branding state
  const [brandingLoading, setBrandingLoading] = React.useState(false);
  const [portalNotFound, setPortalNotFound] = React.useState(false);

  // Staff login form state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [cooldownSec, setCooldownSec] = React.useState(0);

  // Password Reset Dialog state
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetMode, setResetMode] = React.useState<'current_password' | 'supervisor_pin'>(
    'current_password'
  );
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetCurrentPw, setResetCurrentPw] = React.useState('');
  const [showResetCurrentPw, setShowResetCurrentPw] = React.useState(false);
  const [resetSupervisorEmail, setResetSupervisorEmail] = React.useState('');
  const [resetSupervisorPin, setResetSupervisorPin] = React.useState('');
  const [showResetPin, setShowResetPin] = React.useState(false);
  const [resetNewPw, setResetNewPw] = React.useState('');
  const [showResetNewPw, setShowResetNewPw] = React.useState(false);
  const [resetConfirmPw, setResetConfirmPw] = React.useState('');
  const [resetting, setResetting] = React.useState(false);

  React.useEffect(() => {
    if (cooldownSec <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSec]);

  // Keep selectedSlug synced when URL explicitly changes (/c/:slug/login)
  React.useEffect(() => {
    if (cleanSlug) {
      setSelectedSlug(cleanSlug);
    }
  }, [cleanSlug]);

  // Fetch active workspaces cleanly on /login so the primary workspace auto-resolves without blocking UI
  React.useEffect(() => {
    let active = true;
    fetch('/api/v1/auth/companies')
      .then((res) => (res.ok ? res.json() : { companies: [] }))
      .then((data: { companies?: DirectoryCompanyItem[] }) => {
        if (!active) return;
        const list = data.companies || [];
        setCompanies(list);
        if (!cleanSlug && list.length > 0) {
          setSelectedSlug((prev) => {
            if (prev && list.some((c) => normalizeCompanySlug(c.slug) === prev)) {
              return prev;
            }
            return normalizeCompanySlug(list[0].slug);
          });
        }
      })
      .catch(() => {
        if (active) setCompanies([]);
      });
    return () => {
      active = false;
    };
  }, [cleanSlug]);

  const targetSlug = cleanSlug || selectedSlug;

  // Load workspace branding smoothly whenever targetSlug resolves
  React.useEffect(() => {
    if (!targetSlug) {
      setPortalNotFound(false);
      return;
    }
    let active = true;
    setBrandingLoading(true);
    setPortalNotFound(false);
    fetch(`/api/v1/auth/branding?company_slug=${encodeURIComponent(targetSlug)}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as PublicBranding;
      })
      .then((data) => {
        if (!active) return;
        setPublicBranding({ ...data, slug: data.slug || targetSlug });
        if (!useI18nStore.getState().userPinned && data.default_language) {
          useI18nStore.getState().setLanguage(data.default_language, { fromTenantDefault: true });
        }
      })
      .catch(() => {
        if (active && cleanSlug) {
          setPortalNotFound(true);
        }
      })
      .finally(() => {
        if (active) setBrandingLoading(false);
      });

    return () => {
      active = false;
    };
  }, [targetSlug, cleanSlug, setPublicBranding]);

  const primaryHex = customAccent || '#10B981';

  React.useEffect(() => {
    if (portalNotFound) {
      document.title = 'Workspace Not Found — Kova POS';
    } else {
      document.title = `Kova POS — ${t.login.signInTitle}`;
    }
  }, [portalNotFound, t.login.signInTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSec > 0) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(targetSlug ? { company_slug: targetSlug } : {}),
        }),
      });
      setSession(res);
      toast.success(`Signed in as ${res.context.full_name} (${res.context.role_name})`);
      onNavigatePath('/');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 429) {
        setCooldownSec(err.retryAfterSeconds || 60);
      }
      toast.error(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const openResetModal = () => {
    setResetEmail(email.trim());
    setResetCurrentPw('');
    setResetSupervisorEmail('');
    setResetSupervisorPin('');
    setResetNewPw('');
    setResetConfirmPw('');
    setShowResetCurrentPw(false);
    setShowResetNewPw(false);
    setShowResetPin(false);
    setResetOpen(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      toast.error('Please enter a valid staff account email');
      return;
    }
    if (resetNewPw.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (resetNewPw !== resetConfirmPw) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (resetMode === 'supervisor_pin') {
      if (!resetSupervisorEmail.trim() || !resetSupervisorEmail.includes('@')) {
        toast.error('Authorizing manager email is required');
        return;
      }
      if (resetSupervisorPin.length !== 6) {
        toast.error('6-digit supervisor PIN is required');
        return;
      }
    } else if (!resetCurrentPw) {
      toast.error('Current password is required');
      return;
    }

    setResetting(true);
    try {
      await apiFetch('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          ...(targetSlug ? { company_slug: targetSlug } : {}),
          mode: resetMode,
          email: resetEmail.trim(),
          current_password: resetCurrentPw,
          supervisor_email: resetSupervisorEmail.trim(),
          supervisor_pin: resetSupervisorPin,
          new_password: resetNewPw,
        }),
      });
      toast.success('Password updated successfully. Sign in with your new password.');
      setEmail(resetEmail.trim());
      setPassword('');
      setResetOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Password reset failed');
    } finally {
      setResetting(false);
    }
  };

  // Explicit invalid /c/:slug/login route handling
  if (cleanSlug && !brandingLoading && portalNotFound) {
    return (
      <div
        className="min-h-screen w-full bg-canvas text-ink flex items-center justify-center p-4 sm:p-6"
        data-testid="company-portal-not-found"
      >
        <div className="w-full max-w-md rounded-[24px] border border-border-theme bg-surface p-8 text-center shadow-[var(--theme-shadow)] space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EF4444]/10 text-[#EF4444]">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[18px] font-bold tracking-tight text-ink">Workspace Not Found</h1>
            <p className="text-xs text-ink-muted leading-relaxed">
              We couldn&apos;t find an active workspace for <code className="font-mono text-ink">/c/{cleanSlug}/login</code>.
            </p>
          </div>
          <DynamicButton
            variant="obsidian"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => onNavigatePath('/login')}
            className="w-full h-11"
          >
            Go to Sign In
          </DynamicButton>
        </div>
      </div>
    );
  }

  const showWorkspaceSelect = !cleanSlug && companies.length > 1;

  return (
    <div
      className="relative min-h-screen w-full bg-canvas text-ink flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden"
      data-testid="company-login-page"
    >
      {/* Subtle Ambient Brand Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full blur-3xl opacity-[0.11]"
          style={{ background: `radial-gradient(circle, ${primaryHex} 0%, transparent 70%)` }}
        />
      </div>

      {/* Minimal Top Utility Bar (Language & Appearance) */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-end gap-2 pt-1">
        <div className="inline-flex items-center gap-1 rounded-full border border-border-theme/80 bg-surface/85 backdrop-blur-md px-2 py-1 shadow-xs">
          <Globe className="h-3.5 w-3.5 text-ink-muted ml-1 mr-0.5" />
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition cursor-pointer ${
                language === lang.code
                  ? 'bg-contrast text-contrast-fg'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {lang.shortCode}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={toggleColorMode}
          aria-label={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-theme/80 bg-surface/85 backdrop-blur-md text-ink-muted hover:text-ink transition shadow-xs cursor-pointer"
        >
          {colorMode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </header>

      {/* Centered Clean Elevated Sign-In Card */}
      <main className="relative z-10 mx-auto my-auto w-full max-w-[420px] py-8">
        {/* Clean Kova POS Brand Identity Lockup */}
        <div className="mb-6 flex flex-col items-center text-center">
          <KovaLogo
            layout="stacked"
            subtitle="Sign in to access your POS & operations workspace"
          />
        </div>

        {/* Minimal Elevated Auth Form Card */}
        <section className="rounded-[24px] border border-border-theme/85 bg-surface p-6 sm:p-8 shadow-[0_22px_50px_-14px_rgba(17,19,21,0.08)] space-y-5">
          {token && context?.company_slug && (
            <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-[#22C55E]/30 bg-[#22C55E]/10 px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-ink truncate">
                  Active session: {context.full_name}
                </p>
                <p className="truncate text-[10.5px] text-ink-muted">
                  {context.email}
                </p>
              </div>
              <Button
                type="button"
                size="xs"
                variant="default"
                onClick={() => onNavigatePath('/overview')}
              >
                Continue
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {showWorkspaceSelect && (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink">
                  Workspace
                </label>
                <Select value={targetSlug} onValueChange={setSelectedSlug}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((comp) => (
                      <SelectItem key={comp.id} value={normalizeCompanySlug(comp.slug)}>
                        {comp.trade_name || comp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="login-email" className="block text-xs font-semibold text-ink">
                {t.login.staffEmail}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="login-password" className="block text-xs font-semibold text-ink">
                  {t.login.password}
                </label>
                <button
                  type="button"
                  onClick={openResetModal}
                  data-testid="open-reset-password-btn"
                  className="text-[11.5px] font-semibold text-accent hover:underline cursor-pointer"
                >
                  Reset Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  data-testid="toggle-login-password-btn"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {cooldownSec > 0 && (
              <div className="flex items-center gap-2 rounded-[var(--theme-radius-inner)] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[11.5px] font-semibold text-[#EF4444]">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span className="tabular-nums">
                  Too many attempts — retry in {cooldownSec}s
                </span>
              </div>
            )}

            <div className="pt-1.5">
              <DynamicButton
                type="submit"
                variant="obsidian"
                loading={loading || brandingLoading}
                disabled={cooldownSec > 0}
                className="w-full h-11 text-[13px]"
                data-testid="login-submit-btn"
              >
                {cooldownSec > 0 ? (
                  `Retry in ${cooldownSec}s`
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <span>{t.login.signInButton}</span>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </DynamicButton>
            </div>
          </form>
        </section>

        {/* Quiet Minimal Footer Links */}
        <div className="mt-5 flex items-center justify-between px-1 text-[11.5px] text-ink-muted">
          <span>Protected by session &amp; rate-limit guard</span>
          <button
            type="button"
            onClick={() => onNavigatePath('/admin/login')}
            data-testid="directory-admin-portal-link"
            className="font-semibold text-ink-muted hover:text-ink transition cursor-pointer"
          >
            Admin Portal →
          </button>
        </div>
      </main>

      <footer className="relative z-10 pb-1 text-center text-[11px] text-ink-muted/75">
        Kova POS · Modern Point of Sale &amp; Accounting
      </footer>

      {/* Password Reset Verification Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-[460px]" data-testid="reset-password-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Reset Account Password
            </DialogTitle>
            <DialogDescription>
              Verify with your current password or authorize via an active manager&apos;s 6-digit supervisor PIN.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-2 gap-1.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setResetMode('current_password')}
                data-testid="reset-mode-current-btn"
                className={`rounded-[var(--theme-radius-control)] py-1.5 text-[11px] font-bold transition cursor-pointer ${
                  resetMode === 'current_password'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Current Password
              </button>
              <button
                type="button"
                onClick={() => setResetMode('supervisor_pin')}
                data-testid="reset-mode-pin-btn"
                className={`rounded-[var(--theme-radius-control)] py-1.5 text-[11px] font-bold transition cursor-pointer ${
                  resetMode === 'supervisor_pin'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Manager PIN Recovery
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Account Email</label>
              <Input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="staff@company.com"
                data-testid="reset-email-input"
                required
              />
            </div>

            {resetMode === 'current_password' ? (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Current Password</label>
                <div className="relative">
                  <Input
                    type={showResetCurrentPw ? 'text' : 'password'}
                    value={resetCurrentPw}
                    onChange={(e) => setResetCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className="pr-10"
                    data-testid="reset-current-password-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetCurrentPw((v) => !v)}
                    aria-label={showResetCurrentPw ? 'Hide current password' : 'Show current password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {showResetCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">Manager Email</label>
                  <Input
                    type="email"
                    value={resetSupervisorEmail}
                    onChange={(e) => setResetSupervisorEmail(e.target.value)}
                    placeholder="manager@company.com"
                    data-testid="reset-supervisor-email-input"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-ink">6-Digit Supervisor PIN</label>
                  <div className="relative">
                    <Input
                      type={showResetPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={resetSupervisorPin}
                      onChange={(e) => setResetSupervisorPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6-digit PIN"
                      className="pr-9 font-mono tabular-nums"
                      data-testid="reset-supervisor-pin-input"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPin((v) => !v)}
                      aria-label={showResetPin ? 'Hide supervisor PIN' : 'Show supervisor PIN'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                    >
                      {showResetPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">New Password (min 8 chars)</label>
                <div className="relative">
                  <Input
                    type={showResetNewPw ? 'text' : 'password'}
                    value={resetNewPw}
                    onChange={(e) => setResetNewPw(e.target.value)}
                    placeholder="New password"
                    className="pr-9"
                    data-testid="reset-new-password-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetNewPw((v) => !v)}
                    aria-label={showResetNewPw ? 'Hide new password' : 'Show new password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink cursor-pointer"
                  >
                    {showResetNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-ink">Confirm Password</label>
                <Input
                  type={showResetNewPw ? 'text' : 'password'}
                  value={resetConfirmPw}
                  onChange={(e) => setResetConfirmPw(e.target.value)}
                  placeholder="Confirm password"
                  data-testid="reset-confirm-password-input"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>
                Cancel
              </Button>
              <DynamicButton
                type="submit"
                variant="obsidian"
                loading={resetting}
                data-testid="reset-password-submit-btn"
              >
                Update Password
              </DynamicButton>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
