// Roster helpers: age badges, filters, and the CSV import and export (PLAN.md §4.2).
// Every name here is invented.

import { describe, expect, it } from 'vitest';
import type { Athlete } from '@regatta-ops/domain';
import { mapRow, readCsvTable } from '@/components/CsvImport';
import {
  ageBadge,
  buildRosterImport,
  checkRosterMapping,
  DEFAULT_FILTERS,
  fileSlug,
  filterRoster,
  guessRosterMapping,
  parseDate,
  parseSide,
  ROSTER_FIELDS,
  rosterToCsv,
  splitFullName,
  type RosterImportOptions,
} from './lib';

const TEAM = 'teamboys0000001';

function athlete(over: Partial<Athlete> & Pick<Athlete, 'id' | 'firstName' | 'lastName'>): Athlete {
  return {
    teamId: TEAM,
    side: 'none',
    canScull: false,
    canCox: false,
    level: 'experienced',
    status: 'active',
    ...over,
  };
}

const ROSTER: Athlete[] = [
  athlete({ id: 'a1', firstName: 'Rowan', lastName: 'Pike', side: 'port' }),
  athlete({ id: 'a2', firstName: 'Emery', lastName: 'Holt', side: 'starboard', canScull: true }),
  athlete({ id: 'a3', firstName: 'Soren', lastName: 'Vale', side: 'both', level: 'novice' }),
  athlete({ id: 'a4', firstName: 'Ines', lastName: 'Marr', canCox: true, notes: 'Head coxswain' }),
  athlete({ id: 'a5', firstName: 'Tobin', lastName: 'Reyes', side: 'port', status: 'inactive' }),
];

const OPTS: RosterImportOptions = {
  teamId: TEAM,
  existing: ROSTER,
  skipDuplicates: true,
  seasonYear: 2026,
};

describe('ageBadge', () => {
  it('derives junior age groups from the season year (§9.1)', () => {
    expect(ageBadge(2009, 'juniors', 2026)?.label).toBe('U19');
    expect(ageBadge(2008, 'juniors', 2026)?.label).toBe('U19');
    expect(ageBadge(2010, 'juniors', 2026)?.label).toBe('U17');
    expect(ageBadge(2011, 'juniors', 2026)?.label).toBe('U16');
    expect(ageBadge(2012, 'juniors', 2026)?.label).toBe('U15');
    expect(ageBadge(2013, 'juniors', 2026)?.label).toBe('U15');
    expect(ageBadge(2007, 'juniors', 2026)).toMatchObject({ kind: 'junior', label: 'Open' });
    expect(ageBadge(2010, 'juniors', 2026)?.title).toBe('U17 in 2026 (age 16)');
  });

  it('derives the masters category letter from age', () => {
    expect(ageBadge(2000, 'masters', 2026)).toMatchObject({ kind: 'masters', label: 'AA' });
    expect(ageBadge(1990, 'masters', 2026)?.label).toBe('B');
    expect(ageBadge(1983, 'masters', 2026)?.label).toBe('C');
    expect(ageBadge(1976, 'masters', 2026)?.label).toBe('D');
    expect(ageBadge(1956, 'masters', 2026)?.label).toBe('H');
    expect(ageBadge(1983, 'masters', 2026)?.title).toBe('Masters C in 2026 (age 43)');
    // Too young for masters racing.
    expect(ageBadge(2008, 'masters', 2026)).toBeNull();
  });

  it('picks by age on other teams, and shows nothing without a birth year', () => {
    expect(ageBadge(2011, 'other', 2026)?.label).toBe('U16');
    expect(ageBadge(1975, 'other', 2026)?.label).toBe('D');
    expect(ageBadge(2006, 'other', 2026)).toBeNull();
    expect(ageBadge(null, 'juniors', 2026)).toBeNull();
  });
});

describe('filterRoster', () => {
  it('hides inactive athletes unless asked', () => {
    expect(filterRoster(ROSTER, DEFAULT_FILTERS).map((a) => a.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'a4',
    ]);
    expect(filterRoster(ROSTER, { ...DEFAULT_FILTERS, showInactive: true })).toHaveLength(5);
  });

  it('counts athletes who row both sides as port and as starboard', () => {
    const port = filterRoster(ROSTER, { ...DEFAULT_FILTERS, side: 'port' }).map((a) => a.id);
    expect(port).toEqual(['a1', 'a3']);
    const both = filterRoster(ROSTER, { ...DEFAULT_FILTERS, side: 'both' }).map((a) => a.id);
    expect(both).toEqual(['a3']);
  });

  it('filters scullers, coxswains, level, and searches names and notes', () => {
    const f = DEFAULT_FILTERS;
    expect(filterRoster(ROSTER, { ...f, scullers: true }).map((a) => a.id)).toEqual(['a2']);
    expect(filterRoster(ROSTER, { ...f, coxswains: true }).map((a) => a.id)).toEqual(['a4']);
    expect(filterRoster(ROSTER, { ...f, level: 'novice' }).map((a) => a.id)).toEqual(['a3']);
    expect(filterRoster(ROSTER, { ...f, search: 'holt' }).map((a) => a.id)).toEqual(['a2']);
    expect(filterRoster(ROSTER, { ...f, search: 'head cox' }).map((a) => a.id)).toEqual(['a4']);
  });
});

describe('CSV column guessing', () => {
  it('maps common roster headers to columns', () => {
    const headers = [
      'First Name',
      'Last Name',
      'Side',
      'Weight (lbs)',
      'Birth Year',
      'Grad Year',
      'Cox?',
      'Sculls',
      'Level',
      'Shirt size',
    ];
    const mapping = guessRosterMapping(headers);
    expect(mapping).toMatchObject({
      firstName: 0,
      lastName: 1,
      side: 2,
      birthYear: 4,
      gradYear: 5,
      canCox: 6,
      canScull: 7,
      level: 8,
      fullName: null,
      notes: null,
    });
    // Athletes have no weight: a weight column is left out.
    expect(Object.values(mapping)).not.toContain(3);
  });

  it('handles short and full-name headers', () => {
    const short = guessRosterMapping(['Name', 'P/S', 'Wt', 'YOB', 'Class of']);
    expect(short).toMatchObject({
      fullName: 0,
      firstName: null,
      side: 1,
      birthYear: 3,
      gradYear: 4,
    });
    expect(Object.values(short)).not.toContain(2);
    expect(guessRosterMapping(['First', 'Preferred first name', 'Surname'])).toMatchObject({
      firstName: 0,
      preferredName: 1,
      lastName: 2,
    });
  });

  it('does not read a school grade as a graduation year', () => {
    expect(guessRosterMapping(['Name', 'Grade']).gradYear).toBeNull();
  });

  it('needs a name column', () => {
    expect(checkRosterMapping({ side: 0, birthYear: 1, firstName: null })).toMatch(/first names/);
    expect(checkRosterMapping({ fullName: 0, firstName: null })).toBeNull();
  });
});

describe('CSV value parsing', () => {
  it('reads side values', () => {
    expect(parseSide('P').value).toEqual({ side: 'port' });
    expect(parseSide('Starboard').value).toEqual({ side: 'starboard' });
    expect(parseSide('Both').value).toEqual({ side: 'both' });
    expect(parseSide('P/S').value).toEqual({ side: 'both' });
    expect(parseSide('s / p').value).toEqual({ side: 'both' });
    expect(parseSide('Cox').value).toEqual({ side: 'none', cox: true });
    expect(parseSide('Sculler').value).toEqual({ side: 'none', scull: true });
    expect(parseSide('').value).toEqual({ side: 'none' });
    expect(parseSide('bow').error).toBe('Side "bow" is not port, starboard, both, or cox');
  });

  it('splits full names', () => {
    expect(splitFullName('Pike, Rowan')).toEqual({ firstName: 'Rowan', lastName: 'Pike' });
    expect(splitFullName('Mary Kate  Doyle')).toEqual({
      firstName: 'Mary Kate',
      lastName: 'Doyle',
    });
    expect(splitFullName('Ines')).toEqual({ firstName: 'Ines', lastName: '' });
  });

  it('reads dates in two formats and rejects impossible ones', () => {
    expect(parseDate('2009-05-12').value).toBe('2009-05-12');
    expect(parseDate('5/2/2010').value).toBe('2010-05-02');
    expect(parseDate('2/30/2010').error).toMatch(/not a real date/);
    expect(parseDate('spring').error).toMatch(/should look like/);
  });
});

/** Parse CSV text the way the import dialog does: guess, then map every row. */
function mapped(csv: string) {
  const table = readCsvTable(csv);
  const mapping = guessRosterMapping(table.headers);
  return table.rows.map((r) => mapRow(r, mapping, ROSTER_FIELDS));
}

describe('buildRosterImport', () => {
  const rows = buildRosterImport(
    mapped(
      [
        'First name,Last name,Side,Weight,Birth year,Grad year,Level,Notes',
        'Wren,Castell,P,150,2010,2028,Novice,',
        'Juniper,Oakes,Cox,110,2011,29,,Loud',
        ',Nameless,S,160,2009,2027,,',
        'Arlo,Finch,Bow,160,2009,2027,,',
        'Milo,Grant,S,1650,20O9,2027,Varsity,',
        'Rowan,Pike,P,160,2009,2027,,',
        'Wren,Castell,S,150,2010,2028,,',
      ].join('\n'),
    ),
    OPTS,
  );

  it('builds athletes from good rows, leaving out the weight column', () => {
    const wren = rows[0]!;
    expect(wren.line).toBe(2);
    expect(wren.errors).toEqual([]);
    expect(wren.athlete).toMatchObject({
      teamId: TEAM,
      firstName: 'Wren',
      lastName: 'Castell',
      side: 'port',
      canCox: false,
      birthYear: 2010,
      gradYear: 2028,
      level: 'novice',
      status: 'active',
    });
    expect(wren.athlete).not.toHaveProperty('weightKg');
  });

  it('treats a Cox side as a coxswain and reads two-digit graduation years', () => {
    expect(rows[1]!.athlete).toMatchObject({
      side: 'none',
      canCox: true,
      gradYear: 2029,
      level: 'experienced',
      notes: 'Loud',
    });
  });

  it('reports each problem on its row', () => {
    expect(rows[2]!.errors).toEqual(['The name is blank']);
    expect(rows[2]!.athlete).toBeNull();
    expect(rows[3]!.errors).toEqual(['Side "Bow" is not port, starboard, both, or cox']);
    expect(rows[4]!.errors).toEqual(['Enter the birth year as four digits, like 2016']);
  });

  it('skips names already on the roster and flags repeats within the file', () => {
    expect(rows[5]).toMatchObject({ duplicateOf: 'roster', skipped: true, athlete: null });
    expect(rows[5]!.errors).toEqual(['Already on this roster']);
    expect(rows[6]).toMatchObject({ duplicateOf: 'file', skipped: false });
    expect(rows[6]!.warnings).toEqual(['Same name as row 2']);
    expect(rows[6]!.athlete).not.toBeNull();
    const keep = buildRosterImport(mapped('First name,Last name\nRowan,Pike'), {
      ...OPTS,
      skipDuplicates: false,
    });
    expect(keep[0]).toMatchObject({ duplicateOf: 'roster', skipped: false });
    expect(keep[0]!.warnings).toEqual(['Someone with this name is already on this roster']);
    expect(keep[0]!.athlete).not.toBeNull();
  });

  it('splits a full-name column', () => {
    const [row] = buildRosterImport(mapped('Name\tWeight\tSide\nChen, Ava\t70\tStarboard\n'), OPTS);
    expect(row!.errors).toEqual([]);
    expect(row!.athlete).toEqual({
      teamId: TEAM,
      firstName: 'Ava',
      lastName: 'Chen',
      side: 'starboard',
      canScull: false,
      canCox: false,
      level: 'experienced',
      status: 'active',
    });
  });
});

describe('rosterToCsv', () => {
  it('exports columns the import reads back', () => {
    const csv = rosterToCsv(ROSTER);
    const table = readCsvTable(csv);
    expect(table.headers).toEqual([
      'First name',
      'Last name',
      'Preferred name',
      'Side',
      'Can scull',
      'Can cox',
      'Birth year',
      'Graduation year',
      'Gender',
      'Level',
      'Status',
      'Notes',
    ]);
    const mapping = guessRosterMapping(table.headers);
    for (const key of ['firstName', 'lastName', 'side', 'canScull', 'canCox', 'birthYear']) {
      expect(mapping[key]).not.toBeNull();
    }
    const back = buildRosterImport(
      table.rows.map((r) => mapRow(r, mapping, ROSTER_FIELDS)),
      { ...OPTS, existing: [] },
    );
    expect(back.every((r) => r.errors.length === 0)).toBe(true);
    const byName = new Map(back.map((r) => [r.athlete!.firstName, r.athlete!]));
    for (const a of ROSTER) {
      const b = byName.get(a.firstName)!;
      expect(b).toMatchObject({
        lastName: a.lastName,
        side: a.side,
        canScull: a.canScull,
        canCox: a.canCox,
        level: a.level,
        status: a.status,
      });
    }
  });

  it('makes file names from team names', () => {
    expect(fileSlug('Junior boys')).toBe('junior-boys');
    expect(fileSlug('5am masters!')).toBe('5am-masters');
  });
});
