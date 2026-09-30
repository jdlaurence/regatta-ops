// Realtime (PLAN.md §10.3). While someone is signed in, subscribe to every collection the UI
// reads and invalidate its queries when anything changes, batched so a burst of changes
// refetches once. Works the same for PocketBase (server-sent events) and MemoryStore.
//
// useRealtimeEvents(handler) receives every change event after invalidation is scheduled; the
// "Updated by Sarah W. just now" toasts (change-toasts.ts) listen there. Presence is not in the
// subscription list: its heartbeats patch the cache directly (presence.ts) instead of refetching.
//
// While an optimistic write is in flight, invalidation waits for it to settle (up to
// MAX_DEFER_MS). Refetching mid-write would paint the server's older state over the optimistic
// one: the echo of an earlier step of the same write, or someone else's unrelated change to
// the collection. The write's own onSettled refetches what it touched.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CollectionName } from '@srt/domain';
import { useStore } from './context';
import { useCurrentUser } from './hooks';
import { queryKeys } from './query-keys';
import type { ChangeEvent } from './store';

export const REALTIME_COLLECTIONS = [
  'users',
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'availability',
  'events',
  'entries',
  'entry_seats',
  'shells',
  'oar_sets',
  'gear_items',
  'trailers',
  'trailer_shelves',
  'trailer_compartments',
  'load_plans',
  'load_placements',
  'load_items',
  'comments',
  'activity_log',
  'club_settings',
] as const satisfies readonly CollectionName[];

type Listener = (event: ChangeEvent) => void;

const RealtimeContext = createContext<Set<Listener> | null>(null);

const BATCH_MS = 50;
const MAX_DEFER_MS = 10_000;

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const qc = useQueryClient();
  const user = useCurrentUser();
  const [listeners] = useState(() => new Set<Listener>());
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    const pending = new Set<CollectionName>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let deferredSince: number | null = null;
    const flush = () => {
      timer = null;
      if (qc.isMutating() > 0) {
        deferredSince ??= Date.now();
        if (Date.now() - deferredSince < MAX_DEFER_MS) {
          timer = setTimeout(flush, BATCH_MS);
          return;
        }
      }
      deferredSince = null;
      for (const c of pending) void qc.invalidateQueries({ queryKey: queryKeys.collection(c) });
      pending.clear();
    };
    const unsubscribes = REALTIME_COLLECTIONS.map((c) =>
      store.subscribe(c, (event) => {
        pending.add(c);
        timer ??= setTimeout(flush, BATCH_MS);
        for (const l of listeners) l(event as ChangeEvent);
      }),
    );
    return () => {
      for (const u of unsubscribes) u();
      if (timer) clearTimeout(timer);
    };
  }, [store, qc, userId, listeners]);

  return <RealtimeContext.Provider value={listeners}>{children}</RealtimeContext.Provider>;
}

/** Receive every change event (any collection, any author) while mounted. */
export function useRealtimeEvents(handler: Listener) {
  const listeners = useContext(RealtimeContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!listeners) return;
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [listeners]);
}
