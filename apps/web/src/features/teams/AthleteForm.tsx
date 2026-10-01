// The athlete form: every roster field and the derived age badge as the coach types. Used by "Add
// athlete" and the athlete drawer.

import { useId, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  athleteInputSchema,
  athleteSideSchema,
  type Athlete,
  type Program,
  type Team,
} from '@regatta-ops/domain';
import { Checkbox } from '@/components/ui/controls';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { AgeBadgeView } from './RosterBadges';
import {
  ageBadge,
  LEVEL_LABELS,
  parseDate,
  parseYear,
  SIDE_LABELS,
  STATUS_LABELS,
  type AthleteInput,
} from './lib';

const NONE = '__none';

function makeSchema(seasonYear: number) {
  return z
    .object({
      teamId: z.string().min(1, 'Choose a team'),
      firstName: z.string().trim().min(1, 'Enter a first name'),
      lastName: z.string().trim(),
      preferredName: z.string().trim(),
      side: athleteSideSchema,
      canScull: z.boolean(),
      canCox: z.boolean(),
      birthYear: z.string(),
      birthdate: z.string(),
      gradYear: z.string(),
      gender: z.string(),
      level: z.enum(['novice', 'experienced']),
      status: z.enum(['active', 'inactive']),
      notes: z.string(),
    })
    .superRefine((v, ctx) => {
      const by = parseYear(v.birthYear, { min: 1900, max: seasonYear, label: 'birth year' });
      if (by.error) ctx.addIssue({ code: 'custom', path: ['birthYear'], message: by.error });
      const gy = parseYear(v.gradYear, {
        min: 1950,
        max: seasonYear + 12,
        label: 'graduation year',
      });
      if (gy.error) ctx.addIssue({ code: 'custom', path: ['gradYear'], message: gy.error });
      const bd = parseDate(v.birthdate);
      if (bd.error) ctx.addIssue({ code: 'custom', path: ['birthdate'], message: bd.error });
    });
}

export type AthleteFormValues = z.infer<ReturnType<typeof makeSchema>>;

export function formValuesFrom(a: Partial<Athlete> & { teamId: string }): AthleteFormValues {
  return {
    teamId: a.teamId,
    firstName: a.firstName ?? '',
    lastName: a.lastName ?? '',
    preferredName: a.preferredName ?? '',
    side: a.side ?? 'none',
    canScull: a.canScull ?? false,
    canCox: a.canCox ?? false,
    birthYear: a.birthYear ? String(a.birthYear) : '',
    birthdate: a.birthdate ?? '',
    gradYear: a.gradYear ? String(a.gradYear) : '',
    gender: a.gender ?? '',
    level: a.level ?? 'experienced',
    status: a.status ?? 'active',
    notes: a.notes ?? '',
  };
}

/** The record to save. Blank optional fields are cleared with null. */
export function inputFromForm(v: AthleteFormValues): AthleteInput {
  const year = (s: string) => (s.trim() ? Number(s.trim()) : null);
  const bd = parseDate(v.birthdate).value ?? null;
  const input: AthleteInput = {
    teamId: v.teamId,
    firstName: v.firstName.trim(),
    lastName: v.lastName.trim(),
    preferredName: v.preferredName.trim(),
    side: v.side,
    canScull: v.canScull,
    canCox: v.canCox,
    birthYear: year(v.birthYear),
    birthdate: bd,
    gradYear: year(v.gradYear),
    gender: v.gender,
    level: v.level,
    status: v.status,
    notes: v.notes.trim(),
  };
  // The shared schema is the last word on what the server accepts.
  return athleteInputSchema.parse(input) as AthleteInput;
}

export interface AthleteFormProps {
  /** A form id, so buttons outside the form can submit it. */
  id: string;
  defaultValues: AthleteFormValues;
  seasonYear: number;
  program: Program;
  /** Show the team picker (moving an athlete); omit when adding to a known team. */
  teams?: readonly Team[];
  readOnly?: boolean;
  /** Focus the first name field on mount (adding athletes one after another). */
  autoFocus?: boolean;
  /** `tag` is what `submitWith(tag)` passed, or null for a plain submit (Enter, Save). */
  onSubmit: (values: AthleteFormValues, tag: string | null) => Promise<void> | void;
  /** Rendered after the fields, inside the form (the buttons). */
  children?: (state: {
    isSubmitting: boolean;
    isDirty: boolean;
    /** Validate and submit with a tag ("again" for "Save and add another"). */
    submitWith: (tag: string) => void;
  }) => ReactNode;
  className?: string;
}

export function AthleteForm({
  id,
  defaultValues,
  seasonYear,
  program,
  teams,
  readOnly = false,
  autoFocus = false,
  onSubmit,
  children,
  className,
}: AthleteFormProps) {
  const uid = useId();
  const f = (name: string) => `${uid}-${name}`;
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<AthleteFormValues>({
    resolver: zodResolver(makeSchema(seasonYear)),
    defaultValues,
  });
  const birthYearText = useWatch({ control, name: 'birthYear' });
  const teamId = useWatch({ control, name: 'teamId' });
  const teamProgram = teams?.find((t) => t.id === teamId)?.program ?? program;
  const by = parseYear(birthYearText, { min: 1900, max: seasonYear, label: 'birth year' }).value;
  const badge = ageBadge(by, teamProgram, seasonYear);
  const showGrad = teamProgram === 'juniors' || !!defaultValues.gradYear;

  const invalid = (name: keyof AthleteFormValues) => (errors[name] ? true : undefined);
  const describe = (name: keyof AthleteFormValues) =>
    errors[name] ? `${f(name)}-error` : undefined;

  const genderOptions = [
    { value: NONE, label: 'Not set' },
    { value: 'M', label: 'M' },
    { value: 'F', label: 'F' },
    ...(defaultValues.gender && !['M', 'F'].includes(defaultValues.gender)
      ? [{ value: defaultValues.gender, label: defaultValues.gender }]
      : []),
  ];

  return (
    <form
      id={id}
      noValidate
      onSubmit={(e) => void handleSubmit((v) => onSubmit(v, null))(e).catch(() => {})}
      className={cn('flex flex-col gap-4', className)}
    >
      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field id={f('firstName')} label="First name" error={errors.firstName?.message}>
            <Input
              id={f('firstName')}
              autoFocus={autoFocus}
              autoComplete="off"
              aria-invalid={invalid('firstName')}
              aria-describedby={describe('firstName')}
              {...register('firstName')}
            />
          </Field>
          <Field id={f('lastName')} label="Last name" error={errors.lastName?.message}>
            <Input id={f('lastName')} autoComplete="off" {...register('lastName')} />
          </Field>
        </div>
        <Field
          id={f('preferredName')}
          label="Preferred name"
          hint="Shown instead of the first name everywhere, when set."
        >
          <Input id={f('preferredName')} autoComplete="off" {...register('preferredName')} />
        </Field>

        {teams && (
          <Field id={f('teamId')} label="Team">
            <Controller
              control={control}
              name="teamId"
              render={({ field }) => (
                <Select
                  id={f('teamId')}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly}
                  options={teams
                    .filter((t) => !t.archived || t.id === field.value)
                    .map((t) => ({ value: t.id, label: t.name }))}
                  className="w-full"
                />
              )}
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id={f('side')} label="Side">
            <Controller
              control={control}
              name="side"
              render={({ field }) => (
                <Select
                  id={f('side')}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly}
                  options={(['port', 'starboard', 'both', 'none'] as const).map((s) => ({
                    value: s,
                    label: SIDE_LABELS[s],
                  }))}
                  className="w-full"
                />
              )}
            />
          </Field>
          <Field id={f('level')} label="Level">
            <Controller
              control={control}
              name="level"
              render={({ field }) => (
                <Select
                  id={f('level')}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly}
                  options={(['experienced', 'novice'] as const).map((l) => ({
                    value: l,
                    label: LEVEL_LABELS[l],
                  }))}
                  className="w-full"
                />
              )}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(
            [
              ['canScull', 'Can scull'],
              ['canCox', 'Can cox'],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <div className="flex min-h-9 items-center gap-2 pointer-coarse:min-h-11">
                  <Checkbox
                    id={f(name)}
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                    disabled={readOnly}
                  />
                  <Label htmlFor={f(name)} className="font-normal">
                    {label}
                  </Label>
                </div>
              )}
            />
          ))}
        </div>

        {/* One grid, so the fields close up when a masters team has no graduation year. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={f('birthYear')}>Birth year</Label>
            <div className="flex items-center gap-2">
              <Input
                id={f('birthYear')}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                className="tabular-nums"
                aria-invalid={invalid('birthYear')}
                aria-describedby={errors.birthYear ? `${f('birthYear')}-error` : f('badge')}
                {...register('birthYear')}
              />
              <span id={f('badge')} className="shrink-0">
                {badge && <AgeBadgeView badge={badge} />}
              </span>
            </div>
            {errors.birthYear && (
              <p id={`${f('birthYear')}-error`} className="text-sm text-danger">
                {errors.birthYear.message}
              </p>
            )}
          </div>
          <Field
            id={f('birthdate')}
            label="Birthdate"
            hint="Optional."
            error={errors.birthdate?.message}
          >
            <Input
              id={f('birthdate')}
              type="date"
              aria-invalid={invalid('birthdate')}
              aria-describedby={describe('birthdate')}
              {...register('birthdate')}
            />
          </Field>
          {showGrad && (
            <Field id={f('gradYear')} label="Graduation year" error={errors.gradYear?.message}>
              <Input
                id={f('gradYear')}
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                className="tabular-nums"
                aria-invalid={invalid('gradYear')}
                aria-describedby={describe('gradYear')}
                {...register('gradYear')}
              />
            </Field>
          )}
          <Field id={f('gender')} label="Gender">
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <Select
                  id={f('gender')}
                  value={field.value || NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? '' : v)}
                  disabled={readOnly}
                  options={genderOptions}
                  className="w-full"
                />
              )}
            />
          </Field>
          <Field id={f('status')} label="Status">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select
                  id={f('status')}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={readOnly}
                  options={(['active', 'inactive'] as const).map((s) => ({
                    value: s,
                    label: STATUS_LABELS[s],
                  }))}
                  className="w-full"
                />
              )}
            />
          </Field>
        </div>

        <Field id={f('notes')} label="Notes">
          <Textarea id={f('notes')} rows={3} {...register('notes')} />
        </Field>
      </fieldset>
      {children?.({
        isSubmitting,
        isDirty,
        submitWith: (tag) => void handleSubmit((v) => onSubmit(v, tag))().catch(() => {}),
      })}
    </form>
  );
}
