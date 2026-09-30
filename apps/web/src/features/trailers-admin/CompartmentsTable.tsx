// Compartments (PLAN.md §4.9): the bed, oar boxes and tubes, rigger racks, storage.

import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { CompartmentKind } from '@srt/domain';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  COMPARTMENT_KIND_LABELS,
  defaultUnit,
  fieldKey,
  type CompartmentDraft,
  type DraftErrors,
} from './draft';
import { NumberInput, ReadValue } from './fields';

const KINDS = Object.keys(COMPARTMENT_KIND_LABELS) as CompartmentKind[];

export function CompartmentsTable({
  compartments,
  errors,
  readOnly,
  onChange,
  onAdd,
  onRemove,
}: {
  compartments: CompartmentDraft[];
  errors: DraftErrors;
  readOnly: boolean;
  onChange: (id: string, patch: Partial<CompartmentDraft>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const headingId = useId();
  const th = 'h-9 px-2 text-left text-sm font-medium whitespace-nowrap text-ink-2';
  const td = 'px-2 py-1.5 align-middle';
  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="font-display text-lg font-semibold">
            Compartments
          </h2>
          <p className="text-sm text-ink-2">
            Where riggers, oars, and slings ride. Drawn in the bed under the racks.
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
        <div className="relative overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-base" aria-labelledby={headingId}>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>
                  Kind
                </th>
                <th scope="col" className={cn(th, 'w-full')}>
                  Label
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
                        <ReadValue>{c.label}</ReadValue>
                      ) : (
                        <Input
                          value={c.label}
                          onChange={(e) => onChange(c.id, { label: e.target.value })}
                          aria-label={`Compartment ${i + 1}: label`}
                          aria-invalid={err('label') ? true : undefined}
                          title={err('label')}
                          className="min-w-48"
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
        </div>
      )}
    </section>
  );
}
