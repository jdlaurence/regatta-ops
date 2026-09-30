// Pure helpers for the schedule page (PLAN.md §4.3, §4.5, §6.3): the day's order of races and
// logistics lines, filters, and the bulk time shift. No React; tested in lib.test.ts.

import {
  addMinutes,
  BOAT_CLASSES,
  daysBetween,
  instantToZoned,
  zonedToInstant,
  type BoatClass,
  type Entry,
  type Regatta,
  type RegattaEvent,
  type Team,
} from '@srt/domain';

// ---------------------------------------------------------------------------
// Days

/** The regatta's days: its date range, plus any day an event sits on outside it. */
export function regattaDays(
  regatta: Pick<Regatta, 'startDate' | 'endDate'>,
  events: readonly Pick<RegattaEvent, 'day'>[],
): string[] {
  const days = new Set(daysBetween(regatta.startDate, regatta.endDate || regatta.startDate));
  for (const e of events) if (e.day) days.add(e.day);
  return [...days].sort();
}

/** The day to open on: today during the regatta, otherwise its first day. */
export function defaultDay(days: readonly string[], today: string): string {
  return days.includes(today) ? today : (days[0] ?? today);
}

// ---------------------------------------------------------------------------
// Order within a day

/**
 * One day's events in schedule order (§4.3): races and logistics lines with a time run in time
 * order; logistics lines without a time ("Bus departs hotel @ 6:15", "Lunch") keep their place
 * from the published schedule (sortOrder), just before the first timed event that came after
 * them; races without a time ("TBD") go last.
 */
export function orderDay(events: readonly RegattaEvent[]): RegattaEvent[] {
  const bySort = (a: RegattaEvent, b: RegattaEvent) =>
    a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const timed = events
    .filter((e) => e.scheduledAt)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!) || bySort(a, b));
  const floating = events.filter((e) => !e.scheduledAt && e.kind === 'logistics').sort(bySort);
  const tbd = events.filter((e) => !e.scheduledAt && e.kind !== 'logistics').sort(bySort);

  const out: RegattaEvent[] = [];
  let f = 0;
  for (const e of timed) {
    while (f < floating.length && floating[f]!.sortOrder < e.sortOrder) out.push(floating[f++]!);
    out.push(e);
  }
  while (f < floating.length) out.push(floating[f++]!);
  return [...out, ...tbd];
}

// ---------------------------------------------------------------------------
// Filters

export interface ScheduleFilters {
  teamId: string | null;
  boatClass: BoatClass | null;
  shellId: string | null;
}

export const NO_FILTERS: ScheduleFilters = { teamId: null, boatClass: null, shellId: null };

export function hasFilters(f: ScheduleFilters): boolean {
  return !!(f.teamId || f.boatClass || f.shellId);
}

export function parseBoatClass(value: string | null | undefined): BoatClass | null {
  return (BOAT_CLASSES as readonly string[]).includes(value ?? '') ? (value as BoatClass) : null;
}

export function entryMatches(entry: Entry, f: ScheduleFilters): boolean {
  if (f.teamId && entry.teamId !== f.teamId) return false;
  if (f.boatClass && entry.boatClass !== f.boatClass) return false;
  if (f.shellId && entry.shellId !== f.shellId) return false;
  return true;
}

export type ScheduleItem =
  | { kind: 'race'; event: RegattaEvent; entries: Entry[] }
  | { kind: 'logistics'; event: RegattaEvent };

/** Entries in the order the list shows them: team order, then label. */
export function sortEntries(entries: readonly Entry[], teams: ReadonlyMap<string, Team>): Entry[] {
  return [...entries].sort(
    (a, b) =>
      (teams.get(a.teamId)?.sortOrder ?? 0) - (teams.get(b.teamId)?.sortOrder ?? 0) ||
      a.label.localeCompare(b.label, undefined, { numeric: true }) ||
      (a.id < b.id ? -1 : 1),
  );
}

/**
 * The list view for one day: races with their entries nested, and logistics lines between
 * them. With a team or shell filter, races without a matching entry drop out; with a class
 * filter, races of that class stay even without entries. Logistics lines stay for a team
 * filter when they apply to that team, and drop out for class and shell filters.
 */
export function scheduleItems(
  events: readonly RegattaEvent[],
  entries: readonly Entry[],
  day: string,
  filters: ScheduleFilters,
  teams: ReadonlyMap<string, Team>,
): ScheduleItem[] {
  const byEvent = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!e.eventId || !entryMatches(e, filters)) continue;
    const list = byEvent.get(e.eventId) ?? [];
    list.push(e);
    byEvent.set(e.eventId, list);
  }
  const items: ScheduleItem[] = [];
  for (const event of orderDay(events.filter((e) => e.day === day))) {
    if (event.kind === 'logistics') {
      if (filters.boatClass || filters.shellId) continue;
      const only = event.teamFilter ?? [];
      if (filters.teamId && only.length > 0 && !only.includes(filters.teamId)) continue;
      items.push({ kind: 'logistics', event });
      continue;
    }
    const matching = sortEntries(byEvent.get(event.id) ?? [], teams);
    if ((filters.teamId || filters.shellId) && matching.length === 0) continue;
    if (filters.boatClass && matching.length === 0 && event.boatClass !== filters.boatClass) {
      continue;
    }
    items.push({ kind: 'race', event, entries: matching });
  }
  return items;
}

/** Entries not tied to any event on the schedule (no event, or its event is gone). */
export function entriesWithoutEvent(
  entries: readonly Entry[],
  events: ReadonlyMap<string, RegattaEvent>,
  filters: ScheduleFilters,
  teams: ReadonlyMap<string, Team>,
): Entry[] {
  return sortEntries(
    entries.filter((e) => (!e.eventId || !events.has(e.eventId)) && entryMatches(e, filters)),
    teams,
  );
}

// ---------------------------------------------------------------------------
// Bulk shift ("everything after 11:00 is 20 minutes late")

export interface ShiftPlan {
  day: string;
  /** Wall time 'HH:mm' in the regatta's zone; events at or after it move. */
  from: string;
  /** Minutes to move; negative moves earlier. */
  minutes: number;
}

export interface ShiftChange {
  event: RegattaEvent;
  /** ISO instants. */
  before: string;
  after: string;
}

/** The events a shift moves, in time order, with their old and new times. */
export function planShift(
  events: readonly RegattaEvent[],
  plan: ShiftPlan,
  timeZone: string,
): ShiftChange[] {
  if (!plan.minutes || !/^\d{1,2}:\d{2}$/.test(plan.from)) return [];
  const threshold = Date.parse(zonedToInstant(plan.day, plan.from, timeZone));
  return events
    .filter((e) => e.day === plan.day && e.scheduledAt && Date.parse(e.scheduledAt) >= threshold)
    .sort((a, b) => Date.parse(a.scheduledAt!) - Date.parse(b.scheduledAt!))
    .map((event) => ({
      event,
      before: event.scheduledAt!,
      after: addMinutes(event.scheduledAt!, plan.minutes),
    }));
}

/** Whether a shift pushes an event onto another calendar day (the preview warns). */
export function leavesDay(change: ShiftChange, timeZone: string): boolean {
  return instantToZoned(change.after, timeZone).day !== change.event.day;
}

/** 'HH:mm' of an instant in the zone, for time inputs. */
export function wallTime(iso: string, timeZone: string): string {
  return instantToZoned(iso, timeZone).time;
}

/** A display name for an event: "Event 14 · Youth Men's 8+" or just the name. */
export function eventTitle(event: Pick<RegattaEvent, 'eventNumber' | 'name'>): string {
  return event.eventNumber ? `Event ${event.eventNumber} · ${event.name}` : event.name;
}

export const STAGE_LABELS: Record<NonNullable<RegattaEvent['stage']>, string> = {
  heat: 'Heat',
  semi: 'Semifinal',
  final: 'Final',
  time_trial: 'Time trial',
  race: 'Race',
};
