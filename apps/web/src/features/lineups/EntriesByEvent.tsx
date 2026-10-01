// The by-event view (PLAN.md §4.4, §6.4): the team's entries under their events in schedule
// order, day headings on multi-day regattas, unscheduled entries at the end.
//
// Each day is a grid of equal card columns, filled in schedule order, row by row, like the
// club's printed grid. An event's heading spans its cards on a row; an event that does not fit
// the rest of a row continues on the next one (its heading repeated there), so there are no
// holes. Headings sit in their own grid row above the cards, and everything above a boat in a
// card has a fixed height: boats side by side start level and their seat rows line up.

import { Fragment, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { RegattaEvent } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';
import { ClassBadge } from '@/components/chips';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { useLineup } from './context';
import { EntryCard } from './EntryCard';
import { cardColumns, packRuns, useWidth } from './layout';
import { eventTitle, groupEntries, type EventGroup } from './lib';
import { useLineupUi } from './store';

function EventHeader({ event, onAdd }: { event: RegattaEvent | null; onAdd?: () => void }) {
  const { ws, canEdit } = useLineup();
  const t = event ? eventTitle(event, ws.regatta.timezone) : null;
  return (
    <div className="flex min-h-11 min-w-0 items-start gap-2">
      <h3 className="flex min-w-0 flex-1 flex-col text-base">
        {t ? (
          <>
            <span className="flex h-6 min-w-0 items-center gap-1.5">
              {t.time ? (
                <span className="shrink-0 font-medium text-ink tabular-nums">{t.time}</span>
              ) : (
                <span className="shrink-0 text-ink-2">Time to be set</span>
              )}
              {t.number && (
                <>
                  <span aria-hidden className="text-ink-2">
                    ·
                  </span>
                  <span className="min-w-0 truncate text-ink-2">{t.number}</span>
                </>
              )}
              {event?.boatClass && <ClassBadge boatClass={event.boatClass} className="ml-0.5" />}
            </span>
            <span className="min-w-0 truncate text-ink" title={t.name}>
              {t.name}
            </span>
          </>
        ) : (
          <>
            <span className="flex h-6 items-center font-medium text-ink">Unscheduled</span>
            <span className="min-w-0 truncate text-ink-2">Crews without an event</span>
          </>
        )}
      </h3>
      {canEdit && onAdd && (
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mr-1 shrink-0 text-accent"
          onClick={onAdd}
          title="Add entry"
          aria-label={`Add entry to ${t?.number ?? t?.name ?? 'unscheduled'}`}
        >
          <Plus aria-hidden />
        </Button>
      )}
    </div>
  );
}

/** Where an event with no entry of this team would have its cards. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-line-strong/60 px-3 py-3 text-base text-ink-2">
      {children}
    </p>
  );
}

/** One event (or the unscheduled entries): its heading, and its cards or a placeholder. */
interface Block {
  key: string;
  label: string;
  /** The heading; `continued` where the event carries on at the start of the next row. */
  header: (continued: boolean) => ReactNode;
  cards: { key: string; node: ReactNode }[];
}

/**
 * A day's events on the grid. Each event is one region (laid out with display: contents, so its
 * heading and cards are grid items); its heading is repeated, hidden from screen readers, where
 * the event continues on the next row.
 */
function DayGrid({ blocks, columns }: { blocks: Block[]; columns: number }) {
  const runs = packRuns(
    blocks.map((b) => b.cards.length),
    columns,
  );
  return (
    <div
      className="grid items-start gap-x-4 gap-y-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {blocks.map((b, i) => (
        <section key={b.key} aria-label={b.label} className="contents">
          {runs[i]!.map((run, j) => (
            <Fragment key={run.offset}>
              <div
                aria-hidden={j > 0 || undefined}
                className={cn('min-w-0', run.row > 0 && 'pt-4')}
                style={{
                  gridRow: run.row * 2 + 1,
                  gridColumn: `${run.col + 1} / span ${run.count}`,
                }}
              >
                {b.header(j > 0)}
              </div>
              {b.cards.slice(run.offset, run.offset + run.count).map((card, k) => (
                <div
                  key={card.key}
                  className="min-w-0"
                  style={{ gridRow: run.row * 2 + 2, gridColumn: run.col + k + 1 }}
                >
                  {card.node}
                </div>
              ))}
            </Fragment>
          ))}
        </section>
      ))}
    </div>
  );
}

/** A day's events (or the unscheduled entries) as grid blocks. */
function DayEvents({ events, columns }: { events: EventGroup[]; columns: number }) {
  const { actions, team } = useLineup();
  const add = (group: EventGroup) => {
    const id = actions.addEntry({ event: group.event, boatClass: group.event.boatClass ?? '8+' });
    setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[data-lineup-entry="${id}"] [data-lineup-seat]`)
        ?.focus();
    }, 60);
  };
  const blocks = events.map<Block>((g) => ({
    key: g.event.id,
    label: g.event.name,
    header: (continued) => (
      <EventHeader
        event={g.event}
        onAdd={g.event.boatClass && !continued ? () => add(g) : undefined}
      />
    ),
    cards:
      g.entries.length === 0
        ? [
            {
              key: 'none',
              node: (
                <Placeholder>No {team.shortName || team.name} entry in this event.</Placeholder>
              ),
            },
          ]
        : g.entries.map((e) => ({ key: e.id, node: <EntryCard entry={e} /> })),
  }));
  return <DayGrid blocks={blocks} columns={columns} />;
}

export function EntriesByEvent({
  showAll,
  onShowAll,
}: {
  showAll: boolean;
  onShowAll: () => void;
}) {
  const { index, team, canEdit } = useLineup();
  const [measure, width] = useWidth();
  const columns = cardColumns(width);
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
    <div ref={measure} className="flex min-w-0 flex-col gap-8">
      {groups.days.map((d) => (
        <section
          key={d.day}
          aria-label={multiDay ? formatWeekday(d.day) : undefined}
          className="flex flex-col gap-4"
        >
          {multiDay && (
            <h2 className="border-b border-line pb-1 font-display text-lg font-semibold">
              {formatWeekday(d.day)}
            </h2>
          )}
          <DayEvents events={d.events} columns={columns} />
        </section>
      ))}
      {(groups.unscheduled.length > 0 || canEdit) && (
        <DayGrid
          columns={columns}
          blocks={[
            {
              key: 'unscheduled',
              label: 'Unscheduled',
              header: (continued) => (
                <EventHeader event={null} onAdd={continued ? undefined : () => openAdd(true)} />
              ),
              cards:
                groups.unscheduled.length === 0
                  ? [
                      {
                        key: 'none',
                        node: (
                          <Placeholder>
                            Entries without an event land here, for crews you are still placing.
                          </Placeholder>
                        ),
                      },
                    ]
                  : groups.unscheduled.map((e) => ({
                      key: e.id,
                      node: <EntryCard entry={e} showClass />,
                    })),
            },
          ]}
        />
      )}
    </div>
  );
}
