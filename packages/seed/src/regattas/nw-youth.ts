// 2025 USRowing Northwest Youth Championships (PLAN.md §14), from
// data/reference/schedule-sample-2025-nw-youth-champs.csv.
//
// Events: race rows are grouped by (day, time, race name without the crew letter), so
// "U17 Men's 8+ A" and "U17 Men's 8+ B" at 9:04 are one event with two entries, and the two
// unlabeled "Novice Men's 4+" rows at 10:36 are crews A and B. Logistics rows keep their sheet
// order through sortOrder. Finals carry their flight in the name ("Youth Men's 8+ Final A").
//
// Status is 'final': the regatta is over and the schedule is the published one. Timing: launch
// lead 75 minutes (crews row the length of Vancouver Lake to the start), which makes Live.Laugh.
// Love's 8:16 to 9:52 turnaround the hot seat the club planned around (gap 71 minutes, §17.4).
//
// The sheet has no women's races, so the Junior girls race a handful of invented events on the
// same days in the girls' boats from the 2026 layout sheet. The girls' U17 4+ takes Lundberg as a
// 4+ at 14:40 before the boys re-rig it as a 4x+ for 17:04: the seeded re-rig.

import {
  SRA_DEFAULT_RULES,
  athleteName,
  stableId,
  type BoatClass,
  type EventStage,
  type LoadItem,
  type LoadPlacement,
  type Regatta,
  type RegattaEvent,
  type World,
} from '@regatta-ops/domain';
import { SCHEDULE_ROWS } from '../generated/reference';
import type { FleetIndex } from '../fleet';
import {
  BOYS_SHELF_IDS,
  GIRLS_SHELF_IDS,
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  SEED_USER_IDS,
  SHELF_IDS,
  remapRuleShelfIds,
  seedGearId,
  seedOarSetId,
  seedShellId,
  teamId,
  type TeamKey,
} from '../ids';
import type { Eligibility } from '../crews';
import {
  athletesOf,
  crewAndAdd,
  entryLabel,
  planEntry,
  raceEvent,
  snapshotFor,
  type PlannedEntry,
} from './common';

const KEY = 'nw-youth-2025';
const ID = SEED_REGATTA_IDS.nwYouth2025;
const SEASON = 2025;
const SOURCE = 'schedule-sample-2025-nw-youth-champs.csv';

function stageOf(text: string): EventStage {
  if (/time trial/i.test(text)) return 'time_trial';
  if (/final/i.test(text)) return 'final';
  if (/semi/i.test(text)) return 'semi';
  if (/heat/i.test(text)) return 'heat';
  return 'race';
}

/** "Youth Mens 8+" → "Youth Men's 8+"; trailing crew letter split off. */
function splitName(raw: string): { base: string; crew: string | null } {
  const name = raw.replace(/\bMens\b/g, "Men's").trim();
  const m = name.match(/^(.*\S)\s+([AB])$/);
  return m ? { base: m[1]!, crew: m[2]! } : { base: name, crew: null };
}

/**
 * Category, entry label prefix, eligibility, and crew-filling priority from the race name.
 * Priority is the order crews are picked within a day: the 2V8 before the V8 (so the V8 keeps
 * the younger varsity rowers, who can double into the U17 eight an hour later), then U17, novice,
 * U16, 3V, 4V. The 4V B crews end up short, as they would with 40 boys.
 */
function profile(base: string): {
  category: string;
  prefix: string;
  rule: Eligibility;
  priority: number;
} {
  const sex = /women/i.test(base) ? "Women's" : "Men's";
  const lead = base.split(' ')[0]!;
  switch (lead) {
    case 'Youth':
      return {
        category: `${sex} Youth U19`,
        prefix: 'V',
        rule: { experiencedOnly: true, maxAge: 18 },
        priority: 1,
      };
    case '2V':
      return {
        category: `${sex} 2nd Varsity U19`,
        prefix: '2V',
        rule: { experiencedOnly: true, maxAge: 18 },
        priority: 0,
      };
    case 'U17':
      return {
        category: `${sex} U17`,
        prefix: 'U17',
        rule: { maxAge: 16, preferExperienced: true },
        priority: 2,
      };
    case 'Novice':
      return { category: `${sex} Novice`, prefix: 'N', rule: { level: 'novice' }, priority: 3 };
    case 'U16':
      return { category: `${sex} U16`, prefix: 'U16', rule: { maxAge: 15 }, priority: 4 };
    case '3V':
      return {
        category: `${sex} 3rd Varsity U19`,
        prefix: '3V',
        rule: { maxAge: 18, preferExperienced: true },
        priority: 5,
      };
    case '4V':
      return {
        category: `${sex} 4th Varsity U19`,
        prefix: '4V',
        rule: { maxAge: 18, preferExperienced: true },
        priority: 6,
      };
    default:
      return { category: `${sex} Youth`, prefix: '', rule: { maxAge: 18 }, priority: 7 };
  }
}

interface RaceRow {
  team: TeamKey;
  day: string;
  time: string;
  base: string;
  crew: string | null;
  cls: BoatClass;
  stageText: string;
  shell: string;
  oars: string;
}

/** Invented women's races (the sheet is the boys' workbook), in the girls' 2026 trailer boats. */
const GIRLS_RACES: Omit<RaceRow, 'team' | 'crew'>[] = [
  {
    day: '2025-05-16',
    time: '08:08',
    base: "Youth Women's 8+",
    cls: '8+',
    stageText: 'Time Trial',
    shell: 'WUBA',
    oars: '25-A',
  },
  {
    day: '2025-05-16',
    time: '08:40',
    base: "2V Women's 8+",
    cls: '8+',
    stageText: 'Time Trial',
    shell: 'Percy',
    oars: '25-B',
  },
  {
    day: '2025-05-16',
    time: '09:28',
    base: "U17 Women's 8+",
    cls: '8+',
    stageText: 'Time Trial',
    shell: 'Bullet',
    oars: '24-A',
  },
  {
    day: '2025-05-16',
    time: '10:20',
    base: "Novice Women's 8+",
    cls: '8+',
    stageText: 'Time Trial',
    shell: 'Hendo',
    oars: '24-B',
  },
  {
    day: '2025-05-16',
    time: '11:24',
    base: "Youth Women's 4+",
    cls: '4+',
    stageText: 'Time Trial',
    shell: 'Legacy',
    oars: '23-A',
  },
  {
    day: '2025-05-16',
    time: '14:40',
    base: "U17 Women's 4+",
    cls: '4+',
    stageText: 'Time Trial',
    shell: 'Lundberg',
    oars: '23-B',
  },
  {
    day: '2025-05-16',
    time: '15:12',
    base: "Youth Women's 4x",
    cls: '4x',
    stageText: 'Time Trial',
    shell: 'Snoopy',
    oars: 'Silver',
  },
  {
    day: '2025-05-17',
    time: '08:40',
    base: "Youth Women's 8+",
    cls: '8+',
    stageText: 'Final A',
    shell: 'WUBA',
    oars: '25-A',
  },
  {
    day: '2025-05-17',
    time: '09:14',
    base: "2V Women's 8+",
    cls: '8+',
    stageText: 'Final A',
    shell: 'Percy',
    oars: '25-B',
  },
  {
    day: '2025-05-17',
    time: '10:30',
    base: "U17 Women's 8+",
    cls: '8+',
    stageText: 'Final A',
    shell: 'Bullet',
    oars: '24-A',
  },
  {
    day: '2025-05-17',
    time: '11:36',
    base: "Novice Women's 8+",
    cls: '8+',
    stageText: 'Final A',
    shell: 'Hendo',
    oars: '24-B',
  },
  {
    day: '2025-05-18',
    time: '09:20',
    base: "Youth Women's 4+",
    cls: '4+',
    stageText: 'Final A',
    shell: 'Legacy',
    oars: '23-A',
  },
  {
    day: '2025-05-18',
    time: '11:10',
    base: "U17 Women's 4+",
    cls: '4+',
    stageText: 'Final A',
    shell: 'Tahoma',
    oars: '23-B',
  },
  {
    day: '2025-05-18',
    time: '12:40',
    base: "Youth Women's 4x",
    cls: '4x',
    stageText: 'Final A',
    shell: 'Snoopy',
    oars: 'Silver',
  },
];

type Item =
  | { kind: 'logistics'; day: string; text: string }
  | { kind: 'race'; day: string; time: string; base: string; stageText: string; rows: RaceRow[] };

/** Sheet items in order, with same-race rows grouped and the girls' races slotted in by time. */
function scheduleItems(): Item[] {
  const items: Item[] = [];
  const groups = new Map<string, Extract<Item, { kind: 'race' }>>();
  for (const row of SCHEDULE_ROWS) {
    if (row.kind === 'logistics') {
      items.push({ kind: 'logistics', day: row.day, text: row.name });
      continue;
    }
    const { base, crew } = splitName(row.name);
    const key = `${row.day}|${row.time}|${base}|${row.stage}`;
    let group = groups.get(key);
    if (!group) {
      group = { kind: 'race', day: row.day, time: row.time, base, stageText: row.stage, rows: [] };
      groups.set(key, group);
      items.push(group);
    }
    group.rows.push({
      team: 'boys',
      day: row.day,
      time: row.time,
      base,
      crew,
      cls: row.boat_class as BoatClass,
      stageText: row.stage,
      shell: row.shell,
      oars: row.oars,
    });
  }
  // Crew letters: rows without one take the first free letter when the race has two crews.
  for (const item of items) {
    if (item.kind !== 'race' || item.rows.length < 2) continue;
    const taken = new Set(item.rows.map((r) => r.crew).filter(Boolean));
    for (const r of item.rows) {
      if (r.crew) continue;
      r.crew = ['A', 'B', 'C', 'D'].find((l) => !taken.has(l))!;
      taken.add(r.crew);
    }
  }
  for (const g of GIRLS_RACES) {
    const race: Item = {
      kind: 'race',
      day: g.day,
      time: g.time,
      base: g.base,
      stageText: g.stageText,
      rows: [{ ...g, team: 'girls', crew: null }],
    };
    const before = items.findIndex(
      (it) => it.kind === 'race' && (it.day > g.day || (it.day === g.day && it.time > g.time)),
    );
    items.splice(before === -1 ? items.length : before, 0, race);
  }
  return items;
}

export function addNwYouth(w: World, fleet: FleetIndex): void {
  const regatta: Regatta = {
    id: ID,
    name: '2025 USRowing Northwest Youth Championships',
    venue: 'Vancouver Lake',
    city: 'Vancouver, WA',
    startDate: '2025-05-16',
    endDate: '2025-05-18',
    timezone: 'America/Los_Angeles',
    format: 'sprint',
    status: 'final',
    settings: { launchLeadMin: 75 },
    notes:
      'Time trials Friday, finals Saturday and Sunday. Crews row the length of the course to the start, so launch 75 minutes ahead.',
    createdBy: SEED_USER_IDS.coachBoys,
  };
  w.regattas.push(regatta);
  for (const team of ['boys', 'girls'] as const) {
    w.regatta_teams.push({
      id: stableId(`regatta_team:${KEY}:${team}`),
      regattaId: ID,
      teamId: teamId(team),
    });
  }

  // Availability: one boy out for the weekend, one girl leaving before Sunday.
  const boys = athletesOf(w, 'boys').filter((a) => a.status === 'active' && a.side !== 'none');
  const girls = athletesOf(w, 'girls').filter((a) => a.status === 'active' && a.side !== 'none');
  const outBoy = boys[12]!;
  const sundayGirl = girls[20]!;
  w.availability.push(
    {
      id: stableId(`availability:${KEY}:${outBoy.id}`),
      regattaId: ID,
      athleteId: outBoy.id,
      status: 'unavailable',
      reason: 'Sprained wrist',
      updatedBy: SEED_USER_IDS.coachBoys,
    },
    {
      id: stableId(`availability:${KEY}:${sundayGirl.id}`),
      regattaId: ID,
      athleteId: sundayGirl.id,
      status: 'available',
      days: { '2025-05-18': 'unavailable' },
      reason: 'Leaves Saturday night for a family event',
      updatedBy: SEED_USER_IDS.coachGirls,
    },
  );

  // Events in sheet order.
  const planned: { plan: PlannedEntry; priority: number; day: string; time: string }[] = [];
  const boysLogistics = [teamId('boys')];
  scheduleItems().forEach((item, i) => {
    const sortOrder = (i + 1) * 10;
    if (item.kind === 'logistics') {
      w.events.push({
        id: stableId(`event:${KEY}:logistics:${item.day}:${item.text}`),
        regattaId: ID,
        kind: 'logistics',
        name: item.text,
        day: item.day,
        scheduledAt: null,
        teamFilter: boysLogistics,
        sortOrder,
        source: SOURCE,
      });
      return;
    }
    const stage = stageOf(item.stageText);
    const p = profile(item.base);
    const team = item.rows[0]!.team;
    const ev: RegattaEvent = raceEvent(KEY, ID, {
      day: item.day,
      time: item.time,
      name: stage === 'final' ? `${item.base} ${item.stageText}` : item.base,
      cls: item.rows[0]!.cls,
      category: p.category,
      stage,
      progressionGroup: item.base,
      sortOrder,
      source: team === 'boys' ? SOURCE : "seed (invented women's race)",
    });
    w.events.push(ev);
    for (const row of item.rows) {
      const shell = fleet.shell(row.shell);
      const notes: string[] = [];
      if (!shell) notes.push(`Sheet says ${row.shell}; not in the fleet list`);
      else if (/rerig/i.test(row.shell))
        notes.push(`Re-rigged as a ${row.cls} (sheet: ${row.shell})`);
      if (!fleet.oarSet(row.oars)) notes.push(`Sheet says oars ${row.oars}; not in the fleet list`);
      planned.push({
        priority: p.priority,
        day: item.day,
        time: item.time,
        plan: planEntry(fleet, {
          key: `${KEY}:${row.team}:${ev.id}:${row.crew ?? ''}`,
          regattaId: ID,
          event: ev,
          team: row.team,
          label: entryLabel(p.prefix, row.cls, row.crew),
          cls: row.cls,
          shell: row.shell,
          oars: row.oars,
          status: 'confirmed',
          rule: p.rule,
          notes: notes.join('. ') || undefined,
          reuseKey: `${row.team}:${item.base}:${row.crew ?? ''}`,
        }),
      });
    }
  });

  // Crews: day by day, in priority order (see profile), then by time.
  const ordered = planned
    .map((p, index) => ({ ...p, index }))
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.priority - b.priority ||
        a.time.localeCompare(b.time) ||
        a.index - b.index,
    );
  // The sheet was written for a squad of about a hundred; with 40 boys, the novices who race the
  // U17 eight at 9:04, the novice eights at 9:52, and the novice fours at 10:36 cannot all have
  // an hour between races, so some get ATHLETE_TIGHT warnings. Nobody is in two boats at once.
  crewAndAdd(
    w,
    regatta,
    planned.map((p) => p.plan),
    { seasonYear: SEASON, fillOrder: ordered.map((o) => o.plan), strictGaps: false },
  );

  publishBoys(w);
  addLoadPlans(w);
}

/**
 * The boys published their lineups two days out; one seat changed afterwards, so the team page
 * has a "changes since" to show.
 */
function publishBoys(w: World): void {
  const publishedAt = '2025-05-14T04:00:00.000Z';
  const snapshot = snapshotFor(w, ID, 'boys', publishedAt);
  const rt = w.regatta_teams.find((r) => r.regattaId === ID && r.teamId === teamId('boys'))!;
  // Before the change: the V8's bow seat had another rower who was later moved to the 2V4+.
  const v8 = snapshot.entries.find((e) => e.label === 'V8' && e.stage === 'time_trial');
  const bow = v8?.seats.find((s) => s.seat === '1');
  const replacement = w.athletes.find(
    (a) =>
      a.teamId === teamId('boys') &&
      a.status === 'active' &&
      a.side !== 'none' &&
      !v8?.seats.some((s) => s.athleteId === a.id),
  );
  if (bow && replacement) {
    bow.athleteId = replacement.id;
    bow.athleteName = athleteName(replacement);
  }
  rt.publishedAt = publishedAt;
  rt.publishedSnapshot = snapshot;
  rt.notes = 'Bus assignments on the day schedule.';
}

// ---------------------------------------------------------------------------
// Load plans: both trailers as drawn on the 2026 Regionals sheet
// (data/reference/trailer-layout-2026-regionals.md). The sheet's four rows are levels 5 to 2;
// level 1 stays empty (§15 Q1). Middle column = wide side, lane 0 (against the post); right
// column = wide side, lane 1 (outside).

type Cell = { shell: string; shelf: string; lane: 0 | 1 };

const BOYS_LAYOUT: Cell[] = [
  { shell: "Peggy's Delight", shelf: 'l5', lane: 0 },
  { shell: 'Live.Laugh.Love', shelf: 'r5', lane: 0 },
  { shell: 'Waltar Estate', shelf: 'r5', lane: 1 },
  { shell: 'Tom Woodman', shelf: 'l4', lane: 0 },
  { shell: 'Supersonic', shelf: 'r4', lane: 0 },
  { shell: 'de Reckoning', shelf: 'r4', lane: 1 },
  { shell: 'Don Quixote', shelf: 'l3', lane: 0 },
  { shell: 'Third Thursday', shelf: 'r3', lane: 0 },
  { shell: 'Kokanee', shelf: 'r3', lane: 1 },
  { shell: 'A.D. "Dan" Ayrault Jr', shelf: 'l2', lane: 0 },
  { shell: 'Alma Marie', shelf: 'r2', lane: 0 },
  { shell: 'Spencer Bros', shelf: 'r2', lane: 1 },
];

const GIRLS_LAYOUT: Cell[] = [
  { shell: 'WUBA', shelf: 'gl5', lane: 0 },
  { shell: 'Perseverance', shelf: 'gr5', lane: 0 },
  { shell: 'Bulletproof', shelf: 'gr5', lane: 1 },
  { shell: 'Waltar Legacy', shelf: 'gl4', lane: 0 },
  { shell: 'Lee Henderson', shelf: 'gr4', lane: 0 },
  { shell: 'Lundberg', shelf: 'gr4', lane: 1 },
  { shell: 'Scoot', shelf: 'gl3', lane: 0 },
  { shell: 'Tahoma', shelf: 'gr3', lane: 0 },
  { shell: 'Free Speed', shelf: 'gr3', lane: 1 },
  { shell: 'Snoopy', shelf: 'gr2', lane: 0 },
  { shell: 'Sharon Strong', shelf: 'gr2', lane: 1 },
];

function addLoadPlans(w: World): void {
  const shells = new Map(w.shells.map((s) => [s.id, s]));
  const trailers = [
    { key: 'boys', trailerId: SEED_TRAILER_IDS.boys, layout: BOYS_LAYOUT, shelves: BOYS_SHELF_IDS },
    {
      key: 'girls',
      trailerId: SEED_TRAILER_IDS.girls,
      layout: GIRLS_LAYOUT,
      shelves: GIRLS_SHELF_IDS,
    },
  ] as const;
  const planIds: Record<string, string> = {};
  for (const t of trailers) {
    const planId = stableId(`load_plan:${KEY}:${t.key}`);
    planIds[t.key] = planId;
    w.load_plans.push({
      id: planId,
      regattaId: ID,
      trailerId: t.trailerId,
      status: 'draft',
      rules: remapRuleShelfIds(SRA_DEFAULT_RULES, SHELF_IDS),
      packedAt: null,
      notes: 'Laid out by hand from the 2026 Regionals trailer sheet.',
    });
    const frame = w.trailers.find((x) => x.id === t.trailerId)!.frameLengthCm;
    for (const cell of t.layout) {
      const shellId = seedShellId(cell.shell);
      const shell = shells.get(shellId);
      if (!shell) throw new Error(`Layout names unknown shell ${cell.shell}`);
      const shelfId = t.shelves[cell.shelf]!;
      const shelf = w.trailer_shelves.find((s) => s.id === shelfId)!;
      const length = shell.lengthCm ?? 0;
      // Hang the boat forward first (over the truck), up to the shelf's front limit.
      const front = Math.min(shelf.frontOverhangMaxCm, Math.max(0, length - frame));
      const placement: LoadPlacement = {
        id: stableId(`load_placement:${planId}:${cell.shell}`),
        loadPlanId: planId,
        shellId,
        shelfId,
        lane: cell.lane,
        offsetCm: -front,
        bowForward: true,
        locked: false,
        reasons: [
          {
            ruleId: 'layout-sheet',
            hard: false,
            text: 'Where the 2026 Regionals trailer sheet put it',
          },
        ],
      };
      w.load_placements.push(placement);
    }
  }

  const loaded = (at: string, by: string) => ({ loadedAt: at, loadedBy: by });
  const returned = (at: string, by: string) => ({ returnedAt: at, returnedBy: by });
  const boysCoach = SEED_USER_IDS.coachBoys;
  const girlsCoach = SEED_USER_IDS.coachGirls;
  const items: (Omit<LoadItem, 'id' | 'regattaId'> & { key: string })[] = [
    {
      key: 'shell:peggy',
      loadPlanId: planIds.boys,
      kind: 'shell',
      refId: seedShellId("Peggy's Delight"),
      label: "Peggy's Delight (Peggy)",
      quantity: 1,
      container: 'Boys trailer',
      ...loaded('2025-05-15T23:10:00.000Z', boysCoach),
      ...returned('2025-05-19T01:40:00.000Z', boysCoach),
    },
    {
      key: 'shell:lll',
      loadPlanId: planIds.boys,
      kind: 'shell',
      refId: seedShellId('Live.Laugh.Love'),
      label: 'Live.Laugh.Love (LLL)',
      quantity: 1,
      container: 'Boys trailer',
      ...loaded('2025-05-15T23:14:00.000Z', boysCoach),
    },
    {
      key: 'oars:24-C',
      loadPlanId: planIds.boys,
      kind: 'oar_set',
      refId: seedOarSetId('24-C'),
      label: '24-C · yellow-white',
      quantity: 9,
      // The boys' trailer's oar zone, ahead of the riggers (PLAN.md §4.9).
      container: 'Boys trailer · Oars',
      ...loaded('2025-05-15T23:30:00.000Z', boysCoach),
    },
    {
      key: 'shell:wuba',
      loadPlanId: planIds.girls,
      kind: 'shell',
      refId: seedShellId('WUBA'),
      label: 'WUBA',
      quantity: 1,
      container: 'Girls trailer',
      ...loaded('2025-05-15T22:50:00.000Z', girlsCoach),
      ...returned('2025-05-19T01:55:00.000Z', girlsCoach),
    },
    {
      key: 'riggers:lundberg',
      loadPlanId: null,
      kind: 'riggers',
      refId: seedShellId('Lundberg'),
      label: 'Lundberg sculling riggers',
      quantity: 8,
      container: 'Truck 2 bed',
      notes: "For the boys' U16 4x+ re-rig.",
      ...loaded('2025-05-15T23:40:00.000Z', girlsCoach),
    },
    {
      key: 'gear:slings',
      loadPlanId: null,
      kind: 'gear',
      refId: seedGearId('slings'),
      label: 'Slings',
      quantity: 12,
      container: 'Truck 1 bed',
      ...loaded('2025-05-15T23:45:00.000Z', boysCoach),
    },
    {
      key: 'gear:cox-boxes',
      loadPlanId: planIds.boys,
      kind: 'gear',
      refId: seedGearId('cox-boxes'),
      label: 'Cox boxes',
      quantity: 6,
      container: 'Boys trailer bed',
    },
    {
      key: 'extra:aluminum-rack',
      loadPlanId: null,
      kind: 'extra',
      refId: '',
      label: 'Aluminum boat rack',
      quantity: 1,
      container: 'Truck 1 bed',
      notes: 'Rides with the slings.',
    },
  ];
  for (const { key, ...item } of items) {
    w.load_items.push({ id: stableId(`load_item:${KEY}:${key}`), regattaId: ID, ...item });
  }
}
