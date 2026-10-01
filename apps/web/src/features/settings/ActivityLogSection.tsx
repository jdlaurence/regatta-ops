// The activity log (PLAN.md §8.1): every logged edit, newest first, with search and filters by
// regatta, person, and kind of record. Shown 50 at a time.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { History, Search } from 'lucide-react';
import type { ActivityEntry, CollectionName } from '@regatta-ops/domain';
import { targetCollection, useList, useNow } from '@/data';
import { Avatar } from '@/app/shell/UserMenu';
import { activityLink } from '@/components/ActivityFeed';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Select } from '@/components/ui/select';
import { relativeTime } from '@/lib/relative-time';
import { useClubSettings } from './hooks';

export const ACTIVITY_PAGE_SIZE = 50;

const ALL = 'all';
const CLUB_WIDE = 'none';

/** What the kind filter calls each logged collection. */
const KIND_LABELS: Partial<Record<CollectionName, string>> = {
  entries: 'Entries',
  entry_seats: 'Seats',
  events: 'Events and schedule',
  availability: 'Availability',
  regattas: 'Regattas',
  regatta_teams: 'Published lineups',
  load_plans: 'Load plans',
  load_placements: 'Trailer placements',
  load_items: 'Load list',
  shells: 'Shells',
  oar_sets: 'Oar sets',
  gear_items: 'Gear',
  athletes: 'Athletes',
  teams: 'Teams',
  trailers: 'Trailers',
  users: 'Users',
  comments: 'Comments',
};

/** The kind of record a log line is about ("entry" and "entries" are one kind). */
export function kindOf(targetType: string): { key: string; label: string } {
  const collection = targetCollection(targetType);
  const key = collection ?? targetType;
  const label = (collection && KIND_LABELS[collection]) || key.replace(/_/g, ' ');
  return { key, label: label.charAt(0).toUpperCase() + label.slice(1) };
}

interface Filters {
  search: string;
  regatta: string;
  actor: string;
  kind: string;
}

const EMPTY: Filters = { search: '', regatta: ALL, actor: ALL, kind: ALL };

export function ActivityLogSection() {
  const log = useList('activity_log', { sort: '-created' });
  const users = useList('users', { sort: 'name' });
  const regattas = useList('regattas', { sort: '-startDate' });
  const { settings } = useClubSettings();
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [limit, setLimit] = useState(ACTIVITY_PAGE_SIZE);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setLimit(ACTIVITY_PAGE_SIZE);
  };

  const userName = useMemo(
    () => new Map((users.data ?? []).map((u) => [u.id, u.name])),
    [users.data],
  );
  const regattaById = useMemo(
    () => new Map((regattas.data ?? []).map((r) => [r.id, r])),
    [regattas.data],
  );
  const entries = useMemo(() => log.data ?? [], [log.data]);

  const kindOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      const k = kindOf(e.targetType);
      seen.set(k.key, k.label);
    }
    return [...seen]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [entries]);

  const filtered = useMemo(() => {
    const words = filters.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      if (
        filters.regatta === CLUB_WIDE
          ? !!e.regattaId
          : filters.regatta !== ALL && e.regattaId !== filters.regatta
      ) {
        return false;
      }
      if (filters.actor !== ALL && e.actorId !== filters.actor) return false;
      if (filters.kind !== ALL && kindOf(e.targetType).key !== filters.kind) return false;
      if (words.length > 0) {
        const regatta = e.regattaId ? regattaById.get(e.regattaId)?.name : '';
        const hay = [e.summary, e.actorId ? userName.get(e.actorId) : '', regatta ?? '']
          .join(' ')
          .toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [entries, filters, regattaById, userName]);

  const shown = filtered.slice(0, limit);
  const filtering = JSON.stringify(filters) !== JSON.stringify(EMPTY);
  const error = log.error ?? users.error ?? regattas.error;
  const now = useNow(30_000);
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const stampFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const clockFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: settings.timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  // Under the day headings: "4 min ago" today, the clock time before that.
  const whenOf = (iso: string) =>
    now.getTime() - new Date(iso).getTime() < 12 * 3_600_000
      ? relativeTime(iso, now)
      : clockFmt.format(new Date(iso));

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-2"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            placeholder="Search the log"
            aria-label="Search the activity log"
            className="pl-8"
          />
        </div>
        <Combobox
          label="Regatta"
          value={filters.regatta}
          onValueChange={(v) => setFilter('regatta', v ?? ALL)}
          options={[
            { value: ALL, label: 'All regattas' },
            { value: CLUB_WIDE, label: 'Club-wide only' },
            ...(regattas.data ?? []).map((r) => ({
              value: r.id,
              label: r.name,
              keywords: [r.startDate.slice(0, 4)],
            })),
          ]}
          searchPlaceholder="Search regattas…"
          className="w-full sm:w-56"
        />
        <Select
          label="Person"
          value={filters.actor}
          onValueChange={(v) => setFilter('actor', v)}
          options={[
            { value: ALL, label: 'Anyone' },
            ...(users.data ?? []).map((u) => ({ value: u.id, label: u.name })),
          ]}
          className="w-[calc(50%-4px)] sm:w-44"
        />
        <Select
          label="Kind"
          value={filters.kind}
          onValueChange={(v) => setFilter('kind', v)}
          options={[{ value: ALL, label: 'Every kind' }, ...kindOptions]}
          className="w-[calc(50%-4px)] sm:w-48"
        />
        {filtering && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFilters(EMPTY);
              setLimit(ACTIVITY_PAGE_SIZE);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <ErrorState
          title="The activity log did not load."
          error={error}
          onRetry={() => {
            void log.refetch();
            void users.refetch();
            void regattas.refetch();
          }}
        />
      ) : log.isPending ? (
        <SkeletonRows rows={8} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden />}
          title="Nothing logged yet"
          description="Edits to entries, seats, events, availability, the fleet, and trailer loading show up here with who made them."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No activity matches these filters"
          description="Try fewer words, or clear the filters."
          action={
            <Button onClick={() => setFilters(EMPTY)} size="sm">
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="text-sm text-ink-2 tabular-nums" aria-live="polite">
            {filtered.length === shown.length
              ? `${filtered.length} ${filtered.length === 1 ? 'change' : 'changes'}`
              : `Showing ${shown.length} of ${filtered.length} changes`}
          </p>
          <ol aria-label="Activity" className="flex flex-col">
            {shown.map((e, i) => {
              const day = e.created ? dayFmt.format(new Date(e.created)) : '';
              const prevDay =
                i > 0 && shown[i - 1]!.created
                  ? dayFmt.format(new Date(shown[i - 1]!.created!))
                  : null;
              return (
                <ActivityRow
                  key={e.id}
                  entry={e}
                  heading={day !== prevDay ? day : null}
                  actor={e.actorId ? (userName.get(e.actorId) ?? 'Someone') : 'Someone'}
                  regatta={e.regattaId ? (regattaById.get(e.regattaId) ?? null) : null}
                  when={e.created ? whenOf(e.created) : ''}
                  stamp={e.created ? stampFmt.format(new Date(e.created)) : ''}
                />
              );
            })}
          </ol>
          {filtered.length > shown.length && (
            <div>
              <Button onClick={() => setLimit((n) => n + ACTIVITY_PAGE_SIZE)}>
                Show {Math.min(ACTIVITY_PAGE_SIZE, filtered.length - shown.length)} more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ActivityRow({
  entry,
  heading,
  actor,
  regatta,
  when,
  stamp,
}: {
  entry: ActivityEntry;
  heading: string | null;
  actor: string;
  regatta: { id: string; name: string } | null;
  when: string;
  stamp: string;
}) {
  // Links that need no per-regatta lookups: schedule, availability, fleet, trailer, regatta.
  const link = activityLink(entry);
  return (
    <li className="flex flex-col">
      {heading && (
        <h2 className="border-b border-line pt-4 pb-1.5 text-sm font-medium text-ink-2 first:pt-0">
          {heading}
        </h2>
      )}
      <div className="flex gap-3 border-b border-line py-2.5 last:border-b-0">
        <Avatar name={actor} className="size-7" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-base leading-prose">
            <span className="font-medium">{actor}</span> {entry.summary}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
            {regatta && (
              <Link
                to={`/regattas/${regatta.id}`}
                className="text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                {regatta.name}
              </Link>
            )}
            {regatta && <span aria-hidden>·</span>}
            <span>{kindOf(entry.targetType).label}</span>
            <span aria-hidden>·</span>
            <time dateTime={entry.created} title={stamp} className="tabular-nums">
              {when}
            </time>
            {link && (
              <>
                <span aria-hidden>·</span>
                <Link
                  to={link.href}
                  className="rounded-control text-accent underline-offset-4 hover:underline"
                >
                  {link.label}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </li>
  );
}
