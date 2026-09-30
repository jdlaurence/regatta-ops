import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSeedWorld } from '@srt/seed';
import { guessMapping, mapRow, readCsvTable, type CsvField } from '@/components/CsvImport';
import {
  checkGearRows,
  checkOarSetRows,
  checkShellRows,
  GEAR_CSV_FIELDS,
  gearToCsv,
  OAR_SET_CSV_FIELDS,
  oarSetsToCsv,
  parseAffinity,
  parseGearCategory,
  parseNumber,
  parseStatus,
  parseStrokeSide,
  SHELL_CSV_FIELDS,
  shellsToCsv,
  splitSpreadOrSpan,
  type CsvContext,
} from './csv';

// Vitest runs from apps/web.
const reference = (file: string) =>
  readFileSync(resolve(process.cwd(), '../../data/reference', file), 'utf8');

const teams: CsvContext['teams'] = [
  { id: 'boys', name: 'Junior boys', shortName: 'Boys' },
  { id: 'girls', name: 'Junior girls', shortName: 'Girls' },
];
const empty: CsvContext = { teams, existingNames: [] };

/** Paste → guess → map, as the dialog does. */
function mapped(text: string, fields: CsvField[]) {
  const table = readCsvTable(text);
  const mapping = guessMapping(table.headers, fields);
  return { table, mapping, rows: table.rows.map((r) => mapRow(r, mapping, fields)) };
}

function column(table: { headers: string[] }, index: number | null) {
  return index == null ? null : table.headers[index];
}

describe('column guessing', () => {
  it("maps every column of the club's equipment list", () => {
    const { table, mapping } = mapped(reference('shells.csv'), SHELL_CSV_FIELDS);
    const byField = Object.fromEntries(
      Object.entries(mapping).map(([k, i]) => [k, column(table, i)]),
    );
    expect(byField).toMatchObject({
      name: 'name',
      nickname: 'nickname',
      boatClass: 'boat_class',
      compatibleClasses: 'compatible_classes',
      genderAffinity: 'gender_affinity',
      level: 'size_tier',
      model: 'model',
      serial: 'serial',
      weightClassLabel: 'weight_class_lb',
      year: 'year',
      location: 'location',
      spreadCm: 'spread_or_span',
      spanCm: 'spread_or_span',
      strokeSide: 'stroke_side', // preferred over 'rig'
      coxPosition: 'cox_position',
      shoes: 'shoes',
      status: 'unavailable',
      notes: 'notes',
      homeTeam: null,
      lengthCm: null,
    });
  });

  it('maps the oar list and ignores case, spaces, and punctuation', () => {
    const { table, mapping } = mapped(reference('oar-sets.csv'), OAR_SET_CSV_FIELDS);
    expect(column(table, mapping.color!)).toBe('color');
    expect(column(table, mapping.inboardCm!)).toBe('inboard_cm');
    expect(column(table, mapping.status!)).toBe('unavailable');
    expect(mapping.count).toBeNull();

    const loose = guessMapping(
      ['Boat Class', 'NAME', 'Weight class (lb)', 'Rigger-Count'],
      SHELL_CSV_FIELDS,
    );
    expect(loose.boatClass).toBe(0);
    expect(loose.name).toBe(1);
    expect(loose.weightClassLabel).toBe(2);
    expect(loose.riggerCount).toBe(3);
  });

  it('reads tab-separated paste from a spreadsheet', () => {
    const { rows } = mapped('Name\tClass\nMonahan\t8+\n', SHELL_CSV_FIELDS);
    expect(rows).toEqual([expect.objectContaining({ name: 'Monahan', boatClass: '8+' })]);
  });
});

describe('shell rows', () => {
  it("accepts every shell on the club's list", () => {
    const { rows } = mapped(reference('shells.csv'), SHELL_CSV_FIELDS);
    const results = checkShellRows(rows, empty);
    expect(results).toHaveLength(80);
    expect(results.filter((r) => r.errors.length > 0)).toEqual([]);
    const wuba = results.find((r) => r.record?.name === 'WUBA')!.record!;
    expect(wuba).toMatchObject({
      boatClass: '8+',
      rigging: 'sweep',
      manufacturer: 'Hudson',
      model: 'Hudson S8.21',
      weightClassLabel: '140-175',
      strokeSide: 'starboard',
      coxPosition: 'stern',
      spreadCm: 85,
      spanCm: null,
      genderAffinity: 'women',
      location: 'C5',
      status: 'in_service',
      lengthCm: 1990,
      riggerCount: 8,
      year: 2022,
    });
    expect(wuba.crewWeightMinKg).toBeCloseTo(63.5, 1);
    expect(results.filter((r) => r.record?.status === 'out_of_service')).toHaveLength(2);
  });

  it('skips names already in the fleet or repeated in the file', () => {
    const rows = [
      { name: 'Monahan', boatClass: '8+' },
      { name: 'Spencer', boatClass: '4+' },
      { name: 'spencer', boatClass: '4+' },
    ];
    const results = checkShellRows(rows, { teams, existingNames: ['Monahan'] });
    expect(results.map((r) => !!r.record)).toEqual([false, true, false]);
    expect(results[0]!.errors[0]).toBe('A shell named "Monahan" is already in the fleet.');
    expect(results[2]!.errors[0]).toBe('"spencer" appears more than once in the file.');
  });

  it('says what is wrong with a row', () => {
    const [noClass, badClass, badNumber, noName] = checkShellRows(
      [
        { name: 'A' },
        { name: 'B', boatClass: 'canoe' },
        { name: 'C', boatClass: '1x', year: 'soon', lengthCm: '8 m' },
        { boatClass: '1x' },
      ],
      empty,
    );
    expect(noClass!.errors).toEqual(['Boat class is missing.']);
    expect(badClass!.errors[0]).toMatch(/Boat class "canoe" is not one of 1x, 2x/);
    expect(badNumber!.errors).toEqual([
      'Length "8 m" is not a number.',
      'Year "soon" is not a number.',
    ]);
    expect(noName!.errors).toEqual(['Name is missing.']);
  });

  it('warns and carries on for values it cannot read', () => {
    const [r] = checkShellRows(
      [
        {
          name: 'Q',
          boatClass: 'Quad',
          compatibleClasses: '4-; canoe',
          homeTeam: 'Varsity',
          level: 'Large',
          status: 'wobbly',
          genderAffinity: 'boys',
          weightClassLabel: 'QVU123',
        },
      ],
      empty,
    );
    expect(r!.errors).toEqual([]);
    expect(r!.record).toMatchObject({
      boatClass: '4x',
      compatibleClasses: ['4x', '4-'],
      rigging: 'convertible',
      homeTeamId: null,
      level: null,
      status: 'in_service',
      genderAffinity: 'men',
      weightClassLabel: '',
    });
    expect(r!.warnings).toHaveLength(5);
  });

  it('finds the home team by name or short name', () => {
    const [a, b] = checkShellRows(
      [
        { name: 'A', boatClass: '8+', homeTeam: 'junior girls' },
        { name: 'B', boatClass: '8+', homeTeam: 'Boys' },
      ],
      empty,
    );
    expect(a!.record!.homeTeamId).toBe('girls');
    expect(b!.record!.homeTeamId).toBe('boys');
  });
});

describe('oar set and gear rows', () => {
  it("accepts the club's oar list", () => {
    const { rows } = mapped(reference('oar-sets.csv'), OAR_SET_CSV_FIELDS);
    const results = checkOarSetRows(rows, empty);
    expect(results.filter((r) => r.errors.length > 0)).toEqual([]);
    const set = results.find((r) => r.record?.name === '24-C')!.record!;
    expect(set).toMatchObject({
      type: 'sweep',
      color: 'yellow-white',
      count: 8,
      blade: 'S2V Skinny',
      lengthCm: 374,
      inboardCm: 114,
      gripMm: 34.5,
      genderAffinity: 'men',
    });
    const threePairs = results.find((r) => /only 3 pairs/i.test(r.record?.notes ?? ''));
    expect(threePairs?.record?.count).toBe(6);
  });

  it('needs a type for an oar set', () => {
    const [r] = checkOarSetRows([{ name: 'Blue' }], empty);
    expect(r!.errors).toEqual(['Type is missing.']);
    const [s] = checkOarSetRows([{ name: 'Blue', type: 'paddle' }], empty);
    expect(s!.errors).toEqual(['Type "paddle" is not sweep or scull.']);
  });

  it('reads gear categories and default load', () => {
    const results = checkGearRows(
      [
        { name: 'Cox boxes', category: 'Cox box', quantity: '6', defaultLoad: 'yes' },
        { name: 'Wrenches', category: 'tools', defaultLoad: '' },
        { name: 'Cones', category: 'safety' },
        { name: 'Bad', quantity: 'many' },
      ],
      { teams: [], existingNames: [] },
    );
    expect(results[0]!.record).toMatchObject({
      category: 'cox_box',
      quantity: 6,
      defaultLoad: true,
    });
    expect(results[1]!.record).toMatchObject({
      category: 'tool_kit',
      quantity: 1,
      defaultLoad: false,
    });
    expect(results[2]!.record!.category).toBe('other');
    expect(results[2]!.warnings).toHaveLength(1);
    expect(results[3]!.errors).toEqual(['Quantity "many" is not a number.']);
  });
});

describe('cell parsers', () => {
  it('reads the club spellings', () => {
    expect(parseStrokeSide('Port rig').value).toBe('port');
    expect(parseStrokeSide('4+ Starboard').value).toBe('starboard');
    expect(parseStatus('True').value).toBe('out_of_service');
    expect(parseStatus('False').value).toBe('in_service');
    expect(parseStatus('Out of service').value).toBe('out_of_service');
    expect(parseStatus('retired').value).toBe('retired');
    expect(parseAffinity("Women's").value).toBe('women');
    expect(parseAffinity('').value).toBe('any');
    expect(parseNumber('1,990 cm', 'Length').value).toBe(1990);
    expect(parseGearCategory('spare_parts').value).toBe('spare_parts');
    expect(splitSpreadOrSpan('85.0')).toEqual({ spreadCm: 85, spanCm: null });
    expect(splitSpreadOrSpan('160')).toEqual({ spreadCm: null, spanCm: 160 });
    expect(splitSpreadOrSpan('86/159')).toEqual({ spreadCm: 86, spanCm: 159 });
    expect(splitSpreadOrSpan('')).toEqual({ spreadCm: null, spanCm: null });
  });
});

describe('export', () => {
  const { world } = buildSeedWorld();
  const seedTeams = world.teams;

  it('round-trips every seeded shell through export and import', () => {
    const csv = shellsToCsv(world.shells, seedTeams);
    const { mapping, rows } = mapped(csv, SHELL_CSV_FIELDS);
    expect(Object.values(mapping).every((i) => i != null)).toBe(true);
    const results = checkShellRows(rows, { teams: seedTeams, existingNames: [] });
    expect(results.filter((r) => r.errors.length > 0)).toEqual([]);
    results.forEach((r, i) => {
      const s = world.shells[i]!;
      expect(r.record).toMatchObject({
        name: s.name,
        boatClass: s.boatClass,
        rigging: s.rigging,
        homeTeamId: s.homeTeamId ?? null,
        status: s.status,
        strokeSide: s.strokeSide ?? null,
        location: s.location ?? '',
        lengthCm: s.lengthCm,
        riggerCount: s.riggerCount,
        isPrivate: s.isPrivate,
      });
      expect(new Set(r.record!.compatibleClasses)).toEqual(new Set(s.compatibleClasses));
    });
  });

  it('round-trips oar sets and gear', () => {
    const oars = checkOarSetRows(
      mapped(oarSetsToCsv(world.oar_sets, seedTeams), OAR_SET_CSV_FIELDS).rows,
      { teams: seedTeams, existingNames: [] },
    );
    expect(oars.map((r) => r.record?.count)).toEqual(world.oar_sets.map((o) => o.count));
    expect(oars.map((r) => r.record?.homeTeamId ?? null)).toEqual(
      world.oar_sets.map((o) => o.homeTeamId ?? null),
    );
    const gear = checkGearRows(mapped(gearToCsv(world.gear_items), GEAR_CSV_FIELDS).rows, {
      teams: [],
      existingNames: [],
    });
    expect(gear.map((r) => r.record?.defaultLoad)).toEqual(
      world.gear_items.map((g) => g.defaultLoad),
    );
  });

  it('writes §8.1 field names as headers', () => {
    const header = shellsToCsv([], []).split('\n')[0];
    expect(header).toContain('name,nickname,boat_class,compatible_classes');
    expect(header).toContain('weight_class_label');
  });
});
