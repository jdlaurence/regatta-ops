// The overview's teams table: each participating team with its entries, boated count, conflicts,
// and load plan status, plus adding and removing teams (regatta_teams).

import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Trash2 } from 'lucide-react';
import type { Regatta, Team } from '@regatta-ops/domain';
import { useCan, useCreate, useDelete } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { TeamChip, TeamDot } from '@/components/chips';
import { ConflictBadges } from '@/components/ConflictBadge';
import { EmptyState } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { ScrollRegion } from '@/components/ScrollRegion';
import { loadStatusText, type TeamSummary } from './summary';
import type { ConfirmFinalEdit } from './useConfirmFinalEdit';

function AddTeamMenu({
  regatta,
  available,
  finalEdit,
  variant = 'secondary',
}: {
  regatta: Regatta;
  available: Team[];
  finalEdit: ConfirmFinalEdit;
  variant?: 'primary' | 'secondary';
}) {
  const create = useCreate('regatta_teams', {
    errorMessage: 'The team was not added. Try again.',
  });
  const add = (team: Team) =>
    void finalEdit.guard(async () => {
      try {
        await create.mutateAsync({ regattaId: regatta.id, teamId: team.id });
        toast.success(`${team.name} added`);
      } catch {
        // Toast from the mutation.
      }
    }, 'Add team');

  if (available.length === 0) {
    return <p className="text-sm text-ink-2">Every team is in this regatta.</p>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm">
          <Plus aria-hidden />
          Add team
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {available.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => add(t)}>
            <TeamDot colorKey={t.colorKey} />
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BoatedCell({ s }: { s: TeamSummary }) {
  const short = s.coming - s.boated;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className="font-display text-md font-semibold tabular-nums">
        <span aria-hidden>
          {s.boated} / {s.coming}
        </span>
        <span className="sr-only">
          {s.boated} of {s.coming} athletes boated
        </span>
      </span>
      {short > 0 && s.allEntries > 0 && (
        <span className="text-sm text-warn tabular-nums">{short} unboated</span>
      )}
    </span>
  );
}

function Conflicts({ s }: { s: TeamSummary }) {
  if (s.findings.length === 0) {
    return (
      <span className="text-ink-2">
        <span aria-hidden>—</span>
        <span className="sr-only">No conflicts</span>
      </span>
    );
  }
  return <ConflictBadges findings={s.findings} />;
}

export function RegattaTeams({
  regatta,
  summaries,
  allTeams,
  finalEdit,
}: {
  regatta: Regatta;
  summaries: TeamSummary[];
  /** Every team; the ones not in the regatta (and not archived) can be added. */
  allTeams: Team[];
  finalEdit: ConfirmFinalEdit;
}) {
  const canEdit = useCan('regatta.edit');
  const [removing, setRemoving] = useState<TeamSummary | null>(null);
  const remove = useDelete('regatta_teams', {
    errorMessage: 'The team was not removed. Try again.',
  });
  const inRegatta = new Set(summaries.map((s) => s.team.id));
  const available = allTeams.filter((t) => !t.archived && !inRegatta.has(t.id));
  const lineups = (teamId: string) => regattaPath(regatta.id, `lineups/${teamId}`);

  const confirmRemove = async () => {
    const s = removing;
    setRemoving(null);
    if (!s) return;
    await finalEdit.guard(async () => {
      try {
        await remove.mutateAsync(s.regattaTeamId);
        toast.success(`${s.team.name} removed`);
      } catch {
        // Toast from the mutation.
      }
    }, 'Remove team');
  };

  const removeButton = (s: TeamSummary) =>
    canEdit && s.allEntries === 0 ? (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${s.team.name} from this regatta`}
        title="Remove from this regatta"
        onClick={() => setRemoving(s)}
      >
        <Trash2 aria-hidden />
      </Button>
    ) : null;

  if (summaries.length === 0) {
    return (
      <EmptyState
        title="No teams yet"
        description="Add the teams racing at this regatta. Each team then builds its lineups on its own page."
        action={
          canEdit ? (
            <AddTeamMenu
              regatta={regatta}
              available={available}
              finalEdit={finalEdit}
              variant="primary"
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Tablet and desktop: a table. */}
      <ScrollRegion
        label="Teams in this regatta"
        className="hidden overflow-x-auto rounded-card border border-line bg-surface md:block"
      >
        <table className="w-full border-collapse text-base" aria-label="Teams in this regatta">
          <thead>
            <tr className="border-b border-line text-left text-sm text-ink-2">
              <th scope="col" className="h-9 px-3 font-medium">
                Team
              </th>
              <th scope="col" className="h-9 px-3 text-right font-medium">
                Entries
              </th>
              <th scope="col" className="h-9 px-3 font-medium">
                Boated
              </th>
              <th scope="col" className="h-9 px-3 font-medium">
                Conflicts
              </th>
              <th scope="col" className="h-9 px-3 font-medium">
                Load plan
              </th>
              <th scope="col" className="h-9 w-12 px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <tr key={s.team.id} className="border-b border-line last:border-b-0">
                <td className="h-12 px-3">
                  <Link
                    to={lineups(s.team.id)}
                    className="inline-flex rounded-control hover:underline"
                    aria-label={`${s.team.name} lineups`}
                  >
                    <TeamChip team={s.team} />
                  </Link>
                </td>
                <td className="h-12 px-3 text-right tabular-nums">{s.entries}</td>
                <td className="h-12 px-3">
                  <BoatedCell s={s} />
                </td>
                <td className="h-12 px-3">
                  <Conflicts s={s} />
                </td>
                <td
                  className={cn(
                    'h-12 px-3 whitespace-nowrap tabular-nums',
                    s.load.state === 'none' && 'text-ink-2',
                  )}
                >
                  {loadStatusText(s.load)}
                </td>
                <td className="h-12 px-3 text-right">{removeButton(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      {/* Phone: one card per team. */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Teams in this regatta">
        {summaries.map((s) => (
          <li
            key={s.team.id}
            className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <Link
                to={lineups(s.team.id)}
                className="inline-flex min-h-11 items-center rounded-control"
                aria-label={`${s.team.name} lineups`}
              >
                <TeamChip team={s.team} />
              </Link>
              {removeButton(s)}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
              <dt className="text-ink-2">Entries</dt>
              <dd className="tabular-nums">{s.entries}</dd>
              <dt className="text-ink-2">Boated</dt>
              <dd>
                <BoatedCell s={s} />
              </dd>
              <dt className="text-ink-2">Conflicts</dt>
              <dd>
                <Conflicts s={s} />
              </dd>
              <dt className="text-ink-2">Load plan</dt>
              <dd className={cn('tabular-nums', s.load.state === 'none' && 'text-ink-2')}>
                {loadStatusText(s.load)}
              </dd>
            </dl>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div>
          <AddTeamMenu regatta={regatta} available={available} finalEdit={finalEdit} />
        </div>
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        {removing && (
          <DialogContent
            title={`Remove ${removing.team.name}?`}
            description={`${removing.team.name} has no entries in ${regatta.name}. Availability already entered for its athletes stays, in case you add the team back.`}
          >
            <DialogFooter>
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button variant="danger" onClick={() => void confirmRemove()}>
                Remove team
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
