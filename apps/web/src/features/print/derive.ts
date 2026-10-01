// What each print view shows, derived from the regatta working set (PLAN.md §4.11, §6.12).
// Pure functions of plain data so they are tested without rendering. Every lineup view reads
// PublishedEntry rows: the team's published snapshot, or the live draft built the same way
// (buildPublishedSnapshot), so the published/live toggle changes the rows and nothing else.

import {
  bedZones,
  classSizeRank,
  compartmentDefFromRecord,
  deriveLoadList,
  isComing,
  isCoxed,
  meters,
  mergeLoadItems,
  seatsFor,
  sortPublishedEntries,
  daysBetween,
  defaultRiggerCount,
  shellFullLabel,
  shellLabel,
  type Athlete,
  type BoatClass,
  type EventStage,
  type Id,
  type LoadItemKind,
  type LoadPlacement,
  type LoadPlan,
  type MergedLoadRow,
  type PublishedEntry,
  type RegattaEvent,
  type Seat,
  type Shell,
  type SnapshotChange,
  type Team,
  type Trailer,
  type TrailerShelf,
  zoneExtent,
  zoneName,
} from '@regatta-ops/domain';
import type { RegattaWorkingSet } from '@/data';
import { defaultHomes, homeKey, zoneOfContainer } from '@/features/load-list/lib';
import { scheduleItems, type ScheduleFilters } from '@/features/schedule/lib';
import { publishState } from '@/components/PublishStatus';
import { STAGE_ORDER, dayTimeText } from './format';

export type PrintSource = 'published' | 'live';

const LAST = '￿';

// ---------------------------------------------------------------------------
// Which lineups print

export interface TeamLineups {
  team: Team;
  /** What the viewer asked for. */
  requested: PrintSource;
  /** What prints: the published snapshot, or the live draft (asked for, or nothing published). */
  source: PrintSource;
  /** When the team last published, even when the live draft prints. */
  publishedAt: string | null;
  /** Non-scratched entries in schedule order. */
  entries: PublishedEntry[];
  /** Changes between the published snapshot and the live draft ([] when never published). */
  changes: SnapshotChange[];
}

export function teamLineups(
  ws: RegattaWorkingSet,
  teamId: Id,
  requested: PrintSource,
): TeamLineups | null {
  const team = ws.byId.teams.get(teamId);
  if (!team) return null;
  const state = publishState(ws, teamId);
  const usePublished = requested === 'published' && !!state.published;
  const entries = usePublished
    ? sortPublishedEntries(state.published!.entries.filter((e) => e.status !== 'scratched'))
    : state.live.entries;
  return {
    team,
    requested,
    source: usePublished ? 'published' : 'live',
    publishedAt: state.regattaTeam?.publishedAt ?? state.published?.publishedAt ?? null,
    entries,
    changes: state.changes,
  };
}

/** Lineups for every participating team (by team sort order), or one team. */
export function lineupsFor(
  ws: RegattaWorkingSet,
  teamId: Id | null,
  requested: PrintSource,
): TeamLineups[] {
  const ids = teamId ? [teamId] : ws.participatingTeams.map((t) => t.id);
  return ids.map((id) => teamLineups(ws, id, requested)).filter((t) => t !== null);
}

/** The regatta's days: its date range plus any day an event sits on, sorted. */
export function regattaDays(ws: RegattaWorkingSet): string[] {
  const days = new Set(
    daysBetween(ws.regatta.startDate, ws.regatta.endDate || ws.regatta.startDate),
  );
  for (const e of ws.events) if (e.day) days.add(e.day);
  return [...days].sort();
}

// ---------------------------------------------------------------------------
// Lineup sheet: one page per team per day

export interface SheetPage {
  lineups: TeamLineups;
  /** null: entries without an event (printed after the last day). */
  day: string | null;
  entries: PublishedEntry[];
}

export function lineupSheetPages(lineups: TeamLineups[], day: string | null): SheetPage[] {
  const pages: SheetPage[] = [];
  for (const tl of lineups) {
    if (day) {
      pages.push({ lineups: tl, day, entries: tl.entries.filter((e) => e.day === day) });
      continue;
    }
    const byDay = new Map<string, PublishedEntry[]>();
    for (const e of tl.entries) {
      const key = e.day ?? LAST;
      byDay.set(key, [...(byDay.get(key) ?? []), e]);
    }
    const keys = [...byDay.keys()].sort();
    if (keys.length === 0) pages.push({ lineups: tl, day: null, entries: [] });
    for (const k of keys) {
      pages.push({ lineups: tl, day: k === LAST ? null : k, entries: byDay.get(k)! });
    }
  }
  return pages;
}

/**
 * The roster footer: the team's active athletes who are coming to the regatta and sit in none
 * of the printed entries (any day). Matches unboatedAthletes for the live draft.
 */
export function unboatedFor(
  ws: RegattaWorkingSet,
  teamId: Id,
  entries: readonly PublishedEntry[],
): Athlete[] {
  const days = Array.from(new Set(ws.events.map((e) => e.day)));
  const seated = new Set<Id>();
  for (const e of entries) for (const s of e.seats) if (s.athleteId) seated.add(s.athleteId);
  const availability = new Map(ws.availability.map((a) => [a.athleteId, a]));
  return ws.athletes
    .filter(
      (a) =>
        a.teamId === teamId &&
        a.status === 'active' &&
        !seated.has(a.id) &&
        isComing(availability.get(a.id), days),
    )
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'en') ||
        a.firstName.localeCompare(b.firstName, 'en') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

// ---------------------------------------------------------------------------
// Lineup grid (PLAN.md §4.11): events as columns, seats as rows, cox first then stroke to bow

export interface GridColumn {
  key: string;
  label: string;
  /** The event across its stages: the progression group, else the event name. */
  event: string;
  boatClass: BoatClass;
  /** Race time per stage ("Fri 8:00 AM"); two races in one stage are joined with " / ". */
  times: Partial<Record<EventStage, string>>;
  /** Names by seat. A key is present for every seat of the class; null means empty. */
  cells: Partial<Record<Seat, string | null>>;
  shell: string;
  oars: string;
}

export interface GridTable {
  kind: 'eights' | 'small';
  title: string;
  /** Header rows: the stages any column races, in race order. */
  stages: EventStage[];
  /** Body rows: cox first (when any boat is coxed), then stroke down to bow. */
  seats: Seat[];
  columns: GridColumn[];
}

export interface GridContext {
  timeZone: string;
  /** Show the weekday with each time (multi-day regattas). */
  withDay: boolean;
  /** The event's progression group, to put a crew's time trial and final in one column. */
  groupOf: (eventId: Id | null) => string | undefined;
  oarText: (entry: PublishedEntry) => string;
}

function signature(e: PublishedEntry): string {
  return [...e.seats]
    .sort((a, b) => (a.seat < b.seat ? -1 : a.seat > b.seat ? 1 : 0))
    .map((s) => `${s.seat}:${s.athleteId ?? ''}`)
    .join(',');
}

function joinDistinct(values: string[]): string {
  return Array.from(new Set(values.filter(Boolean))).join(' / ');
}

/**
 * The club's published grid: one table for eights and one for fours and smaller boats. A crew
 * that races a time trial and a final with the same lineup is one column with both times; a
 * changed lineup gets its own column. Columns keep race order.
 */
export function lineupGrids(entries: readonly PublishedEntry[], ctx: GridContext): GridTable[] {
  // Group by crew (event across stages + label) and lineup. Groups of one crew sit side by
  // side, in the order the crew first races.
  const groups = new Map<string, PublishedEntry[]>();
  const familyRank = new Map<string, number>();
  for (const e of sortPublishedEntries(entries)) {
    const event = ctx.groupOf(e.eventId) || e.eventName || '';
    const family = [classSizeRank(e.boatClass) === 3 ? '8' : 's', event, e.label].join('\u0000');
    if (!familyRank.has(family)) familyRank.set(family, familyRank.size);
    const key = `${family}\u0000${signature(e)}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const ordered = [...groups.entries()]
    .map(([key, list], i) => ({
      key,
      list,
      i,
      rank: familyRank.get(key.slice(0, key.lastIndexOf('\u0000')))!,
    }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i);

  const tables: GridTable[] = [
    { kind: 'eights', title: 'Eights', stages: [], seats: [], columns: [] },
    { kind: 'small', title: 'Fours and smaller boats', stages: [], seats: [], columns: [] },
  ];
  for (const { key, list } of ordered) {
    const first = list[0]!;
    const times: Partial<Record<EventStage, string[]>> = {};
    for (const e of list) {
      const stage = e.stage ?? 'race';
      (times[stage] ??= []).push(dayTimeText(e, ctx.timeZone, ctx.withDay));
    }
    const cells: Partial<Record<Seat, string | null>> = {};
    for (const seat of seatsFor(first.boatClass)) {
      const s = first.seats.find((x) => x.seat === seat && x.athleteId);
      cells[seat] = s ? (s.athleteName ?? 'Unknown athlete') : null;
    }
    const table = tables[classSizeRank(first.boatClass) === 3 ? 0 : 1]!;
    table.columns.push({
      key,
      label: first.label.trim() || first.boatClass,
      event: ctx.groupOf(first.eventId) || first.eventName || 'Unscheduled',
      boatClass: first.boatClass,
      times: Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v!.join(' / ')])),
      cells,
      shell: joinDistinct(list.map((e) => e.shellName ?? '')),
      oars: joinDistinct(list.map((e) => ctx.oarText(e))),
    });
  }

  for (const t of tables) {
    const staged = new Set(t.columns.flatMap((c) => Object.keys(c.times)));
    t.stages = STAGE_ORDER.filter((s) => staged.has(s));
    const coxed = t.columns.some((c) => isCoxed(c.boatClass));
    const rowers = Math.max(
      0,
      ...t.columns.map((c) => seatsFor(c.boatClass).length - (isCoxed(c.boatClass) ? 1 : 0)),
    );
    const rowing = Array.from({ length: rowers }, (_, i) => String(rowers - i) as Seat);
    t.seats = coxed ? ['cox', ...rowing] : rowing;
  }
  return tables.filter((t) => t.columns.length > 0);
}

/** Split a table's columns into even chunks of at most `size` that fit a landscape page. */
export function chunkColumns<T>(columns: readonly T[], size: number): T[][] {
  if (columns.length === 0) return [[]];
  const parts = Math.ceil(columns.length / size);
  const per = Math.ceil(columns.length / parts);
  const out: T[][] = [];
  for (let i = 0; i < columns.length; i += per) out.push(columns.slice(i, i + per));
  return out;
}

// ---------------------------------------------------------------------------
// Day schedule and master schedule

export interface RaceRow {
  kind: 'race';
  entry: PublishedEntry;
  team: Team;
  source: PrintSource;
}

export interface LogisticsRow {
  kind: 'logistics';
  event: RegattaEvent;
  /** The teams a filtered line applies to (empty: everyone). */
  teams: Team[];
}

export type ScheduleRow = RaceRow | LogisticsRow;

function raceRows(ws: RegattaWorkingSet, lineups: readonly TeamLineups[], day: string): RaceRow[] {
  const sortOrder = (e: PublishedEntry) =>
    (e.eventId ? ws.byId.events.get(e.eventId)?.sortOrder : undefined) ?? Number.MAX_SAFE_INTEGER;
  const rows: RaceRow[] = [];
  for (const tl of lineups) {
    for (const entry of tl.entries) {
      if (entry.day === day) rows.push({ kind: 'race', entry, team: tl.team, source: tl.source });
    }
  }
  return rows.sort(
    (a, b) =>
      ((a.entry.scheduledAt ?? LAST) < (b.entry.scheduledAt ?? LAST)
        ? -1
        : (a.entry.scheduledAt ?? LAST) > (b.entry.scheduledAt ?? LAST)
          ? 1
          : 0) ||
      sortOrder(a.entry) - sortOrder(b.entry) ||
      a.team.sortOrder - b.team.sortOrder ||
      a.entry.label.localeCompare(b.entry.label, 'en', { numeric: true }),
  );
}

/**
 * One day's schedule: every race row of the given lineups, with the day's logistics lines in
 * order between them. A logistics line with a time goes before the first race after that time;
 * one without a time keeps its place in the schedule's sheet order (sortOrder), before the first
 * race that comes after it. Lines filtered to other teams are left out when `teamId` is set.
 */
export function dayScheduleRows(
  ws: RegattaWorkingSet,
  lineups: readonly TeamLineups[],
  day: string,
  teamId: Id | null,
): ScheduleRow[] {
  const races = raceRows(ws, lineups, day);
  const orderOf = (r: RaceRow) =>
    (r.entry.eventId ? ws.byId.events.get(r.entry.eventId)?.sortOrder : undefined) ??
    Number.MAX_SAFE_INTEGER;
  const logistics = ws.events
    .filter(
      (e) =>
        e.kind === 'logistics' &&
        e.day === day &&
        (!teamId || !e.teamFilter?.length || e.teamFilter.includes(teamId)),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const slots = new Map<number, LogisticsRow[]>();
  for (const event of logistics) {
    let at = races.findIndex((r) => {
      if (event.scheduledAt) {
        const t = r.entry.scheduledAt;
        if (!t) return true;
        return t > event.scheduledAt || (t === event.scheduledAt && orderOf(r) > event.sortOrder);
      }
      return orderOf(r) > event.sortOrder;
    });
    if (at < 0) at = races.length;
    const teams = (event.teamFilter ?? [])
      .map((id) => ws.byId.teams.get(id))
      .filter((t): t is Team => !!t);
    slots.set(at, [...(slots.get(at) ?? []), { kind: 'logistics', event, teams }]);
  }

  const rows: ScheduleRow[] = [];
  races.forEach((race, i) => {
    rows.push(...(slots.get(i) ?? []), race);
  });
  rows.push(...(slots.get(races.length) ?? []));
  return rows;
}

/** Every team's races on a day in time order, without logistics: the trailer copy. */
export function masterScheduleRows(
  ws: RegattaWorkingSet,
  lineups: readonly TeamLineups[],
  day: string,
): RaceRow[] {
  return raceRows(ws, lineups, day);
}

// ---------------------------------------------------------------------------
// The schedule list, as the schedule page shows it

export interface ListEntryRow {
  entryId: Id;
  team: Team | null;
  label: string;
  scratched: boolean;
  /** The entry's live lineup with names; null when scratched (nothing to print). */
  lineup: PublishedEntry | null;
}

export interface ListRaceRow {
  kind: 'race';
  event: RegattaEvent;
  entries: ListEntryRow[];
}

export type ListScheduleRow = ListRaceRow | LogisticsRow;

/**
 * One day of the schedule page's list view (PLAN.md §6.3) as it prints: the same races,
 * logistics lines, and entries under the same filters (`scheduleItems`), each entry with its
 * lineup from `lineups` (the live draft, as on screen).
 */
export function listScheduleRows(
  ws: RegattaWorkingSet,
  lineups: readonly TeamLineups[],
  day: string,
  filters: ScheduleFilters,
): ListScheduleRow[] {
  const byEntry = new Map<Id, PublishedEntry>();
  for (const tl of lineups) for (const e of tl.entries) byEntry.set(e.entryId, e);
  return scheduleItems(ws.events, ws.entries, day, filters, ws.byId.teams).map(
    (item): ListScheduleRow => {
      if (item.kind === 'logistics') {
        const teams = (item.event.teamFilter ?? [])
          .map((id) => ws.byId.teams.get(id))
          .filter((t): t is Team => !!t);
        return { kind: 'logistics', event: item.event, teams };
      }
      return {
        kind: 'race',
        event: item.event,
        entries: item.entries.map((e) => ({
          entryId: e.id,
          team: ws.byId.teams.get(e.teamId) ?? null,
          label: e.label,
          scratched: e.status === 'scratched',
          lineup: e.status === 'scratched' ? null : (byEntry.get(e.id) ?? null),
        })),
      };
    },
  );
}

/** The regatta's days that have anything on the schedule list under these filters. */
export function listScheduleDays(ws: RegattaWorkingSet, filters: ScheduleFilters): string[] {
  return regattaDays(ws).filter(
    (d) => scheduleItems(ws.events, ws.entries, d, filters, ws.byId.teams).length > 0,
  );
}

/** Days that have anything to print for these lineups (races, or logistics when asked). */
export function scheduleDays(
  ws: RegattaWorkingSet,
  lineups: readonly TeamLineups[],
  withLogistics: boolean,
): string[] {
  const days = new Set<string>();
  for (const tl of lineups) for (const e of tl.entries) if (e.day) days.add(e.day);
  if (withLogistics) for (const e of ws.events) if (e.kind === 'logistics') days.add(e.day);
  return [...days].sort();
}

// ---------------------------------------------------------------------------
// Load sheet (PLAN.md §4.8, §4.9, §4.11)

export interface ShelfPlacementRow {
  placement: LoadPlacement;
  shell: Shell | undefined;
  laneText: string;
  /** Teams racing the shell at this regatta, or its home team. */
  teams: Team[];
}

export interface ShelfRow {
  shelf: TrailerShelf;
  levelText: string;
  sideText: string;
  placements: ShelfPlacementRow[];
}

export interface ChecklistRow extends MergedLoadRow {
  /** Where it rides: "Top level, wide side, lane 2 (outer)", "Riggers (back of bed)". */
  where: string;
  /** The bed zone it rides in on this trailer, if any (PLAN.md §4.9). */
  zoneId: Id | null;
  /** Nothing puts it on a trailer or in a truck yet. */
  unassigned: boolean;
  /** On this trailer, but no entry uses it. */
  spare: boolean;
}

export interface ChecklistGroup {
  kind: LoadItemKind;
  title: string;
  rows: ChecklistRow[];
}

/** One of the trailer's bed zones, front to back, with what rides in it (PLAN.md §4.9). */
export interface BedZoneRow {
  id: Id;
  /** "Riggers (back of bed)". */
  name: string;
  /** "from 7.0 m to the back". */
  extent: string;
  /** "5.2 m"; null for a compartment that runs the whole length. */
  length: string | null;
  /** Checklist lines riding in it. */
  rows: ChecklistRow[];
}

export interface LoadSheet {
  trailer: Trailer;
  plan: LoadPlan | null;
  shelves: ShelfRow[];
  /** The bed's zones, front to back. */
  bed: BedZoneRow[];
  groups: ChecklistGroup[];
  /** Load-list lines that travel somewhere else, by container: "Truck 1 bed" → 2. */
  elsewhere: { where: string; count: number }[];
}

const GROUP_TITLES: Record<LoadItemKind, string> = {
  shell: 'Shells',
  riggers: 'Riggers',
  oar_set: 'Oars',
  gear: 'Gear',
  extra: 'Extras',
};

function sideText(trailer: Trailer, shelf: TrailerShelf): string {
  if (shelf.columnKey === 'full') return 'Full width';
  if (trailer.style === 'offset_post')
    return shelf.columnKey === 'left' ? 'Narrow side' : 'Wide side';
  return shelf.columnKey === 'left' ? 'Left' : 'Right';
}

function laneText(shelf: TrailerShelf, lane: number): string {
  if (shelf.laneAccess === 'outer_first') return `${lane + 1} (${lane === 0 ? 'inner' : 'outer'})`;
  return String(lane + 1);
}

/**
 * The load sheet for one trailer: its shelves from the top level down with the regatta's
 * placements, and the checklist of what rides on this trailer. A load-list line belongs here
 * when its stored record names this trailer's load plan, or (with no stored container) when it
 * is a shell placed here or that shell's riggers. Lines with no home yet print here too,
 * flagged, so nothing falls through; lines headed elsewhere are only counted.
 */
export function loadSheet(ws: RegattaWorkingSet, trailerId: Id): LoadSheet | null {
  const trailer = ws.byId.trailers.get(trailerId);
  if (!trailer) return null;
  const plan = ws.loadPlans.find((p) => p.trailerId === trailerId) ?? null;
  const placements = plan ? ws.placements.filter((p) => p.loadPlanId === plan.id) : [];
  const planTrailer = new Map(ws.loadPlans.map((p) => [p.id, p.trailerId]));
  const placedOn = new Map<Id, Id>();
  const placementOf = new Map<Id, LoadPlacement>();
  for (const p of ws.placements) {
    const t = planTrailer.get(p.loadPlanId);
    if (t) placedOn.set(p.shellId, t);
    if (plan && p.loadPlanId === plan.id) placementOf.set(p.shellId, p);
  }

  // Teams racing each shell (non-scratched entries), else the shell's home team.
  const teamsOf = (shellId: Id): Team[] => {
    const ids = new Set(
      ws.entries
        .filter((e) => e.shellId === shellId && e.status !== 'scratched')
        .map((e) => e.teamId),
    );
    const shell = ws.byId.shells.get(shellId);
    if (ids.size === 0 && shell?.homeTeamId) ids.add(shell.homeTeamId);
    return [...ids]
      .map((id) => ws.byId.teams.get(id))
      .filter((t): t is Team => !!t)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const trailerShelves = ws.shelves.filter((s) => s.trailerId === trailerId);
  const topTier = Math.max(0, ...trailerShelves.map((s) => s.tier));
  const shelves: ShelfRow[] = trailerShelves
    .sort((a, b) => b.tier - a.tier || a.sortOrder - b.sortOrder)
    .map((shelf) => ({
      shelf,
      levelText: shelf.tier === topTier ? `${shelf.tier} (top)` : String(shelf.tier),
      sideText: sideText(trailer, shelf),
      placements: placements
        .filter((p) => p.shelfId === shelf.id)
        .sort((a, b) => a.lane - b.lane || a.offsetCm - b.offsetCm)
        .map((placement) => ({
          placement,
          shell: ws.byId.shells.get(placement.shellId),
          laneText: laneText(shelf, placement.lane),
          teams: teamsOf(placement.shellId),
        })),
    }));

  const derived = deriveLoadList({
    entries: ws.entries,
    shells: ws.shells,
    oarSets: ws.oarSets,
    gear: ws.gear,
  });
  const merged = mergeLoadItems(derived, ws.loadItems);
  // Where lines ride by default: riggers, oars, and slings in this trailer's bed zones.
  const homes = defaultHomes(ws);
  const zoneOf = (container: string) => zoneOfContainer(container, trailer, ws.compartments);
  const shelfById = ws.byId.shelves;
  const trailerName = (id: Id | undefined) => (id ? ws.byId.trailers.get(id)?.name : undefined);

  const groups = new Map<LoadItemKind, ChecklistRow[]>();
  const elsewhere = new Map<string, number>();
  const away = (where: string) => elsewhere.set(where, (elsewhere.get(where) ?? 0) + 1);
  const add = (row: ChecklistRow) => groups.set(row.kind, [...(groups.get(row.kind) ?? []), row]);
  const shelfWhere = (shellId: Id): string => {
    const p = placementOf.get(shellId);
    const shelf = p ? shelfById.get(p.shelfId) : undefined;
    return shelf && p ? `${shelf.label}, lane ${laneText(shelf, p.lane)}` : trailer.name;
  };
  const listed = new Set<Id>();
  type Keep = { where: string; unassigned: boolean; zoneId: Id | null };
  for (const row of merged.rows) {
    const stored = row.stored;
    const boat = row.kind === 'shell' || row.kind === 'riggers';
    const on = boat ? placedOn.get(row.refId) : undefined;
    const home = row.orphaned ? undefined : homes.get(homeKey(row.kind, row.refId));
    const here = home?.trailerId === trailerId ? home : undefined;
    // Its bed zone here when nothing is typed, else what was typed.
    const zoned = (fallback: string): Keep =>
      stored?.container
        ? { where: stored.container, unassigned: false, zoneId: zoneOf(stored.container) }
        : { where: here?.zone ?? fallback, unassigned: false, zoneId: here?.compartmentId ?? null };
    // A container typed on the load list (riggers in a truck bed) wins over the placement.
    const typedElsewhere = !!stored?.container && !stored.loadPlanId;
    let keep: Keep | null = null;
    if (boat && on === trailerId && !typedElsewhere) {
      keep =
        row.kind === 'riggers'
          ? zoned('Bed')
          : { where: shelfWhere(row.refId), unassigned: false, zoneId: null };
    } else if (stored && (stored.loadPlanId || stored.container)) {
      if (plan && stored.loadPlanId === plan.id) {
        keep = zoned(trailer.name);
      } else {
        away(
          stored.container || trailerName(planTrailer.get(stored.loadPlanId ?? '')) || 'Elsewhere',
        );
      }
    } else if (boat) {
      if (on) away(trailerName(on) ?? 'Another trailer');
      else keep = { where: 'Not on a trailer yet', unassigned: true, zoneId: null };
    } else if (home) {
      // Oars and slings with a default home: printed on that trailer's sheet, in its zone.
      if (here) keep = zoned(trailer.name);
      else away(home.container);
    } else {
      keep = { where: 'Not assigned yet', unassigned: true, zoneId: null };
    }
    if (!keep) continue;
    if (row.kind === 'shell') listed.add(row.refId);
    add({ ...row, ...keep, spare: false });
  }

  // Shells on this trailer that no entry uses ride as spares (PLAN.md §4.8): list them, flagged.
  for (const p of placements) {
    if (listed.has(p.shellId)) continue;
    const shell = ws.byId.shells.get(p.shellId);
    if (!shell) continue;
    listed.add(shell.id);
    const base = {
      refId: shell.id,
      derived: false,
      orphaned: false,
      unassigned: false,
      spare: true,
    };
    add({
      ...base,
      kind: 'shell',
      key: `spare:shell:${shell.id}`,
      label: shellFullLabel(shell),
      quantity: 1,
      where: shelfWhere(shell.id),
      zoneId: null,
    });
    const riggers =
      shell.riggerType === 'none'
        ? 0
        : (shell.riggerCount ?? defaultRiggerCount(shell.boatClass, shell.riggerType));
    if (riggers > 0) {
      add({
        ...base,
        kind: 'riggers',
        key: `spare:riggers:${shell.id}`,
        label: `Riggers for ${shellLabel(shell)}`,
        quantity: riggers,
        where: homes.get(homeKey('riggers', shell.id))?.zone ?? 'Bed',
        zoneId: homes.get(homeKey('riggers', shell.id))?.compartmentId ?? null,
      });
    }
  }

  const kinds: LoadItemKind[] = ['shell', 'riggers', 'oar_set', 'gear', 'extra'];
  const frame = trailer.frameLengthCm;
  const checklist = kinds.flatMap((k) => groups.get(k) ?? []);
  const bed: BedZoneRow[] = bedZones({
    frameLengthCm: frame,
    compartments: ws.compartments
      .filter((c) => c.trailerId === trailerId)
      .map((c) => compartmentDefFromRecord(c, frame)),
  }).map((z) => ({
    id: z.compartment.id,
    name: zoneName(z.compartment, frame),
    extent: zoneExtent(z, frame),
    length: z.positioned ? `${meters(z.endCm - z.startCm)} m` : null,
    rows: checklist.filter((r) => r.zoneId === z.compartment.id),
  }));
  return {
    trailer,
    plan,
    shelves,
    bed,
    groups: kinds
      .filter((k) => (groups.get(k)?.length ?? 0) > 0)
      .map((k) => ({ kind: k, title: GROUP_TITLES[k], rows: groups.get(k)! })),
    elsewhere: [...elsewhere.entries()]
      .map(([where, count]) => ({ where, count }))
      .sort((a, b) => a.where.localeCompare(b.where, 'en')),
  };
}

/** Shell text for a placement row: "Peggy (Peggy's Delight)". */
export function placementShellText(shell: Shell | undefined): string {
  if (!shell) return 'Unknown shell';
  const nick = shellLabel(shell);
  return nick !== shell.name ? `${nick} (${shell.name})` : shell.name;
}
