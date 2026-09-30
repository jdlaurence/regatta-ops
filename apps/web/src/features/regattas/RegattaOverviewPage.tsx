// Placeholder from WP-D. WP-F replaces this file (PLAN.md §6.2). Keep the default export: the
// router lazy-loads it.

import { useRegattaWorkingSet } from '@/data';
import { useRegattaId } from '@/app/params';
import { PageHeader } from '@/components/PageHeader';
import { TeamChip } from '@/components/chips';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';

export default function RegattaOverviewPage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" />
      {ws.isLoading && <SkeletonRows rows={3} />}
      {ws.isError && (
        <ErrorState title="This regatta did not load." error={ws.error} onRetry={ws.refetch} />
      )}
      {ws.data && (
        <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-base">
          <dt className="text-ink-2">Teams</dt>
          <dd className="flex flex-wrap gap-1.5">
            {ws.data.participatingTeams.length === 0
              ? 'None yet'
              : ws.data.participatingTeams.map((t) => <TeamChip key={t.id} team={t} />)}
          </dd>
          <dt className="text-ink-2">Events</dt>
          <dd className="tabular-nums">{ws.data.events.length}</dd>
          <dt className="text-ink-2">Entries</dt>
          <dd className="tabular-nums">{ws.data.entries.length}</dd>
        </dl>
      )}
      <EmptyState
        title="The overview is not built yet"
        description="It will show each team's entries and boated counts, conflicts by severity, the load plan status, the day at a glance, and recent activity."
      />
    </div>
  );
}
