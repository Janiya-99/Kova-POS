import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { formatCurrency } from '@/lib/currency';
import { compileSceneGraphLayout, resolveDynamicTags } from '@/features/print-studio/engine/templateCompiler';
import { PrintDataContext, PrintTemplateRecord, TableColumnKey } from '@/features/print-studio/types';

export interface GeneratedPDFResult {
  filename: string;
  pageCount: number;
  blob: Blob;
  blobUrl: string;
  download: () => void;
}

function parseHexColor(hex: string, fallback: [number, number, number] = [17, 19, 21]): [number, number, number] {
  const clean = String(hex || '').replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return [
      Number.parseInt(clean.slice(0, 2), 16),
      Number.parseInt(clean.slice(2, 4), 16),
      Number.parseInt(clean.slice(4, 6), 16),
    ];
  }
  return fallback;
}

async function rasterizeImageToPngDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:image/png;base64,') || src.startsWith('data:image/jpeg;base64,')) {
    return src;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = Math.max(64, Math.min(600, img.naturalWidth || 240));
        const h = Math.max(32, Math.min(400, img.naturalHeight || 120));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getColumnHeaders(columns: TableColumnKey[]): Record<TableColumnKey, { label: string; ratio: number; align: 'left' | 'right' }> {
  const hasPrice = columns.includes('price');
  return {
    item: { label: 'Item / Description', ratio: hasPrice ? 0.5 : 0.62, align: 'left' },
    qty: { label: 'Qty', ratio: 0.14, align: 'right' },
    price: { label: 'Unit', ratio: 0.18, align: 'right' },
    total: { label: 'Amount', ratio: hasPrice ? 0.18 : 0.24, align: 'right' },
  };
}

/**
 * Generates a high-precision vector PDF directly from the Print Studio scene graph (millimeters)
 * using jsPDF, avoiding CSS oklch/Tailwind screenshot bugs while expanding multi-row item tables.
 */
export async function generateTemplateVectorPDF(
  template: PrintTemplateRecord,
  data: PrintDataContext,
  customFilename?: string
): Promise<GeneratedPDFResult> {
  const widthMm = Math.max(48, Number(template.paper_width_mm || 210));
  const baseHeightMm = Math.max(80, Number(template.paper_height_mm || 297));
  const compiled = compileSceneGraphLayout(template.canvas_schema, widthMm, baseHeightMm, data);

  const pageHeightMm = template.document_type === 'A4_INVOICE' ? Math.max(297, baseHeightMm) : compiled.paperHeightMm;

  const doc = new jsPDF({
    orientation: widthMm > pageHeightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [widthMm, template.document_type === 'A4_INVOICE' ? 297 : compiled.paperHeightMm],
    compress: true,
  });

  // Helper to paginate if an A4 invoice has 25+ dynamic rows exceeding 297mm
  const mapPageAndY = (globalY: number): { pageIndex: number; localY: number } => {
    if (template.document_type !== 'A4_INVOICE') {
      return { pageIndex: 1, localY: globalY };
    }
    const usableH = 282;
    const pageIndex = Math.floor(Math.max(0, globalY - 8) / usableH) + 1;
    const localY = 10 + (Math.max(0, globalY - 8) % usableH);
    return { pageIndex, localY };
  };

  const ensurePage = (targetPage: number) => {
    while (doc.getNumberOfPages() < targetPage) {
      doc.addPage([widthMm, pageHeightMm], 'portrait');
    }
    doc.setPage(targetPage);
  };

  for (const blk of compiled.blocks) {
    const startPos = mapPageAndY(blk.compiledYmm);
    ensurePage(startPos.pageIndex);

    const padding = Math.max(0, Number(blk.style?.paddingMm ?? 1));
    const borderWidthPt = Number(blk.style?.borderWidth ?? 0);
    const bgHex = blk.style?.backgroundColor || 'transparent';

    if (blk.type !== 'item_table') {
      if (bgHex && bgHex !== 'transparent') {
        const [r, g, b] = parseHexColor(bgHex, [255, 255, 255]);
        doc.setFillColor(r, g, b);
        doc.rect(blk.x_mm, startPos.localY, blk.width_mm, blk.height_mm, 'F');
      }
      if (borderWidthPt > 0) {
        const [br, bg, bb] = parseHexColor(blk.style?.borderColor || '#CBD5E1', [203, 213, 225]);
        doc.setDrawColor(br, bg, bb);
        doc.setLineWidth(Math.min(1.2, borderWidthPt * 0.25));
        doc.rect(blk.x_mm, startPos.localY, blk.width_mm, blk.height_mm, 'S');
      }
    }

    if (blk.type === 'text' || blk.type === 'variable') {
      const fontSize = Math.max(6.5, Number(blk.style?.fontSizePt ?? 10));
      const [tr, tg, tb] = parseHexColor(blk.style?.color || '#111315');
      doc.setTextColor(tr, tg, tb);
      doc.setFont('helvetica', blk.style?.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);

      const align = blk.style?.align || 'left';
      const innerWidth = Math.max(6, blk.width_mm - padding * 2);
      const textX =
        align === 'right'
          ? blk.x_mm + blk.width_mm - padding
          : align === 'center'
            ? blk.x_mm + blk.width_mm / 2
            : blk.x_mm + padding;

      const lines = doc.splitTextToSize(blk.resolvedText || '', innerWidth) as string[];
      const lineStep = fontSize * 0.42;
      lines.forEach((line, idx) => {
        const lineY = startPos.localY + padding + fontSize * 0.35 + idx * lineStep;
        doc.text(line, textX, lineY, { align });
      });
    } else if (blk.type === 'image') {
      const imgSource = resolveDynamicTags(blk.content, data, { htmlEscape: false });
      const pngDataUrl = await rasterizeImageToPngDataUrl(imgSource);
      if (pngDataUrl) {
        try {
          doc.addImage(
            pngDataUrl,
            'PNG',
            blk.x_mm + padding,
            startPos.localY + padding,
            Math.max(4, blk.width_mm - padding * 2),
            Math.max(4, blk.height_mm - padding * 2),
            undefined,
            'FAST'
          );
        } catch {
          // Graceful fallback text badge if image decode fails
          doc.setFontSize(8);
          doc.setTextColor(100, 116, 139);
          doc.text(data.businessName || 'LOGO', blk.x_mm + blk.width_mm / 2, startPos.localY + blk.height_mm / 2, {
            align: 'center',
          });
        }
      } else {
        doc.setDrawColor(203, 213, 225);
        doc.rect(blk.x_mm, startPos.localY, blk.width_mm, blk.height_mm, 'S');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(data.businessName || 'LOGO', blk.x_mm + blk.width_mm / 2, startPos.localY + blk.height_mm / 2 + 1, {
          align: 'center',
        });
      }
    } else if (blk.type === 'qr_code') {
      const payload = resolveDynamicTags(blk.content || '{Invoice_Number}', data, { htmlEscape: false }) || 'INV-PREVIEW';
      try {
        const qrDataUrl = await QRCode.toDataURL(payload, {
          width: 240,
          margin: 1,
          color: { dark: '#111315', light: '#FFFFFF' },
        });
        const side = Math.min(blk.width_mm, blk.height_mm) - padding * 2;
        const qrX = blk.x_mm + (blk.width_mm - side) / 2;
        doc.addImage(qrDataUrl, 'PNG', qrX, startPos.localY + padding, Math.max(8, side), Math.max(8, side));
      } catch {
        // Fallback rect
        doc.rect(blk.x_mm, startPos.localY, blk.width_mm, blk.height_mm, 'S');
      }
    } else if (blk.type === 'item_table') {
      const columns = (blk.columns && blk.columns.length > 0 ? blk.columns : ['item', 'qty', 'price', 'total']) as TableColumnKey[];
      const headers = getColumnHeaders(columns);
      const totalRatio = columns.reduce((acc, c) => acc + headers[c].ratio, 0);
      const rowH = Math.max(5, Number(blk.rowHeightMm || 7));
      const fontSize = Math.max(7, Number(blk.style?.fontSizePt ?? 9));

      let cursorGlobalY = blk.compiledYmm;

      if (blk.showHeader !== false) {
        const hp = mapPageAndY(cursorGlobalY);
        ensurePage(hp.pageIndex);
        doc.setFillColor(34, 32, 38);
        doc.rect(blk.x_mm, hp.localY, blk.width_mm, rowH, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(fontSize);
        doc.setTextColor(255, 255, 255);

        let colX = blk.x_mm;
        for (const colKey of columns) {
          const colSpec = headers[colKey];
          const colW = (blk.width_mm * colSpec.ratio) / totalRatio;
          const tx = colSpec.align === 'right' ? colX + colW - 1.8 : colX + 1.8;
          doc.text(colSpec.label, tx, hp.localY + rowH * 0.65, { align: colSpec.align });
          colX += colW;
        }
        cursorGlobalY += rowH + 0.5;
      }

      data.items.forEach((item, idx) => {
        const rp = mapPageAndY(cursorGlobalY);
        ensurePage(rp.pageIndex);
        if (idx % 2 === 1) {
          doc.setFillColor(248, 250, 252);
          doc.rect(blk.x_mm, rp.localY, blk.width_mm, rowH, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.2);
        doc.line(blk.x_mm, rp.localY + rowH, blk.x_mm + blk.width_mm, rp.localY + rowH);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(17, 19, 21);

        let colX = blk.x_mm;
        for (const colKey of columns) {
          const colSpec = headers[colKey];
          const colW = (blk.width_mm * colSpec.ratio) / totalRatio;
          const tx = colSpec.align === 'right' ? colX + colW - 1.8 : colX + 1.8;
          let cellVal = '';
          if (colKey === 'item') cellVal = item.name;
          else if (colKey === 'qty') cellVal = String(item.qty);
          else if (colKey === 'price') cellVal = formatCurrency(item.unitPrice, data.currencyCode);
          else if (colKey === 'total') cellVal = formatCurrency(item.lineTotal, data.currencyCode);

          const truncated = doc.splitTextToSize(cellVal, Math.max(6, colW - 3))[0] || cellVal;
          doc.text(truncated, tx, rp.localY + rowH * 0.64, { align: colSpec.align });
          colX += colW;
        }
        cursorGlobalY += rowH;
      });
    }
  }

  const cleanInvoice =
    (data.invoiceNumber || 'Invoice')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '') || 'Invoice';
  const filename = customFilename || `${cleanInvoice}-${template.document_type.toLowerCase()}.pdf`;
  const blob = doc.output('blob');
  const blobUrl = URL.createObjectURL(blob);

  return {
    filename,
    pageCount: doc.getNumberOfPages(),
    blob,
    blobUrl,
    download: () => doc.save(filename),
  };
}

