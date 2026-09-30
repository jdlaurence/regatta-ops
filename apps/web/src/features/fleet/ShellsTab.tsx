// Shells: the club's equipment list as a dense, filterable table with inline edits for the
// fields that change often (status, home team, location, level), a grouped view that reads like
// the club's list (gender affinity, then class), CSV import and export, and the shell drawer.
// Phones get stacked cards instead of the table (PLAN.md §5.3).

import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Download, Plus, Upload } from 'lucide-react';
import {
  shellFullLabel,
  shellLabel,
  type BoatClass,
  type EquipmentStatus,
  type Shell,
  type Team,
} from '@srt/domain';
import { useCan, useList, useUpdate } from '@/data';
import { ClassBadge, ShellChip, TeamChip } from '@/components/chips';
import { CsvImportDialog, downloadText } from '@/components/CsvImport';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { SegmentedControl, Switch } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import type { SelectOption } from '@/components/ui/select';
import { checkShellRows, SHELL_CSV_FIELDS, shellsToCsv, type ShellInput } from './csv';
import { useClubToday, useFleetTeams, useWideLayout } from './hooks';
import { useImportRecords } from './import';
import {
  activeFilterCount,
  AFFINITY_LABELS,
  AFFINITY_ORDER,
  CLASS_ORDER,
  countText,
  DEFAULT_SHELL_FILTERS,
  EQUIPMENT_STATUSES,
  exportFileName,
  filterShells,
  LEVEL_LABELS,
  RIGGING_LABELS,
  SHELL_LEVELS,
  shellGroup,
  sortShells,
  STATUS_LABELS,
  STROKE_SIDE_LABELS,
  distinctLocations,
  type ShellFilters,
  type ShellLevel,
} from './lib';
import {
  FilterPanel,
  FilterSelect,
  InlineSelect,
  InlineText,
  SearchInput,
  STATUS_OPTIONS,
  StatusLabel,
} from './parts';
import { ShellThumb } from './ShellPhoto';
import { ShellSheet } from './ShellSheet';

const NO_TEAM = 'none';

/** The status column says it already; keep the chip to the name. */
const chipShell = (s: Shell) => ({ ...s, status: 'in_service' as const });

export function ShellsTab({ nav }: { nav: ReactNode }) {
  const shells = useList('shells');
  const { teams, byId } = useFleetTeams();
  const canEdit = useCan('fleet.edit');
  const wide = useWideLayout();
  const today = useClubToday();
  const update = useUpdate('shells');
  const importRecords = useImportRecords('shells');

  const [filters, setFilters] = useState<ShellFilters>(DEFAULT_SHELL_FILTERS);
  const [grouped, setGrouped] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const openId = params.get('shell');

  const all = useMemo(() => sortShells(shells.data ?? []), [shells.data]);
  const rows = useMemo(() => filterShells(all, filters), [all, filters]);
  const locations = useMemo(() => distinctLocations(all), [all]);
  const retiredCount = all.filter((s) => s.status === 'retired').length;
  const set = <K extends keyof ShellFilters>(k: K, v: ShellFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const openShell = (id: string | null) => {
    setCreating(false);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set('shell', id);
        else next.delete('shell');
        return next;
      },
      { replace: !!openId && !!id },
    );
  };

  const save = (shell: Shell, patch: Partial<Shell>) => update.mutate({ id: shell.id, patch });

  const exportRows = () => {
    downloadText(exportFileName('shells', today), shellsToCsv(rows, teams));
    toast.success(`${rows.length} ${rows.length === 1 ? 'shell' : 'shells'} exported`);
  };

  // The photo column shows once any shell has a photo (PLAN.md §4.7, Phase 3).
  const withPhotos = useMemo(() => all.some((s) => !!s.photoUrl), [all]);
  const columns = useShellColumns({
    canEdit,
    byId,
    teams,
    save,
    onOpen: openShell,
    withPhotos,
  });

  const actions = (
    <>
      <Button onClick={exportRows} disabled={!shells.data || rows.length === 0}>
        <Download aria-hidden />
        Export CSV
      </Button>
      {canEdit && (
        <>
          <Button onClick={() => setImportOpen(true)}>
            <Upload aria-hidden />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            Add shell
          </Button>
        </>
      )}
    </>
  );

  let body: ReactNode;
  if (shells.isError) {
    body = (
      <ErrorState
        title="The shells did not load."
        error={shells.error}
        onRetry={() => void shells.refetch()}
      />
    );
  } else if (shells.isPending) {
    body = <SkeletonRows rows={10} />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        title="No shells yet"
        description="Add a shell, or import the club's equipment list from a CSV file."
        action={canEdit ? actions : undefined}
      />
    );
  } else {
    const filteredEmpty = (
      <EmptyState
        title="No shells match these filters"
        description="Clear the filters or search for another name."
        action={<Button onClick={() => setFilters(DEFAULT_SHELL_FILTERS)}>Clear filters</Button>}
        className="border-none"
      />
    );
    body = (
      <>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <SearchInput
              value={filters.search}
              onChange={(v) => set('search', v)}
              label="Search shells"
              placeholder="Search name, model, or serial"
            />
            <SegmentedControl
              label="View"
              value={grouped ? 'grouped' : 'list'}
              onValueChange={(v) => setGrouped(v === 'grouped')}
              options={[
                { value: 'list', label: 'List' },
                { value: 'grouped', label: 'Grouped' },
              ]}
            />
            {(retiredCount > 0 || filters.showRetired) && (
              <div className="flex items-center gap-2">
                <Switch
                  id="show-retired-shells"
                  checked={filters.showRetired}
                  onCheckedChange={(v) => set('showRetired', v)}
                />
                <Label htmlFor="show-retired-shells" className="font-normal">
                  Show retired ({retiredCount})
                </Label>
              </div>
            )}
          </div>
          <FilterPanel
            wide={wide}
            activeCount={activeFilterCount(filters, DEFAULT_SHELL_FILTERS)}
            onClear={() => setFilters((f) => ({ ...DEFAULT_SHELL_FILTERS, search: f.search }))}
          >
            <FilterSelect<BoatClass>
              label="Class"
              value={filters.boatClass}
              onChange={(v) => set('boatClass', v)}
              allLabel="All classes"
              options={CLASS_ORDER.map((c) => ({ value: c, label: c }))}
            />
            <FilterSelect<string>
              label="Home team"
              value={filters.teamId}
              onChange={(v) => set('teamId', v)}
              allLabel="All teams"
              options={[
                ...teams.map((t) => ({ value: t.id, label: t.name })),
                { value: NO_TEAM, label: 'No home team' },
              ]}
            />
            <FilterSelect<EquipmentStatus>
              label="Status"
              value={filters.status}
              onChange={(v) => set('status', v)}
              allLabel="Any status"
              options={EQUIPMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
            <FilterSelect<string>
              label="Location"
              value={filters.location}
              onChange={(v) => set('location', v)}
              allLabel="All locations"
              options={locations.map((l) => ({ value: l, label: l }))}
            />
            <FilterSelect
              label="Gender affinity"
              value={filters.genderAffinity}
              onChange={(v) => set('genderAffinity', v)}
              allLabel="All"
              options={AFFINITY_ORDER.map((a) => ({ value: a, label: AFFINITY_LABELS[a] }))}
            />
            <FilterSelect<ShellLevel>
              label="Level"
              value={filters.level}
              onChange={(v) => set('level', v)}
              allLabel="All levels"
              options={SHELL_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
            />
          </FilterPanel>
        </div>
        <p className="text-sm text-ink-2" aria-live="polite">
          {countText(
            rows.length,
            all.length,
            'shells',
            !filters.showRetired && filters.status !== 'retired' ? retiredCount : 0,
          )}
        </p>
        {wide ? (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(s) => s.id}
            label="Shells"
            onRowClick={(s) => openShell(s.id)}
            activeRowId={openId}
            isMuted={(s) => s.status === 'retired'}
            groupBy={grouped ? shellGroup : undefined}
            empty={filteredEmpty}
          />
        ) : rows.length === 0 ? (
          filteredEmpty
        ) : (
          <ShellCards rows={rows} byId={byId} grouped={grouped} onOpen={openShell} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fleet"
        description="Shells, oar sets, and gear the club races and trailers."
        actions={all.length > 0 || !canEdit ? actions : undefined}
      >
        {nav}
      </PageHeader>
      {body}
      <datalist id="fleet-shell-locations">
        {locations.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <ShellSheet
        open={creating || !!openId}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            if (openId) openShell(null);
          }
        }}
        shellId={creating ? null : openId}
        locations={locations}
        onCreated={(id) => openShell(id)}
      />
      <CsvImportDialog<ShellInput>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import shells"
        noun={['shell', 'shells']}
        fields={SHELL_CSV_FIELDS}
        previewFields={['name', 'nickname', 'boatClass', 'location']}
        check={(csvRows) =>
          checkShellRows(csvRows, { teams, existingNames: all.map((s) => s.name) })
        }
        onImport={importRecords}
        hint="Columns named like the export, or like the club's equipment list (name, boat_class, weight_class_lb, location, ...), are matched for you."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function useShellColumns({
  canEdit,
  byId,
  teams,
  save,
  onOpen,
  withPhotos,
}: {
  canEdit: boolean;
  byId: Map<string, Team>;
  teams: Team[];
  save: (shell: Shell, patch: Partial<Shell>) => void;
  onOpen: (id: string) => void;
  withPhotos: boolean;
}): ColumnDef<Shell, unknown>[] {
  return useMemo(() => {
    const teamName = (id?: string | null) => (id ? (byId.get(id)?.name ?? '') : '');
    const teamSelectOptions: SelectOption<string>[] = [
      { value: NO_TEAM, label: <span className="text-ink-2">No home team</span> },
      ...teams
        .filter((t) => !t.archived)
        .map((t) => ({ value: t.id, label: <TeamChip team={t} short size="sm" /> })),
    ];
    const cols: ColumnDef<Shell, unknown>[] = [
      {
        id: 'name',
        header: 'Shell',
        accessorFn: (s) => shellLabel(s),
        sortingFn: (a, b) =>
          shellLabel(a.original).localeCompare(shellLabel(b.original), undefined, {
            numeric: true,
            sensitivity: 'base',
          }),
        meta: { className: 'min-w-52 py-1' },
        cell: ({ row }) => {
          const s = row.original;
          const team = s.homeTeamId ? byId.get(s.homeTeamId) : undefined;
          const full = s.nickname && s.nickname !== s.name ? s.name : null;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(s.id);
              }}
              aria-label={`Open ${shellFullLabel(s)}`}
              className="-mx-1 flex max-w-full items-center gap-2 rounded-boat px-1 text-left"
            >
              <ShellChip shell={chipShell(s)} teamColor={team?.colorKey} showClass={false} />
              {full && <span className="truncate text-sm text-ink-2">{full}</span>}
            </button>
          );
        },
      },
      {
        id: 'class',
        header: 'Class',
        accessorFn: (s) => CLASS_ORDER.indexOf(s.boatClass),
        cell: ({ row }) => {
          const s = row.original;
          const others = s.compatibleClasses.filter((c) => c !== s.boatClass);
          return (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <ClassBadge boatClass={s.boatClass} />
              {others.length > 0 && (
                <span className="text-sm text-ink-2">also {others.join(', ')}</span>
              )}
            </span>
          );
        },
      },
      {
        // Rigging and stroke side read together, as the club's sheet writes them.
        id: 'rigging',
        header: 'Rigging',
        accessorFn: (s) =>
          [RIGGING_LABELS[s.rigging], s.strokeSide ? STROKE_SIDE_LABELS[s.strokeSide] : null]
            .filter(Boolean)
            .join(', ')
            .replace(/, (P|S)/, (m) => m.toLowerCase()),
        meta: { className: 'whitespace-nowrap' },
      },
      {
        id: 'weightClass',
        header: 'Weight class',
        accessorFn: (s) => s.weightClassLabel ?? '',
        meta: { className: 'tabular-nums whitespace-nowrap' },
      },
      {
        id: 'level',
        header: 'Level',
        accessorFn: (s) => (s.level ? SHELL_LEVELS.indexOf(s.level) : -1),
        cell: ({ row }) => (row.original.level ? LEVEL_LABELS[row.original.level] : ''),
      },
      {
        id: 'affinity',
        header: 'Gender affinity',
        accessorFn: (s) => AFFINITY_ORDER.indexOf(s.genderAffinity),
        cell: ({ row }) => AFFINITY_LABELS[row.original.genderAffinity],
      },
      {
        id: 'team',
        header: 'Home team',
        accessorFn: (s) => teamName(s.homeTeamId),
        meta: { className: 'min-w-36' },
        cell: ({ row }) => {
          const s = row.original;
          const team = s.homeTeamId ? byId.get(s.homeTeamId) : undefined;
          if (!canEdit) return team ? <TeamChip team={team} short size="sm" /> : null;
          return (
            <InlineSelect
              value={s.homeTeamId ?? NO_TEAM}
              options={teamSelectOptions}
              label={`Home team of ${shellLabel(s)}`}
              onChange={(v) => save(s, { homeTeamId: v === NO_TEAM ? null : v })}
            />
          );
        },
      },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (s) => s.location ?? '',
        sortingFn: 'alphanumeric',
        meta: { className: 'min-w-36' },
        cell: ({ row }) => {
          const s = row.original;
          if (!canEdit) return s.location;
          return (
            <InlineText
              value={s.location ?? ''}
              label={`Location of ${shellLabel(s)}`}
              listId="fleet-shell-locations"
              onCommit={(v) => save(s, { location: v })}
            />
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s) => EQUIPMENT_STATUSES.indexOf(s.status),
        meta: { className: 'min-w-40' },
        cell: ({ row }) => {
          const s = row.original;
          if (!canEdit) return <StatusLabel status={s.status} />;
          return (
            <InlineSelect
              value={s.status}
              options={STATUS_OPTIONS}
              label={`Status of ${shellLabel(s)}`}
              onChange={(v) => save(s, { status: v })}
            />
          );
        },
      },
      {
        id: 'year',
        header: 'Year',
        accessorFn: (s) => s.year ?? null,
        sortUndefined: 'last',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => row.original.year ?? '',
      },
      {
        id: 'model',
        header: 'Model',
        accessorFn: (s) => s.model ?? '',
        meta: { className: 'whitespace-nowrap text-ink-2' },
      },
    ];
    if (withPhotos) {
      cols.unshift({
        id: 'photo',
        header: () => <span className="sr-only">Photo</span>,
        enableSorting: false,
        size: 48,
        meta: { className: 'py-1 pr-0', headerClassName: 'pr-0' },
        cell: ({ row }) => <ShellThumb shell={row.original} />,
      });
    }
    return cols;
  }, [canEdit, byId, teams, save, onOpen, withPhotos]);
}

// ---------------------------------------------------------------------------

/** Phones: one card per shell; tap to open the drawer. */
function ShellCards({
  rows,
  byId,
  grouped,
  onOpen,
}: {
  rows: Shell[];
  byId: Map<string, Team>;
  grouped: boolean;
  onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    if (!grouped) return [{ key: 'all', label: null as string | null, rows }];
    const out: { key: string; label: string | null; rows: Shell[] }[] = [];
    for (const s of rows) {
      const g = shellGroup(s);
      const last = out.find((x) => x.key === g.key);
      if (last) last.rows.push(s);
      else out.push({ key: g.key, label: g.label, rows: [s] });
    }
    return out;
  }, [rows, grouped]);
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.key} className="flex flex-col gap-2" aria-label={g.label ?? 'Shells'}>
          {g.label && <h2 className="text-base font-medium">{g.label}</h2>}
          <ul className="flex flex-col gap-2">
            {g.rows.map((s) => {
              const team = s.homeTeamId ? byId.get(s.homeTeamId) : undefined;
              const details = [
                s.weightClassLabel,
                s.strokeSide ? STROKE_SIDE_LABELS[s.strokeSide] : null,
                s.location,
                s.model,
              ].filter(Boolean);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(s.id)}
                    aria-label={`Open ${shellFullLabel(s)}`}
                    className="flex min-h-11 w-full flex-col gap-2 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-2"
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <ShellThumb shell={s} className="size-10" />
                      <ShellChip
                        shell={chipShell(s)}
                        teamColor={team?.colorKey}
                        showClass={false}
                      />
                      <ClassBadge boatClass={s.boatClass} />
                      <span className="ml-auto shrink-0 text-sm">
                        <StatusLabel status={s.status} />
                      </span>
                    </span>
                    {details.length > 0 && (
                      <span className="text-sm text-ink-2">{details.join(' · ')}</span>
                    )}
                    {team && <TeamChip team={team} short size="sm" className="self-start" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
