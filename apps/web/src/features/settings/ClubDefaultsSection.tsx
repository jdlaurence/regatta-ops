// Club defaults (PLAN.md §8.1 club_settings): name, timezone, weight unit, first day of the week,
// and the regatta timing values new regattas start from. Admins edit.

import { useId, useMemo } from 'react';
import { Controller, useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  clubSettingsInputSchema,
  TIMING_LABELS,
  type ClubSettings,
  type RegattaSettings,
} from '@regatta-ops/domain';
import { useCan, useCreate, useUpdate } from '@/data';
import { ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { SegmentedControl } from '@/components/ui/controls';
import { Field, Input, Label } from '@/components/ui/input';
import { useClubSettings } from './hooks';

const minutes = z
  .number('Enter minutes as a whole number')
  .int('Enter minutes as a whole number')
  .min(0, 'Enter zero or more')
  .max(600, 'Enter 600 minutes or fewer');

const formSchema = clubSettingsInputSchema.extend({
  timingDefaults: z.object({
    launchLeadMin: minutes,
    raceDurationMin: minutes,
    returnMin: minutes,
    hotSeatMinGapMin: minutes,
    athleteMinGapMin: minutes,
    rerigMin: minutes,
  }),
  headRaceDurationMin: minutes,
});
type FormValues = z.infer<typeof formSchema>;

const TIMING_KEYS = Object.keys(TIMING_LABELS) as (keyof RegattaSettings)[];

function timezones(current: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

export function ClubDefaultsSection() {
  const club = useClubSettings();
  if (club.isError) {
    return (
      <ErrorState
        title="Club defaults did not load."
        error={club.error}
        onRetry={() => void club.refetch()}
      />
    );
  }
  if (club.isPending) return <SkeletonRows rows={6} />;
  // A new key after each save reloads the form with what was stored.
  return (
    <ClubDefaultsForm
      key={club.record?.updated ?? club.record?.id ?? 'defaults'}
      settings={club.settings}
      exists={!!club.record}
    />
  );
}

function ClubDefaultsForm({ settings, exists }: { settings: ClubSettings; exists: boolean }) {
  const uid = useId();
  const canManage = useCan('settings.manage');
  const update = useUpdate('club_settings');
  const create = useCreate('club_settings');
  const { id: _id, created: _c, updated: _u, ...values } = settings;
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: values });
  const zoneOptions = useMemo(
    () =>
      timezones(settings.timezone).map((z) => ({
        value: z,
        label: z.replace(/_/g, ' '),
        keywords: [z],
      })),
    [settings.timezone],
  );

  const onSubmit = async (v: FormValues) => {
    if (exists) await update.mutateAsync({ id: settings.id, patch: v });
    else await create.mutateAsync(v);
    reset(v);
    toast.success('Club defaults saved');
  };

  const f = (name: string) => `${uid}-${name}`;

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit(onSubmit)(e).catch(() => {})}
      className="flex max-w-3xl flex-col gap-8"
    >
      {!canManage && (
        <p className="rounded-card border border-line bg-surface px-4 py-3 text-base text-ink-2">
          Only admins can change club defaults.
        </p>
      )}
      <fieldset disabled={!canManage} className="flex flex-col gap-8">
        <section aria-labelledby={f('club')} className="flex flex-col gap-4">
          <h2 id={f('club')} className="font-display text-lg font-semibold">
            Club
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={f('name')} label="Club name" error={errors.clubName?.message}>
              <Input
                id={f('name')}
                autoComplete="organization"
                aria-invalid={errors.clubName ? true : undefined}
                {...register('clubName')}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label id={f('tz-label')}>Timezone</Label>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <Combobox
                    label="Timezone"
                    options={zoneOptions}
                    value={field.value}
                    onValueChange={(v) => v && field.onChange(v)}
                    disabled={!canManage}
                    searchPlaceholder="Search timezones…"
                    className="w-full"
                  />
                )}
              />
              <p className="text-sm text-ink-2">The starting timezone for new regattas.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Weight unit</span>
              <Controller
                control={control}
                name="weightUnit"
                render={({ field }) => (
                  <SegmentedControl<'lb' | 'kg'>
                    label="Weight unit"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={[
                      { value: 'lb', label: 'Pounds' },
                      { value: 'kg', label: 'Kilograms' },
                    ]}
                    className={canManage ? 'w-fit' : 'w-fit opacity-60'}
                  />
                )}
              />
              <p className="text-sm text-ink-2">
                For crew weight ranges on shells. Anyone can pick their own in My preferences.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">First day of the week</span>
              <Controller
                control={control}
                name="weekStartsOn"
                render={({ field }) => (
                  <SegmentedControl<'0' | '1'>
                    label="First day of the week"
                    value={String(field.value) as '0' | '1'}
                    onValueChange={(v) => field.onChange(Number(v) as 0 | 1)}
                    options={[
                      { value: '0', label: 'Sunday' },
                      { value: '1', label: 'Monday' },
                    ]}
                    className={canManage ? 'w-fit' : 'w-fit opacity-60'}
                  />
                )}
              />
            </div>
          </div>
        </section>

        <section aria-labelledby={f('timing')} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={f('timing')} className="font-display text-lg font-semibold">
              Regatta timing
            </h2>
            <p className="max-w-prose text-base leading-prose text-ink-2">
              The values new regattas start from, in minutes. Courses differ, so each regatta can
              change them in its own settings.
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {TIMING_KEYS.map((key) => {
              const error = errors.timingDefaults?.[key]?.message;
              const label =
                key === 'raceDurationMin' ? 'Race duration, sprints' : TIMING_LABELS[key].label;
              return (
                <MinutesField
                  key={key}
                  id={f(key)}
                  label={label}
                  help={TIMING_LABELS[key].help}
                  error={error}
                  inputProps={register(`timingDefaults.${key}`, { valueAsNumber: true })}
                />
              );
            })}
            <MinutesField
              id={f('head')}
              label="Race duration, head races"
              help="Minutes from start to finish in a head race."
              error={errors.headRaceDurationMin?.message}
              inputProps={register('headRaceDurationMin', { valueAsNumber: true })}
            />
          </div>
        </section>
      </fieldset>

      {canManage && (
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={!isDirty || isSubmitting}>
            Save club defaults
          </Button>
          {isDirty && (
            <Button onClick={() => reset(values)} disabled={isSubmitting}>
              Discard changes
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function MinutesField({
  id,
  label,
  help,
  error,
  inputProps,
}: {
  id: string;
  label: string;
  help: string;
  error?: string;
  inputProps: UseFormRegisterReturn;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          className="w-24 tabular-nums"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          {...inputProps}
        />
        <span className="text-base text-ink-2">min</span>
      </div>
      <p id={`${id}-help`} className={error ? 'text-sm text-danger' : 'text-sm text-ink-2'}>
        {error ?? help}
      </p>
    </div>
  );
}
