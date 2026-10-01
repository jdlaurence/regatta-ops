// The day schedule and the master schedule.
//
// Day schedule, as the club publishes it today: per day, one row per race with time, stage,
// cox, shell, oars, and the lineup as a name list, with logistics lines (bus departures, lunch,
// awards) in order between the races. Landscape.
//
// Master schedule: every team's races in time order with team, entry, shell, and oars, in big
// high-contrast type. Coaches tape it to the trailer.
//
// Schedule list: the schedule page's list view on paper, under the same filters. Races in order
// with logistics lines between them and, when entries are shown, each race's crews under it
// with shell, oars, and the lineup (cox, then stroke to bow). Portrait.

import { Fragment, type ReactNode } from 'react';
import type { PublishedEntry, Team } from '@regatta-ops/domain';
import type { RegattaWorkingSet } from '@/data';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { PrintSheet, SheetHeader, TableScroll } from './PrintFrame';
import { eventTitle } from '@/features/schedule/lib';
import type { ListScheduleRow, RaceRow, ScheduleRow, TeamLineups } from './derive';
import {
  coxText,
  dayHeading,
  eventText,
  oarText,
  paperSeatOrder,
  printedText,
  seatText,
  stageText,
  timeText,
} from './format';
import { SourceMeta } from './parts';

/** "Junior boys: published May 13, 9:00 PM" per team, or one line for one team. */
export function ScheduleSourceMeta({
  lineups,
  timeZone,
  printedAt,
}: {
  lineups: TeamLineups[];
  timeZone: string;
  printedAt: string;
}) {
  if (lineups.length === 1) {
    return <SourceMeta lineups={lineups[0]!} timeZone={timeZone} printedAt={printedAt} />;
  }
  const published = lineups
    .filter((l) => l.source === 'published')
    .map((l) => l.team.shortName || l.team.name);
  const live = lineups
    .filter((l) => l.source === 'live')
    .map((l) => l.team.shortName || l.team.name);
  return (
    <>
      {published.length > 0 && (
        <span className="block">
          <span className="font-medium text-ink">Published lineups:</span> {published.join(', ')}
        </span>
      )}
      {live.length > 0 && (
        <span className="block">
          <span className="font-medium text-ink">Live draft:</span> {live.join(', ')}
        </span>
      )}
      <span className="block">Printed {printedText(printedAt, timeZone)}</span>
    </>
  );
}

export function TeamTag({ team }: { team: Team }) {
  return (
    <span
      style={teamStyle(team.colorKey)}
      className="border-l-[3px] border-team pl-1.5 font-medium"
    >
      {team.shortName || team.name}
    </span>
  );
}

/** The lineup as a names list, stroke to bow; with the cox first when `withCox`. */
function Lineup({ entry, withCox = false }: { entry: PublishedEntry; withCox?: boolean }) {
  const bySeat = new Map(entry.seats.map((s) => [s.seat, s]));
  const rowing = paperSeatOrder(entry.boatClass).filter((s) => withCox || s !== 'cox');
  return (
    <span className="leading-prose">
      {rowing.map((seat, i) => {
        const s = bySeat.get(seat);
        return (
          <Fragment key={seat}>
            <span className="whitespace-nowrap">
              <span className="font-display text-xs font-semibold text-ink-2 tabular-nums">
                {seatText(seat)}
              </span>{' '}
              {s?.athleteId ? (
                (s.athleteName ?? 'Unknown athlete')
              ) : (
                <span className="text-ink-2">empty</span>
              )}
              {i < rowing.length - 1 ? ',' : ''}
            </span>{' '}
          </Fragment>
        );
      })}
    </span>
  );
}

export const th = 'border-b-2 border-ink px-1.5 py-1 text-left text-sm font-medium text-ink-2';
export const td = 'border-b border-line px-1.5 py-1.5 align-top';

export function DayScheduleSheet({
  ws,
  day,
  rows,
  lineups,
  team,
  printedAt,
}: {
  ws: RegattaWorkingSet;
  day: string;
  rows: ScheduleRow[];
  lineups: TeamLineups[];
  /** The team filter, or null for every team. */
  team: Team | null;
  printedAt: string;
}) {
  const tz = ws.regatta.timezone;
  const heading = dayHeading(day);
  const oarSets = ws.byId.oarSets;
  return (
    <PrintSheet
      label={`${team ? team.name : 'Every team'} day schedule, ${heading}`}
      orientation="landscape"
    >
      <SheetHeader
        title={team ? `${team.name} day schedule` : 'Day schedule'}
        subtitle={`${ws.regatta.name} · ${heading}`}
        accent={team ? teamStyle(team.colorKey) : undefined}
        meta={<ScheduleSourceMeta lineups={lineups} timeZone={tz} printedAt={printedAt} />}
      />
      {rows.length === 0 ? (
        <p className="py-4 text-base text-ink-2">Nothing on the schedule for {heading}.</p>
      ) : (
        <TableScroll label={`Schedule for ${heading}`}>
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[8%]" />
              <col className="w-[7%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Time
                </th>
                <th scope="col" className={th}>
                  Stage
                </th>
                <th scope="col" className={th}>
                  Event
                </th>
                <th scope="col" className={th}>
                  Crew
                </th>
                <th scope="col" className={th}>
                  Cox
                </th>
                <th scope="col" className={th}>
                  Shell
                </th>
                <th scope="col" className={th}>
                  Oars
                </th>
                <th scope="col" className={th}>
                  Lineup, stroke to bow
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.kind === 'logistics' ? (
                  <tr key={row.event.id} className="break-inside-avoid" data-row="logistics">
                    <td
                      className={cn(
                        td,
                        'border-b-ink font-display font-semibold whitespace-nowrap tabular-nums',
                      )}
                    >
                      {row.event.scheduledAt ? timeText(row.event.scheduledAt, tz) : ''}
                    </td>
                    <td colSpan={7} className={cn(td, 'border-b-ink font-medium')}>
                      {row.event.name}
                      {!team && row.teams.length > 0 && (
                        <span className="ml-2 inline-flex gap-2 text-xs">
                          {row.teams.map((t) => (
                            <TeamTag key={t.id} team={t} />
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  <RaceTableRow
                    key={`${row.team.id}:${row.entry.entryId}`}
                    row={row}
                    showTeam={!team}
                    tz={tz}
                  >
                    <td className={td}>{coxText(row.entry)}</td>
                    <td className={cn(td, 'font-medium')}>{row.entry.shellName ?? ''}</td>
                    <td className={td}>{oarText(row.entry, oarSets)}</td>
                    <td className={td}>
                      <Lineup entry={row.entry} />
                    </td>
                  </RaceTableRow>
                ),
              )}
            </tbody>
          </table>
        </TableScroll>
      )}
    </PrintSheet>
  );
}

function RaceTableRow({
  row,
  showTeam,
  tz,
  children,
}: {
  row: RaceRow;
  showTeam: boolean;
  tz: string;
  children: ReactNode;
}) {
  const e = row.entry;
  return (
    <tr className="break-inside-avoid" data-row="race">
      <td className={cn(td, 'font-display font-semibold whitespace-nowrap tabular-nums')}>
        {timeText(e.scheduledAt, tz)}
      </td>
      <td className={td}>{stageText(e.stage)}</td>
      <td className={td}>{eventText(e)}</td>
      <td className={cn(td, 'font-display font-semibold')}>
        {showTeam && (
          <span className="mr-1.5 inline-block text-xs font-sans font-normal">
            <TeamTag team={row.team} />
          </span>
        )}
        {e.label}
      </td>
      {children}
    </tr>
  );
}

const mth = 'border-b-2 border-ink px-2 py-1.5 text-left text-base font-medium';
const mtd = 'border-b-2 border-line-strong px-2 py-2 align-top';

export function MasterScheduleSheet({
  ws,
  day,
  rows,
  lineups,
  printedAt,
}: {
  ws: RegattaWorkingSet;
  day: string;
  rows: RaceRow[];
  lineups: TeamLineups[];
  printedAt: string;
}) {
  const tz = ws.regatta.timezone;
  const heading = dayHeading(day);
  const oarSets = ws.byId.oarSets;
  return (
    <PrintSheet label={`Master schedule, ${heading}`}>
      <SheetHeader
        title="Master schedule"
        subtitle={`${ws.regatta.name} · ${heading}`}
        meta={<ScheduleSourceMeta lineups={lineups} timeZone={tz} printedAt={printedAt} />}
      />
      {rows.length === 0 ? (
        <p className="py-4 text-base text-ink-2">No races on {heading}.</p>
      ) : (
        <TableScroll label={`Races on ${heading}`}>
          <table className="w-full min-w-[600px] border-collapse text-md">
            <thead>
              <tr>
                <th scope="col" className={cn(mth, 'w-[120px]')}>
                  Time
                </th>
                <th scope="col" className={mth}>
                  Team
                </th>
                <th scope="col" className={mth}>
                  Crew
                </th>
                <th scope="col" className={mth}>
                  Shell
                </th>
                <th scope="col" className={mth}>
                  Oars
                </th>
                <th scope="col" className={mth}>
                  Event
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const e = row.entry;
                return (
                  <tr key={`${row.team.id}:${e.entryId}`} className="break-inside-avoid">
                    <td
                      className={cn(
                        mtd,
                        'font-display text-lg font-semibold whitespace-nowrap tabular-nums',
                      )}
                    >
                      {timeText(e.scheduledAt, tz)}
                    </td>
                    <td className={cn(mtd, 'whitespace-nowrap')}>
                      <TeamTag team={row.team} />
                    </td>
                    <td className={cn(mtd, 'font-display text-lg font-semibold whitespace-nowrap')}>
                      {e.label}
                    </td>
                    <td className={cn(mtd, 'text-lg font-semibold')}>{e.shellName ?? '—'}</td>
                    <td className={cn(mtd, 'font-medium')}>{oarText(e, oarSets) || '—'}</td>
                    <td className={cn(mtd, 'text-base')}>
                      {eventText(e)}
                      {e.stage && e.stage !== 'race' && (
                        <span className="text-ink-2"> · {stageText(e.stage)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      )}
    </PrintSheet>
  );
}

const ltd = 'px-1.5 py-1 align-top';

export function ScheduleListSheet({
  ws,
  day,
  rows,
  showEntries,
  team,
  filterText,
  printedAt,
}: {
  ws: RegattaWorkingSet;
  day: string;
  rows: ListScheduleRow[];
  /** Crews under their races (the schedule page's "Show entries" switch). */
  showEntries: boolean;
  /** The team filter, or null for every team. */
  team: Team | null;
  /** The other filters in words ("Boat class 8+ · Shell Monahan"), or null. */
  filterText: string | null;
  printedAt: string;
}) {
  const tz = ws.regatta.timezone;
  const heading = dayHeading(day);
  const oarSets = ws.byId.oarSets;
  const showTeams = !team && ws.participatingTeams.length > 1;
  const columns = showEntries ? 5 : 4;
  return (
    <PrintSheet label={`${team ? team.name : 'Every team'} schedule, ${heading}`}>
      <SheetHeader
        title={team ? `${team.name} schedule` : 'Schedule'}
        subtitle={
          <>
            {ws.regatta.name} · {heading}
            {filterText && <span className="block">{filterText}</span>}
          </>
        }
        accent={team ? teamStyle(team.colorKey) : undefined}
        meta={
          <>
            {showEntries && <span className="block">Live draft lineups</span>}
            <span className="block">Printed {printedText(printedAt, tz)}</span>
          </>
        }
      />
      {rows.length === 0 ? (
        <p className="py-4 text-base text-ink-2">Nothing on the schedule for {heading}.</p>
      ) : (
        <TableScroll label={`Schedule for ${heading}`}>
          <table
            className={cn(
              'w-full table-fixed border-collapse text-sm',
              showEntries ? 'min-w-[720px]' : 'min-w-[480px]',
            )}
          >
            {showEntries ? (
              <colgroup>
                <col className="w-[11%]" />
                <col className="w-[16%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col />
              </colgroup>
            ) : (
              <colgroup>
                <col className="w-[12%]" />
                <col />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
            )}
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Time
                </th>
                {showEntries ? (
                  <>
                    <th scope="col" className={th}>
                      Crew
                    </th>
                    <th scope="col" className={th}>
                      Shell
                    </th>
                    <th scope="col" className={th}>
                      Oars
                    </th>
                    <th scope="col" className={th}>
                      Lineup, cox then stroke to bow
                    </th>
                  </>
                ) : (
                  <>
                    <th scope="col" className={th}>
                      Event
                    </th>
                    <th scope="col" className={th}>
                      Class
                    </th>
                    <th scope="col" className={th}>
                      Stage
                    </th>
                  </>
                )}
              </tr>
            </thead>
            {rows.map((row) => {
              const time = row.event.scheduledAt ? timeText(row.event.scheduledAt, tz) : null;
              if (row.kind === 'logistics') {
                return (
                  <tbody
                    key={row.event.id}
                    className="break-inside-avoid border-b border-line"
                    data-row="logistics"
                  >
                    <tr>
                      <td className={cn(ltd, 'whitespace-nowrap text-ink-2 tabular-nums')}>
                        {time ?? ''}
                      </td>
                      <td colSpan={columns - 1} className={cn(ltd, 'text-ink-2')}>
                        {row.event.name}
                        {showTeams && row.teams.length > 0 && (
                          <span className="ml-2 inline-flex gap-2 text-xs text-ink">
                            {row.teams.map((t) => (
                              <TeamTag key={t.id} team={t} />
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                );
              }
              const e = row.event;
              const stage = e.stage && e.stage !== 'race' ? stageText(e.stage) : '';
              const category = e.category && e.category !== e.name ? e.category : null;
              const timeCell = (
                <td
                  className={cn(
                    ltd,
                    'pt-2 font-display font-semibold whitespace-nowrap tabular-nums',
                    !time && 'text-ink-2',
                  )}
                >
                  {time ?? 'TBD'}
                </td>
              );
              if (!showEntries) {
                return (
                  <tbody
                    key={e.id}
                    className="break-inside-avoid border-b border-line"
                    data-row="race"
                  >
                    <tr>
                      {timeCell}
                      <td className={cn(ltd, 'pt-2')}>
                        <span className="font-medium">{eventTitle(e)}</span>
                        {category && <span className="block text-ink-2">{category}</span>}
                      </td>
                      <td className={cn(ltd, 'pt-2')}>{e.boatClass ?? ''}</td>
                      <td className={cn(ltd, 'pt-2')}>{stage}</td>
                    </tr>
                  </tbody>
                );
              }
              return (
                <tbody
                  key={e.id}
                  className="break-inside-avoid border-b border-line"
                  data-row="race"
                >
                  <tr>
                    {timeCell}
                    <td colSpan={4} className={cn(ltd, 'pt-2')}>
                      <span className="font-medium">{eventTitle(e)}</span>
                      {(e.boatClass || stage) && (
                        <span className="text-ink-2">
                          {' · '}
                          {[e.boatClass, stage].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {category && <span className="block text-ink-2">{category}</span>}
                    </td>
                  </tr>
                  {row.entries.map((entry) => (
                    <tr key={entry.entryId} data-row="entry">
                      <td className={ltd} />
                      <td className={cn(ltd, 'font-display font-semibold')}>
                        {showTeams && entry.team && (
                          <span className="mr-1.5 inline-block font-sans text-xs font-normal">
                            <TeamTag team={entry.team} />
                          </span>
                        )}
                        {entry.label}
                      </td>
                      {entry.lineup ? (
                        <>
                          <td className={cn(ltd, 'font-medium')}>{entry.lineup.shellName ?? ''}</td>
                          <td className={ltd}>{oarText(entry.lineup, oarSets)}</td>
                          <td className={ltd}>
                            <Lineup entry={entry.lineup} withCox />
                          </td>
                        </>
                      ) : (
                        <td colSpan={3} className={cn(ltd, 'text-ink-2')}>
                          {entry.scratched ? 'Scratched' : ''}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </TableScroll>
      )}
    </PrintSheet>
  );
}
