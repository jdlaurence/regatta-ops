// Placeholder from WP-D. WP-E replaces this file (PLAN.md §6.10). Keep the default export: the
// router lazy-loads it for /teams/:id.

import { useParams } from 'react-router';
import { useRecord } from '@/data';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function TeamPage() {
  const { id } = useParams();
  const team = useRecord('teams', id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={team.data?.name ?? 'Team'} />
      <EmptyState
        title="The roster is not built yet"
        description="It will show team settings and the athlete table with inline editing, CSV import, and export."
      />
    </div>
  );
}
