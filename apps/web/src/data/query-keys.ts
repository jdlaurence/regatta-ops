// TanStack Query keys (PLAN.md §10.1). Every key starts with ['srt', collection], so a change to
// a collection invalidates everything read from it with one call. List keys carry the
// normalized query, whose `where.regattaId` namespaces them by regatta:
//
//   ['srt', 'entries', 'list', { where: { regattaId: 'abc' } }]
//   ['srt', 'entries', 'record', 'k2j...']
//
// TanStack matches object keys partially, so queryKeys.regattaLists('entries', id) matches
// every entries list of that regatta whatever its other filters or sort.

import type { CollectionName } from '@srt/domain';
import type { ListQuery } from './store';

export interface NormalizedQuery {
  where?: Record<string, unknown>;
  in?: Record<string, unknown[]>;
  sort?: string[];
}

/** Stable form of a ListQuery for use in a key: `in` values sorted and deduplicated. */
export function normalizeQuery<T>(query?: ListQuery<T>): NormalizedQuery {
  const out: NormalizedQuery = {};
  if (query?.where && Object.keys(query.where).length > 0) {
    out.where = { ...(query.where as Record<string, unknown>) };
  }
  if (query?.in) {
    const inn: Record<string, unknown[]> = {};
    for (const [field, values] of Object.entries(query.in)) {
      if (!values) continue;
      inn[field] = Array.from(new Set(values as unknown[])).sort();
    }
    if (Object.keys(inn).length > 0) out.in = inn;
  }
  if (query?.sort) out.sort = (Array.isArray(query.sort) ? [...query.sort] : [query.sort]) as string[];
  return out;
}

export const queryKeys = {
  all: ['srt'] as const,
  collection: (c: CollectionName) => ['srt', c] as const,
  lists: (c: CollectionName) => ['srt', c, 'list'] as const,
  list: <T>(c: CollectionName, query?: ListQuery<T>) =>
    ['srt', c, 'list', normalizeQuery(query)] as const,
  /** Prefix of every list in `c` filtered to one regatta. */
  regattaLists: (c: CollectionName, regattaId: string) =>
    ['srt', c, 'list', { where: { regattaId } }] as const,
  records: (c: CollectionName) => ['srt', c, 'record'] as const,
  record: (c: CollectionName, id: string) => ['srt', c, 'record', id] as const,
};
