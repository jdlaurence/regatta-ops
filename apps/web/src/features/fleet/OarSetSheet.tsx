// The oar set drawer (PLAN.md §4.7): every field of a set, and where it is used next. The same
// form adds a new set.

import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { BASE_KEYS, oarSetSchema, requiredText, type OarSet } from '@regatta-ops/domain';
import { useCan, useCreate, useDelete, useRecord, useUpdate } from '@/data';
import { OarChip, TeamChip } from '@/components/chips';
import { ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { changedFields, NumberField, SelectField } from './form-fields';
import { teamOptions, useFleetTeams, useUpcomingUsage } from './hooks';
import { AFFINITY_LABELS, AFFINITY_ORDER, OAR_TYPE_LABELS, oarCountText } from './lib';
import { ConfirmDialog, STATUS_OPTIONS, StatusLabel, UpcomingUse } from './parts';

const oarSetFormSchema = oarSetSchema.omit(BASE_KEYS).extend({
  name: requiredText('Enter the oar set name'),
  count: z
    .number('Enter how many oars are in the set')
    .int('Enter a whole number')
    .min(1, 'Enter at least one oar'),
});

export type OarSetFormValues = z.infer<typeof oarSetFormSchema>;

/** Typical sizes (§16.1), shown as placeholders. */
const TYPICAL = {
  sweep: { length: 374, inboard: 114 },
  scull: { length: 288, inboard: 88 },
} as const;

export function newOarSetInput(): OarSetFormValues {
  return {
    name: '',
    type: 'sweep',
    color: '',
    count: 8,
    blade: '',
    lengthCm: null,
    inboardCm: null,
    gripMm: null,
    genderAffinity: 'any',
    homeTeamId: null,
    status: 'in_service',
    notes: '',
  };
}

function toForm(set: OarSet): OarSetFormValues {
  const { id: _id, created: _c, updated: _u, ...rest } = set;
  return { ...newOarSetInput(), ...rest };
}

function clean(v: OarSetFormValues): OarSetFormValues {
  const trim = (s: string | undefined) => (s ?? '').trim();
  return {
    ...v,
    name: v.name.trim(),
    color: trim(v.color).toLowerCase(),
    blade: trim(v.blade),
    notes: trim(v.notes),
  };
}

export function OarSetSheet({
  open,
  onOpenChange,
  oarSetId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null adds a new set. */
  oarSetId: string | null;
  onCreated?: (id: string) => void;
}) {
  const record = useRecord('oar_sets', oarSetId);
  const set = record.data ?? null;
  const title = oarSetId ? (set ? `Oar set ${set.name}` : 'Oar set') : 'New oar set';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title} className="w-[min(100vw,480px)] overflow-hidden">
        {oarSetId ? (
          record.isError ? (
            <div className="p-4">
              <ErrorState
                title="This oar set did not load."
                error={record.error}
                onRetry={() => void record.refetch()}
              />
            </div>
          ) : record.isPending ? (
            <div className="p-4">
              <SkeletonRows rows={8} />
            </div>
          ) : !set ? (
            <p className="p-4 text-base text-ink-2">
              This oar set is no longer in the fleet. Someone may have deleted it.
            </p>
          ) : (
            <OarSetForm key={set.id} set={set} onDone={() => onOpenChange(false)} />
          )
        ) : (
          <OarSetForm key="new" onDone={(id) => (id ? onCreated?.(id) : onOpenChange(false))} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function OarSetForm({ set, onDone }: { set?: OarSet; onDone: (createdId: string | null) => void }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const canEdit = useCan('fleet.edit');
  const { teams, byId } = useFleetTeams();
  const usage = useUpcomingUsage('oarSet', set?.id ?? null);
  const update = useUpdate('oar_sets');
  const create = useCreate('oar_sets');
  const remove = useDelete('oar_sets');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<OarSetFormValues>({
    resolver: zodResolver(oarSetFormSchema),
    defaultValues: set ? toForm(set) : newOarSetInput(),
  });
  const { control, register, formState } = form;
  const errors = formState.errors;
  const values = useWatch({ control }) as OarSetFormValues;
  const typical = TYPICAL[values.type];

  const onSubmit = form.handleSubmit(async (raw) => {
    const next = clean(raw);
    try {
      if (set) {
        const patch = changedFields(clean(toForm(set)), next);
        if (Object.keys(patch).length === 0) return;
        await update.mutateAsync({ id: set.id, patch });
        toast.success('Changes saved');
        form.reset(raw);
      } else {
        const created = await create.mutateAsync(next);
        toast.success(`Oar set ${next.name} added`);
        onDone(created.id);
      }
    } catch {
      // The mutation's toast says what went wrong; the form keeps the edits.
    }
  });

  const team = set?.homeTeamId ? byId.get(set.homeTeamId) : undefined;
  const saving = update.isPending || create.isPending;

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {set && (
          <div className="flex flex-wrap items-center gap-2">
            <OarChip oarSet={{ ...set, status: 'in_service' }} />
            <span className="text-sm text-ink-2">
              {OAR_TYPE_LABELS[set.type]}, {oarCountText(set)}
            </span>
            <StatusLabel status={set.status} className="text-sm" />
            {team && <TeamChip team={team} short size="sm" />}
          </div>
        )}
        {set && (
          <section aria-labelledby={f('usage')} className="flex flex-col gap-2">
            <h3 id={f('usage')} className="text-md font-medium">
              Upcoming use{usage.count > 0 && ` (${usage.count})`}
            </h3>
            <UpcomingUse usage={usage} teamsById={byId} noun="oar set" />
          </section>
        )}

        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
          <h3 className="border-b border-line pb-1.5 text-md font-medium">Details</h3>
          <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
            <Field id={f('name')} label="Name" error={errors.name?.message}>
              <Input
                id={f('name')}
                placeholder="24-C"
                autoFocus={!set}
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? `${f('name')}-error` : undefined}
                {...register('name')}
              />
            </Field>
            <Field
              id={f('color')}
              label="Color code"
              hint="How people find the set at the trailer."
            >
              <Input
                id={f('color')}
                placeholder="yellow-red"
                aria-describedby={`${f('color')}-hint`}
                {...register('color')}
              />
            </Field>
            <SelectField
              control={control}
              name="type"
              id={f('type')}
              label="Type"
              options={(['sweep', 'scull'] as const).map((t) => ({
                value: t,
                label: OAR_TYPE_LABELS[t],
              }))}
            />
            <NumberField
              control={control}
              name="count"
              id={f('count')}
              label="Count"
              step="1"
              hint={
                values.type === 'scull'
                  ? 'Single sculls: 8 is 4 pairs.'
                  : 'Oars in the set, spares included.'
              }
            />
            <Field id={f('blade')} label="Blade and shaft" className="sm:col-span-2">
              <Input id={f('blade')} placeholder="S2V Skinny" {...register('blade')} />
            </Field>
            <NumberField
              control={control}
              name="lengthCm"
              id={f('length')}
              label="Length (cm)"
              placeholder={String(typical.length)}
            />
            <NumberField
              control={control}
              name="inboardCm"
              id={f('inboard')}
              label="Inboard (cm)"
              placeholder={String(typical.inboard)}
            />
            <NumberField control={control} name="gripMm" id={f('grip')} label="Grip (mm)" />
            <SelectField
              control={control}
              name="genderAffinity"
              id={f('affinity')}
              label="Gender affinity"
              options={AFFINITY_ORDER.map((a) => ({ value: a, label: AFFINITY_LABELS[a] }))}
            />
            <SelectField
              control={control}
              name="homeTeamId"
              id={f('team')}
              label="Home team"
              notSet="No home team"
              options={teamOptions(teams, values.homeTeamId)}
            />
            <SelectField
              control={control}
              name="status"
              id={f('status')}
              label="Status"
              options={STATUS_OPTIONS}
            />
            <Field
              id={f('notes')}
              label="Notes"
              hint='Anything a coach should know at the trailer, like "only 3 pairs".'
              className="sm:col-span-2"
            >
              <Textarea
                id={f('notes')}
                rows={3}
                aria-describedby={`${f('notes')}-hint`}
                {...register('notes')}
              />
            </Field>
          </div>
        </fieldset>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3">
          {set ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
              <Trash2 aria-hidden />
              Delete oar set
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={() => onDone(null)}>{set ? 'Close' : 'Cancel'}</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || (!!set && !formState.isDirty)}
            >
              {set ? 'Save changes' : 'Add oar set'}
            </Button>
          </div>
        </div>
      )}

      {set && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete oar set ${set.name}?`}
          description={
            usage.count > 0
              ? `${usage.count} upcoming ${usage.count === 1 ? 'entry uses' : 'entries use'} it and will lose their oars. To keep its history, set its status to retired instead.`
              : 'Entries that used it lose their oars. To keep its history, set its status to retired instead.'
          }
          confirmLabel="Delete oar set"
          onConfirm={() =>
            remove.mutate(set.id, {
              onSuccess: () => {
                toast.success(`Oar set ${set.name} deleted`);
                onDone(null);
              },
            })
          }
        />
      )}
    </form>
  );
}
