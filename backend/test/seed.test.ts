// The full seed world (@srt/seed) loads into the migrated schema: every collection and every
// field the domain types carry has a home, and loading twice changes nothing.

import { COLLECTION_NAMES } from '@srt/domain';
import { buildSeedWorld } from '@srt/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorld } from '../seed/load';
import { HAS_BINARY, client, signIn, startTestServer, type TestServer } from './helpers';

describe.skipIf(!HAS_BINARY)('seed world', () => {
  let server: TestServer;
  const { world, accounts } = buildSeedWorld();

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('loads every record with its id, and maps every field', async () => {
    const summary = await loadWorld(server.admin, world, accounts);
    expect(summary.unknown).toEqual({});
    for (const name of COLLECTION_NAMES) {
      const stored = await server.admin.collection(name).getList(1, 1);
      expect(stored.totalItems, name).toBe(world[name].length);
    }
    const [firstShell] = world.shells;
    if (firstShell) {
      expect((await server.admin.collection('shells').getOne(firstShell.id)).name).toBe(
        firstShell.name,
      );
    }
  });

  it('is safe to run again', async () => {
    await loadWorld(server.admin, world, accounts);
    for (const name of COLLECTION_NAMES) {
      const stored = await server.admin.collection(name).getList(1, 1);
      expect(stored.totalItems, name).toBe(world[name].length);
    }
  });

  it('creates a working sign-in for every seed account', async () => {
    for (const account of accounts) {
      const pb = await signIn(server.url, account.email, account.password);
      const user = world.users.find((u) => u.id === account.userId);
      expect(pb.authStore.record?.id).toBe(account.userId);
      expect(pb.authStore.record?.role).toBe(user?.role);
    }
  });

  it('offers password sign-in, and Google only once configured', async () => {
    const methods = await client(server.url).collection('users').listAuthMethods();
    expect(methods.password.enabled).toBe(true);
    expect(methods.oauth2.enabled).toBe(false);
  });
});

describe.skipIf(!HAS_BINARY)('Google sign-in configuration from the environment', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer({
      SRT_GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      SRT_GOOGLE_CLIENT_SECRET: 'test-secret',
    });
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('enables the Google provider with the given client id', async () => {
    const methods = await client(server.url).collection('users').listAuthMethods();
    expect(methods.oauth2.enabled).toBe(true);
    expect(methods.oauth2.providers.map((p) => p.name)).toEqual(['google']);
    const users = await server.admin.collections.getOne('users');
    const google = (users.oauth2?.providers ?? []).find(
      (p: { name: string }) => p.name === 'google',
    );
    expect(google?.clientId).toBe('test-client.apps.googleusercontent.com');
  });
});
