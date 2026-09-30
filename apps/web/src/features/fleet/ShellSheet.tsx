// The shell drawer (PLAN.md §4.7, §6.8): every field of a shell, its upcoming use (§4.5), and
// the new-shell flow, which starts by picking a class so dimensions, riggers, and rigging come
// from §16.1.

import { useId, useState } from 'react';
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RotateCcw, Trash2 } from 'lucide-react';
import {
  BASE_KEYS,
  BOAT_CLASSES,
  boatClassSpec,
  defaultRiggerCount,
  requiredText,
  shellFullLabel,
  shellSchema,
  type BoatClass,
  type RiggerType,
  type Shell,
} from '@srt/domain';
import { useCan, useCreate, useDelete, useRecord, useUpdate } from '@/data';
import { ClassBadge, ShellChip, TeamChip } from '@/components/chips';
import { ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { changedFields, NumberField, SelectField } from './form-fields';
import { teamOptions, useFleetTeams, useUpcomingUsage, useWeightUnit } from './hooks';
import {
  AFFINITY_LABELS,
  AFFINITY_ORDER,
  applyClassChange,
  applyCompatibleChange,
  applyRiggerTypeChange,
  CLASS_NAMES,
  CLASS_ORDER,
  classDimension,
  COX_POSITION_LABELS,
  crewRangeFromLabel,
  crewRangeText,
  LEVEL_LABELS,
  newShellInput,
  RIGGER_TYPE_LABELS,
  RIGGING_LABELS,
  SHELL_LEVELS,
  STROKE_SIDE_LABELS,
  type DimensionField,
} from './lib';
import { ConfirmDialog, STATUS_OPTIONS, StatusLabel, UpcomingUse } from './parts';

const shellFormSchema = shellSchema.omit(BASE_KEYS).extend({
  name: requiredText('Enter the shell name'),
  year: z
    .number('Enter a year')
    .int('Enter a whole year')
    .min(1900, 'Enter a year from 1900 on')
    .max(2100, 'Enter a year before 2100')
    .nullable()
    .optional(),
});

export type ShellFormValues = z.infer<typeof shellFormSchema>;

/** The form edits the other classes a shell races as; its own class is implied. */
export function toShellForm(shell: Shell): ShellFormValues {
  const { id: _id, created: _c, updated: _u, ...rest } = shell;
  return {
    ...rest,
    nickname: rest.nickname ?? '',
    compatibleClasses: rest.compatibleClasses.filter((c) => c !== rest.boatClass),
  };
}

/** Back to a record: the stored list includes the own class, and the crew range follows the label. */
export function fromShellForm(v: ShellFormValues): ShellFormValues {
  const trim = (s: string | undefined) => (s ?? '').trim();
  const others = v.compatibleClasses.filter((c) => c !== v.boatClass);
  return {
    ...v,
    name: v.name.trim(),
    nickname: trim(v.nickname),
    manufacturer: trim(v.manufacturer),
    model: trim(v.model),
    serial: trim(v.serial),
    weightClassLabel: trim(v.weightClassLabel),
    shoes: trim(v.shoes),
    location: trim(v.location),
    notes: trim(v.notes),
    compatibleClasses: others.length ? [v.boatClass, ...others] : [],
    ...crewRangeFromLabel(v.weightClassLabel),
  };
}

// ---------------------------------------------------------------------------

export function ShellSheet({
  open,
  onOpenChange,
  shellId,
  locations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The shell to show; null opens the new-shell flow. */
  shellId: string | null;
  /** Known boathouse locations, suggested in the location field. */
  locations: string[];
  onCreated?: (id: string) => void;
}) {
  const record = useRecord('shells', shellId);
  const shell = record.data ?? null;
  const title = shellId ? (shell ? shellFullLabel(shell) : 'Shell') : 'New shell';
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title} className="w-[min(100vw,540px)] overflow-hidden">
        {shellId ? (
          record.isError ? (
            <div className="p-4">
              <ErrorState
                title="This shell did not load."
                error={record.error}
                onRetry={() => void record.refetch()}
              />
            </div>
          ) : record.isPending ? (
            <div className="p-4">
              <SkeletonRows rows={8} />
            </div>
          ) : !shell ? (
            <p className="p-4 text-base text-ink-2">
              This shell is no longer in the fleet. Someone may have deleted it.
            </p>
          ) : (
            <ShellForm
              key={shell.id}
              shell={shell}
              locations={locations}
              onDone={() => onOpenChange(false)}
            />
          )
        ) : (
          <NewShell
            locations={locations}
            onDone={(id) => {
              if (id) onCreated?.(id);
              else onOpenChange(false);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function NewShell({
  locations,
  onDone,
}: {
  locations: string[];
  onDone: (createdId: string | null) => void;
}) {
  const [cls, setCls] = useState<BoatClass | null>(null);
  if (!cls) return <ClassPicker onPick={setCls} />;
  return <ShellForm key={cls} newClass={cls} locations={locations} onDone={onDone} />;
}

/** Step one of a new shell: the class sets its dimensions, riggers, and rigging. */
function ClassPicker({ onPick }: { onPick: (cls: BoatClass) => void }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-md font-medium">Pick a boat class</h3>
      <p className="text-base leading-prose text-ink-2">
        Length, beam, weight, rigger count, and rigging start from the class. You can change any of
        them next.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {CLASS_ORDER.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="flex min-h-16 flex-col items-start justify-center gap-0.5 rounded-control border border-line-strong bg-surface px-3 py-2 text-left hover:border-accent hover:bg-accent-tint"
          >
            <span className="font-display text-lg font-semibold tabular-nums">{c}</span>
            <span className="text-sm text-ink-2">{CLASS_NAMES[c]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ShellForm({
  shell,
  newClass,
  locations,
  onDone,
}: {
  shell?: Shell;
  newClass?: BoatClass;
  locations: string[];
  onDone: (createdId: string | null) => void;
}) {
  const id = useId();
  const canEdit = useCan('fleet.edit');
  const unit = useWeightUnit();
  const { teams, byId } = useFleetTeams();
  const usage = useUpcomingUsage('shell', shell?.id ?? null);
  const update = useUpdate('shells');
  const create = useCreate('shells');
  const remove = useDelete('shells');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initial = shell ? toShellForm(shell) : newShellInput(newClass ?? '8+');
  const form = useForm<ShellFormValues>({
    resolver: zodResolver(shellFormSchema),
    defaultValues: initial,
  });
  const { control, register, formState } = form;
  const errors = formState.errors;
  const values = useWatch({ control }) as ShellFormValues;
  const cls = values.boatClass;
  const spec = boatClassSpec(cls);
  const crew = crewRangeText(crewRangeFromLabel(values.weightClassLabel), unit);
  const anyCoxed = [cls, ...values.compatibleClasses].some((c) => boatClassSpec(c).coxed);

  /** Apply a helper's result field by field so each shows as changed. */
  const applyAll = (next: ShellFormValues) => {
    for (const k of Object.keys(next) as (keyof ShellFormValues)[]) {
      if (next[k] !== form.getValues(k)) {
        form.setValue(k, next[k] as never, {
          shouldDirty: true,
          shouldValidate: formState.isSubmitted,
        });
      }
    }
  };

  const onSubmit = form.handleSubmit(async (raw) => {
    const values = fromShellForm(raw);
    try {
      if (shell) {
        const patch = changedFields(fromShellForm(toShellForm(shell)), values);
        if (Object.keys(patch).length === 0) return;
        await update.mutateAsync({ id: shell.id, patch });
        toast.success('Changes saved');
        form.reset(raw);
      } else {
        const created = await create.mutateAsync(values);
        toast.success(`${values.nickname || values.name} added`);
        onDone(created.id);
      }
    } catch {
      // The mutation's toast already says what went wrong; the form keeps the edits.
    }
  });

  const saving = update.isPending || create.isPending;
  const f = (name: string) => `${id}-${name}`;
  const dimensionHint = (field: DimensionField, unitLabel: string) =>
    `Class default ${classDimension(cls, field)} ${unitLabel}`;
  const resetButton = (field: DimensionField | 'riggerCount', text: string, def: number) =>
    canEdit && values[field] != null && values[field] !== def ? (
      <Button
        variant="link"
        size="sm"
        className="self-start text-sm"
        onClick={() => form.setValue(field, def, { shouldDirty: true })}
        aria-label={`Reset ${text} to class default`}
      >
        <RotateCcw aria-hidden />
        Reset to class default
      </Button>
    ) : null;

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4">
        {shell && (
          <div className="flex flex-wrap items-center gap-2">
            <ShellChip
              shell={{ ...shell, status: 'in_service' }}
              teamColor={shell.homeTeamId ? byId.get(shell.homeTeamId)?.colorKey : null}
              showClass={false}
            />
            <ClassBadge boatClass={shell.boatClass} />
            <StatusLabel status={shell.status} className="text-sm" />
            {shell.homeTeamId && byId.get(shell.homeTeamId) && (
              <TeamChip team={byId.get(shell.homeTeamId)!} short size="sm" />
            )}
          </div>
        )}

        {shell && (
          <section aria-labelledby={f('usage')} className="flex flex-col gap-2">
            <h3 id={f('usage')} className="text-md font-medium">
              Upcoming use{usage.count > 0 && ` (${usage.count})`}
            </h3>
            <UpcomingUse usage={usage} teamsById={byId} noun="shell" />
          </section>
        )}

        <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
          <FormSection title="Name and class">
            <Field
              id={f('name')}
              label="Name"
              error={errors.name?.message}
              className="sm:col-span-2"
            >
              <Input
                id={f('name')}
                autoFocus={!shell}
                aria-invalid={!!errors.name || undefined}
                aria-describedby={errors.name ? `${f('name')}-error` : undefined}
                {...register('name')}
              />
            </Field>
            <Field
              id={f('nickname')}
              label="Nickname"
              hint="The short name coaches use, shown where the full name does not fit."
              className="sm:col-span-2"
            >
              <Input
                id={f('nickname')}
                aria-describedby={`${f('nickname')}-hint`}
                {...register('nickname')}
              />
            </Field>
            <SelectField
              control={control}
              name="boatClass"
              id={f('class')}
              label="Boat class"
              options={BOAT_CLASSES.map((c) => ({ value: c, label: `${c} · ${CLASS_NAMES[c]}` }))}
              onValueChange={(v) => v && applyAll(applyClassChange(form.getValues(), v))}
            />
            <SelectField
              control={control}
              name="rigging"
              id={f('rigging')}
              label="Rigging"
              options={(['sweep', 'scull', 'convertible'] as const).map((r) => ({
                value: r,
                label: RIGGING_LABELS[r],
              }))}
            />
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="text-sm font-medium">Also races as</legend>
              <p className="text-sm leading-prose text-ink-2">
                Convertible hulls race as more than one class: the club&apos;s 4x/4- hulls, or a 4+
                used as a 4x+. Check every other class this shell can race as; the shell picker
                offers it for those events and flags the re-rig.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {CLASS_ORDER.filter((c) => c !== cls).map((c) => {
                  const checked = values.compatibleClasses.includes(c);
                  return (
                    <label
                      key={c}
                      className="inline-flex min-h-8 items-center gap-2 text-base pointer-coarse:min-h-11"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!canEdit}
                        onCheckedChange={(v) =>
                          applyAll(
                            applyCompatibleChange(
                              form.getValues(),
                              v === true
                                ? [...values.compatibleClasses, c]
                                : values.compatibleClasses.filter((x) => x !== c),
                            ),
                          )
                        }
                      />
                      <span className="font-display font-semibold tabular-nums">{c}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field id={f('manufacturer')} label="Manufacturer">
              <Input id={f('manufacturer')} {...register('manufacturer')} />
            </Field>
            <Field id={f('model')} label="Model">
              <Input id={f('model')} placeholder="Hudson S8.32" {...register('model')} />
            </Field>
            <Field id={f('serial')} label="Serial number">
              <Input id={f('serial')} {...register('serial')} />
            </Field>
            <NumberField control={control} name="year" id={f('year')} label="Year" step="1" />
          </FormSection>

          <FormSection title="Crew and rig">
            <Field
              id={f('weight-class')}
              label="Weight class"
              hint={
                crew
                  ? `Crew ${crew}`
                  : 'As the club writes it: 165-200, LWT, <240. Numbers are pounds.'
              }
              className="sm:col-span-2"
            >
              <Input
                id={f('weight-class')}
                aria-describedby={`${f('weight-class')}-hint`}
                {...register('weightClassLabel')}
              />
            </Field>
            {spec.rigging === 'sweep' || values.rigging !== 'scull' ? (
              <SelectField
                control={control}
                name="strokeSide"
                id={f('stroke')}
                label="Stroke side"
                notSet="Not set"
                hint="Drives the seat sides on the boat strip."
                options={(['port', 'starboard'] as const).map((s) => ({
                  value: s,
                  label: STROKE_SIDE_LABELS[s],
                }))}
              />
            ) : null}
            {anyCoxed && (
              <SelectField
                control={control}
                name="coxPosition"
                id={f('cox')}
                label="Cox position"
                notSet="Not set"
                options={(['stern', 'bow'] as const).map((s) => ({
                  value: s,
                  label: COX_POSITION_LABELS[s],
                }))}
              />
            )}
            <SelectField
              control={control}
              name="level"
              id={f('level')}
              label="Level"
              notSet="Not set"
              options={SHELL_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
            />
            <SelectField
              control={control}
              name="genderAffinity"
              id={f('affinity')}
              label="Gender affinity"
              options={AFFINITY_ORDER.map((a) => ({ value: a, label: AFFINITY_LABELS[a] }))}
            />
            <Field id={f('shoes')} label="Shoes">
              <Input id={f('shoes')} placeholder="Bont" {...register('shoes')} />
            </Field>
            <div className="hidden sm:block" aria-hidden />
            <NumberField
              control={control}
              name="spreadCm"
              id={f('spread')}
              label="Spread (cm)"
              hint="Sweep rigging, for reference."
            />
            <NumberField
              control={control}
              name="spanCm"
              id={f('span')}
              label="Span (cm)"
              hint="Sculling rigging, for reference."
            />
          </FormSection>

          <FormSection title="Home and status">
            <SelectField
              control={control}
              name="homeTeamId"
              id={f('team')}
              label="Home team"
              notSet="No home team"
              options={teamOptions(teams, values.homeTeamId)}
            />
            <Field id={f('location')} label="Location" hint="Rack or spot in the boathouse.">
              <Input
                id={f('location')}
                list={f('locations')}
                placeholder="C5"
                aria-describedby={`${f('location')}-hint`}
                {...register('location')}
              />
              <datalist id={f('locations')}>
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </Field>
            <SelectField
              control={control}
              name="status"
              id={f('status')}
              label="Status"
              options={STATUS_OPTIONS}
              hint={
                values.status === 'out_of_service'
                  ? 'Lineups flag it if an entry picks it.'
                  : values.status === 'retired'
                    ? 'Hidden from the shells table and pickers by default.'
                    : undefined
              }
            />
            <PrivateSwitch form={form} id={f('private')} disabled={!canEdit} />
          </FormSection>

          <FormSection title="Dimensions and riggers">
            <p className="-mt-1 text-sm leading-prose text-ink-2 sm:col-span-2">
              Used to size trailer placements. Blank fields use the {cls} class default.
            </p>
            <NumberField
              control={control}
              name="lengthCm"
              id={f('length')}
              label="Length (cm)"
              placeholder={String(classDimension(cls, 'lengthCm'))}
              hint={dimensionHint('lengthCm', 'cm')}
              after={resetButton('lengthCm', 'length', classDimension(cls, 'lengthCm'))}
            />
            <NumberField
              control={control}
              name="beamCm"
              id={f('beam')}
              label="Beam (cm)"
              placeholder={String(classDimension(cls, 'beamCm'))}
              hint={dimensionHint('beamCm', 'cm')}
              after={resetButton('beamCm', 'beam', classDimension(cls, 'beamCm'))}
            />
            <NumberField
              control={control}
              name="weightKg"
              id={f('weight')}
              label="Hull weight (kg)"
              placeholder={String(classDimension(cls, 'weightKg'))}
              hint={dimensionHint('weightKg', 'kg')}
              after={resetButton('weightKg', 'hull weight', classDimension(cls, 'weightKg'))}
            />
            <div className="hidden sm:block" aria-hidden />
            <SelectField
              control={control}
              name="riggerType"
              id={f('rigger-type')}
              label="Rigger type"
              options={(['side', 'wing', 'none'] as const).map((r) => ({
                value: r,
                label: RIGGER_TYPE_LABELS[r],
              }))}
              onValueChange={(v) =>
                v && applyAll(applyRiggerTypeChange(form.getValues(), v as RiggerType))
              }
            />
            <NumberField
              control={control}
              name="riggerCount"
              id={f('rigger-count')}
              label="Rigger count"
              step="1"
              placeholder={String(defaultRiggerCount(cls, values.riggerType))}
              hint={`Class default ${defaultRiggerCount(cls, values.riggerType)}`}
              after={resetButton(
                'riggerCount',
                'rigger count',
                defaultRiggerCount(cls, values.riggerType),
              )}
            />
          </FormSection>

          <FormSection title="Notes">
            <Field id={f('notes')} label="Notes" className="sm:col-span-2">
              <Textarea id={f('notes')} rows={3} {...register('notes')} />
            </Field>
          </FormSection>
        </fieldset>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3">
          {shell ? (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-danger">
              <Trash2 aria-hidden />
              Delete shell
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={() => onDone(null)}>{shell ? 'Close' : 'Cancel'}</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || (!!shell && !formState.isDirty)}
            >
              {shell ? 'Save changes' : 'Add shell'}
            </Button>
          </div>
        </div>
      )}

      {shell && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${shellFullLabel(shell)}?`}
          description={
            usage.count > 0
              ? `${usage.count} upcoming ${usage.count === 1 ? 'entry uses' : 'entries use'} it and will lose their shell. To keep its history, set its status to retired instead.`
              : 'Entries that used it lose their shell. To keep its history, set its status to retired instead.'
          }
          confirmLabel="Delete shell"
          onConfirm={() =>
            remove.mutate(shell.id, {
              onSuccess: () => {
                toast.success(`${shellFullLabel(shell)} deleted`);
                onDone(null);
              },
            })
          }
        />
      )}
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="border-b border-line pb-1.5 text-md font-medium">{title}</h3>
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function PrivateSwitch({
  form,
  id,
  disabled,
}: {
  form: UseFormReturn<ShellFormValues>;
  id: string;
  disabled: boolean;
}) {
  const checked = useWatch({ control: form.control, name: 'isPrivate' });
  return (
    <div className="flex items-start gap-3 sm:col-span-2">
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => form.setValue('isPrivate', v, { shouldDirty: true })}
        aria-describedby={`${id}-hint`}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id}>Privately owned</Label>
        <p id={`${id}-hint`} className="text-sm text-ink-2">
          Belongs to a member, not the club. Ask before racing it.
        </p>
      </div>
    </div>
  );
}
