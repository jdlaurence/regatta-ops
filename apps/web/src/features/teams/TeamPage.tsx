// A team's page (PLAN.md §6.10): team settings and the roster table with inline editing,
// filters, bulk actions, the athlete drawer, CSV import, and export.

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import {
  Check,
  ChevronLeft,
  Download,
  Plus,
  Search,
  Settings2,
  Upload,
  UserPlus,
} from 'lucide-react';
import { athleteName, type Athlete, type Team } from '@srt/domain';
import { batchOp, useBatch, useCan, useList, useRecord, useUpdate, type Patch } from '@/data';
import { TeamDot } from '@/components/chips';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, PageSkeleton, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { downloadText } from '@/components/CsvImport';
import { useSeasonYear, useWeightUnit } from '@/features/settings/hooks';
import { AddAthleteDialog } from './AddAthleteDialog';
import { AthleteSheet } from './AthleteSheet';
import { useMediaQuery } from './hooks';
import { ImportRosterDialog } from './ImportRosterDialog';
import {
  DEFAULT_FILTERS,
  fileSlug,
  filterRoster,
  LEVEL_LABELS,
  PROGRAM_LABELS,
  rosterToCsv,
  type RosterFilters,
  type SideFilter,
} from './lib';
import { RosterTable } from './RosterTable';
import { TeamFormDialog } from './TeamFormDialog';

export default function TeamPage() {
  const { id = '' } = useParams();
  const team = useRecord('teams', id);
  if (team.isError) {
    return (
      <ErrorState
        title="This team did not load."
        error={team.error}
        onRetry={() => void team.refetch()}
      />
    );
  }
  if (team.isPending) return <PageSkeleton />;
  if (!team.data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Team not found" />
        <EmptyState
          title="No team lives at this address"
          description="It may have been removed. Pick a team from the teams list."
          action={
            <Button asChild variant="primary">
              <Link to="/teams">Go to teams</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <TeamRoster team={team.data} />;
}

type DialogName = 'add' | 'import' | 'settings';

function TeamRoster({ team }: { team: Team }) {
  const canEdit = useCan('roster.edit');
  const canManage = useCan('team.manage');
  const unit = useWeightUnit();
  const seasonYear = useSeasonYear();
  const wide = useMediaQuery('(min-width: 768px)');
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });
  const athletes = useList('athletes', { where: { teamId: team.id } });
  const { mutate: updateAthlete } = useUpdate('athletes');
  const batch = useBatch();

  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_FILTERS);
  const [grouped, setGrouped] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogName | null>(null);
  const [moveTo, setMoveTo] = useState<Team | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const roster = useMemo(() => athletes.data ?? [], [athletes.data]);
  const allTeams = useMemo(() => teams.data ?? [], [teams.data]);
  const visible = useMemo(() => filterRoster(roster, filters), [roster, filters]);
  const visibleIds = new Set(visible.map((a) => a.id));
  const picked = roster.filter((a) => selected.includes(a.id) && visibleIds.has(a.id));
  const activeCount = roster.filter((a) => a.status === 'active').length;
  const inactiveCount = roster.length - activeCount;
  const openAthlete = roster.find((a) => a.id === openId) ?? null;
  const filtered =
    filters.search.trim() !== '' ||
    filters.side !== 'all' ||
    filters.level !== 'all' ||
    filters.scullers ||
    filters.coxswains;

  const setFilter = <K extends keyof RosterFilters>(key: K, value: RosterFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const onUpdate = useCallback(
    (a: Athlete, patch: Patch<Athlete>) => {
      updateAthlete({ id: a.id, patch });
      if (patch.status === 'inactive') {
        toast.success(`${athleteName(a)} marked inactive`, {
          action: {
            label: 'Undo',
            onClick: () => updateAthlete({ id: a.id, patch: { status: 'active' } }),
          },
        });
      }
    },
    [updateAthlete],
  );

  const onOpen = useCallback((a: Athlete) => setOpenId(a.id), []);

  const plural = (n: number) => (n === 1 ? '1 athlete' : `${n} athletes`);

  const bulkStatus = (status: Athlete['status']) => {
    const targets = picked.filter((a) => a.status !== status);
    if (targets.length === 0) return;
    batch.mutate(
      targets.map((a) => batchOp.update('athletes', a.id, { status })),
      {
        onSuccess: () =>
          toast.success(`${plural(targets.length)} marked ${status}`, {
            action: {
              label: 'Undo',
              onClick: () =>
                batch.mutate(
                  targets.map((a) => batchOp.update('athletes', a.id, { status: a.status })),
                ),
            },
          }),
      },
    );
    setSelected([]);
  };

  const bulkMove = (to: Team) => {
    const targets = picked;
    if (targets.length === 0) return;
    batch.mutate(
      targets.map((a) => batchOp.update('athletes', a.id, { teamId: to.id })),
      {
        onSuccess: () =>
          toast.success(`${plural(targets.length)} moved to ${to.name}`, {
            action: {
              label: 'Undo',
              onClick: () =>
                batch.mutate(
                  targets.map((a) => batchOp.update('athletes', a.id, { teamId: team.id })),
                ),
            },
          }),
      },
    );
    setSelected([]);
    setMoveTo(null);
  };

  const exportCsv = () => {
    downloadText(`${fileSlug(team.name)}-roster.csv`, rosterToCsv(roster, unit));
    toast.success('Roster exported');
  };

  const clearFilters = () => {
    setFilters((f) => ({ ...DEFAULT_FILTERS, showInactive: f.showInactive }));
    searchRef.current?.focus();
  };

  const error = athletes.error ?? teams.error;
  const description = [
    PROGRAM_LABELS[team.program],
    athletes.data
      ? `${activeCount} active${inactiveCount > 0 ? `, ${inactiveCount} inactive` : ''}`
      : null,
    team.program !== 'other' ? `Age groups for ${seasonYear}` : null,
    team.archived ? 'Archived' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/teams"
        className="-mb-2 inline-flex w-fit items-center gap-1 rounded-control text-sm text-ink-2 hover:text-ink"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Teams
      </Link>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2.5">
            <TeamDot colorKey={team.colorKey} className="size-3.5" />
            {team.name}
          </span>
        }
        description={description}
        actions={
          <>
            <Button onClick={() => setDialog('settings')}>
              <Settings2 aria-hidden />
              Team settings
            </Button>
            <Button onClick={exportCsv} disabled={roster.length === 0}>
              <Download aria-hidden />
              Export CSV
            </Button>
            {canEdit && (
              <>
                <Button onClick={() => setDialog('import')}>
                  <Upload aria-hidden />
                  Import CSV
                </Button>
                <Button variant="primary" onClick={() => setDialog('add')}>
                  <UserPlus aria-hidden />
                  Add athlete
                </Button>
              </>
            )}
          </>
        }
      />

      {error ? (
        <ErrorState
          title="The roster did not load."
          error={error}
          onRetry={() => {
            void athletes.refetch();
            void teams.refetch();
          }}
        />
      ) : athletes.isPending ? (
        <SkeletonRows rows={8} />
      ) : roster.length === 0 ? (
        <EmptyState
          icon={<UserPlus aria-hidden />}
          title="No athletes on this roster yet"
          description={
            canEdit
              ? 'Add athletes one at a time, or import a CSV exported from your roster spreadsheet.'
              : 'Coaches add athletes to rosters. Check back once the roster is set up.'
          }
          action={
            canEdit && (
              <>
                <Button variant="primary" onClick={() => setDialog('add')}>
                  <Plus aria-hidden />
                  Add athlete
                </Button>
                <Button onClick={() => setDialog('import')}>
                  <Upload aria-hidden />
                  Import CSV
                </Button>
              </>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-2"
                aria-hidden
              />
              <Input
                ref={searchRef}
                type="search"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                placeholder="Search names and notes"
                aria-label="Search the roster"
                className="pl-8"
              />
            </div>
            <Select<SideFilter>
              label="Side"
              value={filters.side}
              onValueChange={(v) => setFilter('side', v)}
              options={[
                { value: 'all', label: 'Any side' },
                { value: 'port', label: 'Rows port' },
                { value: 'starboard', label: 'Rows starboard' },
                { value: 'both', label: 'Rows both' },
                { value: 'none', label: 'No side' },
              ]}
              className="w-[calc(50%-4px)] sm:w-36"
            />
            <Select<RosterFilters['level']>
              label="Level"
              value={filters.level}
              onValueChange={(v) => setFilter('level', v)}
              options={[
                { value: 'all', label: 'All levels' },
                { value: 'experienced', label: LEVEL_LABELS.experienced },
                { value: 'novice', label: LEVEL_LABELS.novice },
              ]}
              className="w-[calc(50%-4px)] sm:w-32"
            />
            <ToggleButton
              pressed={filters.scullers}
              onPressedChange={(v) => setFilter('scullers', v)}
            >
              Scullers
            </ToggleButton>
            <ToggleButton
              pressed={filters.coxswains}
              onPressedChange={(v) => setFilter('coxswains', v)}
            >
              Coxswains
            </ToggleButton>
            {inactiveCount > 0 && (
              <ToggleButton
                pressed={filters.showInactive}
                onPressedChange={(v) => setFilter('showInactive', v)}
              >
                Show inactive ({inactiveCount})
              </ToggleButton>
            )}
            <ToggleButton pressed={grouped} onPressedChange={setGrouped}>
              Group by level
            </ToggleButton>
            {filtered && (
              <p className="text-sm text-ink-2 tabular-nums" aria-live="polite">
                {visible.length} of {filters.showInactive ? roster.length : activeCount} shown
              </p>
            )}
          </div>

          {canEdit && picked.length > 0 && (
            <BulkBar
              count={picked.length}
              anyActive={picked.some((a) => a.status === 'active')}
              anyInactive={picked.some((a) => a.status === 'inactive')}
              teams={allTeams.filter((t) => t.id !== team.id && !t.archived)}
              onStatus={bulkStatus}
              onMove={setMoveTo}
              moving={!!moveTo}
              onClear={() => setSelected([])}
            />
          )}

          <RosterTable
            athletes={visible}
            program={team.program}
            canEdit={canEdit}
            unit={unit}
            seasonYear={seasonYear}
            compact={!wide}
            grouped={grouped}
            selectedIds={picked.map((a) => a.id)}
            onSelectionChange={setSelected}
            activeId={openId}
            onOpen={onOpen}
            onUpdate={onUpdate}
            empty={
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-ink-2">No athletes match these filters.</p>
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            }
          />
        </>
      )}

      <AthleteSheet
        athlete={openAthlete}
        team={team}
        teams={allTeams}
        canEdit={canEdit}
        unit={unit}
        seasonYear={seasonYear}
        onOpenChange={(open) => !open && setOpenId(null)}
      />
      <AddAthleteDialog
        open={dialog === 'add'}
        onOpenChange={(open) => setDialog(open ? 'add' : null)}
        team={team}
        unit={unit}
        seasonYear={seasonYear}
      />
      <ImportRosterDialog
        open={dialog === 'import'}
        onOpenChange={(open) => setDialog(open ? 'import' : null)}
        team={team}
        roster={roster}
        defaultUnit={unit}
        seasonYear={seasonYear}
      />
      <TeamFormDialog
        open={dialog === 'settings'}
        onOpenChange={(open) => setDialog(open ? 'settings' : null)}
        team={team}
        teams={allTeams}
        readOnly={!canManage}
      />
      <Dialog open={!!moveTo} onOpenChange={(open) => !open && setMoveTo(null)}>
        {moveTo && (
          <DialogContent
            title={`Move ${plural(picked.length)} to ${moveTo.name}?`}
            description={`They leave the ${team.name} roster and join ${moveTo.name}. Entries they are already in stay as they are.`}
          >
            <DialogFooter>
              <Button onClick={() => setMoveTo(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => bulkMove(moveTo)}>
                Move {plural(picked.length)}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function ToggleButton({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(pressed && 'border-accent bg-accent-tint hover:bg-accent-tint')}
    >
      {pressed && <Check aria-hidden />}
      {children}
    </Button>
  );
}

function BulkBar({
  count,
  anyActive,
  anyInactive,
  teams,
  onStatus,
  onMove,
  moving,
  onClear,
}: {
  count: number;
  anyActive: boolean;
  anyInactive: boolean;
  teams: Team[];
  onStatus: (status: Athlete['status']) => void;
  onMove: (team: Team) => void;
  /** The move confirmation is open; closing it resets the picker. */
  moving: boolean;
  onClear: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Selected athletes"
      className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-card border border-accent bg-accent-tint px-3 py-2"
    >
      <span className="mr-1 font-medium tabular-nums">{count} selected</span>
      {anyActive && (
        <Button size="sm" onClick={() => onStatus('inactive')}>
          Mark inactive
        </Button>
      )}
      {anyInactive && (
        <Button size="sm" onClick={() => onStatus('active')}>
          Mark active
        </Button>
      )}
      {teams.length > 0 && (
        <Select
          key={moving ? 'moving' : 'idle'}
          label="Move to team"
          placeholder="Move to team…"
          value=""
          onValueChange={(id) => {
            const t = teams.find((x) => x.id === id);
            if (t) onMove(t);
          }}
          options={teams.map((t) => ({ value: t.id, label: t.name }))}
          className="h-8 w-44 text-sm"
        />
      )}
      <Button size="sm" variant="ghost" onClick={onClear} className="ml-auto">
        Clear selection
      </Button>
    </div>
  );
}
