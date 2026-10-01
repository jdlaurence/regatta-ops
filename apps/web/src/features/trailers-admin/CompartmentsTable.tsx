// Compartments (PLAN.md §4.9): the bed's zones along the trailer's length (riggers, oars,
// slings), oar boxes and tubes, rigger racks, storage. Each sits from a distance from the front
// of the frame to another, across the bed's full width; both blank runs the whole length.

import { useId } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import type { CompartmentKind } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ScrollRegion } from '@/components/ScrollRegion';
import {
  COMPARTMENT_KIND_LABELS,
  defaultUnit,
  fieldKey,
  type CompartmentDraft,
  type DraftErrors,
} from './draft';
import { NumberInput, ReadValue } from './fields';

const KINDS = Object.keys(COMPARTMENT_KIND_LABELS) as CompartmentKind[];

/** A position in cm as text for people who cannot edit, or what a blank one means. */
function positionText(v: number | null, blank: string): string {
  return v !== null && Number.isFinite(v) ? String(v) : blank;
}

export function CompartmentsTable({
  compartments,
  frameLengthCm,
  errors,
  warnings = [],
  readOnly,
  onChange,
  onAdd,
  onRemove,
}: {
  compartments: CompartmentDraft[];
  /** The draft's frame length, for the "To" placeholder (the back of the frame). */
  frameLengthCm: number | null;
  errors: DraftErrors;
  /** Overlaps and the like: shown, but they do not stop a save. */
  warnings?: string[];
  readOnly: boolean;
  onChange: (id: string, patch: Partial<CompartmentDraft>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const headingId = useId();
  const th = 'h-9 px-2 text-left text-sm font-medium whitespace-nowrap text-ink-2';
  const td = 'px-2 py-1.5 align-middle';
  const back =
    frameLengthCm !== null && Number.isFinite(frameLengthCm) && frameLengthCm > 0
      ? String(frameLengthCm)
      : '';
  const problems = compartments.flatMap((c, i) =>
    Object.entries(errors)
      .filter(([k]) => k.startsWith(`compartment:${c.id}:`))
      .map(([k, msg]) => ({ key: k, text: `${c.label.trim() || `Compartment ${i + 1}`}: ${msg}` })),
  );
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="font-display text-lg font-semibold">
            Compartments
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Where riggers, oars, and slings ride in the bed, as zones along the trailer from the
            front of the frame, each across the full width. Leave From front blank for the front and
            To blank for the back; both blank runs the whole length.
          </p>
        </div>
        {!readOnly && (
          <Button size="sm" onClick={onAdd}>
            <Plus aria-hidden />
            Add compartment
          </Button>
        )}
      </div>
      {compartments.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong/60 px-4 py-5 text-base text-ink-2">
          No compartments yet.{' '}
          {readOnly ? '' : 'Add the bed, an oar box, or a rigger rack with Add compartment.'}
        </p>
      ) : (
        <ScrollRegion
          label="Compartments"
          className="relative overflow-x-auto rounded-card border border-line bg-surface"
        >
          <table className="w-full border-collapse text-base" aria-labelledby={headingId}>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={cn(th, 'w-full')}>
                  Label
                </th>
                <th scope="col" className={th}>
                  From front (cm)
                </th>
                <th scope="col" className={th}>
                  To (cm)
                </th>
                <th scope="col" className={th}>
                  Kind
                </th>
                <th scope="col" className={th}>
                  Capacity
                </th>
                <th scope="col" className={th}>
                  Counted in
                </th>
                {!readOnly && (
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {compartments.map((c, i) => {
                const name = c.label.trim() || `Compartment ${i + 1}`;
                const err = (f: keyof CompartmentDraft) => errors[fieldKey.compartment(c.id, f)];
                return (
                  <tr key={c.id} className="border-b border-line last:border-b-0">
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{c.label}</ReadValue>
                      ) : (
                        <Input
                          value={c.label}
                          onChange={(e) => onChange(c.id, { label: e.target.value })}
                          aria-label={`Compartment ${i + 1}: label`}
                          aria-invalid={err('label') ? true : undefined}
                          title={err('label')}
                          className="min-w-36"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>
                          {positionText(c.startCm, c.endCm !== null ? '0' : 'Whole length')}
                        </ReadValue>
                      ) : (
                        <NumberInput
                          value={c.startCm}
                          onValueChange={(startCm) => onChange(c.id, { startCm })}
                          error={err('startCm')}
                          placeholder="0"
                          aria-label={`${name}: from front in cm`}
                          className="w-20"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>
                          {positionText(c.endCm, c.startCm !== null ? back || 'Back' : '—')}
                        </ReadValue>
                      ) : (
                        <NumberInput
                          value={c.endCm}
                          onValueChange={(endCm) => onChange(c.id, { endCm })}
                          error={err('endCm')}
                          placeholder={back}
                          aria-label={`${name}: to in cm`}
                          className="w-20"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue className="whitespace-nowrap">
                          {COMPARTMENT_KIND_LABELS[c.kind]}
                        </ReadValue>
                      ) : (
                        <Select<CompartmentKind>
                          value={c.kind}
                          label={`${name}: kind`}
                          onValueChange={(kind) =>
                            onChange(c.id, {
                              kind,
                              ...(c.capacityUnit === defaultUnit(c.kind)
                                ? { capacityUnit: defaultUnit(kind) }
                                : {}),
                            })
                          }
                          options={KINDS.map((k) => ({
                            value: k,
                            label: COMPARTMENT_KIND_LABELS[k],
                          }))}
                          className="w-36"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{c.capacity ?? '—'}</ReadValue>
                      ) : (
                        <NumberInput
                          value={c.capacity}
                          onValueChange={(capacity) => onChange(c.id, { capacity })}
                          error={err('capacity')}
                          aria-label={`${name}: capacity`}
                          className="w-20"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{c.capacityUnit}</ReadValue>
                      ) : (
                        <Input
                          value={c.capacityUnit}
                          onChange={(e) => onChange(c.id, { capacityUnit: e.target.value })}
                          aria-label={`${name}: capacity counted in`}
                          className="w-24"
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className={cn(td, 'pr-3')}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${name}`}
                          onClick={() => onRemove(c.id)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollRegion>
      )}
      {problems.length > 0 && (
        <ul
          className="flex flex-col gap-1 text-sm text-danger"
          aria-label="Compartment fields to fix"
        >
          {problems.map((p) => (
            <li key={p.key}>{p.text}</li>
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-ink" aria-label="Compartments to check">
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-1.5">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
