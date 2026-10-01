import { describe, expect, it } from 'vitest';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS, SEED_TRAILER_IDS } from '@regatta-ops/seed';
import { zonedToInstant } from '@regatta-ops/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import {
  chunkColumns,
  dayScheduleRows,
  lineupGrids,
  lineupSheetPages,
  lineupsFor,
  listScheduleDays,
  listScheduleRows,
  loadSheet,
  masterScheduleRows,
  regattaDays,
  scheduleDays,
  teamLineups,
  unboatedFor,
  type GridContext,
  type ListScheduleRow,
  type ScheduleRow,
} from './derive';
import { NO_FILTERS } from '@/features/schedule/lib';
import { oarText, paperSeatOrder, shortName } from './format';
import { loadWorkingSet, seedStore } from './test-helpers';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const BOYS = SEED_TEAM_IDS.boys;
const FRI = '2025-05-16';

function rowText(r: ScheduleRow): string {
  return r.kind === 'logistics' ? `L:${r.event.name}` : `R:${r.entry.label}`;
}

describe('which lineups print', () => {
  it("prints the boys' published snapshot and counts the change since", async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const tl = teamLineups(ws, BOYS, 'published')!;
    expect(tl.source).toBe('published');
    expect(tl.publishedAt).toBe('2025-05-14T04:00:00.000Z');
    expect(tl.entries).toHaveLength(44);
    // Schedule order: the first race of the regatta first.
    expect(tl.entries[0]).toMatchObject({ label: 'V8', stage: 'time_trial', day: FRI });
    expect(tl.changes.map((c) => c.kind)).toEqual(['seat']);
    expect(tl.changes[0]!.text).toMatch(/^Seat 1 of V8 \(Fri 8:00 AM\): .+ → .+$/);

    const live = teamLineups(ws, BOYS, 'live')!;
    expect(live.source).toBe('live');
    expect(live.publishedAt).toBe(tl.publishedAt);
    const bow = (e: (typeof live.entries)[number]) =>
      e.seats.find((s) => s.seat === '1')?.athleteId;
    expect(bow(live.entries[0]!)).not.toBe(bow(tl.entries[0]!));
  });

  it('falls back to the live draft for a team that has not published', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const girls = teamLineups(ws, SEED_TEAM_IDS.girls, 'published')!;
    expect(girls.source).toBe('live');
    expect(girls.requested).toBe('published');
    expect(girls.publishedAt).toBeNull();
    expect(girls.changes).toEqual([]);
    expect(teamLineups(ws, 'nosuchteam00000', 'live')).toBeNull();
    expect(lineupsFor(ws, null, 'published').map((l) => l.team.shortName)).toEqual([
      'Boys',
      'Girls',
    ]);
  });
});

describe('lineup sheet pages', () => {
  it('makes one page per team per day, and one page for a chosen day', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    expect(regattaDays(ws)).toEqual(['2025-05-16', '2025-05-17', '2025-05-18']);
    const boys = lineupsFor(ws, BOYS, 'published');
    const pages = lineupSheetPages(boys, null);
    expect(pages.map((p) => [p.day, p.entries.length])).toEqual([
      ['2025-05-16', 22],
      ['2025-05-17', 11],
      ['2025-05-18', 11],
    ]);
    // Entries in time order within a day.
    const times = pages[0]!.entries.map((e) => e.scheduledAt!);
    expect([...times].sort()).toEqual(times);
    expect(lineupSheetPages(boys, '2025-05-17').map((p) => p.entries.length)).toEqual([11]);
    const both = lineupSheetPages(lineupsFor(ws, null, 'live'), FRI);
    expect(both.map((p) => p.lineups.team.shortName)).toEqual(['Boys', 'Girls']);
  });

  it('prints one empty page for a team without entries, and puts unscheduled entries last', async () => {
    const store = fixtureStore();
    let ws = await loadWorkingSet(store, IDS.regatta);
    expect(lineupSheetPages(lineupsFor(ws, IDS.girls, 'live'), null)).toMatchObject([
      { day: null, entries: [] },
    ]);
    await store.create('entries', {
      regattaId: IDS.regatta,
      teamId: IDS.boys,
      label: '2V8',
      boatClass: '8+',
      status: 'draft',
    });
    ws = await loadWorkingSet(store, IDS.regatta);
    const pages = lineupSheetPages(lineupsFor(ws, IDS.boys, 'live'), null);
    expect(pages.map((p) => [p.day, p.entries.map((e) => e.label)])).toEqual([
      ['2026-11-01', ['V4+']],
      [null, ['2V8']],
    ]);
  });

  it('lists coming, active athletes seated in none of the printed entries', async () => {
    const store = fixtureStore();
    const ws = await loadWorkingSet(store, IDS.regatta);
    const boys = teamLineups(ws, IDS.boys, 'live')!;
    // Rowan sits in the V4+; the masters athlete is borrowed and not on the boys' roster.
    expect(unboatedFor(ws, IDS.boys, boys.entries).map((a) => a.firstName)).toEqual(['Emery']);
    expect(unboatedFor(ws, IDS.boys, []).map((a) => a.firstName)).toEqual(['Emery', 'Rowan']);
    await store.create('availability', {
      regattaId: IDS.regatta,
      athleteId: 'athboys00000002',
      status: 'unavailable',
    });
    const after = await loadWorkingSet(store, IDS.regatta);
    expect(unboatedFor(after, IDS.boys, boys.entries)).toEqual([]);
  });
});

describe('lineup grid', () => {
  async function grids(source: 'published' | 'live') {
    const ws = await loadWorkingSet(seedStore(), NW);
    const tl = teamLineups(ws, BOYS, source)!;
    const ctx: GridContext = {
      timeZone: ws.regatta.timezone,
      withDay: true,
      groupOf: (id) => (id ? ws.byId.events.get(id)?.progressionGroup : undefined),
      oarText: (e) => oarText(e, ws.byId.oarSets),
    };
    return lineupGrids(tl.entries, ctx);
  }

  it('puts eights in one table and smaller boats in another, seats cox first then stroke to bow', async () => {
    const [eights, small] = await grids('live');
    expect(eights!.title).toBe('Eights');
    expect(eights!.seats).toEqual(['cox', '8', '7', '6', '5', '4', '3', '2', '1']);
    expect(eights!.stages).toEqual(['time_trial', 'final']);
    expect(small!.title).toBe('Fours and smaller boats');
    expect(small!.seats).toEqual(['cox', '4', '3', '2', '1']);
    // The coxless four has no cox cell at all; an empty seat is null.
    const v4minus = small!.columns.find((c) => c.label === 'V4-')!;
    expect('cox' in v4minus.cells).toBe(false);
    expect(v4minus.cells['4']).toEqual(expect.any(String));
  });

  it("merges a crew's time trial and final into one column when the lineup is the same", async () => {
    const [eights] = await grids('live');
    const v8 = eights!.columns.filter((c) => c.label === 'V8');
    expect(v8).toHaveLength(1);
    expect(v8[0]).toMatchObject({
      event: "Youth Men's 8+",
      times: { time_trial: 'Fri 8:00 AM', final: 'Sat 8:00 AM' },
      shell: 'Peggy',
      oars: '24-C · yellow-white',
    });
  });

  it('splits a crew whose published lineup changed between stages, side by side', async () => {
    const [eights] = await grids('published');
    const labels = eights!.columns.map((c) => c.label);
    expect(labels.slice(0, 2)).toEqual(['V8', 'V8']);
    expect(eights!.columns[0]!.times).toEqual({ time_trial: 'Fri 8:00 AM' });
    expect(eights!.columns[1]!.times).toEqual({ final: 'Sat 8:00 AM' });
  });

  it('chunks wide grids evenly', () => {
    const cols = Array.from({ length: 14 }, (_, i) => i);
    expect(chunkColumns(cols, 11).map((c) => c.length)).toEqual([7, 7]);
    expect(chunkColumns(cols.slice(0, 11), 11).map((c) => c.length)).toEqual([11]);
    expect(chunkColumns([], 11)).toEqual([[]]);
  });
});

describe('day and master schedules', () => {
  it('interleaves untimed logistics lines by their sheet order', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const boys = lineupsFor(ws, BOYS, 'published');
    const rows = dayScheduleRows(ws, boys, FRI, BOYS).map(rowText);
    expect(rows.slice(0, 3)).toEqual([
      'L:Bus Departs Hotel @ 6:15 AM - V8, 2V8, U178 A, U17 8 B (36 boys)',
      'L:Bus Departs Hotel @ 8:00 AM - N8 a, N8 b, u16 8 a, u16 8 b',
      'R:V8',
    ]);
    const lunch = rows.indexOf('L:LUNCH TIME STARTS ~ 11:00');
    expect(rows[lunch - 1]).toBe('R:2V4+');
    expect(rows[lunch + 1]).toMatch(/^L:Bus Departs Hotel @ 11:30 AM/);
    expect(rows[lunch + 2]).toBe('R:U16 8 A');
    expect(rows.slice(-2)).toEqual(['L:Bus Departs Course ~ 5:45pm', 'L:DINNER TIME']);
    expect(rows.filter((r) => r.startsWith('R:'))).toHaveLength(22);
    expect(scheduleDays(ws, boys, true)).toEqual(['2025-05-16', '2025-05-17', '2025-05-18']);
  });

  it('places timed logistics by time and filters lines to the team', async () => {
    const store = fixtureStore();
    const TZ = 'America/Los_Angeles';
    await store.create('events', {
      regattaId: IDS.regatta,
      kind: 'logistics',
      name: 'Coach and coxswain meeting',
      day: '2026-11-01',
      scheduledAt: zonedToInstant('2026-11-01', '10:00', TZ),
      sortOrder: 99,
    });
    await store.create('events', {
      regattaId: IDS.regatta,
      kind: 'logistics',
      name: 'Girls bus',
      day: '2026-11-01',
      teamFilter: [IDS.girls],
      sortOrder: 0,
    });
    await store.create('entries', {
      regattaId: IDS.regatta,
      eventId: IDS.event2,
      teamId: IDS.boys,
      label: 'V8',
      boatClass: '8+',
      status: 'planned',
    });
    const ws = await loadWorkingSet(store, IDS.regatta);
    const boys = lineupsFor(ws, IDS.boys, 'live');
    expect(dayScheduleRows(ws, boys, '2026-11-01', IDS.boys).map(rowText)).toEqual([
      'R:V4+',
      'L:Coach and coxswain meeting',
      'R:V8',
    ]);
    const all = lineupsFor(ws, null, 'live');
    const rows = dayScheduleRows(ws, all, '2026-11-01', null);
    expect(rows.map(rowText)).toEqual([
      'L:Girls bus',
      'R:V4+',
      'L:Coach and coxswain meeting',
      'R:V8',
    ]);
    const bus = rows[0]!;
    expect(bus.kind === 'logistics' && bus.teams.map((t) => t.shortName)).toEqual(['Girls']);
  });

  it('lists every team in time order for the master schedule', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const rows = masterScheduleRows(ws, lineupsFor(ws, null, 'published'), FRI);
    expect(rows.slice(0, 3).map((r) => [r.team.shortName, r.entry.label])).toEqual([
      ['Boys', 'V8'],
      ['Girls', 'V8'],
      ['Boys', '2V8'],
    ]);
    expect(rows.map((r) => r.source)).toContain('live');
    expect(rows.map((r) => r.source)).toContain('published');
    const times = rows.map((r) => r.entry.scheduledAt!);
    expect([...times].sort()).toEqual(times);
  });
});

describe('schedule list', () => {
  function listText(rows: ListScheduleRow[]): string[] {
    return rows.map((r) =>
      r.kind === 'logistics'
        ? `L:${r.event.name}`
        : `R:${r.event.eventNumber} ${r.entries.map((e) => `${e.team?.shortName} ${e.label}${e.scratched ? ' (scratched)' : ''}`).join(', ')}`.trim(),
    );
  }

  async function listWorld() {
    const store = fixtureStore();
    await store.create('entries', {
      regattaId: IDS.regatta,
      eventId: IDS.event2,
      teamId: IDS.girls,
      label: 'V8',
      boatClass: '8+',
      shellId: IDS.shell2,
      status: 'planned',
    });
    await store.create('entries', {
      regattaId: IDS.regatta,
      eventId: IDS.event2,
      teamId: IDS.boys,
      label: 'V8',
      boatClass: '8+',
      status: 'scratched',
    });
    await store.create('events', {
      regattaId: IDS.regatta,
      kind: 'logistics',
      name: 'Girls bus',
      day: '2026-11-01',
      teamFilter: [IDS.girls],
      sortOrder: 3,
    });
    return loadWorkingSet(store, IDS.regatta);
  }

  it('prints the schedule page list under its filters, with live lineups', async () => {
    const ws = await listWorld();
    const lineups = lineupsFor(ws, null, 'live');
    const day = '2026-11-01';
    const all = listScheduleRows(ws, lineups, day, NO_FILTERS);
    expect(listText(all)).toEqual([
      'R:12 Boys V4+',
      'R:14 Boys V8 (scratched), Girls V8',
      'L:Girls bus',
    ]);
    // Each entry carries its live lineup with names; a scratched one has none.
    const [first, second] = all as [
      ListScheduleRow & { kind: 'race' },
      ListScheduleRow & { kind: 'race' },
    ];
    expect(first.entries[0]!.lineup?.shellName).toBe('Spencer');
    expect(first.entries[0]!.lineup?.seats.find((s) => s.seat === '1')?.athleteName).toBeTruthy();
    expect(second.entries[0]!.lineup).toBeNull();
    expect(second.entries[1]!.lineup?.shellName).toBe('Monahan');

    const girls = { ...NO_FILTERS, teamId: IDS.girls };
    expect(listText(listScheduleRows(ws, lineups, day, girls))).toEqual([
      'R:14 Girls V8',
      'L:Girls bus',
    ]);
    const fours = { ...NO_FILTERS, boatClass: '4+' as const };
    expect(listText(listScheduleRows(ws, lineups, day, fours))).toEqual(['R:12 Boys V4+']);
    const monahan = { ...NO_FILTERS, shellId: IDS.shell2 };
    expect(listText(listScheduleRows(ws, lineups, day, monahan))).toEqual(['R:14 Girls V8']);

    expect(listScheduleDays(ws, NO_FILTERS)).toEqual([day]);
    expect(listScheduleDays(ws, { ...NO_FILTERS, boatClass: '1x' })).toEqual([]);
  });
});

describe('load sheet', () => {
  it('lists shelves from the top level down with their boats', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const sheet = loadSheet(ws, SEED_TRAILER_IDS.boys)!;
    expect(sheet.trailer.name).toBe('Boys trailer');
    expect(sheet.plan).not.toBeNull();
    expect(sheet.shelves[0]).toMatchObject({ levelText: '5 (top)', sideText: 'Narrow side' });
    expect(sheet.shelves.at(-1)).toMatchObject({ levelText: '1', sideText: 'Wide side' });
    expect(sheet.shelves.reduce((n, s) => n + s.placements.length, 0)).toBe(12);
    const top = sheet.shelves[1]!;
    expect(top.placements.map((p) => [p.laneText, p.shell?.nickname])).toEqual([
      ['1 (inner)', 'LLL'],
      ['2 (outer)', 'Waltar'],
    ]);
    expect(top.placements[0]!.teams.map((t) => t.shortName)).toEqual(['Boys']);
  });

  it('checks off what rides on this trailer, flags what has no home, and counts the rest', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const sheet = loadSheet(ws, SEED_TRAILER_IDS.boys)!;
    expect(sheet.groups.map((g) => g.title)).toEqual(['Shells', 'Riggers', 'Oars', 'Gear']);
    const shells = sheet.groups[0]!.rows;
    const lll = shells.find((r) => r.label.startsWith('Live.Laugh.Love'))!;
    expect(lll.where).toBe('Top level, wide side, lane 1 (inner)');
    expect(lll.stored?.loadedAt).toBeTruthy();
    // A shell on this trailer that no entry uses rides as a spare.
    expect(shells.find((r) => r.label === 'Kokanee')).toMatchObject({ spare: true });
    // A raced shell not on any trailer yet prints here, flagged.
    expect(shells.some((r) => r.unassigned && r.where === 'Not on a trailer yet')).toBe(true);
    // Girls' boats and truck-bed items are only counted.
    expect(shells.some((r) => r.label === 'WUBA')).toBe(false);
    expect(sheet.elsewhere.map((e) => e.where)).toEqual(
      expect.arrayContaining(['Girls trailer', 'Truck 1 bed', 'Truck 2 bed']),
    );
    const gear = sheet.groups.find((g) => g.kind === 'gear')!.rows;
    expect(gear.find((r) => r.label === 'Cox boxes')).toMatchObject({ where: 'Boys trailer bed' });
    expect(gear.some((r) => r.label === 'Slings')).toBe(false);
  });

  it('lists the bed zones front to back with what rides in each', async () => {
    const ws = await loadWorkingSet(seedStore(), NW);
    const sheet = loadSheet(ws, SEED_TRAILER_IDS.boys)!;
    expect(sheet.bed.map((z) => [z.name, z.extent, z.length])).toEqual([
      ['Oars', 'from the front to 6.1 m', '6.1 m'],
      ['Slings', '6.1 to 7.6 m from the front', '1.5 m'],
      ['Riggers (back of bed)', 'from 7.6 m to the back', '4.6 m'],
    ]);
    const [oars, slings, riggers] = sheet.bed;
    // Riggers of the boats on this trailer ride at the back of the bed.
    expect(riggers!.rows.length).toBeGreaterThan(5);
    expect(riggers!.rows.every((r) => r.kind === 'riggers')).toBe(true);
    expect(riggers!.rows.map((r) => r.label)).toContain('Riggers for LLL');
    const checklistRiggers = sheet.groups.find((g) => g.kind === 'riggers')!.rows;
    expect(checklistRiggers.find((r) => r.label === 'Riggers for LLL')).toMatchObject({
      where: 'Riggers (back of bed)',
    });
    // Oar sets: the one typed into the oar zone, and those whose first crew's shell is here.
    expect(oars!.rows.map((r) => r.label)).toContain('24-C · yellow-white');
    expect(oars!.rows.every((r) => r.kind === 'oar_set')).toBe(true);
    // The 2025 slings were typed into a truck bed.
    expect(slings!.rows).toEqual([]);
  });

  it('returns null for an unknown trailer and an empty plan without placements', async () => {
    const ws = await loadWorkingSet(fixtureStore(), IDS.regatta);
    expect(loadSheet(ws, 'nosuchtrailer00')).toBeNull();
    const sheet = loadSheet(ws, IDS.trailer)!;
    expect(sheet.plan).toBeNull();
    expect(sheet.shelves).toHaveLength(1);
    expect(sheet.shelves[0]!.placements).toEqual([]);
    expect(sheet.bed).toEqual([]);
    expect(sheet.groups[0]!.rows[0]).toMatchObject({ label: 'Spencer', unassigned: true });
  });
});

describe('print formatting', () => {
  it('orders seats on paper cox first, then stroke to bow', () => {
    expect(paperSeatOrder('8+')).toEqual(['cox', '8', '7', '6', '5', '4', '3', '2', '1']);
    expect(paperSeatOrder('2x')).toEqual(['2', '1']);
  });

  it('shortens names to first name and last initial', () => {
    expect(shortName('Ava Chen')).toBe('Ava C.');
    expect(shortName('Mary Ann Lee')).toBe('Mary Ann L.');
    expect(shortName('Ari')).toBe('Ari');
  });
});
