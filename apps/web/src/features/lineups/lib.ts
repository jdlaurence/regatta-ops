// Pure helpers for the lineup builder (PLAN.md §4.4, §6.4). No React, no store: they take the
// regatta's working set (or any object with the same arrays) and return plain data, so every
// rule here is unit-tested in lib.test.ts.

import {
  boatClassSpec,
  clockAt,
  isAvailableOn,
  isComing,
  isOlderAgeGroup,
  juniorAgeGroup,
  isCoxed,
  isHotSeat,
  isSculling,
  seatSide,
  seatsFor,
  shellFits,
  shellLabel,
  toMs,
  type Athlete,
  type AthleteLevel,
  type Availability,
  type BoatClass,
  type Entry,
  type EntrySeat,
  type Finding,
  type Id,
  type OarSet,
  type Program,
  type Regatta,
  type RegattaEvent,
  type RegattaSettings,
  type Seat,
  type Severity,
  type Shell,
  type Side,
  type Team,
} from '@regatta-ops/domain';
import { batchOp, type BatchOp } from '@/data';

const MINUTE = 60_000;

/** What the helpers need from the working set (RegattaWorkingSet satisfies it). */
export interface LineupData {
  regatta: Pick<Regatta, 'id' | 'timezone' | 'startDate' | 'endDate'>;
  settings: RegattaSettings;
  /** In schedule order: day, time (unscheduled last within a day), sortOrder. */
  events: RegattaEvent[];
  entries: Entry[];
  seats: EntrySeat[];
  athletes: Athlete[];
  availability: Availability[];
  shells: Shell[];
  oarSets: OarSet[];
  teams: Team[];
}

export interface SeatRef {
  entryId: Id;
  seat: Seat;
}

export interface AthleteSeat {
  entry: Entry;
  seat: Seat;
}

/** Lookups built once per working set. */
export interface LineupIndex {
  data: LineupData;
  eventById: Map<Id, RegattaEvent>;
  entryById: Map<Id, Entry>;
  athleteById: Map<Id, Athlete>;
  teamById: Map<Id, Team>;
  shellById: Map<Id, Shell>;
  oarSetById: Map<Id, OarSet>;
  /** Seat records of each entry by seat (records may hold a null athlete). */
  seatsByEntry: Map<Id, Map<Seat, EntrySeat>>;
  /** Where each athlete sits, across every entry of the regatta (scratched included). */
  seatsByAthlete: Map<Id, AthleteSeat[]>;
  entriesByShell: Map<Id, Entry[]>;
  entriesByOarSet: Map<Id, Entry[]>;
  availabilityByAthlete: Map<Id, Availability>;
  /** The regatta's race days, from its events. */
  days: string[];
}

function byId<T extends { id: Id }>(rows: readonly T[]): Map<Id, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildIndex(data: LineupData): LineupIndex {
  const entryById = byId(data.entries);
  const seatsByEntry = new Map<Id, Map<Seat, EntrySeat>>();
  const seatsByAthlete = new Map<Id, AthleteSeat[]>();
  for (const s of data.seats) {
    let m = seatsByEntry.get(s.entryId);
    if (!m) seatsByEntry.set(s.entryId, (m = new Map()));
    m.set(s.seat, s);
    const entry = entryById.get(s.entryId);
    if (s.athleteId && entry && seatsFor(entry.boatClass).includes(s.seat)) {
      push(seatsByAthlete, s.athleteId, { entry, seat: s.seat });
    }
  }
  const entriesByShell = new Map<Id, Entry[]>();
  const entriesByOarSet = new Map<Id, Entry[]>();
  for (const e of data.entries) {
    if (e.shellId) push(entriesByShell, e.shellId, e);
    if (e.oarSetId) push(entriesByOarSet, e.oarSetId, e);
  }
  return {
    data,
    eventById: byId(data.events),
    entryById,
    athleteById: byId(data.athletes),
    teamById: byId(data.teams),
    shellById: byId(data.shells),
    oarSetById: byId(data.oarSets),
    seatsByEntry,
    seatsByAthlete,
    entriesByShell,
    entriesByOarSet,
    availabilityByAthlete: new Map(data.availability.map((a) => [a.athleteId, a])),
    days: Array.from(new Set(data.events.map((e) => e.day))).sort(),
  };
}

/** The athlete in a seat, or null. */
export function occupantOf(index: LineupIndex, ref: SeatRef): Id | null {
  return index.seatsByEntry.get(ref.entryId)?.get(ref.seat)?.athleteId ?? null;
}

/** The seat an athlete holds in an entry, or null. */
export function seatOfAthlete(index: LineupIndex, entryId: Id, athleteId: Id): Seat | null {
  const seats = index.seatsByEntry.get(entryId);
  if (!seats) return null;
  const entry = index.entryById.get(entryId);
  const template = entry ? seatsFor(entry.boatClass) : null;
  for (const [seat, rec] of seats) {
    if (rec.athleteId === athleteId && (!template || template.includes(seat))) return seat;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Names and titles

/** "Boys V8": the team's short name and the entry label, as findings write it. */
export function entryName(index: LineupIndex, entry: Entry): string {
  const team = index.teamById.get(entry.teamId);
  const label = entry.label.trim() || entry.boatClass;
  return `${team ? team.shortName || team.name : ''} ${label}`.trim();
}

export interface EventTitle {
  /** "Event 14", or null when the event has no number. */
  number: string | null;
  name: string;
  /** "10:20", or null when the time is not set. */
  time: string | null;
}

export function eventTitle(event: RegattaEvent, timezone: string): EventTitle {
  return {
    number: event.eventNumber ? `Event ${event.eventNumber}` : null,
    name: event.name,
    time: event.scheduledAt ? clockAt(event.scheduledAt, timezone) : null,
  };
}

/** "Event 14 · Women's Youth 8+ · 10:20" (or "· Time to be set"). */
export function eventTitleText(event: RegattaEvent, timezone: string): string {
  const t = eventTitle(event, timezone);
  return [t.number, t.name, t.time ?? 'Time to be set'].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Entries grouped by event (PLAN.md §4.4: schedule order, unscheduled at the end)

export interface EventGroup {
  event: RegattaEvent;
  entries: Entry[];
}

export interface DayGroup {
  day: string;
  events: EventGroup[];
}

export interface EntryGroups {
  days: DayGroup[];
  /** Entries with no event (or whose event is gone). */
  unscheduled: Entry[];
  /** Every entry of the team, in the order shown. */
  ordered: Entry[];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function compareLabels(a: Entry, b: Entry): number {
  return (
    collator.compare(a.label, b.label) ||
    (a.created ?? '').localeCompare(b.created ?? '') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The team's entries under their events, in schedule order. Events without an entry of the team
 * are left out unless `showAll` (the coach adds entries to them from there).
 */
export function groupEntries(
  index: LineupIndex,
  teamId: Id,
  opts: { showAll?: boolean } = {},
): EntryGroups {
  const byEvent = new Map<Id, Entry[]>();
  const unscheduled: Entry[] = [];
  for (const e of index.data.entries) {
    if (e.teamId !== teamId) continue;
    if (e.eventId && index.eventById.has(e.eventId)) push(byEvent, e.eventId, e);
    else unscheduled.push(e);
  }
  const days: DayGroup[] = [];
  const ordered: Entry[] = [];
  for (const event of index.data.events) {
    if (event.kind !== 'race') continue;
    const entries = (byEvent.get(event.id) ?? []).sort(compareLabels);
    if (entries.length === 0 && !opts.showAll) continue;
    let day = days[days.length - 1];
    if (!day || day.day !== event.day) days.push((day = { day: event.day, events: [] }));
    day.events.push({ event, entries });
    ordered.push(...entries);
  }
  unscheduled.sort(compareLabels);
  ordered.push(...unscheduled);
  return { days, unscheduled, ordered };
}

// ---------------------------------------------------------------------------
// Roster (PLAN.md §4.4 Roster panel)

export interface RosterAthlete {
  athlete: Athlete;
  /** Non-scratched entries of the team this athlete sits in. */
  entryCount: number;
  /** Coming on at least one day of the regatta. */
  available: boolean;
  /** The unavailability reason, when one was given. */
  reason?: string;
  /** On a multi-day regatta, the days they are coming when they miss some: "Sat only". */
  comingDays?: string[];
}

export interface RosterLevel {
  level: AthleteLevel;
  label: string;
  athletes: RosterAthlete[];
}

export interface RosterView {
  /** Available athletes, experienced then novice (the boys' sheet groups them this way). */
  levels: RosterLevel[];
  /** Active team athletes not coming on any day: listed last, dimmed, still pickable. */
  unavailable: RosterAthlete[];
  /** Athletes of other teams seated in this team's entries. */
  borrowed: RosterAthlete[];
  /** Available athletes in at least one entry. */
  boated: number;
  /** Available athletes. */
  total: number;
}

const LEVEL_LABELS: Record<AthleteLevel, string> = {
  experienced: 'Experienced',
  novice: 'Novice',
};

export function compareAthletes(a: Athlete, b: Athlete): number {
  return (
    a.lastName.localeCompare(b.lastName, 'en') ||
    a.firstName.localeCompare(b.firstName, 'en') ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Entries of `teamId` (not scratched) each athlete sits in. */
export function teamEntryCounts(index: LineupIndex, teamId: Id): Map<Id, number> {
  const counts = new Map<Id, number>();
  for (const [athleteId, seats] of index.seatsByAthlete) {
    const n = new Set(
      seats
        .filter((s) => s.entry.teamId === teamId && s.entry.status !== 'scratched')
        .map((s) => s.entry.id),
    ).size;
    if (n > 0) counts.set(athleteId, n);
  }
  return counts;
}

export function rosterView(index: LineupIndex, teamId: Id): RosterView {
  const counts = teamEntryCounts(index, teamId);
  const levels = new Map<AthleteLevel, RosterAthlete[]>([
    ['experienced', []],
    ['novice', []],
  ]);
  const unavailable: RosterAthlete[] = [];
  const borrowed: RosterAthlete[] = [];
  let boated = 0;
  let total = 0;
  for (const athlete of [...index.data.athletes].sort(compareAthletes)) {
    const entryCount = counts.get(athlete.id) ?? 0;
    if (athlete.teamId !== teamId) {
      if (entryCount > 0) borrowed.push({ athlete, entryCount, available: true });
      continue;
    }
    if (athlete.status !== 'active') continue;
    const av = index.availabilityByAthlete.get(athlete.id);
    const available = isComing(av, index.days);
    const row: RosterAthlete = { athlete, entryCount, available };
    if (av?.reason?.trim()) row.reason = av.reason.trim();
    if (available && index.days.length > 1) {
      const coming = index.days.filter((d) => isAvailableOn(av, d));
      if (coming.length < index.days.length) row.comingDays = coming;
    }
    if (!available) {
      unavailable.push(row);
      continue;
    }
    total++;
    if (entryCount > 0) boated++;
    levels.get(athlete.level)?.push(row);
  }
  return {
    levels: [...levels]
      .filter(([, list]) => list.length > 0)
      .map(([level, athletes]) => ({ level, label: LEVEL_LABELS[level], athletes })),
    unavailable,
    borrowed,
    boated,
    total,
  };
}

export interface RosterFilters {
  query: string;
  side: 'port' | 'starboard' | null;
  scullers: boolean;
  coxswains: boolean;
  unboated: boolean;
  /** Eligible for a U17 event: U17 and younger by birth year (juniors teams only). */
  u17: boolean;
}

export const EMPTY_FILTERS: RosterFilters = {
  query: '',
  side: null,
  scullers: false,
  coxswains: false,
  unboated: false,
  u17: false,
};

/** The season year for junior age groups: the regatta's year, so fall and spring differ. */
export function regattaSeasonYear(index: LineupIndex): number {
  return Number(index.data.regatta.startDate.slice(0, 4));
}

/**
 * U17 and younger in `seasonYear` (PLAN.md §9.1): born `seasonYear - 16` or later. An athlete
 * with no birth year is left out, since their eligibility is unknown.
 */
export function isU17Eligible(a: Pick<Athlete, 'birthYear'>, seasonYear: number): boolean {
  if (!a.birthYear) return false;
  return !isOlderAgeGroup(juniorAgeGroup(a.birthYear, seasonYear), 'U17');
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function athleteSearchText(a: Athlete): string {
  return normalize([a.firstName, a.preferredName ?? '', a.lastName].join(' '));
}

export function matchesFilters(row: RosterAthlete, f: RosterFilters, seasonYear: number): boolean {
  const a = row.athlete;
  if (f.u17 && !isU17Eligible(a, seasonYear)) return false;
  if (f.side && a.side !== f.side && a.side !== 'both') return false;
  if (f.scullers && !a.canScull) return false;
  if (f.coxswains && !a.canCox) return false;
  if (f.unboated && row.entryCount > 0) return false;
  const q = normalize(f.query.trim());
  if (q) {
    const hay = athleteSearchText(a);
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

export function filtersActive(f: RosterFilters): boolean {
  return !!(f.query.trim() || f.side || f.scullers || f.coxswains || f.unboated || f.u17);
}

// ---------------------------------------------------------------------------
// Time windows (PLAN.md §9.2 busy window), for hints

interface Window {
  entry: Entry;
  day: string;
  t: number;
  busyEnd: number;
}

function windowOf(index: LineupIndex, entry: Entry): Window | null {
  if (entry.status === 'scratched' || !entry.eventId) return null;
  const event = index.eventById.get(entry.eventId);
  if (!event?.scheduledAt) return null;
  const { raceDurationMin, returnMin } = index.data.settings;
  const t = toMs(event.scheduledAt);
  return { entry, day: event.day, t, busyEnd: t + (raceDurationMin + returnMin) * MINUTE };
}

/** Minutes from the earlier crew landing to the later race start (negative: overlap). */
function gapMinutes(a: Window, b: Window, extraMin = 0): number {
  const [first, second] = a.t <= b.t ? [a, b] : [b, a];
  return Math.round((second.t - first.busyEnd - extraMin * MINUTE) / MINUTE);
}

function timeOf(index: LineupIndex, entry: Entry): string | null {
  const event = entry.eventId ? index.eventById.get(entry.eventId) : undefined;
  return event?.scheduledAt ? clockAt(event.scheduledAt, index.data.regatta.timezone) : null;
}

// ---------------------------------------------------------------------------
// Seat candidates (click a seat → combobox; PLAN.md §4.4 Filling seats)

export type CandidateRank = 0 | 1 | 2 | 3;

export interface SeatCandidate {
  athlete: Athlete;
  /** Group heading: "Port side", "Junior boys", "Borrow from Junior girls", "Unavailable". */
  group: string;
  /** 0 fits the seat, 1 the rest of the team, 2 another team, 3 unavailable. */
  rank: CandidateRank;
  /** The seat this athlete already holds in this entry (picking them swaps). */
  inThisEntry: Seat | null;
  /** Entries of the athlete's own team they are in (not scratched). */
  entryCount: number;
  /** Another race the same day too close to this one. */
  clash: { severity: 'error' | 'warning'; text: string } | null;
  /** Unavailability reason, or "Unavailable". */
  unavailable: string | null;
}

function fitsSeat(a: Athlete, cls: BoatClass, seat: Seat, side: Side | null): boolean {
  if (seat === 'cox') return a.canCox;
  if (isSculling(cls)) return a.canScull;
  if (!side) return true;
  return a.side === side || a.side === 'both';
}

export function fitGroupLabel(cls: BoatClass, seat: Seat, side: Side | null): string {
  if (seat === 'cox') return 'Coxswains';
  if (isSculling(cls)) return 'Scullers';
  return side === 'port' ? 'Port side' : side === 'starboard' ? 'Starboard side' : 'Fits this seat';
}

/** Another race of the athlete that day that is double-booked or tight against this entry. */
export function athleteClash(
  index: LineupIndex,
  athleteId: Id,
  entry: Entry,
): SeatCandidate['clash'] {
  const mine = windowOf(index, entry);
  if (!mine) return null;
  let worst: SeatCandidate['clash'] = null;
  let worstGap = Infinity;
  for (const s of index.seatsByAthlete.get(athleteId) ?? []) {
    if (s.entry.id === entry.id) continue;
    const other = windowOf(index, s.entry);
    if (!other || other.day !== mine.day) continue;
    const gap = gapMinutes(mine, other);
    if (gap >= index.data.settings.athleteMinGapMin || gap >= worstGap) continue;
    worstGap = gap;
    const when = timeOf(index, s.entry);
    const what = `${entryName(index, s.entry)}${when ? ` at ${when}` : ''}`;
    worst =
      gap < 0
        ? { severity: 'error', text: `Races ${what}, overlapping` }
        : { severity: 'warning', text: `Races ${what}, ${gap} min between` };
  }
  return worst;
}

/**
 * Athletes for a seat, best first: those who fit the seat (side, sculler, cox) from the entry's
 * team, then the rest of the team, then other teams as "Borrow from …", then unavailable
 * athletes. Within a group: unboated first, then no clash, then by name.
 */
export function seatCandidates(
  index: LineupIndex,
  entry: Entry,
  seat: Seat,
  seatSides?: Partial<Record<Seat, Side>> | null,
): SeatCandidate[] {
  const cls = entry.boatClass;
  const side = seatSide(cls, seat, seatSides);
  const team = index.teamById.get(entry.teamId);
  const fitLabel = fitGroupLabel(cls, seat, side);
  const counts = new Map<Id, number>();
  for (const [id, seats] of index.seatsByAthlete) {
    const a = index.athleteById.get(id);
    if (!a) continue;
    counts.set(
      id,
      new Set(
        seats
          .filter((s) => s.entry.teamId === a.teamId && s.entry.status !== 'scratched')
          .map((s) => s.entry.id),
      ).size,
    );
  }
  const out: SeatCandidate[] = [];
  for (const athlete of index.data.athletes) {
    if (athlete.status !== 'active') continue;
    const own = athlete.teamId === entry.teamId;
    const av = index.availabilityByAthlete.get(athlete.id);
    const available = isComing(av, index.days);
    let rank: CandidateRank;
    let group: string;
    if (!available) {
      if (!own) continue;
      rank = 3;
      group = 'Unavailable';
    } else if (own && fitsSeat(athlete, cls, seat, side)) {
      rank = 0;
      group = fitLabel;
    } else if (own) {
      rank = 1;
      group = team?.name ?? 'This team';
    } else {
      rank = 2;
      const home = index.teamById.get(athlete.teamId);
      group = `Borrow from ${home?.name ?? 'another team'}`;
    }
    out.push({
      athlete,
      group,
      rank,
      inThisEntry: seatOfAthlete(index, entry.id, athlete.id),
      entryCount: counts.get(athlete.id) ?? 0,
      clash: athleteClash(index, athlete.id, entry),
      unavailable: available ? null : av?.reason?.trim() || 'Unavailable',
    });
  }
  const teamOrder = new Map(index.data.teams.map((t) => [t.id, t.sortOrder]));
  return out.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.rank === 2
        ? (teamOrder.get(a.athlete.teamId) ?? 0) - (teamOrder.get(b.athlete.teamId) ?? 0) ||
          a.group.localeCompare(b.group)
        : 0) ||
      Number(a.entryCount > 0) - Number(b.entryCount > 0) ||
      Number(!!a.clash) - Number(!!b.clash) ||
      compareAthletes(a.athlete, b.athlete),
  );
}

// ---------------------------------------------------------------------------
// Equipment hints (shell and oar pickers)

export type HintTone = 'conflict' | 'hot_seat' | 'shared';

export interface EquipmentHint {
  entryId: Id;
  tone: HintTone;
  /** "Busy: Boys 2V8 at 10:05", "Also used by Girls V4 at 10:20 (hot seat)". */
  text: string;
  gapMin: number | null;
}

const TONE_RANK: Record<HintTone, number> = { conflict: 0, hot_seat: 1, shared: 2 };

/**
 * What else uses a shell or oar set that `entry` might take, computed from busy windows the way
 * the conflict engine does (PLAN.md §9.2): another crew on the same day whose landing-to-start
 * gap is under the hot-seat minimum is a conflict ("Busy: …"), under the launch lead a hot seat,
 * otherwise a plain "Also used by …". A re-rig between classes adds the re-rig minutes on shells;
 * two crews that fit in one oar set together (a split) never wait on each other.
 */
export function equipmentHints(
  index: LineupIndex,
  entry: Entry,
  kind: 'shell' | 'oar_set',
  resourceId: Id,
): EquipmentHint[] {
  const users = (kind === 'shell' ? index.entriesByShell : index.entriesByOarSet).get(resourceId);
  if (!users) return [];
  const { launchLeadMin, hotSeatMinGapMin, rerigMin } = index.data.settings;
  const mine = windowOf(index, entry);
  const oarCount = kind === 'oar_set' ? (index.oarSetById.get(resourceId)?.count ?? 0) : 0;
  const hints: (EquipmentHint & { t: number })[] = [];
  for (const other of users) {
    if (other.id === entry.id || other.status === 'scratched') continue;
    const name = entryName(index, other);
    const time = timeOf(index, other);
    const theirs = windowOf(index, other);
    const at = time ? ` at ${time}` : '';
    if (!mine || !theirs) {
      // Without both times there is nothing to measure; say who else has it.
      hints.push({
        entryId: other.id,
        tone: 'shared',
        text: `Also used by ${name}${at}`,
        gapMin: null,
        t: theirs?.t ?? Infinity,
      });
      continue;
    }
    if (theirs.day !== mine.day) continue;
    if (kind === 'oar_set') {
      const need =
        boatClassSpec(entry.boatClass).oarsNeeded + boatClassSpec(other.boatClass).oarsNeeded;
      if (need <= oarCount) {
        hints.push({
          entryId: other.id,
          tone: 'shared',
          text: `Also used by ${name}${at} (split)`,
          gapMin: null,
          t: theirs.t,
        });
        continue;
      }
    }
    const rerig = kind === 'shell' && other.boatClass !== entry.boatClass;
    const gap = gapMinutes(mine, theirs, rerig ? rerigMin : 0);
    const rerigNote = rerig ? 're-rig' : '';
    if (gap < hotSeatMinGapMin) {
      hints.push({
        entryId: other.id,
        tone: 'conflict',
        text: `Busy: ${name}${at}${rerigNote ? ` (${rerigNote})` : ''}`,
        gapMin: gap,
        t: theirs.t,
      });
    } else if (gap < launchLeadMin) {
      hints.push({
        entryId: other.id,
        tone: 'hot_seat',
        text: `Also used by ${name}${at} (hot seat${rerigNote ? `, ${rerigNote}` : ''})`,
        gapMin: gap,
        t: theirs.t,
      });
    } else {
      hints.push({
        entryId: other.id,
        tone: 'shared',
        text: `Also used by ${name}${at}${rerigNote ? ` (${rerigNote})` : ''}`,
        gapMin: gap,
        t: theirs.t,
      });
    }
  }
  return hints
    .sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.t - b.t)
    .map(({ t: _t, ...h }) => h);
}

// ---------------------------------------------------------------------------
// Shell and oar options

export interface EquipmentOption<T> {
  item: T;
  group: string;
  /** Races as the entry's class (shells) or matches its rigging and count (oars). */
  fits: boolean;
  /** Why it cannot be picked (out of service, retired). */
  disabledReason: string | null;
  hints: EquipmentHint[];
  /** Short text under the name: weight class, rig, count. */
  detail: string;
}

const OUT_OF_SERVICE = 'Out of service. Pick another or change its status in Fleet.';
const RETIRED = 'Retired. Pick another or change its status in Fleet.';

function statusReason(status: Shell['status']): string | null {
  if (status === 'out_of_service') return OUT_OF_SERVICE;
  if (status === 'retired') return RETIRED;
  return null;
}

/** Equipment groups: the entry's team first, then club boats, then other teams (borrowing). */
function homeGroups(index: LineupIndex, teamId: Id) {
  const teams = [...index.data.teams].sort((a, b) => a.sortOrder - b.sortOrder);
  const order = new Map<string, number>();
  order.set(teamId, 0);
  teams.forEach((t, i) => {
    if (!order.has(t.id)) order.set(t.id, i + 2);
  });
  return {
    rank: (homeTeamId: Id | null | undefined) =>
      homeTeamId && order.has(homeTeamId) ? order.get(homeTeamId)! : 1,
    label: (homeTeamId: Id | null | undefined) =>
      (homeTeamId && index.teamById.get(homeTeamId)?.name) || 'Club boats',
  };
}

function shellDetail(shell: Shell): string {
  const parts: string[] = [];
  if (shell.name !== shellLabel(shell)) parts.push(shell.name);
  const wc = shell.weightClassLabel?.trim();
  if (wc) parts.push(/\d$/.test(wc) ? `${wc} lb` : wc);
  if (shell.strokeSide) parts.push(shell.strokeSide === 'port' ? 'Port rig' : 'Starboard rig');
  if (shell.status === 'limited') parts.push('Limited');
  return parts.join(' · ');
}

/**
 * Shells for an entry: those that race as its class, grouped by home team (this team first,
 * then club boats, then the other teams) and sorted by nickname. `showAll` adds the other
 * classes as a last group. Out-of-service and retired shells are disabled with a reason; retired
 * ones only show with `showAll`. The entry's current shell always shows.
 */
export function shellOptions(
  index: LineupIndex,
  entry: Entry,
  showAll = false,
): EquipmentOption<Shell>[] {
  const groups = homeGroups(index, entry.teamId);
  const rows = index.data.shells
    .map((shell) => {
      const fits = shellFits(shell, entry.boatClass);
      return { shell, fits, current: shell.id === entry.shellId };
    })
    .filter((r) => r.current || (showAll ? true : r.fits && r.shell.status !== 'retired'))
    .sort(
      (a, b) =>
        Number(!a.fits) - Number(!b.fits) ||
        (a.fits ? groups.rank(a.shell.homeTeamId) - groups.rank(b.shell.homeTeamId) : 0) ||
        collator.compare(shellLabel(a.shell), shellLabel(b.shell)),
    );
  return rows.map(({ shell, fits }) => ({
    item: shell,
    group: fits ? groups.label(shell.homeTeamId) : 'Other classes',
    fits,
    disabledReason: statusReason(shell.status),
    hints: equipmentHints(index, entry, 'shell', shell.id),
    detail: fits
      ? shellDetail(shell)
      : [`${shell.boatClass}, not rigged as ${entry.boatClass}`, shellDetail(shell)]
          .filter(Boolean)
          .join(' · '),
  }));
}

/**
 * Oar sets for an entry: the class's rigging with enough oars, grouped like shells; sets that
 * are short come next with a hint; `showAll` adds the other rigging.
 */
export function oarOptions(
  index: LineupIndex,
  entry: Entry,
  showAll = false,
): EquipmentOption<OarSet>[] {
  const spec = boatClassSpec(entry.boatClass);
  const groups = homeGroups(index, entry.teamId);
  const kindOf = (o: OarSet) => (o.type !== spec.rigging ? 2 : o.count < spec.oarsNeeded ? 1 : 0);
  return index.data.oarSets
    .filter((o) => {
      if (o.id === entry.oarSetId) return true;
      if (showAll) return true;
      return o.type === spec.rigging && o.status !== 'retired';
    })
    .sort(
      (a, b) =>
        kindOf(a) - kindOf(b) ||
        (kindOf(a) === 0 ? groups.rank(a.homeTeamId) - groups.rank(b.homeTeamId) : 0) ||
        collator.compare(a.name, b.name),
    )
    .map((o) => {
      const k = kindOf(o);
      const oarWord = o.type === 'scull' ? 'sculls' : 'sweep oars';
      const detail =
        k === 1
          ? `${o.count} ${oarWord}; this boat needs ${spec.oarsNeeded}`
          : [`${o.count} ${oarWord}`, o.status === 'limited' ? 'Limited' : '']
              .filter(Boolean)
              .join(' · ');
      return {
        item: o,
        group: k === 0 ? groups.label(o.homeTeamId) : k === 1 ? 'Short sets' : 'Other rigging',
        fits: k === 0,
        disabledReason: statusReason(o.status),
        hints: equipmentHints(index, entry, 'oar_set', o.id),
        detail,
      };
    });
}

// ---------------------------------------------------------------------------
// Labels ("V8", "2V4+", "U17 8 A", "N4+ B", "W8", "Mixed 4x")

/** The label prefix an event implies: V, 2V, 3V, 4V, U15–U17, N, or W / M / Mixed for masters. */
export function labelPrefix(
  event: Pick<RegattaEvent, 'name' | 'category'> | null,
  program?: Program,
): string {
  const text = event ? `${event.category ?? ''} ${event.name}` : '';
  if (/\bmasters?\b/i.test(text) || (!event && program === 'masters')) {
    if (/\bmixed\b/i.test(text)) return 'Mixed';
    if (/\bwomen'?s?\b/i.test(text)) return 'W';
    if (/\bmen'?s?\b/i.test(text)) return 'M';
    return '';
  }
  const varsity = /\b([234])(?:nd|rd|th)?\s*(?:varsity|v)\b/i.exec(text);
  if (varsity) return `${varsity[1]}V`;
  if (/\bjv\b|\bsecond varsity\b/i.test(text)) return '2V';
  if (/\bthird varsity\b/i.test(text)) return '3V';
  if (/\bnovice\b/i.test(text)) return 'N';
  const age = /\bU\s?-?(15|16|17)\b/i.exec(text);
  if (age) return `U${age[1]}`;
  return program === 'masters' ? '' : 'V';
}

/** '8+' reads as '8' on the club's sheets; every other class keeps its symbol. */
export function boatPart(cls: BoatClass): string {
  return cls === '8+' ? '8' : cls;
}

export function baseLabel(prefix: string, cls: BoatClass): string {
  const boat = boatPart(cls);
  if (!prefix) return boat;
  const spaced = /\d$/.test(prefix) || prefix.length > 2;
  return `${prefix}${spaced ? ' ' : ''}${boat}`;
}

/**
 * A new entry's label: the event's prefix and the class, plus a crew letter when the team
 * already has a crew with that label in the event ("V8" then "V8 B").
 */
export function autoLabel(
  event: Pick<RegattaEvent, 'name' | 'category'> | null,
  cls: BoatClass,
  siblingLabels: readonly string[],
  program?: Program,
): string {
  const base = baseLabel(labelPrefix(event, program), cls);
  const used = new Set<string>();
  let clash = false;
  for (const label of siblingLabels) {
    const l = label.trim();
    if (l === base) {
      // An unlettered crew counts as the A crew.
      clash = true;
      used.add('A');
    } else if (l.startsWith(`${base} `) && /^[A-Z]$/.test(l.slice(base.length + 1))) {
      clash = true;
      used.add(l.slice(base.length + 1));
    }
  }
  if (!clash) return base;
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    if (!used.has(letter)) return `${base} ${letter}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Seat writes. Seats are records only once set; clearing sets the athlete to null (the engine
// treats a missing or empty record the same). Because of the unique (entry, athlete) index, an
// athlete moving within an entry leaves the old seat first: clear, then set, in one batch.

type Desired = Map<string, { ref: SeatRef; athleteId: Id | null }>;

const key = (r: SeatRef) => `${r.entryId}|${r.seat}`;

function desiredOps(index: LineupIndex, desired: Desired): BatchOp[] {
  // An athlete placed in an entry leaves any other seat they hold in that entry.
  for (const { ref, athleteId } of [...desired.values()]) {
    if (!athleteId) continue;
    for (const [seat, rec] of index.seatsByEntry.get(ref.entryId) ?? []) {
      const k = key({ entryId: ref.entryId, seat });
      if (seat !== ref.seat && rec.athleteId === athleteId && !desired.has(k)) {
        desired.set(k, { ref: { entryId: ref.entryId, seat }, athleteId: null });
      }
    }
  }
  const current = (ref: SeatRef) => occupantOf(index, ref);
  const movingWithin = (ref: SeatRef, athleteId: Id) =>
    [...desired.values()].some(
      (d) => d.ref.entryId === ref.entryId && d.ref.seat !== ref.seat && d.athleteId === athleteId,
    );
  const ops: BatchOp[] = [];
  // 1. Clear seats that end empty or whose athlete moves to another seat of the same entry.
  for (const { ref, athleteId } of desired.values()) {
    const cur = current(ref);
    if (!cur || cur === athleteId) continue;
    if (athleteId === null || movingWithin(ref, cur)) {
      const rec = index.seatsByEntry.get(ref.entryId)?.get(ref.seat);
      if (rec) ops.push(batchOp.update('entry_seats', rec.id, { athleteId: null }));
    }
  }
  // 2. Set seats that end with an athlete (create the record on first use).
  for (const { ref, athleteId } of desired.values()) {
    if (!athleteId || current(ref) === athleteId) continue;
    const rec = index.seatsByEntry.get(ref.entryId)?.get(ref.seat);
    if (rec) ops.push(batchOp.update('entry_seats', rec.id, { athleteId }));
    else {
      ops.push(batchOp.create('entry_seats', { entryId: ref.entryId, seat: ref.seat, athleteId }));
    }
  }
  return ops;
}

export interface PlacementResult {
  ops: BatchOp[];
  /** An athlete who left the target seat and has no seat in its entry any more. */
  displaced: Id | null;
  /** The athlete who took the source seat in a swap. */
  swappedIn: Id | null;
}

/**
 * Put an athlete in a seat. From the roster or the picker (`from` omitted): the seat's occupant
 * steps out, unless the athlete already sits elsewhere in the entry, in which case the two swap.
 * From another seat (`from`, a drag or a keyboard move): the two seats swap, across entries too;
 * an occupant who already sits in the source entry simply steps out.
 */
export function placementOps(
  index: LineupIndex,
  target: SeatRef,
  athleteId: Id,
  from?: SeatRef | null,
): PlacementResult {
  const none: PlacementResult = { ops: [], displaced: null, swappedIn: null };
  if (from && from.entryId === target.entryId && from.seat === target.seat) return none;
  const occupant = occupantOf(index, target);
  if (occupant === athleteId && !from) return none;
  const desired: Desired = new Map();
  desired.set(key(target), { ref: target, athleteId });
  let swappedIn: Id | null = null;
  const source =
    from ??
    (() => {
      const s = seatOfAthlete(index, target.entryId, athleteId);
      return s ? { entryId: target.entryId, seat: s } : null;
    })();
  if (source && occupantOf(index, source) === athleteId) {
    const alreadyThere =
      occupant && source.entryId !== target.entryId
        ? seatOfAthlete(index, source.entryId, occupant)
        : null;
    const back = occupant && !alreadyThere ? occupant : null;
    desired.set(key(source), { ref: source, athleteId: back });
    swappedIn = back;
  }
  const ops = desiredOps(index, desired);
  const displaced = occupant && occupant !== athleteId && !swappedIn ? occupant : null;
  return { ops, displaced, swappedIn };
}

/** Empty a seat. */
export function clearOps(index: LineupIndex, ref: SeatRef): BatchOp[] {
  if (!occupantOf(index, ref)) return [];
  return desiredOps(index, new Map([[key(ref), { ref, athleteId: null }]]));
}

/** Empty every seat of an entry. */
export function clearAllOps(index: LineupIndex, entryId: Id): BatchOp[] {
  const ops: BatchOp[] = [];
  for (const rec of index.seatsByEntry.get(entryId)?.values() ?? []) {
    if (rec.athleteId) ops.push(batchOp.update('entry_seats', rec.id, { athleteId: null }));
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Seat order and findings on seats

/**
 * Seats in the order the club reads them, on screen and on paper: cox first, then stroke down
 * to bow (the builder's boats read top to bottom in this order).
 */
export function sheetOrder(cls: BoatClass): Seat[] {
  const rowing = seatsFor(cls)
    .filter((s) => s !== 'cox')
    .reverse();
  return isCoxed(cls) ? ['cox', ...rowing] : rowing;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** The worst finding pointing at each seat's athlete (unavailable, side mismatch, clash). */
export function seatConflicts(
  findings: readonly Finding[],
  index: LineupIndex,
  entryId: Id,
): Partial<Record<Seat, Severity>> {
  const out: Partial<Record<Seat, Severity>> = {};
  for (const f of findings) {
    if (f.resource?.type !== 'athlete' || !f.entryIds.includes(entryId)) continue;
    const seat = seatOfAthlete(index, entryId, f.resource.id);
    if (!seat) continue;
    const cur = out[seat];
    if (!cur || SEVERITY_RANK[f.severity] < SEVERITY_RANK[cur]) out[seat] = f.severity;
  }
  return out;
}

/**
 * The plans of acknowledged hot seats among an entry's findings. The plan is stored on the later
 * entry of the pair, and shows on both (PLAN.md §4.4: it prints on both teams' sheets).
 */
export function hotSeatPlans(
  findings: readonly Finding[],
  entryById: ReadonlyMap<Id, Entry>,
): string[] {
  const plans = new Set<string>();
  for (const f of findings) {
    if (!isHotSeat(f) || !f.acknowledged) continue;
    const later = entryById.get(f.entryIds[1] ?? '');
    if (later?.hotSeatPlan?.trim()) plans.add(later.hotSeatPlan.trim());
  }
  return [...plans];
}

/** "Lundberg rigged as 4x+" when the shell's own class differs from the entry's. */
export function rerigNote(shell: Shell | null | undefined, cls: BoatClass): string | null {
  if (!shell || shell.boatClass === cls) return null;
  return `${shellLabel(shell)} rigged as ${cls}`;
}

// ---------------------------------------------------------------------------
// By athlete (the matrix view)

export interface MatrixColumn {
  key: string;
  event: RegattaEvent | null;
  entries: Entry[];
}

export interface MatrixCell {
  entry: Entry;
  seat: Seat;
}

export interface MatrixRow {
  athlete: Athlete;
  borrowed: boolean;
  available: boolean;
  /** Column key → the athlete's seats in that column. */
  cells: Map<string, MatrixCell[]>;
  /** Races the athlete is in (not scratched). */
  races: number;
}

export function athleteMatrix(
  index: LineupIndex,
  teamId: Id,
): { columns: MatrixColumn[]; rows: MatrixRow[] } {
  const groups = groupEntries(index, teamId);
  const columns: MatrixColumn[] = [];
  for (const d of groups.days) {
    for (const g of d.events) columns.push({ key: g.event.id, event: g.event, entries: g.entries });
  }
  if (groups.unscheduled.length > 0) {
    columns.push({ key: 'unscheduled', event: null, entries: groups.unscheduled });
  }
  const columnOf = new Map<Id, string>();
  for (const c of columns) for (const e of c.entries) columnOf.set(e.id, c.key);
  const roster = rosterView(index, teamId);
  const listed: { athlete: Athlete; borrowed: boolean; available: boolean }[] = [
    ...roster.levels.flatMap((l) => l.athletes.map((r) => ({ ...r, borrowed: false }))),
    ...roster.unavailable.filter((r) => r.entryCount > 0).map((r) => ({ ...r, borrowed: false })),
    ...roster.borrowed.map((r) => ({ ...r, borrowed: true })),
  ];
  const rows = listed.map(({ athlete, borrowed, available }) => {
    const cells = new Map<string, MatrixCell[]>();
    let races = 0;
    for (const s of index.seatsByAthlete.get(athlete.id) ?? []) {
      const col = columnOf.get(s.entry.id);
      if (!col) continue;
      push(cells, col, { entry: s.entry, seat: s.seat });
      if (s.entry.status !== 'scratched') races++;
    }
    return { athlete, borrowed, available, cells, races };
  });
  return { columns, rows };
}

// ---------------------------------------------------------------------------
// Copy lineups from a previous regatta (PLAN.md §4.4 Copy and move)

export type CopyMatch = 'name' | 'category' | 'class' | 'none';

export interface CopyRow {
  source: Entry;
  sourceEvent: RegattaEvent | null;
  target: RegattaEvent | null;
  match: CopyMatch;
  /** Seats to create: athletes still on an active roster. */
  seats: { seat: Seat; athleteId: Id }[];
  /** Seated athletes left out (inactive or unknown). */
  skipped: number;
  /** An entry of the team in the target event with the same label already. */
  duplicate: Entry | null;
  /** Checked in the preview by default. */
  suggested: boolean;
}

/** Event names compared loosely: case, punctuation, "Mens"/"Men's", event numbers. */
export function normalizeEventName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bevent\s+\w+\b/g, ' ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .replace(/\bmens\b/g, 'men')
    .replace(/\bwomens\b/g, 'women')
    .replace(/\s+/g, ' ')
    .trim();
}

export function planCopy(args: {
  sourceEntries: readonly Entry[];
  sourceEvents: readonly RegattaEvent[];
  sourceSeats: readonly EntrySeat[];
  /** Target regatta's events in schedule order. */
  targetEvents: readonly RegattaEvent[];
  /** The team's entries already in the target regatta. */
  targetEntries: readonly Entry[];
  /** Athletes who can be seated (active). */
  athletes: ReadonlyMap<Id, Athlete>;
}): CopyRow[] {
  const sourceEventById = new Map(args.sourceEvents.map((e) => [e.id, e]));
  const races = args.targetEvents.filter((e) => e.kind === 'race');
  const seatsByEntry = new Map<Id, EntrySeat[]>();
  for (const s of args.sourceSeats) push(seatsByEntry, s.entryId, s);
  const rows: CopyRow[] = [];
  const sorted = [...args.sourceEntries].sort((a, b) => {
    const ea = a.eventId ? sourceEventById.get(a.eventId) : undefined;
    const eb = b.eventId ? sourceEventById.get(b.eventId) : undefined;
    return (ea?.scheduledAt ?? '￿').localeCompare(eb?.scheduledAt ?? '￿') || compareLabels(a, b);
  });
  for (const source of sorted) {
    const sourceEvent = (source.eventId && sourceEventById.get(source.eventId)) || null;
    const sameClass = races.filter((e) => e.boatClass === source.boatClass);
    let target: RegattaEvent | null = null;
    let match: CopyMatch = 'none';
    if (sourceEvent) {
      const name = normalizeEventName(sourceEvent.name);
      const byName = sameClass.filter((e) => normalizeEventName(e.name) === name);
      const cat = normalizeEventName(sourceEvent.category ?? '');
      const byCategory = cat
        ? sameClass.filter((e) => normalizeEventName(e.category ?? '') === cat)
        : [];
      const pick = (list: RegattaEvent[]) =>
        list.find((e) => e.stage && e.stage === sourceEvent.stage) ?? list[0] ?? null;
      if (byName.length > 0) {
        target = pick(byName);
        match = 'name';
      } else if (byCategory.length > 0) {
        target = pick(byCategory);
        match = 'category';
      }
    }
    if (!target && sameClass.length === 1) {
      target = sameClass[0]!;
      match = 'class';
    }
    const template = seatsFor(source.boatClass);
    const seats: CopyRow['seats'] = [];
    let skipped = 0;
    for (const s of seatsByEntry.get(source.id) ?? []) {
      if (!s.athleteId || !template.includes(s.seat)) continue;
      const a = args.athletes.get(s.athleteId);
      if (a && a.status === 'active') seats.push({ seat: s.seat, athleteId: s.athleteId });
      else skipped++;
    }
    const duplicate =
      (target &&
        args.targetEntries.find(
          (e) => e.eventId === target!.id && e.label.trim() === source.label.trim(),
        )) ||
      null;
    rows.push({
      source,
      sourceEvent,
      target,
      match,
      seats,
      skipped,
      duplicate,
      suggested: !!target && !duplicate && source.status !== 'scratched',
    });
  }
  return rows;
}
