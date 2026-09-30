// Layout math for the day timeline (PLAN.md §4.5, §6.3): pure functions from a ConflictInput
// and its findings to rows, lanes, bars, and marks. <DayTimeline> only draws what this returns.
//
// - Each entry with a scheduled race is a bar spanning its busy window (launch lead to return),
//   with the race as a darker segment (busyWindows() from the conflict engine).
// - Rows group bars by shell (default), team, or oar set. Bars that overlap in time go to
//   separate lanes of their row, so every bar stays whole and clickable.
// - Marks come from the conflict engine, not from geometry, so the timeline and the conflicts
//   panel always agree: a shell or oar conflict is a hatched intersection across both bars'
//   lanes; a hot seat is a link from the earlier boat landing to the next race start.
//   (Every hot seat overlaps in busy windows by definition, so geometry alone cannot tell a
//   hot seat from a conflict, and two crews splitting one oar set overlap without either.)

import {
  busyWindows,
  instantToZoned,
  oarSetLabel,
  shellLabel,
  zonedToInstant,
  clockAt,
  type ConflictInput,
  type Entry,
  type Finding,
  type OarSet,
  type RegattaEvent,
  type Shell,
  type Team,
  type TeamColorKey,
} from '@srt/domain';

export type TimelineGroupBy = 'shell' | 'team' | 'oar_set';

export const MINUTE_MS = 60_000;
export const QUARTER_MS = 15 * MINUTE_MS;
export const HOUR_MS = 60 * MINUTE_MS;

export interface TimelineRow {
  /** Shell, team, or oar set id; NO_RESOURCE for entries without a shell or oar set. */
  id: string;
  groupBy: TimelineGroupBy;
  /** Plain text for screen readers and the mini view: "LLL (8+)", "Junior boys", "24-D". */
  label: string;
  shell?: Shell;
  team?: Team;
  oarSet?: OarSet;
  /** The shell's or oar set's home team color (the chip's dot); the team's own on team rows. */
  teamColor: TeamColorKey | null;
  /** Lanes needed so no two bars in the row overlap (at least 1). */
  lanes: number;
}

export interface TimelineBar {
  entryId: string;
  rowId: string;
  lane: number;
  /** Epoch ms: when the crew needs the shell, the race start and end, and when it is back. */
  busyStart: number;
  raceStart: number;
  raceEnd: number;
  busyEnd: number;
  teamId: string;
  teamColor: TeamColorKey | null;
  /** Short text drawn on the bar: "Boys 2V8" (on team rows, "2V8 · LLL"). */
  label: string;
  /** Race start, "9:52". */
  raceClock: string;
  /** Full accessible name: "Boys 2V8, Youth Men's 8+ at 8:16, LLL, busy 7:01 to 8:41". */
  description: string;
  /** The description's parts, for the hover card. */
  details: TimelineBarDetails;
}

export interface TimelineBarDetails {
  /** "Boys 2V8". */
  name: string;
  /** "Youth Men's 8+ at 8:16". */
  event: string;
  /** "LLL (8+)", or null without a shell. */
  shell: string | null;
  /** "24-D · yellow-white", or null without oars. */
  oars: string | null;
  /** "7:01 to 8:41". */
  busy: string;
}

export type TimelineMarkKind = 'conflict' | 'hot_seat';

export interface TimelineMark {
  /** The finding's id. */
  id: string;
  kind: TimelineMarkKind;
  acknowledged: boolean;
  rowId: string;
  /** The earlier and later entry of the pair. */
  fromEntryId: string;
  toEntryId: string;
  /**
   * Conflict: the hatched region (the bars' intersection). Hot seat: the link, from the earlier
   * boat back on the dock (start) to the next race start (end).
   */
  start: number;
  end: number;
  gapMin?: number;
  message: string;
}

export interface TimelineTick {
  t: number;
  /** On the hour: a stronger gridline and a label. */
  hour: boolean;
  /** "9:00" on hour ticks. */
  label?: string;
}

export interface TimelineAxis {
  /** Epoch ms, on the hour in the regatta's zone. */
  start: number;
  end: number;
  /** Every 15 minutes from start to end inclusive. */
  ticks: TimelineTick[];
}

export interface TimelineModel {
  day: string;
  timezone: string;
  groupBy: TimelineGroupBy;
  rows: TimelineRow[];
  /** In row order, then lane, then start. */
  bars: TimelineBar[];
  marks: TimelineMark[];
  /** Null when the day has no bars. */
  axis: TimelineAxis | null;
}

export const NO_RESOURCE = 'none';

const CONFLICT_CODES = new Set(['SHELL_CONFLICT', 'OARS_CONFLICT']);
const HOT_SEAT_CODES = new Set(['SHELL_HOT_SEAT', 'OARS_HOT_SEAT']);

// ---------------------------------------------------------------------------
// Axis

function floorHour(ms: number, timeZone: string): number {
  const z = instantToZoned(new Date(ms).toISOString(), timeZone);
  return Date.parse(zonedToInstant(z.day, `${z.time.slice(0, 2)}:00`, timeZone));
}

/**
 * The axis for a time span: from the hour at or before `startMs` to the hour at or after
 * `endMs` (in the regatta's zone), with a tick every 15 minutes and a label on each hour.
 */
export function dayAxis(startMs: number, endMs: number, timeZone: string): TimelineAxis {
  const start = floorHour(startMs, timeZone);
  const endFloor = floorHour(endMs, timeZone);
  let end = endFloor < endMs ? endFloor + HOUR_MS : endFloor;
  if (end <= start) end = start + HOUR_MS;
  const ticks: TimelineTick[] = [];
  for (let t = start; t <= end; t += QUARTER_MS) {
    const iso = new Date(t).toISOString();
    const hour = instantToZoned(iso, timeZone).time.endsWith(':00');
    ticks.push(hour ? { t, hour, label: clockAt(iso, timeZone) } : { t, hour });
  }
  return { start, end, ticks };
}

/** Minutes the axis spans. */
export function axisMinutes(axis: Pick<TimelineAxis, 'start' | 'end'>): number {
  return (axis.end - axis.start) / MINUTE_MS;
}

/** Horizontal position of an instant, in px from the axis start. */
export function timeToX(t: number, axis: Pick<TimelineAxis, 'start'>, pxPerMin: number): number {
  return ((t - axis.start) / MINUTE_MS) * pxPerMin;
}

// ---------------------------------------------------------------------------
// Lanes and marks

export interface Span {
  id: string;
  start: number;
  end: number;
}

/** Whether two half-open spans [start, end) share any time. */
export function overlaps(a: Pick<Span, 'start' | 'end'>, b: Pick<Span, 'start' | 'end'>): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Greedy interval partitioning: each span (by start, then id) takes the first lane whose
 * spans it does not overlap. Returns the lane per id and the lane count (at least 1).
 */
export function packLanes(spans: readonly Span[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...spans].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  for (const s of sorted) {
    let lane = laneEnds.findIndex((end) => end <= s.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(s.end);
    } else laneEnds[lane] = s.end;
    lanes.set(s.id, lane);
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}

type Window = Pick<TimelineBar, 'busyStart' | 'raceStart' | 'busyEnd'>;

/**
 * The hatched region of a conflict between the earlier bar `a` and the later bar `b`: their
 * intersection, or (with unusual settings where the windows do not touch) the stretch from
 * `a` landing to `b` racing.
 */
export function conflictRegion(a: Window, b: Window): { start: number; end: number } {
  const start = Math.max(a.busyStart, b.busyStart);
  const end = Math.min(a.busyEnd, b.busyEnd);
  if (start < end) return { start, end };
  return { start: Math.min(a.busyEnd, b.raceStart), end: Math.max(a.busyEnd, b.raceStart) };
}

/** A hot seat's link: from the earlier boat back on the dock to the later race start. */
export function hotSeatLink(a: Window, b: Window): { start: number; end: number } {
  return { start: Math.min(a.busyEnd, b.raceStart), end: Math.max(a.busyEnd, b.raceStart) };
}

// ---------------------------------------------------------------------------
// The model

export interface BuildTimelineOptions {
  day: string;
  groupBy?: TimelineGroupBy;
  /** Keep only some entries (the schedule's team, class, and shell filters). */
  includeEntry?: (entry: Entry) => boolean;
}

function eventText(event: RegattaEvent | undefined): string {
  if (!event) return '';
  return event.eventNumber ? `Event ${event.eventNumber}, ${event.name}` : event.name;
}

function rowKey(entry: Entry, groupBy: TimelineGroupBy): string {
  if (groupBy === 'team') return entry.teamId;
  if (groupBy === 'shell') return entry.shellId || NO_RESOURCE;
  return entry.oarSetId || NO_RESOURCE;
}

/** The whole timeline for one day: rows, bars in lanes, conflict and hot-seat marks, axis. */
export function buildTimeline(
  input: ConflictInput,
  findings: readonly Finding[],
  { day, groupBy = 'shell', includeEntry }: BuildTimelineOptions,
): TimelineModel {
  const tz = input.timezone;
  const entryById = new Map(input.entries.map((e) => [e.id, e]));
  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const teamById = new Map(input.teams.map((t) => [t.id, t]));
  const shellById = new Map(input.shells.map((s) => [s.id, s]));
  const oarById = new Map(input.oarSets.map((o) => [o.id, o]));

  const windows = busyWindows(input).filter((w) => {
    if (w.day !== day) return false;
    const entry = entryById.get(w.entryId);
    return !!entry && (!includeEntry || includeEntry(entry));
  });

  // Bars, grouped by row.
  const byRow = new Map<string, Omit<TimelineBar, 'lane'>[]>();
  for (const w of windows) {
    const entry = entryById.get(w.entryId)!;
    const team = teamById.get(entry.teamId);
    const shell = entry.shellId ? shellById.get(entry.shellId) : undefined;
    const oars = entry.oarSetId ? oarById.get(entry.oarSetId) : undefined;
    const teamName = team?.shortName || team?.name || 'Team';
    // On team rows the team is the row, so the bar names the shell instead.
    const label =
      groupBy === 'team'
        ? [entry.label, shell ? shellLabel(shell) : null].filter(Boolean).join(' · ')
        : `${teamName} ${entry.label}`.trim();
    const busyStart = Date.parse(w.busyStart);
    const busyEnd = Date.parse(w.busyEnd);
    const raceClock = clockAt(w.raceStart, tz);
    const details: TimelineBarDetails = {
      name: `${teamName} ${entry.label}`.trim(),
      event: `${eventText(eventById.get(entry.eventId ?? '')) || 'Race'} at ${raceClock}`,
      shell: shell ? shellLabel(shell) : null,
      oars: oars ? oarSetLabel(oars) : null,
      busy: `${clockAt(w.busyStart, tz)} to ${clockAt(w.busyEnd, tz)}`,
    };
    const parts = [
      details.name,
      details.event,
      details.shell ?? 'no shell',
      ...(groupBy === 'oar_set' || oars ? [oars ? `oars ${details.oars}` : 'no oars'] : []),
      `busy ${details.busy}`,
    ];
    const bar = {
      entryId: entry.id,
      rowId: rowKey(entry, groupBy),
      busyStart,
      raceStart: Date.parse(w.raceStart),
      raceEnd: Date.parse(w.raceEnd),
      busyEnd,
      teamId: entry.teamId,
      teamColor: team?.colorKey ?? null,
      label,
      raceClock,
      description: parts.join(', '),
      details,
    };
    const list = byRow.get(bar.rowId) ?? [];
    list.push(bar);
    byRow.set(bar.rowId, list);
  }

  // Rows with their lanes. Shell and oar rows run in order of first use (the day reads top
  // left to bottom right); team rows keep the club's team order. "No shell" goes last.
  const rows: TimelineRow[] = [];
  const bars: TimelineBar[] = [];
  const firstUse = (id: string) => Math.min(...byRow.get(id)!.map((b) => b.busyStart));
  const rowIds = [...byRow.keys()].sort((a, b) => {
    if (a === NO_RESOURCE) return 1;
    if (b === NO_RESOURCE) return -1;
    if (groupBy === 'team') {
      const ta = teamById.get(a);
      const tb = teamById.get(b);
      return (
        (ta?.sortOrder ?? 0) - (tb?.sortOrder ?? 0) || (ta?.name ?? a).localeCompare(tb?.name ?? b)
      );
    }
    return firstUse(a) - firstUse(b) || rowLabel(a).localeCompare(rowLabel(b));
  });

  function rowLabel(id: string): string {
    if (groupBy === 'team') return teamById.get(id)?.name ?? 'Team';
    if (groupBy === 'shell') {
      if (id === NO_RESOURCE) return 'No shell';
      const s = shellById.get(id);
      return s ? `${shellLabel(s)} (${s.boatClass})` : 'Shell';
    }
    if (id === NO_RESOURCE) return 'No oars';
    const o = oarById.get(id);
    return o ? oarSetLabel(o) : 'Oar set';
  }

  function rowColor(id: string): TeamColorKey | null {
    if (groupBy === 'team') return teamById.get(id)?.colorKey ?? null;
    const home = groupBy === 'shell' ? shellById.get(id)?.homeTeamId : oarById.get(id)?.homeTeamId;
    return home ? (teamById.get(home)?.colorKey ?? null) : null;
  }

  for (const id of rowIds) {
    const rowBars = byRow.get(id)!;
    const { lanes, count } = packLanes(
      rowBars.map((b) => ({ id: b.entryId, start: b.busyStart, end: b.busyEnd })),
    );
    rows.push({
      id,
      groupBy,
      label: rowLabel(id),
      teamColor: rowColor(id),
      lanes: count,
      ...(groupBy === 'shell' && id !== NO_RESOURCE ? { shell: shellById.get(id) } : {}),
      ...(groupBy === 'team' ? { team: teamById.get(id) } : {}),
      ...(groupBy === 'oar_set' && id !== NO_RESOURCE ? { oarSet: oarById.get(id) } : {}),
    });
    const placed = rowBars
      .map((b) => ({ ...b, lane: lanes.get(b.entryId) ?? 0 }))
      .sort((a, b) => a.lane - b.lane || a.busyStart - b.busyStart);
    bars.push(...placed);
  }

  // Marks: shell and oar pairs from the engine, drawn where both bars share a row.
  const barById = new Map(bars.map((b) => [b.entryId, b]));
  const marks: TimelineMark[] = [];
  for (const f of findings) {
    const isConflict = CONFLICT_CODES.has(f.code);
    const isHotSeat = HOT_SEAT_CODES.has(f.code);
    if ((!isConflict && !isHotSeat) || f.entryIds.length !== 2 || !f.resource) continue;
    if (groupBy === 'shell' && f.resource.type !== 'shell') continue;
    if (groupBy === 'oar_set' && f.resource.type !== 'oar_set') continue;
    const a = barById.get(f.entryIds[0]!);
    const b = barById.get(f.entryIds[1]!);
    if (!a || !b || a.rowId !== b.rowId) continue;
    const [first, second] = a.raceStart <= b.raceStart ? [a, b] : [b, a];
    const span = isConflict ? conflictRegion(first, second) : hotSeatLink(first, second);
    marks.push({
      id: f.id,
      kind: isConflict ? 'conflict' : 'hot_seat',
      acknowledged: !!f.acknowledged,
      rowId: a.rowId,
      fromEntryId: first.entryId,
      toEntryId: second.entryId,
      start: span.start,
      end: span.end,
      ...(f.gapMin !== undefined ? { gapMin: f.gapMin } : {}),
      message: f.message,
    });
  }

  const axis =
    bars.length === 0
      ? null
      : dayAxis(
          Math.min(...bars.map((b) => b.busyStart)),
          Math.max(...bars.map((b) => b.busyEnd)),
          tz,
        );

  return { day, timezone: tz, groupBy, rows, bars, marks, axis };
}

// ---------------------------------------------------------------------------
// Drawing helpers

/**
 * Trim text to fit a width, with an ellipsis. Uses an average character width, which is close
 * enough for short labels in Instrument Sans at 12 px (≈ 6.4 px per character).
 */
export function fitText(text: string, widthPx: number, charPx = 6.4): string {
  const max = Math.floor(widthPx / charPx);
  if (max <= 1) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

/** Whether an instant falls on `day` in the zone and inside the axis (for the now-line). */
export function nowOnAxis(
  now: number | null | undefined,
  axis: Pick<TimelineAxis, 'start' | 'end'> | null,
  day: string,
  timeZone: string,
): boolean {
  if (now == null || !axis || Number.isNaN(now)) return false;
  if (instantToZoned(new Date(now).toISOString(), timeZone).day !== day) return false;
  return now >= axis.start && now <= axis.end;
}

/** Days that have at least one scheduled, non-scratched entry, in order. */
export function timelineDays(input: ConflictInput): string[] {
  return [...new Set(busyWindows(input).map((w) => w.day))].sort();
}
