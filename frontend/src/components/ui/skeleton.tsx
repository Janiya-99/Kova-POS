import { cn } from '@/lib/utils';

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-[var(--theme-radius-inner)] bg-accent-soft/40', className)}
      {...props}
    />
  );
}
