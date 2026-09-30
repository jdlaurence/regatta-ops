// The lineup builder, /regattas/:id/lineups/:teamId (PLAN.md §4.4, §6.4): the roster panel with
// its crossed-off athletes, the team's entries as boat strips by event (or the by-athlete
// matrix), shell and oar pickers with live conflict hints, and entry details in the inspector.
//
// Layout: the roster is a sticky column when the builder has room (≥ 900 px); otherwise it is
// a collapsible panel above the entries. Entries draw as strips, or as seat rows when the
// column is narrower than a readable eight (phones and a squeezed desktop).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ChevronDown, Keyboard, Plus, Printer, Rows3, Share2, Table2 } from 'lucide-react';
import type { Finding, Id, Team } from '@srt/domain';
import { useCan, useCurrentUser, useFindings, type RegattaWorkingSet } from '@/data';
import { useRegattaId, useTeamIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { BoatStripSkeleton } from '@/components/BoatStrip';
import { TeamDot } from '@/components/chips';
import { Inspector, useInspector, useInspectorStore } from '@/components/Inspector';
import { PageHeader } from '@/components/PageHeader';
import { ShareLinksDialog } from '@/components/ShareLinksDialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { SegmentedControl, Switch } from '@/components/ui/controls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/menu';
import { useLineupActions } from './actions';
import { AthleteMatrix } from './AthleteMatrix';
import { LineupContext, useLineup, type LineupContextValue } from './context';
import { LineupDialogs } from './Dialogs';
import { EntriesByEvent } from './EntriesByEvent';
import { EntryDetails } from './EntryDetails';
import { LineupDnd } from './LineupDnd';
import { buildIndex, stripNeed } from './lib';
import { PublishSlot } from './PublishSlot';
import { RosterColumn, RosterDrawer } from './RosterPanel';
import { SEAT_HELP_ID } from './Seats';
import { SeatSheet } from './SeatSheet';
import { useLineupUi } from './store';

const ROSTER_COLUMN = 240;
/** The grid's gap-6 between the roster and the entries. */
const ROSTER_GAP = 24;
const ALL_EVENTS_KEY = 'srt-lineups-all-events';

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Width of an element, from a ResizeObserver; 0 until the first measurement. */
function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width];
}

function readAllEvents(): boolean {
  try {
    return localStorage.getItem(ALL_EVENTS_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveAllEvents(v: boolean) {
  try {
    localStorage.setItem(ALL_EVENTS_KEY, String(v));
  } catch {
    // A convenience only.
  }
}

// ---------------------------------------------------------------------------

function TeamTitle({ team, teams, regattaId }: { team: Team; teams: Team[]; regattaId: string }) {
  const navigate = useNavigate();
  const { ws } = useLineup();
  const name = (
    <>
      <TeamDot colorKey={team.colorKey} className="size-3" />
      <span>{`${team.name} lineups`}</span>
    </>
  );
  if (teams.length < 2) return <span className="inline-flex items-center gap-2">{name}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Switch team"
        className="-mx-1.5 inline-flex items-center gap-2 rounded-control px-1.5 hover:bg-surface-2 pointer-coarse:min-h-11"
      >
        {name}
        <ChevronDown aria-hidden className="size-5 text-ink-2" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={team.id}
          onValueChange={(id) => navigate(regattaPath(regattaId, `lineups/${id}`))}
        >
          {teams.map((t) => {
            const n = ws.entries.filter((e) => e.teamId === t.id).length;
            return (
              <DropdownMenuRadioItem key={t.id} value={t.id}>
                <TeamDot colorKey={t.colorKey} />
                {t.name}
                <span className="ml-auto pl-4 text-sm text-ink-2 tabular-nums">
                  {n} {n === 1 ? 'entry' : 'entries'}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Type a name', 'On a seat: choose an athlete'],
  ['Enter', 'Open the seat’s athlete list'],
  ['Space', 'Pick up an athlete; Space on another seat moves or swaps them'],
  ['Delete', 'Clear the seat'],
  ['Arrow keys', 'Move between seats; up and down move between entries'],
  ['Escape', 'Cancel a move'],
  [']', 'Show or hide the inspector'],
];

function KeyboardHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Keyboard shortcuts">
          <Keyboard aria-hidden />
          <span className="hidden xl:inline">Keyboard</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <h2 className="mb-2 text-md font-medium">Keyboard</h2>
        <dl className="flex flex-col gap-1.5 text-base">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex gap-3">
              <dt className="w-24 shrink-0 font-medium">{k}</dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function CarryBanner() {
  const { index } = useLineup();
  const carrying = useLineupUi((s) => s.carrying);
  if (!carrying) return null;
  const a = index.athleteById.get(carrying.athleteId);
  const name = a ? `${a.preferredName?.trim() || a.firstName} ${a.lastName}` : 'the athlete';
  return (
    <div
      data-print="hide"
      className="fixed bottom-20 left-1/2 z-40 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-card border border-accent bg-surface py-2 pr-2 pl-4 text-base shadow-popover md:bottom-6"
    >
      <span className="min-w-0">
        Moving <span className="font-medium">{name}</span>. Choose a seat, or press Escape.
      </span>
      <Button size="sm" onClick={() => useLineupUi.getState().carry(null)}>
        Cancel
      </Button>
    </div>
  );
}

function LiveRegion() {
  const text = useLineupUi((s) => s.announcement);
  return (
    <div aria-live="polite" role="status" className="sr-only">
      {text}
    </div>
  );
}

function SelectedEntryInspector() {
  const { index, team } = useLineup();
  const id = useLineupUi((s) => s.selectedEntryId);
  const entry = id ? index.entryById.get(id) : null;
  if (!entry || entry.teamId !== team.id) return null;
  return (
    <Inspector title="Entry details">
      <EntryDetails key={entry.id} entry={entry} />
    </Inspector>
  );
}

// ---------------------------------------------------------------------------

function Builder({ regattaId }: { regattaId: string }) {
  const { canEdit, isPhone, ws, team, wide, index } = useLineup();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { setOpen: setInspectorOpen } = useInspector();
  const view = params.get('view') === 'athlete' ? 'athlete' : 'event';
  const [showAll, setShowAll] = useState(readAllEvents);
  const [shareOpen, setShareOpen] = useState(false);
  const racing = ws.participatingTeams;

  // Links from the schedule, the activity feed, and emails point at one entry: ?entry=<id>.
  // Open it in the by-event view, show its details, scroll to it, and highlight it briefly.
  const linked = params.get('entry');
  useEffect(() => {
    if (!linked) return;
    const entry = index.entryById.get(linked);
    if (entry && entry.teamId !== team.id) {
      navigate(regattaPath(regattaId, `lineups/${entry.teamId}?entry=${entry.id}`), {
        replace: true,
      });
      return;
    }
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete('entry');
        next.delete('view');
        return next;
      },
      { replace: true },
    );
    if (!entry) return;
    useLineupUi.getState().reveal(entry.id);
    setInspectorOpen(true);
  }, [linked, index, team.id, regattaId, navigate, setParams, setInspectorOpen]);

  const setView = (v: 'event' | 'athlete') =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === 'athlete') next.set('view', 'athlete');
        else next.delete('view');
        return next;
      },
      { replace: true },
    );
  const toggleAll = (v: boolean) => {
    setShowAll(v);
    saveAllEvents(v);
  };
  const showEntry = (entryId: Id) => {
    setView('event');
    useLineupUi.getState().reveal(entryId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && useLineupUi.getState().carrying) {
        useLineupUi.getState().carry(null);
        useLineupUi.getState().announce('Move cancelled.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={<TeamTitle team={team} teams={racing} regattaId={regattaId} />}
        actions={
          <>
            <PublishSlot regattaId={regattaId} teamId={team.id} />
            {canEdit && (
              <Button size="sm" onClick={() => setShareOpen(true)}>
                <Share2 aria-hidden />
                Share
              </Button>
            )}
            <Button asChild size="sm">
              <Link to={`/print/regattas/${regattaId}/lineups/${team.id}`}>
                <Printer aria-hidden />
                Print
              </Link>
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-print="hide">
          <SegmentedControl
            label="View"
            size="sm"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'event', label: 'By event', icon: <Rows3 aria-hidden /> },
              { value: 'athlete', label: 'By athlete', icon: <Table2 aria-hidden /> },
            ]}
          />
          {view === 'event' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
              <Switch checked={showAll} onCheckedChange={toggleAll} aria-label="Show all events" />
              All events
            </label>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canEdit && !isPhone && <KeyboardHelp />}
            {canEdit && !isPhone && (
              <Button
                size="sm"
                onClick={() => useLineupUi.getState().openDialog({ kind: 'copy-from' })}
              >
                Copy lineups from…
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => useLineupUi.getState().openDialog({ kind: 'add' })}
              >
                <Plus aria-hidden />
                Add entry
              </Button>
            )}
          </div>
        </div>
      </PageHeader>

      <p id={SEAT_HELP_ID} className="sr-only">
        Press Enter or type a name to choose an athlete. Space picks the athlete up to move them.
        Delete clears the seat. Arrow keys move between seats.
      </p>

      <div className="min-w-0">
        {view === 'athlete' ? (
          <AthleteMatrix onShowEntry={showEntry} />
        ) : (
          <LineupDnd>
            <div
              className={cn('grid items-start gap-5', wide ? 'gap-6' : 'grid-cols-1')}
              style={
                wide ? { gridTemplateColumns: `${ROSTER_COLUMN}px minmax(0, 1fr)` } : undefined
              }
            >
              {wide ? <RosterColumn /> : <RosterDrawer />}
              <EntriesByEvent showAll={showAll} onShowAll={() => toggleAll(true)} />
            </div>
          </LineupDnd>
        )}
      </div>

      <SelectedEntryInspector />
      <LineupDialogs />
      {canEdit && (
        <ShareLinksDialog
          regattaId={regattaId}
          open={shareOpen}
          onOpenChange={setShareOpen}
          defaultTeamId={team.id}
        />
      )}
      {isPhone && <SeatSheet />}
      <CarryBanner />
      <LiveRegion />
    </div>
  );
}

/**
 * Room for the builder (PLAN.md §5.3, §6.4). When the inspector column would squeeze the
 * builder into its narrow layout (roster folded above the entries, eights as seat rows), the
 * lineup page starts with the column closed, without changing the remembered choice. `]` and
 * an entry's details open it again; leaving the page restores the remembered state. Decided
 * once, on the first measurement, and never when arriving at a linked entry.
 */
function useRoomForBuilder(width: number, wideMin: number, isPhone: boolean) {
  const decided = useRef(false);
  const closed = useRef(false);
  useEffect(() => {
    if (decided.current || width === 0 || isPhone) return;
    decided.current = true;
    const inspector = useInspectorStore.getState();
    const desktop = window.matchMedia?.('(min-width: 1024px)').matches ?? false;
    if (!desktop || !inspector.columnOpen || width >= wideMin) return;
    const linked = new URLSearchParams(window.location.search).has('entry');
    if (linked || useLineupUi.getState().selectedEntryId) return;
    inspector.setOpen(false, { remember: false });
    closed.current = true;
  }, [width, wideMin, isPhone]);
  useEffect(
    () => () => {
      if (closed.current) useInspectorStore.getState().restoreOpen();
    },
    [],
  );
}

function Provider({
  ws,
  team,
  findings,
  input,
  children,
}: {
  ws: RegattaWorkingSet;
  team: Team;
  findings: Finding[];
  input: LineupContextValue['input'];
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const canEdit = useCan('regatta.edit');
  const isPhone = useMediaQuery('(max-width: 767px)');
  const index = useMemo(() => buildIndex(ws), [ws]);
  const findingsByEntry = useMemo(() => {
    const map = new Map<Id, Finding[]>();
    for (const f of findings) {
      for (const id of f.entryIds) {
        const list = map.get(id);
        if (list) list.push(f);
        else map.set(id, [f]);
      }
    }
    return map;
  }, [findings]);
  const actions = useLineupActions({
    index,
    regattaId: ws.regatta.id,
    team,
    isFinal: ws.regatta.status === 'final',
    canEdit,
  });
  const [measure, width] = useWidth();
  // The roster sits beside the entries when there is room for it and for the team's longest
  // boat as a strip (a 4+ at least): 960 px for a team racing eights, 712 px for fours.
  const wideMin = useMemo(() => {
    const classes = ws.entries.filter((e) => e.teamId === team.id).map((e) => e.boatClass);
    return ROSTER_COLUMN + ROSTER_GAP + Math.max(stripNeed('4+'), ...classes.map(stripNeed));
  }, [ws.entries, team.id]);
  useRoomForBuilder(width, wideMin, isPhone);
  const value = useMemo<LineupContextValue>(() => {
    const wide = !isPhone && (width === 0 || width >= wideMin);
    return {
      ws,
      index,
      input,
      team,
      findings,
      findingsByEntry,
      canEdit,
      isPhone,
      wide,
      entriesWidth: width === 0 ? Infinity : wide ? width - ROSTER_COLUMN - ROSTER_GAP : width,
      weightUnit: user?.preferences?.weightUnit ?? ws.clubSettings?.weightUnit ?? 'lb',
      seasonYear: Number(ws.regatta.startDate.slice(0, 4)),
      actions,
    };
  }, [
    ws,
    index,
    input,
    team,
    findings,
    findingsByEntry,
    canEdit,
    isPhone,
    width,
    wideMin,
    user,
    actions,
  ]);

  // A fresh builder for each team: no selection, picker, or move carried over. Reset on the way
  // out (cleanups run before the next team's effects, so a linked ?entry= survives).
  const reset = useLineupUi((s) => s.reset);
  useEffect(() => reset, [reset, ws.regatta.id, team.id]);

  return (
    <LineupContext.Provider value={value}>
      <div ref={measure}>{children}</div>
    </LineupContext.Provider>
  );
}

function LineupsSkeleton() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-label="Loading lineups">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-8 w-80" />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Skeleton className="hidden h-[420px] rounded-card lg:block" />
        <div className="flex flex-col gap-6">
          {[8, 4, 8].map((n, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3"
            >
              <Skeleton className="h-5 w-48" />
              <BoatStripSkeleton size="md" seats={n} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function LineupsPage() {
  const regattaId = useRegattaId();
  const teamId = useTeamIdParam();
  const f = useFindings(regattaId);

  if (f.isError) {
    return <ErrorState title="Lineups did not load." error={f.error} onRetry={f.refetch} />;
  }
  if (f.isLoading || !f.workingSet || !f.input) return <LineupsSkeleton />;
  const ws = f.workingSet;
  const team = ws.participatingTeams.find((t) => t.id === teamId);
  if (!team) {
    const other = ws.teams.find((t) => t.id === teamId);
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Lineups" />
        <EmptyState
          title={other ? `${other.name} is not racing at ${ws.regatta.name}` : 'Team not found'}
          description="Add the team to this regatta on the overview, or pick a team that is racing."
          action={
            <>
              {ws.participatingTeams.map((t) => (
                <Button key={t.id} asChild>
                  <Link to={regattaPath(regattaId, `lineups/${t.id}`)}>
                    <TeamDot colorKey={t.colorKey} />
                    {t.name}
                  </Link>
                </Button>
              ))}
              <Button asChild variant="ghost">
                <Link to={regattaPath(regattaId)}>Go to overview</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }
  return (
    <Provider ws={ws} team={team} findings={f.findings} input={f.input}>
      <Builder regattaId={regattaId} />
    </Provider>
  );
}
