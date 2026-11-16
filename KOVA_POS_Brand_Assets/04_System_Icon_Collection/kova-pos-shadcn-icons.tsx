import React from "react";
import {
  Monitor,
  ShoppingBag,
  Coffee,
  Wrench,
  TrendingUp,
  Package,
  BarChart3,
  Users,
  Truck,
  FileText,
  Settings,
  CloudUpload,
  ShieldCheck,
  ScanBarcode,
  CreditCard,
  ShoppingCart,
  type LucideProps,
} from "lucide-react";

export const KOVA_POS_SHADCN_ICONS = {
  posTerminal: Monitor,
  retail: ShoppingBag,
  cafe: Coffee,
  hardware: Wrench,
  sales: TrendingUp,
  inventory: Package,
  analytics: BarChart3,
  customers: Users,
  suppliers: Truck,
  reports: FileText,
  settings: Settings,
  cloudSync: CloudUpload,
  security: ShieldCheck,
  barcodeScanning: ScanBarcode,
  payments: CreditCard,
  shoppingCart: ShoppingCart,
} as const;

export type KovaSystemIconName = keyof typeof KOVA_POS_SHADCN_ICONS;

export interface KovaSystemIconProps extends LucideProps {
  name: KovaSystemIconName;
  withContainer?: boolean;
}

export function KovaSystemIcon({
  name,
  withContainer = true,
  className = "h-5 w-5 text-[#F8FAFC]",
  strokeWidth = 2,
  ...props
}: KovaSystemIconProps) {
  const IconComponent = KOVA_POS_SHADCN_ICONS[name];
  if (!withContainer) {
    return <IconComponent strokeWidth={strokeWidth} className={className} {...props} />;
  }
  return (
    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#1E293B] bg-[#0B1021] shadow-sm">
      <IconComponent strokeWidth={strokeWidth} className={className} {...props} />
    </div>
  );
}
