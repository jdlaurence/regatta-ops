// The one-day head races (PLAN.md §14):
//
// - Head of the Lake 2026 (planning): 22 events, all four teams, 24 entries. Deliberate findings:
//   Hendo is the girls' V8 B at 9:30 and the 5am women's eight at 10:30 (a cross-team hot seat,
//   gap 25 minutes), and Kokanee is the boys' V4+ at 11:15 and the evening men's 4+ at 11:45
//   (a shell conflict). A few athletes are unavailable, one with a reason, and one is "maybe".
// - Tail of the Lake 2026: events pasted from the regatta's schedule, no entries yet.
// - 2025 Head of the Lake (archived): complete lineups for every team, for "copy lineups from",
//   plus one scratched entry.
//
// Both Head of the Lake days fall on the first Sunday of November, when daylight saving time ends;
// zonedToInstant gives the PST instants.

import {
  stableId,
  type BoatClass,
  type EntryStatus,
  type Regatta,
  type RegattaEvent,
  type World,
} from '@regatta-ops/domain';
import type { FleetIndex } from '../fleet';
import type { Eligibility } from '../crews';
import {
  SEED_REGATTA_IDS,
  SEED_USER_IDS,
  TEAM_COACH,
  TEAM_KEYS,
  teamId,
  type TeamKey,
} from '../ids';
import {
  athletesOf,
  crewAndAdd,
  planEntry,
  raceEvent,
  snapshotFor,
  type PlannedEntry,
} from './common';

interface HeadEvent {
  n: number;
  time: string;
  name: string;
  cls: BoatClass;
  category: string;
}

interface HeadEntry {
  event: number;
  team: TeamKey;
  label: string;
  shell: string;
  oars: string;
  rule: Eligibility;
  status?: EntryStatus;
  notes?: string;
}

const youth: Eligibility = { maxAge: 18, preferExperienced: true };
const varsity: Eligibility = { maxAge: 18, experiencedOnly: true };
const u17: Eligibility = { maxAge: 16 };
const novice: Eligibility = { level: 'novice' };
const women: Eligibility = { gender: 'F' };
const men: Eligibility = { gender: 'M' };
const mixed: Eligibility = { mixed: true };

// ---------------------------------------------------------------------------
// Head of the Lake 2026

const HOTL_2026_EVENTS: HeadEvent[] = [
  { n: 1, time: '08:00', name: "Men's Masters 1x", cls: '1x', category: "Men's Masters" },
  { n: 2, time: '08:06', name: "Women's Masters 1x", cls: '1x', category: "Women's Masters" },
  { n: 3, time: '08:20', name: "Men's Youth 1x", cls: '1x', category: "Men's Youth U19" },
  { n: 4, time: '08:26', name: "Women's Youth 1x", cls: '1x', category: "Women's Youth U19" },
  { n: 5, time: '08:45', name: 'Mixed Masters 2x', cls: '2x', category: 'Mixed Masters' },
  { n: 6, time: '09:00', name: "Men's Youth 2x", cls: '2x', category: "Men's Youth U19" },
  { n: 7, time: '09:06', name: "Women's Youth 2x", cls: '2x', category: "Women's Youth U19" },
  { n: 8, time: '09:30', name: "Women's Youth 8+", cls: '8+', category: "Women's Youth U19" },
  { n: 9, time: '09:45', name: "Men's Youth 8+", cls: '8+', category: "Men's Youth U19" },
  { n: 10, time: '10:15', name: "Men's Masters 8+", cls: '8+', category: "Men's Masters" },
  { n: 11, time: '10:30', name: "Women's Masters 8+", cls: '8+', category: "Women's Masters" },
  { n: 12, time: '11:00', name: "Women's Youth 4+", cls: '4+', category: "Women's Youth U19" },
  { n: 13, time: '11:15', name: "Men's Youth 4+", cls: '4+', category: "Men's Youth U19" },
  { n: 14, time: '11:45', name: "Men's Masters 4+", cls: '4+', category: "Men's Masters" },
  { n: 15, time: '12:00', name: "Women's Masters 4+", cls: '4+', category: "Women's Masters" },
  { n: 16, time: '12:45', name: "Women's U17 8+", cls: '8+', category: "Women's U17" },
  { n: 17, time: '13:00', name: "Men's U17 8+", cls: '8+', category: "Men's U17" },
  { n: 18, time: '13:30', name: 'Mixed Masters 4x', cls: '4x', category: 'Mixed Masters' },
  { n: 19, time: '13:45', name: "Women's Youth 4x", cls: '4x', category: "Women's Youth U19" },
  { n: 20, time: '14:00', name: "Men's Youth 4x", cls: '4x', category: "Men's Youth U19" },
  { n: 21, time: '14:45', name: "Women's Novice 8+", cls: '8+', category: "Women's Novice" },
  { n: 22, time: '15:00', name: 'Mixed Masters 8+', cls: '8+', category: 'Mixed Masters' },
];

const HOTL_2026_ENTRIES: HeadEntry[] = [
  // Junior boys (7)
  { event: 3, team: 'boys', label: 'V1x', shell: 'Usain Boat', oars: 'Pinks', rule: youth },
  { event: 6, team: 'boys', label: 'V2x', shell: 'Double Trouble', oars: 'Red', rule: youth },
  { event: 9, team: 'boys', label: 'V8 A', shell: 'Peggy', oars: '24-C', rule: varsity },
  { event: 9, team: 'boys', label: 'V8 B', shell: 'LLL', oars: '25-C', rule: youth },
  {
    event: 13,
    team: 'boys',
    label: 'V4+',
    shell: 'Kokanee',
    oars: '23-C',
    rule: youth,
    notes: 'Kokanee back on the trailer right after; the evening crew needs it.',
  },
  { event: 17, team: 'boys', label: 'U17 8', shell: 'Waltar', oars: '21-B', rule: u17 },
  { event: 20, team: 'boys', label: 'V4x', shell: 'Susan', oars: 'Brown', rule: youth },
  // Junior girls (8)
  { event: 4, team: 'girls', label: 'V1x', shell: 'Laurel', oars: 'White', rule: youth },
  {
    event: 7,
    team: 'girls',
    label: 'V2x',
    shell: 'Betsy & Mary McCagg',
    oars: 'Green',
    rule: youth,
  },
  { event: 8, team: 'girls', label: 'V8 A', shell: 'WUBA', oars: '25-A', rule: varsity },
  { event: 8, team: 'girls', label: 'V8 B', shell: 'Hendo', oars: '25-B', rule: youth },
  { event: 12, team: 'girls', label: 'V4+', shell: 'Lundberg', oars: '23-A', rule: youth },
  { event: 16, team: 'girls', label: 'U17 8', shell: 'Bullet', oars: '24-A', rule: u17 },
  {
    event: 19,
    team: 'girls',
    label: 'V4x',
    shell: 'Snoopy',
    oars: 'Silver',
    rule: youth,
    status: 'draft',
  },
  { event: 21, team: 'girls', label: 'N8', shell: 'Percy', oars: '24-B', rule: novice },
  // 5am masters (5)
  { event: 2, team: '5am', label: 'W1x', shell: 'Gretchen Fredrick', oars: 'Greek', rule: women },
  {
    event: 5,
    team: '5am',
    label: 'Mixed 2x',
    shell: 'Kelley & Whitney',
    oars: 'Purple',
    rule: mixed,
  },
  {
    event: 11,
    team: '5am',
    label: 'W8',
    shell: 'Hendo',
    oars: 'Irish',
    rule: women,
    notes: 'Borrowing Hendo from the girls right after their V8 B.',
  },
  { event: 15, team: '5am', label: 'W4+', shell: 'Scoot', oars: 'Buckeyes', rule: women },
  { event: 18, team: '5am', label: 'Mixed 4x', shell: 'Sharon', oars: 'Yellow', rule: mixed },
  // Evening masters (4)
  { event: 1, team: 'evening', label: 'M1x', shell: 'Geezer', oars: 'Rainbow', rule: men },
  { event: 14, team: 'evening', label: 'M4+', shell: 'Kokanee', oars: 'Huskies', rule: men },
  { event: 18, team: 'evening', label: 'Mixed 4x', shell: 'Relentless', oars: 'Blue', rule: mixed },
  {
    event: 22,
    team: 'evening',
    label: 'Mixed 8',
    shell: 'Statement',
    oars: 'Swedes',
    rule: mixed,
  },
];

// ---------------------------------------------------------------------------
// 2025 Head of the Lake (archived)

const HOTL_2025_EVENTS: HeadEvent[] = [
  { n: 1, time: '08:00', name: "Men's Masters 1x", cls: '1x', category: "Men's Masters" },
  { n: 2, time: '08:20', name: "Men's Youth 1x", cls: '1x', category: "Men's Youth U19" },
  { n: 3, time: '08:26', name: "Women's Youth 1x", cls: '1x', category: "Women's Youth U19" },
  { n: 4, time: '09:00', name: "Men's Youth 2x", cls: '2x', category: "Men's Youth U19" },
  { n: 5, time: '09:30', name: "Women's Youth 8+", cls: '8+', category: "Women's Youth U19" },
  { n: 6, time: '09:45', name: "Men's Youth 8+", cls: '8+', category: "Men's Youth U19" },
  { n: 7, time: '10:30', name: "Women's Masters 8+", cls: '8+', category: "Women's Masters" },
  { n: 8, time: '11:00', name: "Women's Youth 4+", cls: '4+', category: "Women's Youth U19" },
  { n: 9, time: '11:15', name: "Men's Youth 4+", cls: '4+', category: "Men's Youth U19" },
  { n: 10, time: '11:45', name: "Men's Masters 4+", cls: '4+', category: "Men's Masters" },
  { n: 11, time: '12:45', name: "Women's U17 8+", cls: '8+', category: "Women's U17" },
  { n: 12, time: '13:00', name: "Men's U17 8+", cls: '8+', category: "Men's U17" },
  { n: 13, time: '13:30', name: 'Mixed Masters 4x', cls: '4x', category: 'Mixed Masters' },
  { n: 14, time: '14:00', name: "Men's Youth 4x", cls: '4x', category: "Men's Youth U19" },
  { n: 15, time: '14:30', name: "Women's Youth 4x", cls: '4x', category: "Women's Youth U19" },
  { n: 16, time: '15:00', name: 'Mixed Masters 8+', cls: '8+', category: 'Mixed Masters' },
];

const HOTL_2025_ENTRIES: HeadEntry[] = [
  { event: 2, team: 'boys', label: 'V1x', shell: 'Usain Boat', oars: 'Pinks', rule: youth },
  { event: 6, team: 'boys', label: 'V8', shell: 'Peggy', oars: '24-C', rule: varsity },
  { event: 9, team: 'boys', label: 'V4+', shell: 'Dan', oars: '23-C', rule: youth },
  { event: 12, team: 'boys', label: 'U17 8', shell: 'Waltar', oars: '21-B', rule: u17 },
  { event: 14, team: 'boys', label: 'V4x', shell: 'Susan', oars: 'Brown', rule: youth },
  { event: 3, team: 'girls', label: 'V1x', shell: 'Laurel', oars: 'White', rule: youth },
  { event: 5, team: 'girls', label: 'V8', shell: 'WUBA', oars: '25-A', rule: varsity },
  { event: 8, team: 'girls', label: 'V4+', shell: 'Tahoma', oars: '23-A', rule: youth },
  { event: 11, team: 'girls', label: 'U17 8', shell: 'Bullet', oars: '24-A', rule: u17 },
  { event: 15, team: 'girls', label: 'V4x', shell: 'Snoopy', oars: 'Silver', rule: youth },
  {
    event: 1,
    team: '5am',
    label: 'M1x',
    shell: 'Norton III',
    oars: 'Red',
    rule: men,
    status: 'scratched',
    notes: 'Scratched the morning of the race: sick.',
  },
  { event: 7, team: '5am', label: 'W8', shell: "Ladies' Liberty", oars: 'Irish', rule: women },
  { event: 13, team: '5am', label: 'Mixed 4x', shell: 'Sharon', oars: 'Yellow', rule: mixed },
  { event: 1, team: 'evening', label: 'M1x', shell: 'Geezer', oars: 'Greek', rule: men },
  { event: 10, team: 'evening', label: 'M4+', shell: 'Kokanee', oars: 'Huskies', rule: men },
  { event: 16, team: 'evening', label: 'Mixed 8', shell: 'Statement', oars: 'Swedes', rule: mixed },
];

// ---------------------------------------------------------------------------
// Tail of the Lake 2026 (events only)

const TOTL_2026_EVENTS: HeadEvent[] = [
  { n: 1, time: '08:30', name: "Men's Masters 1x", cls: '1x', category: "Men's Masters" },
  { n: 2, time: '08:36', name: "Women's Masters 1x", cls: '1x', category: "Women's Masters" },
  { n: 3, time: '08:50', name: "Men's Youth 1x", cls: '1x', category: "Men's Youth U19" },
  { n: 4, time: '08:56', name: "Women's Youth 1x", cls: '1x', category: "Women's Youth U19" },
  { n: 5, time: '09:20', name: 'Mixed Masters 2x', cls: '2x', category: 'Mixed Masters' },
  { n: 6, time: '09:40', name: "Women's Youth 2x", cls: '2x', category: "Women's Youth U19" },
  { n: 7, time: '09:46', name: "Men's Youth 2x", cls: '2x', category: "Men's Youth U19" },
  { n: 8, time: '10:15', name: "Women's Youth 8+", cls: '8+', category: "Women's Youth U19" },
  { n: 9, time: '10:30', name: "Men's Youth 8+", cls: '8+', category: "Men's Youth U19" },
  { n: 10, time: '11:00', name: "Women's Masters 4+", cls: '4+', category: "Women's Masters" },
  { n: 11, time: '11:15', name: "Men's Masters 4+", cls: '4+', category: "Men's Masters" },
  { n: 12, time: '11:45', name: "Women's Youth 4x", cls: '4x', category: "Women's Youth U19" },
  { n: 13, time: '12:00', name: "Men's Youth 4x", cls: '4x', category: "Men's Youth U19" },
  { n: 14, time: '12:30', name: 'Mixed Masters 8+', cls: '8+', category: 'Mixed Masters' },
];

// ---------------------------------------------------------------------------

interface HeadRegattaSpec {
  key: string;
  regatta: Regatta;
  seasonYear: number;
  events: HeadEvent[];
  entries: HeadEntry[];
  teams: TeamKey[];
  source: string;
}

function addHeadRegatta(
  w: World,
  fleet: FleetIndex,
  spec: HeadRegattaSpec,
): Map<number, RegattaEvent> {
  const { key, regatta } = spec;
  w.regattas.push(regatta);
  for (const team of spec.teams) {
    w.regatta_teams.push({
      id: stableId(`regatta_team:${key}:${team}`),
      regattaId: regatta.id,
      teamId: teamId(team),
    });
  }
  const events = new Map<number, RegattaEvent>();
  for (const e of spec.events) {
    const ev = raceEvent(key, regatta.id, {
      day: regatta.startDate,
      time: e.time,
      name: e.name,
      cls: e.cls,
      category: e.category,
      stage: 'race',
      eventNumber: String(e.n),
      sortOrder: e.n * 10,
      source: spec.source,
    });
    events.set(e.n, ev);
    w.events.push(ev);
  }
  if (spec.entries.length === 0) return events;
  const planned: PlannedEntry[] = spec.entries.map((e) => {
    const ev = events.get(e.event);
    if (!ev) throw new Error(`${key}: no event ${e.event}`);
    return planEntry(fleet, {
      key: `${key}:${e.team}:${ev.id}:${e.label}`,
      regattaId: regatta.id,
      event: ev,
      team: e.team,
      label: e.label,
      cls: ev.boatClass!,
      shell: e.shell,
      oars: e.oars,
      status: e.status ?? (regatta.status === 'planning' ? 'planned' : 'confirmed'),
      rule: e.rule,
      notes: e.notes,
    });
  });
  const byTime = (list: { p: PlannedEntry; i: number }[]) =>
    list.sort((a, b) => (a.p.request.atMs ?? 0) - (b.p.request.atMs ?? 0) || a.i - b.i);
  const indexed = planned.map((p, i) => ({ p, i }));
  // Fill eights first so the big crews get first pick, then everything else in race order.
  const fillOrder = [
    ...byTime(indexed.filter((x) => x.p.request.cls === '8+')),
    ...byTime(indexed.filter((x) => x.p.request.cls !== '8+')),
  ].map((x) => x.p);
  crewAndAdd(
    w,
    regatta,
    byTime([...indexed]).map((x) => x.p),
    { seasonYear: spec.seasonYear, fillOrder, strictGaps: true },
  );
  return events;
}

export function addHeadOfTheLake2026(w: World, fleet: FleetIndex): void {
  const id = SEED_REGATTA_IDS.headOfTheLake2026;
  const key = 'hotl-2026';
  // Availability before crews, so unavailable athletes stay out of the boats.
  const pick = (team: TeamKey, n: number) =>
    athletesOf(w, team).filter((a) => a.status === 'active' && a.side !== 'none')[n]!;
  const outs: { team: TeamKey; n: number; status: 'unavailable' | 'maybe'; reason?: string }[] = [
    { team: 'boys', n: 2, status: 'unavailable', reason: 'College visit that weekend' },
    { team: 'boys', n: 30, status: 'unavailable' },
    { team: 'girls', n: 9, status: 'unavailable' },
    { team: 'evening', n: 3, status: 'maybe', reason: 'Waiting to hear about work travel' },
  ];
  for (const o of outs) {
    const athlete = pick(o.team, o.n);
    w.availability.push({
      id: stableId(`availability:${key}:${athlete.id}`),
      regattaId: id,
      athleteId: athlete.id,
      status: o.status,
      ...(o.reason ? { reason: o.reason } : {}),
      updatedBy: SEED_USER_IDS[TEAM_COACH[o.team]],
    });
  }
  addHeadRegatta(w, fleet, {
    key,
    seasonYear: 2026,
    regatta: {
      id,
      name: 'Head of the Lake',
      venue: 'Conibear Shellhouse, Lake Washington',
      city: 'Seattle, WA',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      timezone: 'America/Los_Angeles',
      format: 'head',
      status: 'planning',
      settings: {},
      notes: 'Launch from the Conibear docks. Trailers park on the east lot.',
      createdBy: SEED_USER_IDS.admin,
    },
    events: HOTL_2026_EVENTS,
    entries: HOTL_2026_ENTRIES,
    teams: [...TEAM_KEYS],
    source: 'seed (regatta schedule)',
  });
}

export function addTailOfTheLake2026(w: World, fleet: FleetIndex): void {
  addHeadRegatta(w, fleet, {
    key: 'totl-2026',
    seasonYear: 2026,
    regatta: {
      id: SEED_REGATTA_IDS.tailOfTheLake2026,
      name: 'Tail of the Lake',
      venue: 'Lake Union',
      city: 'Seattle, WA',
      startDate: '2026-10-18',
      endDate: '2026-10-18',
      timezone: 'America/Los_Angeles',
      format: 'head',
      status: 'planning',
      settings: {},
      createdBy: SEED_USER_IDS.coachGirls,
    },
    events: TOTL_2026_EVENTS,
    entries: [],
    teams: ['boys', 'girls', '5am'],
    source: 'paste',
  });
}

export function addHeadOfTheLake2025(w: World, fleet: FleetIndex): void {
  const id = SEED_REGATTA_IDS.headOfTheLake2025;
  const key = 'hotl-2025';
  addHeadRegatta(w, fleet, {
    key,
    seasonYear: 2025,
    regatta: {
      id,
      name: '2025 Head of the Lake',
      venue: 'Conibear Shellhouse, Lake Washington',
      city: 'Seattle, WA',
      startDate: '2025-11-02',
      endDate: '2025-11-02',
      timezone: 'America/Los_Angeles',
      format: 'head',
      status: 'archived',
      settings: {},
      createdBy: SEED_USER_IDS.admin,
    },
    events: HOTL_2025_EVENTS,
    entries: HOTL_2025_ENTRIES,
    teams: [...TEAM_KEYS],
    source: 'seed (regatta schedule)',
  });
  TEAM_KEYS.forEach((team, i) => {
    const rt = w.regatta_teams.find((r) => r.regattaId === id && r.teamId === teamId(team))!;
    const publishedAt = `2025-10-3${i % 2}T0${3 + i}:00:00.000Z`;
    rt.publishedAt = publishedAt;
    rt.publishedSnapshot = snapshotFor(w, id, team, publishedAt);
  });
}
