import * as React from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CheckboxProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * Accessible shadcn-styled Checkbox primitive supporting checked and indeterminate states.
 */
export const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      className,
      checked = false,
      indeterminate = false,
      disabled = false,
      onCheckedChange,
      onClick,
      ...props
    },
    ref,
  ) => {
    const state = indeterminate ? 'indeterminate' : checked ? 'checked' : 'unchecked';

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        data-state={state}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e);
          if (!disabled) {
            onCheckedChange?.(!checked);
          }
        }}
        className={cn(
          'peer inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50',
          state === 'unchecked'
            ? 'border-border-theme bg-surface text-transparent hover:border-accent/70'
            : 'border-accent bg-accent text-accent-fg shadow-2xs',
          className,
        )}
        {...props}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3 stroke-[3]" />
        ) : checked ? (
          <Check className="h-3 w-3 stroke-[3]" />
        ) : null}
      </button>
    );
  },
);
Checkbox.displayName = 'Checkbox';
