// Offline reads (PLAN.md §10.4). TanStack Query's cache is saved to IndexedDB on this device
// and restored on the next load, so a regatta opened in the last week renders with no
// connection: schedule, lineups, trailer, load list. Writes still need the server (online.ts).
//
// What is saved: successful ['regatta-ops', ...] queries (every DataStore list and record) fetched in
// the last CACHE_MAX_AGE, except presence and lists too long to be worth it. Older versions of
// the working set's id-keyed lists are dropped (dropSupersededLists). Mutations are never
// saved: there is no offline write queue in v1.

import { createStore, del, get, set } from 'idb-keyval';
import type { DehydratedState, OmitKeyof, Query } from '@tanstack/react-query';
import type {
  PersistedClient,
  Persister,
  PersistQueryClientOptions,
} from '@tanstack/react-query-persist-client';
import type { NormalizedQuery } from './query-keys';

/** How long a saved copy is good for. Also the queries' gcTime, so navigating away keeps them. */
export const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Bump when a saved record would no longer fit the code that reads it and the build's schema
 * fingerprint (VITE_CACHE_BUSTER: app version plus a hash of pb-types.ts, schema.ts,
 * pb-mapper.ts, and the domain types) would not notice.
 */
const CACHE_SCHEMA = 1;

export const CACHE_BUSTER = `${import.meta.env.VITE_CACHE_BUSTER ?? 'dev'}:${CACHE_SCHEMA}`;

/** Collections never saved on the device. */
const NOT_PERSISTED: ReadonlySet<string> = new Set(['presence']);

/** Lists longer than this stay in memory only. */
const MAX_PERSISTED_ROWS = 5_000;

/** Whether a query is saved on the device. */
export function shouldPersistQuery(query: Query, now = Date.now()): boolean {
  const [root, collection] = query.queryKey;
  if (root !== 'regatta-ops' || typeof collection !== 'string' || NOT_PERSISTED.has(collection)) {
    return false;
  }
  // Keep the last good data even if a later refetch failed; skip anything never loaded.
  if (query.state.data === undefined) return false;
  if (now - query.state.dataUpdatedAt > CACHE_MAX_AGE) return false;
  const data = query.state.data;
  if (Array.isArray(data) && data.length > MAX_PERSISTED_ROWS) return false;
  return true;
}

type DehydratedQuery = DehydratedState['queries'][number];

/**
 * `in` filters over ids of records that belong to one regatta. Two lists whose ids overlap are
 * versions of the same regatta's list (an entry was added, so the seats query key changed);
 * only the newest is worth keeping. Other `in` lists (athletes by team) are shared across
 * regattas and change rarely, so they are all kept.
 */
const VERSIONED_IN_FIELDS: Readonly<Record<string, string>> = {
  entry_seats: 'entryId',
  load_placements: 'loadPlanId',
};

function versionedList(key: readonly unknown[]): { group: string; ids: unknown[] } | null {
  const [root, collection, kind, query] = key;
  if (root !== 'regatta-ops' || kind !== 'list' || typeof collection !== 'string') return null;
  const field = VERSIONED_IN_FIELDS[collection];
  const q = query as NormalizedQuery | undefined;
  const ids = field ? q?.in?.[field] : undefined;
  if (!ids || Object.keys(q?.in ?? {}).length !== 1) return null;
  return { group: JSON.stringify([collection, q?.where ?? null, q?.sort ?? null]), ids };
}

/** Drop older versions of the working set's id-keyed lists (see VERSIONED_IN_FIELDS). */
export function dropSupersededLists(queries: readonly DehydratedQuery[]): DehydratedQuery[] {
  const newestFirst = [...queries].sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  const lineages = new Map<string, Set<unknown>[]>();
  const dropped = new Set<DehydratedQuery>();
  for (const q of newestFirst) {
    const list = versionedList(q.queryKey);
    if (!list) continue;
    const groups = lineages.get(list.group) ?? [];
    lineages.set(list.group, groups);
    const lineage = groups.find((ids) => list.ids.some((id) => ids.has(id)));
    if (lineage) {
      // Older version: drop it, but remember its ids so still older versions chain on.
      dropped.add(q);
      for (const id of list.ids) lineage.add(id);
    } else {
      groups.push(new Set(list.ids));
    }
  }
  return queries.filter((q) => !dropped.has(q));
}

/** What goes into IndexedDB: plain data, no errors or in-flight state, no stale versions. */
export function compactForDevice(client: PersistedClient): PersistedClient {
  const queries = dropSupersededLists(client.clientState.queries).map(
    ({ promise: _inFlight, ...q }): DehydratedQuery => ({
      ...q,
      state: {
        ...q.state,
        status: 'success',
        fetchStatus: 'idle',
        error: null,
        fetchFailureCount: 0,
        fetchFailureReason: null,
      },
    }),
  );
  return { ...client, clientState: { mutations: [], queries } };
}

// ---------------------------------------------------------------------------
// The IndexedDB persister

/** Key-value storage; idb-keyval in the browser, a Map in some tests. */
export interface DeviceStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

export interface DevicePersister extends Persister {
  /** Write any pending save now (page hide, tests). */
  flush(): Promise<void>;
}

const STORAGE_KEY = 'query-cache';

function idbStorage(): DeviceStorage {
  const store = createStore('regatta-ops', 'offline');
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  };
}

export interface IdbPersisterOptions {
  storage?: DeviceStorage;
  /** Saves run at most this often; the latest state wins. */
  throttleMs?: number;
}

/**
 * Saves the query cache to IndexedDB, throttled. Null where IndexedDB is missing (some private
 * modes, tests without fake-indexeddb): the app then works online only.
 */
export function createIdbPersister({
  storage,
  throttleMs = 1_000,
}: IdbPersisterOptions = {}): DevicePersister | null {
  if (!storage && typeof indexedDB === 'undefined') return null;
  const db = storage ?? idbStorage();
  let pending: PersistedClient | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const write = async () => {
    const client = pending;
    pending = null;
    if (!client) return;
    try {
      await db.set(STORAGE_KEY, compactForDevice(client));
    } catch (err) {
      // Full disk or a blocked database: keep working online; the last good save stays.
      console.warn('Regatta Ops could not save data for offline use.', err);
    }
  };
  const writeNow = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    writing = writing.then(write);
    return writing;
  };

  return {
    persistClient(client) {
      pending = client;
      timer ??= setTimeout(() => void writeNow(), throttleMs);
    },
    async restoreClient() {
      return (await db.get(STORAGE_KEY)) as PersistedClient | undefined;
    },
    async removeClient() {
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      await writing;
      await db.del(STORAGE_KEY);
    },
    flush: writeNow,
  };
}

/** Options for PersistQueryClientProvider. */
export function persistOptions(
  persister: Persister,
): OmitKeyof<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister,
    maxAge: CACHE_MAX_AGE,
    buster: CACHE_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => shouldPersistQuery(query),
      shouldDehydrateMutation: () => false,
    },
  };
}
