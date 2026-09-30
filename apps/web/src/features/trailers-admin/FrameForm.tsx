// The trailer's own fields: name, style, frame, width, post offset, orientation, notes.

import { useId, type ReactNode } from 'react';
import { meters, type TrailerStyle } from '@srt/domain';
import { cn } from '@/lib/cn';
import { STYLE_LABELS } from '@/components/trailer/labels';
import { Switch } from '@/components/ui/controls';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { DraftErrors, TrailerDraft } from './draft';
import { NumberInput, ReadValue } from './fields';

function ReadField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="text-base text-ink">{children}</dd>
    </div>
  );
}

function lengthHint(cm: number | null): string | undefined {
  return cm !== null && Number.isFinite(cm) && cm > 0 ? `${meters(cm)} m` : undefined;
}

export function FrameForm({
  draft,
  errors,
  readOnly,
  onChange,
}: {
  draft: TrailerDraft;
  errors: DraftErrors;
  readOnly: boolean;
  onChange: (patch: Partial<TrailerDraft>) => void;
}) {
  const id = useId();
  const headingId = `${id}-heading`;
  const f = (name: string) => `${id}-${name}`;

  if (readOnly) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        <h2 id={headingId} className="font-display text-lg font-semibold">
          Frame
        </h2>
        <dl className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
          <ReadField label="Style">{STYLE_LABELS[draft.style]}</ReadField>
          <ReadField label="Frame length">
            <ReadValue>
              {draft.frameLengthCm} cm
              {lengthHint(draft.frameLengthCm) ? ` (${lengthHint(draft.frameLengthCm)})` : ''}
            </ReadValue>
          </ReadField>
          <ReadField label="Width">
            <ReadValue>{draft.widthCm} cm</ReadValue>
          </ReadField>
          {draft.style === 'offset_post' && (
            <ReadField label="Post offset">
              <ReadValue>{draft.postOffsetPct}% across</ReadValue>
            </ReadField>
          )}
          <ReadField label="Boats face">
            {draft.bowForwardDefault ? 'Bows forward' : 'Sterns forward, bows trailing'}
          </ReadField>
          {draft.notes && (
            <ReadField label="Notes" className="sm:col-span-2">
              <span className="whitespace-pre-line">{draft.notes}</span>
            </ReadField>
          )}
        </dl>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="font-display text-lg font-semibold">
        Frame
      </h2>
      <div className="grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
        <Field id={f('name')} label="Name" error={errors.name} className="sm:col-span-2">
          <Input
            id={f('name')}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${f('name')}-error` : undefined}
          />
        </Field>
        <Field id={f('style')} label="Style">
          <Select<TrailerStyle>
            id={f('style')}
            value={draft.style}
            onValueChange={(style) =>
              onChange({
                style,
                ...(style === 'offset_post' && draft.postOffsetPct === null
                  ? { postOffsetPct: 33 }
                  : {}),
              })
            }
            options={(Object.keys(STYLE_LABELS) as TrailerStyle[]).map((s) => ({
              value: s,
              label: STYLE_LABELS[s],
            }))}
            className="w-full"
          />
        </Field>
        {draft.style === 'offset_post' ? (
          <Field
            id={f('post')}
            label="Post offset, % across"
            hint="From the left, seen from the back. The club’s trailers: 33."
            error={errors.postOffsetPct}
          >
            <NumberInput
              id={f('post')}
              value={draft.postOffsetPct}
              onValueChange={(postOffsetPct) => onChange({ postOffsetPct })}
              error={errors.postOffsetPct}
              aria-describedby={errors.postOffsetPct ? `${f('post')}-error` : `${f('post')}-hint`}
            />
          </Field>
        ) : (
          <div className="hidden sm:block" />
        )}
        <Field
          id={f('length')}
          label="Frame length, cm"
          hint={lengthHint(draft.frameLengthCm)}
          error={errors.frameLengthCm}
        >
          <NumberInput
            id={f('length')}
            value={draft.frameLengthCm}
            onValueChange={(frameLengthCm) => onChange({ frameLengthCm })}
            error={errors.frameLengthCm}
            aria-describedby={errors.frameLengthCm ? `${f('length')}-error` : undefined}
          />
        </Field>
        <Field id={f('width')} label="Width, cm" hint="Inside the uprights." error={errors.widthCm}>
          <NumberInput
            id={f('width')}
            value={draft.widthCm}
            onValueChange={(widthCm) => onChange({ widthCm })}
            error={errors.widthCm}
            aria-describedby={errors.widthCm ? `${f('width')}-error` : `${f('width')}-hint`}
          />
        </Field>
        <div className="flex items-start gap-3 sm:col-span-2">
          <Switch
            id={f('bow')}
            checked={draft.bowForwardDefault}
            onCheckedChange={(bowForwardDefault) => onChange({ bowForwardDefault })}
            aria-describedby={`${f('bow')}-hint`}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <label htmlFor={f('bow')} className="text-sm font-medium text-ink">
              Bows face forward
            </label>
            <p id={`${f('bow')}-hint`} className="text-sm text-ink-2">
              Off: sterns toward the truck and bows trailing, the usual way.
            </p>
          </div>
        </div>
        <Field id={f('notes')} label="Notes" className="sm:col-span-2">
          <Textarea
            id={f('notes')}
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            rows={2}
          />
        </Field>
      </div>
    </section>
  );
}
