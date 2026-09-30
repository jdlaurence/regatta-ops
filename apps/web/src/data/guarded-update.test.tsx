import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { CONFLICT_TOAST } from './concurrency';
import { useGuardedUpdate } from './guarded-update';
import { StoreError, type DataStore } from './store';
import { useRegattaWorkingSet } from './working-set';

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(() => {}, {
    warning: (() => {}) as (msg: string) => void,
    error: (() => {}) as (msg: string) => void,
    success: (() => {}) as (msg: string) => void,
  }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

/** A clock that moves one second per write, so every write gets a distinct `updated`. */
function tickingStore() {
  let t = 0;
  return fixtureStore({ now: () => new Date(Date.UTC(2026, 9, 1, 12, 0, t++)).toISOString() });
}

async function seedPlacement(store: DataStore) {
  await store.create('load_plans', {
    id: IDS.plan,
    regattaId: IDS.regatta,
    trailerId: IDS.trailer,
    status: 'draft',
    rules: [],
  });
  return store.create('load_placements', {
    loadPlanId: IDS.plan,
    shellId: IDS.shell,
    shelfId: IDS.shelf,
    lane: 0,
    offsetCm: 0,
    bowForward: false,
    locked: false,
    reasons: [],
  });
}

describe('MemoryStore stale-write check (concurrency.pb.js)', () => {
  it('guards events and load placements, and accepts PocketBase-style stamps', async () => {
    const store = tickingStore();
    const placement = await seedPlacement(store);
    await store.update('load_placements', placement.id, { lane: 1 });
    await expect(
      store.update(
        'load_placements',
        placement.id,
        { lane: 2 },
        {
          expectedUpdated: placement.updated,
        },
      ),
    ).rejects.toMatchObject({ code: 'conflict', status: 409 });

    // Seed and fixture records carry no stamp until their first write.
    const ev = await store.update('events', IDS.event1, { notes: 'Stamped' });
    const pbStyle = ev.updated!.replace('T', ' ');
    await expect(
      store.update('events', ev.id, { notes: 'ok' }, { expectedUpdated: pbStyle }),
    ).resolves.toMatchObject({ notes: 'ok' });
  });

  it('ignores expectedUpdated elsewhere, as the server does', async () => {
    const store = tickingStore();
    await expect(
      store.update('entries', IDS.entry1, { label: 'X' }, { expectedUpdated: 'long ago' }),
    ).resolves.toMatchObject({ label: 'X' });
  });
});

describe('useGuardedUpdate', () => {
  beforeEach(() => {
    vi.spyOn(toastMock, 'warning');
    vi.spyOn(toastMock, 'error');
  });

  it('rolls back, refetches, and says so when someone else changed the record first', async () => {
    const store = tickingStore();
    await store.update('events', IDS.event1, { notes: 'Stamped' });
    const onConflict = vi.fn();
    const { result } = renderHook(
      () => ({
        ws: useRegattaWorkingSet(IDS.regatta),
        move: useGuardedUpdate('events', { onConflict }),
      }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data).toBeDefined());
    const seen = result.current.ws.data!.byId.events.get(IDS.event1)!;

    // Another coach renames the event after this one loaded it.
    await store.update('events', IDS.event1, { name: "Men's Junior 4+ (renamed)" });

    const later = '2026-11-01T17:55:00.000Z';
    await act(async () => {
      await result.current.move
        .mutateAsync({
          id: IDS.event1,
          patch: { scheduledAt: later },
          expectedUpdated: seen.updated,
        })
        .catch(() => undefined);
    });
    await waitFor(() => expect(result.current.move.isError).toBe(true));
    expect(result.current.move.error).toBeInstanceOf(StoreError);
    expect((result.current.move.error as StoreError).code).toBe('conflict');
    expect(toastMock.warning).toHaveBeenCalledWith(CONFLICT_TOAST);
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(1);
    // The time did not change; the other coach's rename is showing.
    await waitFor(() =>
      expect(result.current.ws.data!.byId.events.get(IDS.event1)!.name).toBe(
        "Men's Junior 4+ (renamed)",
      ),
    );
    expect(result.current.ws.data!.byId.events.get(IDS.event1)!.scheduledAt).toBe(seen.scheduledAt);
    expect((await store.get('events', IDS.event1))!.scheduledAt).toBe(seen.scheduledAt);
  });

  it('reads the stamp from the cache and does not trip on its own quick successive writes', async () => {
    const store = tickingStore();
    const placement = await seedPlacement(store);
    const { result } = renderHook(
      () => ({
        ws: useRegattaWorkingSet(IDS.regatta),
        nudge: useGuardedUpdate('load_placements'),
      }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data?.placements).toHaveLength(1));

    // Three arrow-key nudges before any write returns: each expects the stamp it saw.
    let results: unknown[] = [];
    await act(async () => {
      results = await Promise.all(
        [10, 20, 30].map((offsetCm) =>
          result.current.nudge.mutateAsync({ id: placement.id, patch: { offsetCm } }),
        ),
      );
    });
    expect(results).toHaveLength(3);
    expect(toastMock.warning).not.toHaveBeenCalled();
    expect((await store.get('load_placements', placement.id))!.offsetCm).toBe(30);
    await waitFor(() => expect(result.current.ws.data!.placements[0]!.offsetCm).toBe(30));

    // And a later nudge still goes through with the refreshed stamp.
    await act(() =>
      result.current.nudge.mutateAsync({ id: placement.id, patch: { offsetCm: 40 } }),
    );
    expect((await store.get('load_placements', placement.id))!.offsetCm).toBe(40);
  });

  it('shows the store message for other failures', async () => {
    const store = tickingStore();
    const { result } = renderHook(() => useGuardedUpdate('events'), {
      wrapper: dataWrapper(store),
    });
    await act(async () => {
      await result.current
        .mutateAsync({ id: 'missing00000000', patch: { name: 'x' } })
        .catch(() => undefined);
    });
    expect(toastMock.error).toHaveBeenCalledWith('That record no longer exists.');
    expect(toastMock.warning).not.toHaveBeenCalled();
  });
});
