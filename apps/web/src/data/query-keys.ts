// TanStack Query keys. Every key starts with ['regatta-ops', collection], so a change to a
// collection invalidates everything read from it with one call. List keys carry the normalized
// query, whose `where.regattaId` namespaces them by regatta:
//
//   ['regatta-ops', 'entries', 'list', { where: { regattaId: 'abc' } }]
//   ['regatta-ops', 'entries', 'record', 'k2j...']
//
// TanStack matches object keys partially, so queryKeys.regattaLists('entries', id) matches
// every entries list of that regatta whatever its other filters or sort.

import type { CollectionName } from '@regatta-ops/domain';
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
  if (query?.sort)
    out.sort = (Array.isArray(query.sort) ? [...query.sort] : [query.sort]) as string[];
  return out;
}

export const queryKeys = {
  all: ['regatta-ops'] as const,
  collection: (c: CollectionName) => ['regatta-ops', c] as const,
  lists: (c: CollectionName) => ['regatta-ops', c, 'list'] as const,
  list: <T>(c: CollectionName, query?: ListQuery<T>) =>
    ['regatta-ops', c, 'list', normalizeQuery(query)] as const,
  /** Prefix of every list in `c` filtered to one regatta. */
  regattaLists: (c: CollectionName, regattaId: string) =>
    ['regatta-ops', c, 'list', { where: { regattaId } }] as const,
  records: (c: CollectionName) => ['regatta-ops', c, 'record'] as const,
  record: (c: CollectionName, id: string) => ['regatta-ops', c, 'record', id] as const,
};
