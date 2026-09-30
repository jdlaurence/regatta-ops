// Read-only while offline (PLAN.md §10.4): useCan turns every action off, writes refuse before
// anything changes on screen, and queries with nothing saved say so instead of loading forever.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper, testQueryClient } from '@/test/render';
import { useCan, useList, useRecord, useUpdate } from './hooks';
import {
  bridgeQueryOnlineManager,
  OFFLINE_EDIT_MESSAGE,
  OFFLINE_TOAST_ID,
  OfflineError,
} from './online';
import { can } from './permissions';
import { queryKeys } from './query-keys';

const goOffline = () => act(() => void window.dispatchEvent(new Event('offline')));
const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));

beforeEach(() => {
  // As createQueryClient does: queries pause and resume with the app's network status. Again
  // before each test, because TanStack drops its listener when the last test client unmounts.
  bridgeQueryOnlineManager();
});

afterEach(() => {
  window.dispatchEvent(new Event('online'));
});

describe('can', () => {
  it('turns every action off while offline', () => {
    expect(can('coach', 'regatta.edit')).toBe(true);
    expect(can('coach', 'regatta.edit', { online: true })).toBe(true);
    expect(can('coach', 'regatta.edit', { online: false })).toBe(false);
    expect(can('admin', 'settings.manage', { online: false })).toBe(false);
    expect(can('viewer', 'comment', { online: false })).toBe(false);
  });
});

describe('useCan', () => {
  it('answers false while offline and true again when the connection returns', () => {
    const { result } = renderHook(
      () => ({ edit: useCan('regatta.edit'), load: useCan('load.edit') }),
      { wrapper: dataWrapper(fixtureStore()) },
    );
    expect(result.current).toEqual({ edit: true, load: true });
    goOffline();
    expect(result.current).toEqual({ edit: false, load: false });
    goOnline();
    expect(result.current).toEqual({ edit: true, load: true });
  });

  it('still answers by role when online', () => {
    const { result } = renderHook(() => useCan('regatta.edit'), {
      wrapper: dataWrapper(fixtureStore({ signedIn: IDS.viewer })),
    });
    expect(result.current).toBe(false);
  });
});

describe('writes while offline', () => {
  it('refuse with a toast, send nothing, and change nothing on screen', async () => {
    const error = vi.spyOn(toast, 'error');
    const store = fixtureStore();
    const update = vi.spyOn(store, 'update');
    const qc = testQueryClient();
    const { result } = renderHook(
      () => ({
        regatta: useRecord('regattas', IDS.regatta),
        save: useUpdate('regattas'),
      }),
      { wrapper: dataWrapper(store, qc) },
    );
    await waitFor(() => expect(result.current.regatta.data?.name).toBe('Head of the Lake'));

    goOffline();
    act(() => result.current.save.mutate({ id: IDS.regatta, patch: { name: 'Renamed' } }));
    await waitFor(() => expect(result.current.save.isError).toBe(true));

    expect(result.current.save.error).toBeInstanceOf(OfflineError);
    expect(error).toHaveBeenCalledWith(OFFLINE_EDIT_MESSAGE, { id: OFFLINE_TOAST_ID });
    expect(update).not.toHaveBeenCalled();
    expect(result.current.regatta.data?.name).toBe('Head of the Lake');
    expect((await store.get('regattas', IDS.regatta))?.name).toBe('Head of the Lake');
  });

  it('go through again once the connection returns', async () => {
    const store = fixtureStore();
    const { result } = renderHook(() => useUpdate('regattas'), {
      wrapper: dataWrapper(store),
    });
    goOffline();
    await expect(
      act(() => result.current.mutateAsync({ id: IDS.regatta, patch: { name: 'Renamed' } })),
    ).rejects.toBeInstanceOf(OfflineError);
    goOnline();
    await act(() => result.current.mutateAsync({ id: IDS.regatta, patch: { name: 'Renamed' } }));
    expect((await store.get('regattas', IDS.regatta))?.name).toBe('Renamed');
  });
});

describe('reads while offline', () => {
  it('show what is saved on the device', async () => {
    const qc = testQueryClient();
    const query = { where: { regattaId: IDS.regatta } } as const;
    qc.setQueryData(queryKeys.list('events', query), [{ id: 'saved', eventNumber: '1' }]);
    goOffline();
    const { result } = renderHook(() => useList('events', query), {
      wrapper: dataWrapper(fixtureStore(), qc),
    });
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual([{ id: 'saved', eventNumber: '1' }]);
  });

  it('say when nothing is saved instead of loading forever, then load on reconnect', async () => {
    goOffline();
    const { result } = renderHook(() => useList('events', { where: { regattaId: IDS.regatta } }), {
      wrapper: dataWrapper(fixtureStore()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isPending).toBe(false);
    expect((result.current.error as Error).message).toBe(
      "It isn't saved on this device yet. Reconnect to load it.",
    );
    goOnline();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((e) => e.eventNumber).sort()).toEqual(['12', '14']);
  });
});
