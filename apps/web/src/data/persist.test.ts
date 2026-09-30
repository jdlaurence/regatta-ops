import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, type DehydratedState } from '@tanstack/react-query';
import {
  persistQueryClientRestore,
  persistQueryClientSave,
  type PersistedClient,
} from '@tanstack/react-query-persist-client';
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE,
  compactForDevice,
  createIdbPersister,
  dropSupersededLists,
  persistOptions,
  shouldPersistQuery,
  type DeviceStorage,
} from './persist';
import { queryKeys } from './query-keys';

type DehydratedQuery = DehydratedState['queries'][number];

const DAY = 24 * 60 * 60 * 1000;

const eventsKey = (regattaId: string) => queryKeys.list('events', { where: { regattaId } });
const seatsKey = (entryIds: string[]) =>
  queryKeys.list('entry_seats', { in: { entryId: entryIds } });

function clientWith(entries: [readonly unknown[], unknown, number?][]): QueryClient {
  const qc = new QueryClient({ defaultOptions: { queries: { gcTime: CACHE_MAX_AGE } } });
  for (const [key, data, updatedAt] of entries) qc.setQueryData(key, data, { updatedAt });
  return qc;
}

function query(qc: QueryClient, key: readonly unknown[]) {
  return qc.getQueryCache().find({ queryKey: key, exact: true })!;
}

function mapStorage(): DeviceStorage & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async (k) => map.get(k),
    set: vi.fn(async (k: string, v: unknown) => void map.set(k, v)),
    del: async (k) => void map.delete(k),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('the IndexedDB persister', () => {
  it('saves and restores the query cache through IndexedDB', async () => {
    const persister = createIdbPersister({ throttleMs: 0 })!;
    const source = clientWith([[eventsKey('r1'), [{ id: 'e1', eventNumber: '12' }]]]);
    await persistQueryClientSave({ queryClient: source, ...persistOptions(persister) });
    await persister.flush();

    const target = new QueryClient();
    await persistQueryClientRestore({ queryClient: target, ...persistOptions(persister) });
    expect(target.getQueryData(eventsKey('r1'))).toEqual([{ id: 'e1', eventNumber: '12' }]);

    await persister.removeClient();
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it('writes at most once per interval, with the latest cache', async () => {
    vi.useFakeTimers();
    const storage = mapStorage();
    const persister = createIdbPersister({ storage, throttleMs: 1_000 })!;
    const client = (n: number): PersistedClient => ({
      buster: 'b',
      timestamp: n,
      clientState: { queries: [], mutations: [] },
    });
    persister.persistClient(client(1));
    persister.persistClient(client(2));
    persister.persistClient(client(3));
    expect(storage.set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(storage.set).toHaveBeenCalledOnce();
    expect((storage.map.get('query-cache') as PersistedClient).timestamp).toBe(3);
  });

  it('keeps working when IndexedDB refuses a write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = mapStorage();
    storage.set = () => Promise.reject(new DOMException('Quota exceeded', 'QuotaExceededError'));
    const persister = createIdbPersister({ storage, throttleMs: 0 })!;
    persister.persistClient({
      buster: 'b',
      timestamp: 1,
      clientState: { queries: [], mutations: [] },
    });
    await expect(persister.flush()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('restores nothing from another app version or schema', async () => {
    const storage = mapStorage();
    const persister = createIdbPersister({ storage, throttleMs: 0 })!;
    const source = clientWith([[eventsKey('r1'), []]]);
    await persistQueryClientSave({
      queryClient: source,
      ...persistOptions(persister),
      buster: 'an older build',
    });
    await persister.flush();

    const target = new QueryClient();
    await persistQueryClientRestore({ queryClient: target, ...persistOptions(persister) });
    expect(target.getQueryData(eventsKey('r1'))).toBeUndefined();
    expect(storage.map.size).toBe(0);
    expect(CACHE_BUSTER).toMatch(/:\d+$/);
  });

  it('restores nothing saved more than a week ago', async () => {
    const storage = mapStorage();
    const persister = createIdbPersister({ storage, throttleMs: 0 })!;
    await persistQueryClientSave({
      queryClient: clientWith([[eventsKey('r1'), []]]),
      ...persistOptions(persister),
    });
    await persister.flush();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 8 * DAY);
    const target = new QueryClient();
    await persistQueryClientRestore({ queryClient: target, ...persistOptions(persister) });
    expect(target.getQueryData(eventsKey('r1'))).toBeUndefined();
  });
});

describe('what is saved', () => {
  const now = Date.now();

  it('saves every DataStore list and record', () => {
    const qc = clientWith([
      [eventsKey('r1'), []],
      [queryKeys.record('regattas', 'r1'), { id: 'r1' }],
    ]);
    expect(shouldPersistQuery(query(qc, eventsKey('r1')), now)).toBe(true);
    expect(shouldPersistQuery(query(qc, queryKeys.record('regattas', 'r1')), now)).toBe(true);
  });

  it('skips presence, keys outside the store, and queries that never loaded', () => {
    const qc = clientWith([
      [queryKeys.list('presence'), []],
      [['something-else'], 1],
    ]);
    qc.getQueryCache().build(qc, { queryKey: eventsKey('never') });
    expect(shouldPersistQuery(query(qc, queryKeys.list('presence')), now)).toBe(false);
    expect(shouldPersistQuery(query(qc, ['something-else']), now)).toBe(false);
    expect(shouldPersistQuery(query(qc, eventsKey('never')), now)).toBe(false);
  });

  it('keeps the last good data when a later refetch failed', () => {
    const qc = clientWith([[eventsKey('r1'), [{ id: 'e1' }]]]);
    query(qc, eventsKey('r1')).setState({ status: 'error', error: new Error('offline') });
    expect(shouldPersistQuery(query(qc, eventsKey('r1')), now)).toBe(true);
  });

  it('skips data older than a week and very long lists', () => {
    const qc = clientWith([
      [eventsKey('old'), [], now - 8 * DAY],
      [eventsKey('huge'), Array.from({ length: 5_001 }, (_, i) => ({ id: String(i) }))],
    ]);
    expect(shouldPersistQuery(query(qc, eventsKey('old')), now)).toBe(false);
    expect(shouldPersistQuery(query(qc, eventsKey('huge')), now)).toBe(false);
  });
});

describe('compacting the saved cache', () => {
  function dehydrated(key: readonly unknown[], updatedAt: number): DehydratedQuery {
    return {
      queryKey: key,
      queryHash: JSON.stringify(key),
      dehydratedAt: updatedAt,
      state: {
        data: [],
        dataUpdateCount: 1,
        dataUpdatedAt: updatedAt,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: 'success',
        fetchStatus: 'idle',
      },
    };
  }

  it("keeps only the newest version of a regatta's seats as entries come and go", () => {
    const v1 = dehydrated(seatsKey(['a']), 1);
    const v2 = dehydrated(seatsKey(['a', 'b']), 2);
    const v3 = dehydrated(seatsKey(['b', 'c']), 3); // a deleted, c added
    const otherRegatta = dehydrated(seatsKey(['x', 'y']), 2);
    const athletesA = dehydrated(queryKeys.list('athletes', { in: { teamId: ['boys'] } }), 1);
    const athletesB = dehydrated(
      queryKeys.list('athletes', { in: { teamId: ['boys', 'girls'] } }),
      2,
    );
    const kept = dropSupersededLists([v1, v2, v3, otherRegatta, athletesA, athletesB]);
    expect(kept).toEqual([v3, otherRegatta, athletesA, athletesB]);
  });

  it('keeps plain data only: no errors, no in-flight state, status success', () => {
    const q = dehydrated(eventsKey('r1'), 5);
    q.state = {
      ...q.state,
      status: 'error',
      fetchStatus: 'fetching',
      error: new Error('offline'),
      fetchFailureCount: 2,
      fetchFailureReason: new Error('offline'),
    };
    q.promise = Promise.resolve([]);
    const out = compactForDevice({
      buster: 'b',
      timestamp: 1,
      clientState: { queries: [q], mutations: [] },
    });
    const [saved] = out.clientState.queries;
    expect(saved).not.toHaveProperty('promise');
    expect(saved!.state).toMatchObject({
      status: 'success',
      fetchStatus: 'idle',
      error: null,
      fetchFailureCount: 0,
      fetchFailureReason: null,
      dataUpdatedAt: 5,
    });
    expect(() => structuredClone(out)).not.toThrow();
  });
});
