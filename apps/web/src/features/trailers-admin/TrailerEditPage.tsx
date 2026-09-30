// Placeholder from WP-D. WP-L replaces this file (PLAN.md §6.9). Keep the default export: the
// router lazy-loads it for /trailers/:id.

import { useParams } from 'react-router';
import { useRecord } from '@/data';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function TrailerEditPage() {
  const { id } = useParams();
  const trailer = useRecord('trailers', id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={trailer.data?.name ?? 'Trailer'} />
      <EmptyState
        title="The trailer editor is not built yet"
        description="It will have the frame and shelves form on the left, a live end-view diagram on the right, and the default rules below."
      />
    </div>
  );
}
