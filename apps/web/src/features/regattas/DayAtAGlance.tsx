// "Day at a glance" on the overview (PLAN.md §6.2): per day, a one-line summary in words and the
// miniature timeline (shells as rows, components/DayTimeline.tsx). With no events yet it offers
// the two ways to add them.

import { Link, useNavigate } from 'react-router';
import { CalendarClock, ClipboardPaste, Plus } from 'lucide-react';
import { clockAt, type Regatta, type RegattaEvent } from '@srt/domain';
import { lineupEntryPath, regattaPath } from '@/app/nav-items';
import { useFindings } from '@/data';
import { DayTimeline } from '@/components/DayTimeline';
import { formatWeekday } from '@/lib/dates';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { regattaDays } from './duplicate';

export interface DaySummary {
  day: string;
  races: number;
  logistics: number;
  unscheduled: number;
  first: string | null;
  last: string | null;
}

/** Counts and first and last race time per regatta day (and any other day events sit on). */
export function summarizeDays(
  regatta: Pick<Regatta, 'startDate' | 'endDate'>,
  events: readonly RegattaEvent[],
): DaySummary[] {
  const days = new Set(regattaDays(regatta));
  for (const e of events) days.add(e.day);
  return [...days].sort().map((day) => {
    const list = events.filter((e) => e.day === day);
    const races = list.filter((e) => e.kind === 'race');
    const times = races
      .map((e) => e.scheduledAt)
      .filter((t): t is string => !!t)
      .sort();
    return {
      day,
      races: races.length,
      logistics: list.length - races.length,
      unscheduled: races.filter((e) => !e.scheduledAt).length,
      first: times[0] ?? null,
      last: times[times.length - 1] ?? null,
    };
  });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function DayAtAGlance({
  regatta,
  events,
  canEdit,
  onImport,
  onAddEvent,
}: {
  regatta: Regatta;
  events: RegattaEvent[];
  canEdit: boolean;
  onImport: () => void;
  onAddEvent: () => void;
}) {
  const { input, findings } = useFindings(regatta.id);
  const navigate = useNavigate();
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<CalendarClock />}
        title="No events yet"
        description="Paste the published schedule, or add events one at a time. Entries are built on events."
        action={
          canEdit ? (
            <>
              <Button variant="primary" onClick={onImport}>
                <ClipboardPaste aria-hidden />
                Import events
              </Button>
              <Button onClick={onAddEvent}>
                <Plus aria-hidden />
                Add event
              </Button>
            </>
          ) : undefined
        }
      />
    );
  }

  const tz = regatta.timezone;
  const summaries = summarizeDays(regatta, events);
  const openEntry = (entryId: string) => {
    const entry = input?.entries.find((e) => e.id === entryId);
    if (entry) navigate(lineupEntryPath(regatta.id, entry.teamId, entry.id));
  };
  return (
    <div
      data-slot="day-timeline"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
    >
      <ul className="flex flex-col gap-4">
        {summaries.map((d) => (
          <li key={d.day} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="w-28 shrink-0 font-medium tabular-nums">{formatWeekday(d.day)}</span>
              <span className="text-base leading-prose text-ink-2 tabular-nums">
                {d.races === 0 && d.logistics === 0
                  ? 'Nothing scheduled'
                  : [
                      d.races > 0 &&
                        (d.first && d.last
                          ? `${plural(d.races, 'race')}, ${clockAt(d.first, tz, true)} to ${clockAt(d.last, tz, true)}`
                          : plural(d.races, 'race')),
                      d.unscheduled > 0 && `${d.unscheduled} without a time`,
                      d.logistics > 0 && plural(d.logistics, 'logistics item'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </div>
            {input && d.races > 0 && d.first && (
              <DayTimeline
                input={input}
                findings={findings}
                day={d.day}
                mini
                label={`Day at a glance, ${formatWeekday(d.day)}`}
                emptyText="No boats booked yet."
                onBarClick={openEntry}
              />
            )}
          </li>
        ))}
      </ul>
      <Link
        to={regattaPath(regatta.id, 'schedule')}
        className="self-start text-base text-accent hover:underline"
      >
        Open the schedule
      </Link>
    </div>
  );
}
