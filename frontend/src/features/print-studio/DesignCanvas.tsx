import * as React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Rnd } from 'react-rnd';
import QRCode from 'qrcode';
import {
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Rows3,
  Ruler,
  Trash2,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  CompiledBlock,
  compileSceneGraphLayout,
  resolveDynamicTags,
} from '@/features/print-studio/engine/templateCompiler';
import {
  CanvasBlock,
  CanvasSchema,
  DocumentType,
  PAPER_PRESETS,
  PrintDataContext,
  TableColumnKey,
} from '@/features/print-studio/types';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

export interface AlignmentGuides {
  verticalMm: number[];
  horizontalMm: number[];
}

function QrPreviewImage({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value || 'INV-PREVIEW', {
      width: 180,
      margin: 1,
      color: { dark: '#111315', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUrl) {
    return (
      <div className="h-full w-full flex items-center justify-center border border-dashed border-slate-300 text-[9px] text-slate-400">
        QR
      </div>
    );
  }
  return <img src={dataUrl} alt="QR Code Preview" className="h-full w-full object-contain pointer-events-none" />;
}

function renderPaperBlockInner(
  blk: CompiledBlock,
  scale: number,
  dataContext: PrintDataContext
) {
  const paddingPx = Math.max(0, Number(blk.style?.paddingMm ?? 1) * scale);
  const ptToPx = 0.352778 * scale;
  const fontSizePx = Math.max(8, Number(blk.style?.fontSizePt ?? 10) * ptToPx);

  if (blk.type === 'text' || blk.type === 'variable') {
    return (
      <div
        style={{
          padding: `${paddingPx}px`,
          fontSize: `${fontSizePx}px`,
          fontWeight: blk.style.bold ? 700 : 400,
          textAlign: blk.style.align || 'left',
          color: blk.style.color || '#111315',
          lineHeight: 1.28,
        }}
        className="w-full h-full overflow-hidden whitespace-pre-wrap break-words select-none"
      >
        {blk.resolvedText}
      </div>
    );
  }

  if (blk.type === 'image') {
    const resolvedSrc = resolveDynamicTags(blk.content, dataContext, { htmlEscape: false });
    if (resolvedSrc) {
      return (
        <div style={{ padding: `${paddingPx}px` }} className="w-full h-full flex items-center justify-center overflow-hidden">
          <img
            src={resolvedSrc}
            alt={blk.label}
            className="max-h-full max-w-full object-contain pointer-events-none"
          />
        </div>
      );
    }
    return (
      <div className="w-full h-full border border-dashed border-slate-300 bg-slate-50/80 flex flex-col items-center justify-center text-slate-400 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider">{dataContext.businessName || 'LOGO'}</span>
        <span className="text-[8.5px]">Logo Slot</span>
      </div>
    );
  }

  if (blk.type === 'qr_code') {
    const qrPayload = resolveDynamicTags(blk.content || '{Invoice_Number}', dataContext, { htmlEscape: false });
    return (
      <div style={{ padding: `${paddingPx}px` }} className="w-full h-full flex items-center justify-center bg-white">
        <QrPreviewImage value={qrPayload} />
      </div>
    );
  }

  if (blk.type === 'item_table') {
    const cols: TableColumnKey[] =
      blk.columns && blk.columns.length > 0 ? blk.columns : ['item', 'qty', 'total'];
    const rowHpx = Math.max(16, Number(blk.rowHeightMm || 7) * scale);
    const colTitle: Record<TableColumnKey, string> = {
      item: 'Item',
      qty: 'Qty',
      price: 'Price',
      total: 'Amount',
    };

    return (
      <div
        style={{ padding: `${paddingPx}px`, fontSize: `${Math.max(7.5, fontSizePx * 0.92)}px` }}
        className="w-full h-full overflow-hidden bg-white select-none tabular-nums"
      >
        {blk.showHeader !== false && (
          <div
            style={{ height: `${rowHpx}px` }}
            className="grid grid-cols-12 items-center bg-[#222026] text-white font-bold px-1.5 rounded-t-[3px]"
          >
            {cols.map((c) => (
              <span
                key={c}
                className={cn(
                  'truncate',
                  c === 'item'
                    ? cols.includes('price')
                      ? 'col-span-5 text-left'
                      : 'col-span-7 text-left'
                    : c === 'qty'
                      ? 'col-span-2 text-right'
                      : c === 'price'
                        ? 'col-span-2 text-right'
                        : cols.includes('price')
                          ? 'col-span-3 text-right'
                          : 'col-span-3 text-right'
                )}
              >
                {colTitle[c]}
              </span>
            ))}
          </div>
        )}
        <div>
          {dataContext.items.map((item, idx) => (
            <div
              key={`${item.name}-${idx}`}
              style={{ height: `${rowHpx}px` }}
              className={cn(
                'grid grid-cols-12 items-center px-1.5 border-b border-slate-200/80 text-[#111315]',
                idx % 2 === 1 && 'bg-slate-50/80'
              )}
            >
              {cols.map((c) => {
                let text = '';
                if (c === 'item') text = item.name;
                else if (c === 'qty') text = String(item.qty);
                else if (c === 'price') text = formatCurrency(item.unitPrice, dataContext.currencyCode);
                else if (c === 'total') text = formatCurrency(item.lineTotal, dataContext.currencyCode);

                return (
                  <span
                    key={c}
                    className={cn(
                      'truncate',
                      c === 'item'
                        ? cols.includes('price')
                          ? 'col-span-5 text-left font-medium'
                          : 'col-span-7 text-left font-medium'
                        : c === 'qty'
                          ? 'col-span-2 text-right'
                          : c === 'price'
                            ? 'col-span-2 text-right'
                            : 'col-span-3 text-right font-semibold'
                    )}
                  >
                    {text}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

export interface DesignCanvasProps {
  canManage: boolean;
  documentType: DocumentType;
  paperWidthMm: number;
  paperHeightMm: number;
  snapGridMm: number;
  canvasSchema: CanvasSchema;
  selectedBlockId: string | null;
  dataContext: PrintDataContext;
  testTenItems: boolean;
  paperElementRef: React.RefObject<HTMLDivElement | null>;
  onSwitchDocumentType: (docType: DocumentType) => void;
  onToggleSnapGrid: (snap: boolean) => void;
  onToggleTestTenItems: (enabled: boolean) => void;
  onSelectBlock: (blockId: string | null) => void;
  onUpdateBlockGeometry: (blockId: string, xMm: number, yMm: number, wMm: number, hMm: number) => void;
  onDeleteBlock: (blockId: string) => void;
  className?: string;
}

/**
 * Center Panel (#F5F6FA) Physical Paper Designer Canvas using shadcn Tabs + react-rnd
 * with grid snapping, live alignment guides, and dynamic 10-row item table preview.
 */
export function DesignCanvas({
  canManage,
  documentType,
  paperWidthMm,
  paperHeightMm,
  snapGridMm,
  canvasSchema,
  selectedBlockId,
  dataContext,
  testTenItems,
  paperElementRef,
  onSwitchDocumentType,
  onToggleSnapGrid,
  onToggleTestTenItems,
  onSelectBlock,
  onUpdateBlockGeometry,
  onDeleteBlock,
  className,
}: DesignCanvasProps) {
  const [zoom, setZoom] = React.useState<number>(1);
  const [guides, setGuides] = React.useState<AlignmentGuides>({ verticalMm: [], horizontalMm: [] });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: 'studio-paper-canvas',
  });

  const setCombinedPaperRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      (paperElementRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [setDropRef, paperElementRef]
  );

  const preset = PAPER_PRESETS[documentType];
  const scale = preset.pxPerMm * zoom;
  const gridPx = Math.max(2, snapGridMm * scale);

  const compiled = React.useMemo(
    () => compileSceneGraphLayout(canvasSchema, paperWidthMm, paperHeightMm, dataContext),
    [canvasSchema, paperWidthMm, paperHeightMm, dataContext]
  );

  const paperWidthPx = Math.round(compiled.paperWidthMm * scale);
  const paperHeightPx = Math.round(compiled.paperHeightMm * scale);

  const computeAlignmentGuides = React.useCallback(
    (activeId: string, candidateXmm: number, candidateYmm: number, wMm: number, hMm: number) => {
      if (!canvasSchema.show_guides) {
        setGuides({ verticalMm: [], horizontalMm: [] });
        return { snapX: candidateXmm, snapY: candidateYmm };
      }

      const toleranceMm = 1.6;
      let snapX = candidateXmm;
      let snapY = candidateYmm;
      const verticalMm: number[] = [];
      const horizontalMm: number[] = [];

      const pageCenterX = paperWidthMm / 2;
      const candCenterX = candidateXmm + wMm / 2;
      if (Math.abs(candCenterX - pageCenterX) <= toleranceMm) {
        snapX = Number((pageCenterX - wMm / 2).toFixed(2));
        verticalMm.push(pageCenterX);
      }

      for (const sib of compiled.blocks) {
        if (sib.id === activeId) continue;
        // Left edge align
        if (Math.abs(candidateXmm - sib.x_mm) <= toleranceMm) {
          snapX = sib.x_mm;
          verticalMm.push(sib.x_mm);
        }
        // Center X align
        const sibCenterX = sib.x_mm + sib.width_mm / 2;
        if (Math.abs(candCenterX - sibCenterX) <= toleranceMm) {
          snapX = Number((sibCenterX - wMm / 2).toFixed(2));
          verticalMm.push(sibCenterX);
        }
        // Right edge align
        const sibRight = sib.x_mm + sib.width_mm;
        if (Math.abs(candidateXmm + wMm - sibRight) <= toleranceMm) {
          snapX = Number((sibRight - wMm).toFixed(2));
          verticalMm.push(sibRight);
        }
        // Top Y align
        if (Math.abs(candidateYmm - sib.compiledYmm) <= toleranceMm) {
          snapY = sib.compiledYmm;
          horizontalMm.push(sib.compiledYmm);
        }
        // Bottom Y align
        const sibBottom = sib.compiledYmm + sib.compiledHeightMm;
        if (Math.abs(candidateYmm + hMm - sibBottom) <= toleranceMm) {
          snapY = Number((sibBottom - hMm).toFixed(2));
          horizontalMm.push(sibBottom);
        }
      }

      setGuides({
        verticalMm: Array.from(new Set(verticalMm)),
        horizontalMm: Array.from(new Set(horizontalMm)),
      });
      return { snapX, snapY };
    },
    [canvasSchema.show_guides, compiled.blocks, paperWidthMm]
  );

  const snapValue = React.useCallback(
    (mm: number): number => {
      if (!canvasSchema.snap_to_grid) return Number(mm.toFixed(1));
      return Number((Math.round(mm / snapGridMm) * snapGridMm).toFixed(1));
    },
    [canvasSchema.snap_to_grid, snapGridMm]
  );

  return (
    <section
      data-testid="studio-center-canvas-panel"
      style={{ backgroundColor: '#F5F6FA' }}
      className={cn(
        'flex-1 min-w-0 rounded-[var(--theme-radius-card)] bg-[#F5F6FA] border border-slate-200/90 p-3.5 sm:p-4 flex flex-col justify-between gap-3',
        className
      )}
    >
      {/* Top Paper Format Tabs & Snap Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-white/90 border border-slate-200/80 rounded-2xl px-3 py-2 shadow-xs">
        <Tabs
          value={documentType}
          onValueChange={(val) => onSwitchDocumentType(val as DocumentType)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid grid-cols-3 sm:inline-flex bg-[#F5F6FA] p-1 rounded-xl border border-slate-200/70">
            <TabsTrigger
              value="A4_INVOICE"
              data-testid="canvas-tab-a4"
              className="rounded-lg text-[11.5px] font-semibold text-slate-600 data-[state=active]:bg-[#877FC1] data-[state=active]:text-white px-3"
            >
              A4 Invoice
            </TabsTrigger>
            <TabsTrigger
              value="THERMAL_80MM"
              data-testid="canvas-tab-80mm"
              className="rounded-lg text-[11.5px] font-semibold text-slate-600 data-[state=active]:bg-[#877FC1] data-[state=active]:text-white px-3"
            >
              80mm Thermal
            </TabsTrigger>
            <TabsTrigger
              value="THERMAL_58MM"
              data-testid="canvas-tab-58mm"
              className="rounded-lg text-[11.5px] font-semibold text-slate-600 data-[state=active]:bg-[#877FC1] data-[state=active]:text-white px-3"
            >
              58mm Thermal
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-3 text-[11.5px]">
          <label className="inline-flex items-center gap-1.5 text-[#111315] font-medium cursor-pointer">
            <Grid3X3 className="h-3.5 w-3.5 text-[#877FC1]" />
            <span>Snap ({snapGridMm}mm)</span>
            <Switch
              data-testid="toggle-snap-grid"
              checked={canvasSchema.snap_to_grid}
              onCheckedChange={onToggleSnapGrid}
            />
          </label>

          <label className="inline-flex items-center gap-1.5 text-[#111315] font-medium cursor-pointer">
            <Rows3 className="h-3.5 w-3.5 text-[#877FC1]" />
            <span>10-Item Expansion</span>
            <Switch
              data-testid="toggle-ten-items-preview"
              checked={testTenItems}
              onCheckedChange={onToggleTestTenItems}
            />
          </label>

          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-[#F5F6FA] px-1.5 py-0.5 tabular-nums">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-[#111315] cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="px-1 text-[11px] font-semibold text-[#111315] min-w-[40px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
              className="p-1 text-slate-600 hover:text-[#111315] cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Physical Paper Scroll Stage */}
      <div
        onClick={() => onSelectBlock(null)}
        className="flex-1 min-h-[560px] max-h-[760px] overflow-auto p-3 sm:p-6"
      >
        <div
          ref={setCombinedPaperRef}
          data-testid="studio-physical-paper"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: `${paperWidthPx}px`,
            height: `${paperHeightPx}px`,
            minWidth: `${paperWidthPx}px`,
            backgroundImage: canvasSchema.snap_to_grid
              ? `radial-gradient(circle, rgba(135,127,193,0.28) 1px, transparent 1px)`
              : undefined,
            backgroundSize: canvasSchema.snap_to_grid ? `${gridPx}px ${gridPx}px` : undefined,
          }}
          className={cn(
            'relative mx-auto bg-white rounded-sm shadow-[0_14px_40px_rgba(17,19,21,0.11)] border transition-shadow shrink-0',
            isOver ? 'border-[#877FC1] ring-4 ring-[#877FC1]/20' : 'border-slate-300/90'
          )}
        >
          {/* Auto-Alignment Center & Sibling Guide Hairlines */}
          {guides.verticalMm.map((vx) => (
            <div
              key={`v-${vx}`}
              style={{ left: `${vx * scale}px` }}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-[#877FC1] z-40"
            />
          ))}
          {guides.horizontalMm.map((hy) => (
            <div
              key={`h-${hy}`}
              style={{ top: `${hy * scale}px` }}
              className="pointer-events-none absolute left-0 right-0 h-px bg-[#877FC1] z-40"
            />
          ))}

          {/* Draggable / Resizable RND Scene-Graph Blocks */}
          {compiled.blocks.map((blk) => {
            const isSelected = blk.id === selectedBlockId;
            const flowOffsetMm = blk.compiledYmm - blk.y_mm;
            const widthPx = Math.max(24, blk.width_mm * scale);
            const heightPx = Math.max(18, blk.compiledHeightMm * scale);
            const posX = blk.x_mm * scale;
            const posY = blk.compiledYmm * scale;

            return (
              <Rnd
                key={blk.id}
                size={{ width: widthPx, height: heightPx }}
                position={{ x: posX, y: posY }}
                bounds="parent"
                disableDragging={!canManage}
                enableResizing={canManage && isSelected}
                dragGrid={canvasSchema.snap_to_grid ? [gridPx, gridPx] : undefined}
                resizeGrid={canvasSchema.snap_to_grid ? [gridPx, gridPx] : undefined}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectBlock(blk.id);
                }}
                onDragStart={() => onSelectBlock(blk.id)}
                onDrag={(_e, d) => {
                  const candX = d.x / scale;
                  const candY = d.y / scale;
                  computeAlignmentGuides(blk.id, candX, candY, blk.width_mm, blk.compiledHeightMm);
                }}
                onDragStop={(_e, d) => {
                  const candX = snapValue(d.x / scale);
                  const candY = d.y / scale;
                  const { snapX, snapY } = computeAlignmentGuides(
                    blk.id,
                    candX,
                    candY,
                    blk.width_mm,
                    blk.compiledHeightMm
                  );
                  setGuides({ verticalMm: [], horizontalMm: [] });
                  const finalBaseY = Math.max(0, Number((snapY - flowOffsetMm).toFixed(1)));
                  onUpdateBlockGeometry(blk.id, snapX, finalBaseY, blk.width_mm, blk.height_mm);
                }}
                onResizeStop={(_e, _dir, ref, _delta, position) => {
                  const nextW = Math.max(8, snapValue(ref.offsetWidth / scale));
                  const nextH = Math.max(5, snapValue(ref.offsetHeight / scale));
                  const nextX = Math.max(0, snapValue(position.x / scale));
                  const nextY = Math.max(0, snapValue(position.y / scale - flowOffsetMm));
                  onUpdateBlockGeometry(blk.id, nextX, nextY, nextW, nextH);
                }}
                data-testid={`canvas-block-${blk.id}`}
                style={{
                  backgroundColor: blk.style.backgroundColor || 'transparent',
                  border:
                    blk.style.borderWidth > 0
                      ? `${blk.style.borderWidth}px solid ${blk.style.borderColor || '#CBD5E1'}`
                      : undefined,
                  zIndex: isSelected ? 30 : 10,
                }}
                className={cn(
                  'group transition-[box-shadow] cursor-move rounded-[3px]',
                  isSelected
                    ? 'ring-2 ring-[#877FC1] shadow-md'
                    : 'hover:ring-1 hover:ring-[#877FC1]/60'
                )}
              >
                {renderPaperBlockInner(blk, scale, dataContext)}

                {isSelected && canManage && (
                  <div className="absolute -top-6 right-0 flex items-center gap-1 rounded-md bg-[#222026] text-white px-1.5 py-0.5 text-[9.5px] font-semibold shadow-sm">
                    <span>
                      {blk.x_mm},{blk.y_mm}mm
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBlock(blk.id);
                      }}
                      className="text-red-300 hover:text-red-200 cursor-pointer ml-1"
                      title="Delete selected block"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </Rnd>
            );
          })}
        </div>
      </div>

      {/* Bottom Metric Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 px-1 tabular-nums">
        <span className="inline-flex items-center gap-1.5 font-medium text-[#111315]">
          <Ruler className="h-3.5 w-3.5 text-[#877FC1]" />
          Paper Bounds: {compiled.paperWidthMm} × {compiled.paperHeightMm} mm
          {compiled.tableExpansionDeltaMm > 0 && (
            <span className="ml-1 rounded-full bg-[#877FC1]/15 text-[#695FB0] px-2 py-0.5 text-[10px] font-bold">
              +{compiled.tableExpansionDeltaMm}mm Expanded ({dataContext.items.length} items)
            </span>
          )}
        </span>
        <span>
          {compiled.blocks.length} canvas block{compiled.blocks.length === 1 ? '' : 's'} · Vector PDF & ESC/POS Ready
        </span>
      </div>
    </section>
  );
}

