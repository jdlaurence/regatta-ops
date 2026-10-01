// /print/regattas/:id/lineups/:teamId?day=&source=published|live&layout=sheet|grid&boats=. The
// lineup sheet (one page per team per day) or the lineup grid, from the team's published snapshot
// by default with a toggle to the live draft. :teamId may be "all" to print every participating
// team.

import { useMemo, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useRegattaWorkingSet } from '@/data';
import { useRegattaId, useTeamIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { PublishStatus } from '@/components/PublishStatus';
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
  lineupGrids,
  lineupSheetPages,
  lineupsFor,
  regattaDays,
  unboatedFor,
  type PrintSource,
} from './derive';
import { dayHeading, oarText } from './format';
import { ExportEntriesButton } from './ExportEntriesButton';
import { LineupGridSheet } from './LineupGrid';
import { LineupSheetPage, type BoatsStyle } from './LineupSheet';
import { usePrintedAt } from './parts';

const LAYOUTS = ['sheet', 'grid'] as const;
const BOATS = ['strip', 'names'] as const;
const SOURCES = ['published', 'live'] as const;

export default function PrintLineupsPage() {
  const regattaId = useRegattaId();
  const teamParam = useTeamIdParam() ?? 'all';
  const teamId = teamParam === 'all' ? null : teamParam;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ws = useRegattaWorkingSet(regattaId);
  const data = ws.data;
  const printedAt = usePrintedAt();

  const [layout, setLayout] = useChoiceParam('layout', LAYOUTS, 'sheet');
  const [boats, setBoats] = useChoiceParam<BoatsStyle>('boats', BOATS, 'strip');
  const [source, setSource] = useChoiceParam<PrintSource>('source', SOURCES, 'published');
  const days = useMemo(() => (data ? regattaDays(data) : []), [data]);
  const [day, setDay] = useDayParam(days);

  const lineups = useMemo(
    () => (data ? lineupsFor(data, teamId, source) : []),
    [data, teamId, source],
  );
  const team = teamId ? data?.byId.teams.get(teamId) : undefined;
  const unknownTeam = !!data && !!teamId && !team;

  const title = team ? `${team.name} lineups` : data ? `${data.regatta.name} lineups` : 'Lineups';

  // Publishing from the print preview: check the live draft on paper, then publish it.
  const status =
    teamId && team ? (
      <PublishStatus regattaId={regattaId} teamId={teamId} className="text-sm text-ink" />
    ) : null;

  const teamOptions = [
    { value: 'all', label: 'Every team' },
    ...(data?.participatingTeams ?? []).map((t) => ({ value: t.id, label: t.name })),
    ...(team && !data?.participatingTeams.includes(team)
      ? [{ value: team.id, label: team.name }]
      : []),
  ];

  const controls = data && (
    <>
      <ToolbarField label="Team">
        <Select
          label="Team"
          value={teamParam}
          onValueChange={(v) =>
            navigate(`/print/regattas/${regattaId}/lineups/${v}?${params.toString()}`, {
              replace: true,
            })
          }
          options={teamOptions}
          className="h-8 min-w-40"
        />
      </ToolbarField>
      <ToolbarField label="Layout">
        <SegmentedControl
          size="sm"
          label="Layout"
          value={layout}
          onValueChange={setLayout}
          options={[
            { value: 'sheet', label: 'Sheet' },
            { value: 'grid', label: 'Grid' },
          ]}
        />
      </ToolbarField>
      {layout === 'sheet' && (
        <ToolbarField label="Boats">
          <SegmentedControl
            size="sm"
            label="Boats"
            value={boats}
            onValueChange={setBoats}
            options={[
              { value: 'strip', label: 'Boat strips' },
              { value: 'names', label: 'Names' },
            ]}
          />
        </ToolbarField>
      )}
      <DayField days={days} value={day} onChange={setDay} />
      <SourceField value={source} onChange={setSource} />
    </>
  );

  let sheets: ReactNode = null;
  if (data && unknownTeam) {
    sheets = (
      <p className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-5 text-ink-2">
        This team does not exist. Go back and pick another.
      </p>
    );
  } else if (data && layout === 'sheet') {
    const pages = lineupSheetPages(lineups, day);
    const unboated = new Map(
      lineups.map((tl) => [tl.team.id, unboatedFor(data, tl.team.id, tl.entries)]),
    );
    sheets = pages.map((page) => (
      <LineupSheetPage
        key={`${page.lineups.team.id}:${page.day ?? 'none'}`}
        page={page}
        ws={data}
        boats={boats}
        unboated={unboated.get(page.lineups.team.id) ?? []}
        printedAt={printedAt}
      />
    ));
  } else if (data) {
    const ctx = {
      timeZone: data.regatta.timezone,
      withDay: !day && days.length > 1,
      groupOf: (eventId: string | null) =>
        (eventId ? data.byId.events.get(eventId)?.progressionGroup : undefined) || undefined,
      oarText: (e: Parameters<typeof oarText>[0]) => oarText(e, data.byId.oarSets),
    };
    sheets = lineups.map((tl) => (
      <LineupGridSheet
        key={tl.team.id}
        lineups={tl}
        tables={lineupGrids(day ? tl.entries.filter((e) => e.day === day) : tl.entries, ctx)}
        ws={data}
        dayLabel={
          day ? dayHeading(day) : days.length > 1 ? 'All days' : dayHeading(days[0] ?? null)
        }
        printedAt={printedAt}
      />
    ));
  }

  return (
    <PrintFrame
      title={title}
      backTo={regattaPath(regattaId, teamId ? `lineups/${teamId}` : 'lineups')}
      controls={controls}
      status={status}
      actions={
        <ExportEntriesButton
          regattaId={regattaId}
          teamId={teamId}
          variant="ghost"
          className="max-sm:hidden"
        />
      }
      state={ws}
    >
      {sheets}
    </PrintFrame>
  );
}
