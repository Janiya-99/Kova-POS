import * as React from 'react';
import {
  Boxes,
  FileSpreadsheet,
  FolderTree,
  Landmark,
  Package,
  Printer,
  Settings,
  ShoppingBag,
  Store,
  Truck,
  Users,
} from 'lucide-react';
import type { AppRoute } from '@/components/layout/FloatingSidebar';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { Can } from '@/features/auth/Can';
import type { OverviewRolePersona } from '../types';

interface RoleQuickFunctionsBarProps {
  persona: OverviewRolePersona;
  heldCount: number;
  lowStockCount: number;
  onOpenPOS: () => void;
  onNavigate?: (route: AppRoute) => void;
}

interface QuickActionDef {
  id: string;
  label: string;
  badge?: string;
  permission: string;
  route: AppRoute;
  variant?: 'obsidian' | 'lavender' | 'outline';
  icon: React.ReactNode;
}

export function RoleQuickFunctionsBar({
  persona,
  heldCount,
  lowStockCount,
  onOpenPOS,
  onNavigate,
}: RoleQuickFunctionsBarProps) {
  const go = (route: AppRoute) => {
    if (route === '/pos') {
      onOpenPOS();
      return;
    }
    onNavigate?.(route);
  };

  const actions = React.useMemo<QuickActionDef[]>(() => {
    if (persona === 'CASHIER') {
      return [
        {
          id: 'pos',
          label: 'Open POS Register',
          badge: heldCount > 0 ? `${heldCount} held` : undefined,
          permission: 'pos:view',
          route: '/pos',
          variant: 'obsidian',
          icon: <Store className="h-4 w-4" />,
        },
        {
          id: 'customers',
          label: 'Customers & Loyalty',
          permission: 'customers:view',
          route: '/customers',
          variant: 'lavender',
          icon: <Users className="h-4 w-4" />,
        },
        {
          id: 'products',
          label: 'Catalog & Prices',
          permission: 'catalog:view',
          route: '/products',
          variant: 'outline',
          icon: <ShoppingBag className="h-4 w-4" />,
        },
        {
          id: 'print',
          label: 'Receipt Studio',
          permission: 'print:view',
          route: '/print-studio',
          variant: 'outline',
          icon: <Printer className="h-4 w-4" />,
        },
      ];
    }

    if (persona === 'ACCOUNTANT') {
      return [
        {
          id: 'accounting',
          label: 'General Ledger',
          permission: 'accounting:view',
          route: '/accounting',
          variant: 'obsidian',
          icon: <Landmark className="h-4 w-4" />,
        },
        {
          id: 'reports',
          label: 'Tax & Financial Reports',
          permission: 'analytics:view',
          route: '/reports',
          variant: 'lavender',
          icon: <FileSpreadsheet className="h-4 w-4" />,
        },
        {
          id: 'settings',
          label: 'Tax Rules & Settings',
          permission: 'settings:view',
          route: '/settings',
          variant: 'outline',
          icon: <Settings className="h-4 w-4" />,
        },
        {
          id: 'print',
          label: 'Invoice Templates',
          permission: 'print:view',
          route: '/print-studio',
          variant: 'outline',
          icon: <Printer className="h-4 w-4" />,
        },
      ];
    }

    if (persona === 'INVENTORY') {
      return [
        {
          id: 'inventory',
          label: 'Inventory & GRN Intake',
          badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
          permission: 'inventory:view',
          route: '/inventory',
          variant: 'obsidian',
          icon: <Boxes className="h-4 w-4" />,
        },
        {
          id: 'products',
          label: 'Products & Reorder Rules',
          permission: 'catalog:view',
          route: '/products',
          variant: 'lavender',
          icon: <Package className="h-4 w-4" />,
        },
        {
          id: 'suppliers',
          label: 'Suppliers & Vendors',
          permission: 'inventory:view',
          route: '/suppliers',
          variant: 'outline',
          icon: <Truck className="h-4 w-4" />,
        },
        {
          id: 'categories',
          label: 'Categories',
          permission: 'catalog:view',
          route: '/categories',
          variant: 'outline',
          icon: <FolderTree className="h-4 w-4" />,
        },
      ];
    }

    return [
      {
        id: 'pos',
        label: 'POS Terminal',
        badge: heldCount > 0 ? `${heldCount} held` : undefined,
        permission: 'pos:view',
        route: '/pos',
        variant: 'obsidian',
        icon: <Store className="h-4 w-4" />,
      },
      {
        id: 'inventory',
        label: 'Inventory & GRN',
        badge: lowStockCount > 0 ? `${lowStockCount} low` : undefined,
        permission: 'inventory:view',
        route: '/inventory',
        variant: 'lavender',
        icon: <Boxes className="h-4 w-4" />,
      },
      {
        id: 'reports',
        label: 'Reports & POs',
        permission: 'analytics:view',
        route: '/reports',
        variant: 'outline',
        icon: <FileSpreadsheet className="h-4 w-4" />,
      },
      {
        id: 'accounting',
        label: 'General Ledger',
        permission: 'accounting:view',
        route: '/accounting',
        variant: 'outline',
        icon: <Landmark className="h-4 w-4" />,
      },
      {
        id: 'settings',
        label: 'Settings & Access',
        permission: 'settings:view',
        route: '/settings',
        variant: 'outline',
        icon: <Settings className="h-4 w-4" />,
      },
    ];
  }, [persona, heldCount, lowStockCount]);

  return (
    <div
      className="flex flex-wrap items-center gap-2.5"
      data-testid="overview-quick-functions"
    >
      {actions.map((action) => (
        <Can key={action.id} permission={action.permission}>
          {action.variant === 'outline' ? (
            <button
              type="button"
              onClick={() => go(action.route)}
              data-testid={`overview-quick-${action.id}`}
              className="zona-glass-pill inline-flex min-h-[40px] items-center gap-2 rounded-[var(--theme-radius-control)] px-3.5 py-2 text-xs font-semibold text-ink hover:border-accent/60 transition active:scale-[0.98] cursor-pointer"
            >
              <span className="text-accent">{action.icon}</span>
              <span>{action.label}</span>
              {action.badge && (
                <span className="ml-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent tabular-nums">
                  {action.badge}
                </span>
              )}
            </button>
          ) : (
            <DynamicButton
              variant={action.variant === 'obsidian' ? 'obsidian' : 'lavender'}
              icon={action.icon}
              onClick={() => go(action.route)}
              className="min-h-[40px] px-3.5 text-xs"
              data-testid={`overview-quick-${action.id}`}
            >
              <span>{action.label}</span>
              {action.badge && (
                <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold tabular-nums">
                  {action.badge}
                </span>
              )}
            </DynamicButton>
          )}
        </Can>
      ))}
    </div>
  );
}
