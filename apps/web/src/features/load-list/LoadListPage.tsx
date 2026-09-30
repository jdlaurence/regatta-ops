// Placeholder from WP-D. WP-M replaces this file (PLAN.md §6.7). Keep the default export: the
// router lazy-loads it.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function LoadListPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Load list" />
      <EmptyState
        title="The load list is not built yet"
        description="It will be a checklist of shells, riggers, oars, and gear, with Loaded and Returned checkboxes for each line."
      />
    </div>
  );
}
