// The phone checklist's state: the share page's load items with ticks shown at once, a queue for
// ticks made without a connection, and the replay when it comes back. The queue lives on the
// device (offline-queue.ts), so closing the page offline loses nothing.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  applyTick,
  isShareGone,
  isTransientShareError,
  setShareItem,
  shareQueryKey,
  StoreError,
  useShareApi,
  useTickShareItem,
  type ShareLoadItem,
} from '@/data';
import { TickQueue, type QueuedTick, type TickField } from './offline-queue';

/** How often to try again while ticks wait and the browser says it is online. */
const RETRY_MS = 20_000;

export const NAME_STORAGE_KEY = 'regatta-ops-share-name';

// ---------------------------------------------------------------------------
// Online state

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** navigator.onLine, live. It can say online with no real connection; failures still queue. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

// ---------------------------------------------------------------------------
// The typed name, remembered on the device (a per-viewer convenience).

function readName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function useRememberedName(): [string, (name: string) => void] {
  const [name, setNameState] = useState(readName);
  const setName = useCallback((next: string) => {
    setNameState(next);
    try {
      if (next.trim()) localStorage.setItem(NAME_STORAGE_KEY, next);
      else localStorage.removeItem(NAME_STORAGE_KEY);
    } catch {
      // Storage blocked: the name lasts for this page load.
    }
  }, []);
  return [name, setName];
}

// ---------------------------------------------------------------------------

export interface ChecklistLine extends ShareLoadItem {
  /** Boxes with a tick still waiting to reach the server. */
  pending: TickField[];
}

export interface LoadChecklist {
  lines: ChecklistLine[];
  /** Tick or untick a box. `by` is the name typed on the page. */
  tick: (itemId: string, field: TickField, value: boolean) => void;
  /** Ticks waiting to sync. */
  waiting: number;
  online: boolean;
  syncing: boolean;
  /** Try sending the waiting ticks now. */
  syncNow: () => void;
}

/** Apply the waiting ticks on top of what the server last said, so a refetch never undoes them. */
export function withQueued(
  items: readonly ShareLoadItem[],
  queued: readonly QueuedTick[],
): ChecklistLine[] {
  return items.map((item) => {
    let line: ChecklistLine = { ...item, pending: [] };
    for (const q of queued) {
      if (q.itemId !== item.id) continue;
      line = { ...applyTick(line, { [q.field]: q.value, by: q.by }, q.at), pending: line.pending };
      if (!line.pending.includes(q.field)) line.pending = [...line.pending, q.field];
    }
    return line;
  });
}

const queues = new Map<string, TickQueue>();

/** One queue object per link for the page's life, shared by every component using it. */
export function queueFor(token: string): TickQueue {
  let q = queues.get(token);
  if (!q) {
    q = new TickQueue(token);
    queues.set(token, q);
  }
  return q;
}

/** For tests: forget the cached queue objects (their storage stays). */
export function resetQueues() {
  queues.clear();
}

export function useLoadChecklist(
  token: string,
  items: readonly ShareLoadItem[] | undefined,
  name: string,
): LoadChecklist {
  const api = useShareApi();
  const qc = useQueryClient();
  const online = useOnline();
  const queue = useMemo(() => queueFor(token), [token]);
  const queued = useSyncExternalStore(
    useCallback((cb) => queue.subscribe(cb), [queue]),
    () => queue.list(),
    () => queue.list(),
  );
  const [syncing, setSyncing] = useState(false);
  // Labels for failure toasts; read in callbacks only, so replays do not restart with each fetch.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const replay = useCallback(() => {
    if (queue.size === 0 || !navigator.onLine) return;
    setSyncing(true);
    void queue
      .replay(async (t) => {
        const item = await api.tickLoadItem(token, t.itemId, { [t.field]: t.value, by: t.by });
        setShareItem(qc, token, item);
      }, isTransientShareError)
      .then((result) => {
        for (const { tick, error } of result.dropped) {
          const label = itemsRef.current?.find((i) => i.id === tick.itemId)?.label ?? 'a line';
          const why = error instanceof StoreError ? error.message : 'The server refused it.';
          toast.error(`A tick on ${label} was not saved. ${why}`);
        }
        if (result.dropped.some((d) => isShareGone(d.error)) || result.remaining === 0) {
          void qc.invalidateQueries({ queryKey: shareQueryKey(token) });
        }
      })
      .finally(() => setSyncing(false));
  }, [api, qc, queue, token]);

  const mutation = useTickShareItem(token, {
    // No connection: keep the tick on screen and queue it.
    keepOnError: (error, vars) => {
      if (!isTransientShareError(error)) return false;
      const field: TickField = typeof vars.loaded === 'boolean' ? 'loaded' : 'returned';
      queue.add({
        itemId: vars.itemId,
        field,
        value: (vars[field] as boolean | undefined) ?? false,
        by: vars.by ?? '',
        at: new Date().toISOString(),
      });
      return true;
    },
    // The connection works: send anything still waiting.
    onSuccess: () => replay(),
  });
  const { mutate } = mutation;

  const tick = useCallback(
    (itemId: string, field: TickField, value: boolean) => {
      const by = name.trim();
      const waiting = queue.list().some((q) => q.itemId === itemId && q.field === field);
      if (!navigator.onLine || waiting) {
        // Offline, or this box already waits: queue behind it so the order holds.
        const item = items?.find((i) => i.id === itemId);
        if (item) setShareItem(qc, token, applyTick(item, { [field]: value, by }));
        queue.add({ itemId, field, value, by, at: new Date().toISOString() });
        return;
      }
      mutate({ itemId, [field]: value, by });
    },
    [name, queue, items, qc, token, mutate],
  );

  // Send waiting ticks on load, when the connection returns, and every little while.
  useEffect(() => {
    if (!online || queued.length === 0) return;
    const first = setTimeout(replay, 0);
    const every = setInterval(replay, RETRY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [online, queued.length, replay]);

  // Another tab on the same link changed the queue.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === queue.storageKey) queue.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [queue]);

  const lines = useMemo(() => withQueued(items ?? [], queued), [items, queued]);

  return { lines, tick, waiting: queued.length, online, syncing, syncNow: replay };
}
