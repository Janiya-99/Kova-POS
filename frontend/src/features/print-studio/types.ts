export type DocumentType = 'A4_INVOICE' | 'THERMAL_80MM' | 'THERMAL_58MM';

export type BlockType = 'text' | 'variable' | 'item_table' | 'image' | 'qr_code';

export type TextAlign = 'left' | 'center' | 'right';

export type TableColumnKey = 'item' | 'qty' | 'price' | 'total';

export type BarcodeFormat = 'QR' | 'CODE128';

export interface BlockStyle {
  fontSizePt: number;
  bold: boolean;
  align: TextAlign;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  color: string;
  paddingMm: number;
}

export interface CanvasBlock {
  id: string;
  type: BlockType;
  label: string;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
  content: string;
  columns?: TableColumnKey[];
  showHeader?: boolean;
  rowHeightMm?: number;
  barcodeFormat?: BarcodeFormat;
  style: BlockStyle;
}

export interface CanvasSchema {
  version: number;
  snap_to_grid: boolean;
  show_guides: boolean;
  blocks: CanvasBlock[];
}

export interface PrinterProfile {
  transport: 'webusb' | 'webserial' | 'pdf' | 'browser';
  deviceName: string;
  vendorId?: number | null;
  productId?: number | null;
  baudRate?: number;
  paperWidth: 'A4' | '80mm' | '58mm';
  autoKickDrawer: boolean;
  cutPaper: boolean;
  bitmapDpi?: number;
}

export interface PrintTemplateRecord {
  id: string;
  business_id: string;
  branch_id?: string | null;
  name: string;
  document_type: DocumentType;
  paper_width_mm: number | string;
  paper_height_mm: number | string;
  snap_grid_mm: number | string;
  is_default: boolean;
  canvas_schema: CanvasSchema;
  printer_profile: PrinterProfile;
  created_at?: string;
  updated_at?: string;
}

export interface PrintLineItem {
  sku?: string;
  name: string;
  qty: number;
  unitPrice: string | number;
  lineTotal: string | number;
}

export interface PrintDataContext {
  businessName: string;
  branchName: string;
  taxRegNo: string;
  businessLogoUrl: string;
  invoiceNumber: string;
  dateTime: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  grandTotal: string | number;
  currencyCode: string;
  items: PrintLineItem[];
}

export interface DynamicTagDefinition {
  tag: string;
  label: string;
  description: string;
  sample: string;
}

export const DYNAMIC_VARIABLE_TAGS: DynamicTagDefinition[] = [
  { tag: '{Business_Name}', label: 'Business Name', description: 'Active white-label trade name', sample: 'Zona Retail Ltd' },
  { tag: '{Branch_Name}', label: 'Branch Name', description: 'Issuing store or branch name', sample: 'Soho Flagship Store' },
  { tag: '{Tax_Reg_No}', label: 'Tax / VAT Reg #', description: 'Tenant tax registration ID', sample: 'US-ZR-882940' },
  { tag: '{Invoice_Number}', label: 'Invoice Number', description: 'Unique sequential receipt ID', sample: 'INV-2026-00412' },
  { tag: '{Date_Time}', label: 'Date & Time', description: 'Transaction timestamp', sample: '2026-11-13 19:45' },
  { tag: '{Customer_Name}', label: 'Customer Name', description: 'Selected customer or Walk-in Guest', sample: 'Claire Bennett' },
  { tag: '{Cashier_Name}', label: 'Cashier Name', description: 'Signed-in terminal operator', sample: 'Elena Vance' },
  { tag: '{Payment_Method}', label: 'Payment Method', description: 'CARD, CASH, or SPLIT', sample: 'CARD' },
  { tag: '{Subtotal}', label: 'Subtotal', description: 'Pre-tax net line sum', sample: '$194.50' },
  { tag: '{Discount_Amount}', label: 'Discount Amount', description: 'Total applied discount', sample: '$10.00' },
  { tag: '{Tax_Amount}', label: 'Tax Amount', description: 'Computed multi-tier VAT/GST', sample: '$15.56' },
  { tag: '{Total_Amount}', label: 'Total Amount', description: 'Final payable grand total', sample: '$200.06' },
];

export interface PaperPresetSpec {
  documentType: DocumentType;
  label: string;
  shortLabel: string;
  widthMm: number;
  heightMm: number;
  defaultSnapMm: number;
  pxPerMm: number;
  printerPaperWidth: 'A4' | '80mm' | '58mm';
}

export const PAPER_PRESETS: Record<DocumentType, PaperPresetSpec> = {
  A4_INVOICE: {
    documentType: 'A4_INVOICE',
    label: 'A4 Invoice (PDF)',
    shortLabel: 'A4 Invoice',
    widthMm: 210,
    heightMm: 297,
    defaultSnapMm: 5,
    pxPerMm: 3.1,
    printerPaperWidth: 'A4',
  },
  THERMAL_80MM: {
    documentType: 'THERMAL_80MM',
    label: '80mm Thermal Receipt',
    shortLabel: '80mm Thermal',
    widthMm: 80,
    heightMm: 210,
    defaultSnapMm: 2,
    pxPerMm: 4.5,
    printerPaperWidth: '80mm',
  },
  THERMAL_58MM: {
    documentType: 'THERMAL_58MM',
    label: '58mm Thermal Receipt',
    shortLabel: '58mm Thermal',
    widthMm: 58,
    heightMm: 190,
    defaultSnapMm: 2,
    pxPerMm: 5.0,
    printerPaperWidth: '58mm',
  },
};

export const SAMPLE_ITEMS_SHORT: PrintLineItem[] = [
  { sku: 'ZP-KNIT-001', name: 'Merino Crewneck Sweater', qty: 1, unitPrice: 120, lineTotal: 120 },
  { sku: 'ZP-LIN-002', name: 'Relaxed Linen Overshirt', qty: 2, unitPrice: 68, lineTotal: 136 },
  { sku: 'ZP-ACC-010', name: 'Silk Twill Neckerchief', qty: 1, unitPrice: 45, lineTotal: 45 },
];

export const SAMPLE_ITEMS_EXPANDED_10: PrintLineItem[] = [
  { sku: 'ZP-KNIT-001', name: 'Merino Crewneck Sweater', qty: 1, unitPrice: 120, lineTotal: 120 },
  { sku: 'ZP-LIN-002', name: 'Relaxed Linen Overshirt', qty: 2, unitPrice: 68, lineTotal: 136 },
  { sku: 'ZP-ACC-010', name: 'Silk Twill Neckerchief', qty: 1, unitPrice: 45, lineTotal: 45 },
  { sku: 'ZP-CAP-012', name: 'Brushed Wool Cap', qty: 1, unitPrice: 34.2, lineTotal: 34.2 },
  { sku: 'ZP-JKT-011', name: 'Cropped Utility Jacket', qty: 1, unitPrice: 117, lineTotal: 117 },
  { sku: 'ZP-TOT-009', name: 'Pebbled Leather Tote', qty: 1, unitPrice: 126, lineTotal: 126 },
  { sku: 'ZP-SHT-005', name: 'Pleated Resort Shirt', qty: 1, unitPrice: 68, lineTotal: 68 },
  { sku: 'ZP-LNS-002', name: 'Relaxed Fit Linen Shorts', qty: 2, unitPrice: 57.5, lineTotal: 115 },
  { sku: 'ZP-TRN-007', name: 'Ribbed Turtleneck Top', qty: 1, unitPrice: 76.5, lineTotal: 76.5 },
  { sku: 'ZP-BLT-014', name: 'Braided Suede Belt', qty: 1, unitPrice: 42, lineTotal: 42 },
];

export function createDefaultStyle(overrides?: Partial<BlockStyle>): BlockStyle {
  return {
    fontSizePt: 10,
    bold: false,
    align: 'left',
    borderWidth: 0,
    borderColor: '#CBD5E1',
    backgroundColor: 'transparent',
    color: '#111315',
    paddingMm: 1,
    ...overrides,
  };
}

export function createStarterSchema(docType: DocumentType): CanvasSchema {
  const width = PAPER_PRESETS[docType].widthMm;
  const margin = docType === 'A4_INVOICE' ? 15 : 4;
  const contentW = width - margin * 2;
  return {
    version: 1,
    snap_to_grid: true,
    show_guides: true,
    blocks: [
      {
        id: `blk-title-${docType.toLowerCase()}`,
        type: 'variable',
        label: 'Business Name',
        x_mm: margin,
        y_mm: docType === 'A4_INVOICE' ? 14 : 6,
        width_mm: contentW,
        height_mm: 9,
        content: '{Business_Name}',
        style: createDefaultStyle({
          fontSizePt: docType === 'A4_INVOICE' ? 16 : 12,
          bold: true,
          align: docType === 'A4_INVOICE' ? 'left' : 'center',
          paddingMm: 0,
        }),
      },
      {
        id: `blk-meta-${docType.toLowerCase()}`,
        type: 'variable',
        label: 'Invoice Info',
        x_mm: margin,
        y_mm: docType === 'A4_INVOICE' ? 25 : 17,
        width_mm: contentW,
        height_mm: 12,
        content: 'Invoice: {Invoice_Number}\nCustomer: {Customer_Name} · {Date_Time}',
        style: createDefaultStyle({
          fontSizePt: docType === 'A4_INVOICE' ? 9.5 : 8,
          align: docType === 'A4_INVOICE' ? 'left' : 'center',
          paddingMm: 0.5,
        }),
      },
      {
        id: `blk-table-${docType.toLowerCase()}`,
        type: 'item_table',
        label: 'Item Grid',
        x_mm: margin,
        y_mm: docType === 'A4_INVOICE' ? 42 : 33,
        width_mm: contentW,
        height_mm: 48,
        content: 'Dynamic Line Items',
        columns: docType === 'A4_INVOICE' ? ['item', 'qty', 'price', 'total'] : ['item', 'qty', 'total'],
        showHeader: true,
        rowHeightMm: docType === 'A4_INVOICE' ? 7.5 : 6.2,
        style: createDefaultStyle({
          fontSizePt: docType === 'A4_INVOICE' ? 9.5 : 8,
          borderWidth: 1,
          backgroundColor: '#FFFFFF',
          paddingMm: 1.2,
        }),
      },
      {
        id: `blk-total-${docType.toLowerCase()}`,
        type: 'variable',
        label: 'Grand Total',
        x_mm: margin,
        y_mm: docType === 'A4_INVOICE' ? 98 : 88,
        width_mm: contentW,
        height_mm: 11,
        content: 'TOTAL: {Total_Amount}',
        style: createDefaultStyle({
          fontSizePt: docType === 'A4_INVOICE' ? 13 : 11,
          bold: true,
          align: 'right',
          borderWidth: 1,
          borderColor: '#877FC1',
          backgroundColor: '#F4F2FF',
          paddingMm: 1.5,
        }),
      },
    ],
  };
}

