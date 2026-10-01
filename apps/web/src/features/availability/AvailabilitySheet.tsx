// A team's availability sheet: the season at a glance, one row per active athlete and one column
// per regatta the team is entered in, with a checkbox per cell that is on unless the athlete is
// out. Coaches fill it in at the start of the season, when they know who misses what. A name
// opens the athlete's season for days, maybes, and reasons; a column's menu opens the lineups,
// marks everyone available, or imports the absence form.
//
// The cells form one keyboard grid (one tab stop, arrow keys between cells, Space to toggle)
// so a 30 by 10 sheet does not cost 300 tab stops.

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
import {
  athleteName,
  type Athlete,
  type AthleteLevel,
  type Availability,
  type Entry,
  type Regatta,
  type RegattaEvent,
  type Team,
} from '@regatta-ops/domain';
import { useBatch, useCan, useCreate, useList, type BatchOp } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { formatDayRange, splitRegattas, todayIn } from '@/lib/dates';
import { SideBadge } from '@/components/chips';
import { ConflictIcon } from '@/components/ConflictBadge';
import { ScrollRegion } from '@/components/ScrollRegion';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { BATCH_LIMIT, chunk, regattaDays } from '@/features/regattas/duplicate';
import { useConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import { useClubSettings } from '@/features/settings/hooks';
import { LEVEL_LABELS } from '@/features/teams/lib';
import { AbsenceImportDialog } from './AbsenceImportDialog';
import { AthleteSeasonSheet, type SeasonColumn } from './AthleteSeasonSheet';
import {
  cellState,
  comingDays,
  countAvailability,
  planWrite,
  seatProblems,
  toggledDraft,
  type AvailabilityDraft,
  type CellState,
  type SeatProblem,
} from './availability-model';
import { shortWeekday } from './controls';
import { MarkAllAvailableDialog } from './MarkAllAvailableDialog';

function byName(a: Athlete, b: Athlete) {
  return a.lastName.localeCompare(b.lastName, 'en') || a.firstName.localeCompare(b.firstName, 'en');
}

/** What the cell says beyond its checkbox: the days coming, "Maybe", or the reason. */
function cellCaption(state: CellState, av: Availability | undefined, days: string[]): string {
  if (state === 'partial') return comingDays(av, days).map(shortWeekday).join(', ');
  if (state === 'maybe') return 'Maybe';
  if (state === 'unavailable') return av?.reason?.trim() ?? '';
  return '';
}

/** The words a screen reader hears after the cell's name. */
function cellStateText(state: CellState, av: Availability | undefined, days: string[]): string {
  const reason = av?.reason?.trim();
  const base = {
    available: 'coming',
    unavailable: 'not coming',
    partial: `coming ${comingDays(av, days).map(shortWeekday).join(', ')} only`,
    maybe: 'maybe',
  }[state];
  return reason ? `${base}, ${reason}` : base;
}

/** Everything the sheet reads: the team's regattas, its athletes, and their availability. */
function useTeamSeason(team: Team) {
  const regattaTeams = useList('regatta_teams', { where: { teamId: team.id } });
  const regattas = useList('regattas', { sort: 'startDate' });
  const athletes = useList('athletes', { where: { teamId: team.id } });
  const regattaIds = useMemo(
    () => (regattaTeams.data ?? []).map((rt) => rt.regattaId).sort(),
    [regattaTeams.data],
  );
  const athleteIds = useMemo(() => (athletes.data ?? []).map((a) => a.id).sort(), [athletes.data]);
  const byRegatta = { enabled: regattaIds.length > 0 };
  const availability = useList('availability', { in: { regattaId: regattaIds } }, byRegatta);
  const entries = useList('entries', { in: { regattaId: regattaIds } }, byRegatta);
  const events = useList('events', { in: { regattaId: regattaIds } }, byRegatta);
  const seats = useList(
    'entry_seats',
    { in: { athleteId: athleteIds } },
    { enabled: athleteIds.length > 0 },
  );
  const parts = [regattaTeams, regattas, athletes];
  const byRegattaParts = regattaIds.length > 0 ? [availability, entries, events] : [];
  const seatParts = athleteIds.length > 0 ? [seats] : [];
  const all = [...parts, ...byRegattaParts, ...seatParts];
  return {
    regattaTeams: regattaTeams.data ?? [],
    regattas: regattas.data ?? [],
    athletes: athletes.data ?? [],
    availability: byRegattaParts.length ? (availability.data ?? []) : [],
    entries: byRegattaParts.length ? (entries.data ?? []) : [],
    events: byRegattaParts.length ? (events.data ?? []) : [],
    seats: seatParts.length ? (seats.data ?? []) : [],
    isPending: all.some((q) => q.isPending),
    error: all.find((q) => q.error)?.error ?? null,
    refetch: () => all.forEach((q) => void q.refetch()),
  };
}

interface ColumnData extends SeasonColumn {
  past: boolean;
}

type ColumnDialog = { kind: 'clear' | 'absence'; regattaId: string } | null;

export function AvailabilitySheet({ team }: { team: Team }) {
  const canEdit = useCan('availability.edit');
  const canAddRegatta = useCan('regatta.edit');
  const { settings } = useClubSettings();
  const season = useTeamSeason(team);
  const batch = useBatch({ errorMessage: 'Availability was not saved. Try again.' });
  const finalEdit = useConfirmFinalEdit(null);
  const [showPast, setShowPast] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ColumnDialog>(null);
  const today = todayIn(settings.timezone);

  const { columns, pastCount, addable } = useMemo(() => {
    const entered = new Set(season.regattaTeams.map((rt) => rt.regattaId));
    const { upcoming, past } = splitRegattas(
      season.regattas.filter((r) => entered.has(r.id)),
      today,
    );
    const byRegatta = new Map<string, Map<string, Availability>>();
    for (const av of season.availability) {
      const m = byRegatta.get(av.regattaId) ?? new Map<string, Availability>();
      m.set(av.athleteId, av);
      byRegatta.set(av.regattaId, m);
    }
    const column = (regatta: Regatta, isPast: boolean): ColumnData => ({
      regatta,
      days: regattaDays(regatta),
      byAthlete: byRegatta.get(regatta.id) ?? new Map(),
      past: isPast,
    });
    const shown = [
      ...(showPast ? [...past].reverse().map((r) => column(r, true)) : []),
      ...upcoming.map((r) => column(r, false)),
    ];
    const notEntered = splitRegattas(
      season.regattas.filter((r) => !entered.has(r.id)),
      today,
    ).upcoming;
    return { columns: shown, pastCount: past.length, addable: notEntered };
  }, [season.regattaTeams, season.regattas, season.availability, showPast, today]);

  const roster = useMemo(
    () => season.athletes.filter((a) => a.status === 'active').sort(byName),
    [season.athletes],
  );

  // Seats by athlete and regatta, for the "out but seated" marks.
  const { entriesFor, eventsById } = useMemo(() => {
    const entryById = new Map(season.entries.map((e) => [e.id, e]));
    const map = new Map<string, Entry[]>();
    for (const s of season.seats) {
      const entry = s.athleteId ? entryById.get(s.entryId) : undefined;
      if (!entry || !s.athleteId) continue;
      const key = `${s.athleteId}:${entry.regattaId}`;
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return {
      entriesFor: (athleteId: string, regattaId: string) =>
        map.get(`${athleteId}:${regattaId}`) ?? [],
      eventsById: new Map<string, RegattaEvent>(season.events.map((e) => [e.id, e])),
    };
  }, [season.entries, season.seats, season.events]);

  const problemsFor = (athleteId: string, col: SeasonColumn): SeatProblem[] =>
    seatProblems(col.byAthlete.get(athleteId), entriesFor(athleteId, col.regatta.id), eventsById);

  const write = (ops: BatchOp[], label: string, regatta: Regatta) =>
    finalEdit.guard(
      async () => {
        for (const part of chunk(ops, BATCH_LIMIT)) await batch.mutateAsync(part);
      },
      label,
      regatta,
    );

  const change = (athlete: Athlete, col: SeasonColumn, next: AvailabilityDraft) => {
    const op = planWrite(col.byAthlete.get(athlete.id), next, {
      regattaId: col.regatta.id,
      athleteId: athlete.id,
      regattaDays: col.days,
    });
    if (op) void write([op], 'Change availability', col.regatta).catch(() => {});
  };

  const toggle = (athlete: Athlete, col: SeasonColumn) =>
    change(athlete, col, toggledDraft(col.byAthlete.get(athlete.id), col.days));

  if (season.error) {
    return (
      <ErrorState
        title="Availability did not load."
        error={season.error}
        onRetry={season.refetch}
      />
    );
  }
  if (season.isPending) return <SkeletonRows rows={8} />;

  const addMenu = canAddRegatta && addable.length > 0 && (
    <AddToRegattaMenu team={team} regattas={addable} finalEdit={finalEdit} />
  );

  if (roster.length === 0) {
    return (
      <EmptyState
        title={`No active athletes on ${team.name}`}
        description="Add athletes on the roster tab. Their availability for each regatta shows here."
        action={
          <Button asChild>
            <Link to={`/teams/${team.id}`}>Open the roster</Link>
          </Button>
        }
      />
    );
  }
  if (columns.length === 0 && pastCount === 0) {
    return (
      <>
        <EmptyState
          title={`${team.name} is not entered in any regattas yet`}
          description="Add the team to a regatta, here or on the regatta's overview. Each regatta becomes a column with everyone checked as coming."
          action={
            addMenu || (
              <Button asChild>
                <Link to="/">Go to regattas</Link>
              </Button>
            )
          }
        />
        {finalEdit.dialog}
      </>
    );
  }

  const openAthlete = roster.find((a) => a.id === openId) ?? null;
  const dialogColumn = dialog ? columns.find((c) => c.regatta.id === dialog.regattaId) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-base leading-prose text-ink-2">
          Everyone is coming unless you uncheck them. Pick a name for days, maybes, and reasons.
        </p>
        {pastCount > 0 && (
          <Button
            size="sm"
            aria-pressed={showPast}
            onClick={() => setShowPast(!showPast)}
            className={cn(showPast && 'border-accent bg-accent-tint hover:bg-accent-tint')}
          >
            {showPast && <Check aria-hidden />}
            Show past regattas ({pastCount})
          </Button>
        )}
        {addMenu}
      </div>

      {columns.length === 0 ? (
        <EmptyState
          title="No upcoming regattas"
          description={`${team.name} is not entered in any regatta that is still ahead. Show past regattas to see earlier ones, or add the team to an upcoming one.`}
          action={
            <Button onClick={() => setShowPast(true)}>Show past regattas ({pastCount})</Button>
          }
        />
      ) : (
        <SheetGrid
          team={team}
          roster={roster}
          columns={columns}
          canEdit={canEdit}
          problemsFor={problemsFor}
          onToggle={toggle}
          onOpenAthlete={setOpenId}
          onColumnAction={(kind, regatta) => setDialog({ kind, regattaId: regatta.id })}
        />
      )}

      <AthleteSeasonSheet
        athlete={openAthlete}
        team={team}
        columns={columns}
        canEdit={canEdit}
        problemsFor={problemsFor}
        onChange={change}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
      {canEdit && dialogColumn && (
        <>
          <MarkAllAvailableDialog
            open={dialog?.kind === 'clear'}
            onOpenChange={(o) => !o && setDialog(null)}
            athletes={roster}
            byAthlete={dialogColumn.byAthlete}
            scopeLabel={`${team.name} for ${dialogColumn.regatta.name}`}
            onConfirm={(ops) => write(ops, 'Mark all available', dialogColumn.regatta)}
          />
          <AbsenceImportDialog
            open={dialog?.kind === 'absence'}
            onOpenChange={(o) => !o && setDialog(null)}
            regatta={dialogColumn.regatta}
            teams={[team]}
            athletes={roster}
            byAthlete={dialogColumn.byAthlete}
            defaultTeamId={team.id}
            onConfirm={(ops) => write(ops, 'Import availability', dialogColumn.regatta)}
          />
        </>
      )}
      {finalEdit.dialog}
    </div>
  );
}

function AddToRegattaMenu({
  team,
  regattas,
  finalEdit,
}: {
  team: Team;
  regattas: Regatta[];
  finalEdit: ReturnType<typeof useConfirmFinalEdit>;
}) {
  const create = useCreate('regatta_teams', {
    errorMessage: 'The team was not added. Try again.',
  });
  const add = (regatta: Regatta) =>
    void finalEdit.guard(
      async () => {
        try {
          await create.mutateAsync({ regattaId: regatta.id, teamId: team.id });
          toast.success(`${team.name} added to ${regatta.name}`);
        } catch {
          // Toast from the mutation.
        }
      },
      'Add team',
      regatta,
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          Add to a regatta
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {regattas.map((r) => (
          <DropdownMenuItem key={r.id} onSelect={() => add(r)}>
            <span className="truncate">{r.name}</span>
            <span className="ml-auto pl-3 text-sm text-ink-2 tabular-nums">
              {formatDayRange(r.startDate, r.endDate, false)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Row =
  { kind: 'level'; level: AthleteLevel; count: number } | { kind: 'athlete'; athlete: Athlete };

/** Level headings when the roster has both levels, as on the lineups roster. */
function rowsOf(roster: Athlete[]): Row[] {
  const levels: AthleteLevel[] = ['experienced', 'novice'];
  const groups = levels.map((level) => ({
    level,
    athletes: roster.filter((a) => a.level === level),
  }));
  if (groups.filter((g) => g.athletes.length > 0).length < 2) {
    return roster.map((athlete) => ({ kind: 'athlete', athlete }));
  }
  return groups.flatMap((g) =>
    g.athletes.length === 0
      ? []
      : [
          { kind: 'level' as const, level: g.level, count: g.athletes.length },
          ...g.athletes.map((athlete) => ({ kind: 'athlete' as const, athlete })),
        ],
  );
}

function SheetGrid({
  team,
  roster,
  columns,
  canEdit,
  problemsFor,
  onToggle,
  onOpenAthlete,
  onColumnAction,
}: {
  team: Team;
  roster: Athlete[];
  columns: ColumnData[];
  canEdit: boolean;
  problemsFor: (athleteId: string, col: SeasonColumn) => SeatProblem[];
  onToggle: (athlete: Athlete, col: SeasonColumn) => void;
  onOpenAthlete: (athleteId: string) => void;
  onColumnAction: (kind: 'clear' | 'absence', regatta: Regatta) => void;
}) {
  const rows = rowsOf(roster);
  const athleteRows = rows.filter(
    (r): r is Extract<Row, { kind: 'athlete' }> => r.kind === 'athlete',
  );
  // The one cell in the tab order: row index among athletes, column 0 is the name.
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const tableRef = useRef<HTMLTableElement>(null);
  const [fr, fc] = [Math.min(focus[0], athleteRows.length - 1), Math.min(focus[1], columns.length)];

  const moveTo = (r: number, c: number) => {
    const row = Math.max(0, Math.min(r, athleteRows.length - 1));
    const col = Math.max(0, Math.min(c, columns.length));
    setFocus([row, col]);
    tableRef.current?.querySelector<HTMLElement>(`[data-cell="${row}:${col}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const target = e.target as HTMLElement;
    const cell = target.dataset.cell;
    if (!cell) return;
    const [r, c] = cell.split(':').map(Number) as [number, number];
    const moves: Record<string, [number, number]> = {
      ArrowUp: [r - 1, c],
      ArrowDown: [r + 1, c],
      ArrowLeft: [r, c - 1],
      ArrowRight: [r, c + 1],
      Home: e.ctrlKey ? [0, 0] : [r, 0],
      End: e.ctrlKey ? [athleteRows.length - 1, columns.length] : [r, columns.length],
      PageUp: [r - 10, c],
      PageDown: [r + 10, c],
    };
    const next = moves[e.key];
    if (!next) return;
    e.preventDefault();
    moveTo(...next);
  };

  let athleteIndex = -1;
  return (
    <ScrollRegion
      label={`${team.name} availability`}
      className="max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto rounded-card border border-line bg-surface"
    >
      <table
        ref={tableRef}
        onKeyDown={onKeyDown}
        aria-label={`${team.name} availability by regatta`}
        aria-describedby="availability-grid-help"
        className="w-max min-w-full border-separate border-spacing-0 text-base"
      >
        <caption id="availability-grid-help" className="sr-only">
          Arrow keys move between cells. Space marks an athlete coming or not coming.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky top-0 left-0 z-30 border-r border-b border-line bg-surface px-3 py-2 text-left align-bottom text-sm font-medium text-ink-2"
            >
              Athlete
            </th>
            {columns.map((col) => (
              <ColumnHeader
                key={col.regatta.id}
                team={team}
                col={col}
                roster={roster}
                canEdit={canEdit}
                onAction={onColumnAction}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            if (row.kind === 'level') {
              return (
                <tr key={`level:${row.level}`}>
                  <th
                    scope="colgroup"
                    colSpan={columns.length + 1}
                    className="border-b border-line bg-surface-2 px-3 py-1 text-left text-sm font-medium text-ink-2"
                  >
                    <span className="sticky left-3">
                      {LEVEL_LABELS[row.level]} <span className="tabular-nums">{row.count}</span>
                    </span>
                  </th>
                </tr>
              );
            }
            athleteIndex++;
            const r = athleteIndex;
            const a = row.athlete;
            const name = athleteName(a);
            return (
              <tr key={a.id} className="group">
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-b border-line bg-surface p-0 text-left font-normal group-hover:bg-surface-2"
                >
                  <button
                    type="button"
                    data-cell={`${r}:0`}
                    tabIndex={fr === r && fc === 0 ? 0 : -1}
                    onFocus={() => setFocus([r, 0])}
                    onClick={() => onOpenAthlete(a.id)}
                    aria-label={`${name}: open availability by regatta`}
                    className="flex min-h-10 w-40 items-center gap-2 px-3 text-left hover:underline sm:w-52 pointer-coarse:min-h-11"
                  >
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <SideBadge side={a.side} canScull={a.canScull} />
                  </button>
                </th>
                {columns.map((col, i) => (
                  <Cell
                    key={col.regatta.id}
                    athlete={a}
                    col={col}
                    cellId={`${r}:${i + 1}`}
                    tabbable={fr === r && fc === i + 1}
                    canEdit={canEdit}
                    problems={problemsFor(a.id, col)}
                    onFocus={() => setFocus([r, i + 1])}
                    onToggle={() => onToggle(a, col)}
                  />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function ColumnHeader({
  team,
  col,
  roster,
  canEdit,
  onAction,
}: {
  team: Team;
  col: ColumnData;
  roster: Athlete[];
  canEdit: boolean;
  onAction: (kind: 'clear' | 'absence', regatta: Regatta) => void;
}) {
  const navigate = useNavigate();
  const { regatta, days, byAthlete } = col;
  const counts = countAvailability(roster, byAthlete, days);
  const dates = formatDayRange(regatta.startDate, regatta.endDate, false);
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-20 w-28 border-b border-line bg-surface p-1 align-bottom font-normal',
        col.past && 'bg-surface-2',
      )}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${regatta.name}, ${dates}, ${counts.available} of ${counts.total} coming. Options`}
            className="flex w-28 flex-col items-center gap-0.5 rounded-control px-1 py-1.5 text-center hover:bg-surface-2"
          >
            <span className="line-clamp-2 text-sm leading-tight font-medium text-ink">
              {regatta.name}
            </span>
            <span className="text-sm text-ink-2 tabular-nums">{dates}</span>
            <span className="inline-flex items-center gap-0.5 font-display text-sm font-semibold tabular-nums">
              {counts.available} / {counts.total}
              <ChevronDown aria-hidden className="size-3.5 text-ink-2" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            onSelect={() => void navigate(regattaPath(regatta.id, `lineups/${team.id}`))}
          >
            Open {team.shortName || team.name} lineups
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onAction('clear', regatta)}>
                Mark everyone available
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('absence', regatta)}>
                Import from absence form
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </th>
  );
}

function Cell({
  athlete,
  col,
  cellId,
  tabbable,
  canEdit,
  problems,
  onFocus,
  onToggle,
}: {
  athlete: Athlete;
  col: ColumnData;
  cellId: string;
  tabbable: boolean;
  canEdit: boolean;
  problems: SeatProblem[];
  onFocus: () => void;
  onToggle: () => void;
}) {
  const av = col.byAthlete.get(athlete.id);
  const state = cellState(av, col.days);
  const caption = cellCaption(state, av, col.days);
  const problem =
    problems.length > 0
      ? `Seated in ${problems.map((p) => p.entry.label).join(', ')} on a day they are out`
      : '';
  const label = `${athleteName(athlete)} at ${col.regatta.name}: ${cellStateText(state, av, col.days)}${problem ? `. ${problem}` : ''}`;
  return (
    <td
      className={cn(
        'border-b border-line p-0 text-center group-hover:bg-surface-2',
        col.past && 'bg-surface-2/60',
        state === 'unavailable' && 'bg-danger-tint/50',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={state === 'available' ? true : state === 'unavailable' ? false : 'mixed'}
        aria-readonly={!canEdit || undefined}
        aria-label={label}
        title={[caption, problem].filter(Boolean).join('. ') || undefined}
        data-cell={cellId}
        tabIndex={tabbable ? 0 : -1}
        onFocus={onFocus}
        onClick={canEdit ? onToggle : undefined}
        className={cn(
          'flex min-h-10 w-full flex-col items-center justify-center gap-0.5 px-1 py-1 pointer-coarse:min-h-11',
          canEdit ? 'cursor-pointer' : 'cursor-default',
        )}
      >
        <span className="flex items-center gap-1">
          <CellBox state={state} />
          {problem && <ConflictIcon severity="error" />}
        </span>
        {caption && (
          <span
            className={cn(
              'max-w-24 truncate text-xs leading-tight',
              state === 'maybe' ? 'text-warn' : 'text-ink-2',
            )}
          >
            {caption}
          </span>
        )}
      </button>
    </td>
  );
}

function CellBox({ state }: { state: CellState }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 items-center justify-center rounded-control border text-sm font-semibold',
        state === 'available' && 'border-accent bg-accent text-accent-ink',
        state === 'partial' && 'border-accent bg-accent-tint text-ink',
        state === 'maybe' && 'border-warn bg-warn-tint text-warn',
        state === 'unavailable' && 'border-line-strong bg-surface',
      )}
    >
      {state === 'available' && <Check className="size-3.5" strokeWidth={3} />}
      {state === 'partial' && <Minus className="size-3.5" strokeWidth={3} />}
      {state === 'maybe' && '?'}
    </span>
  );
}
