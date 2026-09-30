// Domain record (camelCase, packages/domain/src/types.ts) → PocketBase record body (snake_case,
// pb_migrations). Driven by the live collection schema, so it needs no per-collection tables:
//
// - keys: camelCase → snake_case ('boatClass' → 'boat_class'); a trailing 'Id' is dropped when
//   that names a relation field ('eventId' → 'event', 'oarSetId' → 'oar_set'), and a trailing
//   'Url' is dropped when that names a file field ('photoUrl' → 'photo', skipped: files are not
//   seeded). 'targetId' and 'refId' stay 'target_id' and 'ref_id' (text fields).
// - values: null/undefined → '' for single relations, selects, text, and dates; → [] for multi
//   relations and multi selects; → 0 for numbers; → false for bools; → null for json.
//   Arrays and objects go to json fields as they are.
// - 'created' and 'updated' are skipped (PocketBase sets them); 'id' is kept.

export interface PbField {
  name: string;
  type: string;
  maxSelect?: number;
  collectionId?: string;
}

export interface PbCollectionSchema {
  id: string;
  name: string;
  type: string;
  fields: PbField[];
}

/** 'oarSetId' → 'oar_set_id'. */
export function camelToSnake(key: string): string {
  return key.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/** The PocketBase field a domain key maps to, or undefined when the schema has none. */
export function fieldFor(schema: PbCollectionSchema, key: string): PbField | undefined {
  const snake = camelToSnake(key);
  const direct = schema.fields.find((f) => f.name === snake);
  if (direct) return direct;
  if (snake.endsWith('_id')) {
    const name = snake.slice(0, -3);
    return schema.fields.find((f) => f.name === name && f.type === 'relation');
  }
  if (snake.endsWith('_url')) {
    const name = snake.slice(0, -4);
    return schema.fields.find((f) => f.name === name && f.type === 'file');
  }
  return undefined;
}

function isMulti(field: PbField): boolean {
  return (field.maxSelect ?? 1) > 1;
}

export function toPbValue(field: PbField, value: unknown): unknown {
  switch (field.type) {
    case 'relation':
    case 'select':
      if (isMulti(field)) {
        if (value === null || value === undefined) return [];
        return Array.isArray(value) ? value : [value];
      }
      return value ?? '';
    case 'json':
      return value === undefined ? null : value;
    case 'number':
      return value ?? 0;
    case 'bool':
      return value ?? false;
    default:
      return value ?? '';
  }
}

const NOT_WRITABLE = new Set(['file', 'autodate', 'password']);

export interface MappedRecord {
  data: Record<string, unknown>;
  /** Domain keys with no matching field (a migration or a domain type is out of date). */
  unknown: string[];
}

export function toPbRecord(schema: PbCollectionSchema, record: object): MappedRecord {
  const data: Record<string, unknown> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'created' || key === 'updated') continue;
    if (key === 'id') {
      data.id = value;
      continue;
    }
    const field = fieldFor(schema, key);
    if (!field) {
      unknown.push(key);
      continue;
    }
    if (NOT_WRITABLE.has(field.type)) continue;
    data[field.name] = toPbValue(field, value);
  }
  return { data, unknown };
}

/**
 * Collection names ordered so every relation target comes before the collections pointing at it
 * (teams before users before regattas before entries...). Self-relations are ignored.
 */
export function dependencyOrder(schemas: PbCollectionSchema[], names: readonly string[]): string[] {
  const byId = new Map(schemas.map((s) => [s.id, s.name]));
  const byName = new Map(schemas.map((s) => [s.name, s]));
  const wanted = new Set(names);
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (name: string, trail: string[]) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      throw new Error(`Relation cycle: ${[...trail, name].join(' → ')}`);
    }
    state.set(name, 'visiting');
    for (const field of byName.get(name)?.fields ?? []) {
      if (field.type !== 'relation' || !field.collectionId) continue;
      const target = byId.get(field.collectionId);
      if (target && target !== name && wanted.has(target)) visit(target, [...trail, name]);
    }
    state.set(name, 'done');
    order.push(name);
  };
  for (const name of names) if (byName.has(name)) visit(name, []);
  return order;
}
