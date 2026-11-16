import { Skeleton } from '@/components/ui/skeleton';

/**
 * 1:1 Layout Skeleton matching SettingsInheritancePage (CLS = 0).
 */
export function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="zona-card p-5 space-y-3.5">
        <Skeleton className="h-6 w-64" />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-[var(--theme-radius-control)]" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[146px] w-full rounded-[var(--theme-radius-card)]" />
        ))}
      </div>
    </div>
  );
}
