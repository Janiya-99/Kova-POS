import * as React from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { KovaLogo } from '@/components/brand/KovaLogo';
import { KovaAuthBackdrop } from '@/components/brand/KovaAuthBackdrop';
import { adminApiFetch, ApiError } from '@/lib/api';
import { useThemeStore } from '@/store/themeStore';
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
  const { colorMode, toggleColorMode } = useThemeStore();

  const [checkingSetup, setCheckingSetup] = React.useState(true);
  const [needsBootstrap, setNeedsBootstrap] = React.useState(false);

  // Login form state
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [cooldownSec, setCooldownSec] = React.useState(0);

  // First-run Bootstrap SuperAdmin state (shown only when 0 platform_admins exist)
  const [fullName, setFullName] = React.useState('');
  const [title, setTitle] = React.useState('Root Platform Administrator');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  React.useEffect(() => {
    document.title = 'Kova POS — Master Control Sign In';
  }, []);

  React.useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  React.useEffect(() => {
    let active = true;
    fetch('/api/v1/platform/setup-status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PlatformSetupStatus | null) => {
        if (!active || !data) return;
        setNeedsBootstrap(Boolean(data.needs_bootstrap));
      })
      .catch(() => {
        // Fallback cleanly to standard sign-in form
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
      toast.success(`Signed in to Master Control Plane (${res.admin.full_name})`);
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
      className="relative min-h-screen w-full bg-canvas text-ink flex flex-col justify-between p-4 sm:p-6 overflow-x-hidden"
      data-testid="admin-login-page"
    >
      {/* Unique KOVA Architectural Backdrop */}
      <KovaAuthBackdrop colorMode={colorMode} />

      {/* Minimal Top Utility Bar (matches /login aesthetic) */}
      <header className="relative z-10 mx-auto flex w-full max-w-[1040px] items-center justify-end pt-1">
        <button
          type="button"
          onClick={toggleColorMode}
          aria-label={colorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          data-testid="admin-login-theme-toggle"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-theme/70 bg-surface/90 text-ink-muted hover:text-ink shadow-xs transition cursor-pointer"
        >
          {colorMode === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </header>

      {/* Centered Clean SuperAdmin Auth Surface */}
      <main className="relative z-10 mx-auto w-full max-w-[420px] my-auto py-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <KovaLogo
            layout="stacked"
            subtitle={
              needsBootstrap
                ? 'Initialize your root platform administrator account'
                : 'Master Control Plane · SuperAdmin Sign In'
            }
          />
        </div>

        <section className="rounded-[24px] border border-border-theme/85 bg-surface/92 backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_-14px_rgba(15,23,42,0.12)] space-y-5">
          {checkingSetup ? (
            <div className="space-y-4 py-2">
              <div className="h-4 w-28 animate-pulse rounded bg-surface-muted" />
              <div className="h-11 w-full animate-pulse rounded-[var(--theme-radius-control)] bg-surface-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-surface-muted" />
              <div className="h-11 w-full animate-pulse rounded-[var(--theme-radius-control)] bg-surface-muted" />
              <div className="h-11 w-full animate-pulse rounded-[var(--theme-radius-control)] bg-surface-muted" />
            </div>
          ) : needsBootstrap ? (
            <form
              onSubmit={handleBootstrapSubmit}
              className="space-y-4"
              data-testid="admin-bootstrap-form"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-ink pb-0.5">
                <KeyRound className="h-3.5 w-3.5 text-accent" />
                <span>Create First Root SuperAdmin</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="bootstrap-name" className="block text-xs font-semibold text-ink">
                    Full Name
                  </label>
                  <Input
                    id="bootstrap-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Root Admin"
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="bootstrap-title" className="block text-xs font-semibold text-ink">
                    Title
                  </label>
                  <Input
                    id="bootstrap-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Platform SuperAdmin"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="bootstrap-email" className="block text-xs font-semibold text-ink">
                  SuperAdmin Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="bootstrap-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@company.com"
                    className="h-11 pl-10"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="bootstrap-pw" className="block text-xs font-semibold text-ink">
                    Password
                  </label>
                  <Input
                    id="bootstrap-pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    className="h-11"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="bootstrap-pw-confirm" className="block text-xs font-semibold text-ink">
                    Confirm
                  </label>
                  <Input
                    id="bootstrap-pw-confirm"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="h-11"
                    required
                  />
                </div>
              </div>

              <div className="pt-1">
                <DynamicButton
                  type="submit"
                  variant="obsidian"
                  loading={submitting}
                  className="w-full h-11 text-[13px]"
                  data-testid="admin-bootstrap-submit"
                >
                  <span className="inline-flex items-center gap-2">
                    <span>Initialize Control Plane</span>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </DynamicButton>
              </div>
            </form>
          ) : (
            <form
              onSubmit={handleLoginSubmit}
              className="space-y-4"
              data-testid="admin-login-form"
            >
              <div className="space-y-1.5">
                <label htmlFor="admin-login-email" className="block text-xs font-semibold text-ink">
                  Admin Email Address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="admin-login-email"
                    type="email"
                    autoComplete="username"
                    placeholder="admin@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 pl-10"
                    data-testid="admin-login-email"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-login-password" className="block text-xs font-semibold text-ink">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <Input
                    id="admin-login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pl-10 pr-10"
                    data-testid="admin-login-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface-muted transition cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {cooldownSec > 0 && (
                <div className="flex items-center gap-2 rounded-[var(--theme-radius-inner)] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[11.5px] font-semibold text-[#EF4444]">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span className="tabular-nums">
                    Too many attempts — retry in {cooldownSec}s
                  </span>
                </div>
              )}

              <div className="pt-1.5">
                <DynamicButton
                  type="submit"
                  variant="obsidian"
                  loading={submitting}
                  disabled={cooldownSec > 0}
                  className="w-full h-11 text-[13px]"
                  data-testid="admin-login-submit"
                >
                  {cooldownSec > 0 ? (
                    `Retry in ${cooldownSec}s`
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <span>Sign In to Control Plane</span>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  )}
                </DynamicButton>
              </div>
            </form>
          )}
        </section>

        <p className="mt-5 text-center text-[11.5px] text-ink-muted">
          Isolated Master Portal · Encrypted Session Guard
        </p>
      </main>

      <footer className="relative z-10 pb-1 text-center text-[11px] text-ink-muted/75">
        Kova POS · Master Control Plane
      </footer>
    </div>
  );
}
