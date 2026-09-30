// /regattas/:id/lineups → the signed-in coach's default team if it is racing, else the first
// participating team (PLAN.md §6.4). WP-G may keep or replace this file.

import { Link, Navigate } from 'react-router';
import { useCurrentUser, useList } from '@/data';
import { useRegattaId } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';

export default function LineupsRedirect() {
  const regattaId = useRegattaId();
  const user = useCurrentUser();
  const regattaTeams = useList('regatta_teams', { where: { regattaId } });
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });

  if (regattaTeams.isPending || teams.isPending) return <PageSkeleton />;
  if (regattaTeams.isError || teams.isError) {
    return (
      <ErrorState
        title="Teams did not load."
        error={regattaTeams.error ?? teams.error}
        onRetry={() => {
          void regattaTeams.refetch();
          void teams.refetch();
        }}
      />
    );
  }
  const racing = new Set(regattaTeams.data.map((rt) => rt.teamId));
  const participating = teams.data.filter((t) => racing.has(t.id));
  const preferred =
    participating.find((t) => t.id === user?.defaultTeamId) ?? participating[0] ?? null;
  if (preferred) {
    return <Navigate to={regattaPath(regattaId, `lineups/${preferred.id}`)} replace />;
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Lineups" />
      <EmptyState
        title="No teams are racing yet"
        description="Add a team to this regatta on the overview, then build its lineups here."
        action={
          <Button asChild variant="primary">
            <Link to={regattaPath(regattaId)}>Go to overview</Link>
          </Button>
        }
      />
    </div>
  );
}
