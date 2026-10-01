// Stale-write check (PLAN.md §8.3 concurrency.pb.js). Only events (their times) and load
// placements carry it: an update sent with `expectedUpdated` is refused with a 'conflict'
// StoreError when the stored record has changed since. Everything else is last-write-wins. Shared
// by MemoryStore (so demo mode and tests behave like the server) and useGuardedUpdate.

import type { CollectionName } from '@regatta-ops/domain';

export const GUARDED_COLLECTIONS = [
  'events',
  'load_placements',
] as const satisfies readonly CollectionName[];

export type GuardedCollection = (typeof GUARDED_COLLECTIONS)[number];

export function isGuarded(collection: CollectionName): collection is GuardedCollection {
  return (GUARDED_COLLECTIONS as readonly string[]).includes(collection);
}

/** PocketBase writes '2025-05-16 15:00:00.000Z', the app ISO with a 'T': compare as the hook does. */
export function normalizeStamp(stamp: string | null | undefined): string {
  return String(stamp ?? '')
    .trim()
    .replace('T', ' ');
}

export function sameStamp(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeStamp(a) === normalizeStamp(b);
}

/** The toast after a refused stale write (what happened, what to do). */
export const CONFLICT_TOAST = 'Someone else changed this a moment ago. Refreshed; try again.';
