import * as React from 'react';
import {
  ArrowRight,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { KovaMark } from '@/components/brand/KovaLogo';
import { adminApiFetch, ApiError } from '@/lib/api';
import {
  usePlatformAdminStore,
  type PlatformAdminIdentity,
} from '@/store/platformAdminStore';
import { toast } from 'sonner';

interface PlatformSetupStatus {
  admin_count: number;
  needs_bootstrap: boolean;
}

interface PlatformAuthResponse {
  token: string;
  admin: PlatformAdminIdentity;
}

interface AdminLoginPageProps {
  onNavigatePath: (path: string) => void;
}

export function AdminLoginPage({ onNavigatePath }: AdminLoginPageProps) {
  const { setAdminSession } = usePlatformAdminStore();

  const [checkingSetup, setCheckingSetup] = React.useState(true);
  const [needsBootstrap, setNeedsBootstrap] = React.useState(false);

  // Login form state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cooldownSec, setCooldownSec] = React.useState(0);

  React.useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  // First-run Bootstrap SuperAdmin state (shown only when 0 platform_admins exist)
  const [fullName, setFullName] = React.useState('');
  const [title, setTitle] = React.useState('Root Platform Administrator');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  React.useEffect(() => {
    document.title = 'Kova POS — Master Control Sign In';
  }, []);

  React.useEffect(() => {
    let active = true;
    fetch('/api/v1/platform/setup-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlatformSetupStatus | null) => {
        if (!active || !data) return;
        setNeedsBootstrap(Boolean(data.needs_bootstrap));
      })
      .catch(() => {
        // Fallback to standard login mode if check fails
      })
      .finally(() => {
        if (active) setCheckingSetup(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSec > 0) return;
    if (!email.trim() || !password) {
      toast.error('Platform admin email and password are required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminApiFetch<PlatformAuthResponse>('/api/v1/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });
      setAdminSession(res.token, res.admin);
      toast.success(`Signed in to Platform Control Plane (${res.admin.full_name})`);
      onNavigatePath('/admin');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 429) {
        setCooldownSec(err.retryAfterSeconds || 60);
      }
      const message = err instanceof Error ? err.message : 'Platform authentication failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Valid SuperAdmin email is required');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminApiFetch<PlatformAuthResponse>('/api/v1/platform/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          title: title.trim() || 'Root Platform Administrator',
        }),
      });
      setAdminSession(res.token, res.admin);
      toast.success(`Initialized Root SuperAdmin "${res.admin.full_name}"`);
      onNavigatePath('/admin');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bootstrap setup failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-canvas text-ink flex items-center justify-center p-4 sm:p-6 lg:p-10"
      data-testid="admin-login-page"
    >
      <div className="grid w-full max-w-5xl grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Obsidian Control Plane Card */}
        <section className="flex flex-col justify-between rounded-[var(--theme-radius-card)] bg-sidebar p-7 sm:p-9 text-white border border-border-theme/40 shadow-xl">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <KovaMark className="h-11 w-11 shrink-0" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold tracking-tight">
                    Kova POS Control
                  </p>
                  <p className="truncate text-[11px] text-white/65">
                    Isolated Master Portal
                  </p>
                </div>
              </div>
              <Badge variant="accent">Root Admin Only</Badge>
            </div>

            <h1 className="mt-7 text-[18px] sm:text-[20px] font-bold tracking-tight leading-snug">
              Multi-Database SaaS Provisioning &amp; Governance
            </h1>
            <p className="mt-2.5 text-[12.5px] text-white/70 leading-relaxed max-w-[44ch]">
              Sign in exclusively with Platform SuperAdmin credentials. Manage platform administrators, provision each company into its own PostgreSQL database, and inspect cross-company audit telemetry.
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[var(--theme-radius-inner)] bg-sidebar-pill p-4">
                <div className="flex items-center gap-2 text-xs text-accent">
                  <Database className="h-3.5 w-3.5" />
                  <span>Tenant Topology</span>
                </div>
                <p className="mt-1.5 font-mono text-sm font-bold tracking-tight text-white">
                  DB-Per-Company
                </p>
              </div>
              <div className="rounded-[var(--theme-radius-inner)] bg-sidebar-pill p-4">
                <div className="flex items-center gap-2 text-xs text-accent">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Auth Boundary</span>
                </div>
                <p className="mt-1.5 text-sm font-bold text-[#22C55E]">
                  Strict Scope
                </p>
              </div>
            </div>

            <div className="rounded-[var(--theme-radius-inner)] bg-sidebar-pill/80 p-4 border border-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                1-to-1 Company Login Enforcement
              </p>
              <p className="mt-1.5 text-xs text-white/80 leading-relaxed">
                Platform Admin tokens cannot access tenant POS or GL endpoints, and company staff logins are strictly isolated to their dedicated /c/company/login URL.
              </p>
            </div>
          </div>
        </section>

        {/* Right Platform Admin Authentication Card */}
        <section className="flex flex-col justify-between rounded-[var(--theme-radius-card)] border border-border-theme bg-surface p-7 sm:p-9 shadow-[var(--theme-shadow)]">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-accent">
                <Lock className="h-3.5 w-3.5" />
                <span>Platform Scope JWT</span>
              </div>
              <Badge variant="outline" className="text-[10px]">
                No Company Workspace Access
              </Badge>
            </div>

            {checkingSetup ? (
              <div className="mt-8 space-y-4">
                <div className="h-6 w-48 animate-pulse rounded bg-surface-muted" />
                <div className="h-4 w-72 animate-pulse rounded bg-surface-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-surface-muted" />
              </div>
            ) : needsBootstrap ? (
              <>
                <h2 className="mt-4 text-[17px] font-bold text-ink flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-accent" />
                  Create First Platform SuperAdmin
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  No Platform Admin account exists in master storage yet. Register the root administrator to unlock company database provisioning.
                </p>

                <form
                  onSubmit={handleBootstrapSubmit}
                  className="mt-6 space-y-4"
                  data-testid="admin-bootstrap-form"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="bootstrap-name" className="block text-xs font-bold text-ink">
                        Full Name
                      </label>
                      <Input
                        id="bootstrap-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Platform Root Admin"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bootstrap-title" className="block text-xs font-bold text-ink">
                        Title
                      </label>
                      <Input
                        id="bootstrap-title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Root Platform Administrator"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="bootstrap-email" className="block text-xs font-bold text-ink">
                      SuperAdmin Email
                    </label>
                    <Input
                      id="bootstrap-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@zonaplatform.com"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label htmlFor="bootstrap-pw" className="block text-xs font-bold text-ink">
                        Password (min 8 chars)
                      </label>
                      <Input
                        id="bootstrap-pw"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="bootstrap-pw-confirm" className="block text-xs font-bold text-ink">
                        Confirm Password
                      </label>
                      <Input
                        id="bootstrap-pw-confirm"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </div>
                  </div>

                  <DynamicButton
                    type="submit"
                    variant="obsidian"
                    loading={submitting}
                    icon={<ArrowRight className="h-4 w-4" />}
                    className="w-full"
                    data-testid="admin-bootstrap-submit"
                  >
                    Initialize Platform Control Plane
                  </DynamicButton>
                </form>
              </>
            ) : (
              <>
                <h2 className="mt-4 text-[17px] font-bold text-ink">
                  Platform SuperAdmin Sign In
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Separate master login for company database provisioning, platform administrators, and audit trails. Company staff accounts cannot sign in here.
                </p>

                <form
                  onSubmit={handleLoginSubmit}
                  className="mt-6 space-y-5"
                  data-testid="admin-login-form"
                >
                  <div className="space-y-1.5">
                    <label htmlFor="admin-login-email" className="block text-xs font-bold text-ink">
                      Platform Admin Email
                    </label>
                    <Input
                      id="admin-login-email"
                      type="email"
                      autoComplete="username"
                      placeholder="admin@zonaplatform.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="admin-login-email"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="admin-login-password" className="block text-xs font-bold text-ink">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="admin-login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pr-10"
                        data-testid="admin-login-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-[var(--theme-radius-control)] text-ink-muted hover:text-ink hover:bg-surface-muted transition cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {cooldownSec > 0 && (
                    <div className="flex items-center gap-2 rounded-[var(--theme-radius-inner)] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[11.5px] font-semibold text-[#EF4444]">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      <span className="tabular-nums">
                        Too many login attempts — retry in {cooldownSec}s
                      </span>
                    </div>
                  )}

                  <div className="pt-1">
                    <DynamicButton
                      type="submit"
                      variant="obsidian"
                      loading={submitting}
                      disabled={cooldownSec > 0}
                      icon={<ArrowRight className="h-4 w-4" />}
                      className="w-full"
                      data-testid="admin-login-submit"
                    >
                      {cooldownSec > 0 ? `Retry in ${cooldownSec}s` : 'Enter Platform Control Plane'}
                    </DynamicButton>
                  </div>
                </form>
              </>
            )}
          </div>

          <div className="mt-8 rounded-[var(--theme-radius-inner)] bg-surface-muted p-4 text-xs text-ink-muted flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-accent" />
              Company staff member?
            </span>
            <button
              type="button"
              onClick={() => onNavigatePath('/login')}
              data-testid="admin-to-company-directory-link"
              className="font-bold text-ink hover:text-accent hover:underline cursor-pointer"
            >
              Open 1-to-1 Company Portal Directory →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

