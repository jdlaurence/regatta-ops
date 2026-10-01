// Rosters, the four regattas, their load plans, and the findings the conflict engine raises on
// them (PLAN.md §9.2, §14).

import { describe, expect, it } from 'vitest';
import {
  SEATS,
  clockAt,
  findConflicts,
  juniorAgeGroup,
  mastersCategory,
  seatsFor,
  type Finding,
  type FindingCode,
  type Id,
} from '@srt/domain';
import {
  BOYS_SHELF_IDS,
  GIRLS_SHELF_IDS,
  SCHEDULE_ROWS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  buildSeedWorld,
  seedShellId,
} from '../src';
import { conflictInputFor } from './helpers/conflict-input';

const { world } = buildSeedWorld();
const TZ = 'America/Los_Angeles';
const NW = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const TOTL = SEED_REGATTA_IDS.tailOfTheLake2026;
const ARCHIVED = SEED_REGATTA_IDS.headOfTheLake2025;

const byTeam = (teamId: Id) => world.athletes.filter((a) => a.teamId === teamId);
const eventsOf = (regattaId: Id) => world.events.filter((e) => e.regattaId === regattaId);
const entriesOf = (regattaId: Id) => world.entries.filter((e) => e.regattaId === regattaId);
const eventById = new Map(world.events.map((e) => [e.id, e]));
const findings = (regattaId: Id) => findConflicts(conflictInputFor(world, regattaId));
const count = (fs: Finding[], code: FindingCode) => fs.filter((f) => f.code === code).length;
const seatsOf = (entryId: Id) => world.entry_seats.filter((s) => s.entryId === entryId);

describe('rosters', () => {
  it('has 78 junior boys, 57 junior girls, 14 5am masters, and 12 evening masters', () => {
    expect(byTeam(SEED_TEAM_IDS.boys)).toHaveLength(78);
    expect(byTeam(SEED_TEAM_IDS.girls)).toHaveLength(57);
    expect(byTeam(SEED_TEAM_IDS.fiveAm)).toHaveLength(14);
    expect(byTeam(SEED_TEAM_IDS.evening)).toHaveLength(12);
    expect(world.teams.map((t) => [t.name, t.shortName, t.colorKey])).toEqual([
      ['Junior boys', 'Boys', 'navy'],
      ['Junior girls', 'Girls', 'raspberry'],
      ['5am masters', '5am', 'green'],
      ['Evening masters', 'Evening', 'violet'],
    ]);
  });

  it("gives each junior team its roster's coxswains, scullers, novices, and U15 to U19", () => {
    for (const [teamId, coxCount] of [
      [SEED_TEAM_IDS.boys, 9],
      [SEED_TEAM_IDS.girls, 8],
    ] as const) {
      const team = byTeam(teamId);
      const coxes = team.filter((a) => a.side === 'none');
      expect(coxes).toHaveLength(coxCount);
      for (const c of coxes) expect(c.canCox).toBe(true);
      expect(team.some((a) => a.canScull)).toBe(true);
      expect(new Set(team.map((a) => a.level))).toEqual(new Set(['novice', 'experienced']));
      expect(new Set(team.map((a) => a.side))).toEqual(
        new Set(['port', 'starboard', 'both', 'none']),
      );
      const groups = new Set(team.map((a) => juniorAgeGroup(a.birthYear!, 2026)));
      expect(groups).toEqual(new Set(['U15', 'U16', 'U17', 'U19']));
    }
  });

  it('spans masters categories B to F', () => {
    const masters = [...byTeam(SEED_TEAM_IDS.fiveAm), ...byTeam(SEED_TEAM_IDS.evening)];
    const cats = new Set(masters.map((a) => mastersCategory(2026 - a.birthYear!)));
    expect(cats).toEqual(new Set(['B', 'C', 'D', 'E', 'F']));
  });

  it('keeps the junior rosters active and one masters athlete inactive', () => {
    const inactive = world.athletes.filter((a) => a.status === 'inactive');
    expect(inactive.map((a) => a.teamId)).toEqual([SEED_TEAM_IDS.evening]);
  });
});

describe('2025 Northwest Youth Championships', () => {
  const races = eventsOf(NW).filter((e) => e.kind === 'race');
  const boysRaces = races.filter((e) => e.source === 'schedule-sample-2025-nw-youth-champs.csv');

  it('is a final three-day sprint regatta at Vancouver Lake with a 75 minute launch lead', () => {
    expect(world.regattas.find((r) => r.id === NW)).toMatchObject({
      venue: 'Vancouver Lake',
      startDate: '2025-05-16',
      endDate: '2025-05-18',
      format: 'sprint',
      status: 'final',
      settings: { launchLeadMin: 75 },
    });
  });

  it('groups the sheet’s race rows into races: A and B crews of one race share an event', () => {
    const csvRaces = SCHEDULE_ROWS.filter((r) => r.kind === 'race');
    const distinct = new Set(
      csvRaces.map(
        (r) => `${r.day}|${r.time}|${r.name.replace(/\bMens\b/, "Men's").replace(/\s+[AB]$/, '')}`,
      ),
    );
    // PLAN.md §14 says 41; the CSV has 44 race rows making 31 races (see the WP-S report).
    expect(csvRaces).toHaveLength(44);
    expect(boysRaces).toHaveLength(distinct.size);
    expect(boysRaces).toHaveLength(31);
    expect(races.length - boysRaces.length).toBe(14); // invented women's races
    const boysEntries = entriesOf(NW).filter((e) => e.teamId === SEED_TEAM_IDS.boys);
    expect(boysEntries).toHaveLength(csvRaces.length);
    const u17 = boysRaces.find((e) => e.name === "U17 Men's 8+" && e.day === '2025-05-16')!;
    expect(boysEntries.filter((e) => e.eventId === u17.id).map((e) => e.label)).toEqual([
      'U17 8 A',
      'U17 8 B',
    ]);
  });

  it('keeps the logistics lines in sheet order among the races', () => {
    const logistics = eventsOf(NW).filter((e) => e.kind === 'logistics');
    expect(logistics.map((e) => e.name)).toEqual(
      SCHEDULE_ROWS.filter((r) => r.kind === 'logistics').map((r) => r.name),
    );
    for (const l of logistics) expect(l.teamFilter).toEqual([SEED_TEAM_IDS.boys]);
    const sorted = [...eventsOf(NW)].sort((a, b) => a.sortOrder - b.sortOrder);
    const lunch = sorted.findIndex((e) => e.name === 'LUNCH TIME STARTS ~ 11:00');
    expect(sorted[lunch - 1]!.name).toBe("2V Men's 4+"); // 11:08 in the sheet, before lunch
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.day >= sorted[i - 1]!.day).toBe(true);
    }
  });

  it('puts times in the regatta zone and parses stages', () => {
    const tt = boysRaces.find((e) => e.name === "2V Men's 8+")!;
    expect(tt).toMatchObject({ stage: 'time_trial', boatClass: '8+', day: '2025-05-16' });
    expect(tt.scheduledAt).toBe('2025-05-16T15:16:00.000Z');
    const finalB = boysRaces.find((e) => e.name === "Novice Men's 8+ Final B")!;
    expect(finalB).toMatchObject({ stage: 'final', progressionGroup: "Novice Men's 8+" });
  });

  it('uses the sheet’s shells and oars, and notes names the fleet does not have', () => {
    const rsa = entriesOf(NW).filter((e) => e.notes?.includes('RSA'));
    expect(rsa).toHaveLength(2);
    for (const e of rsa) {
      expect(e.shellId).toBeNull();
      expect(e.notes).toBe('Sheet says RSA; not in the fleet list');
    }
    const lundberg = entriesOf(NW).filter((e) => e.shellId === seedShellId('Lundberg'));
    expect(lundberg.map((e) => e.boatClass)).toEqual(['4+', '4x+', '4x+']);
  });

  it('has LLL racing the 2V8 at 8:16 and the novice 8 A at 9:52 on Friday', () => {
    const lll = entriesOf(NW)
      .filter((e) => e.shellId === seedShellId('Live.Laugh.Love'))
      .map((e) => ({ e, ev: eventById.get(e.eventId!)! }))
      .filter(({ ev }) => ev.day === '2025-05-16');
    expect(lll.map(({ e, ev }) => `${clockAt(ev.scheduledAt!, TZ)} ${e.label}`)).toEqual([
      '8:16 2V8',
      '9:52 N8 A',
      '16:32 3V8',
    ]);
  });

  it('crews every race, seats coxswains in cox seats, and matches novice and U-age events', () => {
    const athletes = new Map(world.athletes.map((a) => [a.id, a]));
    let seats = 0;
    let filled = 0;
    for (const e of entriesOf(NW)) {
      const ev = eventById.get(e.eventId!)!;
      const crew = seatsOf(e.id);
      seats += seatsFor(e.boatClass).length;
      filled += crew.length;
      for (const s of crew) {
        const a = athletes.get(s.athleteId!)!;
        if (s.seat === 'cox') expect(a.canCox).toBe(true);
        else expect(a.side).not.toBe('none');
        if (s.seat !== 'cox' && ev.category?.includes('Novice')) expect(a.level).toBe('novice');
      }
    }
    expect(filled / seats).toBeGreaterThan(0.97);
  });

  it('raises the intended findings and no accidental errors', () => {
    const fs = findings(NW);
    const hot = fs.filter((f) => f.code === 'SHELL_HOT_SEAT');
    const lllHot = hot.find((f) => f.resource?.id === seedShellId('Live.Laugh.Love'))!;
    expect(lllHot).toMatchObject({ severity: 'warning', gapMin: 71, day: '2025-05-16' });
    expect(hot.find((f) => f.resource?.id === seedShellId('Alma Marie'))?.gapMin).toBe(55);
    expect(hot).toHaveLength(2);
    const rerig = fs.filter((f) => f.code === 'RERIG_NEEDED');
    expect(rerig.map((f) => f.resource?.id)).toEqual([seedShellId('Lundberg')]);
    expect(count(fs, 'NO_SHELL')).toBe(2); // RSA
    expect(count(fs, 'NOT_ON_TRAILER')).toBe(2); // Hans and Fowler
    expect(count(fs, 'SHELL_LIMITED')).toBe(4); // Fowler
    for (const code of [
      'ATHLETE_DOUBLE_BOOKED',
      'ATHLETE_UNAVAILABLE',
      'SHELL_CONFLICT',
      'SHELL_OUT_OF_SERVICE',
      'CLASS_MISMATCH',
      'RIGGING_MISMATCH',
      'OARS_SHORT',
      'SIDE_MISMATCH',
      'COX_NOT_COX',
      'SCULLER_NOT_SCULLER',
      'AGE_GROUP',
      'ATHLETE_BORROWED',
    ] as const) {
      expect(count(fs, code), code).toBe(0);
    }
    // The sheet's own oar sharing (24-D split between two fours racing together, 24-C handed
    // from the V4+ to the 3V4+ sixteen minutes later) fits within each set's count, so the
    // engine treats it as a split, not a conflict. No errors remain.
    const errors = fs.filter((f) => f.severity === 'error');
    expect(errors).toEqual([]);
    // Forty boys cannot cover the novice window with an hour between every race.
    expect(count(fs, 'ATHLETE_TIGHT')).toBeLessThanOrEqual(16);
    expect(count(fs, 'SEATS_EMPTY')).toBeLessThanOrEqual(3);
  });

  it('marks one boy out for the weekend and one girl out on Sunday only', () => {
    const av = world.availability.filter((a) => a.regattaId === NW);
    expect(av).toHaveLength(2);
    const sunday = av.find((a) => a.days)!;
    expect(sunday).toMatchObject({ status: 'available', days: { '2025-05-18': 'unavailable' } });
    const sundayEntries = entriesOf(NW).filter(
      (e) => eventById.get(e.eventId!)!.day === '2025-05-18',
    );
    for (const e of sundayEntries) {
      expect(seatsOf(e.id).some((s) => s.athleteId === sunday.athleteId)).toBe(false);
    }
  });

  it('has the boys’ published lineups, one seat changed since', () => {
    const rt = world.regatta_teams.find(
      (r) => r.regattaId === NW && r.teamId === SEED_TEAM_IDS.boys,
    )!;
    const snapshot = rt.publishedSnapshot!;
    expect(snapshot.entries).toHaveLength(44);
    let changed = 0;
    for (const pe of snapshot.entries) {
      for (const s of pe.seats) {
        const live = seatsOf(pe.entryId).find((x) => x.seat === s.seat);
        // Snapshots list every seat of the class (empty = null); the live draft has no record.
        if ((live?.athleteId ?? null) !== (s.athleteId ?? null)) changed++;
      }
    }
    expect(changed).toBe(1);
  });
});

describe('load plans', () => {
  const plans = world.load_plans.filter((p) => p.regattaId === NW);
  const shelves = new Map(world.trailer_shelves.map((s) => [s.id, s]));
  const shells = new Map(world.shells.map((s) => [s.id, s]));

  /** Rows top to bottom (levels 5 to 2), narrow side then wide lanes 0 and 1: the class grid. */
  function grid(trailerId: Id, map: Readonly<Record<string, Id>>, prefix: string): string[] {
    const plan = plans.find((p) => p.trailerId === trailerId)!;
    const placed = world.load_placements.filter((p) => p.loadPlanId === plan.id);
    const at = (shelf: string, lane: number) => {
      const p = placed.find((x) => x.shelfId === map[`${prefix}${shelf}`] && x.lane === lane);
      if (!p) return '—';
      const cls = shells.get(p.shellId)!.boatClass;
      return cls === '8+' ? '8' : cls;
    };
    return [5, 4, 3, 2].map((t) => [at(`l${t}`, 0), at(`r${t}`, 0), at(`r${t}`, 1)].join(' '));
  }

  it('mirrors the 2026 Regionals sheet on both trailers', () => {
    expect(plans).toHaveLength(2);
    for (const p of plans) expect(p).toMatchObject({ status: 'draft', packedAt: null });
    expect(grid(SEED_TRAILER_IDS.boys, BOYS_SHELF_IDS, '')).toEqual([
      '8 8 8',
      '8 8 8',
      '8 4- 4+', // Third Thursday is a 4-
      '4+ 4+ 4+',
    ]);
    expect(grid(SEED_TRAILER_IDS.girls, GIRLS_SHELF_IDS, 'g')).toEqual([
      '8 8 8',
      '4+ 8 4+',
      '4+ 4+ 4+',
      '— 4x 4x',
    ]);
  });

  it('fits every boat on its shelf, eights hanging forward over the truck', () => {
    const lanes = new Set<string>();
    for (const p of world.load_placements) {
      const shelf = shelves.get(p.shelfId)!;
      const shell = shells.get(p.shellId)!;
      const front = Math.max(0, -p.offsetCm);
      const rear = Math.max(0, p.offsetCm + shell.lengthCm! - shelf.lengthCm);
      expect(front).toBeLessThanOrEqual(shelf.frontOverhangMaxCm);
      expect(rear).toBeLessThanOrEqual(shelf.rearOverhangMaxCm);
      if (shell.boatClass === '8+') expect(front).toBe(shelf.frontOverhangMaxCm);
      expect(p.lane).toBeLessThan(shelf.columnKey === 'left' ? 1 : 2);
      expect(p.locked).toBe(false);
      expect(p.reasons.length).toBeGreaterThan(0);
      const key = `${p.loadPlanId}|${p.shelfId}|${p.lane}`;
      expect(lanes.has(key)).toBe(false);
      lanes.add(key);
    }
  });

  it('has a few checked-off load items', () => {
    const items = world.load_items.filter((i) => i.regattaId === NW);
    expect(items.filter((i) => i.loadedAt).length).toBeGreaterThanOrEqual(3);
    expect(items.some((i) => i.returnedAt)).toBe(true);
    expect(items.some((i) => i.loadPlanId === null && i.container?.startsWith('Truck'))).toBe(true);
  });
});

describe('Head of the Lake 2026', () => {
  it('is a one-day head race in planning with 22 events, all four teams, and 24 entries', () => {
    expect(world.regattas.find((r) => r.id === HOTL)).toMatchObject({
      city: 'Seattle, WA',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      format: 'head',
      status: 'planning',
    });
    expect(eventsOf(HOTL)).toHaveLength(22);
    expect(world.regatta_teams.filter((r) => r.regattaId === HOTL)).toHaveLength(4);
    const entries = entriesOf(HOTL);
    expect(entries).toHaveLength(24);
    expect(new Set(entries.map((e) => e.teamId)).size).toBe(4);
    for (const e of entries) {
      expect(e.shellId && e.oarSetId).toBeTruthy();
      expect(seatsOf(e.id)).toHaveLength(seatsFor(e.boatClass).length);
    }
    // Standard time after daylight saving ends that morning.
    const first = eventsOf(HOTL).find((e) => e.eventNumber === '1')!;
    expect(first.scheduledAt).toBe('2026-11-01T16:00:00.000Z');
  });

  it('marks a few athletes unavailable, one with a reason, and keeps them out of boats', () => {
    const av = world.availability.filter((a) => a.regattaId === HOTL);
    const out = av.filter((a) => a.status === 'unavailable');
    expect(out).toHaveLength(3);
    expect(out.filter((a) => a.reason)).toHaveLength(1);
    expect(av.filter((a) => a.status === 'maybe')).toHaveLength(1);
    const seated = new Set(
      world.entry_seats
        .filter((s) => entriesOf(HOTL).some((e) => e.id === s.entryId))
        .map((s) => s.athleteId),
    );
    for (const a of av) expect(seated.has(a.athleteId)).toBe(false);
  });

  it('raises exactly one cross-team hot seat and one shell conflict', () => {
    const fs = findings(HOTL);
    const serious = fs.filter((f) => f.severity !== 'info');
    expect(serious.map((f) => f.code).sort()).toEqual(['SHELL_CONFLICT', 'SHELL_HOT_SEAT']);
    const hot = serious.find((f) => f.code === 'SHELL_HOT_SEAT')!;
    expect(hot).toMatchObject({ gapMin: 25, resource: { id: seedShellId('Lee Henderson') } });
    expect(new Set(hot.teamIds)).toEqual(new Set([SEED_TEAM_IDS.girls, SEED_TEAM_IDS.fiveAm]));
    const conflict = serious.find((f) => f.code === 'SHELL_CONFLICT')!;
    expect(conflict.resource?.id).toBe(seedShellId('Kokanee'));
    expect(new Set(conflict.teamIds)).toEqual(new Set([SEED_TEAM_IDS.boys, SEED_TEAM_IDS.evening]));
    expect(fs.filter((f) => f.severity === 'info')).toEqual([]);
  });
});

describe('Tail of the Lake 2026', () => {
  it('has pasted events and no entries yet', () => {
    const r = world.regattas.find((x) => x.id === TOTL)!;
    expect(r).toMatchObject({ startDate: '2026-10-18', format: 'head', status: 'planning' });
    expect(eventsOf(TOTL).length).toBeGreaterThan(10);
    for (const e of eventsOf(TOTL)) expect(e.source).toBe('paste');
    expect(entriesOf(TOTL)).toEqual([]);
    expect(findings(TOTL)).toEqual([]);
  });
});

describe('2025 Head of the Lake (archived)', () => {
  it('has complete lineups for every team to copy from, and nothing to fix', () => {
    expect(world.regattas.find((r) => r.id === ARCHIVED)?.status).toBe('archived');
    const entries = entriesOf(ARCHIVED);
    expect(new Set(entries.map((e) => e.teamId)).size).toBe(4);
    for (const e of entries) {
      expect(
        seatsOf(e.id)
          .map((s) => s.seat)
          .sort(),
      ).toEqual(
        [...seatsFor(e.boatClass)].sort((a, b) => SEATS.indexOf(a) - SEATS.indexOf(b)).sort(),
      );
    }
    expect(entries.filter((e) => e.status === 'scratched')).toHaveLength(1);
    const fs = findings(ARCHIVED);
    expect(fs.filter((f) => f.severity !== 'info')).toEqual([]);
    const published = world.regatta_teams.filter((r) => r.regattaId === ARCHIVED);
    expect(published.every((r) => r.publishedSnapshot?.entries.length)).toBe(true);
  });
});

describe('what is upcoming', () => {
  it('has two upcoming regattas after 2026-09-29 and two past ones', () => {
    const upcoming = world.regattas.filter((r) => r.startDate > '2026-09-29').map((r) => r.id);
    expect(upcoming.sort()).toEqual([HOTL, TOTL].sort());
  });
});
