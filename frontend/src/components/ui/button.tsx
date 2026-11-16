import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--theme-radius-control)] text-[12px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer min-h-[38px] px-3.5',
  {
    variants: {
      variant: {
        default: 'bg-contrast text-contrast-fg hover:opacity-90 shadow-sm',
        lavender: 'bg-accent text-accent-fg hover:opacity-90 shadow-sm',
        soft: 'border border-accent/20 bg-accent-soft text-accent-soft-fg hover:opacity-90',
        outline: 'border border-border-theme bg-surface text-ink hover:bg-surface-muted',
        ghost: 'text-ink hover:bg-accent-soft/45',
        info: 'border border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-600 hover:text-white hover:border-sky-600',
        success: 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600 hover:text-white hover:border-emerald-600',
        warning: 'border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white hover:border-amber-500',
        destructive: 'border border-[#EF4444]/25 bg-[#EF4444]/10 text-[#EF4444] hover:bg-[#EF4444] hover:text-white hover:border-[#EF4444]',
      },
      size: {
        default: 'min-h-[38px] px-3.5 py-1.5',
        sm: 'min-h-[32px] px-2.5 text-[11px]',
        xs: 'h-7 min-h-[28px] px-2.5 text-[11px]',
        lg: 'min-h-[42px] px-5 text-[12.5px]',
        icon: 'h-9 w-9 p-0',
        'icon-xs': 'h-7 w-7 min-h-0 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
