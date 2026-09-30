import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { useIsRestoring } from '@tanstack/react-query';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import { useRecord } from '@/data';
import { CACHE_MAX_AGE, createIdbPersister, type DeviceStorage } from '@/data/persist';
import { AppProviders, createQueryClient } from './providers';

function mapPersister() {
  const map = new Map<string, unknown>();
  const storage: DeviceStorage = {
    get: async (k) => map.get(k),
    set: async (k, v) => void map.set(k, v),
    del: async (k) => void map.delete(k),
  };
  const persister = createIdbPersister({ storage, throttleMs: 0 })!;
  return {
    persister,
    restore: vi.spyOn(persister, 'restoreClient'),
    remove: vi.spyOn(persister, 'removeClient'),
  };
}

function RegattaName() {
  const restoring = useIsRestoring();
  const regatta = useRecord('regattas', IDS.regatta);
  if (restoring) return <p>Restoring</p>;
  return <p>{regatta.data?.name ?? 'Loading'}</p>;
}

describe('createQueryClient', () => {
  it('keeps queries a week, pauses server queries offline, and never queues writes', () => {
    const server = createQueryClient({ mode: 'pocketbase' }).getDefaultOptions();
    expect(server.queries?.gcTime).toBe(CACHE_MAX_AGE);
    expect(server.queries?.networkMode).toBe('online');
    expect(server.mutations?.networkMode).toBe('always');
    // Demo mode has no network to wait for.
    const demo = createQueryClient({ mode: 'memory' }).getDefaultOptions();
    expect(demo.queries?.networkMode).toBe('always');
  });
});

describe('AppProviders with a persister', () => {
  it("restores the signed-in user's saved cache", async () => {
    const { persister, restore } = mapPersister();
    render(
      <AppProviders store={fixtureStore()} queryClient={testQueryClient()} persister={persister}>
        <RegattaName />
      </AppProviders>,
    );
    expect(await screen.findByText('Head of the Lake')).toBeInTheDocument();
    expect(restore).toHaveBeenCalledOnce();
  });

  it('refetches what it restored, so a copy saved before the last edit is not shown as current', async () => {
    const { persister } = mapPersister();
    const store = fixtureStore();
    const first = render(
      <AppProviders store={store} queryClient={testQueryClient()} persister={persister}>
        <RegattaName />
      </AppProviders>,
    );
    expect(await screen.findByText('Head of the Lake')).toBeInTheDocument();
    await act(() => persister.flush());
    first.unmount();

    // A change the saved copy missed (made just before a reload, say), then a fresh page load
    // within the queries' staleTime.
    await store.update('regattas', IDS.regatta, { name: 'Head of the Lake, renamed' });
    render(
      <AppProviders store={store} queryClient={testQueryClient()} persister={persister}>
        <RegattaName />
      </AppProviders>,
    );
    expect(await screen.findByText('Head of the Lake, renamed')).toBeInTheDocument();
  });

  it('restores nothing without a signed-in user, and deletes the saved copy', async () => {
    const { persister, restore, remove } = mapPersister();
    render(
      <AppProviders
        store={fixtureStore({ signedIn: null })}
        queryClient={testQueryClient()}
        persister={persister}
      >
        <RegattaName />
      </AppProviders>,
    );
    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(restore).not.toHaveBeenCalled();
  });

  it('deletes the saved copy on sign-out', async () => {
    const { persister, remove } = mapPersister();
    const store = fixtureStore();
    render(
      <AppProviders store={store} queryClient={testQueryClient()} persister={persister}>
        <RegattaName />
      </AppProviders>,
    );
    await screen.findByText('Head of the Lake');
    expect(remove).not.toHaveBeenCalled();
    act(() => store.auth.signOut());
    await waitFor(() => expect(remove).toHaveBeenCalled());
  });
});
