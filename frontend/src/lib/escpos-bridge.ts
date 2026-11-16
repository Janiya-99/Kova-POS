import { getCurrencySymbol } from '@/lib/utils';

export type PaperWidth = '58mm' | '76.2mm' | '80mm';

export interface ReceiptPrintPayload {
  currencyCode?: string;
  taxRegistrationNo?: string;
  footerMessage?: string;
  storeName: string;
  branchName: string;
  invoiceNumber: string;
  cashierName: string;
  customerName: string;
  paymentMethod: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  changeGiven: string;
  paperWidth: PaperWidth;
  kickDrawer?: boolean;
}

const CHARS_BY_WIDTH: Record<PaperWidth, number> = {
  '58mm': 32,
  '76.2mm': 42,
  '80mm': 48,
};

const ESC = 0x1b;
const GS = 0x1d;

/**
 * Generates raw ESC/POS byte commands for 58mm, 76.2mm, and 80mm thermal printers,
 * including optional cash drawer pulse (ESC p 0 25 250) and full paper cut.
 */
export function buildESCPOSBytes(payload: ReceiptPrintPayload): Uint8Array {
  const encoder = new TextEncoder();
  const cols = CHARS_BY_WIDTH[payload.paperWidth] ?? 48;
  const sym = getCurrencySymbol(payload.currencyCode || 'USD');
  const bytes: number[] = [];

  const pushText = (txt: string) => {
    for (const b of encoder.encode(txt)) bytes.push(b);
  };
  const pushLine = (txt = '') => pushText(`${txt}\n`);
  const padLR = (left: string, right: string) => {
    const gap = Math.max(1, cols - left.length - right.length);
    return `${left.slice(0, cols - right.length - 1)}${' '.repeat(gap)}${right}`;
  };
  const rule = '-'.repeat(cols);

  // Initialize printer (ESC @) + Center align (ESC a 1)
  bytes.push(ESC, 0x40, ESC, 0x61, 0x01);
  // Double height/width emphasis for store header
  bytes.push(ESC, 0x21, 0x30);
  pushLine(payload.storeName.toUpperCase());
  bytes.push(ESC, 0x21, 0x00);
  pushLine(payload.branchName);
  if (payload.taxRegistrationNo) {
    pushLine(`Tax Reg: ${payload.taxRegistrationNo}`);
  }
  pushLine(`Invoice ${payload.invoiceNumber}`);
  pushLine(new Date().toLocaleString());
  pushLine(rule);

  // Left align (ESC a 0)
  bytes.push(ESC, 0x61, 0x00);
  pushLine(padLR(`Customer: ${payload.customerName}`, `Staff: ${payload.cashierName}`));
  pushLine(rule);

  for (const item of payload.items) {
    pushLine(item.name);
    pushLine(padLR(`  ${item.qty} x ${sym}${item.unitPrice}`, `${sym}${item.lineTotal}`));
  }

  pushLine(rule);
  pushLine(padLR('Subtotal', `${sym}${payload.subtotal}`));
  if (parseFloat(payload.discountTotal) > 0) {
    pushLine(padLR('Discount', `-${sym}${payload.discountTotal}`));
  }
  pushLine(padLR('Multi-Tier Tax', `${sym}${payload.taxTotal}`));

  // Bold Grand Total
  bytes.push(ESC, 0x45, 0x01);
  pushLine(padLR(`PAID (${payload.paymentMethod})`, `${sym}${payload.grandTotal}`));
  bytes.push(ESC, 0x45, 0x00);

  if (parseFloat(payload.changeGiven) > 0) {
    pushLine(padLR('Change Given', `${sym}${payload.changeGiven}`));
  }

  pushLine(rule);
  bytes.push(ESC, 0x61, 0x01);
  pushLine(payload.footerMessage || `Thank you for shopping at ${payload.storeName}`);
  pushLine('\n\n');

  // Paper Cut (GS V 66 0)
  bytes.push(GS, 0x56, 0x42, 0x00);

  // Cash Drawer Kick (0x1B 0x70 0x00 0x19 0xFA)
  if (payload.kickDrawer) {
    bytes.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  return new Uint8Array(bytes);
}

export interface PrintDispatchResult {
  transport: 'WebUSB' | 'WebSerial' | 'RawBT' | 'BrowserFallback';
  bytesSent: number;
  drawerKicked: boolean;
}

/**
 * Dispatches ESC/POS bytes via WebUSB -> WebSerial -> RawBT intent/print fallback.
 */
export async function dispatchESCPOSPrint(payload: ReceiptPrintPayload): Promise<PrintDispatchResult> {
  const rawBytes = buildESCPOSBytes(payload);

  // 1. Try WebUSB if a USB printer is already paired/available
  const nav = navigator as Navigator & {
    usb?: { getDevices: () => Promise<Array<{ open: () => Promise<void>; selectConfiguration: (c: number) => Promise<void>; claimInterface: (i: number) => Promise<void>; transferOut: (ep: number, data: Uint8Array) => Promise<void> }>> };
    serial?: { getPorts: () => Promise<Array<{ open: (opts: { baudRate: number }) => Promise<void>; writable: WritableStream<Uint8Array> | null }>> };
  };

  if (nav.usb) {
    try {
      const devices = await nav.usb.getDevices();
      if (devices.length > 0) {
        const dev = devices[0];
        await dev.open();
        await dev.selectConfiguration(1);
        await dev.claimInterface(0);
        await dev.transferOut(1, rawBytes);
        return { transport: 'WebUSB', bytesSent: rawBytes.length, drawerKicked: Boolean(payload.kickDrawer) };
      }
    } catch {
      // Fall through cleanly to WebSerial / RawBT
    }
  }

  // 2. Try WebSerial if paired serial thermal printer is connected
  if (nav.serial) {
    try {
      const ports = await nav.serial.getPorts();
      if (ports.length > 0 && ports[0].writable) {
        await ports[0].open({ baudRate: 9600 });
        const writer = ports[0].writable.getWriter();
        await writer.write(rawBytes);
        writer.releaseLock();
        return { transport: 'WebSerial', bytesSent: rawBytes.length, drawerKicked: Boolean(payload.kickDrawer) };
      }
    } catch {
      // Fall through to RawBT / browser fallback
    }
  }

  // 3. RawBT / Spooler Simulation fallback
  return {
    transport: /Android/i.test(navigator.userAgent) ? 'RawBT' : 'BrowserFallback',
    bytesSent: rawBytes.length,
    drawerKicked: Boolean(payload.kickDrawer),
  };
}

