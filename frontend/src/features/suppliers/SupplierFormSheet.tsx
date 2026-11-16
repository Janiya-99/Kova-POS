import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, Hash, Mail, Phone, FileBadge, CalendarClock, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';

export interface SupplierRecord {
  id: string;
  business_id?: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  tax_id: string;
  payment_terms_days: number;
  created_at?: string;
  po_count?: number;
  grn_count?: number;
  invoice_count?: number;
  open_ap_balance?: string;
}

interface SupplierFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: SupplierRecord | null;
  onSaved?: (saved: SupplierRecord) => void;
}

export function SupplierFormSheet({
  open,
  onOpenChange,
  supplier,
  onSaved,
}: SupplierFormSheetProps) {
  const queryClient = useQueryClient();
  const isEditing = Boolean(supplier?.id);

  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [taxId, setTaxId] = React.useState('');
  const [paymentTermsDays, setPaymentTermsDays] = React.useState('30');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (supplier) {
      setCode(supplier.code || '');
      setName(supplier.name || '');
      setEmail(supplier.email || '');
      setPhone(supplier.phone || '');
      setTaxId(supplier.tax_id || '');
      setPaymentTermsDays(String(supplier.payment_terms_days || 30));
    } else {
      setCode('');
      setName('');
      setEmail('');
      setPhone('');
      setTaxId('');
      setPaymentTermsDays('30');
    }
  }, [open, supplier]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Supplier / vendor name is required');
      return;
    }
    const parsedTerms = Math.max(1, Number.parseInt(paymentTermsDays || '30', 10) || 30);

    setSaving(true);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: trimmedName,
        email: email.trim(),
        phone: phone.trim(),
        tax_id: taxId.trim().toUpperCase(),
        payment_terms_days: parsedTerms,
      };
      const res = await apiFetch<{ supplier: SupplierRecord }>(
        isEditing && supplier
          ? `/api/v1/suppliers/${supplier.id}`
          : '/api/v1/suppliers',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        }
      );

      toast.success(
        isEditing
          ? `Supplier ${res.supplier.name} updated`
          : `Supplier ${res.supplier.name} added`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
      onSaved?.(res.supplier);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to save supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg p-0 overflow-hidden">
        <div className="border-b border-border-theme px-5 py-4 pr-12">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              {isEditing ? `Edit Supplier • ${supplier?.name}` : 'Add New Supplier / Vendor'}
            </DialogTitle>
            <DialogDescription className="text-[11.5px]">
              Configure vendor procurement identity, VAT/Tax ID, and Net payment terms for POs &amp; GRNs.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-ink">
                Supplier / Company Name *
              </label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nordic Textile Mills Ltd"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Vendor Code</label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SUP-003 (auto)"
                  className="pl-8 font-mono uppercase"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Procurement Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="orders@vendor.com"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Phone Number</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1-212-555-0190"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Tax / VAT Registration ID</label>
              <div className="relative">
                <FileBadge className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-tax-id"
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value.toUpperCase())}
                  placeholder="US-VAT-88401"
                  className="pl-8 font-mono uppercase"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-ink">Payment Terms (Days)</label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" />
                <Input
                  data-testid="supplier-form-terms"
                  type="number"
                  min="1"
                  max="365"
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value)}
                  className="pl-8 tabular-nums"
                />
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                {[15, 30, 45, 60].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setPaymentTermsDays(String(d))}
                    className={`rounded-[var(--theme-radius-badge)] border px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition ${
                      Number(paymentTermsDays) === d
                        ? 'border-accent bg-accent-soft text-accent-soft-fg'
                        : 'border-border-theme bg-surface-muted text-ink-muted hover:text-ink'
                    }`}
                  >
                    Net {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 border-t border-border-theme pt-3.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <DynamicButton
              type="submit"
              variant="lavender"
              disabled={saving}
              icon={<Save className="h-3.5 w-3.5" />}
              data-testid="supplier-form-submit"
              className="min-h-[36px] text-xs"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Supplier Changes' : 'Add Supplier'}
            </DynamicButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

