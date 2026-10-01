// The run of show: one row per crew racing that day, with what the crew needs to know on race
// day. The athletes' version has every column (event, cox, bow number, shell, rig, oars, clams,
// oar carriers, warm-up, boat meeting, launch, race; landscape); the coaches' version is the
// short one (crew, boat meeting, launch, race, shell, oars, bow number; portrait).
//
// Coaches fill in the race-day values on the sheet: every cell that is not from the lineups is
// click-to-edit for editors and saves to the entry. Warm-up, boat meeting, and launch show the
// suggested time until one is typed; on screen a suggestion is grey, on paper it prints as is.

import { useCallback, type ReactNode } from 'react';
import {
  instantToZoned,
  minutesBetween,
  RUN_OF_SHOW_FIELDS,
  zonedToInstant,
  type Entry,
  type RunOfShowStep,
  type Team,
} from '@regatta-ops/domain';
import { useCan, useUpdate, type Patch, type RegattaWorkingSet } from '@/data';
import { InlineEdit } from '@/components/InlineEdit';
import { toast } from '@/components/toast';
import { useConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import type { RunOfShowRow, TeamLineups } from './derive';
import { coxText, dayHeading, oarText, rigText, timeText } from './format';
import { PrintSheet, SheetHeader, TableScroll } from './PrintFrame';
import { ScheduleSourceMeta, TeamTag, td, th } from './ScheduleSheets';

export type RunOfShowVersion = 'athletes' | 'coaches';

type TextField = 'bowNumber' | 'clams' | 'oarCarriers';

const TEXT_WHAT: Record<TextField, string> = {
  bowNumber: 'bow number',
  clams: 'clams',
  oarCarriers: 'oar carriers',
};

const STEP_WHAT: Record<RunOfShowStep, string> = {
  warmUp: 'warm-up time',
  boatMeeting: 'boat meeting time',
  launch: 'launch time',
};

export interface RunOfShowEdits {
  canEdit: boolean;
  saveText: (row: RunOfShowRow, field: TextField, value: string) => void;
  /** `hhmm` is 'HH:mm' on the race's day, or '' to go back to the suggestion. */
  saveTime: (row: RunOfShowRow, step: RunOfShowStep, hhmm: string) => void;
  /** The final-regatta prompt; render once. */
  dialog: ReactNode;
}

/** Saving run of show cells to their entries, asking first on a final regatta. */
export function useRunOfShowEdits(ws: RegattaWorkingSet | undefined): RunOfShowEdits {
  const canEdit = useCan('regatta.edit');
  const update = useUpdate('entries', {
    errorMessage: 'The run of show was not saved. Try again.',
  });
  const { guard, dialog } = useConfirmFinalEdit(ws?.regatta);
  const tz = ws?.regatta.timezone ?? 'UTC';

  const save = useCallback(
    (live: Entry, patch: Patch<Entry>) =>
      void guard(() => update.mutate({ id: live.id, patch }), 'Save change'),
    [guard, update],
  );

  const saveText = useCallback(
    (row: RunOfShowRow, field: TextField, value: string) => {
      if (row.live) save(row.live, { [field]: value.trim() });
    },
    [save],
  );

  const saveTime = useCallback(
    (row: RunOfShowRow, step: RunOfShowStep, hhmm: string) => {
      const raceAt = row.entry.scheduledAt;
      if (!row.live || !raceAt) return;
      const field = RUN_OF_SHOW_FIELDS[step];
      if (!hhmm) {
        save(row.live, { [field]: null });
        return;
      }
      const at = zonedToInstant(instantToZoned(raceAt, tz).day, hhmm, tz);
      const before = minutesBetween(at, raceAt);
      if (before <= 0) {
        toast.error(`Pick a time before the ${timeText(raceAt, tz)} race.`);
        return;
      }
      save(row.live, { [field]: before });
    },
    [save, tz],
  );

  return { canEdit, saveText, saveTime, dialog };
}

function crewTitle(row: RunOfShowRow): string {
  const e = row.entry;
  return [e.eventName, e.label].filter(Boolean).join(' ') || e.boatClass;
}

/** An empty editable cell: a dash on screen so there is something to click, blank on paper. */
const blank = (
  <span aria-hidden className="text-ink-2 print:invisible">
    –
  </span>
);

function TextCell({
  row,
  field,
  edits,
}: {
  row: RunOfShowRow;
  field: TextField;
  edits: RunOfShowEdits;
}) {
  const value = row.live?.[field] ?? '';
  return (
    <InlineEdit
      value={value}
      displayText={value || 'blank'}
      what={`${TEXT_WHAT[field]} of ${crewTitle(row)}`}
      allowEmpty
      canEdit={edits.canEdit && !!row.live}
      onCommit={(v) => edits.saveText(row, field, v)}
      inputClassName="w-full min-w-16"
    >
      {value || (edits.canEdit && row.live ? blank : '')}
    </InlineEdit>
  );
}

function TimeCell({
  row,
  step,
  tz,
  edits,
}: {
  row: RunOfShowRow;
  step: RunOfShowStep;
  tz: string;
  edits: RunOfShowEdits;
}) {
  const time = row.times?.[step];
  if (!time) return null;
  const text = timeText(time.at, tz);
  const suggested = edits.canEdit && !time.typed;
  return (
    <InlineEdit
      value={instantToZoned(time.at, tz).time}
      displayText={suggested ? `${text}, suggested` : text}
      what={`${STEP_WHAT[step]} of ${crewTitle(row)}`}
      type="time"
      allowEmpty
      canEdit={edits.canEdit && !!row.live}
      onCommit={(v) => edits.saveTime(row, step, v)}
      className={cn('whitespace-nowrap tabular-nums', suggested && 'text-ink-2 print:text-ink')}
    >
      {text}
    </InlineEdit>
  );
}

function RaceCell({ row, tz }: { row: RunOfShowRow; tz: string }) {
  return (
    <span className="font-display font-semibold whitespace-nowrap tabular-nums">
      {timeText(row.entry.scheduledAt, tz)}
    </span>
  );
}

export function RunOfShowSheet({
  ws,
  day,
  rows,
  lineups,
  team,
  version,
  edits,
  printedAt,
}: {
  ws: RegattaWorkingSet;
  day: string;
  rows: RunOfShowRow[];
  lineups: TeamLineups[];
  /** The team filter, or null for every team. */
  team: Team | null;
  version: RunOfShowVersion;
  edits: RunOfShowEdits;
  printedAt: string;
}) {
  const tz = ws.regatta.timezone;
  const heading = dayHeading(day);
  const showTeam = !team && ws.participatingTeams.length > 1;
  const athletes = version === 'athletes';
  return (
    <PrintSheet
      label={`${team ? team.name : 'Every team'} run of show, ${heading}`}
      orientation={athletes ? 'landscape' : 'portrait'}
    >
      <SheetHeader
        title={team ? `${team.name} run of show` : 'Run of show'}
        subtitle={`${ws.regatta.name} · ${heading}`}
        accent={team ? teamStyle(team.colorKey) : undefined}
        meta={<ScheduleSourceMeta lineups={lineups} timeZone={tz} printedAt={printedAt} />}
      />
      {rows.length === 0 ? (
        <p className="py-4 text-base text-ink-2">No races on {heading}.</p>
      ) : (
        <TableScroll label={`Run of show for ${heading}`}>
          {athletes ? (
            <AthletesTable ws={ws} rows={rows} showTeam={showTeam} edits={edits} />
          ) : (
            <CoachesTable ws={ws} rows={rows} showTeam={showTeam} edits={edits} />
          )}
        </TableScroll>
      )}
    </PrintSheet>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className={th}>
      {children}
    </th>
  );
}

function AthletesTable({
  ws,
  rows,
  showTeam,
  edits,
}: {
  ws: RegattaWorkingSet;
  rows: RunOfShowRow[];
  showTeam: boolean;
  edits: RunOfShowEdits;
}) {
  const tz = ws.regatta.timezone;
  return (
    <table className="w-full min-w-[1040px] table-fixed border-collapse text-sm">
      <colgroup>
        <col className="w-[4%]" />
        <col className="w-[8%]" />
        <col className="w-[12%]" />
        <col className="w-[4%]" />
        <col className="w-[4%]" />
        <col className="w-[8%]" />
        <col className="w-[7%]" />
        <col className="w-[9%]" />
        <col className="w-[4%]" />
        <col className="w-[10%]" />
        <col className="w-[7.5%]" />
        <col className="w-[7.5%]" />
        <col className="w-[7.5%]" />
        <col className="w-[7.5%]" />
      </colgroup>
      <thead>
        <tr>
          <Header>Event #</Header>
          <Header>Cox</Header>
          <Header>Event</Header>
          <Header>Crew</Header>
          <Header>Bow #</Header>
          <Header>Shell</Header>
          <Header>Rig</Header>
          <Header>Oars</Header>
          <Header>Clams</Header>
          <Header>Oar carriers</Header>
          <Header>Warm-up</Header>
          <Header>Boat meeting</Header>
          <Header>Launch</Header>
          <Header>Race</Header>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const e = row.entry;
          return (
            <tr key={`${row.team.id}:${e.entryId}`} className="break-inside-avoid" data-row="crew">
              <td className={cn(td, 'tabular-nums')}>{e.eventNumber ?? ''}</td>
              <td className={td}>{coxText(e)}</td>
              <td className={td}>
                {showTeam && (
                  <span className="mr-1.5 inline-block text-xs">
                    <TeamTag team={row.team} />
                  </span>
                )}
                {e.eventName ?? 'No event'}
              </td>
              <td className={cn(td, 'font-display font-semibold')}>{e.label}</td>
              <td className={td}>
                <TextCell row={row} field="bowNumber" edits={edits} />
              </td>
              <td className={cn(td, 'font-medium')}>{e.shellName ?? ''}</td>
              <td className={td}>{rigText(row.rig, row.sculling)}</td>
              <td className={td}>{oarText(e, ws.byId.oarSets)}</td>
              <td className={td}>
                <TextCell row={row} field="clams" edits={edits} />
              </td>
              <td className={td}>
                <TextCell row={row} field="oarCarriers" edits={edits} />
              </td>
              <td className={td}>
                <TimeCell row={row} step="warmUp" tz={tz} edits={edits} />
              </td>
              <td className={td}>
                <TimeCell row={row} step="boatMeeting" tz={tz} edits={edits} />
              </td>
              <td className={td}>
                <TimeCell row={row} step="launch" tz={tz} edits={edits} />
              </td>
              <td className={td}>
                <RaceCell row={row} tz={tz} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CoachesTable({
  ws,
  rows,
  showTeam,
  edits,
}: {
  ws: RegattaWorkingSet;
  rows: RunOfShowRow[];
  showTeam: boolean;
  edits: RunOfShowEdits;
}) {
  const tz = ws.regatta.timezone;
  return (
    <table className="w-full min-w-[640px] table-fixed border-collapse text-base">
      <colgroup>
        <col className="w-[28%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[14%]" />
        <col className="w-[14%]" />
        <col className="w-[8%]" />
      </colgroup>
      <thead>
        <tr>
          <Header>Crew</Header>
          <Header>Boat meeting</Header>
          <Header>Launch</Header>
          <Header>Race</Header>
          <Header>Shell</Header>
          <Header>Oars</Header>
          <Header>Bow #</Header>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const e = row.entry;
          const clams = row.live?.clams;
          return (
            <tr key={`${row.team.id}:${e.entryId}`} className="break-inside-avoid" data-row="crew">
              <td className={cn(td, 'font-display font-semibold')}>
                {showTeam && (
                  <span className="mr-1.5 inline-block font-sans text-xs font-normal">
                    <TeamTag team={row.team} />
                  </span>
                )}
                {crewTitle(row)}
              </td>
              <td className={td}>
                <TimeCell row={row} step="boatMeeting" tz={tz} edits={edits} />
              </td>
              <td className={td}>
                <TimeCell row={row} step="launch" tz={tz} edits={edits} />
              </td>
              <td className={td}>
                <RaceCell row={row} tz={tz} />
              </td>
              <td className={cn(td, 'font-medium')}>{e.shellName ?? ''}</td>
              <td className={td}>
                {oarText(e, ws.byId.oarSets)}
                {clams && <span className="block text-sm text-ink-2">Clams: {clams}</span>}
              </td>
              <td className={td}>
                <TextCell row={row} field="bowNumber" edits={edits} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
