// What the inspector shows when no page has claimed it (PLAN.md §5.3): the regatta's
// conflicts, then its recent activity. WP-H grows the conflicts list (navigation,
// acknowledgment); WP-J grows the activity feed. Both can replace these components outright.

import { useMemo } from 'react';
import { useFindings, useList } from '@/data';
import type { ActivityEntry, Finding, Severity } from '@srt/domain';
import { ConflictBadge, ConflictIcon } from '@/components/ConflictBadge';
import { ErrorState, Skeleton } from '@/components/states';
import { relativeTime } from '@/lib/relative-time';

const GROUPS: { severity: Severity; heading: string }[] = [
  { severity: 'error', heading: 'Errors' },
  { severity: 'warning', heading: 'Warnings' },
  { severity: 'info', heading: 'Notes' },
];

export function ConflictsSummary({ regattaId }: { regattaId: string }) {
  const { findings, counts, isLoading, isError, error, refetch } = useFindings(regattaId);
  const total = findings.length;
  return (
    <section aria-labelledby="inspector-conflicts" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="inspector-conflicts" className="text-md font-medium">
          Conflicts {!isLoading && <span className="ml-0.5 text-ink-2 tabular-nums">{total}</span>}
        </h3>
        <div className="flex gap-1">
          {GROUPS.map(({ severity }) =>
            counts[severity] > 0 ? (
              <ConflictBadge key={severity} severity={severity} count={counts[severity]} />
            ) : null,
          )}
        </div>
      </div>
      {isLoading && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading conflicts">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      )}
      {isError && <ErrorState title="Conflicts did not load." error={error} onRetry={refetch} />}
      {!isLoading && !isError && total === 0 && (
        <p className="text-base leading-prose text-ink-2">
          No conflicts. Shells, oars, and athletes are clear for every scheduled race.
        </p>
      )}
      {GROUPS.map(({ severity, heading }) => {
        const list = findings.filter((f) => f.severity === severity);
        if (list.length === 0) return null;
        return (
          <div key={severity} className="flex flex-col gap-1.5">
            <h4 className="sr-only">{heading}</h4>
            <ul className="flex flex-col gap-1.5">
              {list.slice(0, 40).map((f: Finding) => (
                <li
                  key={f.id}
                  className="flex gap-2 rounded-control border border-line bg-surface px-2.5 py-2 text-base leading-prose"
                >
                  <ConflictIcon severity={f.severity} className="mt-0.5" />
                  <span className="min-w-0">{f.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

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
      <ConflictsSummary regattaId={regattaId} />
      <ActivityFeed regattaId={regattaId} />
    </div>
  );
}
