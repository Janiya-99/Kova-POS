import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Layout Skeleton matching InventoryPage (CLS = 0).
 */
export function InventorySkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] w-full rounded-[var(--theme-radius-card)]" />
        ))}
      </div>

      <div className="zona-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-9 w-64 rounded-[var(--theme-radius-control)]" />
          <Skeleton className="h-9 w-44 rounded-[var(--theme-radius-control)]" />
        </div>
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
      </div>
    </div>
  );
}
