// The by-event view (PLAN.md §4.4, §6.4): the team's entries under their events in schedule
// order, day headings on multi-day regattas, unscheduled entries at the end.

import { Plus } from 'lucide-react';
import type { RegattaEvent } from '@srt/domain';
import { formatWeekday } from '@/lib/dates';
import { ClassBadge } from '@/components/chips';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useLineup } from './context';
import { EntryCard } from './EntryCard';
import { eventTitle, groupEntries, type EventGroup } from './lib';
import { useLineupUi } from './store';

function EventHeader({ event, onAdd }: { event: RegattaEvent | null; onAdd?: () => void }) {
  const { ws, canEdit } = useLineup();
  const t = event ? eventTitle(event, ws.regatta.timezone) : null;
  return (
    <div className="flex min-h-9 items-center gap-2">
      <h3 className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-base">
        {t ? (
          <>
            {t.number && <span className="font-medium text-ink">{t.number}</span>}
            <span className="text-ink">{t.name}</span>
            <span className="font-medium text-ink tabular-nums">
              {t.time ?? <span className="font-normal text-ink-2">Time to be set</span>}
            </span>
          </>
        ) : (
          <span className="font-medium text-ink">Unscheduled</span>
        )}
      </h3>
      {event?.boatClass && <ClassBadge boatClass={event.boatClass} />}
      {canEdit && onAdd && (
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-accent"
          onClick={onAdd}
          aria-label={`Add entry to ${t?.number ?? t?.name ?? 'unscheduled'}`}
        >
          <Plus aria-hidden />
          Add entry
        </Button>
      )}
    </div>
  );
}

function EventBlock({ group }: { group: EventGroup }) {
  const { actions, team } = useLineup();
  const add = () => {
    const id = actions.addEntry({ event: group.event, boatClass: group.event.boatClass ?? '8+' });
    setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-lineup-entry="${id}"] [data-lineup-seat]`)
        ?.focus();
    }, 60);
  };
  return (
    <section aria-label={group.event.name} className="flex flex-col gap-2">
      <EventHeader event={group.event} onAdd={group.event.boatClass ? add : undefined} />
      {group.entries.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong/60 px-3 py-3 text-base text-ink-2">
          No {team.shortName || team.name} entry in this event.
        </p>
      ) : (
        group.entries.map((e) => <EntryCard key={e.id} entry={e} />)
      )}
    </section>
  );
}

export function EntriesByEvent({
  showAll,
  onShowAll,
}: {
  showAll: boolean;
  onShowAll: () => void;
}) {
  const { index, team, canEdit } = useLineup();
  const groups = groupEntries(index, team.id, { showAll });
  const multiDay = index.days.length > 1;
  const openAdd = (unscheduled = false) =>
    useLineupUi.getState().openDialog({ kind: 'add', unscheduled });

  if (groups.ordered.length === 0 && groups.days.length === 0) {
    return (
      <EmptyState
        title="No entries yet"
        description="Add one from an event on the schedule, or add an unscheduled entry."
        action={
          canEdit ? (
            <>
              <Button variant="primary" onClick={() => openAdd()}>
                <Plus aria-hidden />
                Add entry
              </Button>
              {!showAll && <Button onClick={onShowAll}>Show all events</Button>}
            </>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groups.days.map((d) => (
        <section
          key={d.day}
          aria-label={multiDay ? formatWeekday(d.day) : undefined}
          className="flex flex-col gap-6"
        >
          {multiDay && (
            <h2 className="border-b border-line pb-1 font-display text-lg font-semibold">
              {formatWeekday(d.day)}
            </h2>
          )}
          {d.events.map((g) => (
            <EventBlock key={g.event.id} group={g} />
          ))}
        </section>
      ))}
      {(groups.unscheduled.length > 0 || canEdit) && (
        <section aria-label="Unscheduled" className="flex flex-col gap-2">
          <EventHeader event={null} onAdd={() => openAdd(true)} />
          {groups.unscheduled.length === 0 ? (
            <p className="text-base text-ink-2">
              Entries without an event land here, for crews you are still placing.
            </p>
          ) : (
            groups.unscheduled.map((e) => <EntryCard key={e.id} entry={e} showClass />)
          )}
        </section>
      )}
    </div>
  );
}
