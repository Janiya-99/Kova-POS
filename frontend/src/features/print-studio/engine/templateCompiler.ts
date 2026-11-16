import { formatCurrency } from '@/lib/currency';
import {
  CanvasBlock,
  CanvasSchema,
  PrintDataContext,
} from '@/features/print-studio/types';

export interface CompiledBlock extends CanvasBlock {
  compiledYmm: number;
  compiledHeightMm: number;
  resolvedText: string;
}

export interface CompiledSceneLayout {
  blocks: CompiledBlock[];
  paperWidthMm: number;
  paperHeightMm: number;
  tableExpansionDeltaMm: number;
}

/**
 * Escapes arbitrary strings before HTML injection/preview while keeping plain-text fidelity cleanly separated.
 */
export function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolves dynamic tags like {Invoice_Number}, {Total_Amount}, {Customer_Name}, {Tax_Amount}
 * using live currency formatting from src/lib/currency.ts.
 */
export function resolveDynamicTags(
  templateText: string,
  data: PrintDataContext,
  options: { htmlEscape?: boolean } = {}
): string {
  const safeVal = (raw: string): string => (options.htmlEscape ? escapeHtml(raw) : raw);
  const currency = data.currencyCode || 'USD';

  const tokenMap: Record<string, string> = {
    '{Business_Name}': safeVal(data.businessName || 'Retail Store'),
    '{Branch_Name}': safeVal(data.branchName || 'Main Branch'),
    '{Tax_Reg_No}': safeVal(data.taxRegNo || 'N/A'),
    '{Invoice_Number}': safeVal(data.invoiceNumber || 'INV-DRAFT'),
    '{Date_Time}': safeVal(data.dateTime || new Date().toLocaleString()),
    '{Customer_Name}': safeVal(data.customerName || 'Walk-in Guest'),
    '{Cashier_Name}': safeVal(data.cashierName || 'Operator'),
    '{Payment_Method}': safeVal(data.paymentMethod || 'CASH'),
    '{Subtotal}': safeVal(formatCurrency(data.subtotal, currency)),
    '{Discount_Amount}': safeVal(formatCurrency(data.discountTotal, currency)),
    '{Tax_Amount}': safeVal(formatCurrency(data.taxTotal, currency)),
    '{Total_Amount}': safeVal(formatCurrency(data.grandTotal, currency)),
    '{Business_Logo}': safeVal(data.businessLogoUrl || ''),
  };

  let output = String(templateText ?? '');
  for (const [token, value] of Object.entries(tokenMap)) {
    output = output.split(token).join(value);
  }
  return output;
}

/**
 * Compiles the millimeter scene graph dynamically against line-item count:
 * if an item_table expands past its designed height_mm (e.g., 10+ invoice items),
 * all blocks positioned below the table flow downward proportionally without overlap.
 */
export function compileSceneGraphLayout(
  schema: CanvasSchema,
  paperWidthMm: number,
  paperHeightMm: number,
  data: PrintDataContext
): CompiledSceneLayout {
  const rawBlocks = Array.isArray(schema?.blocks) ? schema.blocks : [];
  const sorted = [...rawBlocks].sort((a, b) => a.y_mm - b.y_mm || a.x_mm - b.x_mm);

  let runningShiftMm = 0;
  let tableExpansionDeltaMm = 0;

  const tablesWithOffset: Array<{ originalBottomMm: number; deltaMm: number }> = [];

  // Pass 1: Measure dynamic table heights based on actual line item count
  for (const blk of sorted) {
    if (blk.type === 'item_table') {
      const rowH = Math.max(4.5, Number(blk.rowHeightMm || 7));
      const showHeader = blk.showHeader !== false;
      const paddingMm = Math.max(0, Number(blk.style?.paddingMm ?? 1));
      const itemCount = Math.max(1, data.items.length);
      const naturalHeight = (showHeader ? rowH + 1.5 : 0) + itemCount * rowH + paddingMm * 2;
      const delta = Math.max(0, naturalHeight - blk.height_mm);
      if (delta > 0) {
        tablesWithOffset.push({
          originalBottomMm: blk.y_mm + blk.height_mm,
          deltaMm: delta,
        });
        tableExpansionDeltaMm += delta;
      }
    }
  }

  let maxBottomMm = paperHeightMm;
  const compiledBlocks: CompiledBlock[] = sorted.map((blk) => {
    runningShiftMm = tablesWithOffset
      .filter((t) => blk.y_mm >= t.originalBottomMm - 2.5)
      .reduce((acc, t) => acc + t.deltaMm, 0);

    let compiledHeightMm = blk.height_mm;
    if (blk.type === 'item_table') {
      const rowH = Math.max(4.5, Number(blk.rowHeightMm || 7));
      const showHeader = blk.showHeader !== false;
      const paddingMm = Math.max(0, Number(blk.style?.paddingMm ?? 1));
      const itemCount = Math.max(1, data.items.length);
      const naturalHeight = (showHeader ? rowH + 1.5 : 0) + itemCount * rowH + paddingMm * 2;
      compiledHeightMm = Math.max(blk.height_mm, naturalHeight);
    }

    const compiledYmm = Number((blk.y_mm + runningShiftMm).toFixed(2));
    const blockBottom = compiledYmm + compiledHeightMm;
    if (blockBottom + 10 > maxBottomMm) {
      maxBottomMm = blockBottom + 10;
    }

    return {
      ...blk,
      compiledYmm,
      compiledHeightMm: Number(compiledHeightMm.toFixed(2)),
      resolvedText: resolveDynamicTags(blk.content, data, { htmlEscape: false }),
    };
  });

  return {
    blocks: compiledBlocks,
    paperWidthMm,
    paperHeightMm: Number(Math.max(paperHeightMm, maxBottomMm).toFixed(2)),
    tableExpansionDeltaMm: Number(tableExpansionDeltaMm.toFixed(2)),
  };
}

