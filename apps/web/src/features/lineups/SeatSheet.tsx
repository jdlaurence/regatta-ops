// Phones (< 768 px, PLAN.md §5.3): tapping a seat opens this bottom sheet with the athlete
// picker. Rows are 44 px tall; the search box filters the same candidates the desktop picker
// shows. Viewers see who sits there and nothing to change.

import { useMemo, useState } from 'react';
import { athleteName, entrySeatSides } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { filterOptions } from '@/components/ui/combobox';
import { ConflictIcon } from '@/components/ConflictBadge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { useLineup } from './context';
import { entryName, seatCandidates, type SeatCandidate } from './lib';
import { AthleteBadges } from './Seats';
import { useLineupUi } from './store';

function Row({ c, current, onPick }: { c: SeatCandidate; current: boolean; onPick: () => void }) {
  const elsewhere = c.inThisEntry && !current ? c.inThisEntry : null;
  const hint =
    (c.unavailable
      ? `Unavailable${c.unavailable === 'Unavailable' ? '' : `: ${c.unavailable}`}`
      : null) ??
    c.clash?.text ??
    (current
      ? 'In this seat now'
      : elsewhere
        ? `In ${elsewhere === 'cox' ? 'the cox seat' : `seat ${elsewhere}`} now; picking swaps them`
        : null);
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={current || undefined}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-control px-3 py-1.5 text-left hover:bg-surface-2',
          current && 'bg-accent-tint',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-md">{athleteName(c.athlete)}</span>
          {hint && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-sm',
                c.unavailable || c.clash?.severity === 'error'
                  ? 'text-danger'
                  : c.clash
                    ? 'text-warn'
                    : 'text-ink-2',
              )}
            >
              {(c.unavailable || c.clash) && (
                <ConflictIcon
                  severity={c.unavailable ? 'error' : (c.clash?.severity ?? 'warning')}
                  className="size-3"
                />
              )}
              {hint}
            </span>
          )}
        </span>
        <AthleteBadges athlete={c.athlete} />
        <span className="w-4 text-right text-sm text-ink-2 tabular-nums">{c.entryCount}</span>
      </button>
    </li>
  );
}

function SheetBody() {
  const { index, actions, canEdit } = useLineup();
  const picker = useLineupUi((s) => s.picker)!;
  const [query, setQuery] = useState('');
  const entry = index.entryById.get(picker.entryId);
  const shell = entry?.shellId ? index.shellById.get(entry.shellId) : null;
  const candidates = useMemo(
    () => (entry ? seatCandidates(index, entry, picker.seat, entrySeatSides(entry, shell)) : []),
    [index, entry, picker.seat, shell],
  );
  const filtered = useMemo(() => {
    const opts = candidates.map((c) => ({
      value: c.athlete.id,
      label: athleteName(c.athlete),
      keywords: [c.athlete.firstName, c.athlete.lastName, c.athlete.preferredName ?? ''],
    }));
    const keep = new Set(filterOptions(opts, query).map((o) => o.value));
    return candidates.filter((c) => keep.has(c.athlete.id));
  }, [candidates, query]);
  if (!entry) return null;
  const occupantId = index.seatsByEntry.get(entry.id)?.get(picker.seat)?.athleteId ?? null;
  const occupant = occupantId ? index.athleteById.get(occupantId) : null;
  const close = () => useLineupUi.getState().closePicker();
  const seatName = picker.seat === 'cox' ? 'Cox' : `Seat ${picker.seat}`;
  if (!canEdit) {
    return (
      <p className="px-4 py-4 text-md">
        {occupant ? athleteName(occupant) : 'Empty'}
        <span className="block text-sm text-ink-2">
          Viewers can see lineups but not change them.
        </span>
      </p>
    );
  }
  const groups: { group: string; items: SeatCandidate[] }[] = [];
  for (const c of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.group === c.group) last.items.push(c);
    else groups.push({ group: c.group, items: [c] });
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3">
        <p className="text-sm text-ink-2">
          {seatName} of {entryName(index, entry)}: {occupant ? athleteName(occupant) : 'empty'}
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search athletes…"
          aria-label="Search athletes"
          className="h-11 w-full rounded-control border border-line-strong bg-surface px-3 text-md placeholder:text-ink-2"
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-ink-2">No athletes match.</li>
        )}
        {groups.map((g) => (
          <li key={g.group}>
            <p className="px-3 pt-3 pb-1 text-sm font-medium text-ink-2">{g.group}</p>
            <ul>
              {g.items.map((c) => (
                <Row
                  key={c.athlete.id}
                  c={c}
                  current={c.athlete.id === occupantId}
                  onPick={() => {
                    actions.place({ entryId: entry.id, seat: picker.seat }, c.athlete.id);
                    close();
                  }}
                />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {occupant && (
        <div className="border-t border-line p-3">
          <Button
            className="w-full"
            onClick={() => {
              actions.clear({ entryId: entry.id, seat: picker.seat });
              close();
            }}
          >
            Clear {seatName.toLowerCase()}
          </Button>
        </div>
      )}
    </div>
  );
}

export function SeatSheet() {
  const open = useLineupUi((s) => !!s.picker);
  const picker = useLineupUi((s) => s.picker);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && useLineupUi.getState().closePicker()}>
      {picker && (
        <SheetContent
          side="bottom"
          title={picker.seat === 'cox' ? 'Choose the cox' : `Choose seat ${picker.seat}`}
        >
          <SheetBody key={`${picker.entryId}:${picker.seat}`} />
        </SheetContent>
      )}
    </Sheet>
  );
}
