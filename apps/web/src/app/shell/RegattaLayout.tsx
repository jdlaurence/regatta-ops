// The frame of every /regattas/:id page: the regatta's name and dates, its tabs, and the
// "final" banner (PLAN.md §4.1, §5.3). Pages render below it with their own PageHeader.

import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import type { Regatta } from '@srt/domain';
import { presencePageFromPath, useChangeToasts, usePresence, useRecord } from '@/data';
import { cn } from '@/lib/cn';
import { formatDayRange } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { RegattaStatusBanner } from '@/components/RegattaStatusBanner';
import { EmptyState, ErrorState, PageSkeleton, Skeleton } from '@/components/states';
import { PresenceAvatars } from '@/components/PresenceAvatars';
import { REGATTA_TABS, regattaPath } from '../nav-items';
import { useRegattaId } from '../params';
import { InspectorToggle } from './InspectorPanel';

function RegattaHeader({ regatta }: { regatta: Regatta }) {
  const place = [regatta.venue, regatta.city].filter(Boolean).join(', ');
  return (
    <div data-print="hide" className="hidden flex-col gap-3 md:flex">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            to={regattaPath(regatta.id)}
            className="truncate font-display text-lg font-semibold text-ink hover:underline"
          >
            {regatta.name}
          </Link>
          <p className="truncate text-sm text-ink-2 tabular-nums">
            {formatDayRange(regatta.startDate, regatta.endDate)}
            {place && ` · ${place}`}
            {regatta.format === 'head' ? ' · Head race' : ''}
          </p>
        </div>
        <div className="-mr-2 flex shrink-0 items-center gap-1">
          <PresenceAvatars regattaId={regatta.id} />
          <InspectorToggle />
        </div>
      </div>
      <nav
        aria-label="Regatta sections"
        className="-mb-px flex gap-1 overflow-x-auto border-b border-line"
      >
        {REGATTA_TABS.map((tab) => (
          <NavLink
            key={tab.segment}
            to={regattaPath(regatta.id, tab.segment)}
            end={tab.segment === ''}
            className={({ isActive }) =>
              cn(
                'flex h-10 shrink-0 items-center border-b-2 px-2.5 text-base font-medium whitespace-nowrap',
                isActive
                  ? 'border-accent text-ink'
                  : 'border-transparent text-ink-2 hover:border-line-strong hover:text-ink',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Presence heartbeats and "Updated by ..." toasts for the open regatta (PLAN.md §10.2, §10.3). */
function useRegattaCollaboration(regattaId: string, exists: boolean) {
  const where = presencePageFromPath(useLocation().pathname);
  usePresence({
    regattaId: exists ? regattaId : null,
    page: where?.page ?? 'overview',
    teamId: where?.teamId ?? null,
  });
  useChangeToasts(regattaId);
}

export function RegattaLayout() {
  const regattaId = useRegattaId();
  const regatta = useRecord('regattas', regattaId);
  useRegattaCollaboration(regattaId, !!regatta.data);

  if (regatta.isPending) {
    return (
      <div className="flex flex-col gap-6" role="status" aria-label="Loading regatta">
        <div className="hidden flex-col gap-2 md:flex">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-4 w-48" />
        </div>
        <PageSkeleton />
      </div>
    );
  }
  if (regatta.isError) {
    return (
      <ErrorState
        title="This regatta did not load."
        error={regatta.error}
        onRetry={() => void regatta.refetch()}
      />
    );
  }
  if (!regatta.data) {
    return (
      <EmptyState
        title="Regatta not found"
        description="It may have been deleted, or the link is wrong. Pick a regatta from the list."
        action={
          <Button asChild variant="primary">
            <Link to="/">Go to regattas</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <RegattaHeader regatta={regatta.data} />
      <PresenceAvatars regattaId={regatta.data.id} compact className="-my-3 self-end md:hidden" />
      <RegattaStatusBanner status={regatta.data.status} />
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
