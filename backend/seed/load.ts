// Writes a seed World into PocketBase, preserving ids, in relation order. Upserts, so running it
// twice leaves one copy of everything. Needs a superuser-authenticated client.

import { randomUUID } from 'node:crypto';
import { COLLECTION_NAMES, type SeedAccount, type World } from '@regatta-ops/domain';
import type PocketBase from 'pocketbase';
import { ClientResponseError, type CollectionModel } from 'pocketbase';
import { dependencyOrder, toPbRecord, type PbCollectionSchema } from './mapping';

export interface LoadSummary {
  /** Collection name → records written, in the order they were written. */
  counts: Record<string, number>;
  /** Collection name → domain keys that had no PocketBase field (should be empty). */
  unknown: Record<string, string[]>;
}

function toSchema(c: CollectionModel): PbCollectionSchema {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    fields: c.fields.map((f) => ({
      name: f.name,
      type: f.type,
      maxSelect: typeof f.maxSelect === 'number' ? f.maxSelect : undefined,
      collectionId: typeof f.collectionId === 'string' ? f.collectionId : undefined,
    })),
  };
}

function describeError(err: unknown, collection: string, batch: Record<string, unknown>[]): Error {
  if (err instanceof ClientResponseError) {
    const detail = JSON.stringify(err.response?.data ?? err.response, null, 2);
    const firstId = batch[0]?.id ?? '?';
    return new Error(
      `Seeding ${collection} failed (batch starting at id ${String(firstId)}): ${err.message}\n${detail}`,
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}

export async function loadWorld(
  pb: PocketBase,
  world: World,
  accounts: SeedAccount[],
  options: { chunkSize?: number } = {},
): Promise<LoadSummary> {
  const chunkSize = options.chunkSize ?? 100;
  const schemas = (await pb.collections.getFullList()).map(toSchema);
  const byName = new Map(schemas.map((s) => [s.name, s]));
  const missing = COLLECTION_NAMES.filter((n) => !byName.has(n));
  if (missing.length) {
    throw new Error(`Collections missing from PocketBase (run migrations): ${missing.join(', ')}`);
  }
  const passwords = new Map(accounts.map((a) => [a.userId, a.password]));

  const counts: Record<string, number> = {};
  const unknown: Record<string, string[]> = {};
  for (const name of dependencyOrder(schemas, COLLECTION_NAMES)) {
    const schema = byName.get(name)!;
    const records = world[name as keyof World] as object[];
    const bodies = records.map((record) => {
      const mapped = toPbRecord(schema, record);
      for (const key of mapped.unknown) {
        unknown[name] ??= [];
        if (!unknown[name].includes(key)) unknown[name].push(key);
      }
      if (name === 'users') {
        const password = passwords.get(String(mapped.data.id)) ?? randomUUID();
        Object.assign(mapped.data, {
          password,
          passwordConfirm: password,
          verified: true,
          emailVisibility: false,
        });
      }
      return mapped.data;
    });
    for (let i = 0; i < bodies.length; i += chunkSize) {
      const chunk = bodies.slice(i, i + chunkSize);
      const batch = pb.createBatch();
      for (const body of chunk) batch.collection(name).upsert(body);
      try {
        await batch.send();
      } catch (err) {
        throw describeError(err, name, chunk);
      }
    }
    counts[name] = bodies.length;
  }
  return { counts, unknown };
}
