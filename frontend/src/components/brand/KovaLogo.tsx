import { cn } from '@/lib/utils';

export interface KovaMarkProps {
  className?: string;
  variant?: 'app-dark' | 'app-light' | 'symbol';
}

const MARK_SRC_BY_VARIANT: Record<NonNullable<KovaMarkProps['variant']>, string> = {
  'app-dark': '/brand/app-icons/03-dark-mode-app-icon-1024x1024.png',
  'app-light': '/brand/app-icons/04-light-mode-app-icon-1024x1024.png',
  symbol: '/brand/logos/02-kova-symbol-standalone.png',
};

/**
 * Official KOVA POS emblem sourced from the brand asset collection.
 */
export function KovaMark({ className, variant = 'app-dark' }: KovaMarkProps) {
  const src = MARK_SRC_BY_VARIANT[variant] || MARK_SRC_BY_VARIANT['app-dark'];
  return (
    <img
      src={src}
      alt="KOVA POS"
      draggable={false}
      className={cn(
        'h-11 w-11 shrink-0 select-none object-contain',
        variant !== 'symbol' && 'rounded-[13px] shadow-sm',
        className
      )}
    />
  );
}

export interface KovaLogoProps {
  className?: string;
  markClassName?: string;
  layout?: 'horizontal' | 'stacked';
  subtitle?: string;
}

/**
 * Complete Kova POS official emblem + typography lockup.
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
            <span className="rounded-md bg-gradient-to-r from-[#7C3AED] to-[#2563EB] px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-widest uppercase text-white shadow-xs">
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
      <KovaMark className={cn('mb-3.5 h-14 w-14 rounded-[16px]', markClassName)} />
      <div className="inline-flex items-center gap-2">
        <h1
          data-testid="login-brand-name"
          className="text-[23px] font-extrabold tracking-tight text-ink"
        >
          Kova
        </h1>
        <span className="rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#2563EB] px-2 py-0.5 text-[12px] font-extrabold tracking-widest uppercase text-white shadow-xs">
          POS
        </span>
      </div>
      {subtitle && (
        <p className="mt-1.5 text-[13px] text-ink-muted">{subtitle}</p>
      )}
    </div>
  );
}
