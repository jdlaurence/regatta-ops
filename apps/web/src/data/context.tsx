import { createContext, useContext, type ReactNode } from 'react';
import type { DataStore } from './store';

const StoreContext = createContext<DataStore | null>(null);

/** Provides the DataStore to the data hooks. Tests pass a MemoryStore. */
export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * The DataStore. For data hooks in `src/data/` only: components and feature code use the
 * hooks (useList, useUpdate, useRegattaWorkingSet, ...), never the store directly.
 */
export function useStore(): DataStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>.');
  return store;
}
