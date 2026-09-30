// Placeholder from WP-D. WP-E replaces this file (PLAN.md §6.10). Keep the default export: the
// router lazy-loads it for /teams.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function TeamsListPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Teams" />
      <EmptyState
        title="The teams list is not built yet"
        description="It will list each team with its color and roster size, and open its roster."
      />
    </div>
  );
}
