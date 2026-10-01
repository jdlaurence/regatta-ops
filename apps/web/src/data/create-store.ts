// Picks the DataStore for this build (PLAN.md §7.1): `vite --mode demo` or VITE_DATA_MODE=memory
// runs on MemoryStore with the seed world and no backend; anything else talks to PocketBase.

import { hash32 } from '@srt/domain';
import { buildSeedWorld } from '@srt/seed';
import juniorRosters from 'virtual:srt-local-rosters';
import { MemoryStore, readPersistedWorld } from './memory-store';
import { PocketBaseStore } from './pocketbase-store';
import type { DataStore } from './store';

export const DEMO_STORAGE_KEY = 'srt-demo-v1';
export const DEMO_AUTH_KEY = 'srt-demo-auth-v1';

export type DataMode = 'memory' | 'pocketbase';

export function dataMode(): DataMode {
  return import.meta.env.MODE === 'demo' || import.meta.env.VITE_DATA_MODE === 'memory'
    ? 'memory'
    : 'pocketbase';
}

/**
 * Demo mode: the seed world, with the real junior rosters when the workbooks are in data/
 * (scripts/local-rosters.ts), and the visitor's changes kept in localStorage. A roster change
 * changes the seed hash, which starts the demo over.
 */
export function createDemoStore(): MemoryStore {
  const seed = () => buildSeedWorld({ juniorRosters }).world;
  const fresh = seed();
  const seedHash = hash32(JSON.stringify(fresh));
  const store = new MemoryStore({
    world: readPersistedWorld(DEMO_STORAGE_KEY, seedHash) ?? fresh,
    persistKey: DEMO_STORAGE_KEY,
    authKey: DEMO_AUTH_KEY,
    reseed: seed,
    seedHash,
  });
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => store.flush());
  }
  return store;
}

export function createStore(): DataStore {
  if (dataMode() === 'memory') return createDemoStore();
  return new PocketBaseStore(import.meta.env.VITE_PB_URL || '/');
}
