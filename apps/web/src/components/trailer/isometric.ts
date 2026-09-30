// Geometry of the isometric trailer view (PLAN.md §4.10, Phase 3). Pure: a trailer, its
// effective shelves, placements, and boats in; polygons and lines in pixels out, in the order
// they are painted. The component draws what this returns.
//
// A three-quarter view from behind and to the right, a little above: the trailer's length runs
// along a shallow diagonal with the front (and the tow vehicle) to the upper right, the width
// runs down to the right, so the right side and the rear face the viewer. Lengths and widths are
// to scale; heights are not: rack levels are spread apart so the boats on one level never hide
// the level below, and hulls are drawn a little wider than they are, as in the end view.
//
// Across the width, shelves, lanes, and posts sit exactly where the end view puts them
// (endViewGeometry), so the two views always agree about which lane a boat is in.
//
// The bed shows its compartments as zones along the length (PLAN.md §4.9), each across the bed's
// full width, with its name under the near side of the frame where the wheels leave room.

import {
  BOAT_CLASS_SPECS,
  bedZones,
  meters,
  type BoatClass,
  type Id,
  type TrailerDef,
} from '@srt/domain';
import { endViewGeometry, type ShelfState } from './geometry';
import type { EndViewBoat, EndViewPlacement } from './TrailerEndView';

export interface Pt {
  x: number;
  y: number;
}

/** The same boats as the end view; `lengthCm` (class default when unset) sets the hull length. */
export type IsometricBoat = EndViewBoat;

export interface IsoSegment {
  a: Pt;
  b: Pt;
}

export interface IsoArm extends IsoSegment {
  shelfId: Id;
  active: boolean;
}

export interface IsoHull {
  shellId: Id;
  boat: IsometricBoat | null;
  tier: number;
  /** Across the trailer from the left side (cm): the painting order within a level. */
  wCm: number;
  /** Along the trailer from the front of the frame (cm), front end and back end. */
  startCm: number;
  endCm: number;
  /** The deck seen from above, and the same outline lowered: together they give the hull depth. */
  top: Pt[];
  keel: Pt[];
  /** Where the name goes: the middle of the deck, turned to follow the hull. */
  label: {
    at: Pt;
    angle: number;
    /** Length of deck a name may use, and the deck's thickness across, in px. */
    room: number;
    thickness: number;
  };
}

export interface IsoOverhang {
  cm: number;
  shellId: Id;
  /** The tip of the boat that sticks out furthest. */
  at: Pt;
}

/** A bed zone: its patch of the bed seen from above, and its name under the near side. */
export interface IsoZone {
  id: Id;
  label: string;
  startCm: number;
  endCm: number;
  positioned: boolean;
  top: Pt[];
  /** Where the zone meets the next one on the frame's near side (none at the ends). */
  divider: IsoSegment | null;
  /** The name's anchor under the near side, turned to follow it; `room` is the length it may use. */
  name: { at: Pt; angle: number; room: number } | null;
}

/** One thing to paint, in order. */
export type IsoItem =
  | { kind: 'arm'; arm: IsoArm }
  | { kind: 'post'; segment: IsoSegment }
  | { kind: 'hull'; hull: IsoHull };

export interface IsoGeometry {
  width: number;
  height: number;
  frameLengthCm: number;
  /** px per cm along the length. */
  scale: number;
  /** The bed's floor seen from above, and the deck's near edge and back edge. */
  bedTop: Pt[];
  bedSide: Pt[];
  bedBack: Pt[];
  /**
   * The bed's walls, about 2 ft (61 cm) above the floor: `far` and `front` are painted behind
   * the floor's zones, `near` and `back` in front of them (see-through, so the zones show).
   */
  bedWalls: { far: Pt[]; front: Pt[]; near: Pt[]; back: Pt[] };
  hitch: Pt[];
  /** Compartments along the bed, front to back. */
  zones: IsoZone[];
  /** The hitch point, for the "Front" caption. */
  front: Pt;
  wheels: { cx: number; cy: number; r: number }[];
  /** Everything above the bed, in painting order (far and low first). */
  items: IsoItem[];
  /** Goalpost top bars, painted last. */
  topBars: IsoSegment[];
  hulls: IsoHull[];
  overhang: { front: IsoOverhang | null; rear: IsoOverhang | null };
  tiers: number[];
}

// View and drawing constants (screen cm before scaling).
const LENGTH_ANGLE = (10 * Math.PI) / 180;
const WIDTH_ANGLE = (32 * Math.PI) / 180;
const WIDTH_FORESHORTEN = 0.75;
const BED_Z = 62;
const BED_DEPTH = 16;
/** SRA's beds are boxes about 2 ft deep (the owner, 2026-09-30); to scale with the length. */
export const BED_WALL_CM = 61;
/** The first rack sits about 4 in above the top of the bed's walls. */
export const FIRST_RACK_ABOVE_WALL_CM = 10;
const FIRST_RACK = BED_WALL_CM + FIRST_RACK_ABOVE_WALL_CM;
const WHEEL_R = 38;
const HULL_DEPTH = 14;
const HULL_BEAM_SCALE = 2;
/** Room kept right of the hitch for the "Front" caption, in px. */
const FRONT_CAPTION_PX = 44;
const HITCH_CM = 170;
/** Room between rack levels beyond what one level's width takes on screen. */
const LEVEL_GAP = 24;
const PAD = 12;
/** Largest drawing scale (px per cm), so an empty trailer is not drawn huge. */
const MAX_SCALE = 0.4;

const LX = -Math.cos(LENGTH_ANGLE);
const LY = Math.sin(LENGTH_ANGLE);
const WX = Math.cos(WIDTH_ANGLE) * WIDTH_FORESHORTEN;
const WY = Math.sin(WIDTH_ANGLE) * WIDTH_FORESHORTEN;

/** Unscaled screen position of a point: along (cm from the front), across (cm from the left), up. */
function raw(l: number, w: number, z: number): Pt {
  return { x: l * LX + w * WX, y: l * LY + w * WY - z };
}

/** The class default length when a boat does not say. */
export function boatLengthCm(boat: Pick<IsometricBoat, 'cls' | 'lengthCm'> | null): number {
  if (boat?.lengthCm && boat.lengthCm > 0) return boat.lengthCm;
  const spec = boat ? BOAT_CLASS_SPECS[boat.cls as BoatClass] : undefined;
  return spec?.defaultLengthCm ?? 1200;
}

/**
 * Half-width of a hull along its length (t from 0 to 1): full amidships, pointed at both
 * ends, like a racing shell seen from above.
 */
export function hullProfile(t: number): number {
  const s = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
  return Math.pow(s, 0.6);
}

const HULL_STEPS = 14;
/** Zone patches stop this far short of each other and of the frame's edges (cm). */
const ZONE_INSET = 8;
/** Room under a zone's name (px): the text hangs this far below its anchor. */
const ZONE_NAME_PX = 18;
/** Wheel positions along the frame (fraction of its length), near side. */
const WHEELS_AT = [0.56, 0.68];

export interface IsoInput {
  trailer: TrailerDef;
  /** Effective shelves (`effectiveShelvesFor`); defaults to the definition's own. */
  shelves?: readonly ShelfState[];
  placements?: readonly EndViewPlacement[];
  boats?: readonly IsometricBoat[];
  /** Drawing width in px. */
  width: number;
}

export function isometricGeometry(input: IsoInput): IsoGeometry {
  const { trailer, placements = [], boats = [] } = input;
  const width = Math.max(200, Math.round(input.width));
  const frameL = Math.max(100, trailer.frameLengthCm || 0);
  const W = Math.max(60, trailer.widthCm || 0);

  // Across-the-width positions, borrowed from the end view so both views agree.
  const ev = endViewGeometry({
    trailer,
    shelves: input.shelves,
    placements,
    width: 2000,
    size: 'full',
  });
  const toW = (px: number) => (px - ev.frame.x1) / ev.pxPerCm;
  const shelfById = new Map(ev.shelves.map((s) => [s.shelf.id, s]));

  // Rack levels: spread so one level's width on screen never reaches the next.
  const tiers = [...new Set(ev.shelves.map((s) => s.shelf.tier))].sort((a, b) => a - b);
  const maxBeam = Math.max(60, ...boats.map((b) => b.beamCm || 0)) * HULL_BEAM_SCALE;
  const levelSpan = (W + maxBeam) * WY + HULL_DEPTH;
  const pitch = levelSpan + LEVEL_GAP;
  const zOf = new Map(tiers.map((t, i) => [t, BED_Z + FIRST_RACK + i * pitch]));
  const topZ = (tiers.length ? zOf.get(tiers[tiers.length - 1]!)! : BED_Z) + HULL_DEPTH + 26;

  // Upright stations along the frame: both ends and evenly between.
  const stationCount = frameL >= 900 ? 4 : 3;
  const stations = Array.from(
    { length: stationCount },
    (_, i) => (frameL * i) / (stationCount - 1),
  );

  const boatById = new Map(boats.map((b) => [b.shellId, b]));

  // Hulls, in cm first.
  interface HullCm {
    shellId: Id;
    boat: IsometricBoat | null;
    tier: number;
    w: number;
    start: number;
    end: number;
    beam: number;
    z: number;
  }
  const hullsCm: HullCm[] = [];
  for (const p of placements) {
    const sg = shelfById.get(p.shelfId);
    if (!sg) continue;
    const lane = sg.lanes.find((l) => l.lane === p.lane) ?? sg.lanes[0];
    if (!lane) continue;
    const boat = boatById.get(p.shellId) ?? null;
    const start = p.offsetCm ?? 0;
    const length = boatLengthCm(boat);
    hullsCm.push({
      shellId: p.shellId,
      boat,
      tier: sg.shelf.tier,
      w: toW(lane.rect.x + lane.rect.width / 2),
      start,
      end: start + length,
      beam: Math.max(20, boat?.beamCm ?? 52) * HULL_BEAM_SCALE,
      z: zOf.get(sg.shelf.tier) ?? BED_Z,
    });
  }

  // Everything is built at scale 1 first (every point goes into `drawn`), then fitted to the
  // width in one pass at the end.
  const drawn = new Set<Pt>();
  const P = (l: number, w: number, z: number): Pt => {
    const r = raw(l, w, z);
    drawn.add(r);
    return r;
  };

  // The bed: the frame seen from above, its near side, and its back.
  const bedTop = [P(0, 0, BED_Z), P(frameL, 0, BED_Z), P(frameL, W, BED_Z), P(0, W, BED_Z)];
  const bedSide = [
    P(0, W, BED_Z),
    P(frameL, W, BED_Z),
    P(frameL, W, BED_Z - BED_DEPTH),
    P(0, W, BED_Z - BED_DEPTH),
  ];
  const bedBack = [
    P(frameL, 0, BED_Z),
    P(frameL, W, BED_Z),
    P(frameL, W, BED_Z - BED_DEPTH),
    P(frameL, 0, BED_Z - BED_DEPTH),
  ];
  // The walls, floor to top. The drawing looks at the back and near side, from above.
  const WALL = BED_Z + BED_WALL_CM;
  const bedWalls = {
    far: [P(0, 0, BED_Z), P(frameL, 0, BED_Z), P(frameL, 0, WALL), P(0, 0, WALL)],
    front: [P(0, 0, BED_Z), P(0, W, BED_Z), P(0, W, WALL), P(0, 0, WALL)],
    near: [P(0, W, BED_Z), P(frameL, W, BED_Z), P(frameL, W, WALL), P(0, W, WALL)],
    back: [P(frameL, 0, BED_Z), P(frameL, W, BED_Z), P(frameL, W, WALL), P(frameL, 0, WALL)],
  };
  const front = P(-HITCH_CM, W / 2, BED_Z - BED_DEPTH);
  const hitch = [P(0, 0, BED_Z - BED_DEPTH / 2), front, P(0, W, BED_Z - BED_DEPTH / 2)];
  // Compartments along the bed (§4.9): each zone's patch of the bed, across the full width
  // unless zones share a stretch, with a divider down the near side where one gives way to the
  // next, and the name hung under the near side, clear of the wheels.
  const zones: IsoZone[] = bedZones({ ...trailer, frameLengthCm: frameL }).map((z) => {
    const l1 = z.startCm + ZONE_INSET / 2;
    const l2 = Math.max(l1, z.endCm - ZONE_INSET / 2);
    const rowW = W / z.rows;
    const w1 = z.row * rowW + ZONE_INSET / 2;
    const w2 = Math.max(w1, (z.row + 1) * rowW - ZONE_INSET / 2);
    const top = [P(l1, w1, BED_Z), P(l2, w1, BED_Z), P(l2, w2, BED_Z), P(l1, w2, BED_Z)];
    const nearRow = z.row === z.rows - 1;
    const divider =
      nearRow && z.endCm < frameL - 0.5
        ? { a: P(z.endCm, W, BED_Z), b: P(z.endCm, W, WALL) }
        : null;
    // The name is written on the near wall, halfway up, centered on the zone.
    const name = nearRow
      ? {
          at: P((z.startCm + z.endCm) / 2, W, BED_Z + BED_WALL_CM / 2),
          angle: -(LENGTH_ANGLE * 180) / Math.PI,
          room: Math.max(0, z.endCm - z.startCm - ZONE_INSET) * Math.cos(LENGTH_ANGLE),
        }
      : null;
    return {
      id: z.compartment.id,
      label: z.compartment.label.trim() || 'Bed',
      startCm: z.startCm,
      endCm: z.endCm,
      positioned: z.positioned,
      top,
      divider,
      name,
    };
  });

  // A tandem axle a little behind the middle, near side only (the far wheels are hidden).
  const wheelCenters = WHEELS_AT.map((f) => P(frameL * f, W, WHEEL_R));
  for (const c of wheelCenters) {
    drawn.add({ x: c.x - WHEEL_R, y: c.y + WHEEL_R });
    drawn.add({ x: c.x + WHEEL_R, y: c.y + WHEEL_R });
  }

  // Uprights at each station: one post, or two goalpost uprights; split per level band so
  // boats on the far side of a post pass behind it and boats on the near side in front.
  const postWs = ev.posts.map((p) => toW(p.x + p.width / 2));
  const items: { tier: number; order: number; w: number; item: IsoItem }[] = [];
  const bandBottoms = [BED_Z, ...tiers.map((t) => zOf.get(t)!)];
  const bandTiers = [tiers[0] ?? 0, ...tiers];
  for (const l of stations) {
    for (const w of postWs) {
      bandBottoms.forEach((z0, i) => {
        const z1 = i + 1 < bandBottoms.length ? bandBottoms[i + 1]! : topZ;
        // The band under the first rack belongs to the first level, painted before its boats.
        const tier = i === 0 ? (bandTiers[0] ?? 0) - 0.5 : bandTiers[i]!;
        items.push({
          tier,
          order: 1,
          w,
          item: { kind: 'post', segment: { a: P(l, w, z0), b: P(l, w, z1) } },
        });
      });
    }
  }
  // Rack arms at each station, across each shelf.
  for (const sg of ev.shelves) {
    const z = zOf.get(sg.shelf.tier)!;
    const w1 = toW(sg.arm.x1);
    const w2 = toW(sg.arm.x2);
    for (const l of stations) {
      items.push({
        tier: sg.shelf.tier,
        order: 0,
        w: Math.min(w1, w2),
        item: {
          kind: 'arm',
          arm: { shelfId: sg.shelf.id, active: sg.active, a: P(l, w1, z), b: P(l, w2, z) },
        },
      });
    }
  }

  // Names sit at staggered points along the hulls of a level, so side-by-side names never
  // land on top of each other: 1/4, 1/2, 3/4 of the way along for three lanes.
  const labelSpot = new Map<Id, { frac: number; share: number }>();
  for (const t of tiers) {
    const level = hullsCm.filter((h) => h.tier === t).sort((a, b) => a.w - b.w);
    level.forEach((h, i) => {
      const n = level.length;
      labelSpot.set(h.shellId, {
        frac: n === 1 ? 0.5 : 0.25 + (0.5 * i) / (n - 1),
        share: n === 1 ? 0.7 : Math.min(0.7, 0.5 / (n - 1)),
      });
    });
  }

  // Hulls: the deck outline at the top of the hull, and the same outline at the arm.
  const hulls: IsoHull[] = hullsCm.map((h) => {
    const outline = (z: number): Pt[] => {
      const near: Pt[] = [];
      const far: Pt[] = [];
      for (let i = 0; i <= HULL_STEPS; i++) {
        const t = i / HULL_STEPS;
        const l = h.start + (h.end - h.start) * t;
        const half = (h.beam / 2) * hullProfile(t);
        near.push(P(l, h.w + half, z));
        far.push(P(l, h.w - half, z));
      }
      return [...near, ...far.reverse()];
    };
    const spot = labelSpot.get(h.shellId) ?? { frac: 0.5, share: 0.7 };
    const at = P(h.start + (h.end - h.start) * spot.frac, h.w, h.z + HULL_DEPTH);
    return {
      shellId: h.shellId,
      boat: h.boat,
      tier: h.tier,
      wCm: h.w,
      startCm: h.start,
      endCm: h.end,
      top: outline(h.z + HULL_DEPTH),
      keel: outline(h.z),
      // `room` and `thickness` become px with the scale below.
      label: {
        at,
        angle: -(LENGTH_ANGLE * 180) / Math.PI,
        room: (h.end - h.start) * spot.share,
        thickness: h.beam * WIDTH_FORESHORTEN * Math.sin(LENGTH_ANGLE + WIDTH_ANGLE),
      },
    };
  });
  for (const hull of hulls) {
    items.push({ tier: hull.tier, order: 2, w: hull.wCm, item: { kind: 'hull', hull } });
  }

  // Paint low levels first; within a level the arms, then posts and hulls from far to near.
  items.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const armA = a.order === 0 ? 0 : 1;
    const armB = b.order === 0 ? 0 : 1;
    if (armA !== armB) return armA - armB;
    return a.w - b.w || a.order - b.order;
  });

  const topBars: IsoSegment[] =
    trailer.style === 'goalpost' && postWs.length === 2
      ? stations.map((l) => ({ a: P(l, postWs[0]!, topZ), b: P(l, postWs[1]!, topZ) }))
      : [];

  // Overhang past the frame at each end.
  let front_: IsoOverhang | null = null;
  let rear: IsoOverhang | null = null;
  for (const h of hullsCm) {
    const f = Math.max(0, -h.start);
    const r = Math.max(0, h.end - frameL);
    if (f > 0 && (!front_ || f > front_.cm)) {
      front_ = { cm: f, shellId: h.shellId, at: P(h.start, h.w, h.z + HULL_DEPTH) };
    }
    if (r > 0 && (!rear || r > rear.cm)) {
      rear = { cm: r, shellId: h.shellId, at: P(h.end, h.w, h.z) };
    }
  }

  // Fit to the width, keeping room right of the hitch for the "Front" caption.
  const all = [...drawn];
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxY = Math.max(...all.map((p) => p.y));
  const scale = Math.min(
    MAX_SCALE,
    (width - PAD * 2) / Math.max(1, maxX - minX),
    (width - PAD * 2 - FRONT_CAPTION_PX) / Math.max(1, front.x - minX),
  );
  const drawnWidth = Math.ceil(
    Math.max((maxX - minX) * scale, (front.x - minX) * scale + FRONT_CAPTION_PX) + PAD * 2,
  );
  for (const p of drawn) {
    p.x = PAD + (p.x - minX) * scale;
    p.y = PAD + (p.y - minY) * scale;
  }
  for (const h of hulls) {
    h.label.room *= scale;
    h.label.thickness *= scale;
  }
  for (const z of zones) if (z.name) z.name.room *= scale;
  // Zone names hang below the frame: keep room for them under the drawing.
  const height = Math.ceil(
    Math.max(
      (maxY - minY) * scale + PAD * 2,
      ...zones.map((z) => (z.name ? z.name.at.y + ZONE_NAME_PX + PAD / 2 : 0)),
    ),
  );
  const wheels = wheelCenters.map((c) => ({ cx: c.x, cy: c.y, r: WHEEL_R * scale }));

  return {
    width: drawnWidth,
    height,
    frameLengthCm: frameL,
    scale,
    bedTop,
    bedSide,
    bedBack,
    bedWalls,
    hitch,
    zones,
    front,
    wheels,
    items: items.map((i) => i.item),
    topBars,
    hulls,
    overhang: { front: front_, rear },
    tiers,
  };
}

/** How far a hull sticks out past the frame at each end, in cm (0 when it does not). */
export function hullOverhang(
  hull: Pick<IsoHull, 'startCm' | 'endCm'>,
  frameLengthCm: number,
): { front: number; rear: number } {
  return {
    front: Math.max(0, -hull.startCm),
    rear: Math.max(0, hull.endCm - frameLengthCm),
  };
}

/** "5.0 m past the front and 2.7 m past the back", or null when nothing sticks out. */
export function overhangWords(front: number, rear: number): string | null {
  const parts = [
    front > 0 ? `${metres(front)} past the front` : null,
    rear > 0 ? `${metres(rear)} past the back` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' and ') : null;
}

/**
 * The caption under the drawing: "Peggy sticks out 5.0 m past the front of the frame.", or
 * "7 boats stick out, up to 5.0 m past the front and 2.7 m past the back of the frame."
 */
export function overhangSummary(g: Pick<IsoGeometry, 'hulls' | 'frameLengthCm'>): string | null {
  if (g.hulls.length === 0) return null;
  const out = g.hulls
    .map((h) => ({ h, o: hullOverhang(h, g.frameLengthCm) }))
    .filter(({ o }) => o.front > 0 || o.rear > 0);
  if (out.length === 0) return 'Every boat is within the frame.';
  const front = Math.max(...out.map(({ o }) => o.front));
  const rear = Math.max(...out.map(({ o }) => o.rear));
  if (out.length === 1) {
    const { h, o } = out[0]!;
    return `${h.boat?.name ?? 'A boat'} sticks out ${overhangWords(o.front, o.rear)} of the frame.`;
  }
  return `${out.length} boats stick out, up to ${overhangWords(front, rear)} of the frame.`;
}

/**
 * The bed in words, under the drawing: "Bed, front to back: slings (3.0 m), oars (4.0 m),
 * riggers (5.2 m)." Null when nothing rides in the bed.
 */
export function bedSummary(
  zones: readonly Pick<IsoZone, 'label' | 'startCm' | 'endCm' | 'positioned'>[],
): string | null {
  if (zones.length === 0) return null;
  const items = zones.map((z) => {
    const name =
      z.label.length > 1 && /[A-Z]/.test(z.label[1]!)
        ? z.label
        : z.label[0]!.toLowerCase() + z.label.slice(1);
    return `${name} (${z.positioned ? `${meters(z.endCm - z.startCm)} m` : 'whole length'})`;
  });
  const list =
    items.length <= 2
      ? items.join(' and ')
      : `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  return `Bed, front to back: ${list}.`;
}

/** "4.5 m" for a length in cm. */
export function metres(cm: number): string {
  return `${(Math.round(cm / 10) / 10).toFixed(1)} m`;
}

/** SVG points attribute. */
export function points(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}
