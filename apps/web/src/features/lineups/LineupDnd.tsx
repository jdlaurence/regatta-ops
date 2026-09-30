// Drag and drop for the builder (dnd-kit). Mouse drags start after 5 px so a click still opens
// the seat picker; touch drags (tablets) start after a 200 ms press so the page still scrolls.
// Keyboard users get the same moves through the seat keys (Seats.tsx), not dnd-kit's keyboard
// sensor. Drops are optimistic: the overlay vanishes and the seat settles in place.

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { athleteName, type Id } from '@srt/domain';
import { teamStyle } from '@/lib/team-colors';
import { useLineup } from './context';
import { entryName, type SeatRef } from './lib';
import type { RosterDragData } from './RosterPanel';
import { AthleteBadges, type SeatDragData, type SeatDropData } from './Seats';
import { useLineupUi } from './store';

type DragData = RosterDragData | SeatDragData;
type DropData = SeatDropData | { kind: 'roster' };

export function LineupDnd({ children }: { children: ReactNode }) {
  const { actions, index, canEdit, isPhone, team } = useLineup();
  const enabled = canEdit && !isPhone;
  const mouse = useSensor(MouseSensor, { activationConstraint: { distance: 5 } });
  const touch = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } });
  const sensors = useSensors(...(enabled ? [mouse, touch] : []));
  const [active, setActive] = useState<{ athleteId: Id; from: SeatRef | null } | null>(null);

  const nameOf = (id: Id | undefined) => {
    const a = id ? index.athleteById.get(id) : undefined;
    return a ? athleteName(a) : 'the athlete';
  };
  const seatText = (d: SeatDropData) => {
    const entry = index.entryById.get(d.entryId);
    const where = entry ? entryName(index, entry) : 'an entry';
    return d.seat === 'cox' ? `the cox seat of ${where}` : `seat ${d.seat} of ${where}`;
  };
  const describeOver = (over: DropData | undefined) =>
    !over ? 'no seat' : over.kind === 'roster' ? 'the roster' : seatText(over);
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${nameOf((a.data.current as DragData).athleteId)}.`,
    onDragOver: ({ over }) => `Over ${describeOver(over?.data.current as DropData | undefined)}.`,
    onDragEnd: ({ over }) =>
      over
        ? `Dropped on ${describeOver(over.data.current as DropData)}.`
        : 'Dropped. Nothing changed.',
    onDragCancel: () => 'Drag cancelled. Nothing changed.',
  };

  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
    useLineupUi.getState().carry(null);
    setActive({
      athleteId: d.athleteId,
      from: d.kind === 'seat' ? { entryId: d.entryId, seat: d.seat } : null,
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const d = e.active.data.current as DragData | undefined;
    const over = e.over?.data.current as DropData | undefined;
    setActive(null);
    if (!d || !over) return;
    const from = d.kind === 'seat' ? { entryId: d.entryId, seat: d.seat } : null;
    if (over.kind === 'seat') {
      actions.place({ entryId: over.entryId, seat: over.seat }, d.athleteId, from);
    } else if (over.kind === 'roster' && from) {
      actions.clear(from);
    }
  };

  const a = active ? index.athleteById.get(active.athleteId) : null;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{ announcements }}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {a ? (
          <div
            style={teamStyle(team.colorKey)}
            className="inline-flex h-9 w-max cursor-grabbing items-center gap-2 rounded-control border border-l-[3px] border-line border-l-team bg-surface px-3 text-base font-medium whitespace-nowrap shadow-popover"
          >
            {athleteName(a)}
            <AthleteBadges athlete={a} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
