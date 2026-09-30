// The DataStore contract (PLAN.md §7.1, §7.3, §10). Everything the app reads or writes goes
// through this interface, via the hooks in data/hooks.ts. Two implementations:
// PocketBaseStore (the real backend) and MemoryStore (tests, the gallery, and demo mode).

import type { BaseRecord, CollectionMap, CollectionName, User } from '@srt/domain';

export type { CollectionMap, CollectionName };

/** The record type stored in a collection: `RecordOf<'entries'>` is `Entry`. */
export type RecordOf<C extends CollectionName> = CollectionMap[C];

/** String keys of a record type. */
export type FieldOf<T> = Extract<keyof T, string>;

/** 'sortOrder' ascending, '-scheduledAt' descending. */
export type SortKey<T> = FieldOf<T> | `-${FieldOf<T>}`;

export interface ListQuery<T> {
  /** Equality on each listed field, all must match. `null` matches an empty value. */
  where?: { [K in FieldOf<T>]?: T[K] | null };
  /** The field's value is one of the listed values. An empty list matches nothing. */
  in?: { [K in FieldOf<T>]?: readonly NonNullable<T[K]>[] };
  /** One key or several; later keys break ties. */
  sort?: SortKey<T> | readonly SortKey<T>[];
}

/** Create payload: everything but the server-managed fields; `id` is optional (15 chars a-z0-9). */
export type CreateInput<T extends BaseRecord> = Omit<T, 'id' | 'created' | 'updated'> & {
  id?: string;
};

export type Patch<T extends BaseRecord> = Partial<Omit<T, 'id' | 'created' | 'updated'>>;

export interface UpdateOptions {
  /**
   * The `updated` stamp the caller last saw. When the stored record has moved on, the write is
   * refused with a StoreError of code 'conflict' (HTTP 409) instead of overwriting someone
   * else's change. Used for event times and trailer placements (PLAN.md §8.3, §10.2).
   */
  expectedUpdated?: string;
}

/** One write in an atomic batch: all apply or none do. */
export type BatchOp<C extends CollectionName = CollectionName> = C extends CollectionName
  ? | { op: 'create'; collection: C; data: CreateInput<RecordOf<C>> }
    | { op: 'update'; collection: C; id: string; patch: Patch<RecordOf<C>> }
    | { op: 'delete'; collection: C; id: string }
  : never;

/** Typed constructors for batch operations. */
export const batchOp = {
  create: <C extends CollectionName>(collection: C, data: CreateInput<RecordOf<C>>) =>
    ({ op: 'create', collection, data }) as unknown as BatchOp,
  update: <C extends CollectionName>(collection: C, id: string, patch: Patch<RecordOf<C>>) =>
    ({ op: 'update', collection, id, patch }) as unknown as BatchOp,
  delete: <C extends CollectionName>(collection: C, id: string) =>
    ({ op: 'delete', collection, id }) as unknown as BatchOp,
};

export type ChangeAction = 'create' | 'update' | 'delete';

export interface ChangeEvent<C extends CollectionName = CollectionName> {
  action: ChangeAction;
  collection: C;
  /** The record after the change (for delete: the record as it was). */
  record: RecordOf<C>;
}

export type ChangeHandler<C extends CollectionName = CollectionName> = (
  event: ChangeEvent<C>,
) => void;

export interface AuthApi {
  /** The signed-in user, or null. Synchronous: both stores keep the session locally. */
  readonly user: User | null;
  signInWithPassword(email: string, password: string): Promise<User>;
  /** PocketBase OAuth2 with the `google` provider (works once a client id is configured). */
  signInWithGoogle(): Promise<User>;
  signOut(): void;
  /** Called with the new user (or null) whenever the session or the user's record changes. */
  onChange(listener: (user: User | null) => void): () => void;
  /** Re-validate the stored session with the server; resolves to the current user. */
  refresh(): Promise<User | null>;
}

export interface DataStore {
  readonly mode: 'pocketbase' | 'memory';
  list<C extends CollectionName>(
    collection: C,
    query?: ListQuery<RecordOf<C>>,
  ): Promise<RecordOf<C>[]>;
  /** One record by id, or null when it does not exist. */
  get<C extends CollectionName>(collection: C, id: string): Promise<RecordOf<C> | null>;
  create<C extends CollectionName>(
    collection: C,
    data: CreateInput<RecordOf<C>>,
  ): Promise<RecordOf<C>>;
  update<C extends CollectionName>(
    collection: C,
    id: string,
    patch: Patch<RecordOf<C>>,
    options?: UpdateOptions,
  ): Promise<RecordOf<C>>;
  delete<C extends CollectionName>(collection: C, id: string): Promise<void>;
  /**
   * Several writes in one transaction, in order (PocketBase batch API, up to 200 per call).
   * Resolves to one entry per op: the saved record for create and update, null for delete.
   * Needed where a unique index would reject the steps one by one, like swapping two athletes
   * between seats (clear one seat, set the other, set the first).
   */
  batch(ops: BatchOp[]): Promise<(RecordOf<CollectionName> | null)[]>;
  /** Change events for one collection, from anyone (including this client). */
  subscribe<C extends CollectionName>(collection: C, handler: ChangeHandler<C>): () => void;
  readonly auth: AuthApi;
  /** Demo mode only: throw away local changes and reload the seed world. */
  resetDemo?(): Promise<void>;
}

export type StoreErrorCode =
  | 'not_found'
  | 'unique'
  | 'in_use'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'auth'
  | 'network'
  | 'unknown';

/** Errors from either store. `message` is a sentence ready for a toast (PLAN.md §5.5). */
export class StoreError extends Error {
  readonly code: StoreErrorCode;
  readonly status?: number;
  constructor(code: StoreErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Query helpers shared by MemoryStore and the optimistic cache updates in hooks.ts.

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** A new random record id: 15 lowercase alphanumerics, as PocketBase makes them. */
export function newId(): string {
  const bytes = new Uint8Array(15);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return a === b;
}

/** Whether a record satisfies a query's `where` and `in` filters. */
export function matchesQuery<T extends object>(record: T, query?: ListQuery<T>): boolean {
  if (!query) return true;
  const rec = record as Record<string, unknown>;
  if (query.where) {
    for (const [field, value] of Object.entries(query.where)) {
      if (!sameValue(rec[field], value)) return false;
    }
  }
  if (query.in) {
    for (const [field, values] of Object.entries(query.in)) {
      if (!values) continue;
      if (!(values as readonly unknown[]).includes(rec[field])) return false;
    }
  }
  return true;
}

function compareValues(a: unknown, b: unknown): number {
  // Empty values sort first ascending, like SQLite (PocketBase) does.
  const ea = isEmpty(a);
  const eb = isEmpty(b);
  if (ea || eb) return ea === eb ? 0 : ea ? -1 : 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

export function sortKeys<T>(sort: ListQuery<T>['sort']): { field: string; dir: 1 | -1 }[] {
  if (!sort) return [];
  const keys = (Array.isArray(sort) ? sort : [sort]) as string[];
  return keys.map((k) =>
    k.startsWith('-') ? { field: k.slice(1), dir: -1 } : { field: k, dir: 1 },
  );
}

/** A sorted copy. Stable: records that compare equal keep their order. */
export function sortRecords<T extends object>(
  records: readonly T[],
  sort?: ListQuery<T>['sort'],
): T[] {
  const keys = sortKeys(sort);
  if (keys.length === 0) return [...records];
  return [...records].sort((x, y) => {
    for (const { field, dir } of keys) {
      const c = compareValues(
        (x as Record<string, unknown>)[field],
        (y as Record<string, unknown>)[field],
      );
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

/** Apply a query to an in-memory array (filter, then sort). */
export function applyQuery<T extends object>(records: readonly T[], query?: ListQuery<T>): T[] {
  return sortRecords(
    records.filter((r) => matchesQuery(r, query)),
    query?.sort,
  );
}
