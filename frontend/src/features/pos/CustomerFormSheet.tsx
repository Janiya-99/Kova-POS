import * as React from 'react';
import { UserPlus, Upload, Phone, Mail, ShieldCheck } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DynamicButton } from '@/components/dqnamo/DynamicButton';
import { apiFetch } from '@/lib/api';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import type { POSCustomer } from './types';

interface CustomerFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (customer: POSCustomer) => void;
  customer?:
    | (POSCustomer & { tier?: string; credit_enabled?: boolean; credit_limit?: string | number })
    | null;
}

const LOYALTY_TIERS = ['Bronze', 'Silver', 'Gold'] as const;

export function CustomerFormSheet({
  open,
  onOpenChange,
  onCreated,
  customer,
}: CustomerFormSheetProps) {
  const { currencyCode, currencySymbol } = useCurrency();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [avatarUrl, setAvatarUrl] = React.useState('');
  const [creditEnabled, setCreditEnabled] = React.useState(false);
  const [creditLimit, setCreditLimit] = React.useState('500');
  const [tier, setTier] = React.useState<(typeof LOYALTY_TIERS)[number]>('Bronze');
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) {
      setErrors({});
      return;
    }
    if (customer) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setEmail(customer.email || '');
      setAvatarUrl(customer.avatar_url || '');
      setCreditEnabled(Boolean(customer.credit_enabled));
      setCreditLimit(String(customer.credit_limit || '500'));
      const t = ((customer.tier || customer.loyalty_tier) as (typeof LOYALTY_TIERS)[number]) || 'Bronze';
      setTier(LOYALTY_TIERS.includes(t) ? t : 'Bronze');
    } else {
      resetForm();
    }
  }, [open, customer]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Avatar image must be under 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setEmail('');
    setAvatarUrl('');
    setCreditEnabled(false);
    setCreditLimit('500');
    setTier('Bronze');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrs: Record<string, string> = {};
    const cleanName = name.trim();
    const cleanPhone = phone.replace(/[^0-9+]/g, '');

    if (!cleanName) nextErrs.name = 'Full Name is required';
    if (!cleanPhone || cleanPhone.length < 7) {
      nextErrs.phone = 'Enter a valid phone number (at least 7 digits)';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrs.email = 'Enter a valid email address';
    }
    if (creditEnabled && (Number(creditLimit) <= 0 || Number.isNaN(Number(creditLimit)))) {
      nextErrs.credit_limit = 'Credit limit must be greater than zero';
    }

    if (Object.keys(nextErrs).length > 0) {
      setErrors(nextErrs);
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const isEdit = Boolean(customer?.id);
      const res = await apiFetch<{ customer: POSCustomer }>(
        isEdit ? `/api/v1/customers/${customer?.id}` : '/api/v1/customers',
        {
          method: isEdit ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: cleanName,
            phone: phone.trim(),
            email: email.trim(),
            avatar_url: avatarUrl,
            credit_enabled: creditEnabled,
            credit_limit: creditEnabled ? Number(creditLimit).toFixed(2) : '0',
            tier,
          }),
        }
      );
      toast.success(
        isEdit
          ? `Customer ${res.customer.name} updated`
          : `Customer ${res.customer.name} added successfully`
      );
      onCreated(res.customer);
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || 'Unable to save customer';
      if (msg.toLowerCase().includes('phone')) {
        setErrors({ phone: msg });
      } else if (msg.toLowerCase().includes('email')) {
        setErrors({ email: msg });
      } else {
        setErrors({ form: msg });
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const initials = (name.trim() || 'NB')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <div className="mb-1 inline-flex items-center gap-2 text-xs font-bold text-accent">
            <UserPlus className="h-4 w-4" />
            <span>CRM & Loyalty Profile</span>
          </div>
          <SheetTitle>{customer ? 'Edit Customer' : 'Add Customer'}</SheetTitle>
          <SheetDescription>
            {customer
              ? 'Update CRM profile, loyalty tier, and customer credit limit.'
              : 'Register a customer into the tenant CRM & loyalty program without leaving the register.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 pb-6">
          {/* Avatar Circle Preview (2px theme border) */}
          <div className="flex items-center gap-4 rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-3.5">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-accent bg-surface flex items-center justify-center text-[13.5px] font-bold text-ink">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Customer avatar" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-bold text-ink">Customer Avatar (Optional)</p>
              <p className="text-[11px] text-ink-muted">Displays circular monogram initials by default</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[11px] font-semibold text-accent border border-border-theme hover:bg-accent-soft/40 transition cursor-pointer"
              >
                <Upload className="h-3 w-3" />
                Upload Photo
              </button>
            </div>
          </div>

          {errors.form && (
            <p className="rounded-[var(--theme-radius-control)] bg-[#EF4444]/10 px-3.5 py-2 text-xs font-semibold text-[#EF4444]">
              {errors.form}
            </p>
          )}

          {/* Primary Info Stack */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="cust-full-name" className="block text-xs font-semibold text-ink">
                Full Name <span className="text-[#EF4444]">*</span>
              </label>
              <Input
                id="cust-full-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Jane Doe"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && <p className="text-xs font-medium text-[#EF4444]">{errors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cust-phone" className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Phone className="h-3.5 w-3.5 text-accent" />
                <span>Phone Number</span>
                <span className="text-[#EF4444]">*</span>
              </label>
              <Input
                id="cust-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g., +1 (555) 000-0000"
                className="tabular-nums"
                aria-invalid={Boolean(errors.phone)}
              />
              {errors.phone && <p className="text-xs font-medium text-[#EF4444]">{errors.phone}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cust-email" className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Mail className="h-3.5 w-3.5 text-accent" />
                <span>Email (Optional)</span>
              </label>
              <Input
                id="cust-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g., jane@company.com"
                aria-invalid={Boolean(errors.email)}
              />
              {errors.email && <p className="text-xs font-medium text-[#EF4444]">{errors.email}</p>}
            </div>
          </div>

          {/* Loyalty Tier Segmented Pills */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink">Loyalty Tier</label>
            <div className="grid grid-cols-3 gap-2">
              {LOYALTY_TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`min-h-[42px] rounded-full px-3 text-xs font-bold transition cursor-pointer ${
                    tier === t
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'border border-border-theme bg-surface-muted text-ink hover:bg-accent-soft/45'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Progressive Credit & Billing Toggle */}
          <div className="rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-ink">
                  <ShieldCheck className="h-4 w-4 text-accent" />
                  <span>Enable Credit Line</span>
                </p>
                <p className="text-[11px] text-ink-muted">
                  Allow deferred store credit & balance settlement
                </p>
              </div>
              <Switch checked={creditEnabled} onCheckedChange={setCreditEnabled} />
            </div>

            {creditEnabled && (
              <div className="space-y-1.5 border-t border-border-theme pt-3">
                <label htmlFor="cust-credit-limit" className="block text-xs font-semibold text-ink">
                  Credit Limit ({currencySymbol.trim() || currencyCode})
                </label>
                <Input
                  id="cust-credit-limit"
                  type="number"
                  min="1"
                  step="0.01"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="tabular-nums"
                />
                {errors.credit_limit && (
                  <p className="text-xs font-medium text-[#EF4444]">{errors.credit_limit}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer Action */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border-theme pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="min-h-[38px] rounded-[var(--theme-radius-control)] px-4 text-xs font-semibold text-ink-muted hover:bg-surface-muted transition cursor-pointer"
            >
              Cancel
            </button>
            <DynamicButton type="submit" variant="lavender" loading={saving}>
              {customer ? 'Update Customer' : 'Save Customer'}
            </DynamicButton>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
