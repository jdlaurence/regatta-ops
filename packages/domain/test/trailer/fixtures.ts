// Trailer packer fixtures (PLAN.md §9.3.5). Boat names are equipment names from
// data/reference; no athlete names anywhere.

import {
  BOAT_CLASS_SPECS,
  makeRule,
  type BoatClass,
  type ColumnKey,
  type PackBoat,
  type PackResult,
  type Rule,
  type ShelfDef,
  type TrailerDef,
} from '../../src';

export function boat(name: string, cls: BoatClass, extra: Partial<PackBoat> = {}): PackBoat {
  const spec = BOAT_CLASS_SPECS[cls];
  return {
    shellId: `sh_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    name,
    cls,
    teamId: 'team_boys',
    teamName: 'Junior boys',
    lengthCm: spec.defaultLengthCm,
    beamCm: spec.defaultBeamCm,
    weightKg: spec.defaultWeightKg,
    ...extra,
  };
}

export function shelf(
  id: string,
  label: string,
  tier: number,
  columnKey: ColumnKey,
  extra: Partial<ShelfDef> = {},
): ShelfDef {
  return {
    id,
    label,
    tier,
    columnKey,
    widthCm: 240,
    lengthCm: 1250,
    frontOverhangMaxCm: 250,
    rearOverhangMaxCm: 300,
    laneAccess: 'any',
    accessRank: tier,
    active: true,
    ...extra,
  };
}

export function trailer(
  id: string,
  shelves: ShelfDef[],
  extra: Partial<TrailerDef> = {},
): TrailerDef {
  return {
    id,
    name: id,
    style: 'goalpost',
    frameLengthCm: 1250,
    widthCm: 240,
    shelves,
    compartments: [],
    ...extra,
  };
}

/**
 * Cases 1–2: a 41 ft (1250 cm), three-wide, five-level goalpost trailer. Levels 3 to 5 take an
 * eight (1250 + 500 + 300 = 2050 cm); levels 1 and 2 only take fours (1250 + 100 + 100 = 1450).
 * With 20 cm clearance a 240 cm shelf fits three eights or three fours side by side (§9.3.2).
 */
export const GOALPOST_41FT: TrailerDef = trailer(
  'trl_goalpost',
  [1, 2, 3, 4, 5].map((tier) =>
    shelf(`g${tier}`, tier === 5 ? 'Top rack' : `Rack ${tier}`, tier, 'full', {
      frontOverhangMaxCm: tier >= 3 ? 500 : 100,
      rearOverhangMaxCm: tier >= 3 ? 300 : 100,
    }),
  ),
);

/** A center-post trailer with named racks, for rule sentences and side balance (cases 6, 11). */
export const CENTER_POST: TrailerDef = trailer(
  'trl_center',
  [
    shelf('bl', 'Bottom rack, driver side', 1, 'left', { widthCm: 80 }),
    shelf('br', 'Bottom rack, curb side', 1, 'right', { widthCm: 80 }),
    shelf('ml', 'Middle rack, driver side', 2, 'left', { widthCm: 80 }),
    shelf('mr', 'Middle rack, curb side', 2, 'right', { widthCm: 80 }),
    shelf('tl', 'Top rack, driver side', 3, 'left', { widthCm: 80, frontOverhangMaxCm: 500 }),
    shelf('tr', 'Top rack, curb side', 3, 'right', { widthCm: 80, frontOverhangMaxCm: 500 }),
  ],
  { style: 'center_post' },
);

/** Case 3: one shelf with 18.0 m usable length (1200 + 300 + 300) and room for two singles across. */
export const SINGLES_SHELF: TrailerDef = trailer('trl_singles', [
  shelf('s1', 'Level 1', 1, 'full', {
    widthCm: 100,
    lengthCm: 1200,
    frontOverhangMaxCm: 300,
    rearOverhangMaxCm: 300,
  }),
]);

/** Case 3, one lane only (60 cm across). */
export const SINGLES_ONE_LANE: TrailerDef = trailer('trl_singles_1', [
  { ...SINGLES_SHELF.shelves[0]!, widthCm: 60 },
]);

/** Case 4: a 150 cm shelf where computed lanes for fours are 2. */
export const WIDE_SIDE: TrailerDef = trailer('trl_wide', [
  shelf('w1', 'Level 1, wide side', 1, 'right', { widthCm: 150, lengthCm: 1220 }),
]);

/** Case 5: two tiers, one lane each, both long enough for an eight. */
export const TWO_TIER: TrailerDef = trailer('trl_two', [
  shelf('t1', 'Bottom rack', 1, 'full', { widthCm: 80, frontOverhangMaxCm: 500 }),
  shelf('t2', 'Top rack', 2, 'full', { widthCm: 80, frontOverhangMaxCm: 500 }),
]);

/** Case 8: two one-lane shelves on the same tier; the second is easier to reach. */
export const TWO_ACCESS: TrailerDef = trailer('trl_access', [
  shelf('hard', 'Level 1, far side', 1, 'left', { widthCm: 80, accessRank: 2 }),
  shelf('easy', 'Level 1, near side', 1, 'right', { widthCm: 80, accessRank: 1 }),
]);

/** Case 13: one outer-first shelf with two lanes for fours. */
export const OUTER_FIRST: TrailerDef = trailer('trl_outer', [
  shelf('r1', 'Level 1, wide side', 1, 'right', {
    widthCm: 150,
    lengthCm: 1220,
    laneAccess: 'outer_first',
  }),
]);

export const BOYS_EIGHTS = ['Peggy', 'LLL', 'Waltar', 'Woodman', 'Sonic', 'DeReck', 'DonQ'];
export const BOYS_FOURS = ['Thursday', 'Kokanee', 'Dan', 'Alma', 'Spencer'];

/** The boys' 2026 Regionals load (data/reference/trailer-layout-2026-regionals.md). */
export function boysLoad(): PackBoat[] {
  return [...BOYS_EIGHTS.map((n) => boat(n, '8+')), ...BOYS_FOURS.map((n) => boat(n, '4+'))];
}

export const rule = makeRule;

export function soft(type: Rule['type'], weight: 1 | 2 | 3 = 2, params: object = {}): Rule {
  return { ...makeRule(type, params as never, 'trailer'), weight } as Rule;
}

/** Placement of a shell in a pack result. */
export function where(result: PackResult, shellId: string) {
  return result.placements.find((p) => p.shellId === shellId);
}

/** Class grid by level, top to bottom: [narrow side, wide side lanes...]. */
export function classGrid(
  t: TrailerDef,
  boats: PackBoat[],
  result: PackResult,
  prefix = '',
): string[][] {
  const tiers = [...new Set(t.shelves.map((s) => s.tier))].sort((a, b) => b - a);
  return tiers.map((tier) =>
    ['l', 'r'].flatMap((side) =>
      result.placements
        .filter((p) => p.shelfId === `${prefix}${side}${tier}`)
        .sort((a, b) => a.lane - b.lane)
        .map((p) => boats.find((b) => b.shellId === p.shellId)!.cls as string),
    ),
  );
}
