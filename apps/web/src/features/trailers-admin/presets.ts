// Starting points for "New trailer" (PLAN.md §4.9, §16.2, §16.4) and the default rule set that
// goes with a trailer's tiers (§9.3.3). Dimensions are typical values to edit, not
// measurements.

import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  type CompartmentDef,
  type Rule,
  type ShelfDef,
  type TrailerDef,
} from '@srt/domain';

export type PresetKey = 'offset-post' | 'goalpost' | 'center-post';

export interface TrailerPreset {
  key: PresetKey;
  title: string;
  description: string;
  build: (input: { id: string; name: string; newId: () => string }) => TrailerDef;
}

function shelf(
  newId: () => string,
  fields: Omit<ShelfDef, 'id' | 'laneAccess' | 'accessRank' | 'active'> &
    Partial<Pick<ShelfDef, 'laneAccess' | 'accessRank' | 'active'>>,
): ShelfDef {
  return {
    id: newId(),
    laneAccess: 'any',
    accessRank: fields.tier,
    active: true,
    ...fields,
  };
}

function compartment(newId: () => string, fields: Omit<CompartmentDef, 'id'>): CompartmentDef {
  return { id: newId(), ...fields };
}

/**
 * The bed as SRA loads it (PLAN.md §4.9): slings, then oars, then riggers filling the back of
 * the bed, zones along a 1220 cm frame (the boys' trailer's placeholders).
 */
function sraBed(newId: () => string): CompartmentDef[] {
  return SRA_BOYS_TRAILER.compartments.map(({ id: _id, ...c }) => compartment(newId, c));
}

const LEVELS = [1, 2, 3, 4, 5];

export const TRAILER_PRESETS: readonly TrailerPreset[] = [
  {
    key: 'offset-post',
    title: 'Offset post, 5 levels',
    description:
      'Like the club’s trailers: a post one third across, one hull on the narrow side and two on the wide side, loaded from the outside in.',
    build: ({ id, name, newId }) => ({
      id,
      name,
      style: 'offset_post',
      postOffsetPct: 33,
      frameLengthCm: 1220,
      widthCm: 240,
      bowForwardDefault: false,
      shelves: LEVELS.flatMap((tier) => {
        const high = tier >= 3;
        const common = {
          tier,
          lengthCm: 1220,
          frontOverhangMaxCm: high ? 500 : 250,
          rearOverhangMaxCm: 300,
        };
        return [
          shelf(newId, {
            ...common,
            label: `Level ${tier}, narrow side`,
            columnKey: 'left',
            widthCm: 75,
          }),
          shelf(newId, {
            ...common,
            label: `Level ${tier}, wide side`,
            columnKey: 'right',
            widthCm: 150,
            laneAccess: 'outer_first',
          }),
        ];
      }),
      compartments: sraBed(newId),
    }),
  },
  {
    key: 'goalpost',
    title: '41 ft goalpost, 3 wide by 5 racks',
    description:
      'Crossbars between two uprights, three boats across. Rated for nine eights and six fours.',
    build: ({ id, name, newId }) => ({
      id,
      name,
      style: 'goalpost',
      frameLengthCm: 1250,
      widthCm: 240,
      bowForwardDefault: false,
      shelves: LEVELS.map((tier) =>
        shelf(newId, {
          label: `Rack ${tier}`,
          tier,
          columnKey: 'full',
          widthCm: 240,
          lengthCm: 1250,
          frontOverhangMaxCm: tier >= 3 ? 500 : 100,
          rearOverhangMaxCm: tier >= 3 ? 300 : 100,
        }),
      ),
      // An oar box at the front, riggers at the back; edit to suit.
      compartments: [
        compartment(newId, {
          kind: 'oar_box',
          label: 'Oar box',
          capacity: 64,
          startCm: 0,
          endCm: 400,
        }),
        compartment(newId, {
          kind: 'rigger_rack',
          label: 'Riggers',
          capacity: 40,
          startCm: 850,
          endCm: 1250,
        }),
      ],
    }),
  },
  {
    key: 'center-post',
    title: 'Center post, 4 racks',
    description: 'Arms out both sides of a center spine, one hull per side on each rack.',
    build: ({ id, name, newId }) => ({
      id,
      name,
      style: 'center_post',
      frameLengthCm: 1220,
      widthCm: 240,
      bowForwardDefault: false,
      shelves: [1, 2, 3, 4].flatMap((tier) => {
        const common = {
          tier,
          widthCm: 100,
          lengthCm: 1220,
          frontOverhangMaxCm: tier >= 3 ? 500 : 250,
          rearOverhangMaxCm: 300,
        };
        return [
          shelf(newId, { ...common, label: `Rack ${tier}, driver side`, columnKey: 'left' }),
          shelf(newId, { ...common, label: `Rack ${tier}, curb side`, columnKey: 'right' }),
        ];
      }),
      compartments: sraBed(newId),
    }),
  },
];

export function presetByKey(key: PresetKey): TrailerPreset {
  return TRAILER_PRESETS.find((p) => p.key === key) ?? TRAILER_PRESETS[0]!;
}

/**
 * The default rules for a trailer with these tiers: SRA's set (§9.3.3), with "eights on top"
 * on the top two tiers and "fours in the middle" on the two below (one tier each on a trailer
 * with three or fewer). Rule ids match SRA's, so regatta overrides line up across trailers.
 */
export function defaultRulesFor(tiers: readonly number[]): Rule[] {
  const sorted = [...new Set(tiers)].sort((a, b) => b - a);
  const nTop = sorted.length >= 4 ? 2 : 1;
  const top = sorted.slice(0, nTop);
  const mid = sorted.slice(nTop, nTop + 2);
  const out: Rule[] = [];
  for (const r of SRA_DEFAULT_RULES) {
    if (r.type === 'class-tier' && r.id === 'r_eights_top') {
      if (top.length > 0) out.push({ ...r, params: { ...r.params, tiers: top } });
    } else if (r.type === 'class-tier' && r.id === 'r_fours_mid') {
      if (mid.length > 0) out.push({ ...r, params: { ...r.params, tiers: mid } });
    } else {
      out.push(structuredClone(r));
    }
  }
  return out;
}
