// The generated reference data, the fleet, gear, and trailers.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  SRA_GIRLS_TRAILER,
  THREE_WIDE_EXAMPLE_RULE,
  lbToKg,
  parseCsvObjects,
} from '@srt/domain';
import {
  BOYS_SHELF_IDS,
  COMPARTMENT_IDS,
  GIRLS_SHELF_IDS,
  OAR_SET_ROWS,
  SCHEDULE_ROWS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  SHELL_ROWS,
  buildSeedWorld,
  remapRuleShelfIds,
  seedOarSetId,
  seedShellId,
} from '../src';
import { REFERENCE_FILES } from '../src/reference-types';

const here = dirname(fileURLToPath(import.meta.url));
const csv = (file: string) =>
  parseCsvObjects(readFileSync(resolve(here, '../../../data/reference', file), 'utf8'));

const { world } = buildSeedWorld();
const shell = (name: string) => world.shells.find((s) => s.id === seedShellId(name))!;
const oars = (name: string) => world.oar_sets.find((o) => o.id === seedOarSetId(name))!;

describe('generated reference data', () => {
  it.each([
    ['shells', SHELL_ROWS],
    ['oarSets', OAR_SET_ROWS],
    ['schedule', SCHEDULE_ROWS],
  ] as const)('%s is up to date with its CSV (run `pnpm --filter @srt/seed gen`)', (key, rows) => {
    const { file, columns } = REFERENCE_FILES[key];
    const fromCsv = csv(file);
    expect(Object.keys(fromCsv[0]!)).toEqual([...columns]);
    expect(rows).toEqual(fromCsv);
  });
});

describe('shells', () => {
  it('has one shell per row of shells.csv, with the sheet name', () => {
    expect(world.shells).toHaveLength(SHELL_ROWS.length);
    expect(world.shells.map((s) => s.name)).toEqual(SHELL_ROWS.map((r) => r.name));
  });

  it('marks the two boats the sheet lists as unavailable out of service', () => {
    const out = world.shells.filter((s) => s.status === 'out_of_service').map((s) => s.name);
    expect(out).toEqual(SHELL_ROWS.filter((r) => r.unavailable === 'True').map((r) => r.name));
    expect(out).toHaveLength(2);
    expect(shell('Fowler').status).toBe('limited'); // "Serious hull damage do not row."
  });

  it('maps nicknames, classes, sides, and weight classes', () => {
    const lll = shell('Live.Laugh.Love');
    expect(lll).toMatchObject({
      nickname: 'LLL',
      boatClass: '8+',
      rigging: 'sweep',
      strokeSide: 'port',
      coxPosition: 'stern',
      weightClassLabel: '165-200',
      manufacturer: 'Hudson',
      model: 'Hudson S8.32',
      location: 'B5',
      year: 2022,
      spreadCm: 84,
      lengthCm: 1990,
      riggerType: 'side',
      riggerCount: 8,
      genderAffinity: 'men',
      homeTeamId: SEED_TEAM_IDS.boys,
      status: 'in_service',
    });
    expect(lll.crewWeightMinKg).toBeCloseTo(lbToKg(165), 0);
    expect(lll.crewWeightMaxKg).toBeCloseTo(lbToKg(200), 0);
    expect(shell('WUBA')).toMatchObject({
      strokeSide: 'starboard',
      homeTeamId: SEED_TEAM_IDS.girls,
    });
    expect(shell('Geezer').homeTeamId).toBeNull();
    expect(shell('Julin').weightClassLabel).toBe('LWT');
    expect(shell('Berserker').weightClassLabel).toBeUndefined(); // a serial number in the column
    expect(shell('Marc & Patrick').weightClassLabel).toBe('155');
    expect(shell('Hans Semi-Private').isPrivate).toBe(true);
  });

  it('marks convertible hulls and Lundberg as a 4+ that re-rigs as a 4x+', () => {
    expect(shell('Snoopy')).toMatchObject({
      rigging: 'convertible',
      compatibleClasses: ['4x', '4-'],
      spreadCm: 86,
      spanCm: 159,
    });
    expect(shell('Third Thursday')).toMatchObject({ boatClass: '4-', rigging: 'convertible' });
    expect(shell('Lundberg')).toMatchObject({
      boatClass: '4+',
      rigging: 'convertible',
      compatibleClasses: ['4+', '4x+'],
    });
    expect(shell('Kokanee')).toMatchObject({ rigging: 'sweep', compatibleClasses: [] });
  });

  it('uses wing riggers for the Vespoli wing eights and model lengths for rec singles', () => {
    expect(shell('Statement')).toMatchObject({ riggerType: 'wing', riggerCount: 4 });
    expect(shell('Buckley').lengthCm).toBe(732);
    expect(shell('MO').lengthCm).toBe(823);
    expect(shell('Laurel').lengthCm).toBe(820);
  });
});

describe('oar sets', () => {
  it('has one set per row of oar-sets.csv', () => {
    expect(world.oar_sets.map((o) => o.name)).toEqual(OAR_SET_ROWS.map((r) => r.name));
    const sweep = world.oar_sets.filter((o) => o.type === 'sweep');
    expect(sweep.filter((o) => o.genderAffinity === 'men')).toHaveLength(16);
    expect(sweep.filter((o) => o.genderAffinity === 'women')).toHaveLength(15);
    expect(world.oar_sets.filter((o) => o.type === 'scull')).toHaveLength(11);
  });

  it('maps counts, color codes, and measurements', () => {
    expect(oars('24-C')).toMatchObject({
      type: 'sweep',
      color: 'yellow-white',
      count: 9,
      blade: 'S2V Skinny',
      lengthCm: 374,
      inboardCm: 114,
      gripMm: 34.5,
      homeTeamId: SEED_TEAM_IDS.boys,
    });
    expect(oars('25-A')).toMatchObject({ color: 'green-brown', homeTeamId: SEED_TEAM_IDS.girls });
    expect(oars('Swedes').count).toBe(8);
    expect(oars('Blue')).toMatchObject({ type: 'scull', count: 8, homeTeamId: null });
    expect(oars('Red').count).toBe(6); // only 3 pairs
    expect(oars('Canucks').status).toBe('limited'); // on way out
    expect(oars('Greens').blade).toBeUndefined(); // a number in the blade column
  });
});

describe('gear', () => {
  it('loads cox boxes, slings, the tool kit, and straps by default', () => {
    expect(world.gear_items.filter((g) => g.defaultLoad).map((g) => g.name)).toEqual([
      'Cox boxes',
      'Slings',
      'Tool kit',
      'Straps',
    ]);
    const names = world.gear_items.map((g) => g.name);
    for (const n of ['Tents', 'Chairs', 'Flags', 'Caution tape', 'Parts boxes', 'Low boys']) {
      expect(names).toContain(n);
    }
  });
});

describe('trailers', () => {
  it('seeds the boys and girls trailers from the sra.ts definitions', () => {
    for (const [def, id, map] of [
      [SRA_BOYS_TRAILER, SEED_TRAILER_IDS.boys, BOYS_SHELF_IDS],
      [SRA_GIRLS_TRAILER, SEED_TRAILER_IDS.girls, GIRLS_SHELF_IDS],
    ] as const) {
      const trailer = world.trailers.find((t) => t.id === id)!;
      expect(trailer).toMatchObject({
        name: def.name,
        style: 'offset_post',
        postOffsetPct: 33,
        frameLengthCm: def.frameLengthCm,
      });
      expect(trailer.defaultRules).toEqual(SRA_DEFAULT_RULES);
      const shelves = world.trailer_shelves.filter((s) => s.trailerId === id);
      expect(shelves.map((s) => s.sortOrder)).toEqual(def.shelves.map((_, i) => i + 1));
      def.shelves.forEach((d, i) => {
        expect(shelves[i]!.id).toBe(map[d.id]);
        expect(shelves[i]).toMatchObject({
          label: d.label,
          tier: d.tier,
          columnKey: d.columnKey,
          widthCm: d.widthCm,
          lengthCm: d.lengthCm,
          frontOverhangMaxCm: d.frontOverhangMaxCm,
          rearOverhangMaxCm: d.rearOverhangMaxCm,
          laneAccess: d.laneAccess,
          accessRank: d.accessRank,
          active: true,
        });
      });
      const compartments = world.trailer_compartments.filter((c) => c.trailerId === id);
      expect(compartments.map((c) => c.id)).toEqual(
        def.compartments.map((c) => COMPARTMENT_IDS[c.id]),
      );
    }
  });

  it('remaps shelf ids inside rules to the seeded ids', () => {
    const [rule] = remapRuleShelfIds([THREE_WIDE_EXAMPLE_RULE], BOYS_SHELF_IDS);
    expect(rule!.params).toMatchObject({ shelfId: BOYS_SHELF_IDS.r3 });
    expect(THREE_WIDE_EXAMPLE_RULE.params).toMatchObject({ shelfId: 'r3' });
  });
});
