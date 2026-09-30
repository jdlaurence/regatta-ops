// Geometry of the plan view (PLAN.md §4.10, §16.5): the trailer from above, front (the truck) at
// the left, one level at a time, or the bed with its zones along the length (§4.9). Pure: the
// component draws what this returns, and tests check it without a DOM.

import {
  REAR_FLAG_THRESHOLD_CM,
  bedZones,
  zoneWords,
  type BedZone,
  type EffectiveShelf,
  type Id,
  type PackBoat,
  type Placement,
  type TrailerDef,
} from '@srt/domain';
import { sideNamesOf } from './labels';

// ---------------------------------------------------------------------------
// One level from above

export interface PlanBoat {
  shellId: Id;
  name: string;
  cls: string;
  lengthCm: number;
  offsetCm: number;
  bowForward: boolean;
  teamId: string;
  /** Left edge and width in px. */
  x: number;
  width: number;
  /** How much of this boat sticks out past the front and the back of the shelf, cm. */
  frontCm: number;
  rearCm: number;
}

export interface PlanLane {
  shelfId: Id;
  lane: number;
  /** "Wide side, outer lane". */
  label: string;
  y: number;
  height: number;
  boats: PlanBoat[];
  frontOverhangCm: number;
  rearOverhangCm: number;
  /** The shelf's overhang limits, as px positions. */
  frontMaxX: number;
  rearMaxX: number;
  frontMaxCm: number;
  rearMaxCm: number;
  active: boolean;
  /** Boats end to end in this lane (small boats paired). */
  paired: boolean;
}

export interface PlanViewGeometry {
  width: number;
  height: number;
  pxPerCm: number;
  gutter: number;
  /** The trailer frame, front at the left. */
  frame: { x1: number; x2: number; y1: number; y2: number };
  lanes: PlanLane[];
  /** Where a gap between the two sides is drawn (the post), if any. */
  dividers: number[];
  /** The 1.2 m (4 ft) rear flag threshold (§16.5). */
  flagX: number;
  toX: (cm: number) => number;
}

const PLAN_LANE_HEIGHT = 38;
const PLAN_LANE_GAP = 4;
const PLAN_SIDE_GAP = 14;
const PLAN_TOP = 30;
const PLAN_BOTTOM = 34;

/**
 * Seen from above with the front of the trailer (the truck) at the left. Lanes run across the
 * page as bands, the far side first, so the outer lane of the wide side is at the top and the
 * narrow side at the bottom, as you would see them walking forward along the trailer. Lengths
 * are to scale; band heights are fixed so names stay legible.
 */
export function planViewGeometry(input: {
  def: TrailerDef;
  shelves: readonly EffectiveShelf[];
  placements: readonly Placement[];
  boats: ReadonlyMap<Id, Pick<PackBoat, 'name' | 'cls' | 'lengthCm' | 'teamId'>>;
  tier: number;
  width: number;
  gutter?: number;
}): PlanViewGeometry {
  const { def, placements, boats, tier } = input;
  const width = Math.max(240, Math.round(input.width));
  const gutter = input.gutter ?? (width < 480 ? 64 : 124);
  const shelves = input.shelves.filter((s) => s.def.tier === tier);
  const frameLen = Math.max(1, def.frameLengthCm);

  // Extent: every shelf limit, every boat, and the flag line, with a little air.
  let minCm = 0;
  let maxCm = frameLen + REAR_FLAG_THRESHOLD_CM;
  for (const s of shelves) {
    minCm = Math.min(minCm, -s.frontMaxCm);
    maxCm = Math.max(maxCm, s.def.lengthCm + s.rearMaxCm);
  }
  const onTier = placements.filter((p) => shelves.some((s) => s.def.id === p.shelfId));
  for (const p of onTier) {
    const b = boats.get(p.shellId);
    minCm = Math.min(minCm, p.offsetCm);
    maxCm = Math.max(maxCm, p.offsetCm + (b?.lengthCm ?? 0));
  }
  const pad = 20;
  const usable = Math.max(40, width - gutter - 12);
  const pxPerCm = usable / (maxCm - minCm + pad * 2);
  const toX = (cm: number) => gutter + (cm - minCm + pad) * pxPerCm;

  // Bands: right-hand (wide) side outer lane first, then inner; full shelves; left side.
  const order = (key: string) => (key === 'right' ? 0 : key === 'full' ? 1 : 2);
  const sorted = [...shelves].sort(
    (a, b) => order(a.def.columnKey) - order(b.def.columnKey) || a.index - b.index,
  );
  const sides = sideNamesOf(def);
  const lanes: PlanLane[] = [];
  const dividers: number[] = [];
  let y = PLAN_TOP;
  let prevKey: string | null = null;
  for (const s of sorted) {
    if (prevKey !== null && prevKey !== s.def.columnKey) {
      dividers.push(y + PLAN_SIDE_GAP / 2 - PLAN_LANE_GAP / 2);
      y += PLAN_SIDE_GAP - PLAN_LANE_GAP;
    }
    prevKey = s.def.columnKey;
    const used = onTier.filter((p) => p.shelfId === s.def.id);
    const count = Math.max(1, s.laneSlots, ...used.map((p) => p.lane + 1));
    const laneOrder = Array.from({ length: count }, (_, i) => count - 1 - i);
    for (const lane of laneOrder) {
      const here = used
        .filter((p) => p.lane === lane)
        .sort((a, b) => a.offsetCm - b.offsetCm)
        .map((p): PlanBoat => {
          const b = boats.get(p.shellId);
          const lengthCm = b?.lengthCm ?? 0;
          return {
            shellId: p.shellId,
            name: b?.name ?? 'Unknown',
            cls: b?.cls ?? '?',
            lengthCm,
            offsetCm: p.offsetCm,
            bowForward: p.bowForward,
            teamId: b?.teamId ?? '',
            x: toX(p.offsetCm),
            width: Math.max(2, lengthCm * pxPerCm),
            frontCm: Math.min(lengthCm, Math.max(0, -p.offsetCm)),
            rearCm: Math.min(lengthCm, Math.max(0, p.offsetCm + lengthCm - s.def.lengthCm)),
          };
        });
      const start = here.length > 0 ? Math.min(...here.map((b) => b.offsetCm)) : 0;
      const end = here.length > 0 ? Math.max(...here.map((b) => b.offsetCm + b.lengthCm)) : 0;
      const side = s.def.columnKey === 'full' ? null : sides[s.def.columnKey];
      const laneWord =
        count <= 1
          ? null
          : count === 2
            ? lane === 0
              ? 'inner lane'
              : 'outer lane'
            : `lane ${lane + 1}`;
      const label = [side ? side[0]!.toUpperCase() + side.slice(1) : 'Full width', laneWord]
        .filter(Boolean)
        .join(', ');
      lanes.push({
        shelfId: s.def.id,
        lane,
        label,
        y,
        height: PLAN_LANE_HEIGHT,
        boats: here,
        frontOverhangCm: here.length > 0 ? Math.max(0, -start) : 0,
        rearOverhangCm: here.length > 0 ? Math.max(0, end - s.def.lengthCm) : 0,
        frontMaxX: toX(-s.frontMaxCm),
        rearMaxX: toX(s.def.lengthCm + s.rearMaxCm),
        frontMaxCm: s.frontMaxCm,
        rearMaxCm: s.rearMaxCm,
        active: s.active,
        paired: here.length > 1,
      });
      y += PLAN_LANE_HEIGHT + PLAN_LANE_GAP;
    }
  }
  const bottom = lanes.length > 0 ? y - PLAN_LANE_GAP : PLAN_TOP + PLAN_LANE_HEIGHT;
  return {
    width,
    height: Math.ceil(bottom + PLAN_BOTTOM),
    pxPerCm,
    gutter,
    frame: { x1: toX(0), x2: toX(frameLen), y1: PLAN_TOP - 6, y2: bottom + 6 },
    lanes,
    dividers,
    flagX: toX(frameLen + REAR_FLAG_THRESHOLD_CM),
    toX,
  };
}

// ---------------------------------------------------------------------------
// The bed from above (§4.9): zones along the length, each across the bed's full width

export interface PlanZone {
  id: Id;
  label: string;
  /** "back of the bed, full width" for the zone at the back, "whole length" without a position. */
  note: string | null;
  startCm: number;
  endCm: number;
  positioned: boolean;
  /** Shares its stretch of the bed with another zone, side by side (not the full width). */
  shared: boolean;
  /** The zone's box in px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** "Riggers, from 7.0 m to the back (5.2 m)", for screen readers. */
  words: string;
}

export interface BedPlanGeometry {
  width: number;
  height: number;
  pxPerCm: number;
  gutter: number;
  /** The bed's outline: the frame from above, front at the left. */
  frame: { x1: number; x2: number; y1: number; y2: number };
  zones: PlanZone[];
  toX: (cm: number) => number;
}

/** The bed band is drawn as tall as three lanes, so zone names and lengths fit. */
const BED_BAND_HEIGHT = PLAN_LANE_HEIGHT * 3 + PLAN_LANE_GAP * 2;
const BED_INSET = 4;
const BED_ROW_GAP = 4;
const BED_BOTTOM = 14;

function zoneNote(z: BedZone, frameLengthCm: number): string | null {
  if (!z.positioned) return 'whole length';
  if (z.startCm > 0 && z.endCm >= frameLengthCm - 0.5) {
    return z.rows === 1 ? 'back of the bed, full width' : 'back of the bed';
  }
  return null;
}

/**
 * The bed seen from above, front at the left: the frame's outline with the compartments along
 * it, to scale in length. A zone spans the bed's full width unless it shares its stretch of the
 * bed with another (then they sit side by side across it).
 */
export function bedPlanGeometry(input: {
  def: TrailerDef;
  width: number;
  gutter?: number;
}): BedPlanGeometry {
  const { def } = input;
  const width = Math.max(240, Math.round(input.width));
  const gutter = input.gutter ?? (width < 480 ? 64 : 124);
  const frameLen = Math.max(1, def.frameLengthCm);
  const pad = 20;
  const usable = Math.max(40, width - gutter - 12);
  const pxPerCm = usable / (frameLen + pad * 2);
  const toX = (cm: number) => gutter + (cm + pad) * pxPerCm;
  const frame = {
    x1: toX(0),
    x2: toX(frameLen),
    y1: PLAN_TOP,
    y2: PLAN_TOP + BED_BAND_HEIGHT,
  };
  const inner = BED_BAND_HEIGHT - BED_INSET * 2;
  const zones: PlanZone[] = bedZones(def).map((z) => {
    const rowH = (inner - BED_ROW_GAP * (z.rows - 1)) / z.rows;
    const xa = toX(z.startCm) + (z.startCm <= 0 ? BED_INSET : 1);
    const xb = toX(z.endCm) - (z.endCm >= frameLen - 0.5 ? BED_INSET : 1);
    return {
      id: z.compartment.id,
      label: z.compartment.label.trim() || 'Bed',
      note: zoneNote(z, frameLen),
      startCm: z.startCm,
      endCm: z.endCm,
      positioned: z.positioned,
      shared: z.rows > 1,
      x: xa,
      y: frame.y1 + BED_INSET + z.row * (rowH + BED_ROW_GAP),
      width: Math.max(0, xb - xa),
      height: rowH,
      words: zoneWords(z, frameLen),
    };
  });
  return {
    width,
    height: Math.ceil(frame.y2 + BED_BOTTOM),
    pxPerCm,
    gutter,
    frame,
    zones,
    toX,
  };
}
