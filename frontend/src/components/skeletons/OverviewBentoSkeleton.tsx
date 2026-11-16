import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Layout Skeleton matching OverviewPage across Mobile / Tablet / Desktop (CLS = 0).
 */
export function OverviewBentoSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 items-stretch">
      {/* Left 8-Column Skeleton */}
      <div className="flex flex-col gap-5 xl:col-span-8">
        <div className="zona-card p-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-9 w-28 rounded-[var(--theme-radius-control)]" />
          </div>
          <Skeleton className="mt-5 h-[230px] w-full rounded-[var(--theme-radius-inner)]" />
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 items-stretch">
          <div className="zona-card p-6">
            <Skeleton className="h-5 w-44" />
            <div className="mt-5 flex items-center gap-4">
              <Skeleton className="h-[160px] w-[160px] rounded-full shrink-0" />
              <div className="flex-1 space-y-2.5">
                <Skeleton className="h-10 w-full rounded-[var(--theme-radius-inner)]" />
                <Skeleton className="h-10 w-full rounded-[var(--theme-radius-inner)]" />
                <Skeleton className="h-10 w-full rounded-[var(--theme-radius-inner)]" />
              </div>
            </div>
          </div>

          <div className="zona-card p-6">
            <Skeleton className="h-5 w-36" />
            <div className="mt-4 space-y-2.5">
              <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
              <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
              <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
            </div>
          </div>
        </div>

        <div className="zona-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-9 w-56 rounded-[var(--theme-radius-control)]" />
          </div>
          <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
          <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
          <Skeleton className="h-14 w-full rounded-[var(--theme-radius-inner)]" />
        </div>
      </div>

      {/* Right 4-Column KPI Stack Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:col-span-4 xl:flex xl:flex-col xl:gap-4">
        <Skeleton className="h-[157px] w-full rounded-[var(--theme-radius-card)]" />
        <Skeleton className="h-[194px] w-full rounded-[var(--theme-radius-card)]" />
        <Skeleton className="h-[179px] w-full rounded-[var(--theme-radius-card)]" />
        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
          <Skeleton className="h-[98px] w-full rounded-[var(--theme-radius-card)]" />
          <Skeleton className="h-[98px] w-full rounded-[var(--theme-radius-card)]" />
        </div>
        <Skeleton className="h-[136px] w-full rounded-[var(--theme-radius-card)]" />
        <div className="grid grid-cols-2 gap-4 md:col-span-2 xl:col-span-1">
          <Skeleton className="h-[98px] w-full rounded-[var(--theme-radius-card)]" />
          <Skeleton className="h-[98px] w-full rounded-[var(--theme-radius-card)]" />
        </div>
        <Skeleton className="h-[148px] w-full rounded-[var(--theme-radius-card)]" />
        <Skeleton className="h-[48px] w-full rounded-[var(--theme-radius-control)] md:col-span-3 xl:col-span-1" />
      </div>
    </div>
  );
}
