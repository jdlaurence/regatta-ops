// /print/regattas/:id/schedule?day=&team=&view=day|master&source=published|live (PLAN.md §4.11,
// §6.12): the day schedule (one page per day, one team or every team, logistics lines in order)
// or the master schedule (every team, big type, for the trailer).

import { useMemo, type ReactNode } from 'react';
import { useRegattaWorkingSet } from '@/data';
import { useRegattaId } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { SegmentedControl } from '@/components/ui/controls';
import { Select } from '@/components/ui/select';
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
  masterScheduleRows,
  regattaDays,
  scheduleDays,
  type PrintSource,
} from './derive';
import { ExportEntriesButton } from './ExportEntriesButton';
import { usePrintedAt } from './parts';
import { DayScheduleSheet, MasterScheduleSheet } from './ScheduleSheets';

const VIEWS = ['day', 'master'] as const;
const SOURCES = ['published', 'live'] as const;

export default function PrintSchedulePage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  const data = ws.data;
  const printedAt = usePrintedAt();

  const [view, setView] = useChoiceParam('view', VIEWS, 'day');
  const [source, setSource] = useChoiceParam<PrintSource>('source', SOURCES, 'published');
  const teamIds = useMemo(() => (data?.participatingTeams ?? []).map((t) => t.id), [data]);
  const [teamParam, setTeamParam] = useChoiceParam('team', ['all', ...teamIds], 'all');
  const days = useMemo(() => (data ? regattaDays(data) : []), [data]);
  const [day, setDay] = useDayParam(days);

  const teamId = view === 'day' && teamParam !== 'all' ? teamParam : null;
  const team = teamId ? (data?.byId.teams.get(teamId) ?? null) : null;
  const lineups = useMemo(
    () => (data ? lineupsFor(data, teamId, source) : []),
    [data, teamId, source],
  );

  const title = !data
    ? 'Schedule'
    : view === 'master'
      ? `${data.regatta.name} master schedule`
      : team
        ? `${team.name} day schedule`
        : `${data.regatta.name} schedule`;

  const controls = data && (
    <>
      <ToolbarField label="View">
        <SegmentedControl
          size="sm"
          label="View"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'day', label: 'Day schedule' },
            { value: 'master', label: 'Master schedule' },
          ]}
        />
      </ToolbarField>
      {view === 'day' && (
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
      <SourceField value={source} onChange={setSource} />
    </>
  );

  let sheets: ReactNode = null;
  if (data) {
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
      backTo={regattaPath(regattaId, 'schedule')}
      controls={controls}
      actions={
        <ExportEntriesButton regattaId={regattaId} variant="ghost" className="max-sm:hidden" />
      }
      state={ws}
    >
      {sheets}
    </PrintFrame>
  );
}
