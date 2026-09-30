// Placeholder from WP-D. WP-L replaces this file (PLAN.md §6.9). Keep the default export: the
// router lazy-loads it for /trailers.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function TrailersListPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trailers" />
      <EmptyState
        title="Trailers admin is not built yet"
        description="It will list the club's trailers and open each one's shelves, compartments, and default loading rules."
      />
    </div>
  );
}
