import * as React from 'react';
import { UploadCloud, FileCheck2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface UploadedFileItem {
  name: string;
  dataUrl: string;
}

export interface MagneticDropZoneProps {
  onFileSelected: (fileName: string, file?: File) => void;
  selectedFileName?: string;
  accept?: string;
  label?: string;
  helperText?: string;
  maxSizeMB?: number;
  maxFiles?: number;
  previewUrls?: string[];
  onFilesChanged?: (items: UploadedFileItem[]) => void;
  className?: string;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/**
 * dqnamo.com/kitchen magnetic file drop zone for GRN supplier invoices, logos (<2MB) & up to 5 SKU images.
 */
export function MagneticDropZone({
  onFileSelected,
  selectedFileName,
  accept = '.pdf,.csv,.png,.jpg,.jpeg,.webp,.svg',
  label = 'Drop supplier invoice PDF or click to attach',
  helperText,
  maxSizeMB = 10,
  maxFiles = 1,
  previewUrls,
  onFilesChanged,
  className,
}: MagneticDropZoneProps) {
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    const maxBytes = maxSizeMB * 1024 * 1024;
    const validFiles: File[] = [];

    for (const f of files) {
      if (f.size > maxBytes) {
        toast.error(`${f.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }
      validFiles.push(f);
    }
    if (validFiles.length === 0) return;

    const first = validFiles[0];
    onFileSelected(first.name, first);

    if (onFilesChanged) {
      const existing = (previewUrls || []).map((url, i) => ({
        name: `image-${i + 1}`,
        dataUrl: url,
      }));
      const remainingSlots = Math.max(0, maxFiles - existing.length);
      const batch = maxFiles === 1 ? validFiles.slice(0, 1) : validFiles.slice(0, remainingSlots || maxFiles);
      const encoded = await Promise.all(
        batch.map(async (f) => ({
          name: f.name,
          dataUrl: await readAsDataURL(f),
        }))
      );
      const next = maxFiles === 1 ? encoded : [...existing, ...encoded].slice(0, maxFiles);
      onFilesChanged(next);
    }
  };

  const removeAt = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onFilesChanged || !previewUrls) return;
    const next = previewUrls
      .filter((_, i) => i !== idx)
      .map((url, i) => ({ name: `image-${i + 1}`, dataUrl: url }));
    onFilesChanged(next);
  };

  const previews = (previewUrls || []).filter(Boolean);

  return (
    <div className="space-y-2.5">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--theme-radius-inner)] border-2 border-dashed p-3.5 text-center transition-colors duration-150',
          dragging
            ? 'scale-[1.01] border-accent bg-accent-soft/45 shadow-inner'
            : 'border-border-theme bg-surface-muted/75 hover:border-accent hover:bg-accent-soft/25',
          className
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={maxFiles > 1}
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {selectedFileName && maxFiles === 1 && previews.length === 0 ? (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
              <FileCheck2 className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">{selectedFileName}</p>
            <p className="text-[11px] text-ink-muted">Click or drop another file to replace</p>
          </>
        ) : (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-soft-fg">
              <UploadCloud className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-ink">{label}</p>
            <p className="text-[11px] text-ink-muted">
              {helperText ||
                `${maxFiles > 1 ? `Up to ${maxFiles} images • ` : ''}Max ${maxSizeMB}MB per file`}
            </p>
          </>
        )}
      </div>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2.5">
          {previews.map((url, idx) => (
            <div
              key={`${idx}-${url.slice(0, 24)}`}
              className="group relative h-16 w-16 overflow-hidden rounded-[var(--theme-radius-inner)] border border-border-theme bg-surface-muted"
            >
              <img src={url} alt={`Upload ${idx + 1}`} className="h-full w-full object-cover" />
              {onFilesChanged && (
                <button
                  type="button"
                  onClick={(e) => removeAt(idx, e)}
                  aria-label="Remove uploaded image"
                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-contrast text-contrast-fg opacity-90 hover:bg-[#EF4444] hover:text-white transition cursor-pointer"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
