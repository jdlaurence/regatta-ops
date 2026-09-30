// CSV export of a regatta's entries (PLAN.md §4.11): one row per entry, every team or one,
// in schedule order, with seats by name. Live data (the coaches' working copy), scratched
// entries included with their status.

import {
  athleteName,
  instantToZoned,
  oarSetLabel,
  shellLabel,
  toCsv,
  type Entry,
  type EntryStatus,
  type Id,
  type Seat,
} from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';

const SEAT_COLUMNS: Seat[] = ['1', '2', '3', '4', '5', '6', '7', '8', 'cox'];

export const ENTRY_CSV_HEADER = [
  'Team',
  'Event number',
  'Event',
  'Day',
  'Time',
  'Label',
  'Class',
  'Shell',
  'Oars',
  ...SEAT_COLUMNS.map((s) => (s === 'cox' ? 'Cox' : `Seat ${s}`)),
  'Status',
];

const STATUS_TEXT: Record<EntryStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  scratched: 'Scratched',
};

const LAST = '￿';

/** Entries of the regatta (or one team) in schedule order, then team order, then label. */
function ordered(ws: RegattaWorkingSet, teamId: Id | null): Entry[] {
  const ev = (e: Entry) => (e.eventId ? ws.byId.events.get(e.eventId) : undefined);
  const teamOrder = (e: Entry) => ws.byId.teams.get(e.teamId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const key = (e: Entry): [string, string, number, string] => {
    const x = ev(e);
    return x ? [x.day, x.scheduledAt ?? LAST, x.sortOrder, x.id] : [LAST, LAST, 0, ''];
  };
  return ws.entries
    .filter((e) => !teamId || e.teamId === teamId)
    .sort((a, b) => {
      const [da, ta, sa, ia] = key(a);
      const [db, tb, sb, ib] = key(b);
      if (da !== db) return da < db ? -1 : 1;
      if (ta !== tb) return ta < tb ? -1 : 1;
      if (sa !== sb) return sa - sb;
      if (ia !== ib) return ia < ib ? -1 : 1;
      return (
        teamOrder(a) - teamOrder(b) ||
        a.label.localeCompare(b.label, 'en', { numeric: true }) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      );
    });
}

/** The CSV text. Times are 24-hour wall times in the regatta zone ("08:16"). */
export function entriesCsv(ws: RegattaWorkingSet, options: { teamId?: Id | null } = {}): string {
  const tz = ws.regatta.timezone;
  const rows = ordered(ws, options.teamId ?? null).map((e) => {
    const event = e.eventId ? ws.byId.events.get(e.eventId) : undefined;
    const team = ws.byId.teams.get(e.teamId);
    const shell = e.shellId ? ws.byId.shells.get(e.shellId) : undefined;
    const oars = e.oarSetId ? ws.byId.oarSets.get(e.oarSetId) : undefined;
    const seats = ws.seatsByEntry.get(e.id) ?? [];
    const names = SEAT_COLUMNS.map((seat) => {
      const s = seats.find((x) => x.seat === seat && x.athleteId);
      const a = s?.athleteId ? ws.byId.athletes.get(s.athleteId) : undefined;
      return a ? athleteName(a) : '';
    });
    return [
      team?.name ?? '',
      event?.eventNumber ?? '',
      event?.name ?? '',
      event?.day ?? '',
      event?.scheduledAt ? instantToZoned(event.scheduledAt, tz).time : '',
      e.label,
      e.boatClass,
      shell ? shellLabel(shell) : '',
      oars ? oarSetLabel(oars) : '',
      ...names,
      STATUS_TEXT[e.status],
    ];
  });
  return toCsv(ENTRY_CSV_HEADER, rows);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** "head-of-the-lake-junior-boys-entries.csv". */
export function entriesCsvFileName(ws: RegattaWorkingSet, teamId?: Id | null): string {
  const team = teamId ? ws.byId.teams.get(teamId) : undefined;
  return `${[slug(ws.regatta.name), team ? slug(team.name) : '', 'entries'].filter(Boolean).join('-')}.csv`;
}

/** Hand a text file to the browser's download. */
export function downloadText(
  fileName: string,
  text: string,
  type = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
