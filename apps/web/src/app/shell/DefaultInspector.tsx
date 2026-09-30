// What the inspector shows when no page has claimed it (PLAN.md §5.3): the regatta's
// conflicts (components/ConflictsPanel: navigation, team filter, hot-seat acknowledgment),
// then its recent activity. WP-J grows the activity feed and can replace it outright.

import { useMemo } from 'react';
import { useList } from '@/data';
import type { ActivityEntry } from '@srt/domain';
import { ConflictsPanel } from '@/components/ConflictsPanel';
import { ErrorState, Skeleton } from '@/components/states';
import { relativeTime } from '@/lib/relative-time';

export function ActivityFeed({ regattaId, limit = 20 }: { regattaId: string; limit?: number }) {
  const activity = useList('activity_log', { where: { regattaId }, sort: '-created' });
  const users = useList('users');
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const rows: ActivityEntry[] = (activity.data ?? []).slice(0, limit);
  const now = new Date();
  return (
    <section aria-labelledby="inspector-activity" className="flex flex-col gap-3">
      <h3 id="inspector-activity" className="text-md font-medium">
        Activity
      </h3>
      {activity.isPending && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading activity">
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      )}
      {activity.isError && (
        <ErrorState
          title="Activity did not load."
          error={activity.error}
          onRetry={() => void activity.refetch()}
        />
      )}
      {activity.isSuccess && rows.length === 0 && (
        <p className="text-base leading-prose text-ink-2">
          No changes yet. Edits to entries, events, availability, and the trailer show here.
        </p>
      )}
      <ol className="flex flex-col gap-2.5">
        {rows.map((a) => (
          <li key={a.id} className="flex flex-col gap-0.5 text-base leading-prose">
            <span>
              <span className="font-medium">
                {(a.actorId && names.get(a.actorId)) || 'Someone'}
              </span>{' '}
              {a.summary}
            </span>
            {a.created && (
              <time dateTime={a.created} className="text-xs text-ink-2">
                {relativeTime(a.created, now)}
              </time>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DefaultInspector({ regattaId }: { regattaId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ConflictsPanel regattaId={regattaId} />
      <ActivityFeed regattaId={regattaId} />
    </div>
  );
}
