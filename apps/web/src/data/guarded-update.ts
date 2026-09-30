// Guarded updates for the fields where last-write-wins is not good enough (PLAN.md §10.2): event
// times and trailer placements. The write carries the `updated` stamp the coach was looking at;
// if someone else saved the record since, the store refuses it ('conflict', HTTP 409), and this
// hook rolls the optimistic change back, refetches, and says so.
//
//   const moveEvent = useGuardedUpdate('events');
//   moveEvent.mutate({ id: ev.id, patch: { scheduledAt } });   // stamp read from the cache
//   moveEvent.mutate({ id: ev.id, patch: { scheduledAt }, expectedUpdated: ev.updated });
//
// The coach's own quick successive writes to one record (arrow-key nudges of a placement) are
// not conflicts: they run in order, and each one expects the stamp the previous one produced.

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CONFLICT_TOAST, normalizeStamp, type GuardedCollection } from './concurrency';
import { useStoreMutation } from './hooks';
import { applyChange, change, findCached } from './optimistic';
import { queryKeys } from './query-keys';
import { StoreError, type Patch, type RecordOf } from './store';

export interface GuardedUpdateVars<C extends GuardedCollection> {
  id: string;
  patch: Patch<RecordOf<C>>;
  /**
   * The record's `updated` stamp as the coach saw it. Defaults to the cached copy's at the moment
   * `mutate` is called. Without either, the write is unguarded (last write wins).
   */
  expectedUpdated?: string;
}

export interface GuardedUpdateOptions<C extends GuardedCollection> {
  onSuccess?: (record: RecordOf<C>, vars: GuardedUpdateVars<C>) => void;
  /** Any failure, conflicts included (after rollback and the toast). */
  onError?: (error: unknown, vars: GuardedUpdateVars<C>) => void;
  /** A refused stale write, after the rollback; the cache is refetching. */
  onConflict?: (vars: GuardedUpdateVars<C>) => void;
  /** Toast for failures other than conflicts; the store's own message wins. false: none. */
  errorMessage?: string | false;
}

/** Per query client: own writes in flight, and the stamps they turned into. */
class OwnWrites {
  private chains = new Map<string, Promise<unknown>>();
  private produced = new Map<string, Map<string, string>>();

  /** Run `fn` after every earlier write to the same record has settled. */
  queue<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.chains.set(key, run);
    run
      .catch(() => undefined)
      .finally(() => {
        if (this.chains.get(key) === run) this.chains.delete(key);
      });
    return run;
  }

  /** Follow the coach's own writes forward from the stamp they started from. */
  resolve(key: string, stamp: string | undefined): string | undefined {
    const map = this.produced.get(key);
    if (!stamp || !map) return stamp;
    let current = stamp;
    for (let i = 0; i <= map.size; i++) {
      const next = map.get(normalizeStamp(current));
      if (!next) break;
      current = next;
    }
    return current;
  }

  record(key: string, from: string | undefined, to: string | undefined) {
    if (!from || !to) return;
    const map = this.produced.get(key) ?? new Map<string, string>();
    map.set(normalizeStamp(from), to);
    // A record sees a handful of own writes at a time; keep the newest few.
    while (map.size > 20) map.delete(map.keys().next().value!);
    this.produced.set(key, map);
  }

  forget(key: string) {
    this.produced.delete(key);
  }
}

const ownWritesByClient = new WeakMap<QueryClient, OwnWrites>();

function ownWritesFor(qc: QueryClient): OwnWrites {
  let own = ownWritesByClient.get(qc);
  if (!own) {
    own = new OwnWrites();
    ownWritesByClient.set(qc, own);
  }
  return own;
}

function isConflict(err: unknown): boolean {
  return err instanceof StoreError && err.code === 'conflict';
}

/**
 * Update an event or a load placement, refusing to overwrite someone else's newer change.
 * Returns the same mutation object as useUpdate: `mutate`, `mutateAsync`, `isPending`, ...
 */
export function useGuardedUpdate<C extends GuardedCollection>(
  collection: C,
  options: GuardedUpdateOptions<C> = {},
) {
  const qc = useQueryClient();
  const own = ownWritesFor(qc);
  const keyOf = (id: string) => `${collection}:${id}`;

  const m = useStoreMutation<GuardedUpdateVars<C>, RecordOf<C>>({
    errorMessage: false,
    mutationFn: (store, { id, patch, expectedUpdated }) => {
      const key = keyOf(id);
      return own.queue(key, async () => {
        const expected = own.resolve(key, expectedUpdated);
        const saved = await store.update(
          collection,
          id,
          patch,
          expected ? { expectedUpdated: expected } : undefined,
        );
        own.record(key, expected, saved.updated);
        // Keep the cached stamp current so the next guarded write does not trip on our own.
        applyChange(qc, { type: 'update', collection, id, patch: { updated: saved.updated } });
        return saved;
      });
    },
    optimistic: ({ id, patch }) => [change.update(collection, id, patch)],
    onSuccess: (record, vars) => options.onSuccess?.(record, vars),
    onError: (err, vars) => {
      if (isConflict(err)) {
        own.forget(keyOf(vars.id));
        void qc.invalidateQueries({ queryKey: queryKeys.collection(collection) });
        toast.warning(CONFLICT_TOAST);
        options.onConflict?.(vars);
      } else if (options.errorMessage !== false) {
        toast.error(
          err instanceof StoreError
            ? err.message
            : (options.errorMessage ?? 'The change was not saved. Try again.'),
        );
      }
      options.onError?.(err, vars);
    },
  });

  // Read the stamp when the coach acts, before any refetch can replace it with a newer one.
  const withStamp = (vars: GuardedUpdateVars<C>): GuardedUpdateVars<C> => {
    if (vars.expectedUpdated) return vars;
    const cached = findCached(qc, collection, vars.id);
    const stamp = typeof cached?.updated === 'string' ? cached.updated : undefined;
    return stamp ? { ...vars, expectedUpdated: stamp } : vars;
  };

  return {
    ...m,
    mutate: (vars: GuardedUpdateVars<C>, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate(withStamp(vars), o),
    mutateAsync: (vars: GuardedUpdateVars<C>, o?: Parameters<typeof m.mutateAsync>[1]) =>
      m.mutateAsync(withStamp(vars), o),
  };
}
