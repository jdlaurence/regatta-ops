// @vitest-environment node
//
// Share links end to end against a real PocketBase (backend/bin/pocketbase): a coach creates a
// link through PocketBaseStore, a visitor with no session reads it through the ShareApi, ticks
// the load list, and the coach sees the tick. Skipped with a message when the binary is missing
// (pnpm pb:download). Uses the backend's own test harness and fixture world.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PublishedSnapshot } from '@regatta-ops/domain';
import { PocketBaseStore } from '@/data/pocketbase-store';
import { isShareGone, shareApiFor } from '@/data/share';

// The web tests' setup clears localStorage after each test; Node has none without a flag.
if (typeof globalThis.localStorage === 'undefined') {
  const data = new Map<string, string>();
  (
    globalThis as { localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> }
  ).localStorage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

interface TestServer {
  url: string;
  stop(): Promise<void>;
}
interface Harness {
  HAS_BINARY: boolean;
  startTestServer(): Promise<TestServer>;
  seed(server: TestServer, world: unknown, accounts: unknown): Promise<unknown>;
}
interface BackendFixtures {
  PASSWORD: string;
  EMAILS: { coach: string };
  IDS: { regatta: string; boys: string; entry: string; eventFour: string; plan: string };
  testWorld(): { world: { regatta_teams: { id: string; teamId: string }[] }; accounts: unknown };
}

// Loaded by URL so the web app's type check does not pull in the backend's Node-only code.
const backendTest = new URL('../../../../../backend/test/', import.meta.url);
const harness = (await import(
  /* @vite-ignore */ new URL('helpers.ts', backendTest).href
)) as Harness;
const fixtures = (await import(
  /* @vite-ignore */ new URL('fixtures.ts', backendTest).href
)) as BackendFixtures;

if (!harness.HAS_BINARY) {
  console.warn('Skipping the share-link integration test: run pnpm pb:download first.');
}

describe.skipIf(!harness.HAS_BINARY)('share links against PocketBase', () => {
  let server: TestServer;
  let coach: PocketBaseStore;
  let rtBoys: string;
  const { IDS, EMAILS, PASSWORD } = fixtures;

  beforeAll(async () => {
    server = await harness.startTestServer();
    const { world, accounts } = fixtures.testWorld();
    rtBoys = world.regatta_teams.find((rt) => rt.teamId === IDS.boys)!.id;
    await harness.seed(server, world, accounts);
    coach = new PocketBaseStore(server.url);
    await coach.auth.signInWithPassword(EMAILS.coach, PASSWORD);
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it('creates a link as a coach, reads it without a session, and ticks the load list', async () => {
    // The coach publishes the boys' lineups and adds a line to the load list.
    const snapshot: PublishedSnapshot = {
      publishedAt: '2026-05-10T18:00:00.000Z',
      entries: [
        {
          entryId: IDS.entry,
          label: 'V4+',
          boatClass: '4+',
          status: 'planned',
          eventId: IDS.eventFour,
          eventName: "Men's Junior 4+",
          shellId: null,
          oarSetId: null,
          seats: [{ seat: '1', athleteId: null, athleteName: 'Rowan Test' }],
        },
      ],
    };
    await coach.update('regatta_teams', rtBoys, {
      publishedAt: snapshot.publishedAt,
      publishedSnapshot: snapshot,
    });
    const coxBoxes = await coach.create('load_items', {
      regattaId: IDS.regatta,
      loadPlanId: IDS.plan,
      kind: 'gear',
      label: 'Cox boxes',
      quantity: 4,
      container: 'Boys trailer bed',
      notes: 'Private item notes',
    });

    // The server makes the token and records the creator; what the client sends is ignored.
    const link = await coach.create('share_links', {
      regattaId: IDS.regatta,
      teamId: null,
      canCheckLoad: true,
      token: 'client-chosen-token-000000',
    });
    expect(link.token).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(link.createdBy).toBe(coach.auth.user!.id);
    expect(await coach.list('share_links', { where: { regattaId: IDS.regatta } })).toHaveLength(1);

    // A visitor with no session.
    const visitor = new PocketBaseStore(server.url);
    expect(visitor.auth.user).toBeNull();
    const api = shareApiFor(visitor);
    const view = await api.getShare(link.token);
    expect(view.link).toEqual({ scope: 'regatta', teamId: null, canCheckLoad: true });
    const boys = view.teams.find((t) => t.id === IDS.boys)!;
    expect(boys.published).toBe(true);
    expect(boys.entries[0]!.seats[0]!.athleteName).toBe('Rowan Test');
    expect(view.loadItems!.map((i) => i.label)).toContain('Cox boxes');
    expect(JSON.stringify(view)).not.toContain('Private item notes');
    expect(JSON.stringify(view)).not.toContain('@regatta-ops.test');

    const ticked = await api.tickLoadItem(link.token, coxBoxes.id, { loaded: true, by: 'Sam' });
    expect(ticked).toMatchObject({ id: coxBoxes.id, loaded: true, loadedBy: 'Sam' });
    // Idempotent: the same tick again keeps the first name.
    expect(
      await api.tickLoadItem(link.token, coxBoxes.id, { loaded: true, by: 'Alex' }),
    ).toMatchObject({ loadedBy: 'Sam', loadedAt: ticked.loadedAt });

    // The coach sees who ticked it.
    const saved = await coach.get('load_items', coxBoxes.id);
    expect(saved).toMatchObject({ loadedBy: null, loadedByName: 'Sam' });
    expect(saved!.loadedAt).toBe(ticked.loadedAt);

    // Revoking is permanent, and the page is gone.
    await coach.update('share_links', link.id, { revokedAt: new Date().toISOString() });
    await expect(api.getShare(link.token)).rejects.toSatisfy(isShareGone);
    await expect(coach.update('share_links', link.id, { revokedAt: null })).rejects.toMatchObject({
      code: 'validation',
    });
  });
});
