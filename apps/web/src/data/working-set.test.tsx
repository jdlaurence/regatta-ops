import { describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { buildSeedWorld } from '@srt/seed';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { MemoryStore } from './memory-store';
import { useFindings, buildConflictInput } from './findings';
import { useCan, useCurrentUser, useUpdate, useBatch } from './hooks';
import { batchOp, StoreError, type DataStore } from './store';
import { useRegattaWorkingSet } from './working-set';

describe('useRegattaWorkingSet', () => {
  it('loads everything a regatta page needs', async () => {
    const store = fixtureStore();
    const { result } = renderHook(() => useRegattaWorkingSet(IDS.regatta), {
      wrapper: dataWrapper(store),
    });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBeDefined());
    const ws = result.current.data!;
    expect(ws.regatta.name).toBe('Head of the Lake');
    // Club defaults (head race: 20 min) under the regatta's own override (45).
    expect(ws.settings.launchLeadMin).toBe(45);
    expect(ws.settings.raceDurationMin).toBe(20);
    expect(ws.events.map((e) => e.eventNumber)).toEqual(['12', '14']);
    expect(ws.entries.map((e) => e.id)).toEqual([IDS.entry1]);
    expect(ws.seatsByEntry.get(IDS.entry1)).toHaveLength(2);
    expect(ws.participatingTeams.map((t) => t.shortName)).toEqual(['Boys', 'Girls']);
    expect(ws.teams).toHaveLength(3);
    // Participating teams' athletes plus the borrowed masters athlete seated in a boys' boat.
    expect(ws.athletes.map((a) => a.firstName).sort()).toEqual([
      'Emery',
      'Jules',
      'Quinn',
      'Rowan',
    ]);
    expect(ws.byId.shells.get(IDS.shell)!.name).toBe('Spencer');
    expect(ws.trailers).toHaveLength(1);
    expect(ws.shelves).toHaveLength(1);
    expect(ws.loadPlans).toEqual([]);
    expect(ws.placements).toEqual([]);
    expect(ws.users).toHaveLength(3);
  });

  it('reports a missing regatta', async () => {
    const store = fixtureStore();
    const { result } = renderHook(() => useRegattaWorkingSet('missing00000000'), {
      wrapper: dataWrapper(store),
    });
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });

  it('follows changes made elsewhere through realtime', async () => {
    const store = fixtureStore();
    const { result } = renderHook(() => useRegattaWorkingSet(IDS.regatta), {
      wrapper: dataWrapper(store),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    await act(() =>
      store.create('entries', {
        regattaId: IDS.regatta,
        eventId: IDS.event2,
        teamId: IDS.girls,
        label: 'V8',
        boatClass: '8+',
        status: 'draft',
      }),
    );
    await waitFor(() => expect(result.current.data!.entries).toHaveLength(2));
  });

  it('works on the seed world', async () => {
    const { world } = buildSeedWorld();
    const regatta = world.regattas[0]!;
    const store = new MemoryStore({ world, userId: world.users[0]!.id });
    const { result } = renderHook(() => useRegattaWorkingSet(regatta.id), {
      wrapper: dataWrapper(store),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.regatta.id).toBe(regatta.id);
  });
});

/** A store whose updates wait until released, to watch optimistic state. */
function gatedStore(inner: DataStore) {
  let release: (ok: boolean) => void = () => {};
  const store: DataStore = Object.create(inner) as DataStore;
  store.update = (async (...args: Parameters<DataStore['update']>) => {
    const ok = await new Promise<boolean>((r) => (release = r));
    if (!ok) throw new StoreError('forbidden', 'Your role cannot make this change.', 403);
    return inner.update(...args);
  }) as DataStore['update'];
  return { store, release: (ok: boolean) => release(ok) };
}

describe('optimistic writes', () => {
  it('shows an update at once and keeps it when the store agrees', async () => {
    const { store, release } = gatedStore(fixtureStore());
    const { result } = renderHook(
      () => ({ ws: useRegattaWorkingSet(IDS.regatta), update: useUpdate('entries') }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data).toBeDefined());
    act(() => result.current.update.mutate({ id: IDS.entry1, patch: { label: '2V4+' } }));
    await waitFor(() =>
      expect(result.current.ws.data!.byId.entries.get(IDS.entry1)!.label).toBe('2V4+'),
    );
    await act(async () => release(true));
    await waitFor(() => expect(result.current.update.isSuccess).toBe(true));
    expect(result.current.ws.data!.byId.entries.get(IDS.entry1)!.label).toBe('2V4+');
  });

  it('rolls back when the store refuses', async () => {
    const { store, release } = gatedStore(fixtureStore());
    const { result } = renderHook(
      () => ({
        ws: useRegattaWorkingSet(IDS.regatta),
        update: useUpdate('entries', { errorMessage: false }),
      }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data).toBeDefined());
    act(() => result.current.update.mutate({ id: IDS.entry1, patch: { label: 'Nope' } }));
    await waitFor(() =>
      expect(result.current.ws.data!.byId.entries.get(IDS.entry1)!.label).toBe('Nope'),
    );
    await act(async () => release(false));
    await waitFor(() => expect(result.current.update.isError).toBe(true));
    expect(result.current.ws.data!.byId.entries.get(IDS.entry1)!.label).toBe('V4+');
  });

  it('applies a batch in order (seat swap)', async () => {
    const store = fixtureStore();
    const { result } = renderHook(
      () => ({ ws: useRegattaWorkingSet(IDS.regatta), batch: useBatch() }),
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.ws.data).toBeDefined());
    await act(() =>
      result.current.batch.mutateAsync([
        batchOp.update('entry_seats', 'seatentry1s0001', { athleteId: null }),
        batchOp.update('entry_seats', 'seatentry1s0002', { athleteId: 'athboys00000001' }),
        batchOp.update('entry_seats', 'seatentry1s0001', { athleteId: 'athmasters00001' }),
      ]),
    );
    const seated = () =>
      Object.fromEntries(
        result.current.ws.data!.seatsByEntry.get(IDS.entry1)!.map((s) => [s.seat, s.athleteId]),
      );
    await waitFor(() =>
      expect(seated()).toEqual({ '1': 'athmasters00001', '2': 'athboys00000001' }),
    );
  });
});

describe('useFindings', () => {
  it('builds the engine input from the working set', async () => {
    const store = fixtureStore();
    const { result } = renderHook(() => useFindings(IDS.regatta), { wrapper: dataWrapper(store) });
    await waitFor(() => expect(result.current.input).not.toBeNull());
    const input = result.current.input!;
    expect(input.timezone).toBe('America/Los_Angeles');
    expect(input.seasonYear).toBe(2026);
    expect(input.settings.launchLeadMin).toBe(45);
    expect(input.entries).toHaveLength(1);
    // No load plan yet, so no "not on trailer" findings.
    expect(input.loadPlacements).toBeUndefined();
    expect(Array.isArray(result.current.findings)).toBe(true);
    expect(result.current.counts).toEqual({
      error: result.current.findings.filter((f) => f.severity === 'error').length,
      warning: result.current.findings.filter((f) => f.severity === 'warning').length,
      info: result.current.findings.filter((f) => f.severity === 'info').length,
    });
    expect(buildConflictInput(result.current.workingSet!)).toEqual(input);
  });
});

describe('roles', () => {
  it('reads the current user and checks actions by role', async () => {
    const store = fixtureStore({ signedIn: IDS.viewer });
    const { result } = renderHook(
      () => ({
        user: useCurrentUser(),
        edit: useCan('regatta.edit'),
        comment: useCan('comment'),
        admin: useCan('team.manage'),
      }),
      { wrapper: dataWrapper(store) },
    );
    expect(result.current.user!.name).toBe('Vic Viewer');
    expect(result.current).toMatchObject({ edit: false, comment: true, admin: false });
    await act(() => store.auth.signInWithPassword('admin@srt.local', ''));
    expect(result.current).toMatchObject({ edit: true, admin: true });
  });
});
