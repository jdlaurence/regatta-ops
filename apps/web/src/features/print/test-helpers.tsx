// Test helpers for the print feature: a loaded working set from a store.

import { expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { buildSeedWorld } from '@regatta-ops/seed';
import type { World } from '@regatta-ops/domain';
import { useRegattaWorkingSet, type RegattaWorkingSet } from '@/data';
import { MemoryStore } from '@/data/memory-store';
import { dataWrapper } from '@/test/render';

/** The regatta's working set, loaded through the real hook. */
export async function loadWorkingSet(store: MemoryStore, regattaId: string) {
  const { result } = renderHook(() => useRegattaWorkingSet(regattaId), {
    wrapper: dataWrapper(store),
  });
  await waitFor(() => expect(result.current.data).toBeDefined(), { timeout: 5000 });
  return result.current.data as RegattaWorkingSet;
}

let seed: World | null = null;

/** A MemoryStore on a fresh copy of the seed world, signed in as `userIndex` (default admin). */
export function seedStore(userIndex = 0): MemoryStore {
  seed ??= buildSeedWorld().world;
  const world = structuredClone(seed);
  return new MemoryStore({ world, userId: world.users[userIndex]!.id });
}
