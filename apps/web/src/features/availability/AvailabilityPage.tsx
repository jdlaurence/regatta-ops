// Placeholder from WP-D. WP-F replaces this file (PLAN.md §6.5). Keep the default export: the
// router lazy-loads it.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function AvailabilityPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Availability" />
      <EmptyState
        title="Availability is not built yet"
        description="It will list every athlete on the participating teams with a toggle, per-day toggles for multi-day regattas, and a reason field."
      />
    </div>
  );
}
