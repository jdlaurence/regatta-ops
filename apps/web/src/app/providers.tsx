// Providers around the whole app: the DataStore, TanStack Query, theme, realtime, tooltips,
// and toasts. Tests render the same tree with a MemoryStore.

import { useCallback, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider, StoreProvider, useCurrentUser, useUpdate, type DataStore } from '@/data';
import { TooltipProvider } from '@/components/ui/menu';
import { Toaster } from '@/components/toast';
import { ThemeProvider, useAdoptUserTheme, type ThemeChoice } from './theme';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Realtime invalidates what changes; this only bounds staleness if a push is missed.
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        retry: 1,
      },
      mutations: { retry: 0 },
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

export function AppProviders({
  store,
  queryClient,
  children,
}: {
  store: DataStore;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <StoreProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <SessionCheck store={store} />
        <ThemeWithPreferences>
          <RealtimeProvider>
            <TooltipProvider delayDuration={300}>
              {children}
              <Toaster />
            </TooltipProvider>
          </RealtimeProvider>
        </ThemeWithPreferences>
      </QueryClientProvider>
    </StoreProvider>
  );
}
