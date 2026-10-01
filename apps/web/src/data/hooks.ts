// Generic data hooks: the only way the app reads and writes. Feature hooks such as useSetSeat()
// are built from these, usually with useStoreMutation.

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  keepPreviousData,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CollectionName, User } from '@regatta-ops/domain';
import { useStore } from './context';
import {
  networkMonitor,
  OFFLINE_TOAST_ID,
  OfflineError,
  settleWhenOffline,
  useOnline,
} from './online';
import {
  applyChange,
  change,
  findCached,
  restore,
  snapshot,
  type CacheSnapshot,
  type OptimisticChange,
} from './optimistic';
import { can, type Action } from './permissions';
import { queryKeys } from './query-keys';
import {
  newId,
  StoreError,
  type BatchOp,
  type CreateInput,
  type DataStore,
  type ListQuery,
  type Patch,
  type RecordOf,
} from './store';

// ---------------------------------------------------------------------------
// Reads

export function listQueryOptions<C extends CollectionName>(
  store: DataStore,
  collection: C,
  query?: ListQuery<RecordOf<C>>,
) {
  return queryOptions({
    queryKey: queryKeys.list(collection, query),
    queryFn: () => store.list(collection, query),
  });
}

export function recordQueryOptions<C extends CollectionName>(
  store: DataStore,
  collection: C,
  id: string,
) {
  return queryOptions({
    queryKey: queryKeys.record(collection, id),
    queryFn: () => store.get(collection, id),
  });
}

export interface UseListOptions {
  /** Default true. */
  enabled?: boolean;
  /** Keep showing the previous result while a changed query loads (no skeleton flash). */
  keepPrevious?: boolean;
}

/**
 * A list of records. `useList('entries', { where: { regattaId }, sort: 'label' })`.
 * Returns the TanStack Query result: `data`, `isPending`, `isError`, `error`, `refetch`.
 */
export function useList<C extends CollectionName>(
  collection: C,
  query?: ListQuery<RecordOf<C>>,
  options: UseListOptions = {},
) {
  const store = useStore();
  return settleWhenOffline(
    useQuery({
      ...listQueryOptions(store, collection, query),
      enabled: options.enabled ?? true,
      placeholderData: options.keepPrevious ? keepPreviousData : undefined,
    }),
  );
}

/**
 * One record by id; `data` is null when it does not exist. Shows a cached copy from any list
 * immediately while it loads. Pass a null id to skip.
 */
export function useRecord<C extends CollectionName>(collection: C, id: string | null | undefined) {
  const store = useStore();
  const qc = useQueryClient();
  return settleWhenOffline(
    useQuery({
      ...recordQueryOptions(store, collection, id ?? ''),
      enabled: !!id,
      // A generic C defeats TanStack's NonFunctionGuard typing; the value is a plain record.
      placeholderData: (() => (id ? findCached(qc, collection, id) : undefined)) as never,
    }),
  );
}

// ---------------------------------------------------------------------------
// Writes

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof StoreError) return err.message;
  return fallback;
}

export interface StoreMutationOptions<TVars, TResult> {
  mutationFn: (store: DataStore, vars: TVars) => Promise<TResult>;
  /** The cache edits to show before the server answers; rolled back if it fails. */
  optimistic?: (vars: TVars, qc: QueryClient) => OptimisticChange[];
  /** Collections to refetch when the mutation settles (the optimistic ones are included). */
  invalidate?: CollectionName[];
  /** Toast shown on failure; the store's own message wins when it has one. false: no toast. */
  errorMessage?: string | false;
  onSuccess?: (result: TResult, vars: TVars) => void;
  onError?: (error: unknown, vars: TVars) => void;
}

/**
 * The building block for writes with optimistic updates and rollback. Example, a seat swap:
 *
 *   const swap = useStoreMutation({
 *     mutationFn: async (store, { a, b }) => { await store.update(...); await store.update(...); },
 *     optimistic: ({ a, b }) => [
 *       change.update('entry_seats', a.id, { athleteId: b.athleteId }),
 *       change.update('entry_seats', b.id, { athleteId: a.athleteId }),
 *     ],
 *   });
 */
export function useStoreMutation<TVars, TResult = unknown>(
  opts: StoreMutationOptions<TVars, TResult>,
) {
  const store = useStore();
  const qc = useQueryClient();
  return useMutation<TResult, unknown, TVars, { snap: CacheSnapshot; touched: CollectionName[] }>({
    mutationFn: (vars) => opts.mutationFn(store, vars),
    onMutate: async (vars) => {
      // Editing is off offline. useCan hides the controls; this catches the rest before anything
      // changes on screen, so nothing is queued or half-saved.
      if (!networkMonitor.isOnline()) throw new OfflineError();
      const changes = opts.optimistic?.(vars, qc) ?? [];
      const touched = Array.from(
        new Set([...changes.map((c) => c.collection), ...(opts.invalidate ?? [])]),
      );
      await Promise.all(
        touched.map((c) => qc.cancelQueries({ queryKey: queryKeys.collection(c) })),
      );
      const snap = snapshot(qc, touched);
      for (const ch of changes) applyChange(qc, ch);
      return { snap, touched };
    },
    onError: (err, vars, ctx) => {
      if (ctx) restore(qc, ctx.snap);
      if (opts.errorMessage !== false) {
        toast.error(
          errorMessage(err, opts.errorMessage ?? 'The change was not saved. Try again.'),
          err instanceof OfflineError ? { id: OFFLINE_TOAST_ID } : undefined,
        );
      }
      opts.onError?.(err, vars);
    },
    onSuccess: (result, vars) => opts.onSuccess?.(result, vars),
    onSettled: (_r, _e, _v, ctx) => {
      for (const c of ctx?.touched ?? []) {
        void qc.invalidateQueries({ queryKey: queryKeys.collection(c) });
      }
    },
  });
}

/**
 * Create a record. The id is assigned before the request, so the optimistic row and the saved
 * row are the same record: `create.mutate({ entryId, seat: '3', athleteId })`.
 */
export function useCreate<C extends CollectionName>(
  collection: C,
  options: Pick<
    StoreMutationOptions<CreateInput<RecordOf<C>>, RecordOf<C>>,
    'errorMessage' | 'onSuccess' | 'onError'
  > = {},
) {
  const m = useStoreMutation<CreateInput<RecordOf<C>> & { id: string }, RecordOf<C>>({
    ...options,
    mutationFn: (store, data) => store.create(collection, data),
    optimistic: (data) => [
      change.create(collection, data as unknown as Partial<RecordOf<C>> & { id: string }),
    ],
  });
  const withId = (data: CreateInput<RecordOf<C>>) => ({ ...data, id: data.id || newId() });
  return {
    ...m,
    mutate: (data: CreateInput<RecordOf<C>>, o?: Parameters<typeof m.mutate>[1]) =>
      m.mutate(withId(data), o),
    mutateAsync: (data: CreateInput<RecordOf<C>>, o?: Parameters<typeof m.mutateAsync>[1]) =>
      m.mutateAsync(withId(data), o),
  };
}

export interface UpdateVars<C extends CollectionName> {
  id: string;
  patch: Patch<RecordOf<C>>;
  /** Refuse the write (409, 'conflict') if the record changed since this `updated` stamp. */
  expectedUpdated?: string;
}

/** Update a record: `update.mutate({ id, patch: { shellId } })`. */
export function useUpdate<C extends CollectionName>(
  collection: C,
  options: Pick<
    StoreMutationOptions<UpdateVars<C>, RecordOf<C>>,
    'errorMessage' | 'onSuccess' | 'onError'
  > = {},
) {
  return useStoreMutation<UpdateVars<C>, RecordOf<C>>({
    ...options,
    mutationFn: (store, { id, patch, expectedUpdated }) =>
      store.update(collection, id, patch, expectedUpdated ? { expectedUpdated } : undefined),
    optimistic: ({ id, patch }) => [change.update(collection, id, patch)],
  });
}

/**
 * Several writes in one transaction, shown optimistically in order and rolled back together.
 * Creates get their ids up front. A seat swap under the unique (entry, athlete) index:
 *
 *   batch.mutate([
 *     batchOp.update('entry_seats', seatA.id, { athleteId: null }),
 *     batchOp.update('entry_seats', seatB.id, { athleteId: seatA.athleteId }),
 *     batchOp.update('entry_seats', seatA.id, { athleteId: seatB.athleteId }),
 *   ]);
 */
export function useBatch(
  options: Pick<
    StoreMutationOptions<BatchOp[], unknown>,
    'errorMessage' | 'onSuccess' | 'onError'
  > = {},
) {
  const m = useStoreMutation<BatchOp[], (RecordOf<CollectionName> | null)[]>({
    ...options,
    mutationFn: (store, ops) => store.batch(ops),
    optimistic: (ops) =>
      ops.map((op): OptimisticChange => {
        if (op.op === 'create') {
          return { type: 'create', collection: op.collection, record: op.data as { id: string } };
        }
        if (op.op === 'update') {
          return { type: 'update', collection: op.collection, id: op.id, patch: op.patch };
        }
        return { type: 'delete', collection: op.collection, id: op.id };
      }),
  });
  const withIds = (ops: BatchOp[]): BatchOp[] =>
    ops.map((op) =>
      op.op === 'create' && !op.data.id
        ? ({ ...op, data: { ...op.data, id: newId() } } as BatchOp)
        : op,
    );
  return {
    ...m,
    mutate: (ops: BatchOp[], o?: Parameters<typeof m.mutate>[1]) => m.mutate(withIds(ops), o),
    mutateAsync: (ops: BatchOp[], o?: Parameters<typeof m.mutateAsync>[1]) =>
      m.mutateAsync(withIds(ops), o),
  };
}

/** Delete a record: `remove.mutate(id)`. */
export function useDelete<C extends CollectionName>(
  collection: C,
  options: Pick<StoreMutationOptions<string, void>, 'errorMessage' | 'onSuccess' | 'onError'> = {},
) {
  return useStoreMutation<string, void>({
    ...options,
    mutationFn: (store, id) => store.delete(collection, id),
    optimistic: (id) => [change.delete(collection, id)],
  });
}

// ---------------------------------------------------------------------------
// Auth and roles

/** The signed-in user, or null. Re-renders on sign-in, sign-out, and profile changes. */
export function useCurrentUser(): User | null {
  const store = useStore();
  return useSyncExternalStore(
    store.auth.onChange,
    () => store.auth.user,
    () => store.auth.user,
  );
}

/**
 * Whether the signed-in user's role allows an action. False for everything while offline, so
 * every feature's edit controls turn off together.
 */
export function useCan(action: Action): boolean {
  const user = useCurrentUser();
  const online = useOnline();
  return can(user?.role, action, { online });
}

/** Sign-in and sign-out. Signing out clears every cached query. */
export function useAuthActions() {
  const store = useStore();
  const qc = useQueryClient();
  const signOut = useCallback(() => {
    store.auth.signOut();
    qc.clear();
  }, [store, qc]);
  return useMemo(
    () => ({
      signInWithPassword: (email: string, password: string) =>
        store.auth.signInWithPassword(email, password),
      signInWithGoogle: () => store.auth.signInWithGoogle(),
      refresh: () => store.auth.refresh(),
      signOut,
    }),
    [store, signOut],
  );
}

/** 'memory' in demo mode and tests, 'pocketbase' against the server. */
export function useDataMode(): DataStore['mode'] {
  return useStore().mode;
}

/** Demo mode: throw away local changes and reload the seed. Null when not in demo mode. */
export function useResetDemo(): (() => Promise<void>) | null {
  const store = useStore();
  const qc = useQueryClient();
  return useMemo(() => {
    if (!store.resetDemo) return null;
    return async () => {
      await store.resetDemo!();
      await qc.resetQueries({ queryKey: queryKeys.all });
      toast.success('Demo data reset');
    };
  }, [store, qc]);
}
