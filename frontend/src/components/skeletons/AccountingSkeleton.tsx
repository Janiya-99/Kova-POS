import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Layout Skeleton matching GeneralLedgerPage (CLS = 0).
 */
export function AccountingSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] w-full rounded-[var(--theme-radius-card)]" />
        ))}
      </div>

      <div className="zona-card p-6 space-y-4">
        <Skeleton className="h-9 w-80 rounded-[var(--theme-radius-control)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
      </div>
    </div>
  );
}
