// The trailer end view: the trailer's real cross-section seen from the back, with uprights, rack
// arms per tier, the bed (the zone at its back end, with the zones ahead of it named), and the
// boats as pills resting on the arms, sized by beam and colored by team.
//
// The frame is SVG; the chips, lane targets, and words are HTML laid over it at the same pixel
// coordinates (geometry.ts), so text truncates, chips are real buttons, and dnd-kit works on
// ordinary elements. The component knows nothing about drag and drop: the trailer page adds it
// through `renderLane` and `renderChip` (features/trailer/EndViewBoard.tsx).

import {
  Fragment,
  useCallback,
  useMemo,
  useState,
  type ComponentProps,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { CircleAlert, Lock } from 'lucide-react';
import {
  bedZones,
  effectiveShelvesFor,
  zoneWords,
  type BoatClass,
  type Id,
  type Placement,
  type Rule,
  type ShelfDef,
  type TeamColorKey,
  type TrailerDef,
} from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import {
  endViewGeometry,
  laneChips,
  rectStyle,
  type EndViewCell,
  type EndViewGeometry,
  type EndViewSize,
  type LaneGeometry,
  type Rect,
} from './geometry';
import { cellLabel, laneLabel, sideOf, tierLabel } from './labels';

/** What a chip shows about a boat. `toEndViewBoats` builds these from packer boats. */
export interface EndViewBoat {
  shellId: Id;
  /** Nickname if the shell has one: "Peggy". */
  name: string;
  cls: BoatClass;
  beamCm: number;
  teamColor?: TeamColorKey | null;
  teamName?: string;
  /** Hull length; the end view ignores it, the isometric view draws it (class default if unset). */
  lengthCm?: number;
}

/** A placement as the end view needs it; a full packer `Placement` works. */
export type EndViewPlacement = Pick<Placement, 'shellId' | 'shelfId' | 'lane'> &
  Partial<Pick<Placement, 'offsetCm' | 'locked'>>;

/** A lane cell, handed to `renderLane` and `laneActionLabel`. */
export interface EndViewLane extends LaneGeometry {
  shelf: ShelfDef;
  /** False on a shelf that is off (its own setting or a "Don't use" rule). */
  active: boolean;
  laneCount: number;
  /** "Level 5, wide side, outer lane". */
  label: string;
  /** Boats in the lane, front of the trailer first. */
  shellIds: Id[];
  highlighted: boolean;
  /** Why a drop here is refused, when this is the `invalidCell`. */
  invalidReason: string | null;
}

/** A placed boat, handed to `renderChip`. */
export interface EndViewChip {
  shellId: Id;
  boat: EndViewBoat | null;
  placement: EndViewPlacement;
  lane: EndViewLane;
  rect: Rect;
  /** "Level 5, wide side, outer lane: Peggy, 8+". */
  label: string;
  selected: boolean;
  locked: boolean;
  /** Why this placement is flagged (it breaks a rule), if it is. */
  flag: string | null;
}

export interface TrailerEndViewProps {
  trailer: TrailerDef;
  /** Effective rules: lane counts ("fits 3 fours") and shelves turned off. */
  rules?: readonly Rule[];
  placements?: readonly EndViewPlacement[];
  boats?: readonly EndViewBoat[];
  /** 'thumb' is a small static drawing for lists. */
  size?: EndViewSize;
  /** Fixed width in px; otherwise the drawing fills its container. */
  width?: number;
  /** Accessible name; defaults to "<trailer name>, end view". */
  label?: string;
  selectedShellId?: Id | null;
  /** A cell to show as the drop target. */
  highlightCell?: EndViewCell | null;
  /** A cell that refuses the boat, with the reason (shown under the drawing and announced). */
  invalidCell?: (EndViewCell & { reason: string }) | null;
  /** Placements that break a rule, by shell id, with the reason. */
  flagged?: Readonly<Record<Id, string>>;
  onChipClick?: (shellId: Id, event: MouseEvent<HTMLElement>) => void;
  /** Makes each lane a button: the click and keyboard equivalent of dropping a boat there. */
  onLaneClick?: (cell: EndViewCell, event: MouseEvent<HTMLElement>) => void;
  /** Accessible name of a lane button; defaults to the lane's label. */
  laneActionLabel?: (lane: EndViewLane) => string;
  /** Extra overlay per lane (a dnd-kit droppable), absolutely positioned by `lane.rect`. */
  renderLane?: (lane: EndViewLane) => ReactNode;
  /** Replace a chip (wrap it in a draggable); render `<TrailerChip {...props} />` inside. */
  renderChip?: (chip: EndViewChip, props: TrailerChipProps) => ReactNode;
  /** Chips glide to new cells after a pack (--motion-pack; off with reduced motion). */
  animateMoves?: boolean;
  className?: string;
}

/** Stable key for a lane cell: "<shelfId>:<lane>". */
export function laneKey(cell: EndViewCell): string {
  return `${cell.shelfId}:${cell.lane}`;
}

function sameCell(a: EndViewCell | null | undefined, b: EndViewCell): boolean {
  return !!a && a.shelfId === b.shelfId && a.lane === b.lane;
}

/** "Peggy, 8+". */
function boatWords(boat: EndViewBoat | null): string {
  return boat ? `${boat.name}, ${boat.cls}` : 'a boat not on the load list';
}

/** Measures the container's width; `fallback` until it is known (and in tests). */
function useContainerWidth(fallback: number): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      setWidth(w > 0 ? w : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width ?? fallback];
}

// ---------------------------------------------------------------------------
// Chip

export interface TrailerChipProps extends Omit<ComponentProps<'button'>, 'children' | 'ref'> {
  boat: EndViewBoat | null;
  /** Accessible name: "Level 5, wide side, outer lane: Peggy, 8+". */
  label: string;
  rect: Rect;
  selected?: boolean;
  locked?: boolean;
  flag?: string | null;
  /** A button (clickable, focusable) or a static picture. */
  interactive?: boolean;
  animate?: boolean;
  ref?: Ref<HTMLElement>;
}

/** A boat on the trailer: a pill with the nickname and class, in the team's color. */
export function TrailerChip({
  boat,
  label,
  rect,
  selected = false,
  locked = false,
  flag = null,
  interactive = false,
  animate = false,
  className,
  style,
  ref,
  ...rest
}: TrailerChipProps) {
  const roomy = rect.width >= 96;
  const fullLabel = [label, locked ? 'locked' : null, flag ? `breaks a rule: ${flag}` : null]
    .filter(Boolean)
    .join(', ');
  const classes = cn(
    'absolute flex min-w-0 items-center gap-1 rounded-boat border-[1.5px] bg-team-tint text-left text-ink',
    roomy ? 'px-2' : 'gap-0.5 px-1.5',
    flag ? 'border-dashed border-danger' : 'border-team',
    selected && 'z-10 border-accent ring-2 ring-accent',
    interactive &&
      'cursor-pointer hover:bg-surface-2 before:absolute before:inset-x-0 before:-top-2 before:-bottom-1 before:content-[""] pointer-coarse:before:-top-3.5',
    animate &&
      'transition-[left,top,width] duration-[var(--motion-pack)] ease-out motion-reduce:transition-none',
    className,
  );
  const content = (
    <>
      {flag && <CircleAlert aria-hidden className="size-3.5 shrink-0 text-danger" />}
      <span className={cn('min-w-0 flex-1 truncate font-medium', roomy ? 'text-sm' : 'text-xs')}>
        {boat?.name ?? 'Unknown'}
      </span>
      {locked && roomy && <Lock aria-hidden className="size-3 shrink-0 text-ink-2" />}
      <span className="shrink-0 font-display text-xs font-semibold text-ink-2 tabular-nums">
        {boat?.cls ?? '?'}
      </span>
    </>
  );
  const position: CSSProperties = {
    ...teamStyle(boat?.teamColor),
    ...rectStyle(rect),
    ...style,
  };
  if (!interactive) {
    return (
      <div
        ref={ref as Ref<HTMLDivElement>}
        aria-hidden
        title={fullLabel}
        data-shell={boat?.shellId}
        className={classes}
        style={position}
      >
        {content}
      </div>
    );
  }
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      aria-label={fullLabel}
      aria-pressed={selected}
      title={fullLabel}
      data-shell={boat?.shellId}
      className={classes}
      style={position}
      {...rest}
    >
      {content}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Drawing

function Frame({ g }: { g: EndViewGeometry }) {
  const thumb = g.size === 'thumb';
  return (
    <>
      {/* Ground and wheels, behind the bed. */}
      {!thumb && (
        <line
          x1={g.frame.x1 - 12}
          x2={g.frame.x2 + 12}
          y1={g.groundY}
          y2={g.groundY}
          className="stroke-line-strong"
          strokeWidth={1}
        />
      )}
      {g.wheels.map((w, i) => (
        <g key={i}>
          <circle
            cx={w.cx}
            cy={w.cy}
            r={w.r}
            className="fill-surface-2 stroke-ink-2"
            strokeWidth={thumb ? 1 : 2.5}
          />
          {!thumb && <circle cx={w.cx} cy={w.cy} r={w.r * 0.38} className="fill-ink-2" />}
        </g>
      ))}
      {/* The bed, with its compartments. */}
      <rect
        x={g.bed.x}
        y={g.bed.y}
        width={g.bed.width}
        height={g.bed.height}
        rx={thumb ? 1.5 : 5}
        className="fill-surface-2 stroke-line-strong"
        strokeWidth={thumb ? 1 : 1.5}
      />
      {!thumb &&
        g.compartments.map((c) => (
          <rect
            key={c.id}
            x={c.rect.x}
            y={c.rect.y}
            width={c.rect.width}
            height={c.rect.height}
            rx={3}
            className="fill-surface stroke-line"
            strokeWidth={1}
          />
        ))}
      {/* Uprights, and the goalpost's top bar. */}
      {g.posts.length === 2 && (
        <line
          x1={g.posts[0]!.x}
          x2={g.posts[1]!.x + g.posts[1]!.width}
          y1={g.posts[0]!.y + (thumb ? 0.75 : 2)}
          y2={g.posts[0]!.y + (thumb ? 0.75 : 2)}
          className="stroke-ink-2"
          strokeWidth={thumb ? 1.5 : 4}
        />
      )}
      {g.posts.map((p, i) => (
        <rect
          key={i}
          x={p.x}
          y={p.y}
          width={p.width}
          height={p.height}
          rx={thumb ? 0.5 : 1.5}
          className="fill-ink-2"
        />
      ))}
      {/* Rack arms; a dashed arm is a shelf that is not in use. */}
      {g.shelves.map((s) => (
        <g key={s.shelf.id} className={cn(!s.active && 'opacity-60')}>
          <line
            x1={s.arm.x1}
            x2={s.arm.x2}
            y1={s.arm.y}
            y2={s.arm.y}
            strokeWidth={s.arm.thickness}
            strokeDasharray={s.active ? undefined : thumb ? '2 1.5' : '7 5'}
            className={s.active ? 'stroke-ink-2' : 'stroke-line-strong'}
          />
          {!thumb && s.stopX !== null && (
            <rect
              x={s.stopX - 1.5}
              y={s.arm.y - s.arm.thickness / 2 - 9}
              width={3}
              height={9}
              rx={1}
              className={s.active ? 'fill-ink-2' : 'fill-line-strong'}
            />
          )}
        </g>
      ))}
    </>
  );
}

function LaneBackdrops({
  lanes,
  size,
  occupied,
}: {
  lanes: EndViewLane[];
  size: EndViewSize;
  occupied: Set<string>;
}) {
  if (size === 'thumb') return null;
  return (
    <>
      {lanes.map((lane) => {
        const key = laneKey(lane);
        if (lane.invalidReason !== null || lane.highlighted) {
          return (
            <rect
              key={key}
              x={lane.rect.x + 1}
              y={lane.rect.y}
              width={Math.max(0, lane.rect.width - 2)}
              height={lane.rect.height}
              rx={6}
              strokeWidth={2}
              className={
                lane.invalidReason !== null
                  ? 'fill-danger-tint stroke-danger'
                  : 'fill-accent-tint stroke-accent'
              }
            />
          );
        }
        if (occupied.has(key) || !lane.active) return null;
        return (
          <rect
            key={key}
            x={lane.slot.x}
            y={lane.slot.y}
            width={lane.slot.width}
            height={lane.slot.height}
            rx={6}
            fill="none"
            strokeWidth={1}
            strokeDasharray="4 3"
            className="stroke-line-strong"
          />
        );
      })}
    </>
  );
}

function ThumbChips({ chips, lanes }: { chips: EndViewChip[]; lanes: EndViewLane[] }) {
  const occupied = new Set(chips.map((c) => laneKey(c.lane)));
  return (
    <>
      {lanes
        .filter((l) => l.active && !occupied.has(laneKey(l)))
        .map((l) => (
          <rect
            key={laneKey(l)}
            x={l.slot.x}
            y={l.slot.y}
            width={l.slot.width}
            height={l.slot.height}
            rx={l.slot.height / 2}
            className="fill-line"
          />
        ))}
      {chips.map((c) => (
        <rect
          key={c.shellId}
          x={c.rect.x}
          y={c.rect.y}
          width={c.rect.width}
          height={c.rect.height}
          rx={c.rect.height / 2}
          style={teamStyle(c.boat?.teamColor)}
          className="fill-team"
        />
      ))}
    </>
  );
}

/** The description screen readers get: every lane with its boats, then the bed. */
function DescriptionTable({
  caption,
  trailer,
  lanes,
  chipsByLane,
  compartments,
}: {
  caption: string;
  trailer: TrailerDef;
  lanes: EndViewLane[];
  chipsByLane: Map<string, EndViewChip[]>;
  compartments: string[];
}) {
  return (
    // A table sizes itself to its text whatever its width, so the clipped box is a div around it
    // (else the long bed row widens the page on a phone).
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Level</th>
            <th scope="col">Side</th>
            <th scope="col">Lane</th>
            <th scope="col">Boats</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane) => {
            const chips = chipsByLane.get(laneKey(lane)) ?? [];
            const boats =
              chips.length === 0
                ? lane.active
                  ? 'Empty'
                  : 'Not in use'
                : chips.map((c) => boatWords(c.boat)).join('; ') +
                  (lane.active ? '' : ' (shelf not in use)');
            return (
              <tr key={laneKey(lane)}>
                <th scope="row">{tierLabel(trailer, lane.shelf.tier)}</th>
                <td>{sideOf(trailer, lane.shelf) ?? 'Full width'}</td>
                <td>{laneLabel(lane.lane, lane.laneCount) ?? 'One lane'}</td>
                <td>{boats}</td>
              </tr>
            );
          })}
          {compartments.length > 0 && (
            <tr>
              <th scope="row">Bed</th>
              <td colSpan={3}>Front to back: {compartments.join('; ')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const NO_PLACEMENTS: readonly EndViewPlacement[] = [];
const NO_BOATS: readonly EndViewBoat[] = [];
const NO_RULES: readonly Rule[] = [];
const THUMB_WIDTH = 112;
const FALLBACK_WIDTH = 560;

export function TrailerEndView({
  trailer,
  rules,
  placements = NO_PLACEMENTS,
  boats = NO_BOATS,
  size = 'full',
  width: fixedWidth,
  label,
  selectedShellId = null,
  highlightCell = null,
  invalidCell = null,
  flagged,
  onChipClick,
  onLaneClick,
  laneActionLabel,
  renderLane,
  renderChip,
  animateMoves = false,
  className,
}: TrailerEndViewProps) {
  const [measureRef, measured] = useContainerWidth(FALLBACK_WIDTH);
  const width = fixedWidth ?? (size === 'thumb' ? THUMB_WIDTH : measured);
  const effective = useMemo(
    () => effectiveShelvesFor(trailer, rules ?? NO_RULES),
    [trailer, rules],
  );
  const g = useMemo(
    () => endViewGeometry({ trailer, shelves: effective, placements, width, size }),
    [trailer, effective, placements, width, size],
  );
  const boatById = useMemo(() => new Map(boats.map((b) => [b.shellId, b])), [boats]);

  const { lanes, chips, chipsByLane } = useMemo(() => {
    const lanes: EndViewLane[] = [];
    const laneByKey = new Map<string, EndViewLane>();
    const placedByLane = new Map<string, EndViewPlacement[]>();
    for (const p of placements) {
      const k = laneKey(p);
      placedByLane.set(k, [...(placedByLane.get(k) ?? []), p]);
    }
    for (const s of g.shelves) {
      for (const lg of s.lanes) {
        const k = laneKey(lg);
        const here = (placedByLane.get(k) ?? [])
          .slice()
          .sort((a, b) => (a.offsetCm ?? 0) - (b.offsetCm ?? 0));
        const lane: EndViewLane = {
          ...lg,
          shelf: s.shelf,
          active: s.active,
          laneCount: s.laneCount,
          label: cellLabel(trailer, s.shelf, lg.lane, s.laneCount),
          shellIds: here.map((p) => p.shellId),
          highlighted: sameCell(highlightCell, lg),
          invalidReason: sameCell(invalidCell, lg) ? invalidCell!.reason : null,
        };
        lanes.push(lane);
        laneByKey.set(k, lane);
      }
    }
    const chips: EndViewChip[] = [];
    const chipsByLane = new Map<string, EndViewChip[]>();
    for (const lane of lanes) {
      const here = (placedByLane.get(laneKey(lane)) ?? [])
        .slice()
        .sort((a, b) => (a.offsetCm ?? 0) - (b.offsetCm ?? 0));
      const rects = laneChips(
        lane,
        here.map((p) => ({ shellId: p.shellId, beamCm: boatById.get(p.shellId)?.beamCm ?? 52 })),
        g,
      );
      const list = here.map((p, i): EndViewChip => {
        const boat = boatById.get(p.shellId) ?? null;
        return {
          shellId: p.shellId,
          boat,
          placement: p,
          lane,
          rect: rects[i]!.rect,
          label: `${lane.label}: ${boatWords(boat)}`,
          selected: selectedShellId === p.shellId,
          locked: !!p.locked,
          flag: flagged?.[p.shellId] ?? null,
        };
      });
      chips.push(...list);
      chipsByLane.set(laneKey(lane), list);
    }
    return { lanes, chips, chipsByLane };
  }, [g, placements, boatById, trailer, highlightCell, invalidCell, selectedShellId, flagged]);

  const name = label ?? `${trailer.name || 'Trailer'}, end view`;
  const occupied = new Set(chips.map((c) => laneKey(c.lane)));

  if (size === 'thumb') {
    const placed = chips.length;
    return (
      <svg
        role="img"
        aria-label={`${name}: ${g.tiers.length} ${g.tiers.length === 1 ? 'level' : 'levels'}, ${lanes.length} ${lanes.length === 1 ? 'lane' : 'lanes'}${placed ? `, ${placed} ${placed === 1 ? 'boat' : 'boats'}` : ''}`}
        width={g.width}
        height={g.height}
        viewBox={`0 0 ${g.width} ${g.height}`}
        className={cn('shrink-0', className)}
      >
        <Frame g={g} />
        <ThumbChips chips={chips} lanes={lanes} />
      </svg>
    );
  }

  const interactiveChips = !!onChipClick || !!renderChip;
  return (
    <div
      ref={fixedWidth ? undefined : measureRef}
      className={cn('flex w-full min-w-0 flex-col gap-2', className)}
    >
      <div
        role="group"
        aria-label={name}
        className="relative shrink-0"
        style={{ width: g.width, height: g.height }}
      >
        <svg
          aria-hidden
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${g.width} ${g.height}`}
          className="absolute inset-0 overflow-visible"
        >
          <LaneBackdrops lanes={lanes} size={size} occupied={occupied} />
          <Frame g={g} />
        </svg>

        {/* Words: tier labels, compartment labels, captions. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
          {g.tierHeading && g.tiers[0] && (
            <span
              className="absolute left-0 text-xs leading-none text-ink-2"
              style={{ top: g.tiers[0].top + 3 }}
            >
              {g.tierHeading}
            </span>
          )}
          {g.tiers.map((t) => (
            <span
              key={t.tier}
              className={cn(
                'absolute left-0 -translate-y-1/2 pr-2.5 text-right whitespace-nowrap text-ink-2',
                g.tierHeading ? 'font-display text-base font-semibold tabular-nums' : 'text-sm',
              )}
              style={{ top: t.labelY, width: g.gutter }}
            >
              {t.shortLabel}
            </span>
          ))}
          {g.shelves
            .filter((s) => !s.active)
            .map((s) => (
              <span
                key={s.shelf.id}
                className="absolute flex items-end justify-center pb-2 text-xs text-ink-2"
                style={rectStyle(s.rect)}
              >
                Not in use
              </span>
            ))}
          {lanes
            .filter((l) => l.loadOrder !== null && l.showLoadOrder)
            .map((l) => (
              <span
                key={laneKey(l)}
                className="absolute truncate text-center text-xs leading-none text-ink-2"
                style={{ left: l.rect.x, top: l.rect.y + 1, width: l.rect.width }}
              >
                Loads {ordinal(l.loadOrder!)}
              </span>
            ))}
          {g.compartments.map((c) => (
            <span
              key={c.id}
              className={cn(
                'absolute flex justify-center overflow-hidden px-1.5 text-center text-xs leading-tight',
                g.bedCaption ? 'items-end font-medium text-ink' : 'items-center text-ink-2',
              )}
              style={rectStyle(c.labelRect)}
            >
              <span className={g.bedCaption ? 'truncate' : 'line-clamp-2'}>{c.label}</span>
            </span>
          ))}
          {g.bedCaption && (
            <span
              className="absolute flex items-start justify-center overflow-hidden px-1.5 text-center text-xs leading-tight text-ink-2"
              style={rectStyle(g.bedCaption.rect)}
            >
              <span className="truncate">{g.bedCaption.text}</span>
            </span>
          )}
          {g.captions.map((c) => (
            <span
              key={c.text}
              className={cn(
                'absolute text-xs whitespace-nowrap text-ink-2',
                c.align === 'middle' && '-translate-x-1/2',
                c.align === 'end' && '-translate-x-full',
              )}
              style={{ left: c.x, top: g.captionY - 12 }}
            >
              {c.text}
            </span>
          ))}
          {lanes
            .filter((l) => l.invalidReason !== null)
            .map((l) => (
              <CircleAlert
                key={laneKey(l)}
                className="absolute size-4 text-danger"
                style={{ left: l.rect.x + l.rect.width - 20, top: l.rect.y + 4 }}
              />
            ))}
        </div>

        {/* Lanes (click targets and caller overlays), each followed by its boats. */}
        {lanes.map((lane) => (
          <LaneLayer
            key={laneKey(lane)}
            lane={lane}
            chips={chipsByLane.get(laneKey(lane)) ?? []}
            onLaneClick={onLaneClick}
            laneActionLabel={laneActionLabel}
            renderLane={renderLane}
            renderChip={renderChip}
            onChipClick={onChipClick}
            interactiveChips={interactiveChips}
            animate={animateMoves}
          />
        ))}

        <DescriptionTable
          caption={name}
          trailer={trailer}
          lanes={lanes}
          chipsByLane={chipsByLane}
          compartments={bedZones(trailer).map((z) => zoneWords(z, trailer.frameLengthCm))}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        className="empty:hidden flex items-start gap-1.5 text-sm text-danger"
      >
        {invalidCell ? (
          <>
            <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
            <span>{invalidCell.reason}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

function LaneLayer({
  lane,
  chips,
  onLaneClick,
  laneActionLabel,
  renderLane,
  renderChip,
  onChipClick,
  interactiveChips,
  animate,
}: {
  lane: EndViewLane;
  chips: EndViewChip[];
  onLaneClick: TrailerEndViewProps['onLaneClick'];
  laneActionLabel: TrailerEndViewProps['laneActionLabel'];
  renderLane: TrailerEndViewProps['renderLane'];
  renderChip: TrailerEndViewProps['renderChip'];
  onChipClick: TrailerEndViewProps['onChipClick'];
  interactiveChips: boolean;
  animate: boolean;
}) {
  return (
    <>
      {onLaneClick && (
        <button
          type="button"
          aria-label={laneActionLabel ? laneActionLabel(lane) : lane.label}
          onClick={(e) => onLaneClick({ shelfId: lane.shelfId, lane: lane.lane }, e)}
          className="absolute rounded-control hover:bg-surface-2/60"
          style={rectStyle(lane.rect)}
        />
      )}
      {renderLane?.(lane)}
      {chips.map((chip) => {
        const props: TrailerChipProps = {
          boat: chip.boat,
          label: chip.label,
          rect: chip.rect,
          selected: chip.selected,
          locked: chip.locked,
          flag: chip.flag,
          interactive: interactiveChips,
          animate,
          onClick: onChipClick ? (e) => onChipClick(chip.shellId, e) : undefined,
        };
        return renderChip ? (
          <Fragment key={chip.shellId}>{renderChip(chip, props)}</Fragment>
        ) : (
          <TrailerChip key={chip.shellId} {...props} />
        );
      })}
    </>
  );
}
