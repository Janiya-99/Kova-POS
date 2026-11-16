import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[var(--theme-radius-badge)] px-2 py-0.5 text-[10.5px] font-semibold leading-tight tabular-nums transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-contrast text-contrast-fg',
        lavender: 'bg-accent-soft text-accent-soft-fg',
        accent: 'bg-accent text-accent-fg',
        positive: 'bg-[#22C55E]/15 text-[#22C55E]',
        negative: 'bg-[#EF4444]/15 text-[#EF4444]',
        outline: 'border border-border-theme bg-surface text-ink',
      },
    },
    defaultVariants: {
      variant: 'lavender',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
