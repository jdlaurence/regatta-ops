// The schedule as a list (PLAN.md §4.3, §4.5, §6.3): one day's races in time order with
// logistics lines between them, each race's entries nested under it. Times and names edit
// inline; each entry links to its team's lineups page.

import { useMemo, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Ellipsis, MessageSquare, Pencil, Plus } from 'lucide-react';
import {
  athleteName,
  athleteShortName,
  clockAt,
  entrySeatSides,
  isHotSeat,
  type Entry,
  type Finding,
  type RegattaEvent,
  type Seat,
} from '@regatta-ops/domain';
import { useCan, worstSeverity, type RegattaWorkingSet } from '@/data';
import { lineupEntryPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { BoatStrip, type SeatOccupant } from '@/components/BoatStrip';
import { ClassBadge, OarChip, ShellChip, TeamChip } from '@/components/chips';
import { useCommentCounts } from '@/components/CommentsThread';
import { ConflictBadge, ConflictBadges } from '@/components/ConflictBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { EventCommentsButton, EventCommentsDialog } from './EventComments';
import { InlineEdit } from './InlineEdit';
import { STAGE_LABELS, eventTitle, wallTime, type ScheduleItem } from './lib';

/** A row reached from a link to its event (`?event=`) glows briefly (set by useEventLink). */
const HIGHLIGHT =
  'transition-colors duration-700 data-[highlight=true]:bg-accent-tint data-[highlight=true]:duration-150';

export interface ScheduleListProps {
  ws: RegattaWorkingSet;
  regattaId: string;
  items: ScheduleItem[];
  /** Entries with no event, shown after the day (filtered like the rest). */
  loose: Entry[];
  findings: readonly Finding[];
  canEdit: boolean;
  /** List each race's entries under it (the "Show entries" switch); off is the bare schedule. */
  showEntries?: boolean;
  onSaveTime: (event: RegattaEvent, hhmm: string) => void;
  onSaveName: (event: RegattaEvent, name: string) => void;
  onEditEvent: (event: RegattaEvent) => void;
  onAddLogistics: () => void;
}

export function ScheduleList({
  ws,
  regattaId,
  items,
  loose,
  findings,
  canEdit,
  showEntries = true,
  onSaveTime,
  onSaveName,
  onEditEvent,
  onAddLogistics,
}: ScheduleListProps) {
  const byEntry = useMemo(() => {
    const m = new Map<string, Finding[]>();
    for (const f of findings) {
      for (const id of f.entryIds) m.set(id, [...(m.get(id) ?? []), f]);
    }
    return m;
  }, [findings]);
  const tz = ws.regatta.timezone;
  const raceIds = useMemo(
    () => items.filter((i) => i.kind !== 'logistics').map((i) => i.event.id),
    [items],
  );
  const commentCounts = useCommentCounts('event', raceIds);
  const [commentsFor, setCommentsFor] = useState<RegattaEvent | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <ol aria-label="Races and logistics" className="rounded-card border border-line bg-surface">
        {items.map((item) =>
          item.kind === 'logistics' ? (
            <LogisticsRow
              key={item.event.id}
              event={item.event}
              ws={ws}
              canEdit={canEdit}
              onSaveTime={onSaveTime}
              onSaveName={onSaveName}
              onEditEvent={onEditEvent}
            />
          ) : (
            <li
              key={item.event.id}
              data-event-id={item.event.id}
              tabIndex={-1}
              className={cn(
                'flex flex-col gap-2 border-b border-line px-3 py-3 last:border-b-0 focus-visible:-outline-offset-2 md:px-4',
                HIGHLIGHT,
              )}
            >
              <EventHeader
                event={item.event}
                timeZone={tz}
                canEdit={canEdit}
                hasEntries={item.entries.length > 0}
                comments={commentCounts.get(item.event.id) ?? 0}
                onComments={() => setCommentsFor(item.event)}
                onSaveTime={onSaveTime}
                onSaveName={onSaveName}
                onEditEvent={onEditEvent}
              />
              {showEntries && item.entries.length > 0 && (
                <ul
                  aria-label={`Entries in ${eventTitle(item.event)}`}
                  className="flex flex-col md:pl-20"
                >
                  {item.entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      ws={ws}
                      regattaId={regattaId}
                      findings={byEntry.get(entry.id) ?? []}
                    />
                  ))}
                </ul>
              )}
            </li>
          ),
        )}
      </ol>
      {canEdit && (
        <Button variant="ghost" size="sm" className="-mt-4 self-start" onClick={onAddLogistics}>
          <Plus aria-hidden />
          Add logistics line
        </Button>
      )}
      {showEntries && loose.length > 0 && (
        <section aria-labelledby="schedule-loose" className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <h2 id="schedule-loose" className="text-md font-medium">
              Entries without an event{' '}
              <span className="text-ink-2 tabular-nums">{loose.length}</span>
            </h2>
            <p className="text-base text-ink-2">
              They are not on the schedule yet. Pick an event for each on its team&rsquo;s lineups
              page.
            </p>
          </div>
          <ul className="rounded-card border border-line bg-surface px-1 py-1">
            {loose.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                ws={ws}
                regattaId={regattaId}
                findings={byEntry.get(entry.id) ?? []}
              />
            ))}
          </ul>
        </section>
      )}
      <EventCommentsDialog event={commentsFor} onOpenChange={(o) => !o && setCommentsFor(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function TimeCell({
  event,
  timeZone,
  canEdit,
  onSaveTime,
  muted = false,
}: {
  event: RegattaEvent;
  timeZone: string;
  canEdit: boolean;
  onSaveTime: (event: RegattaEvent, hhmm: string) => void;
  muted?: boolean;
}) {
  const time = event.scheduledAt ? clockAt(event.scheduledAt, timeZone) : null;
  const title = eventTitle(event);
  return (
    <div className="flex w-16 shrink-0 flex-col items-start gap-1 md:w-20">
      <InlineEdit
        value={event.scheduledAt ? wallTime(event.scheduledAt, timeZone) : ''}
        displayText={time ?? 'TBD'}
        what={`time of ${title}`}
        type="time"
        allowEmpty
        canEdit={canEdit}
        onCommit={(v) => onSaveTime(event, v)}
        className={cn(
          'tabular-nums',
          muted ? 'text-sm text-ink-2' : 'font-display text-md font-semibold',
          !time && 'text-ink-2',
        )}
      >
        {time ?? 'TBD'}
      </InlineEdit>
    </div>
  );
}

function EventMenu({
  event,
  canEdit,
  onEditEvent,
  onComments,
}: {
  event: RegattaEvent;
  canEdit: boolean;
  onEditEvent: (e: RegattaEvent) => void;
  /** Races only: open the event's comments. */
  onComments?: () => void;
}) {
  if (!canEdit && !onComments) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${eventTitle(event)}`}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canEdit && (
          <DropdownMenuItem onSelect={() => onEditEvent(event)}>
            <Pencil aria-hidden />
            Edit event
          </DropdownMenuItem>
        )}
        {onComments && (
          <DropdownMenuItem onSelect={onComments}>
            <MessageSquare aria-hidden />
            Comments
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EventHeader({
  event,
  timeZone,
  canEdit,
  hasEntries,
  comments,
  onComments,
  onSaveTime,
  onSaveName,
  onEditEvent,
}: {
  event: RegattaEvent;
  timeZone: string;
  canEdit: boolean;
  hasEntries: boolean;
  comments: number;
  onComments: () => void;
  onSaveTime: (event: RegattaEvent, hhmm: string) => void;
  onSaveName: (event: RegattaEvent, name: string) => void;
  onEditEvent: (event: RegattaEvent) => void;
}) {
  const stage = event.stage && event.stage !== 'race' ? STAGE_LABELS[event.stage] : null;
  const canComment = useCan('comment');
  return (
    <div className="flex items-start gap-3">
      <TimeCell event={event} timeZone={timeZone} canEdit={canEdit} onSaveTime={onSaveTime} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {event.eventNumber && (
            <span className="text-base text-ink-2 tabular-nums">Event {event.eventNumber}</span>
          )}
          <InlineEdit
            value={event.name}
            displayText={event.name}
            what={`name of ${eventTitle(event)}`}
            canEdit={canEdit}
            onCommit={(v) => onSaveName(event, v)}
            className={cn('min-w-0 text-md font-medium', !hasEntries && 'text-ink-2')}
            inputClassName="w-full max-w-md"
          >
            {event.name}
          </InlineEdit>
          {event.boatClass && <ClassBadge boatClass={event.boatClass} />}
          {stage && <span className="text-sm text-ink-2">{stage}</span>}
          {!event.scheduledAt && (
            <span className="inline-flex h-5 items-center rounded-control border border-line-strong px-1.5 text-xs font-medium text-ink-2">
              Unscheduled
            </span>
          )}
          <EventCommentsButton event={event} count={comments} onOpen={onComments} />
        </div>
        {event.category && event.category !== event.name && (
          <p className="text-sm text-ink-2">{event.category}</p>
        )}
      </div>
      <EventMenu
        event={event}
        canEdit={canEdit}
        onEditEvent={onEditEvent}
        onComments={canComment ? onComments : undefined}
      />
    </div>
  );
}

function LogisticsRow({
  event,
  ws,
  canEdit,
  onSaveTime,
  onSaveName,
  onEditEvent,
}: {
  event: RegattaEvent;
  ws: RegattaWorkingSet;
  canEdit: boolean;
  onSaveTime: (event: RegattaEvent, hhmm: string) => void;
  onSaveName: (event: RegattaEvent, name: string) => void;
  onEditEvent: (event: RegattaEvent) => void;
}) {
  const only = (event.teamFilter ?? []).map((id) => ws.byId.teams.get(id)).filter((t) => !!t);
  const showTeams = only.length > 0 && ws.participatingTeams.length > 1;
  return (
    <li
      data-event-id={event.id}
      tabIndex={-1}
      className={cn(
        'flex items-center gap-3 border-b border-line bg-bg/60 px-3 py-1.5 last:border-b-0 focus-visible:-outline-offset-2 md:px-4',
        HIGHLIGHT,
      )}
    >
      {event.scheduledAt ? (
        <TimeCell
          event={event}
          timeZone={ws.regatta.timezone}
          canEdit={canEdit}
          onSaveTime={onSaveTime}
          muted
        />
      ) : (
        <span className="w-16 shrink-0 md:w-20" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <InlineEdit
          value={event.name}
          displayText={event.name}
          what={`text of ${event.name}`}
          canEdit={canEdit}
          onCommit={(v) => onSaveName(event, v)}
          className="min-w-0 text-base text-ink-2"
          inputClassName="w-full max-w-lg"
        >
          {event.name}
        </InlineEdit>
        {showTeams && only.map((t) => <TeamChip key={t.id} team={t} short size="sm" />)}
      </div>
      <EventMenu event={event} canEdit={canEdit} onEditEvent={onEditEvent} />
    </li>
  );
}

// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  ws,
  regattaId,
  findings,
}: {
  entry: Entry;
  ws: RegattaWorkingSet;
  regattaId: string;
  findings: Finding[];
}) {
  const navigate = useNavigate();
  const team = ws.byId.teams.get(entry.teamId);
  const shell = entry.shellId ? ws.byId.shells.get(entry.shellId) : undefined;
  const oars = entry.oarSetId ? ws.byId.oarSets.get(entry.oarSetId) : undefined;
  const href = lineupEntryPath(regattaId, entry.teamId, entry.id);
  const scratched = entry.status === 'scratched';

  const seats = useMemo(() => {
    const out: Partial<Record<Seat, SeatOccupant | null>> = {};
    for (const s of ws.seatsByEntry.get(entry.id) ?? []) {
      const a = s.athleteId ? ws.byId.athletes.get(s.athleteId) : undefined;
      if (a) out[s.seat] = { id: a.id, name: athleteName(a), shortName: athleteShortName(a) };
    }
    return out;
  }, [ws, entry.id]);

  const hotSeats = findings.filter((f) => isHotSeat(f));
  const others = findings.filter((f) => !isHotSeat(f));
  const worst = worstSeverity(findings);
  const teamName = team?.shortName || team?.name || '';
  const homeColor = shell?.homeTeamId ? ws.byId.teams.get(shell.homeTeamId)?.colorKey : null;

  // The whole row opens the entry; the link inside is the keyboard and screen reader path.
  const onRowClick = (e: MouseEvent<HTMLLIElement>) => {
    if ((e.target as HTMLElement).closest('a, button, [role="button"], input')) return;
    void navigate(href);
  };

  return (
    <li
      data-entry-id={entry.id}
      onClick={onRowClick}
      className={cn(
        'flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 rounded-control px-2 py-1.5 hover:bg-surface-2',
        scratched && 'grayscale',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 md:w-40 md:shrink-0">
        {team && <TeamChip team={team} short size="sm" />}
        <Link
          to={href}
          className="truncate text-base font-medium text-ink underline-offset-4 hover:underline pointer-coarse:min-w-11 pointer-coarse:py-[13px]"
        >
          <span className="sr-only">{teamName} </span>
          {entry.label}
        </Link>
        {scratched && <span className="shrink-0 text-xs text-ink-2">Scratched</span>}
      </div>
      <BoatStrip
        boatClass={entry.boatClass}
        seats={seats}
        coxPosition={shell?.coxPosition}
        seatSides={entrySeatSides(entry, shell)}
        size="xs"
        teamColor={team?.colorKey}
        conflict={worst === 'info' ? null : worst}
        showConflictIcon={false}
        label={`${teamName} ${entry.label}${shell ? `, ${shell.nickname || shell.name}` : ''}`}
        className="min-w-0 flex-1 basis-56 md:max-w-[440px]"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {shell ? (
          <ShellChip
            shell={shell}
            teamColor={homeColor}
            showClass={shell.boatClass !== entry.boatClass}
          />
        ) : (
          <span className="text-sm text-ink-2">No shell</span>
        )}
        {oars ? <OarChip oarSet={oars} /> : <span className="text-sm text-ink-2">No oars</span>}
        {hotSeats.length > 0 && (
          <ConflictBadge
            severity={worstSeverity(hotSeats) ?? 'warning'}
            label="Hot seat"
            findings={hotSeats}
          />
        )}
        <ConflictBadges findings={others} />
      </div>
    </li>
  );
}
