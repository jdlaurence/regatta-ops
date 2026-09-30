// Geometry of the trailer end view (PLAN.md §5.4, §9.3.2). Pure: a trailer definition, its
// effective shelves, and a width in pixels in; rectangles in pixels out. The component draws
// what this returns, and tests check it without a DOM.
//
// Horizontal positions are to scale (one px/cm factor for the whole drawing, so the one-hull
// side really is half the two-hull side). Vertical spacing is fixed per size so chips stay
// legible and touchable; racks are not that far apart in real life, but a boat chip is text.
//
// Seen from the back of the trailer. Lanes count out from what a shelf hangs on: lane 0 is
// against the post (offset and center post) or the upright (goalpost side shelves); on
// full-width shelves lane 0 is on the left.

import type { Id, ShelfDef, TrailerDef } from '@srt/domain';
import { sideNamesOf, tierLabel, tierWordOf } from './labels';

export type EndViewSize = 'full' | 'thumb';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EndViewCell {
  shelfId: Id;
  lane: number;
}

export interface LaneGeometry extends EndViewCell {
  /** The space above the arm a boat sits in: drop target and highlight. */
  rect: Rect;
  /** Where an empty lane's outline is drawn: a four-sized chip resting on the arm. */
  slot: Rect;
  /** Farthest from the post on its shelf: the first off and the easiest to reach. */
  outer: boolean;
  /** Outer-first shelves: 1 loads first (by the post); null elsewhere. */
  loadOrder: number | null;
  /** Show the load order label here: the top shelf of a column of alike shelves. */
  showLoadOrder: boolean;
}

export interface ShelfGeometry {
  shelf: ShelfDef;
  active: boolean;
  laneCount: number;
  /** The rack arm under the boats, as a line of the given thickness. */
  arm: { x1: number; x2: number; y: number; thickness: number };
  /** Where the arm's end stop stands (the free end away from the post), if any. */
  stopX: number | null;
  /** The whole shelf above its arm. */
  rect: Rect;
  lanes: LaneGeometry[];
  /** Lane width in cm, for sizing chips. */
  laneWidthCm: number;
}

export interface TierGeometry {
  tier: number;
  /** "Level 5". */
  label: string;
  /** What is drawn in the gutter: the label, or just the number on a narrow drawing. */
  shortLabel: string;
  /** Band top and bottom (the arm sits at the bottom). */
  top: number;
  bottom: number;
  armY: number;
  /** Vertical center of a chip on this tier, for the tier label. */
  labelY: number;
}

export interface Caption {
  text: string;
  x: number;
  align: 'start' | 'middle' | 'end';
}

export interface CompartmentGeometry {
  id: Id;
  label: string;
  kind: string;
  rect: Rect;
}

export interface EndViewGeometry {
  size: EndViewSize;
  width: number;
  height: number;
  pxPerCm: number;
  /** Left gutter holding the tier labels. */
  gutter: number;
  /** Narrow drawing: tier numbers under one "Level" heading (`tierHeading`). */
  tierHeading: string | null;
  /** The trailer's own width (the bed) in px. */
  frame: { x1: number; x2: number };
  /** Uprights: one post, or two goalpost uprights. */
  posts: Rect[];
  tiers: TierGeometry[];
  shelves: ShelfGeometry[];
  bed: Rect;
  compartments: CompartmentGeometry[];
  wheels: { cx: number; cy: number; r: number }[];
  groundY: number;
  /** Side captions under the drawing, with their baseline. */
  captions: Caption[];
  captionY: number;
  chipHeight: number;
  /** Chips are drawn this much wider than the hull so names fit; still in proportion. */
  chipScale: number;
}

/** What the geometry needs from an effective shelf (domain `EffectiveShelf`). */
export interface ShelfState {
  def: ShelfDef;
  active: boolean;
  laneSlots: number;
}

interface SizeSpec {
  pitch: number;
  topPad: number;
  armThickness: number;
  chipHeight: number;
  bedHeight: number;
  bedGap: number;
  wheelR: number;
  captionH: number;
  gutter: number;
  padRight: number;
  postCm: number;
  minChipPx: number;
  slotChipGap: number;
  chipScale: number;
  shortLabels: boolean;
}

function sizeSpec(size: EndViewSize, width: number): SizeSpec {
  if (size === 'thumb') {
    const pitch = Math.max(8, Math.round(width / 11));
    return {
      pitch,
      topPad: 3,
      armThickness: 1.5,
      chipHeight: Math.max(4, Math.round(pitch * 0.5)),
      bedHeight: Math.max(5, Math.round(pitch * 0.6)),
      bedGap: 2,
      wheelR: Math.max(3, Math.round(pitch * 0.35)),
      captionH: 0,
      gutter: 2,
      padRight: 2,
      postCm: 8,
      minChipPx: 4,
      slotChipGap: 1,
      chipScale: 1.15,
      shortLabels: true,
    };
  }
  const compact = width < 480;
  return {
    pitch: compact ? 60 : 68,
    topPad: 12,
    armThickness: 5,
    chipHeight: compact ? 30 : 32,
    bedHeight: compact ? 46 : 50,
    bedGap: 8,
    wheelR: compact ? 13 : 15,
    captionH: 26,
    gutter: compact ? 30 : 68,
    padRight: compact ? 4 : 8,
    postCm: 8,
    minChipPx: 44,
    slotChipGap: 2,
    chipScale: compact ? 1.3 : 1.15,
    shortLabels: compact,
  };
}

/** A four's beam: the size of the empty-lane outline and the lane count reference. */
const SLOT_BEAM_CM = 52;
/** Rough width of a caption character at 12 px, for keeping captions apart. */
const CAPTION_CHAR_PX = 6.4;

interface Span {
  x1: number;
  x2: number;
}

/**
 * Horizontal placement of every shelf in cm, and the lane direction. Shelves sharing a tier
 * and column continue outward from the anchor, so nothing overlaps even when misconfigured.
 */
function shelfSpans(
  trailer: TrailerDef,
  shelves: readonly ShelfState[],
  postCm: number,
): { spans: Map<Id, Span & { lane0: 'start' | 'end'; stop: 'x1' | 'x2' | null }>; posts: Span[] } {
  const W = Math.max(0, trailer.widthCm);
  const spans = new Map<Id, Span & { lane0: 'start' | 'end'; stop: 'x1' | 'x2' | null }>();
  const cursors = new Map<string, number>();
  const cursor = (tier: number, key: string, start: number) => {
    const k = `${tier}:${key}`;
    return cursors.get(k) ?? start;
  };
  const setCursor = (tier: number, key: string, v: number) => cursors.set(`${tier}:${key}`, v);

  const fullByTier = new Map<number, ShelfState[]>();
  for (const s of shelves) {
    if (s.def.columnKey !== 'full') continue;
    fullByTier.set(s.def.tier, [...(fullByTier.get(s.def.tier) ?? []), s]);
  }
  const fullStart = new Map<number, number>();
  for (const [tier, list] of fullByTier) {
    const total = list.reduce((t, s) => t + Math.max(0, s.def.widthCm), 0);
    fullStart.set(tier, (W - total) / 2);
  }

  let posts: Span[];
  if (trailer.style === 'goalpost') {
    posts = [
      { x1: -postCm, x2: 0 },
      { x1: W, x2: W + postCm },
    ];
    for (const s of shelves) {
      const w = Math.max(0, s.def.widthCm);
      const { tier, columnKey } = s.def;
      if (columnKey === 'left') {
        const c = cursor(tier, 'left', 0);
        spans.set(s.def.id, { x1: c, x2: c + w, lane0: 'start', stop: 'x2' });
        setCursor(tier, 'left', c + w);
      } else if (columnKey === 'right') {
        const c = cursor(tier, 'right', W);
        spans.set(s.def.id, { x1: c - w, x2: c, lane0: 'end', stop: 'x1' });
        setCursor(tier, 'right', c - w);
      } else {
        const c = cursor(tier, 'full', fullStart.get(tier) ?? 0);
        spans.set(s.def.id, { x1: c, x2: c + w, lane0: 'start', stop: null });
        setCursor(tier, 'full', c + w);
      }
    }
  } else {
    const pct = trailer.style === 'offset_post' ? (trailer.postOffsetPct ?? 33) : 50;
    const postX = (W * Math.min(100, Math.max(0, pct))) / 100;
    const postL = postX - postCm / 2;
    const postR = postX + postCm / 2;
    posts = [{ x1: postL, x2: postR }];
    for (const s of shelves) {
      const w = Math.max(0, s.def.widthCm);
      const { tier, columnKey } = s.def;
      if (columnKey === 'left') {
        const c = cursor(tier, 'left', postL);
        spans.set(s.def.id, { x1: c - w, x2: c, lane0: 'end', stop: 'x1' });
        setCursor(tier, 'left', c - w);
      } else if (columnKey === 'right') {
        const c = cursor(tier, 'right', postR);
        spans.set(s.def.id, { x1: c, x2: c + w, lane0: 'start', stop: 'x2' });
        setCursor(tier, 'right', c + w);
      } else {
        const c = cursor(tier, 'full', fullStart.get(tier) ?? 0);
        spans.set(s.def.id, { x1: c, x2: c + w, lane0: 'start', stop: null });
        setCursor(tier, 'full', c + w);
      }
    }
  }
  return { spans, posts };
}

export interface EndViewGeometryInput {
  trailer: TrailerDef;
  /** Effective shelves (`effectiveShelvesFor`); defaults to the definition's own. */
  shelves?: readonly ShelfState[];
  /** Placements, so a lane a boat sits in is drawn even past the shelf's lane slots. */
  placements?: readonly EndViewCell[];
  /** Drawing width in px. */
  width: number;
  size?: EndViewSize;
}

/** The whole drawing, in px from the top-left corner. */
export function endViewGeometry(input: EndViewGeometryInput): EndViewGeometry {
  const { trailer, placements = [] } = input;
  const size = input.size ?? 'full';
  const width = Math.max(size === 'thumb' ? 40 : 200, Math.round(input.width));
  const spec = sizeSpec(size, width);
  const states: ShelfState[] =
    input.shelves?.slice() ??
    trailer.shelves.map((def) => ({ def, active: def.active, laneSlots: 1 }));
  const drawable = states.filter((s) => Number.isFinite(s.def.tier));

  const usedLanes = new Map<Id, number>();
  for (const p of placements) {
    usedLanes.set(p.shelfId, Math.max(usedLanes.get(p.shelfId) ?? -1, p.lane));
  }

  // Horizontal scale.
  const { spans, posts: postSpans } = shelfSpans(trailer, drawable, spec.postCm);
  const W = Math.max(0, trailer.widthCm);
  let minX = 0;
  let maxX = Math.max(W, 1);
  for (const s of spans.values()) {
    minX = Math.min(minX, s.x1);
    maxX = Math.max(maxX, s.x2);
  }
  for (const p of postSpans) {
    minX = Math.min(minX, p.x1);
    maxX = Math.max(maxX, p.x2);
  }
  const gutter = spec.gutter;
  const usable = Math.max(20, width - gutter - spec.padRight);
  const pxPerCm = usable / Math.max(1, maxX - minX);
  const X = (cm: number) => gutter + (cm - minX) * pxPerCm;

  // Tiers, top to bottom.
  const tierNumbers = [...new Set(drawable.map((s) => s.def.tier))].sort((a, b) => b - a);
  const tiers: TierGeometry[] = tierNumbers.map((tier, i) => {
    const top = spec.topPad + i * spec.pitch;
    const bottom = top + spec.pitch;
    const armY = bottom - spec.armThickness;
    const label = tierLabel(trailer, tier);
    return {
      tier,
      label,
      shortLabel: spec.shortLabels ? String(tier) : label,
      top,
      bottom,
      armY,
      labelY: armY - spec.armThickness / 2 - spec.chipHeight / 2 - 1,
    };
  });
  const tierByNumber = new Map(tiers.map((t) => [t.tier, t]));
  const racksBottom = spec.topPad + Math.max(1, tiers.length) * spec.pitch;

  // Shelves and lanes.
  const shelves: ShelfGeometry[] = drawable.map((s) => {
    const span = spans.get(s.def.id)!;
    const t = tierByNumber.get(s.def.tier)!;
    const laneCount = Math.max(1, s.laneSlots, (usedLanes.get(s.def.id) ?? -1) + 1);
    const x1 = X(span.x1);
    const x2 = X(span.x2);
    const laneW = (x2 - x1) / laneCount;
    const armTop = t.armY - spec.armThickness / 2;
    const rectTop = t.top + 2;
    const rect: Rect = { x: x1, y: rectTop, width: x2 - x1, height: armTop - rectTop };
    const slotW = Math.min(
      Math.max(0, laneW - 4),
      Math.max(spec.minChipPx, SLOT_BEAM_CM * pxPerCm * spec.chipScale),
    );
    const lanes: LaneGeometry[] = Array.from({ length: laneCount }, (_, lane) => {
      const fromStart = span.lane0 === 'start' ? lane : laneCount - 1 - lane;
      const lx = x1 + fromStart * laneW;
      const outer =
        s.def.columnKey === 'full' ? lane === 0 || lane === laneCount - 1 : lane === laneCount - 1;
      return {
        shelfId: s.def.id,
        lane,
        rect: { x: lx, y: rectTop, width: laneW, height: armTop - rectTop },
        slot: {
          x: lx + (laneW - slotW) / 2,
          y: armTop - spec.slotChipGap - spec.chipHeight,
          width: slotW,
          height: spec.chipHeight,
        },
        outer,
        loadOrder: s.def.laneAccess === 'outer_first' && laneCount > 1 ? lane + 1 : null,
        showLoadOrder: false,
      };
    });
    let armX1 = x1;
    let armX2 = x2;
    if (trailer.style === 'goalpost' && s.def.columnKey === 'full') {
      // A goalpost crossbar spans between the uprights whatever width the shelf uses.
      armX1 = Math.min(x1, X(0));
      armX2 = Math.max(x2, X(W));
    }
    return {
      shelf: s.def,
      active: s.active,
      laneCount,
      arm: { x1: armX1, x2: armX2, y: t.armY, thickness: spec.armThickness },
      stopX: span.stop === null ? null : span.stop === 'x1' ? x1 : x2,
      rect,
      lanes,
      laneWidthCm: Math.max(0, s.def.widthCm) / laneCount,
    };
  });

  // Load order reads like a column heading: shown on the top shelf of each run of alike
  // shelves in a column (same side, span, and lane count), not repeated on every level.
  const byColumn = new Map<string, ShelfGeometry[]>();
  for (const sg of shelves) {
    if (sg.lanes[0]?.loadOrder == null) continue;
    const k = `${sg.shelf.columnKey}:${Math.round(sg.rect.x)}:${Math.round(sg.rect.width)}:${sg.laneCount}`;
    byColumn.set(k, [...(byColumn.get(k) ?? []), sg]);
  }
  for (const list of byColumn.values()) {
    const top = list.reduce((a, b) => (b.shelf.tier > a.shelf.tier ? b : a));
    for (const lane of top.lanes) lane.showLoadOrder = true;
  }

  // Uprights run from above the top arm down to the bed.
  const bedTop = racksBottom + spec.bedGap;
  const postTop = Math.max(0, spec.topPad - (size === 'thumb' ? 2 : 8));
  const posts: Rect[] = postSpans.map((p) => ({
    x: X(p.x1),
    y: postTop,
    width: Math.max(size === 'thumb' ? 1.5 : 4, (p.x2 - p.x1) * pxPerCm),
    height: bedTop - postTop,
  }));

  // Bed, compartments, wheels.
  const frame = { x1: X(0), x2: X(W) };
  const bed: Rect = {
    x: frame.x1,
    y: bedTop,
    width: frame.x2 - frame.x1,
    height: spec.bedHeight,
  };
  const inset = size === 'thumb' ? 1 : 4;
  const comps = trailer.compartments;
  const compW = comps.length > 0 ? (bed.width - inset * (comps.length + 1)) / comps.length : 0;
  const compartments: CompartmentGeometry[] = comps.map((c, i) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    rect: {
      x: bed.x + inset + i * (compW + inset),
      y: bed.y + inset,
      width: Math.max(0, compW),
      height: bed.height - inset * 2,
    },
  }));
  const r = spec.wheelR;
  const wheelCy = bed.y + bed.height + r * 0.45;
  const wheels = [0.2, 0.8].map((f) => ({
    cx: frame.x1 + (frame.x2 - frame.x1) * f,
    cy: wheelCy,
    r,
  }));
  const groundY = wheelCy + r;

  // Captions: side names under each column, the post between them, kept apart.
  const captions: Caption[] = [];
  const captionY = groundY + 18;
  if (size === 'full' && trailer.style !== 'goalpost' && posts[0]) {
    const post = posts[0];
    const postMid = post.x + post.width / 2;
    const names = sideNamesOf(trailer);
    const sideCaption = (key: 'left' | 'right') => {
      const list = shelves.filter((s) => s.shelf.columnKey === key);
      if (list.length === 0) return null;
      const outerFirst = list.every((s) => s.shelf.laneAccess === 'outer_first');
      const text = `${names[key][0]!.toUpperCase()}${names[key].slice(1)}${outerFirst ? ' (outer first)' : ''}`;
      const x1 = Math.min(...list.map((s) => s.rect.x));
      const x2 = Math.max(...list.map((s) => s.rect.x + s.rect.width));
      return { text, mid: (x1 + x2) / 2, w: text.length * CAPTION_CHAR_PX };
    };
    const left = sideCaption('left');
    const right = sideCaption('right');
    const postText = 'Post';
    const postHalf = (postText.length * CAPTION_CHAR_PX) / 2 + 8;
    if (left) {
      // Centered under the column, pushed left so it stays clear of the post caption.
      const end = Math.min(left.mid + left.w / 2, postMid - postHalf);
      captions.push({ text: left.text, x: end, align: 'end' });
    }
    captions.push({ text: postText, x: postMid, align: 'middle' });
    if (right) {
      const start = Math.max(right.mid - right.w / 2, postMid + postHalf);
      captions.push({ text: right.text, x: start, align: 'start' });
    }
  }

  const height = Math.ceil(
    groundY + (captions.length > 0 ? spec.captionH : size === 'thumb' ? 1 : 6),
  );

  return {
    size,
    width,
    height,
    pxPerCm,
    gutter,
    tierHeading:
      spec.shortLabels && size === 'full' && tiers.length > 0 ? tierHeadingOf(trailer) : null,
    frame,
    posts,
    tiers,
    shelves,
    bed,
    compartments,
    wheels,
    groundY,
    captions,
    captionY,
    chipHeight: spec.chipHeight,
    chipScale: spec.chipScale,
  };
}

function tierHeadingOf(trailer: TrailerDef): string {
  const word = tierWordOf(trailer);
  return word[0]!.toUpperCase() + word.slice(1);
}

/** The boat facts chip sizing needs. */
export interface ChipBoat {
  shellId: Id;
  beamCm: number;
}

/**
 * Chips in one lane, sitting on the arm and sized by beam. Boats end to end in a lane (two
 * singles, say) share it side by side, front of the trailer first.
 */
export function laneChips(
  lane: LaneGeometry,
  boats: readonly ChipBoat[],
  geometry: Pick<EndViewGeometry, 'pxPerCm' | 'chipHeight' | 'size' | 'chipScale'>,
): { shellId: Id; rect: Rect }[] {
  if (boats.length === 0) return [];
  const gap = geometry.size === 'thumb' ? 1 : 3;
  const room = Math.max(0, lane.rect.width - (geometry.size === 'thumb' ? 1 : 4));
  const each = (room - gap * (boats.length - 1)) / boats.length;
  const minPx = geometry.size === 'thumb' ? 3 : 44;
  const widths = boats.map((b) =>
    Math.max(0, Math.min(each, Math.max(minPx, b.beamCm * geometry.pxPerCm * geometry.chipScale))),
  );
  const total = widths.reduce((t, w) => t + w, 0) + gap * (boats.length - 1);
  let x = lane.rect.x + (lane.rect.width - total) / 2;
  const y = lane.slot.y;
  return boats.map((b, i) => {
    const rect = { x, y, width: widths[i]!, height: geometry.chipHeight };
    x += widths[i]! + gap;
    return { shellId: b.shellId, rect };
  });
}

/** Absolute positioning for an overlay on the drawing (lane drop targets, chips). */
export function rectStyle(rect: Rect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}
