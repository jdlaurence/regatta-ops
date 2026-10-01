// The activity feed (PLAN.md §4.6, §8.1 activity_log): who changed what, newest first, for one
// regatta or the whole club. Each line is "<actor> <summary>" as the server wrote it, with a
// relative time and, where the target can still be found, a link to it. Live: realtime refetches
// the log on every change, and the times move on by themselves.
//
//   <ActivityFeed regattaId={regattaId} />          // a regatta's activity (the inspector)
//   <ActivityFeed regattaId={null} pageSize={50} /> // everything, with the regatta named
//   <ActivityFeed regattaId={id} title={false} framed pageSize={8} />  // under a page's heading

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type {
  ActivityEntry,
  Entry,
  EntrySeat,
  Id,
  LoadPlacement,
  LoadPlan,
} from '@regatta-ops/domain';
import { targetCollection, useList, useNow } from '@/data';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/relative-time';
import { ErrorState, Skeleton } from './states';
import { Button } from './ui/button';

export interface ActivityLink {
  href: string;
  /** Link text: says where it goes ("Open lineup"). */
  label: string;
}

export interface ActivityLookups {
  entries?: ReadonlyMap<Id, Pick<Entry, 'id' | 'teamId'>>;
  seats?: ReadonlyMap<Id, Pick<EntrySeat, 'id' | 'entryId'>>;
  loadPlans?: ReadonlyMap<Id, Pick<LoadPlan, 'id' | 'trailerId'>>;
  placements?: ReadonlyMap<Id, Pick<LoadPlacement, 'id' | 'loadPlanId'>>;
}

function diffValue(row: ActivityEntry, ...fields: string[]): string | null {
  for (const f of fields) {
    const d = row.diff?.[f];
    const v = d ? (d.to ?? d.from) : null;
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

/**
 * Where an activity line points, or null when its target is gone or unknown: an entry (or one of
 * its seats) opens its team's lineups with `?entry=`, an event the schedule with `?event=`.
 */
export function activityLink(
  row: ActivityEntry,
  lookups: ActivityLookups = {},
): ActivityLink | null {
  const rid = row.regattaId;
  const base = rid ? `/regattas/${rid}` : null;
  const lineup = (entryId: string | null): ActivityLink | null => {
    if (!base || !entryId) return null;
    const entry = lookups.entries?.get(entryId);
    if (!entry) return null;
    return { href: `${base}/lineups/${entry.teamId}?entry=${entryId}`, label: 'Open lineup' };
  };
  switch (targetCollection(row.targetType)) {
    case 'entries':
      return row.action === 'delete' ? null : lineup(row.targetId);
    case 'entry_seats': {
      const seat = lookups.seats?.get(row.targetId);
      return lineup(seat?.entryId ?? diffValue(row, 'entryId', 'entry'));
    }
    case 'events':
      if (!base) return null;
      return row.action === 'delete'
        ? { href: `${base}/schedule`, label: 'Open schedule' }
        : { href: `${base}/schedule?event=${row.targetId}`, label: 'Open schedule' };
    case 'availability':
      // The lineups roster shows who is out and toggles it; the redirect picks the team.
      return base ? { href: `${base}/lineups`, label: 'Open lineups' } : null;
    case 'load_placements': {
      if (!base) return null;
      const placement = lookups.placements?.get(row.targetId);
      const planId = placement?.loadPlanId ?? diffValue(row, 'loadPlanId', 'load_plan');
      const trailerId = planId ? lookups.loadPlans?.get(planId)?.trailerId : undefined;
      return {
        href: trailerId ? `${base}/trailer/${trailerId}` : `${base}/trailer`,
        label: 'Open trailer',
      };
    }
    case 'load_items':
      return base ? { href: `${base}/load`, label: 'Open load list' } : null;
    case 'shells':
      return row.action === 'delete' ? null : { href: '/fleet/shells', label: 'Open fleet' };
    case 'oar_sets':
      return row.action === 'delete' ? null : { href: '/fleet/oars', label: 'Open fleet' };
    case 'regattas':
    case 'regatta_teams':
      return base ? { href: base, label: 'Open regatta' } : null;
    default:
      return null;
  }
}

/** The lookups a regatta's links need. Same query keys as the working set: cache hits there. */
function useRegattaLookups(regattaId: string | null): ActivityLookups {
  const enabled = !!regattaId;
  const rid = regattaId ?? '';
  const entries = useList('entries', { where: { regattaId: rid } }, { enabled });
  const entryIds = useMemo(() => (entries.data ?? []).map((e) => e.id), [entries.data]);
  const seats = useList(
    'entry_seats',
    { in: { entryId: entryIds } },
    { enabled: enabled && !!entries.data, keepPrevious: true },
  );
  const plans = useList('load_plans', { where: { regattaId: rid } }, { enabled });
  const planIds = useMemo(() => (plans.data ?? []).map((p) => p.id), [plans.data]);
  const placements = useList(
    'load_placements',
    { in: { loadPlanId: planIds } },
    { enabled: enabled && !!plans.data, keepPrevious: true },
  );
  return useMemo(
    () => ({
      entries: new Map((entries.data ?? []).map((e) => [e.id, e])),
      seats: new Map((seats.data ?? []).map((s) => [s.id, s])),
      loadPlans: new Map((plans.data ?? []).map((p) => [p.id, p])),
      placements: new Map((placements.data ?? []).map((p) => [p.id, p])),
    }),
    [entries.data, seats.data, plans.data, placements.data],
  );
}

export interface ActivityFeedProps {
  /** One regatta's activity, or null for the whole club (each line then names its regatta). */
  regattaId: string | null;
  /** Lines shown at first and added by each "Show more" (default 20). */
  pageSize?: number;
  /**
   * The section heading (default "Activity"). False leaves it out, and the feed is then a
   * plain block for a host that has its own heading.
   */
  title?: string | false;
  /** Lines in a bordered card (a page), instead of a loose list (the inspector). */
  framed?: boolean;
  className?: string;
}

export function ActivityFeed({
  regattaId,
  pageSize = 20,
  title = 'Activity',
  framed = false,
  className,
}: ActivityFeedProps) {
  const [shown, setShown] = useState(pageSize);
  // One more than shown, so "Show more" knows whether there is more without loading the log.
  const activity = useList(
    'activity_log',
    regattaId
      ? { where: { regattaId }, sort: '-created', limit: shown + 1 }
      : { sort: '-created', limit: shown + 1 },
    { keepPrevious: true },
  );
  // Same keys as the working set and the navigation: cache hits on regatta pages.
  const users = useList('users', { sort: 'name' });
  const regattas = useList('regattas', { sort: 'startDate' }, { enabled: !regattaId });
  const lookups = useRegattaLookups(regattaId);
  const now = useNow(30_000);

  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const regattaNames = useMemo(
    () => new Map((regattas.data ?? []).map((r) => [r.id, r.name])),
    [regattas.data],
  );
  const all = activity.data ?? [];
  const rows = all.slice(0, shown);
  // The inspector and the overview can both show a regatta's feed at once.
  const headingId = useId();
  const Wrapper = title ? 'section' : 'div';

  return (
    <Wrapper
      aria-labelledby={title ? headingId : undefined}
      className={cn('flex flex-col gap-3', className)}
    >
      {title && (
        <h3 id={headingId} className="text-md font-medium">
          {title}
        </h3>
      )}
      {activity.isPending && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading activity">
          <Skeleton className="h-8" />
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
      {activity.isSuccess && all.length === 0 && (
        <p className="text-base leading-prose text-ink-2">
          No changes yet. Edits to entries, events, availability, and the trailer show here.
        </p>
      )}
      {rows.length > 0 && (
        <ol
          aria-label={title ? undefined : 'Activity'}
          className={cn(
            'flex flex-col',
            framed ? 'divide-y divide-line rounded-card border border-line bg-surface' : 'gap-2.5',
          )}
        >
          {rows.map((row) => {
            const link = activityLink(row, lookups);
            const regattaName =
              !regattaId && row.regattaId ? regattaNames.get(row.regattaId) : undefined;
            return (
              <li
                key={row.id}
                className={cn(
                  'flex flex-col gap-0.5 text-base leading-prose',
                  framed && 'px-3 py-2.5',
                )}
              >
                <span className="min-w-0 break-words">
                  <span className="font-medium">
                    {(row.actorId && names.get(row.actorId)) || 'Someone'}
                  </span>{' '}
                  {row.summary}
                </span>
                <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                  {row.created && (
                    <time dateTime={row.created} className="tabular-nums">
                      {relativeTime(row.created, now)}
                    </time>
                  )}
                  {regattaName && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{regattaName}</span>
                    </>
                  )}
                  {link && (
                    <>
                      <span aria-hidden>·</span>
                      <Link
                        to={link.href}
                        className="rounded-control text-accent underline-offset-4 hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"
                      >
                        {link.label}
                      </Link>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {all.length > shown && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setShown((n) => n + pageSize)}
        >
          Show more
        </Button>
      )}
    </Wrapper>
  );
}
