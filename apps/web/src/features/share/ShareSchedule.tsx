// The share page's day (PLAN.md §4.11, §12.1 Phase 3: "parents open a share link on race
// day"): race times from the live schedule, each published crew as a boat strip (a name list on
// phones), logistics lines in order, and when each team published.

import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { isCoxed, seatsFor, type Seat } from '@regatta-ops/domain';
import type { ShareEntry, ShareTeam, ShareView } from '@/data';
import { BoatStrip, type SeatOccupant } from '@/components/BoatStrip';
import { ShellChip, TeamChip, TeamDot } from '@/components/chips';
import { EmptyState } from '@/components/states';
import { formatWeekday, todayIn } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { ChoiceChips } from './ChoiceChips';
import {
  crewsWithoutDay,
  dayRows,
  defaultDay,
  eventTitle,
  raceTime,
  seatLines,
  shareDays,
  shortInstant,
  stageLabel,
  type CrewOnRow,
  type DayRow,
} from './share-view';

const ALL = 'all';

/** "Maya Park" → "Maya P." for the boat strip. */
function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full;
  return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1]![0]}.`;
}

function occupants(entry: ShareEntry): Partial<Record<Seat, SeatOccupant | null>> {
  const out: Partial<Record<Seat, SeatOccupant | null>> = {};
  for (const s of entry.seats) {
    if (!s.athleteName) continue;
    out[s.seat] = {
      id: s.athleteId ?? undefined,
      name: s.athleteName,
      shortName: shortName(s.athleteName),
    };
  }
  return out;
}

/** The crew read cox first, then stroke down to bow, like the club's published sheets. */
function NameList({ entry, className }: { entry: ShareEntry; className?: string }) {
  const rowing = seatsFor(entry.boatClass).filter((s) => s !== 'cox').length;
  const lines = seatLines(entry, rowing, isCoxed(entry.boatClass));
  return (
    <ol
      aria-label={`${entry.label} crew`}
      className={cn(
        'grid grid-cols-1 gap-x-4 gap-y-1',
        rowing > 1 && 'min-[480px]:grid-cols-2',
        className,
      )}
    >
      {lines.map((l) => (
        <li key={l.seat} className="flex min-w-0 items-baseline gap-2">
          {l.label && <span className="w-12 shrink-0 text-sm text-ink-2">{l.label}</span>}
          {l.name ? (
            <span className="min-w-0 truncate text-base font-medium text-ink">{l.name}</span>
          ) : (
            <span className="text-base text-ink-2">Not set</span>
          )}
        </li>
      ))}
    </ol>
  );
}

function Crew({ team, entry }: CrewOnRow) {
  const scratched = entry.status === 'scratched';
  return (
    <div className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <TeamChip team={team} short size="sm" />
        <span className={cn('text-base font-medium', scratched && 'text-ink-2 line-through')}>
          {entry.label}
        </span>
        {scratched && <span className="text-sm font-medium text-ink-2">Scratched</span>}
        {entry.shellName && (
          <ShellChip
            shell={{
              name: entry.shellName,
              nickname: '',
              boatClass: entry.boatClass,
              status: 'in_service',
            }}
            showClass={false}
            className="h-6 text-sm"
          />
        )}
        {entry.oarSetName && <span className="text-sm text-ink-2">Oars {entry.oarSetName}</span>}
      </div>
      <div className={cn('flex flex-col gap-2', scratched && 'grayscale')}>
        <BoatStrip
          boatClass={entry.boatClass}
          seats={occupants(entry)}
          size="sm"
          teamColor={team.colorKey}
          label={`${team.shortName || team.name} ${entry.label}`}
          className="hidden sm:flex"
        />
        <NameList entry={entry} className="sm:hidden" />
      </div>
      {entry.hotSeatPlan && (
        <p className="text-sm text-ink-2">
          <span className="font-medium text-ink">Hot seat:</span> {entry.hotSeatPlan}
        </p>
      )}
    </div>
  );
}

function Time({ iso, timeZone, muted }: { iso: string | null; timeZone: string; muted?: boolean }) {
  const text = raceTime(iso, timeZone);
  const [clock, suffix] = text.split(' ');
  return (
    <span
      className={cn(
        'shrink-0 font-display font-semibold tabular-nums',
        muted ? 'text-base text-ink-2' : 'text-lg text-ink',
      )}
    >
      {clock}
      {suffix && <span className="ml-1 text-sm font-medium text-ink-2">{suffix}</span>}
    </span>
  );
}

function Row({ row, view }: { row: DayRow; view: ShareView }) {
  const tz = view.regatta.timezone;
  if (row.type === 'logistics') {
    const forTeams = row.event.teamIds
      .map((id) => view.teams.find((t) => t.id === id))
      .filter((t): t is ShareTeam => !!t);
    return (
      <li className="flex items-baseline gap-3 px-3 py-1.5 md:gap-4 md:px-4">
        {/* A logistics line without a time is a note, not a race waiting for one. */}
        <span className={cn('w-24 shrink-0', !row.event.scheduledAt && 'hidden md:block')}>
          {row.event.scheduledAt && <Time iso={row.event.scheduledAt} timeZone={tz} muted />}
        </span>
        <span className="min-w-0 text-base text-ink-2">
          {row.event.name}
          {forTeams.length > 0 && view.teams.length > 1 && (
            <span className="text-sm">
              {' '}
              · {forTeams.map((t) => t.shortName || t.name).join(', ')}
            </span>
          )}
        </span>
      </li>
    );
  }
  const first = row.crews[0]!.entry;
  const title = row.event ? eventTitle(row.event) : eventTitle(first);
  const details = [
    stageLabel(row.event ? row.event.stage : first.stage),
    row.event?.boatClass ?? first.boatClass,
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 md:flex-row md:gap-4 md:p-4">
      <div className="flex items-baseline gap-2 md:w-24 md:shrink-0 md:flex-col md:gap-0.5">
        <Time iso={row.scheduledAt} timeZone={tz} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-md font-medium text-ink">{title}</h3>
          {details.length > 0 && <p className="text-sm text-ink-2">{details.join(' · ')}</p>}
        </div>
        <div className="flex flex-col divide-y divide-line">
          {row.crews.map((c) => (
            <Crew key={c.entry.entryId} {...c} />
          ))}
        </div>
      </div>
    </li>
  );
}

function PublishedLines({ teams, view }: { teams: ShareTeam[]; view: ShareView }) {
  return (
    <ul aria-label="Published lineups" className="flex flex-col gap-1.5">
      {teams.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TeamChip team={t} size="sm" />
          <span className="text-sm text-ink-2">
            {t.published && t.publishedAt
              ? `Published ${shortInstant(t.publishedAt, view.regatta.timezone)}`
              : 'Lineups not published yet'}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ShareSchedule({ view }: { view: ShareView }) {
  const [params, setParams] = useSearchParams();
  const tz = view.regatta.timezone;
  const days = useMemo(() => shareDays(view), [view]);
  const fallbackDay = useMemo(() => defaultDay(view, days, todayIn(tz)), [view, days, tz]);
  const wanted = params.get('day');
  const day = wanted && days.includes(wanted) ? wanted : fallbackDay;

  const canFilter = view.link.scope === 'regatta' && view.teams.length > 1;
  const wantedTeam = params.get('team');
  const teamId =
    canFilter && wantedTeam && view.teams.some((t) => t.id === wantedTeam) ? wantedTeam : null;
  const shownTeams = teamId ? view.teams.filter((t) => t.id === teamId) : view.teams;

  const rows = useMemo(() => (day ? dayRows(view, day, teamId) : []), [view, day, teamId]);
  const noDay = useMemo(() => crewsWithoutDay(view, teamId), [view, teamId]);
  const races = rows.filter((r) => r.type === 'race').length;
  const anyPublished = shownTeams.some((t) => t.published);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <section aria-labelledby="schedule-title" className="flex flex-col gap-5">
      <h2 id="schedule-title" className="sr-only">
        Schedule
      </h2>
      <PublishedLines teams={shownTeams} view={view} />

      {(days.length > 1 || canFilter) && (
        <div className="flex flex-col gap-3">
          {days.length > 1 && day && (
            <ChoiceChips
              label="Day"
              value={day}
              onValueChange={(d) => setParam('day', d)}
              choices={days.map((d) => ({ value: d, label: formatWeekday(d) }))}
            />
          )}
          {canFilter && (
            <ChoiceChips
              label="Team"
              value={teamId ?? ALL}
              onValueChange={(v) => setParam('team', v === ALL ? null : v)}
              choices={[
                { value: ALL, label: 'All teams' },
                ...view.teams.map((t) => ({
                  value: t.id,
                  ariaLabel: t.name,
                  label: (
                    <>
                      <TeamDot colorKey={t.colorKey} />
                      {t.shortName || t.name}
                    </>
                  ),
                })),
              ]}
            />
          )}
        </div>
      )}

      {day && days.length > 1 && (
        <h3 className="font-display text-lg font-semibold">{formatWeekday(day)}</h3>
      )}

      {races === 0 ? (
        <EmptyState
          title={anyPublished ? 'No races on this day' : 'No lineups published yet'}
          description={
            anyPublished
              ? days.length > 1
                ? 'None of these crews race on this day. Pick another day above.'
                : 'None of these crews has a race on the schedule yet. Check back closer to race day.'
              : 'Coaches publish lineups before race day. Check back then; this page updates on its own.'
          }
        />
      ) : null}
      {rows.length > 0 && (
        <ol aria-label="Races and schedule" className="flex flex-col gap-2">
          {rows.map((row) => (
            <Row key={row.key} row={row} view={view} />
          ))}
        </ol>
      )}

      {noDay.length > 0 && (
        <section aria-labelledby="no-day-title" className="flex flex-col gap-2">
          <h3 id="no-day-title" className="text-md font-medium">
            Not on the schedule yet
          </h3>
          <ul className="flex flex-col gap-2">
            {noDay.map((c) => (
              <li
                key={c.entry.entryId}
                className="rounded-card border border-line bg-surface p-3 md:p-4"
              >
                <Crew {...c} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-ink-2">
        Times as of {shortInstant(view.generatedAt, tz)}. This page checks for changes every minute.
      </p>
    </section>
  );
}
