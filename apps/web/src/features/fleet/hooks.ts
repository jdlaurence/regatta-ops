// Fleet data hooks: teams for chips and pickers, the viewer's weight unit, today in the club's
// timezone, and a shell's or oar set's upcoming use. Reads go through the generic data hooks.

import { useMemo, useSyncExternalStore } from 'react';
import type { Team } from '@regatta-ops/domain';
import { useCurrentUser, useList } from '@/data';
import { todayIn } from '@/lib/dates';
import { upcomingUsage, type UsageGroup } from './lib';

/** Teams in their sort order, and a lookup by id. */
export function useFleetTeams() {
  const q = useList('teams', { sort: ['sortOrder', 'name'] });
  const byId = useMemo(() => new Map((q.data ?? []).map((t) => [t.id, t])), [q.data]);
  return { teams: q.data ?? [], byId, isPending: q.isPending };
}

/** Team options for a home-team picker: active teams, plus the current one if archived. */
export function teamOptions(teams: readonly Team[], current?: string | null) {
  return teams
    .filter((t) => !t.archived || t.id === current)
    .map((t) => ({ value: t.id, label: t.name }));
}

function useClubSettings() {
  const q = useList('club_settings');
  return q.data?.[0] ?? null;
}

/** The viewer's weight unit: their preference, else the club's, else pounds. */
export function useWeightUnit(): 'kg' | 'lb' {
  const user = useCurrentUser();
  const club = useClubSettings();
  return user?.preferences.weightUnit ?? club?.weightUnit ?? 'lb';
}

/** Today as 'YYYY-MM-DD' in the club's timezone. */
export function useClubToday(): string {
  const club = useClubSettings();
  return todayIn(club?.timezone ?? 'America/Los_Angeles');
}

/** Whether a CSS media query matches, following changes (phone card layout vs table). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Tables from 768 px up; stacked cards on phones. */
export function useWideLayout(): boolean {
  return useMediaQuery('(min-width: 768px)');
}

export interface UsageResult {
  groups: UsageGroup[];
  count: number;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Entries using this shell or oar set in regattas that are not archived and not over. */
export function useUpcomingUsage(kind: 'shell' | 'oarSet', id: string | null): UsageResult {
  const entries = useList(
    'entries',
    kind === 'shell' ? { where: { shellId: id ?? '' } } : { where: { oarSetId: id ?? '' } },
    { enabled: !!id },
  );
  const regattas = useList('regattas');
  const eventIds = useMemo(
    () => Array.from(new Set((entries.data ?? []).map((e) => e.eventId).filter(Boolean))),
    [entries.data],
  ) as string[];
  const events = useList('events', { in: { id: eventIds } }, { enabled: eventIds.length > 0 });
  const today = useClubToday();

  const groups = useMemo(
    () =>
      upcomingUsage({
        entries: entries.data ?? [],
        regattas: regattas.data ?? [],
        events: events.data ?? [],
        today,
      }),
    [entries.data, regattas.data, events.data, today],
  );
  const queries = [entries, regattas, ...(eventIds.length > 0 ? [events] : [])];
  return {
    groups,
    count: groups.reduce((n, g) => n + g.rows.length, 0),
    isPending: !id ? false : queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.error)?.error,
    refetch: () => {
      for (const q of queries) void q.refetch();
    },
  };
}
