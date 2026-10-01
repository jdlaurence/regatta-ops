// "Export to Excel": the print view on screen as a workbook. Each view builds its sheets from the
// rows it prints (same days, team, filters, version, and source), one sheet per printed page:
// a title line, then one or more tables. Times are cells Excel can sort ('HH:mm' wall times in
// the regatta zone); "TBD" stays text.

import {
  athleteName,
  instantToZoned,
  isCoxed,
  seatsFor,
  type Athlete,
  type PublishedEntry,
  type Seat,
  type Team,
} from '@regatta-ops/domain';
import type { RegattaWorkingSet } from '@/data';
import { eventTitle } from '@/features/schedule/lib';
import type {
  GridTable,
  ListScheduleRow,
  RaceRow,
  RunOfShowRow,
  ScheduleRow,
  SheetPage,
  TeamLineups,
} from './derive';
import {
  coxText,
  dayHeading,
  eventText,
  oarText,
  paperSeatOrder,
  rigText,
  seatText,
  stageText,
} from './format';

/** A wall time in the regatta zone, 'HH:mm'. */
export interface ExportTime {
  time: string;
}

export type ExportCell = string | ExportTime;

export interface ExportTable {
  /** A line above the table ("Eights", "Unboated"). */
  heading?: string;
  columns: string[];
  rows: ExportCell[][];
}

export interface ExportSheet {
  /** The tab name; the writer shortens and de-duplicates it. */
  name: string;
  /** The first line of the sheet: what it is, the regatta, the day. */
  title: string;
  tables: ExportTable[];
}

function timeCell(iso: string | null | undefined, timeZone: string): ExportCell {
  return iso ? { time: instantToZoned(iso, timeZone).time } : 'TBD';
}

function teamName(team: Team): string {
  return team.shortName || team.name;
}

/** "8 Ana Diaz, 7 empty, ...": the lineup as the schedules print it. */
export function lineupText(entry: PublishedEntry, withCox: boolean): string {
  const bySeat = new Map(entry.seats.map((s) => [s.seat, s]));
  return paperSeatOrder(entry.boatClass)
    .filter((s) => withCox || s !== 'cox')
    .map((seat) => {
      const s = bySeat.get(seat);
      return `${seatText(seat)} ${s?.athleteId ? (s.athleteName ?? 'Unknown athlete') : 'empty'}`;
    })
    .join(', ');
}

function title(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Schedules

export function scheduleListExport(
  ws: RegattaWorkingSet,
  day: string,
  rows: readonly ListScheduleRow[],
  opts: { showEntries: boolean; team: Team | null; filterText: string | null },
): ExportSheet {
  const tz = ws.regatta.timezone;
  const showTeams = !opts.team && ws.participatingTeams.length > 1;
  const columns = opts.showEntries
    ? ['Time', 'Event', 'Crew', 'Shell', 'Oars', 'Lineup, cox then stroke to bow']
    : ['Time', 'Event', 'Class', 'Stage'];
  const out: ExportCell[][] = [];
  for (const row of rows) {
    const time = row.event.scheduledAt ? timeCell(row.event.scheduledAt, tz) : '';
    if (row.kind === 'logistics') {
      const teams = showTeams ? row.teams.map(teamName).join(', ') : '';
      out.push([time, teams ? `${row.event.name} (${teams})` : row.event.name]);
      continue;
    }
    const e = row.event;
    const stage = e.stage && e.stage !== 'race' ? stageText(e.stage) : '';
    const race = timeCell(e.scheduledAt, tz);
    if (!opts.showEntries) {
      out.push([race, eventTitle(e), e.boatClass ?? '', stage]);
      continue;
    }
    out.push([race, [eventTitle(e), e.boatClass, stage].filter(Boolean).join(' · ')]);
    for (const entry of row.entries) {
      const crew = showTeams && entry.team ? `${teamName(entry.team)} ${entry.label}` : entry.label;
      out.push(
        entry.lineup
          ? [
              '',
              '',
              crew,
              entry.lineup.shellName ?? '',
              oarText(entry.lineup, ws.byId.oarSets),
              lineupText(entry.lineup, true),
            ]
          : ['', '', crew, entry.scratched ? 'Scratched' : ''],
      );
    }
  }
  return {
    name: dayHeading(day),
    title: title(
      opts.team ? `${opts.team.name} schedule` : 'Schedule',
      ws.regatta.name,
      dayHeading(day),
      opts.filterText,
    ),
    tables: [{ columns, rows: out }],
  };
}

export function dayScheduleExport(
  ws: RegattaWorkingSet,
  day: string,
  rows: readonly ScheduleRow[],
  team: Team | null,
): ExportSheet {
  const tz = ws.regatta.timezone;
  const columns = [
    'Time',
    'Stage',
    'Event',
    ...(team ? [] : ['Team']),
    'Crew',
    'Cox',
    'Shell',
    'Oars',
    'Lineup, stroke to bow',
  ];
  const out = rows.map((row): ExportCell[] => {
    if (row.kind === 'logistics') {
      const time = row.event.scheduledAt ? timeCell(row.event.scheduledAt, tz) : '';
      const teams = team ? '' : row.teams.map(teamName).join(', ');
      return [time, '', row.event.name, ...(team ? [] : [teams])];
    }
    const e = row.entry;
    return [
      timeCell(e.scheduledAt, tz),
      stageText(e.stage),
      eventText(e),
      ...(team ? [] : [teamName(row.team)]),
      e.label,
      coxText(e),
      e.shellName ?? '',
      oarText(e, ws.byId.oarSets),
      lineupText(e, false),
    ];
  });
  return {
    name: dayHeading(day),
    title: title(
      team ? `${team.name} day schedule` : 'Day schedule',
      ws.regatta.name,
      dayHeading(day),
    ),
    tables: [{ columns, rows: out }],
  };
}

export function masterScheduleExport(
  ws: RegattaWorkingSet,
  day: string,
  rows: readonly RaceRow[],
): ExportSheet {
  const tz = ws.regatta.timezone;
  return {
    name: dayHeading(day),
    title: title('Master schedule', ws.regatta.name, dayHeading(day)),
    tables: [
      {
        columns: ['Time', 'Team', 'Crew', 'Shell', 'Oars', 'Event'],
        rows: rows.map(({ entry: e, team }) => [
          timeCell(e.scheduledAt, tz),
          teamName(team),
          e.label,
          e.shellName ?? '',
          oarText(e, ws.byId.oarSets),
          e.stage && e.stage !== 'race' ? `${eventText(e)} · ${stageText(e.stage)}` : eventText(e),
        ]),
      },
    ],
  };
}

export function runOfShowExport(
  ws: RegattaWorkingSet,
  day: string,
  rows: readonly RunOfShowRow[],
  opts: { team: Team | null; version: 'athletes' | 'coaches' },
): ExportSheet {
  const tz = ws.regatta.timezone;
  const showTeam = !opts.team && ws.participatingTeams.length > 1;
  const at = (row: RunOfShowRow, step: 'warmUp' | 'boatMeeting' | 'launch'): ExportCell =>
    row.times ? timeCell(row.times[step].at, tz) : '';
  const team = (row: RunOfShowRow) => (showTeam ? [teamName(row.team)] : []);
  const table: ExportTable =
    opts.version === 'athletes'
      ? {
          columns: [
            'Event #',
            'Cox',
            ...(showTeam ? ['Team'] : []),
            'Event',
            'Crew',
            'Bow #',
            'Shell',
            'Rig',
            'Oars',
            'Clams',
            'Oar carriers',
            'Warm-up',
            'Boat meeting',
            'Launch',
            'Race',
          ],
          rows: rows.map((row) => [
            row.entry.eventNumber ?? '',
            coxText(row.entry),
            ...team(row),
            row.entry.eventName ?? 'No event',
            row.entry.label,
            row.live?.bowNumber ?? '',
            row.entry.shellName ?? '',
            rigText(row.rig, row.sculling),
            oarText(row.entry, ws.byId.oarSets),
            row.live?.clams ?? '',
            row.live?.oarCarriers ?? '',
            at(row, 'warmUp'),
            at(row, 'boatMeeting'),
            at(row, 'launch'),
            timeCell(row.entry.scheduledAt, tz),
          ]),
        }
      : {
          columns: [
            ...(showTeam ? ['Team'] : []),
            'Crew',
            'Boat meeting',
            'Launch',
            'Race',
            'Shell',
            'Oars',
            'Clams',
            'Bow #',
          ],
          rows: rows.map((row) => [
            ...team(row),
            [row.entry.eventName, row.entry.label].filter(Boolean).join(' ') || row.entry.boatClass,
            at(row, 'boatMeeting'),
            at(row, 'launch'),
            timeCell(row.entry.scheduledAt, tz),
            row.entry.shellName ?? '',
            oarText(row.entry, ws.byId.oarSets),
            row.live?.clams ?? '',
            row.live?.bowNumber ?? '',
          ]),
        };
  return {
    name: dayHeading(day),
    title: title(
      opts.team ? `${opts.team.name} run of show` : 'Run of show',
      ws.regatta.name,
      dayHeading(day),
    ),
    tables: [table],
  };
}

// ---------------------------------------------------------------------------
// Lineups

/** The seat columns a set of entries needs: cox when any boat is coxed, then stroke to bow. */
function seatColumns(entries: readonly PublishedEntry[]): Seat[] {
  const coxed = entries.some((e) => isCoxed(e.boatClass));
  const rowers = Math.max(
    0,
    ...entries.map((e) => seatsFor(e.boatClass).filter((s) => s !== 'cox').length),
  );
  const rowing = Array.from({ length: rowers }, (_, i) => String(rowers - i) as Seat);
  return coxed ? ['cox', ...rowing] : rowing;
}

/** The lineup sheet: one sheet per team per day, one row per entry with a column per seat. */
export function lineupSheetExport(
  ws: RegattaWorkingSet,
  page: SheetPage,
  unboated: readonly Athlete[],
): ExportSheet {
  const tz = ws.regatta.timezone;
  const team = page.lineups.team;
  const seats = seatColumns(page.entries);
  const tables: ExportTable[] = [
    {
      columns: [
        'Time',
        'Crew',
        'Event',
        'Stage',
        'Shell',
        'Oars',
        ...seats.map((s) => (s === 'cox' ? 'Cox' : `Seat ${s}`)),
        'Hot seat',
      ],
      rows: page.entries.map((e) => {
        const bySeat = new Map(e.seats.map((s) => [s.seat, s]));
        const own = new Set(seatsFor(e.boatClass));
        return [
          e.day ? timeCell(e.scheduledAt, tz) : '',
          e.label,
          eventText(e),
          stageText(e.stage),
          e.shellName ?? '',
          oarText(e, ws.byId.oarSets),
          ...seats.map((seat) => {
            if (!own.has(seat)) return '';
            const s = bySeat.get(seat);
            return s?.athleteId ? (s.athleteName ?? 'Unknown athlete') : 'empty';
          }),
          (e.hotSeatPlan ?? '').trim(),
        ];
      }),
    },
  ];
  if (unboated.length > 0) {
    tables.push({
      heading: `Unboated (${unboated.length})`,
      columns: ['Athlete'],
      rows: unboated.map((a) => [athleteName(a)]),
    });
  }
  return {
    name: `${teamName(team)} ${dayHeading(page.day)}`,
    title: title(`${team.name} lineups`, ws.regatta.name, dayHeading(page.day)),
    tables,
  };
}

/** The lineup grid: one sheet per team, crews as columns, as printed. */
export function lineupGridExport(
  ws: RegattaWorkingSet,
  lineups: TeamLineups,
  grids: readonly GridTable[],
  dayLabel: string,
): ExportSheet {
  const team = lineups.team;
  return {
    name: teamName(team),
    title: title(`${team.name} lineup grid`, ws.regatta.name, dayLabel),
    tables: grids.map((t) => ({
      heading: t.title,
      columns: ['Crew', ...t.columns.map((c) => c.label)],
      rows: [
        ['Event', ...t.columns.map((c) => c.event)],
        ...t.stages.map((stage) => [
          stageText(stage),
          ...t.columns.map((c) => c.times[stage] ?? ''),
        ]),
        ...t.seats.map((seat) => [
          seatText(seat),
          ...t.columns.map((c) => {
            const v = c.cells[seat];
            return v === undefined ? '' : (v ?? 'empty');
          }),
        ]),
        ['Shell', ...t.columns.map((c) => c.shell)],
        ['Oars', ...t.columns.map((c) => c.oars)],
      ],
    })),
  };
}

// ---------------------------------------------------------------------------
// Files

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "head-of-the-lake-junior-boys-run-of-show-2026-11-01.xlsx". */
export function exportFileName(
  ws: RegattaWorkingSet,
  what: string,
  opts: { team?: Team | null; day?: string | null } = {},
): string {
  const parts = [ws.regatta.name, opts.team?.name, what].filter((p): p is string => !!p).map(slug);
  return `${[...parts, opts.day].filter(Boolean).join('-')}.xlsx`;
}
