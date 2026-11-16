import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import { getThemeDefinition, useThemeStore } from '@/store/themeStore';

const ZonaSwal = withReactContent(Swal);

export interface ConfirmDialogOptions {
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel?: string;
}

function getActiveAccentColor(): string {
  const { themeId, customAccent } = useThemeStore.getState();
  return customAccent || getThemeDefinition(themeId).tokens['--theme-accent'];
}

/**
 * Dynamic themed confirmation modal using a light glass blur backdrop (Zero Dim Black Screen)
 * and explicit action-verb buttons per ui-ux-design Section 9.2.
 */
export async function confirmAction({
  title,
  text,
  confirmLabel,
  cancelLabel = 'Keep Current State',
}: ConfirmDialogOptions): Promise<boolean> {
  const result = await ZonaSwal.fire({
    title,
    text,
    icon: 'question',
    iconColor: getActiveAccentColor(),
    showCancelButton: true,
    confirmButtonText: confirmLabel,
    cancelButtonText: cancelLabel,
    buttonsStyling: false,
    customClass: {
      container: 'zona-swal-backdrop',
      popup: 'zona-swal-popup',
      title: 'text-[16px] font-bold text-ink',
      htmlContainer: 'text-[12.5px] text-ink-muted leading-relaxed',
      actions: 'gap-3 mt-5',
      confirmButton:
        'inline-flex items-center justify-center min-h-[38px] px-5 rounded-[var(--theme-radius-control)] bg-accent text-accent-fg text-xs font-semibold hover:opacity-90 transition cursor-pointer',
      cancelButton:
        'inline-flex items-center justify-center min-h-[38px] px-5 rounded-[var(--theme-radius-control)] bg-surface-muted text-ink text-xs font-semibold hover:bg-accent-soft/50 transition cursor-pointer',
    },
  });
  return result.isConfirmed;
}

/**
 * Destructive confirmation modal with clear warning cue and explicit verb button copy.
 */
export async function confirmDestructiveAction({
  title,
  text,
  confirmLabel,
  cancelLabel = 'Cancel & Keep',
}: ConfirmDialogOptions): Promise<boolean> {
  const result = await ZonaSwal.fire({
    title,
    text,
    icon: 'warning',
    iconColor: '#EF4444',
    showCancelButton: true,
    confirmButtonText: confirmLabel,
    cancelButtonText: cancelLabel,
    buttonsStyling: false,
    customClass: {
      container: 'zona-swal-backdrop',
      popup: 'zona-swal-popup',
      title: 'text-[16px] font-bold text-ink',
      htmlContainer: 'text-[12.5px] text-ink-muted leading-relaxed',
      actions: 'gap-3 mt-5',
      confirmButton:
        'inline-flex items-center justify-center min-h-[38px] px-5 rounded-[var(--theme-radius-control)] bg-[#EF4444] text-white text-xs font-semibold hover:bg-[#DC2626] transition cursor-pointer',
      cancelButton:
        'inline-flex items-center justify-center min-h-[38px] px-5 rounded-[var(--theme-radius-control)] bg-surface-muted text-ink text-xs font-semibold hover:bg-accent-soft/50 transition cursor-pointer',
    },
  });
  return result.isConfirmed;
}
