// A shell's photo (PLAN.md §4.7, Phase 3): shown in the drawer, and for coaches a slot to drop
// or pick a photo, replace it, or remove it. The store downscales the photo before keeping it;
// while it saves, the picked file shows as a preview. Also the small thumbnail for the table.

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { ImagePlus, ImageUp, Trash2 } from 'lucide-react';
import { shellLabel, type Shell } from '@srt/domain';
import {
  looksLikePhoto,
  NOT_A_PHOTO,
  PHOTO_TYPES,
  useFileUrl,
  useRemoveFile,
  useUploadFile,
} from '@/data';
import { cn } from '@/lib/cn';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from './parts';

const ACCEPT = PHOTO_TYPES.join(',');

/** "Photo of Peggy". */
export function photoAlt(shell: Pick<Shell, 'name' | 'nickname'>): string {
  return `Photo of ${shellLabel(shell)}`;
}

/** A local preview of the picked file while it saves; released when replaced or unmounted. */
function usePreview(): [string | null, (file: Blob | null) => void] {
  const ref = useRef<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const show = useCallback((file: Blob | null) => {
    if (ref.current) URL.revokeObjectURL(ref.current);
    ref.current = null;
    try {
      if (file) ref.current = URL.createObjectURL(file);
    } catch {
      // No object URLs (tests): the stored photo shows once saved.
    }
    setUrl(ref.current);
  }, []);
  useEffect(
    () => () => {
      if (ref.current) URL.revokeObjectURL(ref.current);
    },
    [],
  );
  return [url, show];
}

/** The first file in a drop, if it is one. */
function droppedFile(e: DragEvent): File | null {
  return e.dataTransfer?.files?.[0] ?? null;
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function ShellPhoto({ shell, canEdit }: { shell: Shell; canEdit: boolean }) {
  const id = useId();
  const fileUrl = useFileUrl();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [preview, showPreview] = usePreview();
  const name = shellLabel(shell);

  const upload = useUploadFile('shells', {
    onSuccess: () => toast.success(`Photo of ${name} saved`),
  });
  const remove = useRemoveFile('shells', {
    onSuccess: () => toast.success(`Photo of ${name} removed`),
  });

  const pick = (file: File | null | undefined) => {
    if (!file) return;
    if (!looksLikePhoto(file.type, file.name)) {
      setError(NOT_A_PHOTO);
      return;
    }
    setError(null);
    showPreview(file);
    upload.mutate(
      { id: shell.id, field: 'photoUrl', file },
      { onSettled: () => showPreview(null) },
    );
  };

  const stored = fileUrl('shells', shell, 'photoUrl', { thumb: '320x0' });
  const src = preview ?? stored;
  const saving = upload.isPending;
  const busy = saving || remove.isPending;

  if (!canEdit && !src) return null;

  const dropProps = canEdit
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) pick(droppedFile(e));
        },
      }
    : {};

  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2" {...dropProps}>
      <h3 id={`${id}-heading`} className="text-md font-medium">
        Photo
      </h3>
      {src ? (
        <figure
          className={cn(
            'relative overflow-hidden rounded-card border bg-surface-2',
            dragging ? 'border-accent ring-2 ring-accent' : 'border-line',
          )}
        >
          <img
            src={src}
            alt={photoAlt(shell)}
            decoding="async"
            className={cn('block max-h-72 w-full object-contain', saving && 'opacity-60')}
          />
          {(saving || dragging) && (
            <figcaption
              role="status"
              className="absolute inset-x-0 bottom-0 bg-surface px-3 py-1.5 text-sm text-ink"
            >
              {saving ? 'Saving the photo…' : 'Drop to replace the photo'}
            </figcaption>
          )}
        </figure>
      ) : (
        <div
          className={cn(
            'flex flex-col items-center gap-2 rounded-card border border-dashed px-4 py-6 text-center',
            dragging ? 'border-accent bg-accent-tint' : 'border-line-strong bg-surface',
          )}
        >
          <ImagePlus aria-hidden className="size-6 text-ink-2" />
          <p className="text-base text-ink">Drop a photo here, or choose one.</p>
          <p className="text-sm text-ink-2">
            JPEG, PNG, or WebP. Large photos are made smaller before saving.
          </p>
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ImageUp aria-hidden />
            Choose a photo
          </Button>
        </div>
      )}
      {canEdit && src && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            <ImageUp aria-hidden />
            Replace photo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmRemove(true)}
            disabled={busy || !stored}
            className="text-danger"
          >
            <Trash2 aria-hidden />
            Remove photo
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          aria-label={`Photo of ${name}`}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      )}
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove the photo of ${name}?`}
        description="The photo is deleted. You can add another one at any time."
        confirmLabel="Remove photo"
        onConfirm={() => remove.mutate({ id: shell.id, field: 'photoUrl' })}
      />
    </section>
  );
}

/** A square thumbnail for tables and cards; nothing when the shell has no photo. */
export function ShellThumb({ shell, className }: { shell: Shell; className?: string }) {
  const fileUrl = useFileUrl();
  const src = fileUrl('shells', shell, 'photoUrl', { thumb: '96x96' });
  if (!src) return null;
  return (
    <img
      src={src}
      alt={photoAlt(shell)}
      loading="lazy"
      decoding="async"
      className={cn(
        'size-8 shrink-0 rounded-control border border-line bg-surface-2 object-cover',
        className,
      )}
    />
  );
}
