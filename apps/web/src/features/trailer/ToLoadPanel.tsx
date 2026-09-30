// "To load" (PLAN.md §6.6 left column): the boats on no trailer yet, grouped by the trailer
// "Pack trailer" will put them on, each draggable onto the racks (or selectable, then a lane),
// then the gear checklist summary with a link to the load list. Dropping a boat from the racks
// here takes it off the trailer.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { clockAt, type Id, type PackBoat } from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { buildLoadRows, countRows, KIND_TITLES } from '@/features/load-list/lib';
import { BoatPill } from './parts';
import type { TrailerPageModel } from './lib';

type TeamLookup = RegattaWorkingSet['byId']['teams'];

export const TO_LOAD_DROP_ID = 'to-load';

function firstRace(boat: PackBoat, timeZone: string, multiDay: boolean): string | null {
  if (!boat.firstRaceAt) return null;
  const time = clockAt(boat.firstRaceAt, timeZone, true);
  if (!multiDay) return time;
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
    new Date(boat.firstRaceAt),
  );
  return `${weekday} ${time}`;
}

function ToLoadItem({
  boat,
  teams,
  timeZone,
  multiDay,
  selected,
  onSelect,
  dragEnabled,
}: {
  boat: PackBoat;
  teams: TeamLookup;
  timeZone: string;
  multiDay: boolean;
  selected: boolean;
  onSelect: (shellId: Id) => void;
  dragEnabled: boolean;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `load:${boat.shellId}`,
    data: { shellId: boat.shellId, from: 'to-load' },
    disabled: !dragEnabled,
  });
  const team = teams.get(boat.teamId);
  const race = firstRace(boat, timeZone, multiDay);
  const teamName = team ? team.shortName || team.name : boat.teamName || 'No team';
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        data-flip={boat.shellId}
        aria-pressed={selected}
        aria-roledescription={dragEnabled ? 'draggable boat' : undefined}
        aria-label={`${boat.name}, ${boat.cls}, ${teamName}${race ? `, first race ${race}` : ''}`}
        onClick={() => onSelect(boat.shellId)}
        {...(dragEnabled ? listeners : {})}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-control border px-2 py-1.5 text-left pointer-coarse:min-h-11',
          selected
            ? 'border-accent bg-accent-tint'
            : 'border-transparent hover:border-line hover:bg-surface-2',
          dragEnabled && 'cursor-grab touch-none active:cursor-grabbing',
          isDragging && 'opacity-40',
        )}
      >
        <BoatPill name={boat.name} cls={boat.cls} teamColor={team?.colorKey} className="shrink" />
        <span className="flex min-w-0 flex-1 flex-col text-right text-xs leading-tight text-ink-2">
          <span className="truncate">{teamName}</span>
          {race && <span className="truncate tabular-nums">{race}</span>}
        </span>
      </button>
    </li>
  );
}

export function ToLoadPanel({
  model,
  ws,
  trailerId,
  selectedId,
  onSelect,
  dragEnabled,
  dragFromTrailer,
  className,
}: {
  model: TrailerPageModel;
  ws: RegattaWorkingSet;
  /** The trailer on screen: its boats are listed first. */
  trailerId: Id;
  selectedId: Id | null;
  onSelect: (shellId: Id) => void;
  dragEnabled: boolean;
  /** A boat from the racks is being dragged: this panel takes it off the trailer. */
  dragFromTrailer: boolean;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: TO_LOAD_DROP_ID,
    data: { type: 'to-load' },
    disabled: !dragEnabled,
  });
  // Boats headed for another trailer fold away; drag one out to put it here instead.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const tz = ws.regatta.timezone;
  const multiDay = ws.regatta.endDate !== ws.regatta.startDate && !!ws.regatta.endDate;
  const groups = useMemo(() => {
    const order = [
      trailerId,
      ...model.trailers.map((t) => t.trailer.id).filter((id) => id !== trailerId),
    ];
    const out = order.map((id) => ({
      id,
      name: model.trailers.find((t) => t.trailer.id === id)?.trailer.name ?? 'A trailer',
      boats: model.toLoad.filter((b) => model.assignment.get(b.shellId) === id),
    }));
    const unassigned = model.toLoad.filter((b) => !model.assignment.has(b.shellId));
    if (unassigned.length > 0) out.push({ id: '', name: 'No trailer', boats: unassigned });
    return out.filter((g) => g.boats.length > 0);
  }, [model, trailerId]);

  const rows = useMemo(() => buildLoadRows(ws), [ws]);
  const counts = countRows(rows);
  const byKind = (['riggers', 'oar_set', 'gear', 'extra'] as const)
    .map((k) => ({ kind: k, n: rows.filter((r) => r.kind === k && !r.orphaned).length }))
    .filter((x) => x.n > 0);

  const total = model.toLoad.length;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="to-load-heading"
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-card border bg-surface p-3 @container',
        dragFromTrailer && isOver ? 'border-accent bg-accent-tint' : 'border-line',
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="to-load-heading" className="font-display text-lg font-semibold">
          To load
        </h2>
        <span className="text-sm text-ink-2 tabular-nums">
          {total === 0 ? 'All on a trailer' : `${total} ${total === 1 ? 'boat' : 'boats'}`}
        </span>
      </div>
      {dragFromTrailer && (
        <p className="rounded-control border border-dashed border-line-strong px-3 py-2 text-sm text-ink-2">
          Drop here to take the boat off the trailer.
        </p>
      )}
      {total === 0 ? (
        <p className="text-base leading-prose text-ink-2">
          Every boat racing is on a trailer. New entries show up here.
        </p>
      ) : (
        <>
          <p className="text-sm leading-prose text-ink-2">
            {dragEnabled
              ? 'Drag a boat onto a rack, or select it and choose a lane.'
              : 'Tap a boat to see where it fits.'}{' '}
            Pack trailer loads the boats listed under this trailer.
          </p>
          {groups.map((g) => {
            const here = g.id === trailerId;
            const open = here || expanded.has(g.id);
            const listId = `to-load-${g.id || 'none'}`;
            return (
              <div key={g.id || 'none'} className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-ink">
                  {here ? (
                    <span className="flex items-baseline justify-between gap-2">
                      For this trailer
                      <span className="font-normal text-ink-2 tabular-nums">{g.boats.length}</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-controls={listId}
                      onClick={() =>
                        setExpanded((f) => {
                          const next = new Set(f);
                          if (next.has(g.id)) next.delete(g.id);
                          else next.add(g.id);
                          return next;
                        })
                      }
                      className="-mx-1 flex min-h-8 w-[calc(100%+8px)] items-center justify-between gap-2 rounded-control px-1 text-left hover:bg-surface-2 pointer-coarse:min-h-11"
                    >
                      <span className="flex items-center gap-1">
                        <ChevronRight
                          aria-hidden
                          className={cn(
                            'size-4 text-ink-2 transition-transform',
                            open && 'rotate-90',
                          )}
                        />
                        {g.id ? `For the ${g.name}` : 'No trailer'}
                      </span>
                      <span className="font-normal text-ink-2 tabular-nums">{g.boats.length}</span>
                    </button>
                  )}
                </h3>
                {open && (
                  <ul id={listId} className="grid grid-cols-1 gap-x-3 gap-y-0.5 @md:grid-cols-2">
                    {g.boats.map((b) => (
                      <ToLoadItem
                        key={b.shellId}
                        boat={b}
                        teams={ws.byId.teams}
                        timeZone={tz}
                        multiDay={multiDay}
                        selected={selectedId === b.shellId}
                        onSelect={onSelect}
                        dragEnabled={dragEnabled}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line pt-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
          <ClipboardList aria-hidden className="size-4 text-ink-2" />
          Gear checklist
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-2">Nothing on the load list yet.</p>
        ) : (
          <>
            <p className="text-sm text-ink-2 tabular-nums">
              <span className="font-medium text-ink">
                {counts.loaded} of {counts.total}
              </span>{' '}
              loaded
              {byKind.length > 0 &&
                ` · ${byKind.map((k) => `${KIND_TITLES[k.kind].toLowerCase()} ${k.n}`).join(', ')}`}
            </p>
          </>
        )}
        <Link
          to={regattaPath(ws.regatta.id, 'load')}
          className="inline-flex min-h-8 items-center gap-1 self-start text-sm font-medium text-accent hover:underline pointer-coarse:min-h-11"
        >
          Open the load list
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </section>
  );
}
