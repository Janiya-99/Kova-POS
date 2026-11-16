import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Fullscreen Layout Skeleton matching the 4-Pane Terminal + Fixed Obsidian Footer (CLS = 0).
 */
export function POSGridSkeleton() {
  return (
    <div
      data-testid="pos-terminal-skeleton"
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#F5F6FA]"
    >
      {/* Mobile / Tablet Top Segmented Pane Switcher Skeleton */}
      <div className="xl:hidden shrink-0 border-b border-border-theme/70 bg-surface px-3 py-2 flex items-center gap-2">
        <Skeleton className="h-8 flex-1 rounded-full" />
        <Skeleton className="h-8 flex-1 rounded-full" />
        <Skeleton className="h-8 flex-1 rounded-full" />
        <Skeleton className="h-8 flex-1 rounded-full" />
      </div>

      {/* Main 12-Col 2-5-2-3 Bento Workspace */}
      <div className="flex-1 min-h-0 p-3 grid grid-cols-1 gap-3 xl:grid-cols-12 items-stretch">
        {/* Pane 1: Categories (2 cols) */}
        <div className="hidden xl:flex xl:col-span-2 flex-col gap-2.5 rounded-[20px] border border-border-theme/60 bg-surface p-3">
          <Skeleton className="h-5 w-24" />
          <div className="flex-1 space-y-2 overflow-hidden">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-[14px]" />
            ))}
          </div>
        </div>

        {/* Pane 2: Products Grid (5 cols) */}
        <div className="xl:col-span-5 flex flex-col min-h-0 gap-3 rounded-[20px] border border-border-theme/60 bg-surface p-3">
          <div className="shrink-0 flex items-center gap-2.5">
            <Skeleton className="h-10 flex-1 rounded-[14px]" />
            <Skeleton className="h-10 w-28 rounded-[14px]" />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-[18px] border border-border-theme/70 bg-surface p-3 flex flex-col justify-between gap-2.5"
              >
                <Skeleton className="h-24 w-full rounded-[12px]" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-8 w-full rounded-[10px]" />
              </div>
            ))}
          </div>
        </div>

        {/* Pane 3: Outgoing Orders / Holds / KOT (2 cols) */}
        <div className="hidden xl:flex xl:col-span-2 flex-col gap-2.5 rounded-[20px] border border-border-theme/60 bg-surface p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <div className="flex-1 space-y-3 overflow-hidden">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-[16px]" />
            ))}
          </div>
        </div>

        {/* Pane 4: Active Cart & Checkout Controls (3 cols) */}
        <div className="hidden xl:flex xl:col-span-3 flex-col justify-between gap-3 rounded-[20px] border border-border-theme/60 bg-surface p-3.5">
          <div className="space-y-2">
            <Skeleton className="h-9 w-full rounded-[12px]" />
            <Skeleton className="h-9 w-full rounded-[12px]" />
          </div>
          <Skeleton className="flex-1 min-h-[120px] w-full rounded-[14px]" />
          <Skeleton className="h-20 w-full rounded-[14px]" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-11 rounded-[12px]" />
            <Skeleton className="h-11 rounded-[12px]" />
            <Skeleton className="h-11 rounded-[12px]" />
          </div>
          <Skeleton className="h-12 w-full rounded-[14px]" />
        </div>
      </div>

      {/* Fixed Obsidian Terminal Footer (68px) */}
      <div className="h-[68px] shrink-0 rounded-t-[20px] bg-[#222026] px-4 flex items-center justify-between">
        <Skeleton className="h-10 w-36 rounded-[12px] bg-white/15" />
        <div className="hidden md:flex items-center gap-2">
          <Skeleton className="h-7 w-28 rounded-full bg-white/10" />
          <Skeleton className="h-7 w-28 rounded-full bg-white/10" />
        </div>
        <Skeleton className="h-10 w-36 rounded-[12px] bg-white/15" />
      </div>
    </div>
  );
}
