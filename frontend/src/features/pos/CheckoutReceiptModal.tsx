import * as React from 'react';
import { Printer, Usb, CheckCircle2, FileDown } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ReceiptPrinter } from '@/components/dqnamo/ReceiptPrinter';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { dispatchESCPOSPrint, type PaperWidth } from '@/lib/escpos-bridge';
import { getCachedDefaultTemplate } from '@/features/print-studio/engine/offlinePrintCache';
import { compileTemplateToESCPOSBytes, dispatchRawESCPOSBytes } from '@/lib/escpos-studio-engine';
import { generateTemplateVectorPDF } from '@/features/print-studio/engine/pdfGenerator';
import { createStarterSchema, PrintDataContext, PrintTemplateRecord } from '@/features/print-studio/types';
import { useAuthStore } from '@/store/authStore';
import { toast } from 'sonner';

export interface ReceiptModalData {
  storeName: string;
  branchName: string;
  taxRegistrationNo?: string;
  logoReceiptUrl?: string;
  footerMessage?: string;
  currencyCode?: string;
  cashierName: string;
  invoiceNumber: string;
  customerName: string;
  paymentMethod: string;
  paperWidth: PaperWidth;
  kickDrawer: boolean;
  pointsEarned?: number;
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
  changeGiven: string;
  offlineQueued?: boolean;
}

interface CheckoutReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptModalData | null;
}

export function CheckoutReceiptModal({
  open,
  onOpenChange,
  receipt,
}: CheckoutReceiptModalProps) {
  const { context } = useAuthStore();
  const [paperWidth, setPaperWidth] = React.useState<PaperWidth>('80mm');
  const [printing, setPrinting] = React.useState(false);
  const [lastTransport, setLastTransport] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (receipt?.paperWidth) setPaperWidth(receipt.paperWidth);
    setLastTransport(null);
  }, [receipt]);

  if (!receipt) return null;

  const activeCurrency = receipt.currencyCode || context?.base_currency || 'USD';
  const activeTaxReg = receipt.taxRegistrationNo || context?.tax_registration_no || '';
  const activeLogoReceipt = receipt.logoReceiptUrl || context?.logo_receipt_url || '';

  const buildPrintDataContext = (): PrintDataContext => ({
    businessName: receipt.storeName,
    branchName: receipt.branchName,
    taxRegNo: activeTaxReg,
    businessLogoUrl: activeLogoReceipt,
    invoiceNumber: receipt.invoiceNumber,
    dateTime: new Date().toLocaleString(),
    customerName: receipt.customerName,
    cashierName: receipt.cashierName,
    paymentMethod: receipt.paymentMethod,
    subtotal: receipt.subtotal,
    discountTotal: receipt.discountTotal,
    taxTotal: receipt.taxTotal,
    grandTotal: receipt.grandTotal,
    currencyCode: activeCurrency,
    items: receipt.items,
  });

  const handlePrint = async () => {
    setPrinting(true);
    try {
      const targetDocType = paperWidth === '58mm' ? 'THERMAL_58MM' : 'THERMAL_80MM';
      const cachedTemplate = context?.business_id
        ? await getCachedDefaultTemplate(context.business_id, [targetDocType, 'THERMAL_80MM', 'THERMAL_58MM'])
        : null;

      if (cachedTemplate) {
        const bytes = await compileTemplateToESCPOSBytes(cachedTemplate, buildPrintDataContext());
        const studioRes = await dispatchRawESCPOSBytes(bytes, {
          paperWidth,
          preferredTransport: cachedTemplate.printer_profile?.transport || 'webusb',
        });
        setLastTransport(`${cachedTemplate.name} • ${studioRes.byteLength}B ESC/POS`);
        toast.success(studioRes.message);
        return;
      }

      const res = await dispatchESCPOSPrint({
        storeName: receipt.storeName,
        branchName: receipt.branchName,
        taxRegistrationNo: activeTaxReg,
        footerMessage: receipt.footerMessage,
        currencyCode: activeCurrency,
        invoiceNumber: receipt.invoiceNumber,
        cashierName: receipt.cashierName,
        customerName: receipt.customerName,
        paymentMethod: receipt.paymentMethod,
        paperWidth,
        kickDrawer: receipt.kickDrawer,
        items: receipt.items,
        subtotal: receipt.subtotal,
        discountTotal: receipt.discountTotal,
        taxTotal: receipt.taxTotal,
        grandTotal: receipt.grandTotal,
        changeGiven: receipt.changeGiven,
      });
      setLastTransport(`${res.transport} • ${res.bytesSent}B ESC/POS`);
      toast.success(
        `Receipt dispatched via ${res.transport}${res.drawerKicked ? ' (Cash Drawer Kicked)' : ''}`
      );
      if (res.transport === 'BrowserFallback') {
        window.print();
      }
    } finally {
      setPrinting(false);
    }
  };

  const handleDownloadA4Pdf = async () => {
    setPrinting(true);
    try {
      const cachedA4 = context?.business_id
        ? await getCachedDefaultTemplate(context.business_id, ['A4_INVOICE'])
        : null;
      const tpl: PrintTemplateRecord = cachedA4 || {
        id: 'fallback-a4',
        business_id: context?.business_id || '',
        name: 'A4 Tax Invoice',
        document_type: 'A4_INVOICE',
        paper_width_mm: 210,
        paper_height_mm: 297,
        snap_grid_mm: 5,
        is_default: true,
        canvas_schema: createStarterSchema('A4_INVOICE'),
        printer_profile: {
          transport: 'pdf',
          deviceName: 'Vector PDF',
          paperWidth: 'A4',
          autoKickDrawer: false,
          cutPaper: false,
        },
      };
      const pdf = await generateTemplateVectorPDF(tpl, buildPrintDataContext());
      pdf.download();
      toast.success(`Exported A4 Vector Invoice ${pdf.filename}`);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#22C55E]" />
            <span>{receipt.offlineQueued ? 'Offline Sale Queued' : 'Checkout Complete'}</span>
          </DialogTitle>
          <DialogDescription>
            {receipt.offlineQueued
              ? 'Stored safely in IndexedDB sync outbox with UUIDv7 idempotency.'
              : 'Double-entry GL posted & FIFO inventory depleted atomically.'}
          </DialogDescription>
        </DialogHeader>

        {Boolean(receipt.pointsEarned && receipt.pointsEarned > 0) && (
          <div className="mt-1 rounded-full bg-accent-soft px-3.5 py-1.5 text-center text-xs font-bold text-accent-soft-fg">
            +{receipt.pointsEarned} loyalty points credited to {receipt.customerName}
          </div>
        )}

        {/* Paper Roll Size Switcher */}
        <div className="mt-2 flex items-center justify-center gap-2">
          {(['58mm', '76.2mm', '80mm'] as const).map((w) => (
            <TactileButton
              key={w}
              tone={paperWidth === w ? 'obsidian' : 'soft'}
              onClick={() => setPaperWidth(w)}
              className="min-h-[38px] px-3.5 py-1.5 text-xs"
            >
              {w} Roll
            </TactileButton>
          ))}
        </div>

        <div className="my-4">
          <ReceiptPrinter
            storeName={receipt.storeName}
            branchName={receipt.branchName}
            taxRegistrationNo={activeTaxReg}
            logoReceiptUrl={activeLogoReceipt}
            footerMessage={receipt.footerMessage}
            currencyCode={activeCurrency}
            invoiceNumber={receipt.invoiceNumber}
            customerName={receipt.customerName}
            paymentMethod={receipt.paymentMethod}
            paperWidth={paperWidth}
            orderChannel={receipt.orderChannel}
            tableOrBayLabel={receipt.tableOrBayLabel}
            vehiclePlate={receipt.vehiclePlate}
            warrantyTerms={receipt.warrantyTerms}
            items={receipt.items}
            subtotal={receipt.subtotal}
            discountTotal={receipt.discountTotal}
            taxTotal={receipt.taxTotal}
            grandTotal={receipt.grandTotal}
            changeGiven={receipt.changeGiven}
          />
        </div>

        {lastTransport && (
          <div className="mb-3 flex items-center justify-center gap-2 rounded-full bg-accent-soft/50 px-3 py-1.5 text-xs font-semibold text-ink">
            <Usb className="h-3.5 w-3.5 text-accent" />
            <span>{lastTransport}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <DynamicButton
            variant="obsidian"
            loading={printing}
            icon={<Printer className="h-4 w-4" />}
            onClick={handlePrint}
            className="flex-1"
          >
            Print ESC/POS Receipt
          </DynamicButton>
          <DynamicButton
            data-testid="checkout-export-a4-pdf-btn"
            variant="lavender"
            loading={printing}
            icon={<FileDown className="h-4 w-4" />}
            onClick={handleDownloadA4Pdf}
            className="sm:w-36"
          >
            A4 PDF
          </DynamicButton>
          <TactileButton tone="soft" onClick={() => onOpenChange(false)} className="sm:w-24">
            Done
          </TactileButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
