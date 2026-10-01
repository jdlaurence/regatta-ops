// /print/regattas/:id/schedule?day=&team=&view=list|day|master|run&source=published|live: the
// schedule list as the schedule page shows it (its filters, class= and shell=, and its "Show
// entries" switch, entries=hide; live lineups), the day schedule (one page per day, one team or
// every team, logistics lines in order), the master schedule (every team, big type, for the
// trailer), or the run of show (for=athletes|coaches; race-day values typed on the sheet).

import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { shellLabel } from '@regatta-ops/domain';
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
  runOfShowRows,
  scheduleDays,
  withLiveTimes,
  type PrintSource,
} from './derive';
import { ExportButton } from './ExportButton';
import {
  dayScheduleExport,
  exportFileName,
  masterScheduleExport,
  runOfShowExport,
  scheduleListExport,
  type ExportSheet,
} from './export';
import { usePrintedAt } from './parts';
import { RunOfShowSheet, useRunOfShowEdits } from './RunOfShowSheet';
import { DayScheduleSheet, MasterScheduleSheet, ScheduleListSheet } from './ScheduleSheets';

const VIEWS = ['list', 'day', 'master', 'run'] as const;
const VERSIONS = ['athletes', 'coaches'] as const;
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
  const [version, setVersion] = useChoiceParam('for', VERSIONS, 'athletes');
  const edits = useRunOfShowEdits(data);
  const [params, setParams] = useSearchParams();
  const boatClass = parseBoatClass(params.get('class'));
  const shell = data?.byId.shells.get(params.get('shell') ?? '') ?? null;

  const isList = view === 'list';
  const isRun = view === 'run';
  // The list shows the live draft, as the schedule page does.
  const source: PrintSource = isList ? 'live' : sourceParam;
  const teamId = view !== 'master' && teamParam !== 'all' ? teamParam : null;
  const team = teamId ? (data?.byId.teams.get(teamId) ?? null) : null;
  const lineups = useMemo(() => {
    if (!data) return [];
    const chosen = lineupsFor(data, teamId, source);
    return isRun ? withLiveTimes(data, chosen) : chosen;
  }, [data, teamId, source, isRun]);
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
      : isRun
        ? `${team?.name ?? data.regatta.name} run of show`
        : team
          ? `${team.name} ${isList ? 'schedule' : 'day schedule'}`
          : `${data.regatta.name} schedule`;

  // The run of show for one team goes back to its lineups, where it is opened; everything else
  // goes back to the schedule as it was: its day, filters, and switch.
  const backTo =
    isRun && teamId
      ? regattaPath(regattaId, `lineups/${teamId}`)
      : `${regattaPath(regattaId, 'schedule')}${query({
          day,
          team: teamParam === 'all' ? null : teamParam,
          class: params.get('class'),
          shell: params.get('shell'),
          entries: isList ? entriesParam : params.get('entries'),
        })}`;

  const controls = data && (
    <>
      <ToolbarField label="View">
        <Select
          label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'list', label: 'List' },
            { value: 'day', label: 'Day schedule' },
            { value: 'master', label: 'Master schedule' },
            { value: 'run', label: 'Run of show' },
          ]}
          className="h-8 min-w-40"
        />
      </ToolbarField>
      {isRun && (
        <ToolbarField label="For">
          <SegmentedControl
            size="sm"
            label="For"
            value={version}
            onValueChange={setVersion}
            options={[
              { value: 'athletes', label: 'Athletes' },
              { value: 'coaches', label: 'Coaches' },
            ]}
          />
        </ToolbarField>
      )}
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

  const runStatus = isRun && edits.canEdit && (
    <span>
      Click a cell to change it. Grey times are suggested from the regatta’s timing settings.
    </span>
  );
  const status =
    runStatus ||
    (isList && filterText && (
      <span className="flex flex-wrap items-center gap-x-2">
        {filterText}
        <Button variant="link" size="sm" onClick={clearOtherFilters}>
          Clear
        </Button>
      </span>
    ));

  let sheets: ReactNode = null;
  // What "Export to Excel" writes: the sheets on screen.
  let toExport: (() => ExportSheet[]) | null = null;
  if (data && isList) {
    const pages = (day ? [day] : listScheduleDays(data, filters)).map((d) => ({
      day: d,
      rows: listScheduleRows(data, lineups, d, filters),
    }));
    const showEntries = entriesParam === 'show';
    toExport = () =>
      pages.map((p) => scheduleListExport(data, p.day, p.rows, { showEntries, team, filterText }));
    sheets =
      pages.length === 0 ? (
        <p className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-5 text-ink-2">
          {hasFilters(filters)
            ? 'Nothing on the schedule matches these filters.'
            : 'Nothing on the schedule yet. Add events on the Schedule page, then print again.'}
        </p>
      ) : (
        pages.map((p) => (
          <ScheduleListSheet
            key={p.day}
            ws={data}
            day={p.day}
            rows={p.rows}
            showEntries={showEntries}
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
    } else if (isRun) {
      const pages = printDays.map((d) => ({ day: d, rows: runOfShowRows(data, lineups, d) }));
      toExport = () => pages.map((p) => runOfShowExport(data, p.day, p.rows, { team, version }));
      sheets = pages.map((p) => (
        <RunOfShowSheet
          key={p.day}
          ws={data}
          day={p.day}
          rows={p.rows}
          lineups={lineups}
          team={team}
          version={version}
          edits={edits}
          printedAt={printedAt}
        />
      ));
    } else if (view === 'master') {
      const pages = printDays.map((d) => ({ day: d, rows: masterScheduleRows(data, lineups, d) }));
      toExport = () => pages.map((p) => masterScheduleExport(data, p.day, p.rows));
      sheets = pages.map((p) => (
        <MasterScheduleSheet
          key={p.day}
          ws={data}
          day={p.day}
          rows={p.rows}
          lineups={lineups}
          printedAt={printedAt}
        />
      ));
    } else {
      const pages = printDays.map((d) => ({
        day: d,
        rows: dayScheduleRows(data, lineups, d, teamId),
      }));
      toExport = () => pages.map((p) => dayScheduleExport(data, p.day, p.rows, team));
      sheets = pages.map((p) => (
        <DayScheduleSheet
          key={p.day}
          ws={data}
          day={p.day}
          rows={p.rows}
          lineups={lineups}
          team={team}
          printedAt={printedAt}
        />
      ));
    }
  }

  const exportWhat = {
    list: 'schedule',
    day: 'day-schedule',
    master: 'master-schedule',
    run: version === 'coaches' ? 'run-of-show-coaches' : 'run-of-show',
  }[view];

  return (
    <PrintFrame
      title={title}
      backTo={backTo}
      controls={controls}
      status={status}
      actions={
        data && (
          <ExportButton
            fileName={exportFileName(data, exportWhat, {
              team: view === 'master' ? null : team,
              day,
            })}
            sheets={toExport}
            variant="ghost"
            className="max-sm:hidden"
          />
        )
      }
      state={ws}
    >
      {sheets}
      {edits.dialog}
    </PrintFrame>
  );
}
