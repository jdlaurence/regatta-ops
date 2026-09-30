import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RealtimeProvider, StoreProvider, type DataStore } from '@/data';

export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: 0 } },
  });
}

/** Store, query client, and realtime around hooks or components under test. */
export function dataWrapper(store: DataStore, queryClient = testQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <StoreProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <RealtimeProvider>{children}</RealtimeProvider>
        </QueryClientProvider>
      </StoreProvider>
    );
  };
}
