import * as React from 'react';
import { ShieldCheck, Delete, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TactileButton } from '@/components/dqnamo/TactileButton';
import { Badge } from '@/components/ui/badge';
import { apiFetch, ApiError } from '@/lib/api';
import { formatPermissionActionLabel } from '@/lib/formatLabel';
import { toast } from 'sonner';

interface SupervisorPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: 'pos:void_bill' | 'pos:refund' | 'pos:discount_override';
  actionLabel: string;
  onVerified: (overrideToken: string, reason: string, supervisorName: string) => void;
}

export function SupervisorPinModal({
  open,
  onOpenChange,
  action,
  actionLabel,
  onVerified,
}: SupervisorPinModalProps) {
  const [pin, setPin] = React.useState('');
  const [reason, setReason] = React.useState('Customer Changed Mind');
  const [verifying, setVerifying] = React.useState(false);
  const [cooldownSec, setCooldownSec] = React.useState(0);

  React.useEffect(() => {
    if (!open) setPin('');
  }, [open]);

  React.useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = window.setInterval(() => {
      setCooldownSec((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldownSec]);

  const appendDigit = (digit: string) => {
    if (cooldownSec > 0) return;
    if (pin.length < 6) {
      setPin((prev) => prev + digit);
    }
  };

  const handleVerify = async () => {
    if (cooldownSec > 0) return;
    if (pin.length !== 6) {
      toast.error('Enter the 6-digit supervisor PIN');
      return;
    }
    setVerifying(true);
    try {
      const res = await apiFetch<{
        override_token: string;
        supervisor: { supervisor_name: string };
      }>('/api/v1/auth/verify-pin', {
        method: 'POST',
        body: JSON.stringify({ pin, action, reason }),
      });
      toast.success(`Approved by ${res.supervisor.supervisor_name}`);
      onVerified(res.override_token, reason, res.supervisor.supervisor_name);
      onOpenChange(false);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 429) {
        const wait = err.retryAfterSeconds || 60;
        setCooldownSec(wait);
      }
      toast.error(err.message || 'Invalid supervisor PIN');
      setPin('');
    } finally {
      setVerifying(false);
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[380px]">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="lavender">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <span>Supervisor Override</span>
            </Badge>
          </div>
          <DialogTitle>Manager Approval Required</DialogTitle>
          <DialogDescription>
            Authorizing <span className="rounded bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-ink">{formatPermissionActionLabel(action)}</span> for {actionLabel}. Enter an authorized manager's 6-digit supervisor PIN.
          </DialogDescription>
        </DialogHeader>

        {cooldownSec > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-[var(--theme-radius-inner)] border border-[#EF4444]/30 bg-[#EF4444]/10 px-3 py-2 text-[11.5px] font-semibold text-[#EF4444]">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span className="tabular-nums">PIN verification locked — retry in {cooldownSec}s</span>
          </div>
        )}

        {/* 6 Circular PIN Dot Indicators */}
        <div className="my-4 flex items-center justify-center gap-3">
          {Array.from({ length: 6 }).map((_, idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={`h-4 w-4 rounded-full border-2 transition-all ${
                  filled
                    ? 'scale-110 border-accent bg-accent'
                    : 'border-border-theme bg-surface-muted'
                }`}
              />
            );
          })}
        </div>

        {/* Reason Selector */}
        <div className="mb-4 space-y-1.5">
          <label className="block text-xs font-semibold text-ink-muted">Override Reason</label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Customer Changed Mind">Customer Changed Mind</SelectItem>
              <SelectItem value="Damaged Batch">Damaged Batch</SelectItem>
              <SelectItem value="Pricing Error">Pricing Error</SelectItem>
              <SelectItem value="Loyalty VIP Courtesy">Loyalty VIP Courtesy</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 3x4 Compressible 3D Tactile PIN Keypad */}
        <div className="grid grid-cols-3 gap-2.5">
          {keys.map((k) => (
            <TactileButton key={k} onClick={() => appendDigit(k)} className="text-[13.5px]">
              {k}
            </TactileButton>
          ))}
          <TactileButton
            tone="soft"
            onClick={() => setPin((p) => p.slice(0, -1))}
            aria-label="Backspace"
          >
            <Delete className="h-4.5 w-4.5" />
          </TactileButton>
          <TactileButton onClick={() => appendDigit('0')} className="text-[13.5px]">
            0
          </TactileButton>
          <TactileButton
            tone="lavender"
            disabled={pin.length !== 6 || verifying || cooldownSec > 0}
            onClick={handleVerify}
          >
            {verifying ? '...' : cooldownSec > 0 ? `${cooldownSec}s` : 'Verify'}
          </TactileButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
