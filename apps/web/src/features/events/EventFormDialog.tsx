// Add or edit one event (PLAN.md §4.3): a race or a logistics line on the regatta's schedule.
// Used by the schedule page for "Add event" and "Edit event", and by the regatta overview.
// Deleting an event leaves its entries unscheduled; their lineups stay.

import { useId, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import {
  BOAT_CLASSES,
  type Entry,
  type Regatta,
  type RegattaEvent,
  type Team,
} from '@regatta-ops/domain';
import { batchOp, useBatch, useCreate, useDelete, useList, useRecord, type BatchOp } from '@/data';
import { formatWeekday } from '@/lib/dates';
import { TeamDot } from '@/components/chips';
import { SkeletonRows, ErrorState } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox, SegmentedControl } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { regattaDays } from '@/features/regattas/duplicate';
import { useConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import {
  eventFormSchema,
  eventTitle,
  eventToForm,
  formToEventFields,
  newEventDefaults,
  nextSortOrder,
  STAGE_LABELS,
  STAGES,
  type EventFormValues,
} from './event-form';

export interface EventFormDialogProps {
  regattaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this event; omit to add a new one. */
  event?: RegattaEvent | null;
  /** Day to preselect for a new event ('YYYY-MM-DD'). */
  defaultDay?: string;
  /** 'race' (default) or 'logistics' for a new line. */
  defaultKind?: RegattaEvent['kind'];
  /** Called with the saved event. */
  onSaved?: (event: RegattaEvent) => void;
}

// The same queries the working set uses, so the dialog reads from its cache.
const eventsQuery = (regattaId: string) =>
  ({ where: { regattaId }, sort: ['day', 'scheduledAt', 'sortOrder'] }) as const;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function EventForm({
  regattaId,
  event,
  defaultDay,
  defaultKind,
  onSaved,
  onDone,
}: Omit<EventFormDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const regatta = useRecord('regattas', regattaId);
  const events = useList('events', eventsQuery(regattaId));
  const entries = useList('entries', { where: { regattaId } });
  const regattaTeams = useList('regatta_teams', { where: { regattaId } });
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });
  const parts = [regatta, events, entries, regattaTeams, teams];

  if (parts.some((p) => p.isPending)) return <SkeletonRows rows={5} />;
  const failed = parts.find((p) => p.isError);
  if (failed || !regatta.data) {
    return (
      <ErrorState
        title="The event form did not load."
        error={failed?.error}
        onRetry={() => parts.forEach((p) => void p.refetch())}
      />
    );
  }
  const racing = new Set((regattaTeams.data ?? []).map((rt) => rt.teamId));
  const filterTeams = (teams.data ?? []).filter(
    (t) => racing.has(t.id) || event?.teamFilter?.includes(t.id),
  );
  return (
    <LoadedEventForm
      regatta={regatta.data}
      event={event ?? null}
      events={events.data ?? []}
      entries={entries.data ?? []}
      teams={filterTeams}
      defaultDay={defaultDay}
      defaultKind={defaultKind}
      onSaved={onSaved}
      onDone={onDone}
    />
  );
}

function LoadedEventForm({
  regatta,
  event,
  events,
  entries,
  teams,
  defaultDay,
  defaultKind,
  onSaved,
  onDone,
}: {
  regatta: Regatta;
  event: RegattaEvent | null;
  events: RegattaEvent[];
  entries: Entry[];
  teams: Team[];
  defaultDay?: string;
  defaultKind?: RegattaEvent['kind'];
  onSaved?: (event: RegattaEvent) => void;
  onDone: () => void;
}) {
  const idp = useId();
  const id = (name: string) => `${idp}-${name}`;
  const days = useMemo(() => regattaDays(regatta), [regatta]);
  const schema = useMemo(() => eventFormSchema(days), [days]);
  const finalEdit = useConfirmFinalEdit(regatta);
  const create = useCreate('events', { errorMessage: 'The event was not added. Try again.' });
  const batch = useBatch({ errorMessage: 'The event was not saved. Try again.' });
  const remove = useDelete('events', { errorMessage: 'The event was not deleted. Try again.' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(schema),
    defaultValues: event
      ? eventToForm(event, regatta.timezone)
      : newEventDefaults({
          day: defaultDay && days.includes(defaultDay) ? defaultDay : days[0]!,
          kind: defaultKind,
        }),
  });
  const { errors } = form.formState;
  const kind = useWatch({ control: form.control, name: 'kind' });
  const boatClass = useWatch({ control: form.control, name: 'boatClass' });
  const race = kind === 'race';
  const onEvent = event ? entries.filter((e) => e.eventId === event.id) : [];
  const classChanged =
    !!event && race && !!boatClass && !!event.boatClass && boatClass !== event.boatClass;

  const a11y = (name: keyof EventFormValues) => ({
    'aria-invalid': !!errors[name] || undefined,
    'aria-describedby': errors[name] ? `${id(name)}-error` : undefined,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const fields = formToEventFields(values, regatta.timezone);
    const ok = await finalEdit.confirm(event ? 'Save event' : 'Add event');
    if (!ok) return;
    try {
      let saved: RegattaEvent;
      if (!event) {
        saved = await create.mutateAsync({
          ...fields,
          regattaId: regatta.id,
          sortOrder: nextSortOrder(events),
          source: 'manual',
        });
        toast.success(race ? 'Event added' : 'Logistics item added');
      } else {
        const ops: BatchOp[] = [batchOp.update('events', event.id, fields)];
        // The server moves the entries with the event's class (§8.3); do the same here so the
        // change shows at once and demo mode matches.
        if (fields.boatClass && fields.boatClass !== event.boatClass) {
          for (const e of onEvent) {
            if (e.boatClass !== fields.boatClass) {
              ops.push(batchOp.update('entries', e.id, { boatClass: fields.boatClass }));
            }
          }
        }
        const results = await batch.mutateAsync(ops);
        saved = results[0] as RegattaEvent;
        toast.success(race ? 'Event saved' : 'Logistics item saved');
      }
      onSaved?.(saved);
      onDone();
    } catch {
      // The mutation's toast explains; the dialog stays open.
    }
  });

  const onDelete = async () => {
    if (!event) return;
    setConfirmDelete(false);
    const ok = await finalEdit.confirm(race ? 'Delete event' : 'Delete logistics item');
    if (!ok) return;
    try {
      await remove.mutateAsync(event.id);
      toast.success(event.kind === 'race' ? 'Event deleted' : 'Logistics item deleted');
      onDone();
    } catch {
      // Toast from the mutation.
    }
  };

  const busy = create.isPending || batch.isPending || remove.isPending;
  const dayOptions = days.map((d) => ({ value: d, label: formatWeekday(d) }));

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <Controller
        control={form.control}
        name="kind"
        render={({ field }) => (
          <SegmentedControl
            label="Kind"
            value={field.value}
            onValueChange={field.onChange}
            className="self-start"
            options={[
              { value: 'race', label: 'Race' },
              { value: 'logistics', label: 'Logistics item' },
            ]}
          />
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[7rem_1fr]">
        {race && (
          <Field id={id('eventNumber')} label="Event number" error={errors.eventNumber?.message}>
            <Input
              id={id('eventNumber')}
              autoComplete="off"
              className="tabular-nums"
              {...a11y('eventNumber')}
              {...form.register('eventNumber')}
            />
          </Field>
        )}
        <Field
          id={id('name')}
          label={race ? 'Name' : 'What happens'}
          hint={race ? undefined : 'Like "Bus departs hotel" or "Coach meeting".'}
          error={errors.name?.message}
          className={race ? undefined : 'sm:col-span-2'}
        >
          <Input id={id('name')} autoComplete="off" {...a11y('name')} {...form.register('name')} />
        </Field>
      </div>

      {race && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={id('boatClass')} label="Boat class" error={errors.boatClass?.message}>
            <Controller
              control={form.control}
              name="boatClass"
              render={({ field }) => (
                <Select
                  id={id('boatClass')}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Choose a class"
                  options={BOAT_CLASSES.map((c) => ({ value: c, label: c }))}
                />
              )}
            />
          </Field>
          <Field
            id={id('category')}
            label="Category"
            hint="Optional, like Men's Junior Varsity."
            error={errors.category?.message}
          >
            <Input id={id('category')} autoComplete="off" {...form.register('category')} />
          </Field>
          {classChanged && onEvent.length > 0 && (
            <p role="status" className="text-sm leading-prose text-ink-2 sm:col-span-2">
              {plural(onEvent.length, 'entry', 'entries')} on this event change to {boatClass} too.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {days.length > 1 || !days.includes(form.getValues('day')) ? (
          <Field id={id('day')} label="Day" error={errors.day?.message}>
            <Controller
              control={form.control}
              name="day"
              render={({ field }) => (
                <Select
                  id={id('day')}
                  value={days.includes(field.value) ? field.value : ''}
                  onValueChange={field.onChange}
                  placeholder="Choose a day"
                  options={dayOptions}
                />
              )}
            />
          </Field>
        ) : null}
        <Field
          id={id('time')}
          label="Time"
          hint="Leave blank if the time is not out yet (TBD)."
          error={errors.time?.message}
        >
          <Input
            id={id('time')}
            type="time"
            className="tabular-nums sm:w-40"
            {...a11y('time')}
            {...form.register('time')}
          />
        </Field>
      </div>

      {race && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={id('stage')} label="Stage">
            <Controller
              control={form.control}
              name="stage"
              render={({ field }) => (
                <Select
                  id={id('stage')}
                  value={field.value}
                  onValueChange={field.onChange}
                  options={STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
                />
              )}
            />
          </Field>
          <Field
            id={id('progressionGroup')}
            label="Progression group"
            hint="Ties heats to their final, like Event 14."
          >
            <Input
              id={id('progressionGroup')}
              autoComplete="off"
              {...form.register('progressionGroup')}
            />
          </Field>
        </div>
      )}

      {!race && teams.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-ink">Teams</legend>
          <p className="-mt-1 text-sm text-ink-2">Leave all unchecked if it is for everyone.</p>
          <Controller
            control={form.control}
            name="teamFilter"
            render={({ field }) => (
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {teams.map((t) => {
                  const cid = id(`team-${t.id}`);
                  const checked = field.value.includes(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex min-h-9 items-center gap-2 pointer-coarse:min-h-11"
                    >
                      <Checkbox
                        id={cid}
                        checked={checked}
                        onCheckedChange={(v) =>
                          field.onChange(
                            v === true
                              ? [...field.value, t.id]
                              : field.value.filter((x) => x !== t.id),
                          )
                        }
                      />
                      <Label htmlFor={cid} className="flex items-center gap-1.5 font-normal">
                        <TeamDot colorKey={t.colorKey} />
                        {t.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            )}
          />
        </fieldset>
      )}

      <Field id={id('notes')} label="Notes">
        <Textarea id={id('notes')} rows={2} {...form.register('notes')} />
      </Field>

      <DialogFooter className="items-center justify-between">
        {event ? (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-tint"
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            <Trash2 aria-hidden />
            {race ? 'Delete event' : 'Delete logistics item'}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {event ? 'Save event' : race ? 'Add event' : 'Add logistics item'}
          </Button>
        </div>
      </DialogFooter>

      {event && (
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent
            title={`Delete ${eventTitle(event)}?`}
            description={
              onEvent.length > 0
                ? `${plural(onEvent.length, 'entry', 'entries')} on it become${onEvent.length === 1 ? 's' : ''} unscheduled. Lineups stay as they are.`
                : 'No entries use it.'
            }
          >
            <DialogFooter>
              <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => void onDelete()}>
                {race ? 'Delete event' : 'Delete logistics item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {finalEdit.dialog}
    </form>
  );
}

export function EventFormDialog({
  regattaId,
  open,
  onOpenChange,
  event,
  defaultDay,
  defaultKind,
  onSaved,
}: EventFormDialogProps) {
  const logistics = (event?.kind ?? defaultKind) === 'logistics';
  const title = event
    ? logistics
      ? 'Edit logistics item'
      : 'Edit event'
    : logistics
      ? 'Add logistics item'
      : 'Add event';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="max-w-xl">
        <EventForm
          regattaId={regattaId}
          event={event}
          defaultDay={defaultDay}
          defaultKind={defaultKind}
          onSaved={onSaved}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
