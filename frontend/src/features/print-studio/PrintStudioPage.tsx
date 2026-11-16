import * as React from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Save,
  Plus,
  Star,
  Trash2,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuthStore, getDisplayTradeName } from '@/store/authStore';
import { confirmAction, confirmDestructiveAction } from '@/lib/swal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { PrintDesignerSkeleton } from '@/components/skeletons/PrintStudioSkeleton';
import { ToolboxPanel, ToolboxDragPayload } from '@/features/print-studio/ToolboxPanel';
import { DesignCanvas } from '@/features/print-studio/DesignCanvas';
import { PropertiesHardwarePanel } from '@/features/print-studio/PropertiesHardwarePanel';
import {
  CanvasBlock,
  CanvasSchema,
  createDefaultStyle,
  createStarterSchema,
  DocumentType,
  PAPER_PRESETS,
  PrintDataContext,
  PrinterProfile,
  PrintTemplateRecord,
  SAMPLE_ITEMS_EXPANDED_10,
  SAMPLE_ITEMS_SHORT,
} from '@/features/print-studio/types';
import {
  getCachedPrintTemplates,
  listLocalPrinterDevices,
  saveLocalPrinterDevice,
  syncPrintTemplatesCache,
} from '@/features/print-studio/engine/offlinePrintCache';
import { generateTemplateVectorPDF } from '@/features/print-studio/engine/pdfGenerator';
import {
  compileTemplateToESCPOSBytes,
  dispatchRawESCPOSBytes,
  pairWebSerialPrinter,
  pairWebUSBPrinter,
} from '@/lib/escpos-studio-engine';
import { getResolvedBaseCurrency } from '@/lib/currency';
import { LocalPrinterDevice } from '@/lib/dexie-db';

interface TemplatesApiResponse {
  templates: PrintTemplateRecord[];
}

export function PrintStudioPage() {
  const queryClient = useQueryClient();
  const context = useAuthStore((s) => s.context);
  const branches = useAuthStore((s) => s.branches);
  const publicBranding = useAuthStore((s) => s.publicBranding);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission('print:manage');

  const businessId = context?.business_id || '';
  const activeBranch = branches.find((b) => b.id === context?.branch_id);

  // Studio Editing Draft State
  const [activeTemplateId, setActiveTemplateId] = React.useState<string>('');
  const [templateName, setTemplateName] = React.useState<string>('Untitled Layout');
  const [documentType, setDocumentType] = React.useState<DocumentType>('THERMAL_80MM');
  const [paperWidthMm, setPaperWidthMm] = React.useState<number>(80);
  const [paperHeightMm, setPaperHeightMm] = React.useState<number>(210);
  const [snapGridMm, setSnapGridMm] = React.useState<number>(2);
  const [isDefault, setIsDefault] = React.useState<boolean>(false);
  const [canvasSchema, setCanvasSchema] = React.useState<CanvasSchema>(() =>
    createStarterSchema('THERMAL_80MM')
  );
  const [printerProfile, setPrinterProfile] = React.useState<PrinterProfile>({
    transport: 'webusb',
    deviceName: 'POS-80 Thermal Roll',
    paperWidth: '80mm',
    autoKickDrawer: true,
    cutPaper: true,
  });

  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  const [testTenItems, setTestTenItems] = React.useState<boolean>(false);
  const [uploadedLogoUrl, setUploadedLogoUrl] = React.useState<string>('');
  const [pairedDevices, setPairedDevices] = React.useState<LocalPrinterDevice[]>([]);
  const [isPairingUsb, setIsPairingUsb] = React.useState<boolean>(false);
  const [isTestingPrint, setIsTestingPrint] = React.useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = React.useState<boolean>(false);
  const [lastHardwareStatus, setLastHardwareStatus] = React.useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = React.useState<boolean>(false);
  const [dirty, setDirty] = React.useState<boolean>(false);

  const paperElementRef = React.useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  // Load templates from Go Backend + fallback gracefully to Dexie offline cache
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['print-templates', businessId],
    queryFn: async () => {
      try {
        const res = await apiFetch<TemplatesApiResponse>('/api/v1/print-templates');
        await syncPrintTemplatesCache(businessId, res.templates || []);
        return res.templates || [];
      } catch (err) {
        const cached = await getCachedPrintTemplates(businessId);
        if (cached.length > 0) return cached;
        throw err;
      }
    },
    enabled: Boolean(businessId),
  });

  const templates = React.useMemo(() => templatesData || [], [templatesData]);

  // Hydrate paired printer devices from Dexie.js
  React.useEffect(() => {
    if (!businessId) return;
    void listLocalPrinterDevices(businessId).then(setPairedDevices);
  }, [businessId]);

  const loadTemplateIntoDraft = React.useCallback((tpl: PrintTemplateRecord) => {
    setIsCreatingNew(false);
    setActiveTemplateId(tpl.id);
    setTemplateName(tpl.name);
    setDocumentType(tpl.document_type);
    setPaperWidthMm(Number(tpl.paper_width_mm || PAPER_PRESETS[tpl.document_type].widthMm));
    setPaperHeightMm(Number(tpl.paper_height_mm || PAPER_PRESETS[tpl.document_type].heightMm));
    setSnapGridMm(Number(tpl.snap_grid_mm || PAPER_PRESETS[tpl.document_type].defaultSnapMm));
    setIsDefault(Boolean(tpl.is_default));
    setCanvasSchema(
      tpl.canvas_schema && Array.isArray(tpl.canvas_schema.blocks)
        ? tpl.canvas_schema
        : createStarterSchema(tpl.document_type)
    );
    setPrinterProfile({
      transport: tpl.printer_profile?.transport || (tpl.document_type === 'A4_INVOICE' ? 'pdf' : 'webusb'),
      deviceName: tpl.printer_profile?.deviceName || 'System Printer',
      vendorId: tpl.printer_profile?.vendorId ?? null,
      productId: tpl.printer_profile?.productId ?? null,
      paperWidth:
        tpl.printer_profile?.paperWidth || PAPER_PRESETS[tpl.document_type].printerPaperWidth,
      autoKickDrawer: Boolean(tpl.printer_profile?.autoKickDrawer),
      cutPaper: tpl.printer_profile?.cutPaper !== false,
    });
    setSelectedBlockId(tpl.canvas_schema?.blocks?.[0]?.id ?? null);
    setDirty(false);
  }, []);

  // Auto-select initial template on first load
  React.useEffect(() => {
    if (templates.length === 0 || isCreatingNew) return;
    if (!activeTemplateId || !templates.some((t) => t.id === activeTemplateId)) {
      const preferred =
        templates.find((t) => t.is_default && t.document_type === 'A4_INVOICE') ||
        templates.find((t) => t.is_default) ||
        templates[0];
      if (preferred) {
        loadTemplateIntoDraft(preferred);
      }
    }
  }, [templates, activeTemplateId, isCreatingNew, loadTemplateIntoDraft]);

  // Live preview sample data context honoring active business, currency & logo
  const previewDataContext = React.useMemo<PrintDataContext>(() => {
    const items = testTenItems ? SAMPLE_ITEMS_EXPANDED_10 : SAMPLE_ITEMS_SHORT;
    const subtotalNum = items.reduce((acc, i) => acc + Number(i.lineTotal), 0);
    const discountNum = 10;
    const taxable = Math.max(0, subtotalNum - discountNum);
    const taxNum = Number((taxable * 0.08).toFixed(2));
    const grandNum = Number((taxable + taxNum).toFixed(2));

    return {
      businessName: getDisplayTradeName(context, publicBranding),
      branchName: activeBranch?.name || 'Flagship Branch',
      taxRegNo: context?.tax_registration_no || 'VAT-ZR-882940',
      businessLogoUrl:
        uploadedLogoUrl || context?.logo_receipt_url || context?.logo_light_url || '',
      invoiceNumber: 'INV-2026-00942',
      dateTime: new Date().toLocaleString(),
      customerName: 'Claire Bennett',
      cashierName: context?.full_name || 'System Operator',
      paymentMethod: 'CARD',
      subtotal: subtotalNum.toFixed(2),
      discountTotal: discountNum.toFixed(2),
      taxTotal: taxNum.toFixed(2),
      grandTotal: grandNum.toFixed(2),
      currencyCode: getResolvedBaseCurrency(),
      items,
    };
  }, [testTenItems, context, publicBranding, activeBranch?.name, uploadedLogoUrl]);

  const currentDraftTemplate = React.useMemo<PrintTemplateRecord>(
    () => ({
      id: activeTemplateId || 'draft-template',
      business_id: businessId,
      name: templateName,
      document_type: documentType,
      paper_width_mm: paperWidthMm,
      paper_height_mm: paperHeightMm,
      snap_grid_mm: snapGridMm,
      is_default: isDefault,
      canvas_schema: canvasSchema,
      printer_profile: printerProfile,
    }),
    [
      activeTemplateId,
      businessId,
      templateName,
      documentType,
      paperWidthMm,
      paperHeightMm,
      snapGridMm,
      isDefault,
      canvasSchema,
      printerProfile,
    ]
  );

  const selectedBlock = React.useMemo(
    () => canvasSchema.blocks.find((b) => b.id === selectedBlockId) ?? null,
    [canvasSchema.blocks, selectedBlockId]
  );

  // Insert a block from Left Toolbox (either clicked or drag-dropped)
  const insertToolboxBlock = React.useCallback(
    (payload: ToolboxDragPayload, explicitXmm?: number, explicitYmm?: number) => {
      if (!canManage) return;
      const defaultW = Math.min(paperWidthMm - 8, payload.presetWidthMm || 54);
      const defaultH = payload.presetHeightMm || 10;

      const maxExistingBottom = canvasSchema.blocks.reduce(
        (maxY, b) => Math.max(maxY, b.y_mm + b.height_mm),
        6
      );

      const xMm =
        explicitXmm !== undefined
          ? Math.max(2, Math.min(paperWidthMm - defaultW - 2, explicitXmm))
          : Number(Math.max(3, (paperWidthMm - defaultW) / 2).toFixed(1));
      const yMm =
        explicitYmm !== undefined
          ? Math.max(2, explicitYmm)
          : Number(Math.min(paperHeightMm - defaultH - 4, maxExistingBottom + 3).toFixed(1));

      const newBlock: CanvasBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: payload.blockType,
        label: payload.label,
        x_mm: xMm,
        y_mm: yMm,
        width_mm: defaultW,
        height_mm: defaultH,
        content: payload.content,
        columns:
          payload.blockType === 'item_table'
            ? documentType === 'A4_INVOICE'
              ? ['item', 'qty', 'price', 'total']
              : ['item', 'qty', 'total']
            : undefined,
        showHeader: payload.blockType === 'item_table' ? true : undefined,
        rowHeightMm: payload.blockType === 'item_table' ? (documentType === 'A4_INVOICE' ? 7.5 : 6.2) : undefined,
        barcodeFormat: payload.blockType === 'qr_code' ? 'QR' : undefined,
        style: createDefaultStyle({
          fontSizePt: payload.fontSizePt || (documentType === 'A4_INVOICE' ? 10 : 8.5),
          bold: Boolean(payload.bold),
          align: payload.align || 'left',
          borderWidth: payload.blockType === 'item_table' ? 1 : 0,
          backgroundColor: payload.blockType === 'item_table' ? '#FFFFFF' : 'transparent',
        }),
      };

      setCanvasSchema((prev) => ({
        ...prev,
        blocks: [...prev.blocks, newBlock],
      }));
      setSelectedBlockId(newBlock.id);
      setDirty(true);
    },
    [canManage, paperWidthMm, paperHeightMm, canvasSchema.blocks, documentType]
  );

  // Handle @dnd-kit DragEnd from Left Toolbox -> Physical Paper
  const handleDndEnd = (event: DragEndEvent) => {
    if (!canManage || !event.over || event.over.id !== 'studio-paper-canvas') return;
    const payload = event.active.data.current as ToolboxDragPayload | undefined;
    if (!payload || payload.kind !== 'toolbox-block') return;

    const paperRect = paperElementRef.current?.getBoundingClientRect();
    const translated = event.active.rect.current.translated;
    if (!paperRect || !translated) {
      insertToolboxBlock(payload);
      return;
    }

    const scale = paperRect.width / paperWidthMm;
    const rawX = (translated.left - paperRect.left) / scale;
    const rawY = (translated.top - paperRect.top) / scale;
    const snappedX = canvasSchema.snap_to_grid
      ? Math.round(rawX / snapGridMm) * snapGridMm
      : rawX;
    const snappedY = canvasSchema.snap_to_grid
      ? Math.round(rawY / snapGridMm) * snapGridMm
      : rawY;

    insertToolboxBlock(payload, Number(snappedX.toFixed(1)), Number(snappedY.toFixed(1)));
    toast.success(`Inserted "${payload.label}" onto canvas`);
  };

  // Switch between A4 Invoice / 80mm / 58mm paper bounds & matching default template if available
  const handleSwitchDocumentType = (nextType: DocumentType) => {
    const existingMatch =
      templates.find((t) => t.document_type === nextType && t.is_default) ||
      templates.find((t) => t.document_type === nextType);

    if (existingMatch && !dirty) {
      loadTemplateIntoDraft(existingMatch);
      return;
    }

    const spec = PAPER_PRESETS[nextType];
    setDocumentType(nextType);
    setPaperWidthMm(spec.widthMm);
    setPaperHeightMm(spec.heightMm);
    setSnapGridMm(spec.defaultSnapMm);
    setPrinterProfile((prev) => ({
      ...prev,
      paperWidth: spec.printerPaperWidth,
      transport: nextType === 'A4_INVOICE' ? 'pdf' : prev.transport === 'pdf' ? 'webusb' : prev.transport,
    }));

    // Scale X coordinates & widths proportionally so blocks never overflow narrower thermal widths
    setCanvasSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((blk) => {
        const nextW = Math.min(spec.widthMm - 6, Math.max(12, blk.width_mm));
        const nextX = Math.min(Math.max(2, blk.x_mm), Math.max(2, spec.widthMm - nextW - 2));
        return { ...blk, x_mm: Number(nextX.toFixed(1)), width_mm: Number(nextW.toFixed(1)) };
      }),
    }));
    setDirty(true);
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async (asNew?: boolean) => {
      const payload = {
        name: templateName.trim() || `${PAPER_PRESETS[documentType].shortLabel} Template`,
        document_type: documentType,
        paper_width_mm: paperWidthMm,
        paper_height_mm: paperHeightMm,
        snap_grid_mm: snapGridMm,
        is_default: isDefault,
        canvas_schema: canvasSchema,
        printer_profile: printerProfile,
      };
      if (asNew || !activeTemplateId) {
        return apiFetch<{ template: PrintTemplateRecord }>('/api/v1/print-templates', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            name: asNew ? `${payload.name} Copy` : payload.name,
            is_default: templates.length === 0 ? true : false,
          }),
        });
      }
      return apiFetch<{ template: PrintTemplateRecord }>(`/api/v1/print-templates/${activeTemplateId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['print-templates', businessId] });
      loadTemplateIntoDraft(res.template);
      const updatedList = await queryClient.fetchQuery({
        queryKey: ['print-templates', businessId],
        queryFn: async () => {
          const r = await apiFetch<TemplatesApiResponse>('/api/v1/print-templates');
          return r.templates || [];
        },
      });
      await syncPrintTemplatesCache(businessId, updatedList);
      toast.success(`Saved "${res.template.name}" to PostgreSQL & IndexedDB Edge Cache`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ template: PrintTemplateRecord }>(`/api/v1/print-templates/${id}/default`, {
        method: 'POST',
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['print-templates', businessId] });
      setIsDefault(true);
      const docLabel = PAPER_PRESETS[res.template.document_type]?.shortLabel || res.template.document_type;
      toast.success(`"${res.template.name}" is now the active ${docLabel} default.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ status: string }>(`/api/v1/print-templates/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      setIsCreatingNew(false);
      setActiveTemplateId('');
      await queryClient.invalidateQueries({ queryKey: ['print-templates', businessId] });
      toast.success('Template deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // WebUSB & WebSerial Pairing
  const handlePairWebUSB = async () => {
    setIsPairingUsb(true);
    try {
      const hardware = await pairWebUSBPrinter(PAPER_PRESETS[documentType].printerPaperWidth);
      const localRecord: LocalPrinterDevice = {
        id: hardware.id,
        business_id: businessId,
        name: hardware.name,
        transport: 'webusb',
        vendor_id: hardware.vendorId ?? null,
        product_id: hardware.productId ?? null,
        paper_width: hardware.paperWidth,
        auto_kick_drawer: printerProfile.autoKickDrawer,
        cut_paper: printerProfile.cutPaper,
        paired_at: hardware.pairedAt,
      };
      await saveLocalPrinterDevice(localRecord);
      setPairedDevices(await listLocalPrinterDevices(businessId));
      setPrinterProfile((prev) => ({
        ...prev,
        transport: 'webusb',
        deviceName: hardware.name,
        vendorId: hardware.vendorId ?? null,
        productId: hardware.productId ?? null,
      }));
      setDirty(true);
      setLastHardwareStatus(`Paired WebUSB printer: ${hardware.name}`);
      toast.success(`Paired WebUSB device "${hardware.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to pair WebUSB printer';
      setLastHardwareStatus(msg);
      toast.error(msg);
    } finally {
      setIsPairingUsb(false);
    }
  };

  const handlePairWebSerial = async () => {
    setIsPairingUsb(true);
    try {
      const hardware = await pairWebSerialPrinter(PAPER_PRESETS[documentType].printerPaperWidth);
      const localRecord: LocalPrinterDevice = {
        id: hardware.id,
        business_id: businessId,
        name: hardware.name,
        transport: 'webserial',
        vendor_id: hardware.vendorId ?? null,
        product_id: hardware.productId ?? null,
        paper_width: hardware.paperWidth,
        auto_kick_drawer: printerProfile.autoKickDrawer,
        cut_paper: printerProfile.cutPaper,
        paired_at: hardware.pairedAt,
      };
      await saveLocalPrinterDevice(localRecord);
      setPairedDevices(await listLocalPrinterDevices(businessId));
      setPrinterProfile((prev) => ({
        ...prev,
        transport: 'webserial',
        deviceName: hardware.name,
      }));
      setDirty(true);
      setLastHardwareStatus(`Paired Serial printer: ${hardware.name}`);
      toast.success(`Paired Serial device "${hardware.name}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to pair WebSerial printer';
      setLastHardwareStatus(msg);
      toast.error(msg);
    } finally {
      setIsPairingUsb(false);
    }
  };

  const handlePrintTestPage = async () => {
    setIsTestingPrint(true);
    try {
      if (documentType === 'A4_INVOICE') {
        const pdf = await generateTemplateVectorPDF(currentDraftTemplate, previewDataContext);
        window.open(pdf.blobUrl, '_blank', 'noopener,noreferrer');
        setLastHardwareStatus(`A4 Vector PDF compiled (${pdf.pageCount} page, ${pdf.blob.size} bytes)`);
        toast.success(`Generated A4 Vector Test PDF (${pdf.pageCount} page)`);
      } else {
        const escposBytes = await compileTemplateToESCPOSBytes(currentDraftTemplate, previewDataContext);
        const result = await dispatchRawESCPOSBytes(escposBytes, {
          paperWidth: documentType === 'THERMAL_58MM' ? '58mm' : '80mm',
          preferredTransport: printerProfile.transport,
        });
        setLastHardwareStatus(result.message);
        toast.success(result.message);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test print failed';
      setLastHardwareStatus(msg);
      toast.error(msg);
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleDownloadVectorPDF = async () => {
    setIsExportingPdf(true);
    try {
      const pdf = await generateTemplateVectorPDF(currentDraftTemplate, previewDataContext);
      pdf.download();
      setLastHardwareStatus(`Downloaded ${pdf.filename} (${pdf.pageCount} page vector PDF)`);
      toast.success(`Downloaded ${pdf.filename}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to build vector PDF';
      toast.error(msg);
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (isLoading) {
    return <PrintDesignerSkeleton />;
  }

  return (
    <div data-testid="print-studio-page" className="space-y-4">
      {/* Top Studio Template Toolbar */}
      <div className="zona-card p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
          <div className="w-full sm:w-[230px]">
            <Select
              value={activeTemplateId || ''}
              onValueChange={(id) => {
                const match = templates.find((t) => t.id === id);
                if (match) loadTemplateIntoDraft(match);
              }}
            >
              <SelectTrigger
                data-testid="template-selector-trigger"
                className="h-9 rounded-[var(--theme-radius-control)] bg-surface border-border text-[12.5px] font-semibold [&>span]:truncate"
              >
                <SelectValue placeholder="Choose template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.is_default ? '★ ' : ''}
                    {t.name} ({PAPER_PRESETS[t.document_type]?.shortLabel || t.document_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            data-testid="template-name-input"
            value={templateName}
            disabled={!canManage}
            onChange={(e) => {
              setTemplateName(e.target.value);
              setDirty(true);
            }}
            placeholder="Template name..."
            className="h-9 w-full sm:w-[210px] rounded-[var(--theme-radius-control)] text-[12.5px] font-semibold"
          />

          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <Database className="h-3 w-3" />
            IndexedDB Offline Cached
          </span>

          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#877FC1]/15 border border-[#877FC1]/30 px-2.5 py-1 text-[11px] font-bold text-[#6E64B5] dark:text-[#C8C2FA]">
              <CheckCircle2 className="h-3 w-3" />
              Active Default
            </span>
          )}
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="new-template-btn"
              onClick={() => {
                setIsCreatingNew(true);
                setActiveTemplateId('');
                setTemplateName(`Custom ${PAPER_PRESETS[documentType].shortLabel}`);
                setCanvasSchema(createStarterSchema(documentType));
                setSelectedBlockId(null);
                setIsDefault(false);
                setDirty(true);
                toast.info('New blank studio canvas created — customize and Save.');
              }}
              className="h-9 rounded-[var(--theme-radius-control)] border border-border bg-surface-muted hover:bg-accent-soft/50 px-3 text-[12px] font-semibold text-ink inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>

            {activeTemplateId && !isDefault && (
              <button
                type="button"
                data-testid="set-default-template-btn"
                onClick={async () => {
                  const ok = await confirmAction({
                    title: 'Set as Active Checkout Template?',
                    text: `Use "${templateName}" automatically for all ${PAPER_PRESETS[documentType].label} jobs across offline & online POS terminals?`,
                    confirmLabel: 'Yes, Set Default',
                  });
                  if (ok) setDefaultMutation.mutate(activeTemplateId);
                }}
                className="h-9 rounded-[var(--theme-radius-control)] border border-border bg-surface hover:bg-accent-soft/50 px-3 text-[12px] font-semibold text-ink inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Star className="h-3.5 w-3.5 text-[#877FC1]" />
                Set Default
              </button>
            )}

            {activeTemplateId && templates.length > 1 && (
              <button
                type="button"
                data-testid="delete-template-btn"
                onClick={async () => {
                  const ok = await confirmDestructiveAction({
                    title: 'Delete Print Template?',
                    text: `Permanently delete "${templateName}"? Edge terminals will sync the change cleanly.`,
                    confirmLabel: 'Yes, Delete Template',
                  });
                  if (ok) deleteMutation.mutate(activeTemplateId);
                }}
                className="h-9 rounded-[var(--theme-radius-control)] border border-red-200 bg-red-50 hover:bg-red-100 px-3 text-[12px] font-semibold text-red-700 inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}

            <DynamicButton
              data-testid="save-template-btn"
              variant="lavender"
              loading={saveMutation.isPending}
              icon={<Save className="h-4 w-4" />}
              onClick={() => saveMutation.mutate(false)}
              className="min-h-[36px] h-9 px-4"
            >
              {activeTemplateId ? (dirty ? 'Save Changes *' : 'Save Template') : 'Create & Save'}
            </DynamicButton>
          </div>
        )}
      </div>

      {/* 3-Column Canva-Style Workspace */}
      <DndContext sensors={sensors} onDragEnd={handleDndEnd}>
        <div className="flex flex-col xl:flex-row items-stretch gap-4 min-h-[700px]">
          {/* LEFT PANEL: #FFFFFF Toolbox */}
          <ToolboxPanel
            className="order-2 xl:order-1"
            canManage={canManage}
            uploadedLogoUrl={uploadedLogoUrl}
            onUploadedLogo={(dataUrl, fileName) => {
              setUploadedLogoUrl(dataUrl);
              if (dataUrl) {
                insertToolboxBlock({
                  kind: 'toolbox-block',
                  blockType: 'image',
                  label: fileName || 'Uploaded Logo',
                  content: dataUrl,
                  presetWidthMm: 34,
                  presetHeightMm: 16,
                  align: 'center',
                });
              }
            }}
            onQuickAdd={(payload) => insertToolboxBlock(payload)}
          />

          {/* CENTER PANEL: #F5F6FA Physical Paper Canvas */}
          <DesignCanvas
            className="order-1 xl:order-2"
            canManage={canManage}
            documentType={documentType}
            paperWidthMm={paperWidthMm}
            paperHeightMm={paperHeightMm}
            snapGridMm={snapGridMm}
            canvasSchema={canvasSchema}
            selectedBlockId={selectedBlockId}
            dataContext={previewDataContext}
            testTenItems={testTenItems}
            paperElementRef={paperElementRef}
            onSwitchDocumentType={handleSwitchDocumentType}
            onToggleSnapGrid={(snap) => {
              setCanvasSchema((prev) => ({ ...prev, snap_to_grid: snap }));
              setDirty(true);
            }}
            onToggleTestTenItems={setTestTenItems}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlockGeometry={(blockId, xMm, yMm, wMm, hMm) => {
              setCanvasSchema((prev) => ({
                ...prev,
                blocks: prev.blocks.map((b) =>
                  b.id === blockId
                    ? { ...b, x_mm: xMm, y_mm: yMm, width_mm: wMm, height_mm: hMm }
                    : b
                ),
              }));
              setDirty(true);
            }}
            onDeleteBlock={(blockId) => {
              setCanvasSchema((prev) => ({
                ...prev,
                blocks: prev.blocks.filter((b) => b.id !== blockId),
              }));
              if (selectedBlockId === blockId) setSelectedBlockId(null);
              setDirty(true);
            }}
          />

          {/* RIGHT PANEL: #222026 Obsidian Properties & Printer Hardware */}
          <PropertiesHardwarePanel
            className="order-3"
            canManage={canManage}
            documentType={documentType}
            selectedBlock={selectedBlock}
            paperWidthMm={paperWidthMm}
            printerProfile={printerProfile}
            pairedDevices={pairedDevices}
            isPairingUsb={isPairingUsb}
            isTestingPrint={isTestingPrint}
            isExportingPdf={isExportingPdf}
            lastHardwareStatus={lastHardwareStatus}
            onUpdateBlock={(blockId, updater) => {
              setCanvasSchema((prev) => ({
                ...prev,
                blocks: prev.blocks.map((b) => (b.id === blockId ? updater(b) : b)),
              }));
              setDirty(true);
            }}
            onDuplicateBlock={(blockId) => {
              const source = canvasSchema.blocks.find((b) => b.id === blockId);
              if (!source) return;
              const copy: CanvasBlock = {
                ...source,
                id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                label: `${source.label} Copy`,
                x_mm: Number(Math.min(paperWidthMm - source.width_mm, source.x_mm + 4).toFixed(1)),
                y_mm: Number((source.y_mm + 6).toFixed(1)),
              };
              setCanvasSchema((prev) => ({ ...prev, blocks: [...prev.blocks, copy] }));
              setSelectedBlockId(copy.id);
              setDirty(true);
            }}
            onDeleteBlock={(blockId) => {
              setCanvasSchema((prev) => ({
                ...prev,
                blocks: prev.blocks.filter((b) => b.id !== blockId),
              }));
              if (selectedBlockId === blockId) setSelectedBlockId(null);
              setDirty(true);
            }}
            onUpdatePrinterProfile={(patch) => {
              setPrinterProfile((prev) => ({ ...prev, ...patch }));
              setDirty(true);
            }}
            onPairWebUSB={handlePairWebUSB}
            onPairWebSerial={handlePairWebSerial}
            onSelectDevice={(dev) => {
              setPrinterProfile((prev) => ({
                ...prev,
                transport: dev.transport,
                deviceName: dev.name,
                vendorId: dev.vendor_id ?? null,
                productId: dev.product_id ?? null,
                paperWidth: dev.paper_width,
              }));
              setDirty(true);
              setLastHardwareStatus(`Linked template to ${dev.name}`);
            }}
            onPrintTestPage={handlePrintTestPage}
            onDownloadVectorPDF={handleDownloadVectorPDF}
          />
        </div>
      </DndContext>
    </div>
  );
}
