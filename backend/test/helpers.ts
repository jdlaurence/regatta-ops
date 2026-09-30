// Test harness: a real PocketBase on a temp data dir and a free port, migrated, with the local
// superuser, optionally seeded.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SeedAccount, World } from '@srt/domain';
import PocketBase from 'pocketbase';
import { loadWorld, type LoadSummary } from '../seed/load';
import {
  SUPERUSER,
  hasBinary,
  migrateUp,
  startPocketBase,
  upsertSuperuser,
} from '../scripts/pocketbase';

/** False when backend/bin/pocketbase is missing; test/global-setup.ts prints why suites skip. */
export const HAS_BINARY = hasBinary();

export interface TestServer {
  url: string;
  /** Superuser client. */
  admin: PocketBase;
  output(): string;
  stop(): Promise<void>;
}

export async function startTestServer(env: NodeJS.ProcessEnv = {}): Promise<TestServer> {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'srt-pb-test-'));
  await migrateUp(dataDir);
  await upsertSuperuser(dataDir);
  // Ignore the developer's own SRT_* settings; each suite states what it needs.
  const server = await startPocketBase({
    dataDir,
    env: { SRT_ALLOWED_DOMAIN: '', SRT_GOOGLE_CLIENT_ID: '', SRT_GOOGLE_CLIENT_SECRET: '', ...env },
  });
  const admin = client(server.url);
  await admin.collection('_superusers').authWithPassword(SUPERUSER.email, SUPERUSER.password);
  return {
    url: server.url,
    admin,
    output: server.output,
    stop: async () => {
      await server.stop();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

export function client(url: string): PocketBase {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  return pb;
}

export async function signIn(url: string, email: string, password: string): Promise<PocketBase> {
  const pb = client(url);
  await pb.collection('users').authWithPassword(email, password);
  return pb;
}

export async function seed(
  server: TestServer,
  world: World,
  accounts: SeedAccount[],
): Promise<LoadSummary> {
  return loadWorld(server.admin, world, accounts);
}

/** Resolves to the HTTP status of a rejected SDK call (0 when it did not reject). */
export async function statusOf(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}
