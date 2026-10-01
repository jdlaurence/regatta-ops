// Every name here is invented.

import { describe, expect, it } from 'vitest';
import type { Athlete, Availability } from '@regatta-ops/domain';
import { readCsvTable } from '@/components/CsvImport';
import {
  ABSENCE_REASON,
  answerGroups,
  foldText,
  guessAnswer,
  guessNameColumns,
  guessRegattaColumn,
  matchName,
  nameScore,
  parseFormTimestamp,
  planAbsenceImport,
  readAbsenceRows,
  regattaColumnScore,
  resolveRows,
  rowName,
  similarity,
  SKIP,
  timestampColumn,
  type AbsenceConfig,
} from './absence-import';

function athlete(
  id: string,
  firstName: string,
  lastName: string,
  extra: Partial<Athlete> = {},
): Athlete {
  return {
    id,
    teamId: 'teamboys0000001',
    firstName,
    lastName,
    side: 'port',
    canScull: true,
    canCox: false,
    level: 'experienced',
    status: 'active',
    ...extra,
  };
}

const ROSTER: Athlete[] = [
  athlete('rowan0000000001', 'Rowan', 'Test'),
  athlete('emery0000000001', 'Emery', 'Sample'),
  athlete('samuel000000001', 'Samuel', 'Placeholder', { preferredName: 'Sam' }),
  athlete('alexandra000001', 'Alexandra', 'Mock'),
  athlete('taylor000000001', 'Taylor', 'Garcia Lopez'),
  athlete('jordanboys00001', 'Jordan', 'Demo'),
  athlete('jordangirls0001', 'Jordan', 'Demo', { teamId: 'teamgirls000001' }),
  athlete('quinn0000000001', 'Quinn', 'Example'),
];

const FORM = [
  'Timestamp,Email Address,Athlete name,Head of the Lake,Tail of the Lake,Head of the Harbor',
  '10/1/2026 18:02:11,rowan@example.com,Rowan Test,"Yes, I can attend",No,',
  '10/1/2026 19:15:40,emery@example.com,Emery Samples,No,"Yes, I can attend",Not sure',
  '10/2/2026 7:03:05,sam@example.com,Sam Placeholder,Not sure,,',
  '10/2/2026 8:00:00,alex@example.com,"Mock, Alexandra",Can\'t make it - exams,,',
  '10/2/2026 9:00:00,jordan@example.com,Jordan Demo,No,,',
  '10/3/2026 10:00:00,casey@example.com,Casey Nobody,No,,',
  '10/3/2026 18:30:00,rowan@example.com,rowan test,No,,',
  '10/3/2026 18:31:00,quinn@example.com,Quinn Example,,,',
  '10/3/2026 18:40:00,,,No,,',
].join('\n');

describe('text helpers', () => {
  it('folds case, accents, and punctuation', () => {
    expect(foldText('  Zoë   O’Brien-Test ')).toBe('zoe obrien test');
    expect(similarity('rowan', 'rowen')).toBeCloseTo(0.8);
    expect(similarity('', '')).toBe(1);
  });

  it('reads Google Forms and ISO timestamps', () => {
    expect(parseFormTimestamp('10/3/2026 18:30:00')).toBe(Date.UTC(2026, 9, 3, 18, 30, 0));
    expect(parseFormTimestamp('10/3/2026 6:30 PM')).toBe(Date.UTC(2026, 9, 3, 18, 30, 0));
    expect(parseFormTimestamp('10/3/2026 12:05 am')).toBe(Date.UTC(2026, 9, 3, 0, 5, 0));
    expect(parseFormTimestamp('2026-10-03 18:30:00')).toBe(Date.UTC(2026, 9, 3, 18, 30, 0));
    expect(parseFormTimestamp('yesterday')).toBeNull();
  });
});

describe('columns', () => {
  it('finds a full-name column, or first and last', () => {
    expect(guessNameColumns(['Timestamp', 'Email Address', 'Athlete name', 'HOTL'])).toEqual({
      name: 2,
      lastName: null,
    });
    expect(guessNameColumns(['Timestamp', 'First name', 'Last name', 'HOTL'])).toEqual({
      name: 1,
      lastName: 2,
    });
    expect(guessNameColumns(['Name (first and last)', 'Head of the Lake'])).toEqual({
      name: 0,
      lastName: null,
    });
    expect(guessNameColumns(["Parent's name", 'Rower', 'HOTL'])).toEqual({
      name: 1,
      lastName: null,
    });
    expect(guessNameColumns(['Timestamp', 'Head of the Lake'])).toEqual({
      name: null,
      lastName: null,
    });
  });

  it('finds the timestamp column', () => {
    expect(timestampColumn(['Timestamp', 'Name'])).toBe(0);
    expect(timestampColumn(['Name', 'HOTL'])).toBeNull();
  });

  it("scores a header against the regatta's name", () => {
    expect(regattaColumnScore('Head of the Lake', 'Head of the Lake')).toBe(1);
    expect(regattaColumnScore('head of the lake!', 'Head of the Lake')).toBe(1);
    expect(regattaColumnScore('Head of the Lake 2026', 'Head of the Lake')).toBe(0.9);
    expect(regattaColumnScore('HOTL', 'Head of the Lake')).toBe(0.85);
    expect(
      regattaColumnScore('Which regattas can you attend? [Head of the Lake]', 'Head of the Lake'),
    ).toBe(1);
    // Shared filler words do not make two regattas alike.
    expect(regattaColumnScore('Tail of the Lake', 'Head of the Lake')).toBeLessThan(0.5);
    expect(regattaColumnScore('Sammamish Sprints', 'Samamish Sprints Regatta')).toBeGreaterThan(
      0.7,
    );
  });

  it('picks the best column for the regatta, skipping the name columns', () => {
    const headers = readCsvTable(FORM).headers;
    expect(guessRegattaColumn(headers, 'Head of the Lake')).toBe(3);
    expect(guessRegattaColumn(headers, 'Tail of the Lake 2026')).toBe(4);
    expect(guessRegattaColumn(headers, 'Head of the Harbor')).toBe(5);
    expect(guessRegattaColumn(headers, 'Covered Bridge Regatta')).toBeNull();
    expect(guessRegattaColumn(['Head of the Lake', 'HOTL'], 'Head of the Lake', [0])).toBe(1);
  });
});

describe('answers', () => {
  it.each([
    ['Yes, I can attend', 'available'],
    ['yes', 'available'],
    ['I will be there', 'available'],
    ['No', 'unavailable'],
    ["No, I can't attend", 'unavailable'],
    ['Can’t make it - exams', 'unavailable'],
    ['cannot', 'unavailable'],
    ['Absent', 'unavailable'],
    ['Out of town', 'unavailable'],
    ['Unavailable', 'unavailable'],
    ['Not sure', 'maybe'],
    ['Maybe', 'maybe'],
    ['unsure yet', 'maybe'],
    ['Yes?', 'maybe'],
    ['', 'keep'],
    ['   ', 'keep'],
  ] as const)('reads %j as %s', (value, expected) => {
    expect(guessAnswer(value)).toBe(expected);
  });

  it('groups answers without regard to case, with no answer last', () => {
    const rows = [['No'], [''], ['Yes'], ['no '], ['NO'], ['']];
    expect(answerGroups(rows, 0)).toEqual([
      { key: 'no', label: 'No', count: 3 },
      { key: 'yes', label: 'Yes', count: 1 },
      { key: '', label: '', count: 2 },
    ]);
  });
});

describe('names', () => {
  it('reads full names, "Last, First", and separate columns', () => {
    const full = { name: 0, lastName: null };
    expect(rowName(['Rowan Test'], full)).toEqual({
      text: 'Rowan Test',
      first: 'rowan',
      last: 'test',
    });
    expect(rowName(['Test, Rowan'], full)).toMatchObject({ first: 'rowan', last: 'test' });
    expect(rowName(['Mary Ann Test'], full)).toMatchObject({ first: 'mary ann', last: 'test' });
    expect(rowName(['Rowan'], full)).toMatchObject({ first: 'rowan', last: '' });
    expect(rowName(['  '], full)).toBeNull();
    expect(rowName(['Rowan', 'Test'], { name: 0, lastName: 1 })).toMatchObject({
      text: 'Rowan Test',
      first: 'rowan',
      last: 'test',
    });
  });

  const name = (text: string) => rowName([text], { name: 0, lastName: null })!;

  it('matches exact names, preferred names, and either order', () => {
    expect(matchName(name('Rowan Test'), ROSTER).match).toEqual({
      athleteId: 'rowan0000000001',
      score: 1,
    });
    expect(matchName(name('Sam Placeholder'), ROSTER).match?.athleteId).toBe('samuel000000001');
    expect(matchName(name('Samuel Placeholder'), ROSTER).match?.athleteId).toBe('samuel000000001');
    expect(matchName(name('Mock, Alexandra'), ROSTER).match?.score).toBe(1);
  });

  it('matches close spellings, short first names, and part of a double last name', () => {
    expect(matchName(name('Emery Samples'), ROSTER).match?.athleteId).toBe('emery0000000001');
    expect(matchName(name('Rowen Test'), ROSTER).match?.athleteId).toBe('rowan0000000001');
    expect(matchName(name('Alex Mock'), ROSTER).match?.athleteId).toBe('alexandra000001');
    expect(matchName(name('Taylor Garcia'), ROSTER).match?.athleteId).toBe('taylor000000001');
    expect(matchName(name('R. Test'), ROSTER).match?.athleteId).toBe('rowan0000000001');
    expect(nameScore(name('Emery Samples'), ROSTER[1]!)).toBeLessThan(1);
  });

  it('asks when two athletes fit equally well, or nobody fits', () => {
    const twins = matchName(name('Jordan Demo'), ROSTER);
    expect(twins.match).toBeNull();
    expect(twins.candidates.map((c) => c.athleteId)).toEqual([
      'jordanboys00001',
      'jordangirls0001',
    ]);
    // Narrowing to one team settles it.
    expect(matchName(name('Jordan Demo'), ROSTER.slice(0, 6)).match?.athleteId).toBe(
      'jordanboys00001',
    );

    expect(matchName(name('Casey Nobody'), ROSTER)).toEqual({ match: null, candidates: [] });
    // Same last name, another first name: offered, never matched.
    const other = matchName(name('Morgan Test'), ROSTER);
    expect(other.match).toBeNull();
    // One word is only ever a suggestion.
    const alone = matchName(name('Quinn'), ROSTER);
    expect(alone.match).toBeNull();
    expect(alone.candidates[0]?.athleteId).toBe('quinn0000000001');
  });
});

describe('reading, resolving, and planning', () => {
  const table = readCsvTable(FORM);
  const config: AbsenceConfig = {
    names: guessNameColumns(table.headers),
    answerColumn: 3,
    timestampColumn: timestampColumn(table.headers),
  };

  it('reads each response with its answer, time, and match; rows without a name are left out', () => {
    const rows = readAbsenceRows(table, config, ROSTER);
    expect(rows.map((r) => r.line)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rows[0]).toMatchObject({
      line: 2,
      answer: 'Yes, I can attend',
      answerKey: 'yes, i can attend',
      time: Date.UTC(2026, 9, 1, 18, 2, 11),
      match: { athleteId: 'rowan0000000001', score: 1 },
    });
    expect(rows.find((r) => r.name.text === 'Casey Nobody')?.match).toBeNull();
  });

  it("keeps each athlete's latest response and applies manual picks", () => {
    const rows = readAbsenceRows(table, config, ROSTER);
    const resolved = resolveRows(rows, { 6: 'jordanboys00001', 9: SKIP });
    const byLine = new Map(resolved.map((r) => [r.line, r]));
    // Rowan answered twice; the later "No" (line 8) wins.
    expect(byLine.get(2)).toMatchObject({ athleteId: 'rowan0000000001', supersededBy: 8 });
    expect(byLine.get(8)).toMatchObject({ athleteId: 'rowan0000000001', supersededBy: null });
    expect(byLine.get(6)?.athleteId).toBe('jordanboys00001');
    expect(byLine.get(9)?.athleteId).toBeNull();
    expect(byLine.get(7)?.athleteId).toBeNull();

    // Without timestamps the lower row is the later one; a pick can also undo a match.
    const untimed = rows.map((r) => ({ ...r, time: null }));
    const flipped = resolveRows(untimed.reverse(), { 8: SKIP });
    expect(flipped.find((r) => r.line === 2)?.supersededBy).toBeNull();
  });

  it('plans only the records that change, with the reason on absences', () => {
    const rows = resolveRows(readAbsenceRows(table, config, ROSTER), { 6: 'jordanboys00001' });
    const existing: Availability[] = [
      // Already unavailable: stays as it is, reason and all.
      {
        id: 'avail0000000001',
        regattaId: 'regattahotl0001',
        athleteId: 'jordanboys00001',
        status: 'unavailable',
        reason: 'Family trip',
      },
      // Marked maybe earlier; the form says no.
      {
        id: 'avail0000000002',
        regattaId: 'regattahotl0001',
        athleteId: 'alexandra000001',
        status: 'maybe',
        reason: 'Exams',
      },
      // Quinn left the answer blank: nothing changes.
      {
        id: 'avail0000000003',
        regattaId: 'regattahotl0001',
        athleteId: 'quinn0000000001',
        status: 'unavailable',
      },
    ];
    const ctx = {
      regattaId: 'regattahotl0001',
      regattaDays: ['2026-11-01'],
      byAthlete: new Map(existing.map((a) => [a.athleteId, a])),
    };
    const changes = planAbsenceImport(rows, {}, ctx);
    expect(changes.map((c) => [c.athleteId, c.before.status, c.after.status])).toEqual([
      ['emery0000000001', 'available', 'unavailable'],
      ['samuel000000001', 'available', 'maybe'],
      ['alexandra000001', 'maybe', 'unavailable'],
      ['rowan0000000001', 'available', 'unavailable'],
    ]);
    expect(changes[0]!.op).toEqual({
      op: 'create',
      collection: 'availability',
      data: {
        regattaId: 'regattahotl0001',
        athleteId: 'emery0000000001',
        status: 'unavailable',
        days: null,
        reason: ABSENCE_REASON,
      },
    });
    expect(changes[2]!.op).toEqual({
      op: 'update',
      collection: 'availability',
      id: 'avail0000000002',
      patch: { status: 'unavailable', days: null, reason: ABSENCE_REASON },
    });

    // Answer choices override the guesses: "Not sure" read as available, "No" left as is.
    const edited = planAbsenceImport(rows, { 'not sure': 'available', no: 'keep' }, ctx);
    expect(edited.map((c) => c.athleteId)).toEqual(['alexandra000001']);
  });

  it('clears a record when the form says available; a blank latest answer changes nothing', () => {
    const rows = resolveRows(readAbsenceRows(table, { ...config, answerColumn: 4 }, ROSTER), {});
    const existing: Availability = {
      id: 'avail0000000004',
      regattaId: 'regattatail0001',
      athleteId: 'emery0000000001',
      status: 'unavailable',
      days: null,
      reason: 'Sprained wrist',
    };
    const changes = planAbsenceImport(
      rows,
      {},
      {
        regattaId: 'regattatail0001',
        regattaDays: ['2027-03-01', '2027-03-02'],
        byAthlete: new Map([[existing.athleteId, existing]]),
      },
    );
    // Rowan said no to this regatta first, but the later response (line 8) left it blank.
    expect(changes).toEqual([
      expect.objectContaining({
        athleteId: 'emery0000000001',
        op: { op: 'delete', collection: 'availability', id: 'avail0000000004' },
      }),
    ]);
  });
});
