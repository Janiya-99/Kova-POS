import * as React from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  Type,
  Braces,
  Table2,
  Image as ImageIcon,
  QrCode,
  Plus,
  GripVertical,
  Sparkles,
} from 'lucide-react';
import { MagneticDropZone } from '@/components/dqnamo/MagneticDropZone';
import {
  BlockType,
  DYNAMIC_VARIABLE_TAGS,
} from '@/features/print-studio/types';
import { cn } from '@/lib/utils';

export interface ToolboxDragPayload {
  kind: 'toolbox-block';
  blockType: BlockType;
  label: string;
  content: string;
  presetWidthMm?: number;
  presetHeightMm?: number;
  fontSizePt?: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface DraggableToolboxCardProps {
  id: string;
  payload: ToolboxDragPayload;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onQuickAdd: (payload: ToolboxDragPayload) => void;
}

function DraggableToolboxCard({
  id,
  payload,
  icon,
  title,
  subtitle,
  disabled,
  onQuickAdd,
}: DraggableToolboxCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: payload,
    disabled,
  });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 60,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`toolbox-item-${id}`}
      className={cn(
        'group relative flex items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition-all hover:border-[#877FC1] hover:shadow-sm select-none',
        isDragging && 'opacity-80 ring-2 ring-[#877FC1] shadow-lg',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2.5 flex-1 min-w-0 cursor-grab active:cursor-grabbing"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#877FC1]/12 text-[#877FC1]">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[12px] font-semibold text-[#111315] truncate">{title}</p>
          </div>
          <p className="text-[10.5px] text-slate-500 truncate">{subtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <GripVertical className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-400" />
        <button
          type="button"
          title={`Add ${title} to canvas`}
          onClick={() => onQuickAdd(payload)}
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[#111315] hover:bg-[#877FC1] hover:text-white transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface DraggableTagPillProps {
  tag: string;
  label: string;
  disabled?: boolean;
  onQuickAdd: (payload: ToolboxDragPayload) => void;
}

function DraggableTagPill({ tag, label, disabled, onQuickAdd }: DraggableTagPillProps) {
  const payload: ToolboxDragPayload = {
    kind: 'toolbox-block',
    blockType: 'variable',
    label,
    content: `${label}: ${tag}`,
    presetWidthMm: 52,
    presetHeightMm: 9,
    fontSizePt: 9.5,
    bold: tag === '{Total_Amount}' || tag === '{Business_Name}',
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `tag-${tag}`,
    data: payload,
    disabled,
  });

  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 60 }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      data-testid={`toolbox-tag-${tag.replace(/[{}]/g, '')}`}
      onClick={() => onQuickAdd(payload)}
      {...attributes}
      {...listeners}
      title={`Drag onto canvas or click to insert ${tag}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 px-2.5 py-1.5 text-[11px] font-medium text-[#111315] hover:border-[#877FC1] hover:bg-[#877FC1]/10 transition-colors cursor-grab active:cursor-grabbing',
        isDragging && 'ring-2 ring-[#877FC1] bg-white shadow-md'
      )}
    >
      <span className="font-mono text-[10px] font-semibold text-[#877FC1]">{tag}</span>
    </button>
  );
}

export interface ToolboxPanelProps {
  canManage: boolean;
  uploadedLogoUrl: string;
  onUploadedLogo: (dataUrl: string, fileName: string) => void;
  onQuickAdd: (payload: ToolboxDragPayload) => void;
  className?: string;
}

/**
 * Left Panel (#FFFFFF) Canva-style Block Toolbox containing Text, Dynamic Tags,
 * Auto-Expanding Tables, Logo MagneticDropZone, and QR/Barcodes.
 */
export function ToolboxPanel({
  canManage,
  uploadedLogoUrl,
  onUploadedLogo,
  onQuickAdd,
  className,
}: ToolboxPanelProps) {
  return (
    <aside
      data-testid="studio-toolbox-panel"
      style={{ backgroundColor: '#FFFFFF' }}
      className={cn(
        'w-full xl:w-[276px] shrink-0 rounded-[var(--theme-radius-card)] bg-[#FFFFFF] text-[#111315] border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between gap-4',
        className
      )}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-[13.5px] font-bold text-[#111315] flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-[#877FC1]" />
              Design Elements
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Drag onto paper or tap + to insert
            </p>
          </div>
          <span className="rounded-md bg-[#877FC1]/12 px-2 py-0.5 text-[10px] font-bold text-[#877FC1]">
            Blocks
          </span>
        </div>

        {/* Core Structural Elements */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2">
          <DraggableToolboxCard
            id="heading-text"
            icon={<Type className="h-4 w-4" />}
            title="Heading Text"
            subtitle="Bold storefront title or notice"
            disabled={!canManage}
            onQuickAdd={onQuickAdd}
            payload={{
              kind: 'toolbox-block',
              blockType: 'text',
              label: 'Heading Text',
              content: 'TAX INVOICE / RECEIPT',
              presetWidthMm: 64,
              presetHeightMm: 10,
              fontSizePt: 14,
              bold: true,
              align: 'center',
            }}
          />

          <DraggableToolboxCard
            id="body-text"
            icon={<Type className="h-4 w-4" />}
            title="Body Paragraph"
            subtitle="Terms, return policy or custom note"
            disabled={!canManage}
            onQuickAdd={onQuickAdd}
            payload={{
              kind: 'toolbox-block',
              blockType: 'text',
              label: 'Custom Text',
              content: 'Returns accepted within 14 days with original receipt.',
              presetWidthMm: 70,
              presetHeightMm: 10,
              fontSizePt: 8.5,
              bold: false,
              align: 'left',
            }}
          />

          <DraggableToolboxCard
            id="item-table"
            icon={<Table2 className="h-4 w-4" />}
            title="Dynamic Item Grid"
            subtitle="Auto-expands cleanly for 10+ rows"
            disabled={!canManage}
            onQuickAdd={onQuickAdd}
            payload={{
              kind: 'toolbox-block',
              blockType: 'item_table',
              label: 'Line Items Grid',
              content: 'Dynamic Line Items',
              presetWidthMm: 72,
              presetHeightMm: 46,
              fontSizePt: 8.5,
            }}
          />

          <DraggableToolboxCard
            id="qr-code"
            icon={<QrCode className="h-4 w-4" />}
            title="Verification QR Code"
            subtitle="Digital receipt or tax e-invoice link"
            disabled={!canManage}
            onQuickAdd={onQuickAdd}
            payload={{
              kind: 'toolbox-block',
              blockType: 'qr_code',
              label: 'QR Verification',
              content: '{Invoice_Number}',
              presetWidthMm: 24,
              presetHeightMm: 24,
              fontSizePt: 8,
              align: 'center',
            }}
          />

          <DraggableToolboxCard
            id="brand-logo"
            icon={<ImageIcon className="h-4 w-4" />}
            title="Store Logo Block"
            subtitle="Uses tenant logo or uploaded image"
            disabled={!canManage}
            onQuickAdd={onQuickAdd}
            payload={{
              kind: 'toolbox-block',
              blockType: 'image',
              label: 'Store Logo',
              content: uploadedLogoUrl || '{Business_Logo}',
              presetWidthMm: 34,
              presetHeightMm: 16,
              align: 'center',
            }}
          />
        </div>

        {/* Draggable Dynamic Data Variable Chips */}
        <div className="space-y-2 pt-1 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Braces className="h-3.5 w-3.5 text-[#877FC1]" />
              Dynamic Tags
            </span>
            <span className="text-[10px] text-slate-400">Live Checkout Binding</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DYNAMIC_VARIABLE_TAGS.map((item) => (
              <DraggableTagPill
                key={item.tag}
                tag={item.tag}
                label={item.label}
                disabled={!canManage}
                onQuickAdd={onQuickAdd}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Logo Upload Drop Zone */}
      <div className="pt-3 border-t border-slate-100 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Custom Receipt Image / Logo
        </p>
        <MagneticDropZone
          maxFiles={1}
          maxSizeMB={2}
          accept=".png,.jpg,.jpeg,.webp,.svg"
          label="Drop logo & insert onto canvas"
          helperText="PNG, SVG, JPG (< 2MB)"
          previewUrls={uploadedLogoUrl ? [uploadedLogoUrl] : []}
          onFileSelected={() => undefined}
          onFilesChanged={(items) => {
            if (items[0]?.dataUrl) {
              onUploadedLogo(items[0].dataUrl, items[0].name);
            } else {
              onUploadedLogo('', '');
            }
          }}
          className="p-3 bg-slate-50/70 border-slate-300"
        />
      </div>
    </aside>
  );
}

