import * as React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Send,
  ShieldCheck,
  Store,
  Sun,
  Zap,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { KovaAuthSplitLayout } from '@/components/brand/KovaAuthSplitLayout';
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
  const { colorMode, toggleColorMode } = useThemeStore();
  const { language, setLanguage, t } = useT();

  // Workspace companies catalog & automatic email-matched company state
  const [discoveredMatches, setDiscoveredMatches] = React.useState<DirectoryCompanyItem[]>([]);
  const [selectedSlug, setSelectedSlug] = React.useState<string>(cleanSlug || '');

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
  const [resetMode, setResetMode] = React.useState<
    'email_code' | 'current_password' | 'supervisor_pin'
  >('email_code');
  const [resetEmail, setResetEmail] = React.useState('');
  const [resetEmailCode, setResetEmailCode] = React.useState('');
  const [resetToken, setResetToken] = React.useState('');
  const [resetEmailSent, setResetEmailSent] = React.useState(false);
  const [sendingResetEmail, setSendingResetEmail] = React.useState(false);
  const [resetEmailCooldown, setResetEmailCooldown] = React.useState(0);
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

  React.useEffect(() => {
    if (resetEmailCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResetEmailCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetEmailCooldown]);

  // Auto-open reset password modal if opened from a direct email reset link (?reset_token=...&email=...)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const linkToken = params.get('reset_token')?.trim() || '';
    const linkEmail = params.get('email')?.trim() || '';
    if (linkToken) {
      setResetMode('email_code');
      setResetToken(linkToken);
      if (linkEmail) {
        setResetEmail(linkEmail);
        setEmail(linkEmail);
      }
      setResetEmailSent(true);
      setResetOpen(true);
    }
  }, []);

  // Keep selectedSlug synced when URL explicitly changes (/c/:slug/login)
  React.useEffect(() => {
    setSelectedSlug(cleanSlug || '');
    if (cleanSlug) {
      setDiscoveredMatches([]);
    }
  }, [cleanSlug]);

  // Automatically resolve the staff member's company from their entered email on general /login
  React.useEffect(() => {
    if (cleanSlug) return;
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || cleanEmail.split('@')[1]?.length < 2) {
      setDiscoveredMatches([]);
      setSelectedSlug('');
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      fetch(`/api/v1/auth/discover?email=${encodeURIComponent(cleanEmail)}`)
        .then((res) => (res.ok ? res.json() : { matched: false }))
        .then((data: { matched?: boolean; companies?: DirectoryCompanyItem[]; company?: DirectoryCompanyItem }) => {
          if (!active) return;
          if (!data.matched) {
            setDiscoveredMatches([]);
            setSelectedSlug('');
            return;
          }
          const matches = data.companies && data.companies.length > 0 ? data.companies : data.company ? [data.company] : [];
          setDiscoveredMatches(matches);
          if (matches.length === 1) {
            setSelectedSlug(normalizeCompanySlug(matches[0].slug));
          } else if (matches.length > 1) {
            setSelectedSlug((prev) =>
              prev && matches.some((m) => normalizeCompanySlug(m.slug) === prev)
                ? prev
                : normalizeCompanySlug(matches[0].slug)
            );
          }
        })
        .catch(() => {
          if (active) {
            setDiscoveredMatches([]);
            setSelectedSlug('');
          }
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [cleanSlug, email]);

  const targetSlug = cleanSlug || selectedSlug;
  const submitSlug = cleanSlug || (discoveredMatches.length > 1 ? selectedSlug : '');

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
          ...(submitSlug ? { company_slug: submitSlug } : {}),
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

  const clearResetQueryParams = () => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('reset_token') || url.searchParams.has('email')) {
      url.searchParams.delete('reset_token');
      url.searchParams.delete('email');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  };

  const openResetModal = () => {
    setResetMode('email_code');
    setResetEmail(email.trim());
    setResetEmailCode('');
    setResetToken('');
    setResetEmailSent(false);
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

  const handleSendResetEmail = async () => {
    if (resetEmailCooldown > 0) return;
    const cleanEmail = resetEmail.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Please enter your staff account email first');
      return;
    }
    setSendingResetEmail(true);
    try {
      const res = await apiFetch<{ message?: string }>('/api/v1/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: cleanEmail,
          ...(submitSlug ? { company_slug: submitSlug } : {}),
        }),
      });
      setResetEmailSent(true);
      setResetToken('');
      setResetEmailCooldown(30);
      toast.success(res.message || 'Verification code and reset link sent to your email.');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 429) {
        setResetEmailCooldown(err.retryAfterSeconds || 60);
      }
      toast.error(err.message || 'Failed to send reset verification email');
    } finally {
      setSendingResetEmail(false);
    }
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
    if (resetMode === 'email_code') {
      if (!resetToken && resetEmailCode.trim().length !== 6) {
        toast.error('Enter the 6-digit verification code from your email');
        return;
      }
    } else if (resetMode === 'supervisor_pin') {
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
          ...(submitSlug ? { company_slug: submitSlug } : {}),
          mode: resetMode,
          email: resetEmail.trim(),
          email_code: resetEmailCode.trim(),
          reset_token: resetToken.trim(),
          current_password: resetCurrentPw,
          supervisor_email: resetSupervisorEmail.trim(),
          supervisor_pin: resetSupervisorPin,
          new_password: resetNewPw,
        }),
      });
      toast.success('Password updated successfully. Sign in with your new password.');
      setEmail(resetEmail.trim());
      setPassword('');
      clearResetQueryParams();
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

  const showWorkspaceSelect = !cleanSlug && discoveredMatches.length > 1;
  const activeMatchedCompany =
    !cleanSlug && discoveredMatches.length === 1 ? discoveredMatches[0] : null;

  const brandDisplayName =
    (cleanSlug
      ? publicBranding?.trade_name || publicBranding?.name
      : activeMatchedCompany?.trade_name || activeMatchedCompany?.name) || 'Kova POS';

  return (
    <>
      <KovaAuthSplitLayout
        colorMode={colorMode}
        testId="company-login-page"
        brandTitle={brandDisplayName}
        brandSubtitle={
          cleanSlug
            ? `/c/${cleanSlug}`
            : activeMatchedCompany
              ? `/c/${normalizeCompanySlug(activeMatchedCompany.slug)}`
              : 'All-Terrain POS & ERP'
        }
        showcaseBadge="Counter Ready"
        showcaseHeadline="Effortless at the counter. Powerful behind the scenes."
        showcaseDescription="Lightning-fast checkout, offline edge resilience, multi-branch stock intelligence, and real-time double-entry accounting across cafes, retail, and hardware stores."
        showcaseMetrics={[
          {
            icon: <Zap className="h-3.5 w-3.5" />,
            label: 'Edge Engine',
            value: 'Offline-First Sync',
            tone: 'default',
          },
          {
            icon: <ShieldCheck className="h-3.5 w-3.5" />,
            label: 'Security Scope',
            value: 'Isolated Tenant DB',
            tone: 'positive',
          },
        ]}
        showcaseFootnoteTitle="UNIFIED TERMINAL & ERP WORKSPACE"
        showcaseFootnoteText="Role-scoped JWT sessions, supervisor PIN overrides, FIFO batch costing, and real-time thermal hardware integration."
        topControls={
          <>
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
              {colorMode === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>
          </>
        }
        formHeaderEyebrow={
          <>
            <Store className="h-3.5 w-3.5" />
            <span>
              {cleanSlug || activeMatchedCompany
                ? `Portal · ${brandDisplayName}`
                : 'Staff Terminal Access'}
            </span>
          </>
        }
        formHeaderBadge="Encrypted Session"
        formTitle={t.login.signInTitle}
        formDescription="Enter your staff credentials to access your branch terminal, registers, and live operations."
        formFooter={
          <div className="rounded-[14px] border border-border-theme/70 bg-surface-muted/45 px-4 py-3 text-[11.5px] text-ink-muted flex items-center justify-between gap-2">
            <span>Protected by encrypted session &amp; rate-limit guard</span>
            <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
          </div>
        }
      >
        {token && context?.company_slug && (
          <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-[#22C55E]/30 bg-[#22C55E]/10 px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-ink truncate">
                Active session: {context.full_name}
              </p>
              <p className="truncate text-[10.5px] text-ink-muted">{context.email}</p>
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
              <label className="block text-xs font-semibold text-ink">Workspace</label>
              <Select value={targetSlug} onValueChange={setSelectedSlug}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {discoveredMatches.map((comp) => (
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
              <span className="tabular-nums">Too many attempts — retry in {cooldownSec}s</span>
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
      </KovaAuthSplitLayout>

      {/* Password Reset Verification Dialog */}
      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          setResetOpen(open);
          if (!open) clearResetQueryParams();
        }}
      >
        <DialogContent className="sm:max-w-[490px]" data-testid="reset-password-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-accent" />
              Reset Account Password
            </DialogTitle>
            <DialogDescription>
              Receive a verification code by email, verify your current password, or use an active manager&apos;s 6-digit supervisor PIN.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleResetPassword} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-3 gap-1.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-1">
              <button
                type="button"
                onClick={() => setResetMode('email_code')}
                data-testid="reset-mode-email-btn"
                className={`rounded-[var(--theme-radius-control)] py-1.5 text-[11px] font-bold transition cursor-pointer ${
                  resetMode === 'email_code'
                    ? 'bg-accent text-accent-fg shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                Email Code
              </button>
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
                Manager PIN
              </button>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Account Email</label>
              <div className={resetMode === 'email_code' && !resetToken ? 'flex gap-2' : ''}>
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="staff@company.com"
                  data-testid="reset-email-input"
                  required
                />
                {resetMode === 'email_code' && !resetToken && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendResetEmail}
                    disabled={sendingResetEmail || resetEmailCooldown > 0}
                    data-testid="reset-send-email-btn"
                    className="shrink-0 gap-1.5 px-3 text-[11.5px] font-semibold"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingResetEmail
                      ? 'Sending...'
                      : resetEmailCooldown > 0
                        ? `Resend (${resetEmailCooldown}s)`
                        : resetEmailSent
                          ? 'Resend Code'
                          : 'Send Code'}
                  </Button>
                )}
              </div>
            </div>

            {resetMode === 'email_code' ? (
              <div className="space-y-2.5">
                {resetToken ? (
                  <div className="flex items-center justify-between gap-2 rounded-[var(--theme-radius-inner)] border border-[#10B981]/30 bg-[#10B981]/10 px-3 py-2 text-[11.5px] text-ink">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="h-4 w-4 text-[#10B981]" />
                      Verified via direct email reset link
                    </span>
                    <button
                      type="button"
                      onClick={() => setResetToken('')}
                      className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                    >
                      Use 6-digit code
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-ink">
                        6-Digit Email Verification Code
                      </label>
                      {resetEmailSent && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#10B981]">
                          <CheckCircle2 className="h-3 w-3" />
                          Code sent (15m TTL)
                        </span>
                      )}
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={resetEmailCode}
                      onChange={(e) =>
                        setResetEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Enter 6-digit code"
                      className="font-mono text-center text-[15px] font-bold tracking-[0.3em] placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal tabular-nums"
                      data-testid="reset-email-code-input"
                      required
                    />
                  </div>
                )}
              </div>
            ) : resetMode === 'current_password' ? (
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
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  clearResetQueryParams();
                  setResetOpen(false);
                }}
              >
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
    </>
  );
}
