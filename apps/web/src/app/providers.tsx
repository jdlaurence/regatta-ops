// Providers around the whole app: the DataStore, TanStack Query (saved on the device for
// offline reads, PLAN.md §10.4), theme, realtime, tooltips, and toasts. Tests render the same
// tree with a MemoryStore and no persister.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { RealtimeProvider, StoreProvider, useCurrentUser, useUpdate, type DataStore } from '@/data';
import {
  appServerUrl,
  bridgeQueryOnlineManager,
  httpProbe,
  isNetworkError,
  networkMonitor,
  OfflineError,
  pocketBaseHealthUrl,
  type Probe,
} from '@/data/online';
import { CACHE_MAX_AGE, persistOptions, type DevicePersister } from '@/data/persist';
import { TooltipProvider } from '@/components/ui/menu';
import { Toaster } from '@/components/toast';
import { ThemeProvider, useAdoptUserTheme, type ThemeChoice } from './theme';

export function createQueryClient({
  mode = 'pocketbase',
}: { mode?: DataStore['mode'] } = {}): QueryClient {
  // Queries pause and resume with the app's network status, not just the browser's.
  bridgeQueryOnlineManager();
  const reportFailure = (err: unknown) => {
    if (isNetworkError(err) && !(err instanceof OfflineError)) networkMonitor.reportFailure();
  };
  // A request that reached the server proves it is reachable; MemoryStore's prove nothing.
  const reportSuccess = () => {
    if (mode === 'pocketbase') networkMonitor.reportSuccess();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onSuccess: reportSuccess }),
    mutationCache: new MutationCache({ onSuccess: reportSuccess, onError: reportFailure }),
    defaultOptions: {
      queries: {
        // Realtime invalidates what changes; this only bounds staleness if a push is missed.
        staleTime: 60_000,
        // Queries are saved on the device for a week (persist.ts); one dropped from memory
        // when its page closes would be dropped from the saved copy too.
        gcTime: CACHE_MAX_AGE,
        // MemoryStore needs no network, so its queries always run. Against the server,
        // queries pause while offline and keep showing what they have.
        networkMode: mode === 'memory' ? 'always' : 'online',
        retry: (failureCount, error) => {
          if (isNetworkError(error)) {
            // The failed-request signal: check the server, and go offline if it is down. The
            // retry then waits for the connection instead of failing the page.
            reportFailure(error);
            return failureCount < 3;
          }
          return failureCount < 1;
        },
      },
      // Writes run or fail now; offline they refuse up front (useStoreMutation), never queue.
      mutations: { retry: 0, networkMode: 'always' },
    },
  });
}

/** Saves the theme to the user's preferences and adopts it on sign-in (another device). */
function ThemeWithPreferences({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const update = useUpdate('users', { errorMessage: false });
  const { mutate } = update;
  const onChoiceChange = useCallback(
    (theme: ThemeChoice) => {
      if (!user || user.preferences?.theme === theme) return;
      mutate({ id: user.id, patch: { preferences: { ...user.preferences, theme } } });
    },
    [user, mutate],
  );
  return (
    <ThemeProvider onChoiceChange={onChoiceChange}>
      <AdoptTheme preferred={user?.preferences?.theme} />
      {children}
    </ThemeProvider>
  );
}

function AdoptTheme({ preferred }: { preferred: ThemeChoice | undefined }) {
  useAdoptUserTheme(preferred);
  return null;
}

/** Check a stored session with the server once on load (PocketBase); no-op in memory. */
function SessionCheck({ store }: { store: DataStore }) {
  useEffect(() => {
    void store.auth.refresh();
  }, [store]);
  return null;
}

/**
 * How the app checks that it is really online (online.ts): PocketBase's health endpoint, or in
 * demo mode the server the app came from.
 */
export function networkProbeFor(store: DataStore): Probe {
  return httpProbe(store.mode === 'pocketbase' ? () => pocketBaseHealthUrl() : appServerUrl);
}

function NetworkProbe({ probe }: { probe: Probe }) {
  useEffect(() => {
    networkMonitor.setProbe(probe);
    return () => networkMonitor.setProbe(null);
  }, [probe]);
  return null;
}

/**
 * The device copy is for showing something at once and for offline reads, never the latest
 * word: it is saved at most once a second, and a save started as the page unloads may not
 * finish, so it can predate the last edits. Restored queries keep their fetch times, so without
 * this they would count as fresh for `staleTime` and a reload right after an edit would show
 * the lineup from before it. Marking them stale makes each page refetch in the background when
 * it mounts (paused while offline). Not awaited: the restore must not wait for the network.
 */
export function markRestoredStale(client: QueryClient): void {
  void client.invalidateQueries({ refetchType: 'none' });
}

/**
 * The query cache, restored from and saved to this device. Only a signed-in user's copy is
 * restored, and signing out deletes it.
 */
function PersistedQueryClientProvider({
  client,
  persister,
  store,
  children,
}: {
  client: QueryClient;
  persister: DevicePersister;
  store: DataStore;
  children: ReactNode;
}) {
  const [options] = useState(() =>
    persistOptions({
      persistClient: (c) => persister.persistClient(c),
      removeClient: () => persister.removeClient(),
      restoreClient: async () => {
        if (store.auth.user) return persister.restoreClient();
        await persister.removeClient();
        return undefined;
      },
    }),
  );
  useEffect(
    () =>
      store.auth.onChange((user) => {
        if (!user) void persister.removeClient();
      }),
    [store, persister],
  );
  useEffect(() => {
    const flush = () => void persister.flush();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [persister]);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={options}
      onSuccess={() => markRestoredStale(client)}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export function AppProviders({
  store,
  queryClient,
  persister,
  probe,
  children,
}: {
  store: DataStore;
  queryClient: QueryClient;
  /** Saves the query cache on the device for offline reads; none in tests. */
  persister?: DevicePersister | null;
  /** Checks the connection beyond navigator.onLine (networkProbeFor); none in tests. */
  probe?: Probe | null;
  children: ReactNode;
}) {
  const app = (
    <>
      <SessionCheck store={store} />
      {probe && <NetworkProbe probe={probe} />}
      <ThemeWithPreferences>
        <RealtimeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </RealtimeProvider>
      </ThemeWithPreferences>
    </>
  );
  return (
    <StoreProvider store={store}>
      {persister ? (
        <PersistedQueryClientProvider client={queryClient} persister={persister} store={store}>
          {app}
        </PersistedQueryClientProvider>
      ) : (
        <QueryClientProvider client={queryClient}>{app}</QueryClientProvider>
      )}
    </StoreProvider>
  );
}
