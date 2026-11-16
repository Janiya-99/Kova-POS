import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, onPointerDownOutside, onInteractOutside, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#111315]/25 backdrop-blur-[2px]" />
    <DialogPrimitive.Content
      ref={ref}
      onPointerDownOutside={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('.swal2-container, .zona-swal-backdrop')) {
          e.preventDefault();
        }
        onPointerDownOutside?.(e);
      }}
      onInteractOutside={(e) => {
        const target = e.target as HTMLElement | null;
        if (target?.closest('.swal2-container, .zona-swal-backdrop')) {
          e.preventDefault();
        }
        onInteractOutside?.(e);
      }}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--theme-radius-card)] border border-border-theme bg-surface text-ink p-5 shadow-2xl outline-none',
        className
      )}
      {...props}
    >
      <DialogPrimitive.Close className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-[var(--theme-radius-control)] bg-surface-muted text-ink hover:bg-accent-soft/60 transition cursor-pointer">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 pr-8', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <DialogPrimitive.Title className={cn('text-[15px] font-bold text-ink', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <DialogPrimitive.Description className={cn('text-xs text-ink-muted', className)} {...props} />;
}
