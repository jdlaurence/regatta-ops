// Create or edit a team (PLAN.md §4.2): name, short name, program, color, sort order, archived.
// Admins edit; everyone else sees the same settings read-only.

import { useId } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RadioGroup } from 'radix-ui';
import { z } from 'zod';
import {
  TEAM_COLOR_KEYS,
  teamInputSchema,
  type Team,
  type TeamColorKey,
} from '@regatta-ops/domain';
import { useCreate, useUpdate } from '@/data';
import { TeamChip, TeamDot } from '@/components/chips';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { TEAM_COLOR_LABELS, teamStyle } from '@/lib/team-colors';
import { PROGRAM_LABELS } from './lib';

const formSchema = teamInputSchema.extend({
  sortOrder: z.number('Enter a whole number').int('Enter a whole number'),
});
type FormValues = z.infer<typeof formSchema>;

export interface TeamFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The team to edit; omit to add one. */
  team?: Team | null;
  /** Every team, to show which colors are taken and to order a new team last. */
  teams: readonly Team[];
  readOnly?: boolean;
  onCreated?: (team: Team) => void;
}

function initialValues(team: Team | null | undefined, teams: readonly Team[]): FormValues {
  if (team) {
    const { id: _id, created: _c, updated: _u, ...rest } = team;
    return rest;
  }
  const used = new Set(teams.filter((t) => !t.archived).map((t) => t.colorKey));
  return {
    name: '',
    shortName: '',
    program: 'juniors',
    colorKey: TEAM_COLOR_KEYS.find((k) => !used.has(k)) ?? 'slate',
    sortOrder: Math.max(0, ...teams.map((t) => t.sortOrder)) + 1,
    archived: false,
  };
}

export function TeamFormDialog(props: TeamFormDialogProps) {
  // Remount the form for each team so its defaults are fresh.
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <TeamForm key={props.team?.id ?? 'new'} {...props} />}
    </Dialog>
  );
}

function TeamForm({ onOpenChange, team, teams, readOnly = false, onCreated }: TeamFormDialogProps) {
  const uid = useId();
  const create = useCreate('teams');
  const update = useUpdate('teams');
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues(team, teams),
  });
  const preview = useWatch({ control });

  const onSubmit = async (values: FormValues) => {
    if (team) {
      await update.mutateAsync({ id: team.id, patch: values });
      toast.success('Team saved');
    } else {
      const created = await create.mutateAsync(values);
      toast.success(`${created.name} added`);
      onCreated?.(created);
    }
    onOpenChange(false);
  };

  const usedBy = new Map<TeamColorKey, string[]>();
  for (const t of teams) {
    if (t.id === team?.id || t.archived) continue;
    usedBy.set(t.colorKey, [...(usedBy.get(t.colorKey) ?? []), t.shortName || t.name]);
  }

  const chipTeam = {
    name: preview.name?.trim() || 'Team name',
    shortName: preview.shortName?.trim() || 'Short',
    colorKey: preview.colorKey ?? 'slate',
  };

  const title = readOnly ? 'Team settings' : team ? 'Edit team' : 'Add team';

  return (
    <DialogContent
      title={title}
      description={readOnly ? 'Only admins can change team settings.' : undefined}
      className="max-w-xl"
    >
      <form
        onSubmit={(e) => void handleSubmit(onSubmit)(e).catch(() => {})}
        className="flex flex-col gap-4"
        noValidate
      >
        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field id={`${uid}-name`} label="Name" error={errors.name?.message}>
              <Input
                id={`${uid}-name`}
                autoComplete="off"
                aria-invalid={!!errors.name || undefined}
                {...register('name')}
              />
            </Field>
            <Field
              id={`${uid}-short`}
              label="Short name"
              hint="Used in chips and tight spaces."
              error={errors.shortName?.message}
            >
              <Input
                id={`${uid}-short`}
                autoComplete="off"
                maxLength={16}
                aria-invalid={!!errors.shortName || undefined}
                {...register('shortName')}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={`${uid}-program`} label="Program">
              <Controller
                control={control}
                name="program"
                render={({ field }) => (
                  <Select
                    id={`${uid}-program`}
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={readOnly}
                    options={(['juniors', 'masters', 'other'] as const).map((p) => ({
                      value: p,
                      label: PROGRAM_LABELS[p],
                    }))}
                    className="w-full"
                  />
                )}
              />
            </Field>
            <Field
              id={`${uid}-sort`}
              label="Sort order"
              hint="Lower numbers list first."
              error={errors.sortOrder?.message}
            >
              <Input
                id={`${uid}-sort`}
                type="number"
                inputMode="numeric"
                step={1}
                aria-invalid={!!errors.sortOrder || undefined}
                {...register('sortOrder', { valueAsNumber: true })}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Label id={`${uid}-color`}>Color</Label>
            <Controller
              control={control}
              name="colorKey"
              render={({ field }) => (
                <RadioGroup.Root
                  aria-labelledby={`${uid}-color`}
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as TeamColorKey)}
                  disabled={readOnly}
                  className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
                >
                  {TEAM_COLOR_KEYS.map((key) => {
                    const taken = usedBy.get(key);
                    return (
                      <RadioGroup.Item
                        key={key}
                        value={key}
                        style={teamStyle(key)}
                        className={cn(
                          'flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-2 py-1.5 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-surface',
                          'data-[state=checked]:border-accent data-[state=checked]:bg-accent-tint data-[state=checked]:ring-1 data-[state=checked]:ring-accent',
                        )}
                      >
                        <span aria-hidden className="size-5 shrink-0 rounded-control bg-team" />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-base font-medium text-ink">
                            {TEAM_COLOR_LABELS[key]}
                          </span>
                          {taken && (
                            <span className="truncate text-xs text-ink-2">
                              {`Used by ${taken.join(', ')}`}
                            </span>
                          )}
                        </span>
                      </RadioGroup.Item>
                    );
                  })}
                </RadioGroup.Root>
              )}
            />
          </div>

          <div
            className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-bg px-3 py-2.5"
            aria-label="Preview"
            role="group"
          >
            <span className="text-sm text-ink-2">Preview</span>
            <TeamChip team={chipTeam} />
            <TeamChip team={chipTeam} short />
            <span className="inline-flex items-center gap-1.5 text-base">
              <TeamDot colorKey={chipTeam.colorKey} />
              {chipTeam.name}
            </span>
          </div>

          <Controller
            control={control}
            name="archived"
            render={({ field }) => (
              <div className="flex items-start gap-3">
                <Switch
                  id={`${uid}-archived`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="mt-0.5"
                  aria-describedby={`${uid}-archived-hint`}
                />
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`${uid}-archived`}>Archived</Label>
                  <p id={`${uid}-archived-hint`} className="text-sm text-ink-2">
                    Archived teams leave the team lists and pickers. Their rosters are kept.
                  </p>
                </div>
              </div>
            )}
          />
        </fieldset>

        <DialogFooter>
          {readOnly ? (
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {team ? 'Save team' : 'Add team'}
              </Button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
