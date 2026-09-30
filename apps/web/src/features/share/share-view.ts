// Pure helpers for the share page: which days to offer, what goes on a day, how lineups read as
// a name list, and how times are written. Times are in the regatta's time zone (parents are at
// the course), 12-hour with AM/PM.

import { clockAt, daysBetween, instantToZoned, type LoadItemKind } from '@srt/domain';
import type { ShareEntry, ShareLoadItem, ShareScheduleItem, ShareTeam, ShareView } from '@/data';

export interface CrewOnRow {
  team: ShareTeam;
  entry: ShareEntry;
}

export type DayRow =
  | {
      type: 'race';
      key: string;
      /** The live schedule line; null when the published entry's event is gone. */
      event: ShareScheduleItem | null;
      /** Live time when the event is on the schedule, else the published one. */
      scheduledAt: string | null;
      crews: CrewOnRow[];
    }
  | { type: 'logistics'; key: string; event: ShareScheduleItem };

/** Every day the page can show: the regatta's dates plus any day that has a line or an entry. */
export function shareDays(view: ShareView): string[] {
  const { startDate, endDate } = view.regatta;
  const days = new Set(startDate ? daysBetween(startDate, endDate || startDate) : []);
  for (const s of view.schedule) if (s.day) days.add(s.day);
  for (const t of view.teams) for (const e of t.entries) if (e.day) days.add(e.day);
  return [...days].sort();
}

function teamsIn(view: ShareView, teamId: string | null): ShareTeam[] {
  return teamId ? view.teams.filter((t) => t.id === teamId) : view.teams;
}

/** Published crews by the live event they race in, for the teams shown. */
function crewsByEvent(view: ShareView, teamId: string | null): Map<string, CrewOnRow[]> {
  const map = new Map<string, CrewOnRow[]>();
  for (const team of teamsIn(view, teamId)) {
    for (const entry of team.entries) {
      if (!entry.eventId) continue;
      map.set(entry.eventId, [...(map.get(entry.eventId) ?? []), { team, entry }]);
    }
  }
  return map;
}

/**
 * One day's rows in time order: races that have a published crew among the teams shown (with
 * those crews), and the logistics lines for those teams. Races no shown team entered are left
 * out: parents want their own crews. Published entries whose event left the schedule keep
 * their published time.
 */
export function dayRows(view: ShareView, day: string, teamId: string | null): DayRow[] {
  const crews = crewsByEvent(view, teamId);
  const scheduled = new Set(view.schedule.map((s) => s.id));
  const rows: { row: DayRow; order: number }[] = [];
  view.schedule.forEach((event, i) => {
    if (event.day !== day) return;
    if (event.kind === 'logistics') {
      if (teamId && event.teamIds.length > 0 && !event.teamIds.includes(teamId)) return;
      rows.push({ row: { type: 'logistics', key: event.id, event }, order: i });
      return;
    }
    const here = crews.get(event.id);
    if (!here?.length) return;
    rows.push({
      row: { type: 'race', key: event.id, event, scheduledAt: event.scheduledAt, crews: here },
      order: i,
    });
  });
  for (const team of teamsIn(view, teamId)) {
    for (const entry of team.entries) {
      if (entry.day !== day || (entry.eventId && scheduled.has(entry.eventId))) continue;
      rows.push({
        row: {
          type: 'race',
          key: `entry:${entry.entryId}`,
          event: null,
          scheduledAt: entry.scheduledAt,
          crews: [{ team, entry }],
        },
        order: view.schedule.length,
      });
    }
  }
  const time = (r: DayRow) => (r.type === 'race' ? r.scheduledAt : r.event.scheduledAt);
  return rows
    .sort((a, b) => {
      const at = time(a.row);
      const bt = time(b.row);
      if (at !== bt) {
        if (!at) return 1;
        if (!bt) return -1;
        return at < bt ? -1 : 1;
      }
      return a.order - b.order;
    })
    .map((r) => r.row);
}

/** Published crews with no event and no day: shown once, below the day's rows. */
export function crewsWithoutDay(view: ShareView, teamId: string | null): CrewOnRow[] {
  const scheduled = new Set(view.schedule.map((s) => s.id));
  const out: CrewOnRow[] = [];
  for (const team of teamsIn(view, teamId)) {
    for (const entry of team.entries) {
      if (entry.day) continue;
      if (entry.eventId && scheduled.has(entry.eventId)) continue;
      out.push({ team, entry });
    }
  }
  return out;
}

/**
 * The day to open on: today at the course when the regatta is on, else the first day with a
 * published crew, else the first day.
 */
export function defaultDay(view: ShareView, days: string[], today: string): string | null {
  if (days.includes(today)) return today;
  const withCrew = days.find((d) => dayRows(view, d, null).some((r) => r.type === 'race'));
  return withCrew ?? days[0] ?? null;
}

// ---------------------------------------------------------------------------
// Names

export interface SeatLine {
  seat: string;
  /** 'Cox', 'Stroke', '7', ..., 'Bow'; empty for a single. */
  label: string;
  name: string | null;
}

/**
 * A crew as the club's published sheets read it: cox first, then stroke down to bow. Seats
 * missing from the snapshot are empty.
 */
export function seatLines(entry: ShareEntry, seatCount: number, coxed: boolean): SeatLine[] {
  const byseat = new Map<string, string | null>(
    entry.seats.map((s) => [s.seat, s.athleteName || null]),
  );
  const out: SeatLine[] = [];
  if (coxed) out.push({ seat: 'cox', label: 'Cox', name: byseat.get('cox') ?? null });
  for (let n = seatCount; n >= 1; n--) {
    const label = seatCount === 1 ? '' : n === seatCount ? 'Stroke' : n === 1 ? 'Bow' : String(n);
    out.push({ seat: String(n), label, name: byseat.get(String(n)) ?? null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Words and times

const STAGE_LABELS: Record<string, string> = {
  heat: 'Heat',
  semi: 'Semifinal',
  final: 'Final',
  time_trial: 'Time trial',
};

/** "Heat", "Final", "Time trial"; nothing for a single race. */
export function stageLabel(stage: string | null | undefined): string {
  return (stage && STAGE_LABELS[stage]) || '';
}

/** "Event 14 · Men's Junior 4+". */
export function eventTitle(e: { eventNumber?: string; name?: string; eventName?: string }): string {
  const name = e.name || e.eventName || '';
  return e.eventNumber ? `Event ${e.eventNumber} · ${name}` : name;
}

/** "9:40 AM" in the regatta's zone; "TBD" without a time. */
export function raceTime(iso: string | null, timeZone: string): string {
  return iso ? clockAt(iso, timeZone, true) : 'TBD';
}

function format(iso: string, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).format(new Date(iso));
}

/**
 * When something happened, as short as it can be: "9:40 AM" today, "May 14, 9:00 PM" this year,
 * "May 14, 2025, 9:00 PM" before that (unless `year: false`). All in the regatta's zone.
 */
export function shortInstant(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
  opts: { year?: boolean } = {},
): string {
  const then = instantToZoned(iso, timeZone).day;
  const today = instantToZoned(now.toISOString(), timeZone).day;
  if (then === today) return clockAt(iso, timeZone, true);
  const sameYear = opts.year === false || then.slice(0, 4) === today.slice(0, 4);
  return format(iso, timeZone, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// The load list

export type ChecklistGrouping = 'kind' | 'container';

export const KIND_LABELS: Record<LoadItemKind, { group: string; one: string }> = {
  shell: { group: 'Shells', one: 'Shell' },
  riggers: { group: 'Riggers', one: 'Riggers' },
  oar_set: { group: 'Oars', one: 'Oar set' },
  gear: { group: 'Gear', one: 'Gear' },
  extra: { group: 'Extras', one: 'Extra' },
};

const KIND_ORDER = Object.keys(KIND_LABELS) as LoadItemKind[];

/** Where a line rides: its container ("Truck 1 bed"), else its trailer. */
export function whereItRides(item: Pick<ShareLoadItem, 'container' | 'trailerName'>): string {
  return item.container || item.trailerName || '';
}

export interface ChecklistGroup<T> {
  key: string;
  title: string;
  lines: T[];
}

/** Lines by kind (Shells, Riggers, Oars, Gear, Extras) or by container, in list order. */
export function groupChecklist<T extends ShareLoadItem>(
  lines: readonly T[],
  by: ChecklistGrouping,
): ChecklistGroup<T>[] {
  const groups = new Map<string, ChecklistGroup<T>>();
  const keyOf = (l: T) => (by === 'kind' ? l.kind : whereItRides(l));
  const titleOf = (l: T) =>
    by === 'kind' ? (KIND_LABELS[l.kind]?.group ?? l.kind) : whereItRides(l) || 'No container';
  for (const line of lines) {
    const key = keyOf(line);
    const g = groups.get(key) ?? { key, title: titleOf(line), lines: [] };
    g.lines.push(line);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  if (by === 'kind') {
    return list.sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.key as LoadItemKind) - KIND_ORDER.indexOf(b.key as LoadItemKind),
    );
  }
  // Containers alphabetically, lines without one last.
  return list.sort((a, b) => (!a.key ? 1 : !b.key ? -1 : a.title.localeCompare(b.title)));
}
