// Placeholder from WP-D. WP-K (after WP-M) replaces this file (PLAN.md §4.11, §6.12): the load
// sheet for /print/regattas/:id/load/:trailerId. Keep the default export.

import { useRecord } from '@/data';
import { useRegattaId, useTrailerIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { EmptyState } from '@/components/states';
import { PrintFrame } from './PrintFrame';

export default function PrintLoadPage() {
  const regattaId = useRegattaId();
  const trailerId = useTrailerIdParam();
  const trailer = useRecord('trailers', trailerId);
  return (
    <PrintFrame
      title={`Load sheet: ${trailer.data?.name ?? 'Trailer'}`}
      backTo={regattaPath(regattaId, trailerId ? `trailer/${trailerId}` : 'trailer')}
    >
      <EmptyState
        title="The load sheet is not built yet"
        description="It will print the trailer shelf by shelf with the end-view diagram and the checklist."
      />
    </PrintFrame>
  );
}
