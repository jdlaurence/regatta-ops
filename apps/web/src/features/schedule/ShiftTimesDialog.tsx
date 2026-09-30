// Bulk time shift (PLAN.md §6.3): "everything after 11:00 is 20 minutes late". Pick a day, a
// start time, and minutes; preview the events that move; apply as one batch.

import { useMemo, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { clockAt, type RegattaEvent } from '@srt/domain';
import { formatWeekday } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { eventTitle, leavesDay, planShift, wallTime, type ShiftChange } from './lib';

export interface ShiftTimesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: readonly RegattaEvent[];
  days: readonly string[];
  /** Day to start on (the one the page shows). */
  day: string;
  timeZone: string;
  isFinal: boolean;
  onApply: (changes: ShiftChange[]) => void;
}

export function ShiftTimesDialog(props: ShiftTimesDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <DialogContent
          title="Shift times"
          description="Move every event from a time onward, such as when racing runs 20 minutes late."
        >
          <ShiftForm {...props} />
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The first timed event of a day, as the default start ("from the next race on"). */
function firstTime(events: readonly RegattaEvent[], day: string, timeZone: string): string {
  const first = events
    .filter((e) => e.day === day && e.scheduledAt)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))[0];
  return first?.scheduledAt ? wallTime(first.scheduledAt, timeZone) : '08:00';
}

function ShiftForm({
  onOpenChange,
  events,
  days,
  day: initialDay,
  timeZone,
  isFinal,
  onApply,
}: ShiftTimesDialogProps) {
  const [day, setDay] = useState(initialDay);
  const [from, setFrom] = useState(() => firstTime(events, initialDay, timeZone));
  const [direction, setDirection] = useState<'later' | 'earlier'>('later');
  const [minutesText, setMinutesText] = useState('20');
  const minutes = Math.round(Number(minutesText));
  const validMinutes = Number.isFinite(minutes) && minutes > 0 && minutes <= 12 * 60;
  const signed = direction === 'later' ? minutes : -minutes;

  const changes = useMemo(
    () => (validMinutes ? planShift(events, { day, from, minutes: signed }, timeZone) : []),
    [events, day, from, signed, timeZone, validMinutes],
  );
  const crossing = changes.some((c) => leavesDay(c, timeZone));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (changes.length === 0) return;
    onApply(changes);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {days.length > 1 && (
          <Field id="shift-day" label="Day" className="sm:col-span-2">
            <Select
              id="shift-day"
              value={day}
              onValueChange={(d) => {
                setDay(d);
                setFrom(firstTime(events, d, timeZone));
              }}
              options={days.map((d) => ({ value: d, label: formatWeekday(d) }))}
            />
          </Field>
        )}
        <Field id="shift-from" label="Events at or after">
          <Input
            id="shift-from"
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="tabular-nums"
          />
        </Field>
        <Field
          id="shift-minutes"
          label="Minutes"
          error={validMinutes ? undefined : 'Enter minutes from 1 to 720.'}
        >
          <div className="flex items-center gap-2">
            <Input
              id="shift-minutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={720}
              value={minutesText}
              aria-invalid={!validMinutes}
              aria-describedby={validMinutes ? undefined : 'shift-minutes-error'}
              onChange={(e) => setMinutesText(e.target.value)}
              className="w-20 tabular-nums"
            />
            <SegmentedControl
              label="Direction"
              value={direction}
              onValueChange={setDirection}
              size="sm"
              options={[
                { value: 'later', label: 'Later' },
                { value: 'earlier', label: 'Earlier' },
              ]}
            />
          </div>
        </Field>
      </div>

      <section aria-labelledby="shift-preview" className="flex flex-col gap-2">
        <h3 id="shift-preview" className="text-base font-medium" aria-live="polite">
          {changes.length === 0
            ? 'No events move'
            : changes.length === 1
              ? '1 event moves'
              : `${changes.length} events move`}
        </h3>
        {changes.length === 0 ? (
          <p className="text-base text-ink-2">
            Nothing on this day has a time at or after {from || 'that time'}.
          </p>
        ) : (
          <ul className="flex max-h-60 flex-col overflow-y-auto rounded-control border border-line">
            {changes.map((c) => (
              <li
                key={c.event.id}
                className="flex items-center gap-3 border-b border-line px-3 py-1.5 text-base last:border-b-0"
              >
                <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                  <span className="text-ink-2">{clockAt(c.before, timeZone)}</span>
                  <ArrowRight aria-label="to" className="size-3.5 text-ink-2" />
                  <span className="font-medium">{clockAt(c.after, timeZone)}</span>
                </span>
                <span className={c.event.kind === 'logistics' ? 'truncate text-ink-2' : 'truncate'}>
                  {eventTitle(c.event)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {crossing && (
          <p className="text-sm text-warn">Some events move past midnight onto another day.</p>
        )}
        {isFinal && (
          <p className="text-sm text-ink-2">
            This regatta is final. Everyone sees the new times right away.
          </p>
        )}
      </section>

      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={changes.length === 0}>
          {changes.length === 1 ? 'Shift 1 event' : `Shift ${changes.length} events`}
        </Button>
      </DialogFooter>
    </form>
  );
}
