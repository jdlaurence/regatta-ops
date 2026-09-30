// SRA's two trailers and the default rule set (PLAN.md §4.9, §14, §17.1, §17.2).
// Dimensions are placeholders until measured (PLAN.md §15 Q1).
//
// Amendment to §14/§17.1 (recorded in PLAN.md §17.1): the plan's placeholder overhangs
// (1220 + 450 front + 300 rear = 1970 cm) are shorter than an eight (1990 cm, §16.1), so no
// eight could be placed. The upper levels here allow enough front overhang for an eight with
// a little slack. The 2026 layout puts an eight on level 3 of the boys' trailer and on level 2
// of the girls', so those levels get the long overhang too. Revisit once measured (§15 Q1).

import type { Rule, ShelfDef, TrailerDef } from './types';

interface LevelOverhang {
  front: number;
  rear: number;
}

function offsetPostShelves(
  prefix: string,
  lengthCm: number,
  overhangs: Record<number, LevelOverhang>,
): ShelfDef[] {
  const shelves: ShelfDef[] = [];
  for (let tier = 1; tier <= 5; tier++) {
    const oh = overhangs[tier]!;
    const name = tier === 5 ? 'Top level' : `Level ${tier}`;
    shelves.push({
      id: `${prefix}l${tier}`,
      label: `${name}, narrow side`,
      tier,
      columnKey: 'left',
      widthCm: 75,
      lengthCm,
      frontOverhangMaxCm: oh.front,
      rearOverhangMaxCm: oh.rear,
      laneAccess: 'any',
      accessRank: tier,
      active: true,
    });
    shelves.push({
      id: `${prefix}r${tier}`,
      label: `${name}, wide side`,
      tier,
      columnKey: 'right',
      widthCm: 150,
      lengthCm,
      frontOverhangMaxCm: oh.front,
      rearOverhangMaxCm: oh.rear,
      laneAccess: 'outer_first',
      accessRank: tier,
      active: true,
    });
  }
  return shelves;
}

const LOW: LevelOverhang = { front: 250, rear: 300 };
/** Boys: 1220 + 500 + 300 = 2020 cm usable, fits a 1990 cm eight. */
const BOYS_HIGH: LevelOverhang = { front: 500, rear: 300 };
/** Girls: 1070 + 600 + 350 = 2020 cm usable. */
const GIRLS_HIGH: LevelOverhang = { front: 600, rear: 350 };

/** Seeded "Boys trailer" (§17.1). Shelf ids: l1..l5 (narrow), r1..r5 (wide). */
export const SRA_BOYS_TRAILER: TrailerDef = {
  id: 'trl_boys',
  name: 'Boys trailer',
  style: 'offset_post',
  postOffsetPct: 33,
  frameLengthCm: 1220,
  widthCm: 240,
  bowForwardDefault: false,
  shelves: offsetPostShelves('', 1220, {
    1: LOW,
    2: LOW,
    3: BOYS_HIGH,
    4: BOYS_HIGH,
    5: BOYS_HIGH,
  }),
  compartments: [
    { id: 'bed', kind: 'bed', label: 'Trailer bed: riggers, oars, slings', capacity: 1 },
    { id: 'oars', kind: 'oar_rack', label: 'Oar rack', capacity: 64 },
  ],
};

/** Seeded "Girls trailer": same geometry, shorter frame (1070 cm). Shelf ids gl1..gl5, gr1..gr5. */
export const SRA_GIRLS_TRAILER: TrailerDef = {
  id: 'trl_girls',
  name: 'Girls trailer',
  style: 'offset_post',
  postOffsetPct: 33,
  frameLengthCm: 1070,
  widthCm: 240,
  bowForwardDefault: false,
  shelves: offsetPostShelves('g', 1070, {
    1: LOW,
    2: GIRLS_HIGH,
    3: GIRLS_HIGH,
    4: GIRLS_HIGH,
    5: GIRLS_HIGH,
  }),
  compartments: [
    { id: 'gbed', kind: 'bed', label: 'Trailer bed: riggers, oars, slings', capacity: 1 },
    { id: 'goars', kind: 'oar_rack', label: 'Oar rack', capacity: 48 },
  ],
};

/** Default rule set for SRA's trailers (§9.3.3, §17.2 without the regatta-only override). */
export const SRA_DEFAULT_RULES: Rule[] = [
  {
    id: 'r_fit',
    type: 'fit',
    hard: true,
    weight: 3,
    enabled: true,
    origin: 'trailer',
    params: { clearanceCm: 15, gapCm: 30 },
  },
  {
    id: 'r_eights_top',
    type: 'class-tier',
    hard: false,
    weight: 3,
    enabled: true,
    origin: 'trailer',
    params: { classes: ['8+'], tiers: [5, 4] },
  },
  {
    id: 'r_fours_mid',
    type: 'class-tier',
    hard: false,
    weight: 2,
    enabled: true,
    origin: 'trailer',
    params: { classes: ['4+', '4-', '4x', '4x+'], tiers: [3, 2] },
  },
  {
    id: 'r_heavy_low',
    type: 'heavy-low',
    hard: false,
    weight: 1,
    enabled: true,
    origin: 'trailer',
    params: {},
  },
  {
    id: 'r_forward',
    type: 'forward-bias',
    hard: false,
    weight: 2,
    enabled: true,
    origin: 'trailer',
    params: {},
  },
  {
    id: 'r_balance',
    type: 'side-balance',
    hard: false,
    weight: 2,
    enabled: true,
    origin: 'trailer',
    params: { tolerancePct: 15 },
  },
  {
    id: 'r_unload',
    type: 'unload-order',
    hard: false,
    weight: 1,
    enabled: true,
    origin: 'trailer',
    params: {},
  },
  {
    id: 'r_team',
    type: 'team-together',
    hard: false,
    weight: 1,
    enabled: true,
    origin: 'trailer',
    params: {},
  },
];

/** The "we can squeeze three fours on the wide side of level 3" example from §17.2. */
export const THREE_WIDE_EXAMPLE_RULE: Rule = {
  id: 'r_three_wide',
  type: 'shelf-lanes',
  hard: true,
  weight: 3,
  enabled: true,
  origin: 'regatta',
  params: { shelfId: 'r3', lanes: 3, classes: ['4+', '4-', '4x', '4x+'] },
};
