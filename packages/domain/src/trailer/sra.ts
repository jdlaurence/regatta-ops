// SRA's two trailers and the default rule set (PLAN.md §4.9, §14, §17.1, §17.2).
// Dimensions are placeholders until measured (PLAN.md §15 Q1). The upper levels allow enough
// front overhang for an eight (1990 cm, §16.1) with a little slack. The 2026 layout puts an
// eight on level 3 of the boys' trailer and on level 2 of the girls', so those levels get the
// long overhang too.

import type { CompartmentDef, Rule, ShelfDef, TrailerDef } from './types';

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

/** Where each load starts along the bed, cm from the front, and how much the zone holds. */
interface BedLayout {
  slingsFromCm: number;
  riggersFromCm: number;
  slings: number;
  oars: number;
  riggers: number;
}

/**
 * SRA's bed as zones along the frame, front to back (PLAN.md §4.9, §16.4): oars, which are
 * long, take roughly the front half; slings a small section in the middle; riggers the rest of
 * the back of the bed, across its full width. The lengths are placeholders until measured
 * (§15 Q1).
 */
function bedZonesAlong(prefix: string, frameLengthCm: number, bed: BedLayout): CompartmentDef[] {
  return [
    {
      id: `${prefix}oars`,
      kind: 'oar_rack',
      label: 'Oars',
      capacity: bed.oars,
      startCm: 0,
      endCm: bed.slingsFromCm,
    },
    {
      id: `${prefix}slings`,
      kind: 'storage',
      label: 'Slings',
      capacity: bed.slings,
      startCm: bed.slingsFromCm,
      endCm: bed.riggersFromCm,
    },
    {
      id: `${prefix}riggers`,
      kind: 'rigger_rack',
      label: 'Riggers',
      capacity: bed.riggers,
      startCm: bed.riggersFromCm,
      endCm: frameLengthCm,
    },
  ];
}

const LOW: LevelOverhang = { front: 250, rear: 300 };
/** Boys: 1220 + 500 + 300 = 2020 cm usable, fits a 1990 cm eight. */
const BOYS_HIGH: LevelOverhang = { front: 500, rear: 300 };
/** Girls: 1070 + 600 + 350 = 2020 cm usable. */
const GIRLS_HIGH: LevelOverhang = { front: 600, rear: 350 };

/**
 * Seeded "Boys trailer" (§17.1). Shelf ids: l1..l5 (narrow), r1..r5 (wide); bed zones slings,
 * oars, riggers.
 */
export const SRA_BOYS_TRAILER: TrailerDef = {
  id: 'trl_boys',
  name: 'Boys trailer',
  style: 'offset_post',
  postOffsetPct: 33,
  frameLengthCm: 1220,
  widthCm: 240,
  bowForwardDefault: true,
  shelves: offsetPostShelves('', 1220, {
    1: LOW,
    2: LOW,
    3: BOYS_HIGH,
    4: BOYS_HIGH,
    5: BOYS_HIGH,
  }),
  // Oars the front half (6.1 m), slings 1.5 m, riggers the last 4.6 m.
  compartments: bedZonesAlong('', 1220, {
    slingsFromCm: 610,
    riggersFromCm: 760,
    slings: 16,
    oars: 64,
    riggers: 96,
  }),
};

/**
 * Seeded "Girls trailer": same geometry, shorter frame (1070 cm). Shelf ids gl1..gl5, gr1..gr5;
 * bed zones gslings, goars, griggers.
 */
export const SRA_GIRLS_TRAILER: TrailerDef = {
  id: 'trl_girls',
  name: 'Girls trailer',
  style: 'offset_post',
  postOffsetPct: 33,
  frameLengthCm: 1070,
  widthCm: 240,
  bowForwardDefault: true,
  shelves: offsetPostShelves('g', 1070, {
    1: LOW,
    2: GIRLS_HIGH,
    3: GIRLS_HIGH,
    4: GIRLS_HIGH,
    5: GIRLS_HIGH,
  }),
  // Oars the front half (5.35 m), slings 1.3 m, riggers the last 4.05 m.
  compartments: bedZonesAlong('g', 1070, {
    slingsFromCm: 535,
    riggersFromCm: 665,
    slings: 12,
    oars: 48,
    riggers: 80,
  }),
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
  // Low: at Medium the balance term outweighs "fours on levels 3 and 2" and moves a four to
  // level 1, narrow side; the coaches' own 2026 layout is 27% heavier on the wide side. Like
  // heavy-low, balance should break ties without fighting the convention (§9.3.5 case 12).
  {
    id: 'r_balance',
    type: 'side-balance',
    hard: false,
    weight: 1,
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
