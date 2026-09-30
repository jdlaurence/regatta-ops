// Placeholder from WP-D. WP-M replaces this file (PLAN.md §6.6). Keep the default export: the
// router lazy-loads it for /regattas/:id/trailer and /regattas/:id/trailer/:trailerId.

import { useRecord } from '@/data';
import { useTrailerIdParam } from '@/app/params';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function TrailerPage() {
  const trailerId = useTrailerIdParam();
  const trailer = useRecord('trailers', trailerId);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={trailer.data ? `Trailer: ${trailer.data.name}` : 'Trailer'} />
      <EmptyState
        title="The trailer view is not built yet"
        description="It will show the end view of each trailer with boats on its racks, the boats still to load, and the loading rules."
      />
    </div>
  );
}
