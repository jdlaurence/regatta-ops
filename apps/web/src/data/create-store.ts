// Picks the DataStore for this build (PLAN.md §7.1): `vite --mode demo`, the published demo
// (`--mode pages`, §18), or VITE_DATA_MODE=memory runs on MemoryStore with the seed world and no
// backend; anything else talks to PocketBase.

import { hash32 } from '@srt/domain';
import { buildSeedWorld, type RosterAthlete } from '@srt/seed';
import { MemoryStore, readPersistedWorld } from './memory-store';
import { PocketBaseStore } from './pocketbase-store';
import type { DataStore } from './store';

export const DEMO_STORAGE_KEY = 'srt-demo-v1';
export const DEMO_AUTH_KEY = 'srt-demo-auth-v1';

export type DataMode = 'memory' | 'pocketbase';

export function dataMode(): DataMode {
  const mode = import.meta.env.MODE;
  return mode === 'demo' || mode === 'pages' || import.meta.env.VITE_DATA_MODE === 'memory'
    ? 'memory'
    : 'pocketbase';
}

/**
 * Demo mode: the seed world, with real junior rosters when there are any (the workbooks in data/
 * through scripts/local-rosters.ts, or the published demo's sealed rosters), and the visitor's
 * changes kept in localStorage. A roster change changes the seed hash, which starts the demo over.
 */
export function createDemoStore(juniorRosters: RosterAthlete[] = []): MemoryStore {
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

export function createStore(juniorRosters: RosterAthlete[] = []): DataStore {
  if (dataMode() === 'memory') return createDemoStore(juniorRosters);
  return new PocketBaseStore(import.meta.env.VITE_PB_URL || '/');
}
