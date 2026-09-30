// Regatta settings (PLAN.md §4.1): every regatta field, the status, and the timing values with
// the club default beside each override and a per-field reset.

import { useId } from 'react';
import { Controller, useForm, useWatch, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw } from 'lucide-react';
import {
  instantToZoned,
  TIMING_LABELS,
  zonedToInstant,
  type ClubSettings,
  type Regatta,
  type RegattaEvent,
} from '@srt/domain';
import { batchOp, useBatch, useCan, type BatchOp } from '@/data';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { RegattaFields } from './RegattaFields';
import { chunk, BATCH_LIMIT, regattaDays } from './duplicate';
import {
  clubDefaults,
  formToPatch,
  regattaFormSchema,
  regattaToForm,
  STATUS_LABELS,
  TIMING_KEYS,
  type RegattaFormValues,
} from './regatta-form';

function TimingRow({
  form,
  name,
  clubDefault,
}: {
  form: UseFormReturn<RegattaFormValues>;
  name: (typeof TIMING_KEYS)[number];
  clubDefault: number;
}) {
  const id = useId();
  const { label, help } = TIMING_LABELS[name];
  const error = form.formState.errors.timing?.[name]?.message;
  return (
    <Controller
      control={form.control}
      name={`timing.${name}`}
      render={({ field }) => {
        const overridden = field.value !== null;
        return (
          <div className="flex flex-col gap-1.5 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <label htmlFor={id} className="text-sm font-medium text-ink">
                {label}
              </label>
              <p id={`${id}-help`} className="text-sm leading-prose text-ink-2">
                {help}
              </p>
              {error && (
                <p id={`${id}-error`} className="text-sm text-danger">
                  {error}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="relative w-28">
                <Input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  placeholder={String(clubDefault)}
                  aria-invalid={!!error || undefined}
                  aria-describedby={`${id}-help ${id}-default${error ? ` ${id}-error` : ''}`}
                  value={field.value ?? ''}
                  onBlur={field.onBlur}
                  onChange={(e) => {
                    const raw = e.target.value;
                    field.onChange(raw === '' ? null : Number(raw));
                  }}
                  className="pr-10 tabular-nums"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-2"
                >
                  min
                </span>
              </div>
              <span id={`${id}-default`} className="w-32 text-sm text-ink-2 tabular-nums">
                {overridden ? `Club default ${clubDefault} min` : 'Club default'}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Reset ${label.toLowerCase()} to the club default`}
                title="Reset to the club default"
                disabled={!overridden}
                onClick={() => field.onChange(null)}
                className={overridden ? undefined : 'invisible'}
              >
                <RotateCcw aria-hidden />
              </Button>
            </div>
          </div>
        );
      }}
    />
  );
}

function SettingsForm({
  regatta,
  clubSettings,
  events,
  onDone,
}: {
  regatta: Regatta;
  clubSettings: ClubSettings | null;
  events: readonly RegattaEvent[];
  onDone: () => void;
}) {
  const canArchive = useCan('regatta.archive');
  const save = useBatch({ errorMessage: 'The settings were not saved. Try again.' });
  const form = useForm<RegattaFormValues>({
    resolver: zodResolver(regattaFormSchema),
    defaultValues: regattaToForm(regatta),
  });
  const { errors } = form.formState;
  const [format, startDate, endDate, timezone] = useWatch({
    control: form.control,
    name: ['format', 'startDate', 'endDate', 'timezone'],
  });
  const defaults = clubDefaults(format, clubSettings);
  const days = startDate && endDate >= startDate ? regattaDays({ startDate, endDate }) : [];
  const outside = days.length > 0 ? events.filter((e) => !days.includes(e.day)).length : 0;
  const timed = events.filter((e) => e.scheduledAt).length;

  const onSubmit = form.handleSubmit(async (values) => {
    const ops: BatchOp[] = [batchOp.update('regattas', regatta.id, formToPatch(values))];
    // A new timezone keeps every race at the same clock time, not the same instant.
    if (values.timezone !== regatta.timezone) {
      for (const e of events) {
        if (!e.scheduledAt) continue;
        const { time } = instantToZoned(e.scheduledAt, regatta.timezone);
        ops.push(
          batchOp.update('events', e.id, {
            scheduledAt: zonedToInstant(e.day, time, values.timezone),
          }),
        );
      }
    }
    try {
      for (const part of chunk(ops, BATCH_LIMIT)) await save.mutateAsync(part);
      toast.success('Settings saved');
      onDone();
    } catch {
      // The mutation's toast explains; the dialog stays open.
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <section aria-labelledby="settings-regatta" className="flex flex-col gap-4">
        <h3 id="settings-regatta" className="sr-only">
          Regatta
        </h3>
        <RegattaFields form={form} idPrefix="settings" />
        {outside > 0 && (
          <p role="status" className="rounded-control bg-warn-tint px-3 py-2 text-sm text-ink">
            {outside === 1 ? '1 event is' : `${outside} events are`} on a day outside these dates.
            Move {outside === 1 ? 'it' : 'them'} on the schedule after saving.
          </p>
        )}
        {timezone !== regatta.timezone && timed > 0 && (
          <p role="status" className="rounded-control bg-info-tint px-3 py-2 text-sm text-ink">
            Race times keep their clock times in the new timezone.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="settings-status" label="Status" error={errors.status?.message}>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select
                  id="settings-status"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[
                    { value: 'planning', label: STATUS_LABELS.planning },
                    { value: 'final', label: STATUS_LABELS.final },
                    {
                      value: 'archived',
                      label: canArchive ? STATUS_LABELS.archived : 'Archived (admins only)',
                      disabled: !canArchive && regatta.status !== 'archived',
                    },
                  ]}
                />
              )}
            />
          </Field>
          <p className="self-end pb-2 text-sm leading-prose text-ink-2">
            Final asks for confirmation before each change. Archived hides the regatta from the
            list.
          </p>
        </div>
        <Field id="settings-notes" label="Notes">
          <Textarea id="settings-notes" rows={3} {...form.register('notes')} />
        </Field>
      </section>

      <section aria-labelledby="settings-timing" className="flex flex-col gap-1">
        <h3 id="settings-timing" className="font-display text-md font-semibold">
          Timing
        </h3>
        <p className="text-sm leading-prose text-ink-2">
          Club defaults apply unless you set a value for this regatta. Courses differ, so change
          what this one needs.
        </p>
        <div className="mt-1 flex flex-col">
          {TIMING_KEYS.map((k) => (
            <TimingRow key={k} form={form} name={k} clubDefault={defaults[k]} />
          ))}
        </div>
      </section>

      <DialogFooter>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          Save settings
        </Button>
      </DialogFooter>
    </form>
  );
}

export function RegattaSettingsDialog({
  regatta,
  clubSettings,
  events,
  open,
  onOpenChange,
}: {
  regatta: Regatta;
  clubSettings: ClubSettings | null;
  /** The regatta's events, to warn about days outside new dates and to keep clock times. */
  events: readonly RegattaEvent[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Regatta settings" className="max-w-2xl">
        <SettingsForm
          regatta={regatta}
          clubSettings={clubSettings}
          events={events}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
