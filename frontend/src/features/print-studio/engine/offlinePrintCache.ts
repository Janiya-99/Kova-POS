import { dexieDB, LocalPrinterDevice, LocalPrintTemplate } from '@/lib/dexie-db';
import { DocumentType, PrintTemplateRecord } from '@/features/print-studio/types';

function toLocalTemplate(row: PrintTemplateRecord): LocalPrintTemplate {
  return {
    id: row.id,
    business_id: row.business_id,
    branch_id: row.branch_id ?? null,
    name: row.name,
    document_type: row.document_type,
    paper_width_mm: row.paper_width_mm,
    paper_height_mm: row.paper_height_mm,
    snap_grid_mm: row.snap_grid_mm,
    is_default: Boolean(row.is_default),
    canvas_schema: row.canvas_schema as unknown as Record<string, unknown>,
    printer_profile: row.printer_profile as unknown as Record<string, unknown>,
    updated_at: row.updated_at,
  };
}

export function fromLocalTemplate(row: LocalPrintTemplate): PrintTemplateRecord {
  return {
    id: row.id,
    business_id: row.business_id,
    branch_id: row.branch_id ?? null,
    name: row.name,
    document_type: row.document_type,
    paper_width_mm: row.paper_width_mm,
    paper_height_mm: row.paper_height_mm,
    snap_grid_mm: row.snap_grid_mm,
    is_default: Boolean(row.is_default),
    canvas_schema: row.canvas_schema as unknown as PrintTemplateRecord['canvas_schema'],
    printer_profile: row.printer_profile as unknown as PrintTemplateRecord['printer_profile'],
    updated_at: row.updated_at,
  };
}

/**
 * Replaces the business's cached print_templates inside Dexie.js so Edge POS
 * can compile and print custom templates cleanly while offline.
 */
export async function syncPrintTemplatesCache(
  businessId: string,
  templates: PrintTemplateRecord[]
): Promise<void> {
  if (!businessId) return;
  try {
    await dexieDB.transaction('rw', dexieDB.print_templates, async () => {
      const existing = await dexieDB.print_templates
        .where('business_id')
        .equals(businessId)
        .primaryKeys();
      if (existing.length > 0) {
        await dexieDB.print_templates.bulkDelete(existing);
      }
      if (templates.length > 0) {
        await dexieDB.print_templates.bulkPut(templates.map(toLocalTemplate));
      }
    });
  } catch {
    // Non-fatal IndexedDB failure in constrained private mode
  }
}

export async function getCachedPrintTemplates(businessId: string): Promise<PrintTemplateRecord[]> {
  if (!businessId) return [];
  try {
    const rows = await dexieDB.print_templates
      .where('business_id')
      .equals(businessId)
      .toArray();
    return rows.map(fromLocalTemplate);
  } catch {
    return [];
  }
}

export async function getCachedDefaultTemplate(
  businessId: string,
  preferredTypes: DocumentType[] = ['THERMAL_80MM', 'THERMAL_58MM', 'A4_INVOICE']
): Promise<PrintTemplateRecord | null> {
  const all = await getCachedPrintTemplates(businessId);
  for (const docType of preferredTypes) {
    const exactDefault = all.find((t) => t.document_type === docType && t.is_default);
    if (exactDefault) return exactDefault;
    const anyOfType = all.find((t) => t.document_type === docType);
    if (anyOfType) return anyOfType;
  }
  return all[0] ?? null;
}

export async function saveLocalPrinterDevice(device: LocalPrinterDevice): Promise<void> {
  try {
    await dexieDB.printer_devices.put(device);
  } catch {
    // Ignore storage error
  }
}

export async function listLocalPrinterDevices(businessId: string): Promise<LocalPrinterDevice[]> {
  if (!businessId) return [];
  try {
    return await dexieDB.printer_devices.where('business_id').equals(businessId).toArray();
  } catch {
    return [];
  }
}

export async function deleteLocalPrinterDevice(id: string): Promise<void> {
  try {
    await dexieDB.printer_devices.delete(id);
  } catch {
    // Ignore storage error
  }
}

