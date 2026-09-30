// Availability (PLAN.md §4.2, §6.5): every athlete on the participating teams with a status
// (available, maybe, unavailable), per-day toggles for multi-day regattas, a reason, and counts
// per team. Absence of a record means available; records exist only while needed. An athlete
// who is unavailable but seated in an entry shows a link to the lineup (an error finding).

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCheck, Copy, FileSpreadsheet, Search, X } from 'lucide-react';
import {
  athleteName,
  isAvailableOn,
  type Athlete,
  type Availability,
  type AvailabilityStatus,
  type Entry,
  type RegattaEvent,
  type Team,
} from '@srt/domain';
import { useBatch, useCan, useRegattaWorkingSet, type BatchOp } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { useRegattaId } from '@/app/params';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';
import { SideBadge, TeamChip } from '@/components/chips';
import { ConflictIcon } from '@/components/ConflictBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/controls';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BATCH_LIMIT, chunk, regattaDays } from '@/features/regattas/duplicate';
import {
  useConfirmFinalEdit,
  type ConfirmFinalEdit,
} from '@/features/regattas/useConfirmFinalEdit';
import {
  countAvailability,
  countText,
  draftOf,
  planWrite,
  statusOn,
  toggleDay,
  withStatus,
  type AvailabilityDraft,
} from './availability-model';
import { AbsenceImportDialog } from './AbsenceImportDialog';
import { CopyAvailabilityDialog } from './CopyAvailabilityDialog';
import { MarkAllAvailableDialog } from './MarkAllAvailableDialog';

const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'unavailable', label: 'Unavailable' },
];

const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: 'Available',
  maybe: 'Maybe',
  unavailable: 'Unavailable',
};

export interface SeatProblem {
  entry: Entry;
  event: RegattaEvent | null;
}

/** Entries where the athlete is seated on a day they are not available. */
export function seatProblems(
  athleteId: string,
  av: Availability | undefined,
  seatsByAthlete: ReadonlyMap<string, Entry[]>,
  events: ReadonlyMap<string, RegattaEvent>,
): SeatProblem[] {
  if (!av) return [];
  return (seatsByAthlete.get(athleteId) ?? [])
    .map((entry) => ({ entry, event: entry.eventId ? (events.get(entry.eventId) ?? null) : null }))
    .filter(({ event }) => !isAvailableOn(av, event?.day));
}

function ReasonInput({
  athlete,
  value,
  disabled,
  onSave,
}: {
  athlete: Athlete;
  value: string;
  disabled: boolean;
  onSave: (reason: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(value);
  // Follow changes made elsewhere (another coach, a bulk action) while not being edited.
  if (value !== base) {
    setBase(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };
  return (
    <Input
      value={draft}
      disabled={disabled}
      placeholder="Reason (optional)"
      aria-label={`Reason for ${athleteName(athlete)}`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(value);
        }
      }}
      className="h-8 text-sm pointer-coarse:h-11"
    />
  );
}

function DayToggles({
  athlete,
  draft,
  days,
  canEdit,
  onToggle,
}: {
  athlete: Athlete;
  draft: AvailabilityDraft;
  days: string[];
  canEdit: boolean;
  onToggle: (day: string) => void;
}) {
  return (
    <div
      className="flex flex-wrap gap-1"
      role="group"
      aria-label={`Days for ${athleteName(athlete)}`}
    >
      {days.map((day) => {
        const s = statusOn(draft, day);
        const off = s === 'unavailable';
        const label = formatWeekday(day).split(',')[0]!;
        return (
          <button
            key={day}
            type="button"
            disabled={!canEdit}
            aria-pressed={!off}
            aria-label={`${formatWeekday(day)}: ${STATUS_TEXT[s].toLowerCase()}`}
            title={`${formatWeekday(day)}: ${STATUS_TEXT[s].toLowerCase()}`}
            onClick={() => onToggle(day)}
            className={cn(
              'inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-control border px-1.5 text-sm font-medium tabular-nums disabled:cursor-default pointer-coarse:h-11',
              off
                ? 'border-danger/50 bg-danger-tint text-danger line-through'
                : s === 'maybe'
                  ? 'border-warn/50 bg-warn-tint text-warn'
                  : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
            )}
          >
            {off && <X aria-hidden className="size-3.5" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function AthleteRow({
  athlete,
  record,
  days,
  canEdit,
  problems,
  regattaId,
  teamsById,
  onChange,
}: {
  athlete: Athlete;
  record: Availability | undefined;
  days: string[];
  canEdit: boolean;
  problems: SeatProblem[];
  regattaId: string;
  teamsById: ReadonlyMap<string, Team>;
  onChange: (next: AvailabilityDraft) => void;
}) {
  const draft = draftOf(record);
  const multi = days.length > 1;
  const comingSomeDay = days.some((d) => statusOn(draft, d) !== 'unavailable');
  const showReason =
    !!draft.reason || draft.status !== 'available' || Object.keys(draft.days).length > 0;
  const name = athleteName(athlete);
  return (
    <li className="flex flex-col gap-2 border-b border-line px-3 py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full items-center gap-2 sm:basis-44 sm:shrink-0">
          <span className={cn('truncate font-medium', !comingSomeDay && 'text-ink-2')}>{name}</span>
          <SideBadge side={athlete.side} canScull={athlete.canScull} />
        </div>
        {canEdit ? (
          <SegmentedControl
            size="sm"
            label={`Availability for ${name}`}
            value={draft.status}
            onValueChange={(status) => onChange(withStatus(draft, status, days))}
            options={STATUS_OPTIONS}
          />
        ) : (
          <span className={cn('text-base', draft.status === 'unavailable' && 'text-danger')}>
            {STATUS_TEXT[draft.status]}
          </span>
        )}
        {multi && (
          <DayToggles
            athlete={athlete}
            draft={draft}
            days={days}
            canEdit={canEdit}
            onToggle={(day) => onChange(toggleDay(draft, day, days))}
          />
        )}
        {showReason && (
          <div className="min-w-48 flex-1">
            {canEdit ? (
              <ReasonInput
                athlete={athlete}
                value={draft.reason}
                disabled={false}
                onSave={(reason) => onChange({ ...draft, reason })}
              />
            ) : (
              draft.reason && <span className="text-sm text-ink-2">{draft.reason}</span>
            )}
          </div>
        )}
      </div>
      {problems.length > 0 && (
        <p className="flex items-start gap-1.5 text-sm leading-prose">
          <ConflictIcon severity="error" className="mt-px" />
          <span>
            Unavailable but seated in{' '}
            {problems.map(({ entry, event }, i) => {
              const team = teamsById.get(entry.teamId);
              const text = `${team ? `${team.shortName || team.name} ` : ''}${entry.label}${
                event?.eventNumber ? ` (Event ${event.eventNumber})` : ''
              }`;
              return (
                <span key={entry.id}>
                  {i > 0 && ', '}
                  <Link
                    to={regattaPath(regattaId, `lineups/${entry.teamId}`)}
                    className="text-accent underline-offset-4 hover:underline"
                  >
                    {text}
                  </Link>
                </span>
              );
            })}
            . Take them out of the boat or mark them available.
          </span>
        </p>
      )}
    </li>
  );
}

function TeamSection({
  team,
  roster,
  athletes,
  byAthlete,
  days,
  canEdit,
  problemsFor,
  regattaId,
  teamsById,
  onChange,
}: {
  team: Team;
  /** The whole active roster, for the counts. */
  roster: Athlete[];
  /** The athletes the filters leave in view. */
  athletes: Athlete[];
  byAthlete: ReadonlyMap<string, Availability>;
  days: string[];
  canEdit: boolean;
  problemsFor: (athleteId: string) => SeatProblem[];
  regattaId: string;
  teamsById: ReadonlyMap<string, Team>;
  onChange: (athlete: Athlete, next: AvailabilityDraft) => void;
}) {
  const counts = countAvailability(roster, byAthlete, days);
  return (
    <section aria-labelledby={`avail-${team.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`avail-${team.id}`} className="flex items-center gap-2">
          <TeamChip team={team} />
          <span className="sr-only">, {countText(counts)}</span>
        </h2>
        <p aria-hidden className="font-display text-md font-semibold tabular-nums">
          {counts.available} of {counts.total} available
          {counts.maybe > 0 && (
            <span className="ml-1.5 font-sans text-sm font-normal text-ink-2">
              {counts.maybe} maybe
            </span>
          )}
        </p>
      </div>
      <ul className="rounded-card border border-line bg-surface">
        {athletes.map((a) => (
          <AthleteRow
            key={a.id}
            athlete={a}
            record={byAthlete.get(a.id)}
            days={days}
            canEdit={canEdit}
            problems={problemsFor(a.id)}
            regattaId={regattaId}
            teamsById={teamsById}
            onChange={(next) => onChange(a, next)}
          />
        ))}
      </ul>
    </section>
  );
}

function byName(a: Athlete, b: Athlete) {
  return a.lastName.localeCompare(b.lastName, 'en') || a.firstName.localeCompare(b.firstName, 'en');
}

type BulkDialog = 'clear' | 'copy' | 'absence' | null;

export default function AvailabilityPage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  const canEdit = useCan('availability.edit');
  const batch = useBatch({ errorMessage: 'Availability was not saved. Try again.' });
  const finalEdit: ConfirmFinalEdit = useConfirmFinalEdit(ws.data?.regatta);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'out'>('all');
  const [bulk, setBulk] = useState<BulkDialog>(null);

  const data = ws.data;
  const days = useMemo(() => (data ? regattaDays(data.regatta) : []), [data]);
  const byAthlete = useMemo(
    () => new Map((data?.availability ?? []).map((a) => [a.athleteId, a])),
    [data],
  );
  const seatsByAthlete = useMemo(() => {
    const map = new Map<string, Entry[]>();
    if (!data) return map;
    for (const s of data.seats) {
      if (!s.athleteId) continue;
      const entry = data.byId.entries.get(s.entryId);
      if (!entry || entry.status === 'scratched') continue;
      const list = map.get(s.athleteId) ?? [];
      list.push(entry);
      map.set(s.athleteId, list);
    }
    return map;
  }, [data]);
  const rosters = useMemo(() => {
    if (!data) return [];
    return data.participatingTeams.map((team) => ({
      team,
      athletes: data.athletes
        .filter((a) => a.teamId === team.id && a.status === 'active')
        .sort(byName),
    }));
  }, [data]);

  if (ws.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Availability" />
        <ErrorState title="Availability did not load." error={ws.error} onRetry={ws.refetch} />
      </div>
    );
  }
  if (ws.isLoading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Availability" />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const teamsById = data.byId.teams;
  const problemsFor = (athleteId: string) =>
    seatProblems(athleteId, byAthlete.get(athleteId), seatsByAthlete, data.byId.events);
  const isOut = (a: Athlete) => {
    const av = byAthlete.get(a.id);
    const marked =
      !!av &&
      (av.status !== 'available' || Object.values(av.days ?? {}).some((v) => v !== 'available'));
    return marked || problemsFor(a.id).length > 0;
  };
  const q = query.trim().toLowerCase();
  const filtering = !!q || show === 'out';
  const inScope = rosters.filter((r) => teamFilter === 'all' || r.team.id === teamFilter);
  const shown = inScope
    .map((r) => ({
      ...r,
      visible: r.athletes.filter(
        (a) =>
          (!q || `${athleteName(a)} ${a.firstName} ${a.lastName}`.toLowerCase().includes(q)) &&
          (show === 'all' || isOut(a)),
      ),
    }))
    .filter((r) => r.visible.length > 0 || !filtering);
  const scopeAthletes = inScope.flatMap((r) => r.athletes);
  const outCount = scopeAthletes.filter(isOut).length;

  const write = (ops: BatchOp[], label: string) =>
    finalEdit.guard(async () => {
      for (const part of chunk(ops, BATCH_LIMIT)) await batch.mutateAsync(part);
    }, label);

  const onChange = (athlete: Athlete, next: AvailabilityDraft) => {
    const op = planWrite(byAthlete.get(athlete.id), next, {
      regattaId,
      athleteId: athlete.id,
      regattaDays: days,
    });
    if (op) void write([op], 'Change availability').catch(() => {});
  };

  const scopeLabel =
    teamFilter === 'all' ? 'every team' : (teamsById.get(teamFilter)?.name ?? 'this team');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Availability"
        description="Everyone is available unless you say otherwise."
        actions={
          canEdit &&
          rosters.length > 0 && (
            <>
              <Button onClick={() => setBulk('clear')}>
                <CheckCheck aria-hidden />
                Mark all available
              </Button>
              <Button onClick={() => setBulk('copy')}>
                <Copy aria-hidden />
                Copy from previous regatta
              </Button>
              <Button onClick={() => setBulk('absence')}>
                <FileSpreadsheet aria-hidden />
                Import from absence form
              </Button>
            </>
          )
        }
      >
        {rosters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="Show"
              value={show}
              onValueChange={setShow}
              options={[
                { value: 'all', label: 'Everyone' },
                { value: 'out', label: `Not available (${outCount})` },
              ]}
            />
            {rosters.length > 1 && (
              <Select
                label="Team"
                value={teamFilter}
                onValueChange={setTeamFilter}
                className="w-48"
                options={[
                  { value: 'all', label: 'All teams' },
                  ...rosters.map((r) => ({ value: r.team.id, label: r.team.name })),
                ]}
              />
            )}
            <div className="relative w-full sm:w-64">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-2"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search athletes"
                aria-label="Search athletes"
                className="pl-9"
              />
            </div>
          </div>
        )}
      </PageHeader>

      {rosters.length === 0 ? (
        <EmptyState
          title="No teams in this regatta yet"
          description="Add the teams that are racing on the overview. Their rosters show here."
          action={
            <Button asChild>
              <Link to={regattaPath(regattaId)}>Go to overview</Link>
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        q ? (
          <EmptyState
            title={`No athletes match "${query.trim()}"`}
            description="Check the spelling, or pick another team."
            action={<Button onClick={() => setQuery('')}>Clear the search</Button>}
          />
        ) : (
          <EmptyState
            title="Everyone is available"
            description={`Nobody on ${scopeLabel} is marked unavailable or maybe.`}
            action={<Button onClick={() => setShow('all')}>Show everyone</Button>}
          />
        )
      ) : (
        <div className="flex flex-col gap-8">
          {shown.map(({ team, athletes, visible }) =>
            athletes.length === 0 ? (
              <section key={team.id} className="flex flex-col gap-2">
                <h2>
                  <TeamChip team={team} />
                </h2>
                <EmptyState
                  title={`No active athletes on ${team.name}`}
                  description="Add athletes on the team's roster page."
                  action={
                    <Button asChild>
                      <Link to={`/teams/${team.id}`}>Open the roster</Link>
                    </Button>
                  }
                />
              </section>
            ) : (
              <TeamSection
                key={team.id}
                team={team}
                roster={athletes}
                athletes={visible}
                byAthlete={byAthlete}
                days={days}
                canEdit={canEdit}
                problemsFor={problemsFor}
                regattaId={regattaId}
                teamsById={teamsById}
                onChange={onChange}
              />
            ),
          )}
        </div>
      )}

      {canEdit && (
        <>
          <MarkAllAvailableDialog
            open={bulk === 'clear'}
            onOpenChange={(o) => setBulk(o ? 'clear' : null)}
            athletes={scopeAthletes}
            byAthlete={byAthlete}
            scopeLabel={scopeLabel}
            onConfirm={(ops) => write(ops, 'Mark all available')}
          />
          <CopyAvailabilityDialog
            open={bulk === 'copy'}
            onOpenChange={(o) => setBulk(o ? 'copy' : null)}
            regatta={data.regatta}
            athletes={scopeAthletes}
            byAthlete={byAthlete}
            scopeLabel={scopeLabel}
            onConfirm={(ops) => write(ops, 'Copy availability')}
          />
          <AbsenceImportDialog
            open={bulk === 'absence'}
            onOpenChange={(o) => setBulk(o ? 'absence' : null)}
            regatta={data.regatta}
            teams={rosters.map((r) => r.team)}
            athletes={rosters.flatMap((r) => r.athletes)}
            byAthlete={byAthlete}
            defaultTeamId={teamFilter}
            onConfirm={(ops) => write(ops, 'Import availability')}
          />
        </>
      )}
      {finalEdit.dialog}
    </div>
  );
}
