// Teams (PLAN.md §4.2, §6.10): every team with its color, short name, program, and roster
// size. Admins add and edit teams; everyone else sees the settings read-only.

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Pencil, Plus, Settings2, Users } from 'lucide-react';
import type { Team } from '@srt/domain';
import { useCan, useList } from '@/data';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { TeamChip, TeamDot } from '@/components/chips';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { useMediaQuery } from './hooks';
import { PROGRAM_LABELS } from './lib';
import { TeamFormDialog } from './TeamFormDialog';

interface TeamRow extends Team {
  active: number;
  inactive: number;
}

export default function TeamsListPage() {
  const canManage = useCan('team.manage');
  const navigate = useNavigate();
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });
  const athletes = useList('athletes');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ team: Team | null } | null>(null);
  const wide = useMediaQuery('(min-width: 768px)');

  const allTeams = useMemo(() => teams.data ?? [], [teams.data]);
  const archivedCount = allTeams.filter((t) => t.archived).length;

  const rows = useMemo<TeamRow[]>(() => {
    const counts = new Map<string, { active: number; inactive: number }>();
    for (const a of athletes.data ?? []) {
      const c = counts.get(a.teamId) ?? { active: 0, inactive: 0 };
      c[a.status === 'active' ? 'active' : 'inactive'] += 1;
      counts.set(a.teamId, c);
    }
    return allTeams
      .filter((t) => showArchived || !t.archived)
      .map((t) => ({ ...t, ...(counts.get(t.id) ?? { active: 0, inactive: 0 }) }));
  }, [allTeams, athletes.data, showArchived]);

  const columns = useMemo<ColumnDef<TeamRow, unknown>[]>(() => {
    const name: ColumnDef<TeamRow, unknown> = {
      id: 'name',
      header: 'Team',
      accessorFn: (t) => t.name,
      cell: ({ row }) => {
        const t = row.original;
        return (
          <div className="flex flex-col py-1">
            <Link
              to={`/teams/${t.id}`}
              className="inline-flex min-h-8 items-center gap-2 font-medium text-ink hover:text-accent hover:underline pointer-coarse:min-h-11"
            >
              <TeamDot colorKey={t.colorKey} />
              {t.name}
            </Link>
            {!wide && (
              <span className="pl-4.5 text-sm text-ink-2">
                {PROGRAM_LABELS[t.program]}
                {t.archived && ' · Archived'}
              </span>
            )}
          </div>
        );
      },
    };
    const athletesCol: ColumnDef<TeamRow, unknown> = {
      id: 'athletes',
      header: 'Athletes',
      accessorFn: (t) => t.active,
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.active} active
          {row.original.inactive > 0 && (
            <span className="text-ink-2">
              {wide ? ', ' : <br />}
              {row.original.inactive} inactive
            </span>
          )}
        </span>
      ),
    };
    const actions: ColumnDef<TeamRow, unknown> = {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      size: 56,
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            canManage ? `Edit ${row.original.name}` : `${row.original.name} team settings`
          }
          onClick={() => setEditing({ team: row.original })}
        >
          {canManage ? <Pencil aria-hidden /> : <Settings2 aria-hidden />}
        </Button>
      ),
    };
    if (!wide) return [name, athletesCol, actions];
    return [
      name,
      {
        id: 'shortName',
        header: 'Short name',
        accessorFn: (t) => t.shortName,
        cell: ({ row }) => <TeamChip team={row.original} short size="sm" />,
      },
      {
        id: 'program',
        header: 'Program',
        accessorFn: (t) => PROGRAM_LABELS[t.program],
      },
      athletesCol,
      {
        id: 'status',
        header: () => <span className="sr-only">Status</span>,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.archived ? <span className="text-sm text-ink-2">Archived</span> : null,
      },
      actions,
    ];
  }, [canManage, wide]);

  const error = teams.error ?? athletes.error;
  const loading = teams.isPending || athletes.isPending;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teams"
        description="Each team has its own roster and color. Open a team to edit its athletes."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setEditing({ team: null })}>
              <Plus aria-hidden />
              Add team
            </Button>
          )
        }
      />

      {archivedCount > 0 && (
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="font-normal">
            Show archived teams ({archivedCount})
          </Label>
        </div>
      )}

      {error ? (
        <ErrorState
          title="Teams did not load."
          error={error}
          onRetry={() => {
            void teams.refetch();
            void athletes.refetch();
          }}
        />
      ) : loading ? (
        <SkeletonRows rows={4} />
      ) : allTeams.length === 0 ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title="No teams yet"
          description={
            canManage
              ? 'Add a team for each squad (Junior boys, 5am masters, and so on), then add its athletes.'
              : 'An admin adds teams. Ask one to set up your squad.'
          }
          action={
            canManage && (
              <Button variant="primary" onClick={() => setEditing({ team: null })}>
                <Plus aria-hidden />
                Add team
              </Button>
            )
          }
        />
      ) : (
        <DataTable
          label="Teams"
          data={rows}
          columns={columns}
          getRowId={(t) => t.id}
          isMuted={(t) => t.archived}
          empty={
            <p className="text-center text-ink-2">
              Every team is archived. Turn on “Show archived teams” to see them.
            </p>
          }
        />
      )}

      <TeamFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        team={editing?.team}
        teams={allTeams}
        readOnly={!canManage}
        onCreated={(t) => navigate(`/teams/${t.id}`)}
      />
    </div>
  );
}
