import { describe, expect, it } from 'vitest';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  effectiveShelvesFor,
  makeRule,
  type ShelfDef,
  type TrailerDef,
} from '@regatta-ops/domain';
import { endViewGeometry, laneChips, type EndViewGeometry, type ShelfGeometry } from './geometry';
import { cellLabel, laneLabel, sideNamesOf, tierLabel } from './labels';

function shelfDef(
  id: string,
  label: string,
  tier: number,
  columnKey: ShelfDef['columnKey'],
  widthCm: number,
): ShelfDef {
  return {
    id,
    label,
    tier,
    columnKey,
    widthCm,
    lengthCm: 1250,
    frontOverhangMaxCm: 500,
    rearOverhangMaxCm: 300,
    laneAccess: 'any',
    accessRank: tier,
    active: true,
  };
}

/** A 41 ft goalpost trailer, three wide by five racks (§16.2). */
const GOALPOST: TrailerDef = {
  id: 'g',
  name: 'Goalpost',
  style: 'goalpost',
  frameLengthCm: 1250,
  widthCm: 240,
  shelves: [1, 2, 3, 4, 5].map((t) => shelfDef(`g${t}`, `Rack ${t}`, t, 'full', 240)),
  compartments: [{ id: 'box', kind: 'oar_box', label: 'Oar box', capacity: 64 }],
};

/** A center-post trailer with one hull a side on four racks. */
const CENTER: TrailerDef = {
  id: 'c',
  name: 'Center',
  style: 'center_post',
  frameLengthCm: 1250,
  widthCm: 240,
  shelves: [1, 2, 3, 4].flatMap((t) => [
    shelfDef(`c${t}l`, `Rack ${t}, driver side`, t, 'left', 100),
    shelfDef(`c${t}r`, `Rack ${t}, curb side`, t, 'right', 100),
  ]),
  compartments: [],
};

function geo(trailer: TrailerDef, width = 600, rules = SRA_DEFAULT_RULES, extra = {}) {
  return endViewGeometry({
    trailer,
    shelves: effectiveShelvesFor(trailer, rules),
    width,
    ...extra,
  });
}

function shelf(g: EndViewGeometry, id: string): ShelfGeometry {
  const s = g.shelves.find((x) => x.shelf.id === id);
  if (!s) throw new Error(`no shelf ${id}`);
  return s;
}

const right = (r: { x: number; width: number }) => r.x + r.width;

describe('endViewGeometry: offset post (SRA)', () => {
  const g = geo(SRA_BOYS_TRAILER);

  it('stands one post a third of the way across the bed', () => {
    expect(g.posts).toHaveLength(1);
    const post = g.posts[0]!;
    const mid = post.x + post.width / 2;
    const at = (mid - g.frame.x1) / (g.frame.x2 - g.frame.x1);
    expect(at).toBeCloseTo(0.33, 2);
  });

  it('puts the narrow side left of the post and the wide side right, to scale', () => {
    const post = g.posts[0]!;
    const l5 = shelf(g, 'l5');
    const r5 = shelf(g, 'r5');
    expect(right(l5.rect)).toBeCloseTo(post.x, 5);
    expect(r5.rect.x).toBeCloseTo(right(post), 5);
    // 75 cm and 150 cm: the wide side is twice the narrow side.
    expect(r5.rect.width / l5.rect.width).toBeCloseTo(2, 5);
    expect(l5.rect.width).toBeCloseTo(75 * g.pxPerCm, 5);
  });

  it('gives the narrow side one lane and the wide side two, lane 0 by the post', () => {
    expect(shelf(g, 'l3').laneCount).toBe(1);
    const r3 = shelf(g, 'r3');
    expect(r3.laneCount).toBe(2);
    const [inner, outer] = r3.lanes;
    expect(inner!.rect.x).toBeLessThan(outer!.rect.x);
    expect(inner!.outer).toBe(false);
    expect(outer!.outer).toBe(true);
    expect([inner!.loadOrder, outer!.loadOrder]).toEqual([1, 2]);
  });

  it('draws the load order once, on the top level', () => {
    expect(shelf(g, 'r5').lanes.every((l) => l.showLoadOrder)).toBe(true);
    expect(shelf(g, 'r4').lanes.some((l) => l.showLoadOrder)).toBe(false);
    expect(shelf(g, 'l5').lanes[0]!.loadOrder).toBeNull();
  });

  it('stacks the tiers top down with the arm under each lane', () => {
    expect(g.tiers.map((t) => t.tier)).toEqual([5, 4, 3, 2, 1]);
    for (let i = 1; i < g.tiers.length; i++) {
      expect(g.tiers[i]!.top).toBeGreaterThan(g.tiers[i - 1]!.top);
    }
    const s = shelf(g, 'r2');
    for (const lane of s.lanes) {
      expect(lane.rect.y + lane.rect.height).toBeLessThanOrEqual(s.arm.y);
      expect(lane.slot.y + lane.slot.height).toBeLessThanOrEqual(s.arm.y);
    }
    expect(g.bed.y).toBeGreaterThan(g.tiers[g.tiers.length - 1]!.armY);
  });

  it('shows the bed from the back: the riggers across its width, the zones ahead named', () => {
    // SRA's riggers fill the back of the bed (PLAN.md §4.9); slings and oars ride ahead of them.
    expect(g.compartments.map((c) => c.label)).toEqual(['Riggers']);
    const [riggers] = g.compartments;
    expect(riggers!.rect.x).toBeCloseTo(g.bed.x + 4, 5);
    expect(riggers!.rect.width).toBeCloseTo(g.bed.width - 8, 5);
    expect(g.bedCaption?.text).toBe('Slings and oars ahead');
    // The name sits above the caption, both inside the bed.
    expect(riggers!.labelRect.y + riggers!.labelRect.height).toBeLessThanOrEqual(
      g.bedCaption!.rect.y,
    );
    expect(g.bedCaption!.rect.y + g.bedCaption!.rect.height).toBeLessThanOrEqual(
      g.bed.y + g.bed.height,
    );
    // Legible on a phone: the caption fits the bed at 390 px.
    const phone = geo(SRA_BOYS_TRAILER, 358);
    expect(phone.bedCaption!.rect.width).toBeGreaterThan('Oars and slings ahead'.length * 6.4);
    expect(phone.bedCaption!.rect.height).toBeGreaterThanOrEqual(14);
    // The thumbnail draws the zone but no words.
    const thumb = endViewGeometry({ trailer: SRA_BOYS_TRAILER, width: 112, size: 'thumb' });
    expect(thumb.compartments).toHaveLength(1);
    expect(thumb.bedCaption).toBeNull();
  });

  it('puts compartments that run the whole length side by side, as before', () => {
    const two: TrailerDef = {
      ...GOALPOST,
      compartments: [
        { id: 'box', kind: 'oar_box', label: 'Oar box', capacity: 64 },
        { id: 'rig', kind: 'rigger_rack', label: 'Rigger rack', capacity: 40 },
      ],
    };
    const g2 = geo(two);
    expect(g2.compartments.map((c) => c.label)).toEqual(['Oar box', 'Rigger rack']);
    expect(g2.compartments[1]!.rect.x).toBeGreaterThan(
      g2.compartments[0]!.rect.x + g2.compartments[0]!.rect.width,
    );
    expect(g2.bedCaption).toBeNull();
    expect(g2.compartments[0]!.labelRect).toEqual(g2.compartments[0]!.rect);
  });

  it('captions the sides and the post without overlap', () => {
    const texts = g.captions.map((c) => c.text);
    expect(texts).toEqual(['Narrow side', 'Post', 'Wide side (outer first)']);
    const [l, p, r] = g.captions;
    expect(l!.align).toBe('end');
    expect(l!.x).toBeLessThan(p!.x);
    expect(r!.x).toBeGreaterThan(p!.x);
  });

  it('shows "Level 5" at full width and the number under a heading when narrow', () => {
    expect(g.tiers[0]!.shortLabel).toBe('Level 5');
    expect(g.tierHeading).toBeNull();
    const narrow = geo(SRA_BOYS_TRAILER, 330);
    expect(narrow.tiers[0]!.shortLabel).toBe('5');
    expect(narrow.tierHeading).toBe('Level');
    expect(narrow.width).toBe(330);
    // Every lane still fits inside the drawing.
    for (const s of narrow.shelves) expect(right(s.rect)).toBeLessThanOrEqual(330);
  });

  it('marks shelves turned off by a rule', () => {
    const off = geo(SRA_BOYS_TRAILER, 600, [
      ...SRA_DEFAULT_RULES,
      makeRule('shelf-off', { shelfIds: ['l1'] }),
    ]);
    expect(shelf(off, 'l1').active).toBe(false);
    expect(shelf(off, 'r1').active).toBe(true);
  });

  it('draws a lane a placement needs even past the computed lanes', () => {
    const g2 = geo(SRA_BOYS_TRAILER, 600, SRA_DEFAULT_RULES, {
      placements: [{ shelfId: 'r3', lane: 2 }],
    });
    expect(shelf(g2, 'r3').laneCount).toBe(3);
  });
});

describe('endViewGeometry: center post and goalpost', () => {
  it('centers the post with arms both sides', () => {
    const g = geo(CENTER);
    const post = g.posts[0]!;
    const mid = post.x + post.width / 2;
    expect((mid - g.frame.x1) / (g.frame.x2 - g.frame.x1)).toBeCloseTo(0.5, 5);
    const [left, rightShelf] = g.shelves.filter((s) => s.shelf.tier === 4);
    expect(right(left!.rect)).toBeCloseTo(post.x, 5);
    expect(rightShelf!.rect.x).toBeCloseTo(right(post), 5);
    expect(g.captions.map((c) => c.text)).toEqual(['Left side', 'Post', 'Right side']);
  });

  it('stands two uprights at the edges with crossbars and three lanes across', () => {
    const g = geo(GOALPOST);
    expect(g.posts).toHaveLength(2);
    expect(right(g.posts[0]!)).toBeCloseTo(g.frame.x1, 5);
    expect(g.posts[1]!.x).toBeCloseTo(g.frame.x2, 5);
    for (const s of g.shelves) {
      expect(s.laneCount).toBe(3);
      expect(s.arm.x1).toBeLessThanOrEqual(g.frame.x1 + 1e-6);
      expect(s.arm.x2).toBeGreaterThanOrEqual(g.frame.x2 - 1e-6);
      expect(s.lanes[0]!.rect.x).toBeLessThan(s.lanes[2]!.rect.x);
    }
    expect(g.captions).toEqual([]);
  });

  it('draws a small thumb', () => {
    const g = endViewGeometry({ trailer: SRA_BOYS_TRAILER, width: 112, size: 'thumb' });
    expect(g.width).toBe(112);
    expect(g.height).toBeLessThan(110);
    expect(g.captions).toEqual([]);
  });
});

describe('laneChips', () => {
  const g = geo(SRA_BOYS_TRAILER, 800);
  const lane = shelf(g, 'r5').lanes[1]!;

  it('sizes a chip by beam and rests it on the arm', () => {
    const [eight] = laneChips(lane, [{ shellId: 'e', beamCm: 57 }], g);
    const [single] = laneChips(lane, [{ shellId: 's', beamCm: 28 }], g);
    expect(eight!.rect.width).toBeGreaterThan(single!.rect.width);
    expect(eight!.rect.width).toBeLessThanOrEqual(lane.rect.width);
    expect(eight!.rect.y + eight!.rect.height).toBeCloseTo(lane.slot.y + lane.slot.height, 5);
    expect(eight!.rect.x).toBeGreaterThanOrEqual(lane.rect.x);
  });

  it('shares a lane between boats end to end without overlap', () => {
    const chips = laneChips(
      lane,
      [
        { shellId: 'a', beamCm: 28 },
        { shellId: 'b', beamCm: 28 },
      ],
      g,
    );
    expect(chips).toHaveLength(2);
    expect(right(chips[0]!.rect)).toBeLessThan(chips[1]!.rect.x);
    expect(right(chips[1]!.rect)).toBeLessThanOrEqual(right(lane.rect) + 1e-6);
  });
});

describe('labels', () => {
  it('names tiers, sides, and lanes the way coaches do', () => {
    expect(tierLabel(SRA_BOYS_TRAILER, 5)).toBe('Level 5');
    expect(tierLabel(GOALPOST, 2)).toBe('Rack 2');
    expect(sideNamesOf(SRA_BOYS_TRAILER)).toEqual({ left: 'narrow side', right: 'wide side' });
    expect(laneLabel(1, 2)).toBe('outer lane');
    expect(laneLabel(0, 1)).toBeNull();
    expect(laneLabel(2, 3)).toBe('lane 3');
    const r5 = SRA_BOYS_TRAILER.shelves.find((s) => s.id === 'r5')!;
    expect(cellLabel(SRA_BOYS_TRAILER, r5, 1, 2)).toBe('Level 5, wide side, outer lane');
    expect(cellLabel(GOALPOST, GOALPOST.shelves[0]!, 0, 3)).toBe('Rack 1, lane 1');
  });
});
