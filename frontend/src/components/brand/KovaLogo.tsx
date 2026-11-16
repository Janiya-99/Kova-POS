import * as React from 'react';
import { cn } from '@/lib/utils';

export interface KovaMarkProps {
  className?: string;
}

/**
 * Clean geometric "K" emblem mark for Kova POS.
 */
export function KovaMark({ className }: KovaMarkProps) {
  const gradBgId = React.useId();
  const gradAccentId = React.useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('h-11 w-11 shrink-0 drop-shadow-sm', className)}
    >
      <defs>
        <linearGradient id={gradBgId} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1F242D" />
          <stop offset="100%" stopColor="#0F1116" />
        </linearGradient>
        <linearGradient id={gradAccentId} x1="28" y1="30" x2="46" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill={`url(#${gradBgId})`} />
      <rect
        x="2.75"
        y="2.75"
        width="58.5"
        height="58.5"
        rx="17.25"
        stroke="#FFFFFF"
        strokeOpacity="0.14"
        strokeWidth="1.5"
      />
      {/* Left architectural pillar */}
      <rect x="19" y="17" width="6.5" height="30" rx="3.25" fill="#FFFFFF" />
      {/* Upper diagonal arm */}
      <path
        d="M30 31.25L44 19"
        stroke="#FFFFFF"
        strokeWidth="6.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lower diagonal leg in emerald accent */}
      <path
        d="M30 32.75L44.25 45.25"
        stroke={`url(#${gradAccentId})`}
        strokeWidth="6.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface KovaLogoProps {
  className?: string;
  markClassName?: string;
  layout?: 'horizontal' | 'stacked';
  subtitle?: string;
}

/**
 * Complete Kova POS modern emblem + typography lockup ("K" mark + "Kova POS").
 */
export function KovaLogo({
  className,
  markClassName,
  layout = 'stacked',
  subtitle,
}: KovaLogoProps) {
  if (layout === 'horizontal') {
    return (
      <div className={cn('inline-flex items-center gap-3', className)}>
        <KovaMark className={cn('h-10 w-10', markClassName)} />
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-[19px] font-extrabold tracking-tight text-ink">
              Kova
            </span>
            <span className="rounded-md bg-sidebar px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-widest uppercase text-white">
              POS
            </span>
          </div>
          {subtitle && (
            <p className="mt-0.5 text-[11.5px] text-ink-muted">{subtitle}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <KovaMark className={cn('mb-3.5 h-13 w-13', markClassName)} />
      <div className="inline-flex items-center gap-2">
        <h1
          data-testid="login-brand-name"
          className="text-[23px] font-extrabold tracking-tight text-ink"
        >
          Kova
        </h1>
        <span className="rounded-lg bg-sidebar px-2 py-0.5 text-[12px] font-extrabold tracking-widest uppercase text-white shadow-xs">
          POS
        </span>
      </div>
      {subtitle && (
        <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>
      )}
    </div>
  );
}

