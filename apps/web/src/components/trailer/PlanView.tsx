// The plan view (PLAN.md §4.10, §16.5): one level from above, front (the truck) at the left.
// Each lane is a track as long as the shelf takes (dashed ends at its overhang limits); boats
// are hulls drawn to length along it, small boats end to end. The frame's front and rear edges
// cross every lane, so what hangs past them reads at a glance, with the overhang in meters on
// that part of the hull. The 1.2 m (4 ft) rear flag threshold is a dashed line across the tier.
// The pointed end of a hull is its bow.
//
// Below the levels, "Bed" shows the bottom of the trailer from above: the frame's outline with
// its compartments as zones along the length, each named with its length (§4.9). On SRA's
// trailers the riggers fill the back of the bed across its full width.

import { useCallback, useMemo, useState } from 'react';
import {
  REAR_FLAG_THRESHOLD_CM,
  effectiveShelvesFor,
  meters,
  type Id,
  type PackBoat,
  type Placement,
  type Rule,
  type TeamColorKey,
  type TrailerDef,
} from '@srt/domain';
import { SegmentedControl } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { tierLabel, tierWordOf } from './labels';
import { bedPlanGeometry, planViewGeometry, type PlanBoat, type PlanLane } from './plan';

/** A level of the trailer to show from above, or the bed under the racks. */
export type PlanLevel = number | 'bed';

function useWidth(fallback: number): [(el: HTMLDivElement | null) => void, number] {
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

/** A hull from above: the stern rounded, the bow pointed. */
function hullPath(x: number, y: number, w: number, h: number, bowRight: boolean): string {
  const r = Math.min(h / 2, w / 4);
  const tip = Math.min(w * 0.3, h * 1.8);
  if (bowRight) {
    return [
      `M ${x + r} ${y}`,
      `L ${x + w - tip} ${y}`,
      `Q ${x + w - tip * 0.3} ${y + h * 0.08} ${x + w} ${y + h / 2}`,
      `Q ${x + w - tip * 0.3} ${y + h * 0.92} ${x + w - tip} ${y + h}`,
      `L ${x + r} ${y + h}`,
      `A ${r} ${r} 0 0 1 ${x} ${y + h - r}`,
      `L ${x} ${y + r}`,
      `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${x + w - r} ${y}`,
    `L ${x + tip} ${y}`,
    `Q ${x + tip * 0.3} ${y + h * 0.08} ${x} ${y + h / 2}`,
    `Q ${x + tip * 0.3} ${y + h * 0.92} ${x + tip} ${y + h}`,
    `L ${x + w - r} ${y + h}`,
    `A ${r} ${r} 0 0 0 ${x + w} ${y + h - r}`,
    `L ${x + w} ${y + r}`,
    `A ${r} ${r} 0 0 0 ${x + w - r} ${y}`,
    'Z',
  ].join(' ');
}

const HULL_INSET = 5;

function Hull({
  boat,
  lane,
  teamColor,
  selected,
}: {
  boat: PlanBoat;
  lane: PlanLane;
  teamColor: TeamColorKey | null | undefined;
  selected: boolean;
}) {
  const h = lane.height - HULL_INSET * 2;
  const y = lane.y + HULL_INSET;
  // Sterns forward means the bow trails: toward the back of the trailer, the right.
  return (
    <path
      style={teamStyle(teamColor)}
      d={hullPath(boat.x, y, boat.width, h, !boat.bowForward)}
      className={cn('fill-team-tint', selected ? 'stroke-accent' : 'stroke-team')}
      strokeWidth={selected ? 2.5 : 1.5}
    />
  );
}

/** Words on one hull: overhang at each end (on the part that sticks out), name in the middle. */
function HullWords({
  boat,
  lane,
  frameX1,
  frameX2,
}: {
  boat: PlanBoat;
  lane: PlanLane;
  frameX1: number;
  frameX2: number;
}) {
  const top = lane.y + HULL_INSET;
  const height = lane.height - HULL_INSET * 2;
  const end = boat.x + boat.width;
  const midStart = Math.max(boat.x, frameX1);
  const midEnd = Math.min(end, frameX2);
  const front = boat.frontCm > 0 ? { x: boat.x, w: Math.min(end, frameX1) - boat.x } : null;
  const rear =
    boat.rearCm > 0 ? { x: Math.max(boat.x, frameX2), w: end - Math.max(boat.x, frameX2) } : null;
  const rearTone =
    boat.rearCm > lane.rearMaxCm + 1
      ? 'text-danger'
      : boat.rearCm > REAR_FLAG_THRESHOLD_CM
        ? 'text-warn'
        : 'text-ink-2';
  const label =
    'rounded-[4px] bg-surface/90 px-1 text-xs font-medium whitespace-nowrap tabular-nums';
  return (
    <>
      {front && (
        <span
          className={cn(
            'absolute flex items-center',
            front.w >= 44 ? 'justify-center' : '-translate-x-full justify-end pr-1',
          )}
          style={
            front.w >= 44
              ? { left: front.x + (boat.bowForward ? 14 : 4), top, width: front.w - 18, height }
              : { left: boat.x, top, height }
          }
        >
          <span
            className={cn(label, boat.frontCm > lane.frontMaxCm + 1 ? 'text-danger' : 'text-ink-2')}
          >
            {meters(boat.frontCm)} m
          </span>
        </span>
      )}
      {midEnd - midStart >= 56 && (
        <span
          className="absolute flex min-w-0 items-center gap-1.5 px-2"
          style={{ left: midStart, top, width: midEnd - midStart, height }}
        >
          <span className="min-w-0 truncate text-xs font-medium text-ink">{boat.name}</span>
          <span className="shrink-0 font-display text-xs font-semibold text-ink-2">{boat.cls}</span>
          {midEnd - midStart > 150 && (
            <span className="shrink-0 text-xs text-ink-2 tabular-nums">
              · {meters(boat.lengthCm)} m long
            </span>
          )}
        </span>
      )}
      {rear && (
        <span
          className={cn(
            'absolute flex items-center',
            rear.w >= 44 ? 'justify-center' : 'justify-start pl-1',
          )}
          style={
            rear.w >= 44
              ? { left: rear.x + 4, top, width: rear.w - (boat.bowForward ? 8 : 18), height }
              : { left: end, top, height }
          }
        >
          <span className={cn(label, rearTone)}>{meters(boat.rearCm)} m</span>
        </span>
      )}
    </>
  );
}

export interface PlanViewProps {
  trailer: TrailerDef;
  rules: readonly Rule[];
  placements: readonly Placement[];
  boatById: ReadonlyMap<Id, PackBoat>;
  teamColors: ReadonlyMap<Id, TeamColorKey>;
  selectedShellId: Id | null;
  onSelect: (shellId: Id) => void;
  level: PlanLevel;
  onLevelChange: (level: PlanLevel) => void;
}

export function PlanView({ level, onLevelChange, ...props }: PlanViewProps) {
  const { trailer } = props;
  const [ref, width] = useWidth(640);
  const tiers = useMemo(
    () => [...new Set(trailer.shelves.map((s) => s.tier))].sort((a, b) => b - a),
    [trailer],
  );
  const shown: PlanLevel =
    level === 'bed' ? 'bed' : tiers.includes(level) ? level : (tiers[0] ?? 'bed');
  const word = tierWordOf(trailer);
  const Word = word[0]!.toUpperCase() + word.slice(1);
  // On a narrow drawing the levels show their numbers (as the end view does); the word stays
  // for screen readers.
  const narrow = width < 480;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {narrow && (
          <span aria-hidden className="-mr-1 text-sm text-ink-2">
            {Word}
          </span>
        )}
        <SegmentedControl
          label={`${Word} to show`}
          value={String(shown)}
          onValueChange={(v) => onLevelChange(v === 'bed' ? 'bed' : Number(v))}
          size="sm"
          options={[
            ...tiers.map((t) => ({
              value: String(t),
              label: (
                <span className="whitespace-nowrap tabular-nums">
                  <span className={cn(narrow && 'sr-only')}>{Word} </span>
                  {t}
                </span>
              ),
            })),
            { value: 'bed', label: 'Bed' },
          ]}
          className="max-w-full overflow-x-auto"
        />
        <span className="text-sm text-ink-2">From above, front at the left</span>
      </div>
      <div ref={ref} className="flex w-full min-w-0 flex-col gap-3">
        {shown === 'bed' ? (
          <BedPlan trailer={trailer} width={width} />
        ) : (
          <TierPlan {...props} tier={shown} width={width} />
        )}
      </div>
    </div>
  );
}

function TierPlan({
  trailer,
  rules,
  placements,
  boatById,
  teamColors,
  selectedShellId,
  onSelect,
  tier,
  width,
}: Omit<PlanViewProps, 'level' | 'onLevelChange'> & { tier: number; width: number }) {
  const shelves = useMemo(() => effectiveShelvesFor(trailer, rules), [trailer, rules]);
  const g = useMemo(
    () => planViewGeometry({ def: trailer, shelves, placements, boats: boatById, tier, width }),
    [trailer, shelves, placements, boatById, tier, width],
  );
  const word = tierWordOf(trailer);
  const narrow = width < 480;
  const boatsHere = g.lanes.flatMap((l) => l.boats.map((b) => ({ lane: l, boat: b })));
  const bandsTop = g.frame.y1;
  const bandsBottom = g.frame.y2;

  return (
    <>
      <div className="w-full min-w-0">
        <div
          role="group"
          aria-label={`${tierLabel(trailer, tier)} from above`}
          className="relative"
          style={{ width: g.width, height: g.height }}
        >
          <svg
            aria-hidden
            width={g.width}
            height={g.height}
            viewBox={`0 0 ${g.width} ${g.height}`}
            className="absolute inset-0 overflow-visible"
          >
            {/* Each lane's track, as long as the shelf takes, dashed at its overhang limits. */}
            {g.lanes.map((lane) => (
              <g key={`${lane.shelfId}:${lane.lane}`} className={cn(!lane.active && 'opacity-50')}>
                <rect
                  x={lane.frontMaxX}
                  y={lane.y + 2}
                  width={Math.max(0, lane.rearMaxX - lane.frontMaxX)}
                  height={lane.height - 4}
                  rx={6}
                  className="fill-surface-2"
                />
                {[lane.frontMaxX, lane.rearMaxX].map((x, i) => (
                  <line
                    key={i}
                    x1={x}
                    x2={x}
                    y1={lane.y + 2}
                    y2={lane.y + lane.height - 2}
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    className="stroke-ink-2"
                  />
                ))}
              </g>
            ))}
            {/* The post between the two sides. */}
            {g.dividers.map((y) => (
              <line
                key={y}
                x1={g.frame.x1}
                x2={g.frame.x2}
                y1={y}
                y2={y}
                className="stroke-ink-2"
                strokeWidth={4}
              />
            ))}
            {boatsHere.map(({ lane, boat }) => (
              <Hull
                key={boat.shellId}
                boat={boat}
                lane={lane}
                teamColor={teamColors.get(boat.teamId)}
                selected={boat.shellId === selectedShellId}
              />
            ))}
            {/* The frame's front and rear edges, across every lane, and the hitch. */}
            {[g.frame.x1, g.frame.x2].map((x) => (
              <line
                key={x}
                x1={x}
                x2={x}
                y1={bandsTop}
                y2={bandsBottom}
                strokeWidth={2}
                className="stroke-ink"
              />
            ))}
            <line
              x1={g.frame.x1}
              x2={g.frame.x2}
              y1={bandsTop - 8}
              y2={bandsTop - 8}
              strokeWidth={1}
              className="stroke-ink-2"
            />
            {[g.frame.x1, g.frame.x2].map((x) => (
              <line
                key={`tick:${x}`}
                x1={x}
                x2={x}
                y1={bandsTop - 12}
                y2={bandsTop - 4}
                strokeWidth={1}
                className="stroke-ink-2"
              />
            ))}
            {/* More than 1.2 m (4 ft) behind needs a flag (§16.5). */}
            <line
              x1={g.flagX}
              x2={g.flagX}
              y1={bandsTop - 4}
              y2={bandsBottom + 8}
              strokeDasharray="6 4"
              strokeWidth={1.5}
              className="stroke-warn"
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 select-none">
            <span
              className="absolute -translate-x-1/2 bg-surface px-1.5 text-xs whitespace-nowrap text-ink-2"
              style={{ left: (g.frame.x1 + g.frame.x2) / 2, top: bandsTop - 16 }}
            >
              Frame {meters(trailer.frameLengthCm)} m
            </span>
            <span
              className="absolute -translate-x-full pr-1.5 text-xs text-ink-2"
              style={{ left: g.frame.x1, top: bandsTop - 17 }}
            >
              Front
            </span>
            <span
              className="absolute -translate-x-1/2 text-xs whitespace-nowrap text-warn"
              style={{ left: g.flagX, top: bandsBottom + 10 }}
            >
              {narrow ? 'Flag line' : 'Flag past 1.2 m (4 ft)'}
            </span>
            {g.lanes.map((lane) => (
              <span
                key={`${lane.shelfId}:${lane.lane}`}
                className={cn(
                  'absolute flex -translate-y-1/2 items-center pr-2 text-xs leading-tight text-ink-2',
                  !lane.active && 'opacity-60',
                )}
                style={{ left: 0, top: lane.y + lane.height / 2, width: g.gutter - 6 }}
              >
                <span className="line-clamp-2">
                  {lane.label}
                  {!lane.active && ' (not in use)'}
                </span>
              </span>
            ))}
            {boatsHere.map(({ lane, boat }) => (
              <HullWords
                key={boat.shellId}
                boat={boat}
                lane={lane}
                frameX1={g.frame.x1}
                frameX2={g.frame.x2}
              />
            ))}
          </div>

          {/* The boats as buttons, so "Why here?" works from the plan view too. */}
          {boatsHere.map(({ lane, boat }) => (
            <button
              key={boat.shellId}
              type="button"
              aria-pressed={boat.shellId === selectedShellId}
              aria-label={`${lane.label}: ${boat.name}, ${boat.cls}, ${meters(boat.lengthCm)} m${boat.frontCm > 0 ? `, ${meters(boat.frontCm)} m in front` : ''}${boat.rearCm > 0 ? `, ${meters(boat.rearCm)} m behind` : ''}, ${boat.bowForward ? 'bow forward' : 'stern forward'}`}
              onClick={() => onSelect(boat.shellId)}
              className="absolute rounded-boat"
              style={{
                left: boat.x,
                top: lane.y + HULL_INSET,
                width: boat.width,
                height: lane.height - HULL_INSET * 2,
              }}
            />
          ))}
        </div>
      </div>
      {g.lanes.every((l) => l.boats.length === 0) ? (
        <p className="text-sm text-ink-2">
          No boats on {tierLabel(trailer, tier).toLowerCase()}. Pick another {word} above.
        </p>
      ) : (
        <p className="text-sm leading-prose text-ink-2">
          The pointed end is the bow. Dashed ends mark how far each shelf lets a boat stick out.
          {g.lanes.some((l) => l.paired) && ' Boats sharing a lane ride end to end.'}
        </p>
      )}
    </>
  );
}

/** The bed from above: the frame's outline with its zones along the length. */
function BedPlan({ trailer, width }: { trailer: TrailerDef; width: number }) {
  const g = useMemo(() => bedPlanGeometry({ def: trailer, width }), [trailer, width]);
  const top = g.frame.y1;
  const edges = [...new Set(g.zones.flatMap((z) => [z.startCm, z.endCm]))].filter(
    (cm) => cm > 0 && cm < trailer.frameLengthCm - 0.5,
  );
  return (
    <>
      <div
        role="group"
        aria-label="Bed from above"
        className="relative"
        style={{ width: g.width, height: g.height }}
      >
        <svg
          aria-hidden
          width={g.width}
          height={g.height}
          viewBox={`0 0 ${g.width} ${g.height}`}
          className="absolute inset-0 overflow-visible"
        >
          {/* The frame from above: the bed. */}
          <rect
            x={g.frame.x1}
            y={g.frame.y1}
            width={Math.max(0, g.frame.x2 - g.frame.x1)}
            height={g.frame.y2 - g.frame.y1}
            rx={4}
            strokeWidth={2}
            className="fill-surface-2 stroke-ink"
          />
          {g.zones.map((z) => (
            <rect
              key={z.id}
              x={z.x}
              y={z.y}
              width={z.width}
              height={z.height}
              rx={4}
              strokeWidth={1.5}
              className="fill-surface stroke-line-strong"
            />
          ))}
          {/* The frame's length above it, with a tick where one zone gives way to the next. */}
          <line
            x1={g.frame.x1}
            x2={g.frame.x2}
            y1={top - 8}
            y2={top - 8}
            strokeWidth={1}
            className="stroke-ink-2"
          />
          {[g.frame.x1, g.frame.x2, ...edges.map(g.toX)].map((x) => (
            <line
              key={`tick:${x}`}
              x1={x}
              x2={x}
              y1={top - 12}
              y2={top - 4}
              strokeWidth={1}
              className="stroke-ink-2"
            />
          ))}
        </svg>

        <div aria-hidden className="pointer-events-none absolute inset-0 select-none">
          <span
            className="absolute -translate-x-1/2 bg-surface px-1.5 text-xs whitespace-nowrap text-ink-2"
            style={{ left: (g.frame.x1 + g.frame.x2) / 2, top: top - 16 }}
          >
            Frame {meters(trailer.frameLengthCm)} m
          </span>
          <span
            className="absolute -translate-x-full pr-1.5 text-xs text-ink-2"
            style={{ left: g.frame.x1, top: top - 17 }}
          >
            Front
          </span>
          <span
            className="absolute flex -translate-y-1/2 items-center pr-2 text-xs leading-tight text-ink-2"
            style={{ left: 0, top: (g.frame.y1 + g.frame.y2) / 2, width: g.gutter - 6 }}
          >
            Bed
          </span>
          {g.zones.map((z) => (
            <span
              key={z.id}
              className="absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden px-1.5 text-center leading-tight"
              style={{ left: z.x, top: z.y, width: z.width, height: z.height }}
            >
              <span className="max-w-full truncate text-sm font-medium text-ink">{z.label}</span>
              {z.note && (
                <span className="line-clamp-3 max-w-full text-xs break-words text-ink-2">
                  {z.note[0]!.toUpperCase() + z.note.slice(1)}
                </span>
              )}
              {z.positioned && (
                <span className="text-xs text-ink-2 tabular-nums">
                  {meters(z.endCm - z.startCm)} m
                </span>
              )}
            </span>
          ))}
        </div>
        {g.zones.length > 0 && (
          <ul className="sr-only">
            {g.zones.map((z) => (
              <li key={z.id}>
                {z.words}
                {z.note && z.positioned ? `, ${z.note}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-sm leading-prose text-ink-2">
        {g.zones.length === 0
          ? 'Nothing is set to ride in the bed yet. Admins add compartments on the trailer’s page under Trailers.'
          : g.zones.some((z) => z.shared)
            ? 'The bed from above, front to back. Zones that share a stretch of the bed sit side by side.'
            : 'The bed from above, front to back. Each zone spans the bed’s full width.'}
      </p>
    </>
  );
}
