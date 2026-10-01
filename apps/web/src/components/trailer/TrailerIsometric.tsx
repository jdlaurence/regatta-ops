// The isometric trailer view: a three-quarter picture of the whole trailer, front to the upper
// right, with the rack levels, the uprights, and every boat as a hull in its team's color at its
// place along the trailer, so what sticks out past the frame at either end is plain to see, and
// the bed's compartments as zones along the length. Read-only; the end view stays the view for
// moving boats. Takes the same inputs as TrailerEndView. Screen readers get a summary instead of
// the drawing.

import { useCallback, useMemo, useState } from 'react';
import { effectiveShelvesFor, type Id, type Rule, type TrailerDef } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import {
  bedSummary,
  hullOverhang,
  isometricGeometry,
  overhangSummary,
  overhangWords,
  points,
  type IsoGeometry,
  type IsoHull,
  type IsoZone,
} from './isometric';
import { tierLabel } from './labels';
import type { EndViewBoat, EndViewPlacement } from './TrailerEndView';

export interface TrailerIsometricProps {
  trailer: TrailerDef;
  /** Effective rules: shelves turned off and lane counts, as in the end view. */
  rules?: readonly Rule[];
  /** Placements with `offsetCm` (from the front of the frame; negative sticks out in front). */
  placements?: readonly EndViewPlacement[];
  /** The end view's boats; `lengthCm` sets each hull's length (class default when unset). */
  boats?: readonly EndViewBoat[];
  /** Fixed width in px; otherwise the drawing fills its container. */
  width?: number;
  /** Accessible name; defaults to "<trailer name>, isometric view". */
  label?: string;
  /** Outlined, to follow a boat selected in the end view. */
  selectedShellId?: Id | null;
  className?: string;
}

const NO_PLACEMENTS: readonly EndViewPlacement[] = [];
const NO_BOATS: readonly EndViewBoat[] = [];
const NO_RULES: readonly Rule[] = [];
const FALLBACK_WIDTH = 640;
/** A hull this thick on screen (px) or more carries its name. */
const LABEL_MIN_THICKNESS = 10;

function useContainerWidth(fallback: number): [(el: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState<number | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
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

/** Rough width of a 12 px label, to decide whether a name fits on its hull. */
function labelWidth(text: string): number {
  return text.length * 6.6 + 10;
}

function Hull({
  hull,
  selected,
  strokeWidth,
}: {
  hull: IsoHull;
  selected: boolean;
  strokeWidth: number;
}) {
  const name = hull.boat?.name ?? 'Unknown';
  return (
    <g style={teamStyle(hull.boat?.teamColor)} data-shell={hull.shellId}>
      <title>{hull.boat ? `${name}, ${hull.boat.cls}` : 'A boat not on the load list'}</title>
      <polygon points={points(hull.keel)} className="fill-team opacity-70" />
      <polygon
        points={points(hull.top)}
        strokeWidth={selected ? strokeWidth * 1.8 : strokeWidth}
        strokeLinejoin="round"
        className={cn('fill-team-tint', selected ? 'stroke-accent' : 'stroke-team')}
      />
    </g>
  );
}

/** Names, painted after every hull so a nearer hull never covers one. */
function HullLabel({ hull }: { hull: IsoHull }) {
  const name = hull.boat?.name ?? 'Unknown';
  const { at, angle, thickness, room } = hull.label;
  if (thickness < LABEL_MIN_THICKNESS || room < labelWidth(name)) return null;
  return (
    <text
      x={at.x}
      y={at.y}
      transform={`rotate(${angle.toFixed(2)} ${at.x.toFixed(1)} ${at.y.toFixed(1)})`}
      textAnchor="middle"
      dominantBaseline="central"
      className="pointer-events-none fill-ink text-xs font-medium"
    >
      {name}
    </text>
  );
}

/** A zone's name under the frame's near side, when the stretch clear of the wheels holds it. */
const NARROW_CHARS = new Set("fijlrtI.,:;!|' ");
const WIDE_CHARS = new Set('mwMW');

/**
 * About how wide a name is at 12 px, in px: narrow letters (i, l, t…) take about half a wide
 * one. Close enough to decide whether a name fits its zone without measuring the DOM.
 */
export function textWidth12(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += NARROW_CHARS.has(ch)
      ? 3.4
      : WIDE_CHARS.has(ch)
        ? 9.4
        : ch === ch.toUpperCase()
          ? 7.6
          : 6.2;
  }
  return w;
}

/** A name on the bed's wall needs little margin: the wall's edges already frame it. */
function wallLabelWidth(text: string): number {
  return textWidth12(text) + 4;
}

function ZoneName({ zone }: { zone: IsoZone }) {
  if (!zone.name || zone.name.room < wallLabelWidth(zone.label)) return null;
  const { at, angle } = zone.name;
  return (
    <text
      x={at.x}
      y={at.y}
      transform={`rotate(${angle.toFixed(2)} ${at.x.toFixed(1)} ${at.y.toFixed(1)})`}
      textAnchor="middle"
      dominantBaseline="central"
      className="pointer-events-none fill-ink-2 text-xs"
    >
      {zone.label}
    </text>
  );
}

function Drawing({ g, selectedShellId }: { g: IsoGeometry; selectedShellId: Id | null }) {
  const s = g.scale;
  const thin = Math.max(1, Math.min(1.5, 3 * s));
  const arm = Math.max(1.5, Math.min(4, 9 * s));
  const post = Math.max(2, Math.min(5, 11 * s));
  const hullStroke = Math.max(1, Math.min(1.5, 4 * s));
  return (
    <svg
      aria-hidden
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      className="block overflow-visible"
    >
      {/* Bed, hitch, and the near wheels. */}
      <polyline
        points={points(g.hitch)}
        fill="none"
        strokeWidth={post}
        strokeLinejoin="round"
        className="stroke-ink-2"
      />
      <polygon
        points={points(g.bedBack)}
        strokeWidth={thin}
        className="fill-line stroke-line-strong"
      />
      <polygon
        points={points(g.bedSide)}
        strokeWidth={thin}
        className="fill-line stroke-line-strong"
      />
      {/* The bed is a box about 2 ft deep: its far and front walls sit behind the floor. */}
      <polygon
        points={points(g.bedWalls.far)}
        strokeWidth={thin}
        strokeLinejoin="round"
        className="fill-surface-2 stroke-line-strong"
      />
      <polygon
        points={points(g.bedWalls.front)}
        strokeWidth={thin}
        strokeLinejoin="round"
        className="fill-line stroke-line-strong"
      />
      <polygon
        points={points(g.bedTop)}
        strokeWidth={thin}
        className="fill-surface-2 stroke-line-strong"
      />
      {/* The bed's zones along the length, with their names under the near side. */}
      {g.zones.map((z) => (
        <g key={z.id} data-zone={z.id}>
          <polygon
            points={points(z.top)}
            strokeWidth={thin}
            strokeLinejoin="round"
            className="fill-surface stroke-line-strong"
          />
        </g>
      ))}
      {/* The near and back walls, see-through so the zones on the floor show. */}
      <polygon
        points={points(g.bedWalls.near)}
        strokeWidth={thin}
        strokeLinejoin="round"
        className="fill-line stroke-line-strong"
        fillOpacity={0.35}
      />
      <polygon
        points={points(g.bedWalls.back)}
        strokeWidth={thin}
        strokeLinejoin="round"
        className="fill-line stroke-line-strong"
        fillOpacity={0.5}
      />
      {/* Where one zone gives way to the next, marked up the near wall. */}
      {g.zones.map(
        (z) =>
          z.divider && (
            <line
              key={`divider-${z.id}`}
              x1={z.divider.a.x}
              y1={z.divider.a.y}
              x2={z.divider.b.x}
              y2={z.divider.b.y}
              strokeWidth={thin}
              className="stroke-ink-2"
            />
          ),
      )}
      {g.zones.map((z) => (
        <ZoneName key={z.id} zone={z} />
      ))}
      {g.wheels.map((w, i) => (
        <g key={i}>
          <circle
            cx={w.cx}
            cy={w.cy}
            r={w.r}
            strokeWidth={thin * 1.5}
            className="fill-surface-2 stroke-ink-2"
          />
          <circle cx={w.cx} cy={w.cy} r={w.r * 0.38} className="fill-ink-2" />
        </g>
      ))}

      {/* Racks, uprights, and hulls, far and low first. */}
      {g.items.map((item, i) => {
        if (item.kind === 'arm') {
          const a = item.arm;
          return (
            <line
              key={`arm-${i}`}
              x1={a.a.x}
              y1={a.a.y}
              x2={a.b.x}
              y2={a.b.y}
              strokeWidth={arm}
              strokeLinecap="round"
              strokeDasharray={a.active ? undefined : `${arm * 2} ${arm * 1.5}`}
              className={a.active ? 'stroke-ink-2' : 'stroke-line-strong'}
            />
          );
        }
        if (item.kind === 'post') {
          const p = item.segment;
          return (
            <line
              key={`post-${i}`}
              x1={p.a.x}
              y1={p.a.y}
              x2={p.b.x}
              y2={p.b.y}
              strokeWidth={post}
              className="stroke-ink-2"
            />
          );
        }
        return (
          <Hull
            key={item.hull.shellId}
            hull={item.hull}
            selected={item.hull.shellId === selectedShellId}
            strokeWidth={hullStroke}
          />
        );
      })}
      {g.topBars.map((b, i) => (
        <line
          key={`bar-${i}`}
          x1={b.a.x}
          y1={b.a.y}
          x2={b.b.x}
          y2={b.b.y}
          strokeWidth={post}
          strokeLinecap="round"
          className="stroke-ink-2"
        />
      ))}
      {g.hulls.map((h) => (
        <HullLabel key={h.shellId} hull={h} />
      ))}

      {/* Which end is the front. */}
      <text
        x={g.front.x + 6}
        y={g.front.y}
        dominantBaseline="central"
        className="fill-ink-2 text-xs"
      >
        Front
      </text>
    </svg>
  );
}

/** "Peggy (8+, 5.0 m past the front and 2.7 m past the back)". */
function hullWords(h: IsoHull, frameLengthCm: number): string {
  if (!h.boat) return 'a boat not on the load list';
  const o = hullOverhang(h, frameLengthCm);
  const out = overhangWords(o.front, o.rear);
  return `${h.boat.name} (${h.boat.cls}${out ? `, ${out}` : ''})`;
}

/** What the drawing shows, in words: how many boats, then each level's boats. */
function Summary({ name, trailer, g }: { name: string; trailer: TrailerDef; g: IsoGeometry }) {
  const levels = [...g.tiers].reverse().map((tier) => {
    const hulls = g.hulls
      .filter((h) => h.tier === tier)
      .sort((a, b) => a.wCm - b.wCm || a.startCm - b.startCm);
    return { tier, hulls };
  });
  const count = g.hulls.length;
  return (
    <div className="sr-only">
      <p>
        {name}: {count === 0 ? 'no boats' : `${count} ${count === 1 ? 'boat' : 'boats'}`}.
      </p>
      {count > 0 && (
        <ul>
          {levels.map(({ tier, hulls }) => (
            <li key={tier}>
              {tierLabel(trailer, tier)}:{' '}
              {hulls.length === 0
                ? 'empty'
                : hulls.map((h) => hullWords(h, g.frameLengthCm)).join('; ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrailerIsometric({
  trailer,
  rules,
  placements = NO_PLACEMENTS,
  boats = NO_BOATS,
  width: fixedWidth,
  label,
  selectedShellId = null,
  className,
}: TrailerIsometricProps) {
  const [measureRef, measured] = useContainerWidth(FALLBACK_WIDTH);
  const width = fixedWidth ?? measured;
  const effective = useMemo(
    () => effectiveShelvesFor(trailer, rules ?? NO_RULES),
    [trailer, rules],
  );
  const g = useMemo(
    () => isometricGeometry({ trailer, shelves: effective, placements, boats, width }),
    [trailer, effective, placements, boats, width],
  );
  const name = label ?? `${trailer.name || 'Trailer'}, isometric view`;
  const overhang = overhangSummary(g);
  const bed = bedSummary(g.zones);
  return (
    <figure
      ref={fixedWidth ? undefined : measureRef}
      aria-label={name}
      className={cn('m-0 flex w-full min-w-0 flex-col gap-2', className)}
    >
      <Drawing g={g} selectedShellId={selectedShellId} />
      <Summary name={name} trailer={trailer} g={g} />
      {(overhang || bed) && (
        <figcaption className="flex flex-col gap-0.5 text-sm text-ink-2">
          {overhang && <span>{overhang}</span>}
          {bed && <span>{bed}</span>}
        </figcaption>
      )}
    </figure>
  );
}
