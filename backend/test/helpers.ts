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
    env: {
      SRT_ALLOWED_DOMAIN: '',
      SRT_GOOGLE_CLIENT_ID: '',
      SRT_GOOGLE_CLIENT_SECRET: '',
      SRT_SMTP_HOST: '',
      SRT_MAIL_FROM: '',
      SRT_MAIL_FROM_NAME: '',
      SRT_MAIL_CAPTURE: '',
      SRT_APP_URL: '',
      SRT_DIGEST_HOUR: '',
      ...env,
    },
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

export interface CapturedMail {
  id: string;
  to: string[];
  subject: string;
  text: string;
  kind: string;
}

/** Emails captured in mail_outbox (the server must run with SRT_MAIL_CAPTURE=1), oldest first. */
export async function outbox(server: TestServer, filter = ''): Promise<CapturedMail[]> {
  const rows = await server.admin
    .collection('mail_outbox')
    .getFullList({ filter, sort: 'created,id' });
  return rows.map((r) => ({
    id: r.id,
    to: (r.to as string[] | null) ?? [],
    subject: r.subject as string,
    text: r.text as string,
    kind: r.kind as string,
  }));
}

/** Calls a custom route and returns the status and parsed JSON body (null when not JSON). */
export async function call(
  url: string,
  path: string,
  init: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = init.token;
  const res = await fetch(url + path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: res.status, body: parseJson(await res.text()), headers: res.headers };
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
