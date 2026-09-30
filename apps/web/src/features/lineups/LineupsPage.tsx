// Placeholder from WP-D. WP-G replaces this file (PLAN.md §6.4). Keep the default export: the
// router lazy-loads it for /regattas/:id/lineups/:teamId.

import { useRecord } from '@/data';
import { useTeamIdParam } from '@/app/params';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function LineupsPage() {
  const teamId = useTeamIdParam();
  const team = useRecord('teams', teamId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={team.data ? `${team.data.name} lineups` : 'Lineups'} />
      <EmptyState
        title="The lineup builder is not built yet"
        description="It will show the roster with crossed-off athletes, entries by event as boat strips, and shell and oar pickers with conflict hints."
      />
    </div>
  );
}
