// Trailers admin, the list (PLAN.md §6.9, §4.12): every trailer with a small end view and what
// it holds. Admins add trailers; everyone can open one to read it.

import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { meters } from '@regatta-ops/domain';
import { useCan } from '@/data';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/states';
import { STYLE_LABELS, tierWordOf } from '@/components/trailer/labels';
import { TrailerEndView } from '@/components/trailer/TrailerEndView';
import { Button } from '@/components/ui/button';
import { capacitySummary, trailerCapacity } from './capacity';
import { useTrailerList } from './hooks';
import { NewTrailerDialog } from './NewTrailerDialog';

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-3" role="status" aria-label="Loading">
      {[0, 1].map((i) => (
        <li
          key={i}
          className="flex items-center gap-4 rounded-card border border-line bg-surface p-4"
        >
          <Skeleton className="h-20 w-28" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TrailersListPage() {
  const canManage = useCan('trailer.manage');
  const list = useTrailerList();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Trailers"
        description="The club’s trailers: their racks, compartments, and default loading rules."
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New trailer
            </Button>
          )
        }
      />
      {list.isError ? (
        <ErrorState title="The trailers did not load." error={list.error} onRetry={list.refetch} />
      ) : !list.data ? (
        <ListSkeleton />
      ) : list.data.length === 0 ? (
        <EmptyState
          title="No trailers yet"
          description={
            canManage
              ? 'Add one with New trailer. Start from the layout closest to it and correct the measurements.'
              : 'An admin adds trailers. Ask one to set up the club’s trailers.'
          }
          action={
            canManage && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                <Plus aria-hidden />
                New trailer
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.data.map(({ trailer, def }) => {
            const cap = trailerCapacity(def, trailer.defaultRules);
            return (
              <li key={trailer.id}>
                <Link
                  to={`/trailers/${trailer.id}`}
                  className="flex items-center gap-4 rounded-card border border-line bg-surface p-3 hover:bg-surface-2 sm:p-4"
                >
                  <span aria-hidden className="shrink-0">
                    <TrailerEndView trailer={def} rules={trailer.defaultRules} size="thumb" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-display text-md font-semibold text-ink">
                      {trailer.name}
                    </span>
                    <span className="text-sm text-ink-2">
                      {STYLE_LABELS[trailer.style]}, {meters(trailer.frameLengthCm)} m frame
                    </span>
                    <span className="text-sm text-ink-2">
                      {capacitySummary(cap, tierWordOf(def))}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-2" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <NewTrailerDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
