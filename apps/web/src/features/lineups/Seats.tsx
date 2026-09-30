// Seats of an entry, as a vertical boat strip: the cox on top, then stroke down to bow. Each
// editable seat is a drop target, a drag source when occupied, and the trigger of its athlete
// picker (a bottom sheet on phones).
//
// Keyboard (PLAN.md §5.6, every drag has an equivalent):
//   Enter            choose an athlete (the picker)
//   a letter         the picker, searching for what you typed
//   Space            pick up the seat's athlete; Space or Enter on another seat puts them there
//                    (the two swap); Escape cancels
//   Delete/Backspace clear the seat
//   up and down      the seat above or below in this boat; Home and End the top and bottom
//   left and right   the same row of the boat before or after this one

import { useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Eraser } from 'lucide-react';
import {
  athleteName,
  athleteShortName,
  entrySeatSides,
  type Athlete,
  type Entry,
  type Seat,
  type Severity,
} from '@srt/domain';
import { cn } from '@/lib/cn';
import { BoatSeat, BoatStrip, type BoatSeatProps, type SeatOccupant } from '@/components/BoatStrip';
import { ConflictIcon } from '@/components/ConflictBadge';
import { SideBadge } from '@/components/chips';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { useLineup } from './context';
import { seatCandidates, sheetOrder, type SeatRef } from './lib';
import { useIsSettling, useLineupUi, usePickerOpen, type PickerState } from './store';

export const SEAT_HELP_ID = 'lineup-seat-help';

// ---------------------------------------------------------------------------
// Focus movement

function seatSelector(ref: SeatRef) {
  return `[data-lineup-seat="${ref.entryId}:${ref.seat}"]`;
}

export function focusSeat(ref: SeatRef) {
  document.querySelector<HTMLElement>(seatSelector(ref))?.focus();
}

/** Focus a seat once Radix has put focus back on the picker's trigger. */
export function focusSeatSoon(ref: SeatRef) {
  setTimeout(() => focusSeat(ref), 30);
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'first' | 'last';

function seatsIn(card: Element): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>('[data-lineup-seat]'));
}

/**
 * Move focus from a seat. Up and down stay in the boat; left and right go to the same row of
 * the neighboring entry in page order (the next card in the grid, or the first of the next row),
 * or its last row when that boat is shorter.
 */
function moveFocus(from: HTMLElement, dir: Direction) {
  const card = from.closest('[data-lineup-entry]');
  if (!card) return;
  const seats = seatsIn(card);
  const i = seats.indexOf(from);
  let target: HTMLElement | undefined;
  if (dir === 'up') target = seats[i - 1];
  if (dir === 'down') target = seats[i + 1];
  if (dir === 'first') target = seats[0];
  if (dir === 'last') target = seats.at(-1);
  if (dir === 'left' || dir === 'right') {
    const cards = Array.from(document.querySelectorAll('[data-lineup-entry]')).filter(
      (c) => seatsIn(c).length > 0,
    );
    const other = cards[cards.indexOf(card) + (dir === 'left' ? -1 : 1)];
    if (other) {
      const list = seatsIn(other);
      target = list[Math.min(i, list.length - 1)];
    }
  }
  target?.focus();
}

/** The seat below this one, for filling a boat from the top (cox, stroke, ... bow). */
function nextSeatRef(entry: Entry, seat: Seat): SeatRef | null {
  const order = sheetOrder(entry.boatClass);
  const next = order[order.indexOf(seat) + 1];
  return next ? { entryId: entry.id, seat: next } : null;
}

// ---------------------------------------------------------------------------
// Picker options

function CoxBadge() {
  return (
    <span
      title="Coxswain"
      className="inline-flex h-5 shrink-0 items-center rounded-control border border-line px-1 text-xs font-medium text-ink-2"
    >
      Cox
    </span>
  );
}

/** Side, sculler, or cox badge for an athlete. */
export function AthleteBadges({ athlete }: { athlete: Athlete }) {
  if (athlete.side === 'none' && !athlete.canScull && athlete.canCox) return <CoxBadge />;
  return <SideBadge side={athlete.side} canScull={athlete.canScull} />;
}

function useSeatOptions(entry: Entry, seat: Seat, enabled: boolean): ComboboxOption[] {
  const { index } = useLineup();
  const shell = entry.shellId ? index.shellById.get(entry.shellId) : null;
  return useMemo(() => {
    if (!enabled) return [];
    const sides = entrySeatSides(entry, shell);
    return seatCandidates(index, entry, seat, sides).map((c) => {
      const a = c.athlete;
      const lines: ReactNode[] = [];
      if (c.unavailable) {
        lines.push(
          <span key="u" className="inline-flex items-center gap-1 text-danger">
            <ConflictIcon severity="error" className="size-3" />
            {c.unavailable === 'Unavailable' ? 'Unavailable' : `Unavailable: ${c.unavailable}`}
          </span>,
        );
      }
      if (c.clash) {
        lines.push(
          <span
            key="c"
            className={cn(
              'inline-flex items-center gap-1',
              c.clash.severity === 'error' ? 'text-danger' : 'text-warn',
            )}
          >
            <ConflictIcon severity={c.clash.severity} className="size-3" />
            {c.clash.text}
          </span>,
        );
      }
      if (c.inThisEntry && c.inThisEntry !== seat) {
        lines.push(
          <span key="s">
            In {c.inThisEntry === 'cox' ? 'the cox seat' : `seat ${c.inThisEntry}`} now; picking
            swaps them
          </span>,
        );
      }
      return {
        value: a.id,
        label: athleteName(a),
        keywords: [a.firstName, a.lastName, a.preferredName ?? ''],
        group: c.group,
        render: (
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate">{athleteName(a)}</span>
            <AthleteBadges athlete={a} />
            <span
              className="ml-auto shrink-0 text-sm text-ink-2 tabular-nums"
              title={`${c.entryCount} ${c.entryCount === 1 ? 'entry' : 'entries'}`}
            >
              {c.entryCount}
            </span>
          </span>
        ),
        hint: lines.length > 0 ? <span className="flex flex-col gap-0.5">{lines}</span> : undefined,
      } satisfies ComboboxOption;
    });
  }, [enabled, index, entry, seat, shell]);
}

// ---------------------------------------------------------------------------
// One seat's wiring: drag, drop, keyboard, picker

export interface SeatDragData {
  kind: 'seat';
  entryId: string;
  seat: Seat;
  athleteId: string;
}

export interface SeatDropData {
  kind: 'seat';
  entryId: string;
  seat: Seat;
}

const ARROWS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'first',
  End: 'last',
};

function useSeatWiring(entry: Entry, seat: Seat, occupantId: string | null) {
  const { actions, index, canEdit, isPhone } = useLineup();
  const target: SeatRef = { entryId: entry.id, seat };
  const dnd = canEdit && !isPhone;
  const {
    setNodeRef: setDragRef,
    listeners,
    isDragging,
  } = useDraggable({
    id: `seat:${entry.id}:${seat}`,
    data: {
      kind: 'seat',
      entryId: entry.id,
      seat,
      athleteId: occupantId ?? '',
    } satisfies SeatDragData,
    disabled: !dnd || !occupantId,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${entry.id}:${seat}`,
    data: { kind: 'seat', entryId: entry.id, seat } satisfies SeatDropData,
    disabled: !dnd,
  });
  const setRef = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const picker = usePickerOpen(entry.id, seat);
  const settling = useIsSettling(entry.id, seat);
  const carrying = useLineupUi((s) => s.carrying);
  const ui = useLineupUi.getState;

  const dropCarried = () => {
    const c = ui().carrying;
    if (!c) return false;
    ui().carry(null);
    actions.place(target, c.athleteId, c.from);
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const el = e.currentTarget;
    if (k === 'Escape' && ui().carrying) {
      e.preventDefault();
      ui().carry(null);
      ui().announce('Move cancelled.');
      return;
    }
    if (k === 'Enter' || k === ' ') {
      if (ui().carrying) {
        e.preventDefault();
        dropCarried();
        return;
      }
      if (k === ' ' && canEdit) {
        e.preventDefault();
        if (occupantId) {
          ui().carry({ athleteId: occupantId, from: target });
          const a = index.athleteById.get(occupantId);
          ui().announce(
            `Picked up ${a ? athleteName(a) : 'the athlete'}. Move to another seat and press Space to put them there, or Escape to cancel.`,
          );
        } else ui().openPicker(target);
      }
      return;
    }
    if ((k === 'Delete' || k === 'Backspace') && canEdit) {
      e.preventDefault();
      if (occupantId) actions.clear(target);
      return;
    }
    const dir = ARROWS[k];
    if (dir) {
      e.preventDefault();
      moveFocus(el, dir);
      return;
    }
    if (canEdit && k.length === 1 && /\S/.test(k)) {
      e.preventDefault();
      ui().openPicker(target, k);
    }
  };

  const onOpenChange = (open: boolean) => {
    if (!open) {
      ui().closePicker();
      return;
    }
    if (dropCarried()) return;
    ui().openPicker(target);
  };

  const onPick = (athleteId: string | null) => {
    if (athleteId === null) actions.clear(target);
    else actions.place(target, athleteId);
    const next = athleteId ? nextSeatRef(entry, seat) : null;
    focusSeatSoon(next ?? target);
  };

  const openSheet = () => ui().openPicker(target);

  return {
    setRef,
    listeners: dnd ? listeners : undefined,
    isDragging,
    isOver,
    picker,
    settling,
    carrying: !!carrying,
    onKeyDown,
    onOpenChange,
    onPick,
    openSheet,
    seatId: `${entry.id}:${seat}`,
    describedBy: canEdit ? SEAT_HELP_ID : undefined,
  };
}

/** The athlete picker around a seat (desktop and tablet; phones use the sheet). */
function SeatPicker({
  entry,
  seat,
  occupantId,
  picker,
  onPick,
  onOpenChange,
  trigger,
}: {
  entry: Entry;
  seat: Seat;
  occupantId: string | null;
  picker: PickerState | null;
  onPick: (athleteId: string | null) => void;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
}) {
  const { index } = useLineup();
  const open = !!picker;
  const options = useSeatOptions(entry, seat, open);
  const occupant = occupantId ? index.athleteById.get(occupantId) : null;
  const label = seat === 'cox' ? 'Cox' : `Seat ${seat}`;
  // Opening by typing remounts the picker so its search starts from the typed text. The key
  // then stays put, so closing does not remount and focus returns to the seat.
  const [typedOpen, setTypedOpen] = useState(0);
  if (picker?.query && picker.nonce !== typedOpen) setTypedOpen(picker.nonce);
  return (
    <Combobox
      key={typedOpen}
      options={options}
      value={occupantId}
      onValueChange={onPick}
      label={label}
      searchPlaceholder={`Athlete for ${label.toLowerCase()}…`}
      emptyText="No athletes match. Check the spelling or clear the search."
      open={open}
      onOpenChange={onOpenChange}
      initialQuery={picker?.query ?? ''}
      trigger={trigger}
      contentClassName="w-[340px]"
      footer={
        occupant ? (
          // Not a list row: Enter on a freshly opened picker must never empty the seat.
          <button
            type="button"
            onClick={() => {
              onPick(null);
              onOpenChange(false);
            }}
            className="flex h-8 w-full items-center gap-2 rounded-control px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11"
          >
            <Eraser aria-hidden className="size-4" />
            <span className="min-w-0 truncate">
              Clear {label.toLowerCase()} ({athleteName(occupant)})
            </span>
          </button>
        ) : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// The boat

function occupantFor(a: Athlete | undefined): SeatOccupant | null {
  return a ? { id: a.id, name: athleteName(a), shortName: athleteShortName(a) } : null;
}

function StripSeat({ entry, props }: { entry: Entry; props: BoatSeatProps }) {
  const { canEdit, isPhone } = useLineup();
  const seat = props.seat.seat;
  const occupantId = props.seat.occupant?.id ?? null;
  const {
    setRef,
    listeners,
    isDragging,
    isOver,
    picker,
    settling,
    carrying,
    onKeyDown,
    onOpenChange,
    onPick,
    openSheet,
    seatId,
    describedBy,
  } = useSeatWiring(entry, seat, occupantId);
  const el = (
    <BoatSeat
      {...props}
      ref={setRef as Ref<HTMLElement>}
      {...listeners}
      data-lineup-seat={seatId}
      aria-describedby={describedBy}
      selected={!!picker}
      highlighted={isOver}
      settling={settling}
      onSeatKeyDown={(_s, e) => onKeyDown(e)}
      onSeatClick={isPhone ? openSheet : undefined}
      className={cn(
        props.className,
        'touch-manipulation select-none',
        (canEdit || isPhone) && 'hover:bg-surface-2',
        isDragging && 'opacity-40',
        carrying && 'cursor-copy',
      )}
    />
  );
  if (!canEdit || isPhone) return el;
  return (
    <SeatPicker
      entry={entry}
      seat={seat}
      occupantId={occupantId}
      picker={picker}
      onPick={onPick}
      onOpenChange={onOpenChange}
      trigger={el}
    />
  );
}

/** An entry's crew as a vertical boat: the cox on top, then stroke down to bow. */
export function EntryStrip({
  entry,
  seatConflicts,
  conflict,
}: {
  entry: Entry;
  seatConflicts: Partial<Record<Seat, Severity>>;
  conflict: Severity | null;
}) {
  const { index, team, canEdit, isPhone } = useLineup();
  const shell = entry.shellId ? index.shellById.get(entry.shellId) : null;
  const records = index.seatsByEntry.get(entry.id);
  const seats: Partial<Record<Seat, SeatOccupant | null>> = {};
  for (const [s, rec] of records ?? []) {
    seats[s] = rec.athleteId ? occupantFor(index.athleteById.get(rec.athleteId)) : null;
  }
  const interactive = canEdit || isPhone;
  return (
    <BoatStrip
      boatClass={entry.boatClass}
      seats={seats}
      seatSides={entrySeatSides(entry, shell)}
      size="md"
      orientation="vertical"
      teamColor={team.colorKey}
      conflict={conflict}
      // The card's conflict badges carry the icons; the hull keeps the color.
      showConflictIcon={false}
      seatConflicts={seatConflicts}
      label={`${entry.label}${shell ? `, ${shell.nickname || shell.name}` : ''}`}
      interactive={interactive}
      renderSeat={
        interactive
          ? (s, props) => <StripSeat key={s.seat} entry={entry} props={props} />
          : undefined
      }
    />
  );
}
