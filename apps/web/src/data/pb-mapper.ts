// PocketBase ↔ domain mapping (PLAN.md §8.1). Pure: no SDK import, so it is unit-tested alone.
//
// The rules, in order:
// 1. `id`, `created`, `updated` keep their names.
// 2. FIELD_OVERRIDES: explicit per-collection names (users.avatarUrl ↔ avatar).
// 3. Relation fields ending in `Id` drop the suffix: `teamId` ↔ `team`, `oarSetId` ↔ `oar_set`.
// 4. Everything else is camelCase ↔ snake_case: `hotSeatAckBy` ↔ `hot_seat_ack_by`.
// Values (schema.ts lists the fields):
// - single relations and optional selects: '' ↔ null; multi relations and selects: [].
// - instants: PocketBase returns '2025-05-16 15:00:00.000Z' (or ''); the domain uses ISO with
//   a 'T' (or null). Days are 'YYYY-MM-DD' text on both sides.
// - optional numbers: PocketBase stores 0 for "unset", read back as null.
// - json: null reads as the field's default ({} or []) where the domain requires a value;
//   contents pass through untouched (camelCase inside JSON stays camelCase).
//
// A field quirk found at merge time is a one-line change to FIELD_OVERRIDES or schema.ts.

import type { CollectionName } from '@regatta-ops/domain';
import {
  DATE_FIELDS,
  JSON_DEFAULTS,
  NULLABLE_NUMBERS,
  NULLABLE_SELECTS,
  RELATIONS,
} from './schema';
import { sortKeys, type ListQuery } from './store';

export function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** Domain field → PocketBase field, where the generic rules do not apply. */
export const FIELD_OVERRIDES: Partial<Record<CollectionName, Record<string, string>>> = {
  users: { avatarUrl: 'avatar' },
  shells: { photoUrl: 'photo' },
};

/**
 * The stored file name in a PocketBase file URL
 * ('/api/files/shells/abc/peggy_x1y2z3.jpg?thumb=96x96' → 'peggy_x1y2z3.jpg'); null for
 * anything else (a data URL, an empty value).
 */
export function fileNameFromUrl(url: string | null | undefined): string | null {
  if (!url || url.startsWith('data:')) return null;
  const path = url.split(/[?#]/)[0]!;
  if (!/\/api\/files\//.test(path)) return null;
  const last = path.slice(path.lastIndexOf('/') + 1);
  try {
    return last ? decodeURIComponent(last) : null;
  } catch {
    return last || null;
  }
}

/** Domain fields computed on read and never written back (file URLs). */
const READ_ONLY: Partial<Record<CollectionName, string[]>> = {
  users: ['avatarUrl'],
  shells: ['photoUrl'],
};

const SYSTEM_FIELDS = new Set(['id', 'created', 'updated']);

/** PocketBase response fields that are not part of the domain record. */
const DROP_ON_READ = new Set([
  'collectionId',
  'collectionName',
  'expand',
  'emailVisibility',
  'verified',
  'tokenKey',
  'password',
  'passwordConfirm',
]);

export function toPbField(collection: CollectionName, field: string): string {
  if (SYSTEM_FIELDS.has(field)) return field;
  const override = FIELD_OVERRIDES[collection]?.[field];
  if (override) return override;
  if (RELATIONS[collection][field] && field.endsWith('Id')) {
    return camelToSnake(field.slice(0, -2));
  }
  return camelToSnake(field);
}

const reverseCache = new Map<CollectionName, Map<string, string>>();

function reverseMap(collection: CollectionName): Map<string, string> {
  let map = reverseCache.get(collection);
  if (!map) {
    map = new Map();
    const known = [
      ...Object.keys(RELATIONS[collection]),
      ...Object.keys(FIELD_OVERRIDES[collection] ?? {}),
    ];
    for (const field of known) map.set(toPbField(collection, field), field);
    reverseCache.set(collection, map);
  }
  return map;
}

export function fromPbField(collection: CollectionName, pbField: string): string {
  if (SYSTEM_FIELDS.has(pbField)) return pbField;
  return reverseMap(collection).get(pbField) ?? snakeToCamel(pbField);
}

/** '2025-05-16 15:00:00.000Z' → '2025-05-16T15:00:00.000Z'. Leaves other strings alone. */
export function pbDateToIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') : value;
}

function readValue(collection: CollectionName, field: string, value: unknown): unknown {
  const relation = RELATIONS[collection][field];
  if (relation) {
    if (relation.multi) return Array.isArray(value) ? value : value ? [value] : [];
    return value === '' || value === undefined ? null : value;
  }
  const dateKind = DATE_FIELDS[collection]?.[field];
  if (dateKind) {
    if (value === '' || value === null || value === undefined) return null;
    const iso = pbDateToIso(String(value));
    return dateKind === 'day' ? iso.slice(0, 10) : iso;
  }
  if (field === 'created' || field === 'updated') {
    return typeof value === 'string' ? pbDateToIso(value) : value;
  }
  if (NULLABLE_SELECTS[collection]?.includes(field)) return value === '' ? null : value;
  if (NULLABLE_NUMBERS[collection]?.includes(field)) return value === 0 ? null : value;
  const jsonDefault = JSON_DEFAULTS[collection]?.[field];
  if (jsonDefault && value == null) return jsonDefault();
  if ((READ_ONLY[collection] ?? []).includes(field)) {
    return value === '' ? null : value;
  }
  return value;
}

/** Write form of a single value (also used for filter parameters). */
export function writeValue(collection: CollectionName, field: string, value: unknown): unknown {
  const relation = RELATIONS[collection][field];
  if (relation) {
    if (relation.multi) return value ?? [];
    return value ?? '';
  }
  if (DATE_FIELDS[collection]?.[field]) return value ?? '';
  if (NULLABLE_SELECTS[collection]?.includes(field)) return value ?? '';
  if (NULLABLE_NUMBERS[collection]?.includes(field)) return value ?? 0;
  return value;
}

/** A PocketBase record (snake_case) → a domain record (camelCase). */
export function fromPb<T = Record<string, unknown>>(
  collection: CollectionName,
  raw: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = {};
  for (const [pbField, value] of Object.entries(raw)) {
    if (DROP_ON_READ.has(pbField)) continue;
    const field = fromPbField(collection, pbField);
    out[field] = readValue(collection, field, value);
  }
  return out as T;
}

/** A domain record or patch (camelCase) → a PocketBase body (snake_case). */
export function toPb(
  collection: CollectionName,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const readOnly = READ_ONLY[collection] ?? [];
  for (const [field, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (field === 'created' || field === 'updated') continue;
    if (readOnly.includes(field)) continue;
    out[toPbField(collection, field)] = writeValue(collection, field, value);
  }
  return out;
}

export interface PbListParams {
  /** Filter with {:pN} placeholders, for `pb.filter(filter, params)`; '' means no filter. */
  filter: string;
  params: Record<string, unknown>;
  sort: string;
}

/**
 * A ListQuery → PocketBase list parameters. Returns null when the query can match nothing
 * (an empty `in` list), so the caller can skip the request.
 */
export function toPbListParams<T>(
  collection: CollectionName,
  query?: ListQuery<T>,
): PbListParams | null {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  let n = 0;
  const param = (value: unknown) => {
    const key = `p${n++}`;
    params[key] = value;
    return `{:${key}}`;
  };
  for (const [field, value] of Object.entries(query?.where ?? {})) {
    const pbField = toPbField(collection, field);
    const multi = RELATIONS[collection][field]?.multi;
    clauses.push(`${pbField} ${multi ? '?=' : '='} ${param(writeValue(collection, field, value))}`);
  }
  for (const [field, values] of Object.entries(query?.in ?? {})) {
    if (!values) continue;
    const list = values as readonly unknown[];
    if (list.length === 0) return null;
    const pbField = toPbField(collection, field);
    const ors = list.map((v) => `${pbField} = ${param(writeValue(collection, field, v))}`);
    clauses.push(ors.length === 1 ? ors[0]! : `(${ors.join(' || ')})`);
  }
  const sort = sortKeys(query?.sort)
    .map(({ field, dir }) => `${dir < 0 ? '-' : ''}${toPbField(collection, field)}`)
    .join(',');
  return { filter: clauses.join(' && '), params, sort };
}

/**
 * Split a query whose `in` lists are long into several queries, so no request URL grows past
 * what proxies accept. The caller merges and re-sorts the results.
 */
export function chunkQuery<T>(query: ListQuery<T> | undefined, size = 40): ListQuery<T>[] {
  if (!query?.in) return [query ?? {}];
  const entries = Object.entries(query.in) as [string, readonly unknown[] | undefined][];
  const longest = entries.reduce<[string, readonly unknown[]] | null>((acc, [field, values]) => {
    if (!values) return acc;
    return !acc || values.length > acc[1].length ? [field, values] : acc;
  }, null);
  if (!longest || longest[1].length <= size) return [query];
  const [field, values] = longest;
  const out: ListQuery<T>[] = [];
  for (let i = 0; i < values.length; i += size) {
    out.push({ ...query, in: { ...query.in, [field]: values.slice(i, i + size) } });
  }
  return out;
}
