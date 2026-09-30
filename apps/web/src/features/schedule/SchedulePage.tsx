// Placeholder from WP-D. WP-H replaces this file (PLAN.md §6.3). Keep the default export: the
// router lazy-loads it.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function SchedulePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Schedule" />
      <EmptyState
        title="The schedule is not built yet"
        description="It will show every team's entries in time order as a list and as a timeline by shell, team, or oar set, with conflicts marked."
      />
    </div>
  );
}
