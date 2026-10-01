// Optimistic cache edits (PLAN.md §10.2). A change is applied to every cached list and record of
// its collection: updates merge by id, creates join the lists whose query they match, deletes
// leave. Lists are re-sorted by their own sort. Snapshots restore the cache on error.

import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { CollectionName } from '@regatta-ops/domain';
import { queryKeys, type NormalizedQuery } from './query-keys';
import { matchesQuery, sortRecords, type ListQuery, type Patch, type RecordOf } from './store';

export type OptimisticChange =
  | { type: 'create'; collection: CollectionName; record: { id: string } & object }
  | { type: 'update'; collection: CollectionName; id: string; patch: object }
  | { type: 'delete'; collection: CollectionName; id: string };

/** Helpers that type the change against the collection's record. */
export const change = {
  create: <C extends CollectionName>(
    collection: C,
    record: Partial<RecordOf<C>> & { id: string },
  ): OptimisticChange => ({ type: 'create', collection, record }),
  update: <C extends CollectionName>(
    collection: C,
    id: string,
    patch: Patch<RecordOf<C>>,
  ): OptimisticChange => ({ type: 'update', collection, id, patch }),
  delete: <C extends CollectionName>(collection: C, id: string): OptimisticChange => ({
    type: 'delete',
    collection,
    id,
  }),
};

export type CacheSnapshot = [QueryKey, unknown][];

type Row = { id: string } & Record<string, unknown>;

function isListKey(
  key: QueryKey,
): key is readonly ['regatta-ops', string, 'list', NormalizedQuery] {
  return key[2] === 'list';
}

function asListQuery(q: NormalizedQuery | undefined): ListQuery<Row> {
  return (q ?? {}) as ListQuery<Row>;
}

/** Find the freshest cached copy of a record, from its record query or any list. */
export function findCached(
  qc: QueryClient,
  collection: CollectionName,
  id: string,
): Row | undefined {
  const rec = qc.getQueryData<Row | null>(queryKeys.record(collection, id));
  if (rec) return rec;
  for (const [, data] of qc.getQueriesData<Row[]>({ queryKey: queryKeys.lists(collection) })) {
    const hit = Array.isArray(data) ? data.find((r) => r.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function snapshot(qc: QueryClient, collections: Iterable<CollectionName>): CacheSnapshot {
  const out: CacheSnapshot = [];
  for (const c of new Set(collections)) {
    out.push(...qc.getQueriesData({ queryKey: queryKeys.collection(c) }));
  }
  return out;
}

export function restore(qc: QueryClient, snap: CacheSnapshot) {
  for (const [key, data] of snap) qc.setQueryData(key, data);
}

export function applyChange(qc: QueryClient, ch: OptimisticChange) {
  const c = ch.collection;
  let full: Row | undefined;
  if (ch.type === 'create') full = ch.record as Row;
  if (ch.type === 'update') {
    const base = findCached(qc, c, ch.id);
    full = base ? { ...base, ...(ch.patch as Record<string, unknown>) } : undefined;
  }

  for (const [key, data] of qc.getQueriesData<unknown>({ queryKey: queryKeys.collection(c) })) {
    if (data === undefined) continue;
    if (isListKey(key)) {
      if (!Array.isArray(data)) continue;
      const rows = data as Row[];
      const query = asListQuery(key[3]);
      const id = ch.type === 'create' ? ch.record.id : ch.id;
      const idx = rows.findIndex((r) => r.id === id);
      let next: Row[] | null = null;
      if (ch.type === 'delete') {
        if (idx >= 0) next = rows.filter((r) => r.id !== id);
      } else {
        const merged =
          ch.type === 'update' && idx >= 0
            ? { ...rows[idx]!, ...(ch.patch as Record<string, unknown>) }
            : full;
        if (!merged) continue;
        const belongs = matchesQuery(merged, query);
        if (belongs && idx >= 0) next = rows.map((r, i) => (i === idx ? merged : r));
        else if (belongs) next = [...rows, merged];
        else if (idx >= 0) next = rows.filter((r) => r.id !== id);
        if (next && query.sort) next = sortRecords(next, query.sort);
      }
      if (next) qc.setQueryData(key, next);
    } else if (key[2] === 'record' && key[3] === (ch.type === 'create' ? ch.record.id : ch.id)) {
      if (ch.type === 'delete') qc.setQueryData(key, null);
      else if (ch.type === 'update') {
        qc.setQueryData(key, { ...(data as Row), ...(ch.patch as Record<string, unknown>) });
      } else qc.setQueryData(key, ch.record);
    }
  }
}
