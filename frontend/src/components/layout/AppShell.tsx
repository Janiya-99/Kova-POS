import * as React from 'react';
import { FloatingSidebar, type AppRoute } from './FloatingSidebar';
import { TopHeader, type NotificationAlert } from './TopHeader';
import { cn } from '@/lib/utils';

interface AppShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  title: string;
  subtitle: string;
  heldCount?: number;
  alerts: NotificationAlert[];
  onDismissAlert?: (id: string) => void;
  onClearAllAlerts?: () => void;
  rightExtra?: React.ReactNode;
  children: React.ReactNode;
}

const PIN_STORAGE_KEY = 'zona-sidebar-pinned';

/**
 * Symmetrical & responsive App Shell:
 * - Mobile (<768px): single-col with bottom floating dock + pb-24 clearance
 * - Tablet (768px–1023px): compact 64px left dock + expandable hover rail
 * - Desktop / Ultrawide (1024px+): persistent Pinned sidebar offset (lg:pl-[256px]) or compact 96px dock
 */
export function AppShell({
  activeRoute,
  onNavigate,
  title,
  subtitle,
  heldCount,
  alerts,
  onDismissAlert,
  onClearAllAlerts,
  rightExtra,
  children,
}: AppShellProps) {
  const [sidebarPinned, setSidebarPinned] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(PIN_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const handleTogglePin = React.useCallback(() => {
    setSidebarPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PIN_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen w-full bg-canvas text-ink overflow-x-hidden transition-colors duration-200 print:min-h-0 print:bg-white print:text-slate-900 print:overflow-visible">
      <FloatingSidebar
        activeRoute={activeRoute}
        onNavigate={onNavigate}
        heldCount={heldCount}
        pinned={sidebarPinned}
        onTogglePin={handleTogglePin}
      />

      <main
        className={cn(
          'mx-auto w-full max-w-[1640px] px-4 pt-4 pb-20 md:pr-5 md:pt-5 md:pb-6 lg:pr-6 transition-[padding] duration-200 ease-out print:p-0 print:m-0 print:max-w-none print:w-full',
          sidebarPinned ? 'md:pl-[248px]' : 'md:pl-[100px]'
        )}
      >
        <TopHeader
          title={title}
          subtitle={subtitle}
          onNavigate={onNavigate}
          alerts={alerts}
          onDismissAlert={onDismissAlert}
          onClearAllAlerts={onClearAllAlerts}
          rightExtra={rightExtra}
        />
        {children}
      </main>
    </div>
  );
}
