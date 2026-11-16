import * as React from 'react';
import {
  LayoutGrid,
  ShoppingBag,
  Package,
  Boxes,
  Truck,
  Tags,
  Users,
  BarChart3,
  ReceiptText,
  SlidersHorizontal,
  HelpCircle,
  Settings,
  LogOut,
  Menu,
  Pin,
  PinOff,
  ChevronDown,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDisplayLabel } from '@/lib/formatLabel';
import { getDisplayTradeName, useAuthStore } from '@/store/authStore';
import { useT } from '@/store/i18nStore';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

export type AppRoute =
  | '/overview'
  | '/pos'
  | '/products'
  | '/categories'
  | '/customers'
  | '/suppliers'
  | '/inventory'
  | '/reports'
  | '/accounting'
  | '/print-studio'
  | '/settings';

interface FloatingSidebarProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  heldCount?: number;
  pinned?: boolean;
  onTogglePin?: () => void;
}

function SidebarTooltip({
  label,
  shortcut,
  disabled,
  children,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  children: React.ReactElement;
}) {
  return (
    <Tooltip open={disabled ? false : undefined}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded-full bg-accent-soft/25 px-1.5 py-0.5 text-[10px] font-bold text-accent-soft">
            {shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function findGroupForRoute(route: AppRoute): string | null {
  if (route === '/products' || route === '/categories') return 'catalog';
  if (route === '/suppliers' || route === '/inventory') return 'supply';
  if (route === '/reports' || route === '/accounting') return 'finance';
  return null;
}

export function FloatingSidebar({
  activeRoute,
  onNavigate,
  heldCount = 3,
  pinned = false,
  onTogglePin,
}: FloatingSidebarProps) {
  const { context, publicBranding, logout, hasPermission } = useAuthStore();
  const { t } = useT();
  const tradeName = getDisplayTradeName(context, publicBranding);
  const logoLightUrl =
    context?.logo_light_url ||
    publicBranding?.logo_light_url ||
    context?.logo_dark_url ||
    context?.logo_sidebar_url ||
    '';
  const primaryColorHex =
    context?.primary_color_hex || publicBranding?.primary_color_hex || '#877FC1';
  const brandInitials = tradeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'RW';
  const [mobileMoreOpen, setMobileMoreOpen] = React.useState(false);
  const [expandedGroup, setExpandedGroup] = React.useState<string | null>(() =>
    findGroupForRoute(activeRoute)
  );
  const [collapsedPopoverGroup, setCollapsedPopoverGroup] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExpandedGroup(findGroupForRoute(activeRoute));
    setCollapsedPopoverGroup(null);
    setMobileMoreOpen(false);
  }, [activeRoute]);

  // Strict Click-to-Pin / Unpin behavior (hover auto-expand intentionally disabled)
  const expanded = Boolean(pinned);

  interface NavLeafItem {
    route: AppRoute;
    label: string;
    fullLabel: string;
    description: string;
    shortcut: string;
    icon: React.ComponentType<{ className?: string }>;
    perm?: string;
    badge?: number;
  }

  interface NavGroupNode {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    children: NavLeafItem[];
  }

  const rawEntries: Array<{ type: 'leaf'; item: NavLeafItem } | { type: 'group'; group: NavGroupNode }> = [
    {
      type: 'leaf',
      item: {
        route: '/overview',
        label: t.nav.overview,
        fullLabel: t.nav.overview,
        description: t.routes['/overview'].subtitle,
        shortcut: '1',
        icon: LayoutGrid,
        perm: 'analytics:view',
      },
    },
    {
      type: 'leaf',
      item: {
        route: '/pos',
        label: t.nav.pos,
        fullLabel: t.nav.pos,
        description: t.routes['/pos'].subtitle,
        shortcut: '2',
        icon: ShoppingBag,
        perm: 'pos:view',
        badge: heldCount,
      },
    },
    {
      type: 'group',
      group: {
        id: 'catalog',
        label: t.nav.catalog,
        icon: Package,
        children: [
          {
            route: '/products',
            label: t.nav.products,
            fullLabel: t.nav.products,
            description: t.routes['/products'].subtitle,
            shortcut: '3',
            icon: Package,
            perm: 'catalog:view',
          },
          {
            route: '/categories',
            label: t.nav.categories,
            fullLabel: t.nav.categories,
            description: t.routes['/categories'].subtitle,
            shortcut: '4',
            icon: Tags,
            perm: 'catalog:view',
          },
        ],
      },
    },
    {
      type: 'leaf',
      item: {
        route: '/customers',
        label: t.nav.customers,
        fullLabel: t.nav.customers,
        description: t.routes['/customers'].subtitle,
        shortcut: '5',
        icon: Users,
        perm: 'customers:view',
      },
    },
    {
      type: 'group',
      group: {
        id: 'supply',
        label: t.nav.procurement,
        icon: Boxes,
        children: [
          {
            route: '/suppliers',
            label: t.nav.suppliers,
            fullLabel: t.nav.suppliers,
            description: t.routes['/suppliers'].subtitle,
            shortcut: '6',
            icon: Truck,
            perm: 'inventory:view',
          },
          {
            route: '/inventory',
            label: t.nav.inventory,
            fullLabel: t.nav.inventory,
            description: t.routes['/inventory'].subtitle,
            shortcut: '7',
            icon: Boxes,
            perm: 'inventory:view',
          },
        ],
      },
    },
    {
      type: 'group',
      group: {
        id: 'finance',
        label: t.nav.finance,
        icon: BarChart3,
        children: [
          {
            route: '/reports',
            label: t.nav.reports,
            fullLabel: t.nav.reports,
            description: t.routes['/reports'].subtitle,
            shortcut: '8',
            icon: BarChart3,
            perm: 'analytics:view',
          },
          {
            route: '/accounting',
            label: t.nav.accounting,
            fullLabel: t.nav.accounting,
            description: t.routes['/accounting'].subtitle,
            shortcut: '9',
            icon: ReceiptText,
            perm: 'accounting:view',
          },
        ],
      },
    },
    {
      type: 'leaf',
      item: {
        route: '/print-studio',
        label: t.nav.printStudio,
        fullLabel: t.nav.printStudio,
        description: t.routes['/print-studio'].subtitle,
        shortcut: 'P',
        icon: Printer,
        perm: 'print:view',
      },
    },
    {
      type: 'leaf',
      item: {
        route: '/settings',
        label: t.nav.settings,
        fullLabel: t.nav.settings,
        description: t.routes['/settings'].subtitle,
        shortcut: '0',
        icon: SlidersHorizontal,
        perm: 'settings:view',
      },
    },
  ];

  // Collapse groups with only 1 permitted child into direct leaf items; keep tree only when >= 2 routes
  const resolvedNodes: Array<{ type: 'leaf'; item: NavLeafItem } | { type: 'tree'; group: NavGroupNode }> = [];
  const visibleItems: NavLeafItem[] = [];

  for (const entry of rawEntries) {
    if (entry.type === 'leaf') {
      if (!entry.item.perm || hasPermission(entry.item.perm)) {
        resolvedNodes.push({ type: 'leaf', item: entry.item });
        visibleItems.push(entry.item);
      }
    } else {
      const permitted = entry.group.children.filter((c) => !c.perm || hasPermission(c.perm));
      if (permitted.length === 1) {
        resolvedNodes.push({ type: 'leaf', item: permitted[0] });
        visibleItems.push(permitted[0]);
      } else if (permitted.length >= 2) {
        resolvedNodes.push({ type: 'tree', group: { ...entry.group, children: permitted } });
        visibleItems.push(...permitted);
      }
    }
  }

  const toggleTreeGroup = (groupId: string) => {
    setExpandedGroup((prev) => (prev === groupId ? null : groupId));
  };

  const handleNavigate = (targetRoute: AppRoute) => {
    setExpandedGroup(findGroupForRoute(targetRoute));
    setCollapsedPopoverGroup(null);
    setMobileMoreOpen(false);
    onNavigate(targetRoute);
  };

  return (
    <>
      {/* Desktop & Tablet Left Floating Pill Dock — Strict Click Pin / Unpin (No Hover Auto-Expand) */}
      <aside
        aria-label="Primary navigation"
        data-pinned={pinned ? 'true' : 'false'}
        data-expanded={expanded ? 'true' : 'false'}
        className={cn(
          'hidden md:flex print:hidden fixed left-4 top-4 bottom-4 flex-col justify-between rounded-[var(--theme-radius-rail)] bg-sidebar py-3.5 text-[var(--theme-sidebar-fg)] border border-border-theme/40 shadow-[0_14px_34px_rgba(17,19,21,0.22)] transition-[width,padding,background-color] duration-200 ease-out z-40 overflow-visible',
          expanded ? 'w-[228px] px-3' : 'w-[64px] items-center px-1.5'
        )}
      >
        {/* Top Row: Brand Mark + Expanded Title & Pin Status Toggle */}
        <div
          className={cn(
            'flex items-center shrink-0',
            expanded ? 'justify-between gap-2' : 'flex-col gap-2'
          )}
        >
          <SidebarTooltip
            label={tradeName}
            shortcut={pinned ? 'Pinned' : 'Pin'}
            disabled={expanded}
          >
            <button
              type="button"
              onClick={() => handleNavigate('/overview')}
              aria-label={`${tradeName} Home`}
              data-testid="sidebar-brand-button"
              className={cn(
                'flex h-9 items-center rounded-[var(--theme-radius-control)] hover:bg-white/10 transition cursor-pointer',
                expanded ? 'gap-2.5 px-2 min-w-0' : 'w-9 justify-center'
              )}
            >
              {logoLightUrl ? (
                <img
                  src={logoLightUrl}
                  alt={tradeName}
                  data-testid="sidebar-brand-logo"
                  className="h-7 w-7 rounded-[6px] object-contain shrink-0 bg-white/95 p-0.5 ring-1 ring-white/25"
                />
              ) : (
                <span
                  data-testid="sidebar-brand-monogram"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[10.5px] font-extrabold text-white shadow-xs"
                  style={{ backgroundColor: primaryColorHex }}
                >
                  {brandInitials}
                </span>
              )}
              {expanded && (
                <div className="min-w-0 text-left">
                  <p
                    data-testid="sidebar-brand-name"
                    className="truncate text-sm font-extrabold tracking-tight"
                  >
                    {tradeName}
                  </p>
                  <p className="truncate text-[10px] font-medium text-accent">
                    {t.common.pinnedRail}
                  </p>
                </div>
              )}
            </button>
          </SidebarTooltip>

          {onTogglePin && (
            <SidebarTooltip
              label={pinned ? t.common.unpinSidebar : t.common.pinSidebar}
            >
              <button
                type="button"
                onClick={onTogglePin}
                aria-label={pinned ? t.common.unpinSidebar : t.common.pinSidebar}
                aria-pressed={pinned}
                className={cn(
                  'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition cursor-pointer',
                  pinned
                    ? 'bg-accent text-accent-fg shadow-sm ring-2 ring-accent/35'
                    : 'bg-sidebar-pill text-white/70 hover:bg-white/15 hover:text-white'
                )}
              >
                {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
              </button>
            </SidebarTooltip>
          )}
        </div>

        {/* Middle Inner Navigation Pill */}
        <nav
          className={cn(
            'flex min-h-0 flex-col gap-1 overflow-y-auto pos-clean-scroll rounded-[var(--theme-radius-inner)] bg-sidebar-pill p-1.5',
            expanded ? 'w-full items-stretch' : 'items-center'
          )}
        >
          {resolvedNodes.map((node) => {
            if (node.type === 'leaf') {
              const item = node.item;
              const Icon = item.icon;
              const active = activeRoute === item.route;
              return (
                <SidebarTooltip
                  key={item.route}
                  label={
                    item.badge && item.badge > 0
                      ? `${item.fullLabel} (${item.badge} held)`
                      : item.fullLabel
                  }
                  shortcut={`Alt+${item.shortcut}`}
                  disabled={expanded}
                >
                  <button
                    type="button"
                    aria-label={item.fullLabel}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => handleNavigate(item.route)}
                    className={cn(
                      'relative flex h-9 shrink-0 items-center rounded-[var(--theme-radius-control)] transition-colors cursor-pointer',
                      expanded ? 'w-full justify-between px-2.5' : 'w-9 justify-center',
                      active
                        ? 'bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-fg)] shadow-xs'
                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className={cn('flex items-center min-w-0', expanded && 'gap-2.5')}>
                      <Icon className="h-4 w-4 shrink-0" />
                      {expanded && (
                        <span className="truncate text-[11.5px] font-semibold tracking-[-0.01em]">
                          {item.fullLabel}
                        </span>
                      )}
                    </span>

                    {typeof item.badge === 'number' && item.badge > 0 ? (
                      <span
                        className={cn(
                          'flex h-4 min-w-[16px] items-center justify-center rounded-[var(--theme-radius-badge)] bg-accent px-1 text-[9.5px] font-bold text-accent-fg tabular-nums',
                          expanded ? 'shrink-0' : 'absolute -right-1 -top-1 ring-2 ring-sidebar'
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : expanded ? (
                      <span
                        className={cn(
                          'text-[10px] font-semibold tabular-nums',
                          active ? 'opacity-70' : 'text-white/40'
                        )}
                      >
                        ⌥{item.shortcut}
                      </span>
                    ) : null}
                  </button>
                </SidebarTooltip>
              );
            }

            // Multi-Tree Node (>= 2 permitted children)
            const group = node.group;
            const GroupIcon = group.icon;
            const groupHasActive = group.children.some((c) => c.route === activeRoute);
            const isOpen = expandedGroup === group.id;

            if (!expanded) {
              // Unpinned Compact Rail: click opens clean floating branch menu (zero hover dependency)
              const popOpen = collapsedPopoverGroup === group.id;
              return (
                <Popover
                  key={group.id}
                  open={popOpen}
                  onOpenChange={(next) => setCollapsedPopoverGroup(next ? group.id : null)}
                >
                  <SidebarTooltip label={`${group.label} (${group.children.length})`} disabled={popOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={group.label}
                        aria-expanded={popOpen}
                        className={cn(
                          'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--theme-radius-control)] transition-colors cursor-pointer',
                          groupHasActive
                            ? 'bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-fg)] shadow-xs'
                            : 'text-white/75 hover:bg-white/10 hover:text-white'
                        )}
                      >
                        <GroupIcon className="h-4 w-4 shrink-0" />
                        <span
                          aria-hidden="true"
                          className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-accent opacity-80"
                        />
                      </button>
                    </PopoverTrigger>
                  </SidebarTooltip>
                  <PopoverContent side="right" sideOffset={12} align="start" className="w-52 p-1.5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {group.children.map((child) => {
                        const ChildIcon = child.icon;
                        const active = activeRoute === child.route;
                        return (
                          <button
                            key={child.route}
                            type="button"
                            aria-label={child.fullLabel}
                            onClick={() => handleNavigate(child.route)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-[var(--theme-radius-control)] px-2.5 py-2 text-left text-xs font-semibold transition cursor-pointer',
                              active
                                ? 'bg-accent text-accent-fg'
                                : 'text-ink hover:bg-accent-soft/45'
                            )}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{child.fullLabel}</span>
                            </span>
                            <span className="text-[10px] opacity-65 tabular-nums">
                              ⌥{child.shortcut}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              );
            }

            // Pinned Expanded Tree Section
            return (
              <div key={group.id} className="space-y-0.5">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${group.label} group`}
                  onClick={() => toggleTreeGroup(group.id)}
                  className={cn(
                    'flex h-9 w-full items-center justify-between rounded-[var(--theme-radius-control)] px-2.5 text-left transition-colors cursor-pointer',
                    groupHasActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/75 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <GroupIcon className="h-4 w-4 shrink-0 text-accent" />
                    <span className="truncate text-[11.5px] font-semibold tracking-[-0.01em]">
                      {group.label}
                    </span>
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-4 pl-2.5 border-l border-white/15 space-y-0.5 py-0.5">
                    {group.children.map((child) => {
                      const ChildIcon = child.icon;
                      const active = activeRoute === child.route;
                      return (
                        <button
                          key={child.route}
                          type="button"
                          aria-label={child.fullLabel}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => handleNavigate(child.route)}
                          className={cn(
                            'flex h-8 w-full items-center justify-between rounded-[var(--theme-radius-control)] px-2 transition-colors cursor-pointer',
                            active
                              ? 'bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-fg)] shadow-xs'
                              : 'text-white/70 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate text-[11px] font-semibold">
                              {child.fullLabel}
                            </span>
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-semibold tabular-nums',
                              active ? 'opacity-70' : 'text-white/40'
                            )}
                          >
                            ⌥{child.shortcut}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Bottom Utility + Pin Status Chip + Detached Logout */}
        <div
          className={cn(
            'flex shrink-0 flex-col gap-1.5',
            expanded ? 'w-full items-stretch' : 'items-center'
          )}
        >
          {expanded && (
            <div className="mb-0.5 flex items-center justify-between rounded-[var(--theme-radius-control)] bg-sidebar-pill px-2.5 py-1.5 text-[10.5px]">
              <span className="flex items-center gap-1.5 font-semibold text-white/85">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    pinned ? 'bg-[#22C55E]' : 'bg-white/40'
                  )}
                />
                {pinned ? 'Pinned Sidebar' : 'Compact Dock'}
              </span>
              <span className="truncate max-w-[82px] text-[10px] font-semibold text-accent">
                {context?.designation_name || formatDisplayLabel(context?.role_name || context?.role_code) || 'Staff'}
              </span>
            </div>
          )}

          {hasPermission('settings:view') && (
            <SidebarTooltip label="Settings & Light Colors" disabled={expanded}>
              <button
                type="button"
                aria-label="Settings"
                onClick={() => handleNavigate('/settings')}
                className={cn(
                  'flex h-8.5 items-center rounded-[var(--theme-radius-control)] text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer',
                  expanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-8.5 justify-center'
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {expanded && <span className="text-[11.5px] font-semibold">Preferences</span>}
              </button>
            </SidebarTooltip>
          )}

          {hasPermission('analytics:view') && (
            <SidebarTooltip label="Overview Analytics" shortcut="Alt+1" disabled={expanded}>
              <button
                type="button"
                aria-label="Help & Overview"
                onClick={() => handleNavigate('/overview')}
                className={cn(
                  'flex h-8.5 items-center rounded-[var(--theme-radius-control)] text-white/70 hover:bg-white/10 hover:text-white transition cursor-pointer',
                  expanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-8.5 justify-center'
                )}
              >
                <HelpCircle className="h-4 w-4 shrink-0" />
                {expanded && <span className="text-[11.5px] font-semibold">Quick Guide</span>}
              </button>
            </SidebarTooltip>
          )}

          <SidebarTooltip label={t.common.signOut} disabled={expanded}>
            <button
              type="button"
              aria-label={t.common.signOut}
              onClick={logout}
              className={cn(
                'mt-0.5 flex h-9 items-center rounded-[var(--theme-radius-control)] bg-sidebar-pill text-white/85 hover:bg-[#EF4444] hover:text-white transition cursor-pointer',
                expanded ? 'w-full justify-start gap-2.5 px-2.5' : 'w-9 justify-center'
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {expanded && <span className="text-[11.5px] font-bold">{t.common.signOut}</span>}
            </button>
          </SidebarTooltip>
        </div>
      </aside>

      {/* Mobile Floating Bottom Pill Dock (< 768px) */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden print:hidden fixed bottom-3 inset-x-3 z-40 mx-auto flex h-14 max-w-md items-center justify-around rounded-[var(--theme-radius-rail)] bg-sidebar px-2 text-white shadow-2xl"
      >
        {visibleItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = activeRoute === item.route;
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNavigate(item.route)}
              aria-label={item.label}
              className={cn(
                'relative flex min-h-[44px] min-w-[54px] flex-col items-center justify-center gap-0.5 rounded-[14px] px-2 py-1 text-[10px] font-semibold transition cursor-pointer',
                active
                  ? 'bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-fg)]'
                  : 'text-white/70 hover:text-white'
              )}
            >
              <Icon className="h-4.5 w-4.5" />
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="absolute right-1 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-accent-fg tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          aria-label="More options"
          className={cn(
            'flex min-h-[40px] min-w-[50px] flex-col items-center justify-center gap-0.5 rounded-[var(--theme-radius-control)] px-2 py-1 text-[10px] font-semibold transition cursor-pointer',
            activeRoute === '/settings' ||
              activeRoute === '/products' ||
              activeRoute === '/categories' ||
              activeRoute === '/customers' ||
              activeRoute === '/reports'
              ? 'bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-fg)]'
              : 'text-white/70 hover:text-white'
          )}
        >
          <Menu className="h-4.5 w-4.5" />
          <span>{t.common.more}</span>
        </button>
      </nav>

      {/* Mobile Overflow Sheet */}
      <Sheet open={mobileMoreOpen} onOpenChange={setMobileMoreOpen}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{tradeName} — {t.common.navigation}</SheetTitle>
            <SheetDescription>{t.login.signInSubtitle}</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pos-clean-scroll">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => handleNavigate(item.route)}
                  className={cn(
                    'flex min-h-[42px] items-center justify-between rounded-[var(--theme-radius-inner)] px-3.5 py-2.5 text-xs font-semibold transition cursor-pointer',
                    activeRoute === item.route
                      ? 'bg-accent text-accent-fg'
                      : 'bg-surface-muted text-ink hover:bg-accent-soft/45'
                  )}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4" />
                    {item.fullLabel}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileMoreOpen(false);
                logout();
              }}
              className="mt-1 sm:col-span-2 flex min-h-[42px] items-center justify-center gap-2 rounded-[var(--theme-radius-inner)] bg-[#EF4444]/10 px-4 py-2.5 text-xs font-semibold text-[#EF4444] cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
