// @vitest-environment node
//
// Shell photos against a real PocketBase (backend/bin/pocketbase): a coach uploads a small PNG
// through PocketBaseStore, the record comes back with a file URL, the file and its thumbnail
// load, a viewer cannot upload, and removing the photo clears the field. Skipped with a
// message when the binary is missing (pnpm pb:download).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PocketBaseStore } from './pocketbase-store';

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
  EMAILS: { coach: string; viewer: string };
  IDS: { shellFour: string };
  testWorld(): { world: unknown; accounts: unknown };
}

// Loaded by URL so the web app's type check does not pull in the backend's Node-only code.
const backendTest = new URL('../../../../backend/test/', import.meta.url);
const harness = (await import(
  /* @vite-ignore */ new URL('helpers.ts', backendTest).href
)) as Harness;
const fixtures = (await import(
  /* @vite-ignore */ new URL('fixtures.ts', backendTest).href
)) as BackendFixtures;

if (!harness.HAS_BINARY) {
  console.warn('Skipping the shell photo integration test: run pnpm pb:download first.');
}

/** 2 × 2 opaque PNG (PocketBase makes thumbnails from real pixels). */
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPgyy8DIgYIBQAZAgPNgTN0UAAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

describe.skipIf(!harness.HAS_BINARY)('shell photos against PocketBase', () => {
  let server: TestServer;
  let coach: PocketBaseStore;
  const { IDS, EMAILS, PASSWORD } = fixtures;

  beforeAll(async () => {
    server = await harness.startTestServer();
    const { world, accounts } = fixtures.testWorld();
    await harness.seed(server, world, accounts);
    // No codec in Node: the file goes up as it is, as in a browser that cannot decode it.
    coach = new PocketBaseStore(server.url, { imageCodec: null });
    await coach.auth.signInWithPassword(EMAILS.coach, PASSWORD);
  }, 120_000);

  afterAll(async () => {
    await server?.stop();
  });

  it('uploads a photo, serves it and a thumbnail, and removes it', async () => {
    const file = new File([PNG], 'Spencer on the dock.png', { type: 'image/png' });
    const shell = await coach.uploadFile('shells', IDS.shellFour, 'photoUrl', file);
    // PocketBase keeps the name's stem (lowercased, with a random suffix) and the extension.
    expect(shell.photoUrl).toMatch(
      new RegExp(`^${server.url}/api/files/[^/]+/${IDS.shellFour}/spencer_on_the_dock_\\w+\\.png$`),
    );
    // Other fields are untouched, and a read maps the same URL.
    expect(shell.name).toBe('Spencer');
    expect((await coach.get('shells', IDS.shellFour))?.photoUrl).toBe(shell.photoUrl);

    const full = await fetch(coach.fileUrl('shells', shell, 'photoUrl')!);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(PNG);

    const thumbUrl = coach.fileUrl('shells', shell, 'photoUrl', { thumb: '96x96' })!;
    expect(thumbUrl).toContain('thumb=96x96');
    expect((await fetch(thumbUrl)).status).toBe(200);

    const removed = await coach.removeFile('shells', IDS.shellFour, 'photoUrl');
    expect(removed.photoUrl).toBeNull();
    expect((await coach.get('shells', IDS.shellFour))?.photoUrl).toBeNull();
  });

  it('refuses a viewer and a file that is not a photo', async () => {
    const viewer = new PocketBaseStore(server.url, { imageCodec: null });
    await viewer.auth.signInWithPassword(EMAILS.viewer, PASSWORD);
    const file = new File([PNG], 'photo.png', { type: 'image/png' });
    await expect(
      viewer.uploadFile('shells', IDS.shellFour, 'photoUrl', file),
    ).rejects.toMatchObject({ code: 'not_found' });

    const text = new File(['not a photo'], 'notes.txt', { type: 'text/plain' });
    await expect(coach.uploadFile('shells', IDS.shellFour, 'photoUrl', text)).rejects.toMatchObject(
      { code: 'validation', message: 'Pick a photo: a JPEG, PNG, or WebP file.' },
    );
    // A mislabeled file gets past the client and is refused by the server's type check.
    const fake = new File(['not a photo'], 'fake.png', { type: 'image/png' });
    await expect(coach.uploadFile('shells', IDS.shellFour, 'photoUrl', fake)).rejects.toMatchObject(
      { code: 'validation' },
    );
  });
});
