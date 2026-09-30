// The end view on the trailer page (PLAN.md §4.10, §5.4): the shared TrailerEndView with boats
// that drag between lanes (dnd-kit, desktop and tablet), and the click and keyboard
// equivalent: select a boat, then activate a lane. Drop feedback comes from the page, which
// runs `dropBoat` for the lane under the pointer (or the focused lane button).

import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { MouseEvent } from 'react';
import type { Id, Rule, TrailerDef } from '@srt/domain';
import {
  TrailerChip,
  TrailerEndView,
  laneKey,
  rectStyle,
  type EndViewBoat,
  type EndViewChip,
  type EndViewLane,
  type EndViewPlacement,
  type TrailerChipProps,
} from '@/components/trailer';
import type { EndViewCell } from '@/components/trailer/geometry';
import { cn } from '@/lib/cn';

export interface LaneChoice {
  ok: boolean;
  reason: string | null;
}

function DraggableChip({
  chip,
  props,
  dragEnabled,
  settle,
}: {
  chip: EndViewChip;
  props: TrailerChipProps;
  dragEnabled: boolean;
  settle: boolean;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `chip:${chip.shellId}`,
    data: { shellId: chip.shellId, from: 'trailer' },
    disabled: !dragEnabled,
  });
  return (
    <TrailerChip
      {...props}
      {...(dragEnabled ? listeners : {})}
      ref={setNodeRef}
      data-flip={chip.shellId}
      data-flip-target={chip.shellId}
      aria-roledescription={dragEnabled ? 'draggable boat' : undefined}
      className={cn(
        dragEnabled && 'cursor-grab touch-none active:cursor-grabbing',
        isDragging && 'opacity-40',
        settle && 'animate-settle',
      )}
    />
  );
}

function LaneTarget({
  lane,
  dropEnabled,
  moving,
  choice,
  onActivate,
  onPreview,
}: {
  lane: EndViewLane;
  dropEnabled: boolean;
  /** The boat being moved by click or keyboard, if any. */
  moving: { name: string } | null;
  choice: LaneChoice | undefined;
  onActivate: (cell: EndViewCell, event: MouseEvent<HTMLElement>) => void;
  onPreview: (cell: EndViewCell | null) => void;
}) {
  const cell = { shelfId: lane.shelfId, lane: lane.lane };
  const { setNodeRef } = useDroppable({
    id: `lane:${laneKey(lane)}`,
    data: { type: 'lane', cell },
    disabled: !dropEnabled,
  });
  if (!moving) {
    return (
      <div
        ref={setNodeRef}
        aria-hidden
        className="pointer-events-none absolute"
        style={rectStyle(lane.rect)}
      />
    );
  }
  const refused = choice && !choice.ok ? `. ${choice.reason ?? 'Not allowed here'}` : '';
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={`Move ${moving.name} to ${lane.label}${refused}`}
      onClick={(e) => onActivate(cell, e)}
      onMouseEnter={() => onPreview(cell)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(cell)}
      onBlur={() => onPreview(null)}
      className={cn(
        'absolute rounded-control',
        choice?.ok === false ? 'cursor-not-allowed' : 'hover:bg-accent-tint/60',
      )}
      style={rectStyle(lane.rect)}
    />
  );
}

export function EndViewBoard({
  trailer,
  rules,
  placements,
  boats,
  selectedShellId,
  movingName,
  laneChoices,
  highlightCell,
  invalidCell,
  flagged,
  dragEnabled,
  dropEnabled,
  settleShellId,
  width,
  onChipClick,
  onLaneActivate,
  onPreview,
}: {
  trailer: TrailerDef;
  rules: readonly Rule[];
  placements: readonly EndViewPlacement[];
  boats: readonly EndViewBoat[];
  selectedShellId: Id | null;
  /** The selected boat's name while lanes are offered to move it (click or keyboard). */
  movingName: string | null;
  /** Whether each lane takes the selected boat, by `laneKey`. */
  laneChoices: ReadonlyMap<string, LaneChoice>;
  highlightCell: EndViewCell | null;
  invalidCell: (EndViewCell & { reason: string }) | null;
  flagged: Readonly<Record<Id, string>>;
  dragEnabled: boolean;
  dropEnabled: boolean;
  /** The boat just dropped: it settles into place (120 ms). */
  settleShellId: Id | null;
  width?: number;
  onChipClick: (shellId: Id) => void;
  onLaneActivate: (cell: EndViewCell, event: MouseEvent<HTMLElement>) => void;
  onPreview: (cell: EndViewCell | null) => void;
}) {
  const moving = movingName ? { name: movingName } : null;
  return (
    <TrailerEndView
      trailer={trailer}
      rules={rules}
      placements={placements}
      boats={boats}
      width={width}
      label={`${trailer.name}, end view, seen from the back`}
      selectedShellId={selectedShellId}
      highlightCell={highlightCell}
      invalidCell={invalidCell}
      flagged={flagged}
      onChipClick={(id) => onChipClick(id)}
      renderLane={(lane) => (
        <LaneTarget
          key={`target:${laneKey(lane)}`}
          lane={lane}
          dropEnabled={dropEnabled}
          moving={moving}
          choice={laneChoices.get(laneKey(lane))}
          onActivate={onLaneActivate}
          onPreview={onPreview}
        />
      )}
      renderChip={(chip, props) => (
        <DraggableChip
          chip={chip}
          props={props}
          dragEnabled={dragEnabled}
          settle={settleShellId === chip.shellId}
        />
      )}
    />
  );
}
