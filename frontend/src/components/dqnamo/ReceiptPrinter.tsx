import * as React from 'react';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

export interface ReceiptPrinterProps {
  storeName: string;
  branchName: string;
  taxRegistrationNo?: string;
  logoReceiptUrl?: string;
  footerMessage?: string;
  currencyCode?: string;
  invoiceNumber: string;
  customerName: string;
  paymentMethod: string;
  paperWidth: '58mm' | '76.2mm' | '80mm';
  orderChannel?: string;
  tableOrBayLabel?: string;
  vehiclePlate?: string;
  warrantyTerms?: string[];
  items: Array<{
    name: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
    metaSummary?: string;
  }>;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  changeGiven?: string;
}

/**
 * dqnamo.com/kitchen animated physical thermal paper feed dispenser.
 */
export function ReceiptPrinter({
  storeName,
  branchName,
  taxRegistrationNo,
  logoReceiptUrl,
  footerMessage,
  currencyCode,
  invoiceNumber,
  customerName,
  paymentMethod,
  paperWidth,
  orderChannel,
  tableOrBayLabel,
  vehiclePlate,
  warrantyTerms,
  items,
  subtotal,
  discountTotal,
  taxTotal,
  grandTotal,
  changeGiven,
}: ReceiptPrinterProps) {
  const { formatMoney: formatActiveMoney } = useCurrency();
  const formatMoney = (v: string | number) => formatActiveMoney(v, currencyCode);
  const [fed, setFed] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setFed(true), 60);
    return () => clearTimeout(id);
  }, [invoiceNumber]);

  const widthClass =
    paperWidth === '58mm'
      ? 'max-w-[250px]'
      : paperWidth === '76.2mm'
      ? 'max-w-[295px]'
      : 'max-w-[330px]';

  return (
    <div className="flex flex-col items-center">
      {/* Printer Feed Slot Chrome */}
      <div className="relative z-10 flex h-9 w-full max-w-[360px] items-center justify-between rounded-[var(--theme-radius-control)] bg-contrast px-4 text-contrast-fg shadow-md">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[11px] font-semibold tracking-wider uppercase">
            ESC/POS {paperWidth}
          </span>
        </div>
        <span className="text-[11px] text-accent tabular-nums">{invoiceNumber}</span>
      </div>

      {/* Physical Paper Dispenser Container */}
      <div className="relative -mt-2 w-full overflow-hidden pt-2 pb-4 flex justify-center">
        <div
          className={cn(
            'w-full rounded-b-[16px] border border-[#E5E2F3] bg-[#FFFDF9] p-5 font-mono text-[12px] text-[#222026] shadow-[0_14px_34px_rgba(34,32,38,0.12)] transition-transform duration-700 ease-out',
            widthClass,
            fed ? 'translate-y-0 opacity-100' : '-translate-y-24 opacity-0'
          )}
        >
          <div className="text-center border-b border-dashed border-[#D1D5DB] pb-3">
            {logoReceiptUrl && (
              <img
                src={logoReceiptUrl}
                alt={storeName}
                className="mx-auto mb-1.5 h-8 max-w-[120px] object-contain"
              />
            )}
            <p className="text-sm font-extrabold tracking-tight uppercase">{storeName}</p>
            <p className="text-[11px] text-[#6B7280]">{branchName}</p>
            {taxRegistrationNo && (
              <p className="text-[10px] text-[#6B7280] tabular-nums">Tax Reg: {taxRegistrationNo}</p>
            )}
            <p className="mt-1 text-[11px] font-semibold tabular-nums">
              Invoice {invoiceNumber} • {new Date().toLocaleTimeString()}
            </p>
          </div>

          <div className="py-2 text-[11px] text-[#4B5563] border-b border-dashed border-[#D1D5DB] space-y-0.5">
            <div className="flex justify-between">
              <span>Customer: {customerName}</span>
              <span className="font-semibold">{paymentMethod}</span>
            </div>
            {(orderChannel || tableOrBayLabel || vehiclePlate) && (
              <div className="flex justify-between text-[10px] text-[#6B7280]">
                <span>
                  {[orderChannel, tableOrBayLabel].filter(Boolean).join(' • ') || 'Counter'}
                </span>
                {vehiclePlate && <span className="font-bold">Plate: {vehiclePlate}</span>}
              </div>
            )}
          </div>

          <div className="space-y-2 py-3 border-b border-dashed border-[#D1D5DB]">
            {items.map((it, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="font-semibold leading-tight">{it.name}</div>
                {it.metaSummary && (
                  <div className="text-[10px] text-[#6B7280]">{it.metaSummary}</div>
                )}
                <div className="flex justify-between text-[11px] text-[#6B7280] tabular-nums">
                  <span>
                    {it.qty} × {formatMoney(it.unitPrice)}
                  </span>
                  <span className="font-semibold text-[#222026]">{formatMoney(it.lineTotal)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1 pt-3 text-[11px] tabular-nums">
            <div className="flex justify-between text-[#6B7280]">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            {parseFloat(discountTotal) > 0 && (
              <div className="flex justify-between text-[#22C55E]">
                <span>Discount</span>
                <span>-{formatMoney(discountTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#6B7280]">
              <span>Multi-Tier Tax</span>
              <span>{formatMoney(taxTotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-dashed border-[#D1D5DB] pt-2 text-sm font-extrabold text-[#222026]">
              <span>PAID</span>
              <span>{formatMoney(grandTotal)}</span>
            </div>
            {changeGiven && parseFloat(changeGiven) > 0 && (
              <div className="flex justify-between text-[11px] text-[#877FC1] font-semibold">
                <span>Change Given</span>
                <span>{formatMoney(changeGiven)}</span>
              </div>
            )}
          </div>

          {/* Warranty Terms if serialized/electronic */}
          {warrantyTerms && warrantyTerms.length > 0 && (
            <div className="mt-2 pt-2 border-t border-dashed border-[#D1D5DB] text-[10px] text-[#4B5563] space-y-0.5">
              <p className="font-bold uppercase">Warranty Terms</p>
              {warrantyTerms.map((term) => (
                <p key={term}>{term}</p>
              ))}
            </div>
          )}

          {/* Crisp SVG Barcode Footer */}
          <div className="mt-4 flex flex-col items-center gap-1 pt-2 border-t border-dashed border-[#D1D5DB]">
            <svg width="160" height="28" viewBox="0 0 160 28" aria-label="Receipt barcode">
              {[2, 6, 12, 16, 22, 27, 34, 38, 44, 51, 56, 62, 68, 75, 81, 86, 92, 98, 105, 111, 118, 124, 130, 137, 144, 151].map(
                (x, i) => (
                  <rect
                    key={x}
                    x={x}
                    y={2}
                    width={i % 3 === 0 ? 3 : 1.5}
                    height={24}
                    fill="#222026"
                  />
                )
              )}
            </svg>
            <span className="text-[10px] text-[#6B7280] tabular-nums">
              {footerMessage || `${invoiceNumber} • ${storeName.toUpperCase()}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

