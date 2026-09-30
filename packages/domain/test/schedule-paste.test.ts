// Schedule paste parser (PLAN.md §9.5): the club's reference schedule, a RegattaCentral-style
// tab paste, a PDF copy-paste with ragged spacing, and a Google Sheet paste. Invented rows
// except the reference CSV (equipment names only, no athletes).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyColumnMapping,
  detectPasteDelimiter,
  parseBoatClass,
  parseClockTime,
  parseCsvObjects,
  parseEventNumber,
  parseSchedulePaste,
  parseScheduleDay,
  parseStage,
  parsedEventToRecord,
  type ColumnGuess,
  type ParsedEvent,
} from '../src';

const roles = (columns: ColumnGuess[]) => columns.map((c) => c.role);
const brief = (r: ParsedEvent) => ({
  kind: r.kind,
  eventNumber: r.eventNumber,
  name: r.name,
  boatClass: r.boatClass,
  day: r.day,
  time: r.time,
  stage: r.stage,
});

describe('reference schedule: 2025 NW Youth Champs (CSV)', () => {
  const text = readFileSync(
    new URL('../../../data/reference/schedule-sample-2025-nw-youth-champs.csv', import.meta.url),
    'utf8',
  );
  const expected = parseCsvObjects(text);
  const parsed = parseSchedulePaste(text);

  it('detects commas, skips the header, and maps every column', () => {
    expect(parsed.delimiter).toBe(',');
    expect(roles(parsed.columns)).toEqual([
      'day',
      'time',
      'ignore',
      'name',
      'boatClass',
      'stage',
      'ignore',
      'ignore',
    ]);
    expect(parsed.columns.map((c) => c.header)).toEqual([
      'day',
      'time',
      'kind',
      'name',
      'boat_class',
      'stage',
      'shell',
      'oars',
    ]);
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });

  it('parses every row the way the sheet labels it', () => {
    expect(parsed.rows).toHaveLength(expected.length);
    const stageOf = (s: string) => (s === 'Time Trial' ? 'time_trial' : s ? 'final' : null);
    parsed.rows.forEach((row, i) => {
      const want = expected[i]!;
      expect(brief(row)).toEqual({
        kind: want.kind,
        eventNumber: undefined,
        name: want.name,
        boatClass: want.boat_class || null,
        day: want.day,
        time: want.time || null,
        stage: stageOf(want.stage!),
      });
    });
    expect(parsed.rows.filter((r) => r.kind === 'logistics')).toHaveLength(
      expected.filter((r) => r.kind === 'logistics').length,
    );
  });
});

describe('RegattaCentral-style tab paste', () => {
  const text = [
    'Event #\tStart Time\tEvent\tClass\tRound',
    "1\t7:30 AM\tWomen's Youth\t8+\tHeat 1",
    "2\t7:36 AM\tWomen's Youth\t8+\tHeat 2",
    "14A\t9:40 AM\tMen's U17\t4+\tFinal A",
    '\t11:30 AM\tLunch break\t\t',
    '31\t1:04 PM\tMixed Masters C\t2x\tFinal',
    "40\tTBD\tMen's Open\tSingle\tTime Trial",
    "41\t2:10 PM\tWomen's Open\t1x\tSemifinal 1",
  ].join('\n');
  const parsed = parseSchedulePaste(text);

  it('guesses number, time, name, class, and stage columns', () => {
    expect(parsed.delimiter).toBe('\t');
    expect(roles(parsed.columns)).toEqual(['eventNumber', 'time', 'name', 'boatClass', 'stage']);
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });

  it('parses races and the lunch line', () => {
    expect(parsed.rows.map(brief)).toEqual([
      {
        kind: 'race',
        eventNumber: '1',
        name: "Women's Youth 8+",
        boatClass: '8+',
        day: undefined,
        time: '07:30',
        stage: 'heat',
      },
      {
        kind: 'race',
        eventNumber: '2',
        name: "Women's Youth 8+",
        boatClass: '8+',
        day: undefined,
        time: '07:36',
        stage: 'heat',
      },
      {
        kind: 'race',
        eventNumber: '14A',
        name: "Men's U17 4+",
        boatClass: '4+',
        day: undefined,
        time: '09:40',
        stage: 'final',
      },
      {
        kind: 'logistics',
        eventNumber: undefined,
        name: 'Lunch break',
        boatClass: null,
        day: undefined,
        time: '11:30',
        stage: null,
      },
      {
        kind: 'race',
        eventNumber: '31',
        name: 'Mixed Masters C 2x',
        boatClass: '2x',
        day: undefined,
        time: '13:04',
        stage: 'final',
      },
      {
        kind: 'race',
        eventNumber: '40',
        name: "Men's Open Single",
        boatClass: '1x',
        day: undefined,
        time: null,
        stage: 'time_trial',
      },
      {
        kind: 'race',
        eventNumber: '41',
        name: "Women's Open 1x",
        boatClass: '1x',
        day: undefined,
        time: '14:10',
        stage: 'semi',
      },
    ]);
    expect(parsed.rows[0]!.raw).toEqual(['1', '7:30 AM', "Women's Youth", '8+', 'Heat 1']);
  });
});

describe('PDF copy-paste with ragged spacing', () => {
  const text = [
    'Saturday, May 17',
    'Race   Time      Event                         Round',
    "1      7:30 AM   Women's Youth 8+              Heat 1",
    "2      7:36 AM   Women's Youth 8+   Heat 2",
    "3  7:42 AM  Men's Youth 8+   Heat 1",
    "14A 9:40 AM Men's U17 Coxed Four Final",
    '       11:30 AM  Lunch break',
    "22     1:04 PM   Women's Junior Double         Time Trial",
    '       Coach and coxswain meeting',
    'Sunday, May 18',
    "23     8:00 AM   Women's Youth 8+              Final A",
  ].join('\n');

  it('splits on runs of spaces and pulls number, time, and stage out of each line', () => {
    const parsed = parseSchedulePaste(text, { year: 2025 });
    expect(parsed.delimiter).toBe('spaces');
    expect(roles(parsed.columns)).toEqual(['day', 'eventNumber', 'time', 'name', 'stage']);
    expect(parsed.confidence).toBeGreaterThan(0.6);
    expect(parsed.rows.map(brief)).toEqual([
      {
        kind: 'race',
        eventNumber: '1',
        name: "Women's Youth 8+",
        boatClass: '8+',
        day: '2025-05-17',
        time: '07:30',
        stage: 'heat',
      },
      {
        kind: 'race',
        eventNumber: '2',
        name: "Women's Youth 8+",
        boatClass: '8+',
        day: '2025-05-17',
        time: '07:36',
        stage: 'heat',
      },
      {
        kind: 'race',
        eventNumber: '3',
        name: "Men's Youth 8+",
        boatClass: '8+',
        day: '2025-05-17',
        time: '07:42',
        stage: 'heat',
      },
      {
        kind: 'race',
        eventNumber: '14A',
        name: "Men's U17 Coxed Four",
        boatClass: '4+',
        day: '2025-05-17',
        time: '09:40',
        stage: 'final',
      },
      {
        kind: 'logistics',
        eventNumber: undefined,
        name: 'Lunch break',
        boatClass: null,
        day: '2025-05-17',
        time: '11:30',
        stage: null,
      },
      {
        kind: 'race',
        eventNumber: '22',
        name: "Women's Junior Double",
        boatClass: '2x',
        day: '2025-05-17',
        time: '13:04',
        stage: 'time_trial',
      },
      {
        kind: 'logistics',
        eventNumber: undefined,
        name: 'Coach and coxswain meeting',
        boatClass: null,
        day: '2025-05-17',
        time: null,
        stage: null,
      },
      {
        kind: 'race',
        eventNumber: '23',
        name: "Women's Youth 8+",
        boatClass: '8+',
        day: '2025-05-18',
        time: '08:00',
        stage: 'final',
      },
    ]);
  });

  it('resolves weekday headings from the regatta days when there is no year', () => {
    const parsed = parseSchedulePaste(text, { days: ['2025-05-16', '2025-05-17', '2025-05-18'] });
    expect(parsed.rows.map((r) => r.day)).toEqual([...Array(7).fill('2025-05-17'), '2025-05-18']);
    expect(parseSchedulePaste(text).rows[0]!.day).toBeUndefined();
  });
});

describe('Google Sheet paste', () => {
  const text = [
    'Date\tTime\tEvent\tCategory\tBoat\tShell\tOars',
    "Sat 5/17\t8:00\tYouth Men's 8+\tVarsity\t8+\tPeggy\t24-C",
    "\t8:21\t2V Men's 8+\tJV\t8+\tLLL\t23-C",
    '\t\tCoach and coxswain meeting\t\t\t\t',
    "\t12:58\tNovice Men's 4+ A\tNovice\t4+\tSpencer\t24-D",
    "\t1:54\t2V Men's 4+\tJV\t4+\tAlma\t23-C",
    'Sun 5/18\t\t\t\t\t\t',
    "\t8:00\tYouth Men's 4+\tVarsity\t4+\tRSA\t24-C",
  ].join('\n');
  const parsed = parseSchedulePaste(text, { year: 2025 });

  it('maps date, time, event, category, and boat; ignores shells and oars', () => {
    expect(parsed.delimiter).toBe('\t');
    expect(roles(parsed.columns)).toEqual([
      'day',
      'time',
      'name',
      'category',
      'boatClass',
      'ignore',
      'ignore',
    ]);
  });

  it('carries the day down and reads afternoon times on a 12-hour clock', () => {
    expect(parsed.rows.map((r) => [r.kind, r.day, r.time, r.category ?? '', r.boatClass])).toEqual([
      ['race', '2025-05-17', '08:00', 'Varsity', '8+'],
      ['race', '2025-05-17', '08:21', 'JV', '8+'],
      ['logistics', '2025-05-17', null, '', null],
      ['race', '2025-05-17', '12:58', 'Novice', '4+'],
      ['race', '2025-05-17', '13:54', 'JV', '4+'],
      ['race', '2025-05-18', '08:00', 'Varsity', '4+'],
    ]);
  });

  it('re-applies a user-edited mapping', () => {
    const edited = parsed.columns.map((c) =>
      c.role === 'category' ? { ...c, role: 'name' as const } : c,
    );
    const rows = applyColumnMapping(parsed.raw, edited, { year: 2025 });
    expect(rows[0]!.name).toBe("Youth Men's 8+ Varsity");
    expect(rows[0]!.category).toBeUndefined();
    const noName = parsed.columns.map((c) =>
      c.role === 'name' ? { ...c, role: 'ignore' as const } : c,
    );
    expect(applyColumnMapping(parsed.raw, noName, { year: 2025 })[0]!.name).toBe('Varsity 8+');
  });
});

describe('headerless comma paste', () => {
  it('guesses columns by content alone', () => {
    const parsed = parseSchedulePaste(
      '14,9:40,Men\'s Junior 4+,Heat 1\n15,9:52,"Women\'s Junior 4x, lightweight",Heat 1\n16,,,\n',
    );
    expect(parsed.delimiter).toBe(',');
    expect(roles(parsed.columns)).toEqual(['eventNumber', 'time', 'name', 'stage']);
    expect(parsed.rows.map((r) => [r.eventNumber, r.name, r.boatClass, r.time])).toEqual([
      ['14', "Men's Junior 4+", '4+', '09:40'],
      ['15', "Women's Junior 4x, lightweight", '4x', '09:52'],
      ['16', 'Event 16', null, null],
    ]);
  });

  it('returns nothing, with zero confidence, for empty input', () => {
    expect(parseSchedulePaste('')).toMatchObject({ rows: [], confidence: 0 });
    expect(parseSchedulePaste('\n  \n')).toMatchObject({ rows: [], confidence: 0 });
  });

  it('a single column of names still parses classes', () => {
    const parsed = parseSchedulePaste("Men's Eight\nWomen's Quad\nAwards");
    expect(parsed.rows.map((r) => [r.kind, r.boatClass])).toEqual([
      ['race', '8+'],
      ['race', '4x'],
      ['logistics', null],
    ]);
  });
});

describe('cell parsers', () => {
  it('parseClockTime', () => {
    expect(parseClockTime('8:00')).toBe('08:00');
    expect(parseClockTime('08:16')).toBe('08:16');
    expect(parseClockTime('1:04 PM')).toBe('13:04');
    expect(parseClockTime('1:04')).toBe('13:04');
    expect(parseClockTime('6:15')).toBe('06:15');
    expect(parseClockTime('12:30 am')).toBe('00:30');
    expect(parseClockTime('12:10 p.m.')).toBe('12:10');
    expect(parseClockTime('11:59AM')).toBe('11:59');
    expect(parseClockTime('17:20')).toBe('17:20');
    expect(parseClockTime('9:40:00')).toBe('09:40');
    expect(parseClockTime('TBD')).toBeNull();
    expect(parseClockTime('—')).toBeNull();
    expect(parseClockTime('13:00 PM')).toBeUndefined();
    expect(parseClockTime('9:75')).toBeUndefined();
    expect(parseClockTime('25:00')).toBeUndefined();
    expect(parseClockTime('Lunch')).toBeUndefined();
  });

  it('parseScheduleDay', () => {
    const days = ['2025-05-16', '2025-05-17', '2025-05-18'];
    expect(parseScheduleDay('2025-05-17')).toBe('2025-05-17');
    expect(parseScheduleDay('5/17/2025')).toBe('2025-05-17');
    expect(parseScheduleDay('5/17/25')).toBe('2025-05-17');
    expect(parseScheduleDay('5/17', { year: 2025 })).toBe('2025-05-17');
    expect(parseScheduleDay('5/17', { days })).toBe('2025-05-17');
    expect(parseScheduleDay('5/17')).toBeUndefined();
    expect(parseScheduleDay('May 17, 2025')).toBe('2025-05-17');
    expect(parseScheduleDay('Saturday, May 17th', { year: 2025 })).toBe('2025-05-17');
    expect(parseScheduleDay('Sun', { days })).toBe('2025-05-18');
    expect(parseScheduleDay('Fri.', { days })).toBe('2025-05-16');
    expect(parseScheduleDay('Day 2', { days })).toBe('2025-05-17');
    expect(parseScheduleDay('2/30/2025')).toBeUndefined();
    expect(parseScheduleDay('Monahan')).toBeUndefined();
  });

  it('parseEventNumber and parseStage', () => {
    expect(parseEventNumber('14A')).toBe('14A');
    expect(parseEventNumber('Event 14')).toBe('14');
    expect(parseEventNumber('#7')).toBe('7');
    expect(parseEventNumber('1x')).toBeUndefined();
    expect(parseEventNumber('1234')).toBeUndefined();
    expect(parseStage('Time Trial')).toBe('time_trial');
    expect(parseStage('TT')).toBe('time_trial');
    expect(parseStage('Semifinal 2')).toBe('semi');
    expect(parseStage('SF1')).toBe('semi');
    expect(parseStage('Petite Final')).toBe('final');
    expect(parseStage('FA')).toBe('final');
    expect(parseStage('Heat 3')).toBe('heat');
    expect(parseStage('Repechage')).toBe('heat');
    expect(parseStage('Race')).toBe('race');
    expect(parseStage('Race', true)).toBeNull();
    expect(parseStage('Lunch')).toBeNull();
  });

  it('detectPasteDelimiter', () => {
    expect(detectPasteDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectPasteDelimiter('a,b\n1,2')).toBe(',');
    expect(detectPasteDelimiter('1   8:00   Youth 8+\n2   8:10   Youth 4+, heat')).toBe('spaces');
    expect(detectPasteDelimiter('')).toBe('spaces');
  });

  it('parseBoatClass ignores digits inside numbers and times', () => {
    expect(parseBoatClass('U18 4+')).toBe('4+');
    expect(parseBoatClass('Bus departs 8:15')).toBeNull();
    expect(parseBoatClass('Event 14A')).toBeNull();
    expect(parseBoatClass('2V8')).toBe('8+');
    expect(parseBoatClass('U17 8 B')).toBe('8+');
  });
});

describe('parsedEventToRecord', () => {
  it('builds a race record in the regatta zone', () => {
    const rec = parsedEventToRecord(
      {
        kind: 'race',
        eventNumber: '14A',
        name: "Men's U17 4+",
        boatClass: '4+',
        category: 'U17',
        day: '2025-05-17',
        time: '09:40',
        stage: null,
        raw: [],
      },
      {
        regattaId: 'r1',
        timezone: 'America/Los_Angeles',
        fallbackDay: '2025-05-16',
        sortOrder: 3,
        source: 'paste',
      },
    );
    expect(rec).toEqual({
      regattaId: 'r1',
      kind: 'race',
      name: "Men's U17 4+",
      day: '2025-05-17',
      scheduledAt: '2025-05-17T16:40:00.000Z',
      sortOrder: 3,
      boatClass: '4+',
      stage: 'race',
      eventNumber: '14A',
      category: 'U17',
      source: 'paste',
    });
  });

  it('builds a logistics record without a time on the fallback day', () => {
    const rec = parsedEventToRecord(
      { kind: 'logistics', name: 'Lunch', time: null, raw: [] },
      { regattaId: 'r1', timezone: 'America/Los_Angeles', fallbackDay: '2025-05-16', sortOrder: 1 },
    );
    expect(rec).toEqual({
      regattaId: 'r1',
      kind: 'logistics',
      name: 'Lunch',
      day: '2025-05-16',
      scheduledAt: null,
      sortOrder: 1,
    });
  });
});
