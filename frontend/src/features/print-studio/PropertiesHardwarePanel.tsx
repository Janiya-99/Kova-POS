import * as React from 'react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Trash2,
  Copy,
  Usb,
  Cable,
  Printer,
  FileDown,
  CheckCircle2,
  Sliders,
  Cpu,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import {
  CanvasBlock,
  DYNAMIC_VARIABLE_TAGS,
  PrinterProfile,
  TableColumnKey,
} from '@/features/print-studio/types';
import { LocalPrinterDevice } from '@/lib/dexie-db';
import { cn } from '@/lib/utils';

export interface PropertiesHardwarePanelProps {
  canManage: boolean;
  documentType: 'A4_INVOICE' | 'THERMAL_80MM' | 'THERMAL_58MM';
  selectedBlock: CanvasBlock | null;
  paperWidthMm: number;
  printerProfile: PrinterProfile;
  pairedDevices: LocalPrinterDevice[];
  isPairingUsb: boolean;
  isTestingPrint: boolean;
  isExportingPdf: boolean;
  lastHardwareStatus: string | null;
  onUpdateBlock: (blockId: string, updater: (blk: CanvasBlock) => CanvasBlock) => void;
  onDuplicateBlock: (blockId: string) => void;
  onDeleteBlock: (blockId: string) => void;
  onUpdatePrinterProfile: (patch: Partial<PrinterProfile>) => void;
  onPairWebUSB: () => Promise<void>;
  onPairWebSerial: () => Promise<void>;
  onSelectDevice: (device: LocalPrinterDevice) => void;
  onPrintTestPage: () => Promise<void>;
  onDownloadVectorPDF: () => Promise<void>;
  className?: string;
}

const COLOR_SWATCHES = ['#111315', '#334155', '#877FC1', '#0F766E', '#DC2626', '#FFFFFF'];
const BG_SWATCHES = ['transparent', '#FFFFFF', '#F8FAFC', '#F4F2FF', '#ECFDF5'];

/**
 * Right Panel (#222026 Obsidian Sidebar) with Style & Data Properties + Printer Devices Hardware Manager.
 */
export function PropertiesHardwarePanel({
  canManage,
  documentType,
  selectedBlock,
  paperWidthMm,
  printerProfile,
  pairedDevices,
  isPairingUsb,
  isTestingPrint,
  isExportingPdf,
  lastHardwareStatus,
  onUpdateBlock,
  onDuplicateBlock,
  onDeleteBlock,
  onUpdatePrinterProfile,
  onPairWebUSB,
  onPairWebSerial,
  onSelectDevice,
  onPrintTestPage,
  onDownloadVectorPDF,
  className,
}: PropertiesHardwarePanelProps) {
  const [activeTab, setActiveTab] = React.useState<'properties' | 'hardware'>('properties');

  const updateStyle = (patch: Partial<CanvasBlock['style']>) => {
    if (!selectedBlock) return;
    onUpdateBlock(selectedBlock.id, (blk) => ({
      ...blk,
      style: { ...blk.style, ...patch },
    }));
  };

  const toggleTableColumn = (col: TableColumnKey) => {
    if (!selectedBlock) return;
    const current = selectedBlock.columns || ['item', 'qty', 'total'];
    const exists = current.includes(col);
    if (exists && current.length === 1) return;
    const order: TableColumnKey[] = ['item', 'qty', 'price', 'total'];
    const nextSet = exists ? current.filter((c) => c !== col) : [...current, col];
    const sortedNext = order.filter((c) => nextSet.includes(c));
    onUpdateBlock(selectedBlock.id, (blk) => ({
      ...blk,
      columns: sortedNext,
    }));
  };

  return (
    <aside
      data-testid="studio-obsidian-panel"
      style={{ backgroundColor: '#222026' }}
      className={cn(
        'w-full xl:w-[324px] shrink-0 rounded-[var(--theme-radius-card)] bg-[#222026] text-white border border-white/10 shadow-xl p-4 flex flex-col justify-between gap-4',
        className
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'properties' | 'hardware')}
        className="w-full flex flex-col flex-1"
      >
        <TabsList className="grid grid-cols-2 w-full bg-white/8 p-1 rounded-xl border border-white/10">
          <TabsTrigger
            value="properties"
            data-testid="tab-studio-properties"
            className="rounded-lg text-[11.5px] font-semibold text-white/75 data-[state=active]:bg-[#877FC1] data-[state=active]:text-white transition-colors gap-1.5"
          >
            <Sliders className="h-3.5 w-3.5" />
            Properties
          </TabsTrigger>
          <TabsTrigger
            value="hardware"
            data-testid="tab-printer-devices"
            className="rounded-lg text-[11.5px] font-semibold text-white/75 data-[state=active]:bg-[#877FC1] data-[state=active]:text-white transition-colors gap-1.5"
          >
            <Cpu className="h-3.5 w-3.5" />
            Printer Devices
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ELEMENT PROPERTIES */}
        <TabsContent value="properties" className="mt-4 space-y-4 flex-1">
          {!selectedBlock ? (
            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.04] p-5 text-center space-y-2">
              <Sliders className="h-6 w-6 text-[#877FC1] mx-auto" />
              <p className="text-[12.5px] font-semibold text-white">No Canvas Element Selected</p>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Click any text, variable tag, item grid, logo, or QR block on the paper canvas to edit fonts, borders, alignment, and bindings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header + Actions */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div className="min-w-0">
                  <span className="inline-block rounded-md bg-[#877FC1]/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8B2EC]">
                    {selectedBlock.type.replace('_', ' ')}
                  </span>
                  <p className="text-[13px] font-semibold text-white truncate mt-1">
                    {selectedBlock.label}
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      title="Duplicate block"
                      onClick={() => onDuplicateBlock(selectedBlock.id)}
                      className="h-8 w-8 rounded-lg bg-white/8 hover:bg-white/15 text-white/85 flex items-center justify-center transition cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete block"
                      onClick={() => onDeleteBlock(selectedBlock.id)}
                      className="h-8 w-8 rounded-lg bg-red-500/15 hover:bg-red-500/30 text-red-300 flex items-center justify-center transition cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Coordinates (mm) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Geometry (mm)
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateBlock(selectedBlock.id, (blk) => ({
                          ...blk,
                          x_mm: Number(((paperWidthMm - blk.width_mm) / 2).toFixed(1)),
                        }))
                      }
                      className="text-[10.5px] font-semibold text-[#B8B2EC] hover:text-white transition cursor-pointer"
                    >
                      Center Horizontally
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 tabular-nums">
                  {(
                    [
                      ['X', 'x_mm'],
                      ['Y', 'y_mm'],
                      ['W', 'width_mm'],
                      ['H', 'height_mm'],
                    ] as const
                  ).map(([lbl, key]) => (
                    <label key={key} className="space-y-1">
                      <span className="block text-[10px] text-white/55 font-semibold">{lbl}</span>
                      <input
                        type="number"
                        step="0.5"
                        disabled={!canManage}
                        value={Number(selectedBlock[key])}
                        onChange={(e) => {
                          const val = Number.parseFloat(e.target.value);
                          if (!Number.isFinite(val)) return;
                          onUpdateBlock(selectedBlock.id, (blk) => ({
                            ...blk,
                            [key]: key === 'width_mm' || key === 'height_mm' ? Math.max(4, val) : Math.max(0, val),
                          }));
                        }}
                        className="w-full rounded-lg bg-white/8 border border-white/12 px-2 py-1.5 text-[11.5px] text-white font-mono focus:outline-none focus:border-[#877FC1]"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Typography & Align */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/60">
                  Typography & Alignment
                </span>
                <div className="flex items-center gap-2">
                  <label className="flex-1 flex items-center justify-between rounded-lg bg-white/8 border border-white/12 px-2.5 py-1.5">
                    <span className="text-[11px] text-white/70">Size (pt)</span>
                    <input
                      type="number"
                      min={6}
                      max={28}
                      step={0.5}
                      disabled={!canManage}
                      value={selectedBlock.style.fontSizePt}
                      onChange={(e) => updateStyle({ fontSizePt: Math.max(6, Number(e.target.value) || 9) })}
                      className="w-14 bg-transparent text-right text-[12px] font-bold text-white tabular-nums focus:outline-none"
                    />
                  </label>

                  <button
                    type="button"
                    data-testid="prop-bold-toggle"
                    disabled={!canManage}
                    onClick={() => updateStyle({ bold: !selectedBlock.style.bold })}
                    className={cn(
                      'h-9 w-9 rounded-lg border flex items-center justify-center transition cursor-pointer',
                      selectedBlock.style.bold
                        ? 'bg-[#877FC1] border-[#877FC1] text-white'
                        : 'bg-white/8 border-white/12 text-white/75 hover:bg-white/15'
                    )}
                    title="Toggle Bold"
                  >
                    <Bold className="h-4 w-4" />
                  </button>

                  <div className="flex items-center rounded-lg bg-white/8 border border-white/12 p-0.5">
                    {(
                      [
                        ['left', AlignLeft],
                        ['center', AlignCenter],
                        ['right', AlignRight],
                      ] as const
                    ).map(([alignKey, Icon]) => (
                      <button
                        key={alignKey}
                        type="button"
                        disabled={!canManage}
                        onClick={() => updateStyle({ align: alignKey })}
                        className={cn(
                          'h-7 w-7 rounded-md flex items-center justify-center transition cursor-pointer',
                          selectedBlock.style.align === alignKey
                            ? 'bg-[#877FC1] text-white'
                            : 'text-white/65 hover:text-white'
                        )}
                        title={`Align ${alignKey}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color & Fill */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="block text-[10px] text-white/55 mb-1">Ink Color</span>
                    <div className="flex items-center gap-1.5">
                      {COLOR_SWATCHES.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          disabled={!canManage}
                          onClick={() => updateStyle({ color: hex })}
                          style={{ backgroundColor: hex }}
                          className={cn(
                            'h-5 w-5 rounded-full border border-white/30 cursor-pointer transition-transform',
                            selectedBlock.style.color === hex && 'ring-2 ring-[#877FC1] scale-110'
                          )}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[10px] text-white/55 mb-1">Fill</span>
                    <div className="flex items-center gap-1.5">
                      {BG_SWATCHES.map((bg) => (
                        <button
                          key={bg}
                          type="button"
                          disabled={!canManage}
                          onClick={() => updateStyle({ backgroundColor: bg })}
                          style={{
                            backgroundColor: bg === 'transparent' ? 'rgba(255,255,255,0.06)' : bg,
                          }}
                          className={cn(
                            'h-5 w-5 rounded-md border border-white/30 cursor-pointer text-[8px] text-white/70',
                            selectedBlock.style.backgroundColor === bg && 'ring-2 ring-[#877FC1] scale-110'
                          )}
                          title={bg}
                        >
                          {bg === 'transparent' ? '/' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Borders */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Border & Padding
                  </span>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((bw) => (
                      <button
                        key={bw}
                        type="button"
                        disabled={!canManage}
                        onClick={() => updateStyle({ borderWidth: bw })}
                        className={cn(
                          'px-2 py-0.5 rounded-md text-[10.5px] font-semibold border transition cursor-pointer',
                          selectedBlock.style.borderWidth === bw
                            ? 'bg-[#877FC1] border-[#877FC1] text-white'
                            : 'bg-white/6 border-white/12 text-white/70 hover:text-white'
                        )}
                      >
                        {bw === 0 ? 'None' : `${bw}px`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Block Specific Content / Table Columns */}
              {selectedBlock.type === 'item_table' ? (
                <div className="space-y-2.5 pt-2 border-t border-white/10">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Dynamic Table Columns
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['item', 'Description'],
                        ['qty', 'Qty'],
                        ['price', 'Unit Price'],
                        ['total', 'Line Total'],
                      ] as const
                    ).map(([colKey, label]) => {
                      const active = (selectedBlock.columns || ['item', 'qty', 'total']).includes(colKey);
                      return (
                        <button
                          key={colKey}
                          type="button"
                          disabled={!canManage}
                          onClick={() => toggleTableColumn(colKey)}
                          className={cn(
                            'rounded-lg px-2.5 py-1.5 text-[11px] font-semibold border text-left transition cursor-pointer',
                            active
                              ? 'bg-[#877FC1]/25 border-[#877FC1] text-white'
                              : 'bg-white/5 border-white/10 text-white/55 hover:text-white'
                          )}
                        >
                          {active ? '✓ ' : '+ '}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11.5px] text-white/80">Show Column Headers</span>
                    <Switch
                      disabled={!canManage}
                      checked={selectedBlock.showHeader !== false}
                      onCheckedChange={(checked) =>
                        onUpdateBlock(selectedBlock.id, (blk) => ({ ...blk, showHeader: checked }))
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Content / Variable Binding
                  </span>
                  <textarea
                    rows={3}
                    disabled={!canManage}
                    data-testid="prop-content-input"
                    value={selectedBlock.content}
                    onChange={(e) =>
                      onUpdateBlock(selectedBlock.id, (blk) => ({
                        ...blk,
                        content: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl bg-white/8 border border-white/14 p-2.5 text-[12px] text-white font-mono focus:outline-none focus:border-[#877FC1]"
                  />
                  {canManage && selectedBlock.type !== 'image' && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {DYNAMIC_VARIABLE_TAGS.slice(0, 6).map((t) => (
                        <button
                          key={t.tag}
                          type="button"
                          onClick={() =>
                            onUpdateBlock(selectedBlock.id, (blk) => ({
                              ...blk,
                              content: blk.content ? `${blk.content} ${t.tag}` : t.tag,
                            }))
                          }
                          className="rounded-md bg-white/8 hover:bg-[#877FC1]/40 px-1.5 py-0.5 text-[10px] font-mono text-[#D6D2FA] transition cursor-pointer"
                        >
                          +{t.tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* TAB 2: PRINTER DEVICES & PRINT ENGINE */}
        <TabsContent value="hardware" className="mt-4 space-y-4 flex-1">
          <div className="rounded-xl bg-white/[0.06] border border-white/12 p-3.5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-bold text-white">Hardware Thermal Pairing</p>
                <p className="text-[11px] text-white/60 mt-0.5">
                  Pair ESC/POS USB or Serial receipt printers directly from Chrome/Edge.
                </p>
              </div>
              <span className="rounded-full bg-[#877FC1]/20 px-2 py-0.5 text-[10px] font-bold text-[#C8C2FA]">
                {documentType === 'A4_INVOICE' ? 'A4 Vector' : documentType === 'THERMAL_58MM' ? '58mm' : '80mm'}
              </span>
            </div>

            <div className="space-y-2">
              <DynamicButton
                data-testid="pair-webusb-printer-btn"
                variant="lavender"
                loading={isPairingUsb}
                disabled={!canManage}
                icon={<Usb className="h-4 w-4" />}
                onClick={() => void onPairWebUSB()}
                className="w-full"
              >
                Pair WebUSB Printer
              </DynamicButton>

              <button
                type="button"
                disabled={!canManage || isPairingUsb}
                onClick={() => void onPairWebSerial()}
                className="w-full min-h-[36px] rounded-[var(--theme-radius-control)] border border-white/15 bg-white/6 hover:bg-white/12 text-[11.5px] font-semibold text-white/90 inline-flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Cable className="h-3.5 w-3.5 text-[#B8B2EC]" />
                Pair Serial / COM Port
              </button>
            </div>
          </div>

          {/* Linked Hardware Profile */}
          <div className="space-y-2">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Linked Output Device
            </span>
            <div className="rounded-xl bg-white/8 border border-white/12 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white truncate">
                    {printerProfile.deviceName || 'Default System Printer'}
                  </p>
                  <p className="text-[10.5px] text-white/55 uppercase tracking-wider">
                    Transport: {printerProfile.transport} · {printerProfile.paperWidth}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              </div>

              {pairedDevices.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5 max-h-[140px] overflow-y-auto">
                  {pairedDevices.map((dev) => {
                    const selected = printerProfile.deviceName === dev.name;
                    return (
                      <button
                        key={dev.id}
                        type="button"
                        disabled={!canManage}
                        onClick={() => onSelectDevice(dev)}
                        className={cn(
                          'w-full rounded-lg px-2.5 py-2 text-left flex items-center justify-between border transition cursor-pointer',
                          selected
                            ? 'bg-[#877FC1]/25 border-[#877FC1] text-white'
                            : 'bg-white/4 border-white/8 text-white/75 hover:bg-white/10'
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-[11.5px] font-semibold truncate">{dev.name}</p>
                          <p className="text-[10px] text-white/50">
                            {dev.transport.toUpperCase()} · {dev.paper_width}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-[#C8C2FA]">
                          {selected ? 'Linked' : 'Link'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cash Drawer & Paper Cutter Options */}
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-white">Kick Cash Drawer</p>
                <p className="text-[10.5px] text-white/55">Send ESC p RJ11 pulse on checkout</p>
              </div>
              <Switch
                disabled={!canManage}
                checked={Boolean(printerProfile.autoKickDrawer)}
                onCheckedChange={(checked) => onUpdatePrinterProfile({ autoKickDrawer: checked })}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/8">
              <div>
                <p className="text-[12px] font-semibold text-white">Auto-Cut Thermal Roll</p>
                <p className="text-[10.5px] text-white/55">Append GS V partial cut bytes</p>
              </div>
              <Switch
                disabled={!canManage}
                checked={printerProfile.cutPaper !== false}
                onCheckedChange={(checked) => onUpdatePrinterProfile({ cutPaper: checked })}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Bottom Persistent Print / PDF Execution Bar */}
      <div className="pt-3 border-t border-white/12 space-y-2.5">
        {lastHardwareStatus && (
          <div
            data-testid="hardware-dispatch-status"
            className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 px-2.5 py-2 text-[11px] text-emerald-200 leading-snug"
          >
            {lastHardwareStatus}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <DynamicButton
            data-testid="print-test-page-btn"
            variant="obsidian"
            loading={isTestingPrint}
            icon={<Printer className="h-4 w-4" />}
            onClick={() => void onPrintTestPage()}
            className="w-full bg-white text-[#111315] hover:bg-white/90"
          >
            Print Test Page
          </DynamicButton>

          <button
            type="button"
            data-testid="download-a4-pdf-btn"
            disabled={isExportingPdf}
            onClick={() => void onDownloadVectorPDF()}
            className="w-full min-h-[38px] rounded-[var(--theme-radius-control)] border border-[#877FC1]/50 bg-[#877FC1]/20 hover:bg-[#877FC1]/30 text-[12px] font-semibold text-white inline-flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
          >
            <FileDown className="h-4 w-4 text-[#C8C2FA]" />
            {isExportingPdf ? 'Rendering Vector PDF...' : 'Download Vector PDF'}
          </button>
        </div>
      </div>
    </aside>
  );
}

