import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Zero-CLS skeleton representing the #F5F6FA center paper stage.
 */
export function PrintCanvasSkeleton() {
  return (
    <div
      data-testid="print-canvas-skeleton"
      className="flex-1 min-w-0 min-h-[680px] rounded-[var(--theme-radius-card)] bg-[#F5F6FA] border border-slate-200/80 p-5 flex flex-col items-center justify-between"
    >
      <div className="w-full flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-72 rounded-[var(--theme-radius-control)]" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-[var(--theme-radius-control)]" />
          <Skeleton className="h-8 w-24 rounded-[var(--theme-radius-control)]" />
        </div>
      </div>

      <div className="w-[460px] max-w-full h-[540px] rounded-xl bg-white shadow-sm border border-slate-200/70 p-6 flex flex-col justify-between my-4">
        <div className="flex items-start justify-between">
          <Skeleton className="h-12 w-32 rounded-lg" />
          <Skeleton className="h-14 w-36 rounded-lg" />
        </div>
        <div className="space-y-2.5 my-4">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
        <div className="flex items-end justify-between">
          <Skeleton className="h-20 w-20 rounded-lg" />
          <Skeleton className="h-12 w-40 rounded-lg" />
        </div>
      </div>

      <Skeleton className="h-5 w-64 rounded-full" />
    </div>
  );
}

/**
 * 1:1 Zero-CLS full 3-column Print Studio Designer skeleton.
 */
export function PrintDesignerSkeleton() {
  return (
    <div data-testid="print-designer-skeleton" className="space-y-4">
      <div className="zona-card p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-64 rounded-[var(--theme-radius-control)]" />
          <Skeleton className="h-9 w-28 rounded-[var(--theme-radius-control)]" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-28 rounded-[var(--theme-radius-control)]" />
          <Skeleton className="h-10 w-36 rounded-[var(--theme-radius-control)]" />
        </div>
      </div>

      <div className="flex flex-col xl:flex-row items-stretch gap-4 min-h-[700px]">
        {/* Left White Toolbox Skeleton */}
        <div className="w-full xl:w-[270px] shrink-0 rounded-[var(--theme-radius-card)] bg-white border border-slate-200/80 p-4 space-y-4">
          <Skeleton className="h-5 w-36 rounded-md" />
          <div className="grid grid-cols-2 xl:grid-cols-1 gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>

        {/* Center Paper Skeleton */}
        <PrintCanvasSkeleton />

        {/* Right #222026 Obsidian Panel Skeleton */}
        <div className="w-full xl:w-[320px] shrink-0 rounded-[var(--theme-radius-card)] bg-[#222026] border border-white/10 p-4 space-y-4">
          <Skeleton className="h-10 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-24 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-32 w-full rounded-xl bg-white/10" />
          <Skeleton className="h-11 w-full rounded-xl bg-[#877FC1]/30" />
        </div>
      </div>
    </div>
  );
}

