// /print/regattas/:id/schedule?day=&team=&view=list|day|master&source=published|live (PLAN.md
// §4.11, §6.12): the schedule list as the schedule page shows it (its filters, class= and
// shell=, and its "Show entries" switch, entries=hide; live lineups), the day schedule (one page
// per day, one team or every team, logistics lines in order), or the master schedule (every
// team, big type, for the trailer).

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { shellLabel } from '@srt/domain';
import { useRegattaWorkingSet } from '@/data';
import { useRegattaId } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { Button } from '@/components/ui/button';
import { SegmentedControl, Switch } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { hasFilters, parseBoatClass, type ScheduleFilters } from '@/features/schedule/lib';
import {
  DayField,
  PrintFrame,
  SourceField,
  ToolbarField,
  useChoiceParam,
  useDayParam,
} from './PrintFrame';
import {
  dayScheduleRows,
  lineupsFor,
  listScheduleDays,
  listScheduleRows,
  masterScheduleRows,
  regattaDays,
  scheduleDays,
  type PrintSource,
} from './derive';
import { ExportEntriesButton } from './ExportEntriesButton';
import { usePrintedAt } from './parts';
import { DayScheduleSheet, MasterScheduleSheet, ScheduleListSheet } from './ScheduleSheets';

const VIEWS = ['list', 'day', 'master'] as const;
const SOURCES = ['published', 'live'] as const;
const ENTRIES = ['show', 'hide'] as const;

/** A query string from the parameters that are set. */
function query(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export default function PrintSchedulePage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  const data = ws.data;
  const printedAt = usePrintedAt();

  const [view, setView] = useChoiceParam('view', VIEWS, 'day');
  const [sourceParam, setSource] = useChoiceParam<PrintSource>('source', SOURCES, 'published');
  const teamIds = useMemo(() => (data?.participatingTeams ?? []).map((t) => t.id), [data]);
  const [teamParam, setTeamParam] = useChoiceParam('team', ['all', ...teamIds], 'all');
  const days = useMemo(() => (data ? regattaDays(data) : []), [data]);
  const [day, setDay] = useDayParam(days);
  // The list view prints what the schedule page shows: its filters and "Show entries" switch.
  const [entriesParam, setEntries] = useChoiceParam('entries', ENTRIES, 'show');
  const [params, setParams] = useSearchParams();
  const boatClass = parseBoatClass(params.get('class'));
  const shell = data?.byId.shells.get(params.get('shell') ?? '') ?? null;

  const isList = view === 'list';
  // The list shows the live draft, as the schedule page does.
  const source: PrintSource = isList ? 'live' : sourceParam;
  const teamId = view !== 'master' && teamParam !== 'all' ? teamParam : null;
  const team = teamId ? (data?.byId.teams.get(teamId) ?? null) : null;
  const lineups = useMemo(
    () => (data ? lineupsFor(data, teamId, source) : []),
    [data, teamId, source],
  );
  const filters = useMemo<ScheduleFilters>(
    () => ({ teamId, boatClass, shellId: shell?.id ?? null }),
    [teamId, boatClass, shell],
  );
  const filterText =
    [boatClass && `Boat class ${boatClass}`, shell && `Shell ${shellLabel(shell)}`]
      .filter(Boolean)
      .join(' · ') || null;
  const clearOtherFilters = () =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete('class');
        p.delete('shell');
        return p;
      },
      { replace: true },
    );

  const title = !data
    ? 'Schedule'
    : view === 'master'
      ? `${data.regatta.name} master schedule`
      : team
        ? `${team.name} ${isList ? 'schedule' : 'day schedule'}`
        : `${data.regatta.name} schedule`;

  // Back to the schedule as it was: its day, filters, and switch.
  const backTo = `${regattaPath(regattaId, 'schedule')}${query({
    day,
    team: teamParam === 'all' ? null : teamParam,
    class: params.get('class'),
    shell: params.get('shell'),
    entries: isList ? entriesParam : params.get('entries'),
  })}`;

  const controls = data && (
    <>
      <ToolbarField label="View">
        <SegmentedControl
          size="sm"
          label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'list', label: 'List' },
            { value: 'day', label: 'Day schedule' },
            { value: 'master', label: 'Master schedule' },
          ]}
        />
      </ToolbarField>
      {view !== 'master' && (
        <ToolbarField label="Team">
          <Select
            label="Team"
            value={teamParam}
            onValueChange={setTeamParam}
            options={[
              { value: 'all', label: 'Every team' },
              ...data.participatingTeams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            className="h-8 min-w-40"
          />
        </ToolbarField>
      )}
      <DayField days={days} value={day} onChange={setDay} />
      {isList ? (
        <div className="flex items-center gap-2">
          <Switch
            id="print-show-entries"
            checked={entriesParam === 'show'}
            onCheckedChange={(on) => setEntries(on ? 'show' : 'hide')}
          />
          <Label htmlFor="print-show-entries" className="text-sm">
            Show entries
          </Label>
        </div>
      ) : (
        <SourceField value={source} onChange={setSource} />
      )}
    </>
  );

  const status = isList && filterText && (
    <span className="flex flex-wrap items-center gap-x-2">
      {filterText}
      <Button variant="link" size="sm" onClick={clearOtherFilters}>
        Clear
      </Button>
    </span>
  );

  let sheets: ReactNode = null;
  if (data && isList) {
    const printDays = day ? [day] : listScheduleDays(data, filters);
    sheets =
      printDays.length === 0 ? (
        <p className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-5 text-ink-2">
          {hasFilters(filters)
            ? 'Nothing on the schedule matches these filters.'
            : 'Nothing on the schedule yet. Add events on the Schedule page, then print again.'}
        </p>
      ) : (
        printDays.map((d) => (
          <ScheduleListSheet
            key={d}
            ws={data}
            day={d}
            rows={listScheduleRows(data, lineups, d, filters)}
            showEntries={entriesParam === 'show'}
            team={team}
            filterText={filterText}
            printedAt={printedAt}
          />
        ))
      );
  } else if (data) {
    const printDays = day ? [day] : scheduleDays(data, lineups, view === 'day');
    if (printDays.length === 0) {
      sheets = (
        <p className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-5 text-ink-2">
          No races to print yet. Add entries on the Lineups page, then print again.
        </p>
      );
    } else if (view === 'master') {
      sheets = printDays.map((d) => (
        <MasterScheduleSheet
          key={d}
          ws={data}
          day={d}
          rows={masterScheduleRows(data, lineups, d)}
          lineups={lineups}
          printedAt={printedAt}
        />
      ));
    } else {
      sheets = printDays.map((d) => (
        <DayScheduleSheet
          key={d}
          ws={data}
          day={d}
          rows={dayScheduleRows(data, lineups, d, teamId)}
          lineups={lineups}
          team={team}
          printedAt={printedAt}
        />
      ));
    }
  }

  return (
    <PrintFrame
      title={title}
      backTo={backTo}
      controls={controls}
      status={status}
      actions={
        <ExportEntriesButton regattaId={regattaId} variant="ghost" className="max-sm:hidden" />
      }
      state={ws}
    >
      {sheets}
    </PrintFrame>
  );
}
