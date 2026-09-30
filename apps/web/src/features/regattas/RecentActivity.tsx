// Recent activity for one regatta (PLAN.md §6.2): activity_log lines, newest first, with the
// actor's name and a relative time. Same query as the inspector's feed, so they share a cache.

import { useMemo, useState } from 'react';
import type { User } from '@srt/domain';
import { useList } from '@/data';
import { relativeTime } from '@/lib/relative-time';
import { ErrorState, Skeleton } from '@/components/states';
import { Button } from '@/components/ui/button';

const FIRST = 8;
const MORE = 40;

export function RecentActivity({ regattaId, users }: { regattaId: string; users: User[] }) {
  const activity = useList('activity_log', { where: { regattaId }, sort: '-created' });
  const [expanded, setExpanded] = useState(false);
  const names = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);
  const all = activity.data ?? [];
  const rows = all.slice(0, expanded ? MORE : FIRST);
  const now = new Date();

  if (activity.isPending) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading activity">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }
  if (activity.isError) {
    return (
      <ErrorState
        title="Activity did not load."
        error={activity.error}
        onRetry={() => void activity.refetch()}
      />
    );
  }
  if (all.length === 0) {
    return (
      <p className="text-base leading-prose text-ink-2">
        No changes yet. Edits to entries, events, availability, and the trailer show here with who
        made them.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
        {rows.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-0.5 px-3 py-2.5 text-base leading-prose sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span className="min-w-0">
              <span className="font-medium">
                {(a.actorId && names.get(a.actorId)) || 'Someone'}
              </span>{' '}
              {a.summary}
            </span>
            {a.created && (
              <time dateTime={a.created} className="shrink-0 text-sm text-ink-2 tabular-nums">
                {relativeTime(a.created, now)}
              </time>
            )}
          </li>
        ))}
      </ol>
      {all.length > FIRST && (
        <Button
          variant="link"
          className="self-start"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show more (${Math.min(all.length, MORE) - FIRST})`}
        </Button>
      )}
    </div>
  );
}
