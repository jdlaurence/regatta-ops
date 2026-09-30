// The schedule (PLAN.md §4.5, §6.3): the whole club's day as a list of races with their entries
// and logistics lines, or as a timeline of busy windows by shell, team, or oar set, with
// conflicts marked. Event times and names edit inline; "Shift times" moves the rest of a day.
// The conflicts panel sits in the inspector on desktop and in a tab on narrower screens.

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CalendarClock, ClipboardPaste, Ellipsis, Plus } from 'lucide-react';
import type { Entry, RegattaEvent } from '@srt/domain';
import { useCan, useFindings } from '@/data';
import { useRegattaId } from '@/app/params';
import { lineupEntryPath } from '@/app/nav-items';
import { formatWeekday, todayIn } from '@/lib/dates';
import { ConflictsPanel } from '@/components/ConflictsPanel';
import { DayTimeline } from '@/components/DayTimeline';
import { useInspectorStore } from '@/components/Inspector';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/select';
import { EventFormDialog, ImportEventsDialog } from '@/features/events';
import { useConfirm } from './ConfirmDialog';
import { useEventEdits, useEventLink, useNow, useScheduleParams } from './hooks';
import {
  defaultDay,
  entriesWithoutEvent,
  entryMatches,
  hasFilters,
  NO_FILTERS,
  regattaDays,
  scheduleItems,
} from './lib';
import { ScheduleList } from './ScheduleList';
import { ScheduleToolbar } from './ScheduleToolbar';
import { ShiftTimesDialog } from './ShiftTimesDialog';

interface EventDialogState {
  event: RegattaEvent | null;
  kind: RegattaEvent['kind'];
}

export default function SchedulePage() {
  const regattaId = useRegattaId();
  const navigate = useNavigate();
  const {
    findings,
    input,
    workingSet: ws,
    isLoading,
    isError,
    error,
    refetch,
  } = useFindings(regattaId);
  const params = useScheduleParams();
  const { groupBy, set } = params;
  const canEdit = useCan('regatta.edit');
  const now = useNow();
  const isDesktop = useInspectorStore((s) => s.isDesktop);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const edits = useEventEdits(ws?.regatta, confirm);
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);

  const days = useMemo(() => (ws ? regattaDays(ws.regatta, ws.events) : []), [ws]);
  const today = todayIn(ws?.regatta.timezone, new Date(now));
  // A link to one event shows its day in the list, unfiltered, until the highlight is done.
  const target = params.event ? ws?.byId.events.get(params.event) : undefined;
  const view = target ? 'list' : params.view;
  const tab = target ? 'schedule' : params.tab;
  const filters = target ? NO_FILTERS : params.filters;
  const dayParam = target?.day ?? params.day;
  const day = dayParam && days.includes(dayParam) ? dayParam : defaultDay(days, today);
  useEventLink(params.event, target, !!ws, set);

  const items = useMemo(
    () => (ws ? scheduleItems(ws.events, ws.entries, day, filters, ws.byId.teams) : []),
    [ws, day, filters],
  );
  const loose = useMemo(
    () => (ws ? entriesWithoutEvent(ws.entries, ws.byId.events, filters, ws.byId.teams) : []),
    [ws, filters],
  );
  const includeEntry = useCallback((e: Entry) => entryMatches(e, filters), [filters]);

  const races = items.filter((i) => i.kind === 'race');
  const entryCount = races.reduce((n, i) => n + i.entries.length, 0);
  const untimed = races
    .filter((i) => !i.event.scheduledAt)
    .reduce((n, i) => n + i.entries.filter((e) => e.status !== 'scratched').length, 0);

  const openEntry = useCallback(
    (entryId: string, teamId: string) => void navigate(lineupEntryPath(regattaId, teamId, entryId)),
    [navigate, regattaId],
  );

  // On phones the two less frequent actions fold into a menu next to "Add event".
  const actions = canEdit && ws && (
    <>
      <Button
        className="hidden sm:inline-flex"
        onClick={() => setShiftOpen(true)}
        disabled={ws.events.length === 0}
      >
        <CalendarClock aria-hidden />
        Shift times
      </Button>
      <Button className="hidden sm:inline-flex" onClick={() => setImportOpen(true)}>
        <ClipboardPaste aria-hidden />
        Import events
      </Button>
      <Button variant="primary" onClick={() => setEventDialog({ event: null, kind: 'race' })}>
        <Plus aria-hidden />
        Add event
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" className="sm:hidden" aria-label="More schedule actions">
            <Ellipsis aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={ws.events.length === 0} onSelect={() => setShiftOpen(true)}>
            <CalendarClock aria-hidden />
            Shift times
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <ClipboardPaste aria-hidden />
            Import events
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const description =
    ws && days.length > 0
      ? [
          days.length > 1 ? formatWeekday(day) : null,
          `${races.length} ${races.length === 1 ? 'race' : 'races'}`,
          `${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined;

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="flex flex-col gap-4" role="status" aria-label="Loading schedule">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-9 w-40" />
        </div>
        <SkeletonRows rows={8} className="gap-3 [&>*]:h-14" />
      </div>
    );
  } else if (isError || !ws || !input) {
    body = <ErrorState title="The schedule did not load." error={error} onRetry={refetch} />;
  } else if (ws.events.length === 0) {
    body = (
      <EmptyState
        title="No events yet"
        description="Paste the regatta's published schedule, or add events one at a time. Logistics lines like bus departures and lunch go on the schedule too."
        action={
          canEdit && (
            <>
              <Button variant="primary" onClick={() => setImportOpen(true)}>
                <ClipboardPaste aria-hidden />
                Import events
              </Button>
              <Button onClick={() => setEventDialog({ event: null, kind: 'race' })}>
                <Plus aria-hidden />
                Add event
              </Button>
            </>
          )
        }
      />
    );
  } else {
    const noneMatch = items.length === 0 && loose.length === 0;
    const content =
      view === 'timeline' ? (
        <div className="flex flex-col gap-3">
          <DayTimeline
            input={input}
            findings={findings}
            day={day}
            groupBy={groupBy}
            includeEntry={hasFilters(filters) ? includeEntry : undefined}
            now={now}
            onBarClick={(entryId, bar) => openEntry(entryId, bar.teamId)}
            label={`Timeline for ${formatWeekday(day)}`}
            emptyText={
              hasFilters(filters)
                ? 'No scheduled entries match these filters on this day.'
                : 'No entries with a race time on this day. Add entries on a team’s lineups page, and give their events a time in the list.'
            }
          />
          {untimed > 0 && (
            <p className="text-base text-ink-2">
              {untimed === 1 ? '1 entry has' : `${untimed} entries have`} no race time yet, so{' '}
              {untimed === 1 ? 'it is' : 'they are'} not on the timeline.{' '}
              <Button variant="link" onClick={() => set({ view: null })}>
                Show the list
              </Button>
            </p>
          )}
        </div>
      ) : noneMatch ? (
        hasFilters(filters) ? (
          <EmptyState
            title="Nothing matches these filters"
            description="No races or entries on this day match. Clear the filters or pick another day."
            action={
              <Button onClick={() => set({ team: null, class: null, shell: null })}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            title="Nothing on this day yet"
            description="Add the day's races and logistics lines, or import them from the published schedule."
            action={
              canEdit && (
                <Button
                  variant="primary"
                  onClick={() => setEventDialog({ event: null, kind: 'race' })}
                >
                  <Plus aria-hidden />
                  Add event
                </Button>
              )
            }
          />
        )
      ) : (
        <ScheduleList
          ws={ws}
          regattaId={regattaId}
          items={items}
          loose={loose}
          findings={findings}
          canEdit={canEdit}
          onSaveTime={(e, v) => void edits.saveTime(e, v)}
          onSaveName={(e, v) => void edits.saveName(e, v)}
          onEditEvent={(event) => setEventDialog({ event, kind: event.kind })}
          onAddLogistics={() => setEventDialog({ event: null, kind: 'logistics' })}
        />
      );

    body = (
      <div className="flex flex-col gap-4">
        <ScheduleToolbar
          ws={ws}
          days={days}
          day={day}
          view={view}
          groupBy={groupBy}
          filters={filters}
          onChange={set}
        />
        {content}
      </div>
    );

    // Below desktop the inspector is a slide-over, so conflicts get their own tab here.
    if (!isDesktop) {
      body = (
        <Tabs
          value={tab}
          onValueChange={(t) => set({ tab: t === 'conflicts' ? t : null })}
          className="flex flex-col gap-4"
        >
          <TabsList aria-label="Schedule or conflicts">
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="conflicts">
              Conflicts
              {findings.length > 0 && (
                <span className="text-ink-2 tabular-nums">{findings.length}</span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="schedule">{body}</TabsContent>
          <TabsContent value="conflicts">
            <ConflictsPanel regattaId={regattaId} teamId={filters.teamId} headingLevel={2} />
          </TabsContent>
        </Tabs>
      );
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Schedule" description={description} actions={actions} />
      {body}

      {ws && (
        <>
          <EventFormDialog
            regattaId={regattaId}
            open={!!eventDialog}
            onOpenChange={(o) => !o && setEventDialog(null)}
            event={eventDialog?.event ?? null}
            defaultDay={day}
            defaultKind={eventDialog?.kind ?? 'race'}
          />
          <ImportEventsDialog
            regattaId={regattaId}
            open={importOpen}
            onOpenChange={setImportOpen}
          />
          <ShiftTimesDialog
            open={shiftOpen}
            onOpenChange={setShiftOpen}
            events={ws.events}
            days={days}
            day={day}
            timeZone={ws.regatta.timezone}
            isFinal={edits.isFinal}
            onApply={(changes) => edits.applyShift(changes, () => setShiftOpen(false))}
          />
        </>
      )}
      {confirmDialog}
    </div>
  );
}
