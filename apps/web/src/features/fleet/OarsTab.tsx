// Oar sets: the master list as a table with inline status and home team, filters, CSV import
// and export, and the oar set drawer. Oar chips carry the color code people look for at the
// trailer; they are not pills (only boats are).

import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Download, Plus, Upload } from 'lucide-react';
import type { EquipmentStatus, OarSet, Rigging, Team } from '@srt/domain';
import { useCan, useList, useUpdate } from '@/data';
import { OarChip, TeamChip } from '@/components/chips';
import { CsvImportDialog, downloadText } from '@/components/CsvImport';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import type { SelectOption } from '@/components/ui/select';
import { checkOarSetRows, OAR_SET_CSV_FIELDS, oarSetsToCsv, type OarSetInput } from './csv';
import { useClubToday, useFleetTeams, useWideLayout } from './hooks';
import { useImportRecords } from './import';
import {
  activeFilterCount,
  AFFINITY_LABELS,
  AFFINITY_ORDER,
  compareOarSets,
  countText,
  DEFAULT_OAR_FILTERS,
  EQUIPMENT_STATUSES,
  exportFileName,
  filterOarSets,
  OAR_TYPE_LABELS,
  oarCountText,
  STATUS_LABELS,
  type OarSetFilters,
} from './lib';
import {
  FilterPanel,
  FilterSelect,
  InlineSelect,
  SearchInput,
  STATUS_OPTIONS,
  StatusLabel,
} from './parts';
import { OarSetSheet } from './OarSetSheet';

const NO_TEAM = 'none';

const cm = (v?: number | null) => (v == null ? '' : `${v}`);

export function OarsTab({ nav }: { nav: ReactNode }) {
  const sets = useList('oar_sets');
  const { teams, byId } = useFleetTeams();
  const canEdit = useCan('fleet.edit');
  const wide = useWideLayout();
  const today = useClubToday();
  const update = useUpdate('oar_sets');
  const importRecords = useImportRecords('oar_sets');

  const [filters, setFilters] = useState<OarSetFilters>(DEFAULT_OAR_FILTERS);
  const [importOpen, setImportOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const openId = params.get('set');

  const all = useMemo(() => [...(sets.data ?? [])].sort(compareOarSets), [sets.data]);
  const rows = useMemo(() => filterOarSets(all, filters), [all, filters]);
  const retiredCount = all.filter((s) => s.status === 'retired').length;
  const set = <K extends keyof OarSetFilters>(k: K, v: OarSetFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const openSet = (id: string | null) => {
    setCreating(false);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set('set', id);
        else next.delete('set');
        return next;
      },
      { replace: !!openId && !!id },
    );
  };

  const save = (o: OarSet, patch: Partial<OarSet>) => update.mutate({ id: o.id, patch });

  const exportRows = () => {
    downloadText(exportFileName('oar-sets', today), oarSetsToCsv(rows, teams));
    toast.success(`${rows.length} ${rows.length === 1 ? 'oar set' : 'oar sets'} exported`);
  };

  const columns = useOarColumns({ canEdit, byId, teams, save, onOpen: openSet });

  const actions = (
    <>
      <Button onClick={exportRows} disabled={!sets.data || rows.length === 0}>
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
            Add oar set
          </Button>
        </>
      )}
    </>
  );

  let body: ReactNode;
  if (sets.isError) {
    body = (
      <ErrorState
        title="The oar sets did not load."
        error={sets.error}
        onRetry={() => void sets.refetch()}
      />
    );
  } else if (sets.isPending) {
    body = <SkeletonRows rows={10} />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        title="No oar sets yet"
        description="Add an oar set, or import the club's oar list from a CSV file."
        action={canEdit ? actions : undefined}
      />
    );
  } else {
    const filteredEmpty = (
      <EmptyState
        title="No oar sets match these filters"
        description="Clear the filters or search for another name or color."
        action={<Button onClick={() => setFilters(DEFAULT_OAR_FILTERS)}>Clear filters</Button>}
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
              label="Search oar sets"
              placeholder="Search name, color, or blade"
            />
            {(retiredCount > 0 || filters.showRetired) && (
              <div className="flex items-center gap-2">
                <Switch
                  id="show-retired-oars"
                  checked={filters.showRetired}
                  onCheckedChange={(v) => set('showRetired', v)}
                />
                <Label htmlFor="show-retired-oars" className="font-normal">
                  Show retired ({retiredCount})
                </Label>
              </div>
            )}
          </div>
          <FilterPanel
            wide={wide}
            activeCount={activeFilterCount(filters, DEFAULT_OAR_FILTERS)}
            onClear={() => setFilters((f) => ({ ...DEFAULT_OAR_FILTERS, search: f.search }))}
          >
            <FilterSelect<Rigging>
              label="Type"
              value={filters.type}
              onChange={(v) => set('type', v)}
              allLabel="All types"
              options={(['sweep', 'scull'] as const).map((t) => ({
                value: t,
                label: OAR_TYPE_LABELS[t],
              }))}
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
            <FilterSelect
              label="Gender affinity"
              value={filters.genderAffinity}
              onChange={(v) => set('genderAffinity', v)}
              allLabel="All"
              options={AFFINITY_ORDER.map((a) => ({ value: a, label: AFFINITY_LABELS[a] }))}
            />
          </FilterPanel>
        </div>
        <p className="text-sm text-ink-2" aria-live="polite">
          {countText(
            rows.length,
            all.length,
            'oar sets',
            !filters.showRetired && filters.status !== 'retired' ? retiredCount : 0,
          )}
        </p>
        {wide ? (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(o) => o.id}
            label="Oar sets"
            onRowClick={(o) => openSet(o.id)}
            activeRowId={openId}
            isMuted={(o) => o.status === 'retired'}
            empty={filteredEmpty}
          />
        ) : rows.length === 0 ? (
          filteredEmpty
        ) : (
          <OarCards rows={rows} byId={byId} onOpen={openSet} />
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
      <OarSetSheet
        open={creating || !!openId}
        onOpenChange={(o) => {
          if (!o) {
            setCreating(false);
            if (openId) openSet(null);
          }
        }}
        oarSetId={creating ? null : openId}
        onCreated={(id) => openSet(id)}
      />
      <CsvImportDialog<OarSetInput>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import oar sets"
        noun={['oar set', 'oar sets']}
        fields={OAR_SET_CSV_FIELDS}
        previewFields={['name', 'type', 'color', 'count']}
        check={(csvRows) =>
          checkOarSetRows(csvRows, { teams, existingNames: all.map((o) => o.name) })
        }
        onImport={importRecords}
        hint="Columns named like the export, or like the club's oar list (name, type, color, blade, length_cm, inboard_cm, grip_mm), are matched for you."
      />
    </div>
  );
}

function useOarColumns({
  canEdit,
  byId,
  teams,
  save,
  onOpen,
}: {
  canEdit: boolean;
  byId: Map<string, Team>;
  teams: Team[];
  save: (o: OarSet, patch: Partial<OarSet>) => void;
  onOpen: (id: string) => void;
}): ColumnDef<OarSet, unknown>[] {
  return useMemo(() => {
    const teamSelectOptions: SelectOption<string>[] = [
      { value: NO_TEAM, label: <span className="text-ink-2">No home team</span> },
      ...teams
        .filter((t) => !t.archived)
        .map((t) => ({ value: t.id, label: <TeamChip team={t} short size="sm" /> })),
    ];
    const cols: ColumnDef<OarSet, unknown>[] = [
      {
        id: 'name',
        header: 'Oar set',
        accessorFn: (o) => o.name,
        sortingFn: 'alphanumeric',
        meta: { className: 'min-w-48 py-1' },
        cell: ({ row }) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.original.id);
            }}
            aria-label={`Open oar set ${row.original.name}`}
            className="-mx-1 flex max-w-full rounded-control px-1 text-left"
          >
            <OarChip oarSet={{ ...row.original, status: 'in_service' }} />
          </button>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (o) => OAR_TYPE_LABELS[o.type],
      },
      {
        id: 'count',
        header: 'Count',
        accessorFn: (o) => o.count,
        meta: { className: 'whitespace-nowrap tabular-nums' },
        cell: ({ row }) => oarCountText(row.original),
      },
      {
        id: 'blade',
        header: 'Blade and shaft',
        accessorFn: (o) => o.blade ?? '',
        meta: { className: 'whitespace-nowrap' },
      },
      {
        id: 'length',
        header: 'Length (cm)',
        accessorFn: (o) => o.lengthCm ?? null,
        sortUndefined: 'last',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => cm(row.original.lengthCm),
      },
      {
        id: 'inboard',
        header: 'Inboard (cm)',
        accessorFn: (o) => o.inboardCm ?? null,
        sortUndefined: 'last',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => cm(row.original.inboardCm),
      },
      {
        id: 'grip',
        header: 'Grip (mm)',
        accessorFn: (o) => o.gripMm ?? null,
        sortUndefined: 'last',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => cm(row.original.gripMm),
      },
      {
        id: 'affinity',
        header: 'Gender affinity',
        accessorFn: (o) => AFFINITY_ORDER.indexOf(o.genderAffinity),
        cell: ({ row }) => AFFINITY_LABELS[row.original.genderAffinity],
      },
      {
        id: 'team',
        header: 'Home team',
        accessorFn: (o) => (o.homeTeamId ? (byId.get(o.homeTeamId)?.name ?? '') : ''),
        meta: { className: 'min-w-36' },
        cell: ({ row }) => {
          const o = row.original;
          const team = o.homeTeamId ? byId.get(o.homeTeamId) : undefined;
          if (!canEdit) return team ? <TeamChip team={team} short size="sm" /> : null;
          return (
            <InlineSelect
              value={o.homeTeamId ?? NO_TEAM}
              options={teamSelectOptions}
              label={`Home team of oar set ${o.name}`}
              onChange={(v) => save(o, { homeTeamId: v === NO_TEAM ? null : v })}
            />
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (o) => EQUIPMENT_STATUSES.indexOf(o.status),
        meta: { className: 'min-w-40' },
        cell: ({ row }) => {
          const o = row.original;
          if (!canEdit) return <StatusLabel status={o.status} />;
          return (
            <InlineSelect
              value={o.status}
              options={STATUS_OPTIONS}
              label={`Status of oar set ${o.name}`}
              onChange={(v) => save(o, { status: v })}
            />
          );
        },
      },
      {
        id: 'notes',
        header: 'Notes',
        enableSorting: false,
        accessorFn: (o) => o.notes ?? '',
        meta: { className: 'max-w-64 truncate text-ink-2' },
      },
    ];
    return cols;
  }, [canEdit, byId, teams, save, onOpen]);
}

function OarCards({
  rows,
  byId,
  onOpen,
}: {
  rows: OarSet[];
  byId: Map<string, Team>;
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Oar sets">
      {rows.map((o) => {
        const team = o.homeTeamId ? byId.get(o.homeTeamId) : undefined;
        const details = [
          `${OAR_TYPE_LABELS[o.type]}, ${oarCountText(o)}`,
          o.blade,
          o.lengthCm && o.inboardCm ? `${o.lengthCm}/${o.inboardCm} cm` : null,
          o.notes,
        ].filter(Boolean);
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onOpen(o.id)}
              aria-label={`Open oar set ${o.name}`}
              className="flex min-h-11 w-full flex-col gap-2 rounded-card border border-line bg-surface p-3 text-left hover:bg-surface-2"
            >
              <span className="flex w-full min-w-0 items-center gap-2">
                <OarChip oarSet={{ ...o, status: 'in_service' }} />
                <span className="ml-auto shrink-0 text-sm">
                  <StatusLabel status={o.status} />
                </span>
              </span>
              <span className="text-sm text-ink-2">{details.join(' · ')}</span>
              {team && <TeamChip team={team} short size="sm" className="self-start" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
