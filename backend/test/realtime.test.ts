// Realtime collaboration through the web app's own PocketBaseStore against a real PocketBase: two
// coaches on two clients. One changes an entry and the other's subscription sees it with the
// author; a stale expected_updated comes back as a 'conflict'; presence rows written by one are
// visible (and live) to the other. Skips without the binary.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActivityEntry, Entry, Presence } from '@regatta-ops/domain';
import { PocketBaseStore } from '../../apps/web/src/data/pocketbase-store';
import { StoreError, type ChangeEvent } from '../../apps/web/src/data/store';
import {
  ChangeCoalescer,
  remoteChange,
  type ChangeNotice,
} from '../../apps/web/src/data/change-coalescer';
import { shortUserName } from '../../apps/web/src/data/collab-format';
import { activeViewers, PresenceBeacon } from '../../apps/web/src/data/presence-beacon';
import { ensureEventSource } from './eventsource';
import { EMAILS, IDS, PASSWORD, testWorld } from './fixtures';
import { HAS_BINARY, seed, startTestServer, type TestServer } from './helpers';

ensureEventSource();

async function eventually<T>(read: () => T | undefined | null | false, timeoutMs = 5000) {
  const start = Date.now();
  for (;;) {
    const value = read();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for a condition.');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Subscribe and wait until the server has the subscription. */
async function listen(
  store: PocketBaseStore,
  collection: Parameters<PocketBaseStore['subscribe']>[0],
) {
  const events: ChangeEvent[] = [];
  const stop = store.subscribe(collection, (e) => events.push(e as ChangeEvent));
  const realtime = store.pb.realtime as unknown as { lastSentSubscriptions?: string[] };
  await eventually(
    () =>
      store.pb.realtime.isConnected &&
      (realtime.lastSentSubscriptions ?? []).some((t) => t.startsWith(`${collection}/*`)),
  );
  return { events, stop };
}

describe.skipIf(!HAS_BINARY)('realtime collaboration (PocketBaseStore, two coaches)', () => {
  let server: TestServer;
  let a: PocketBaseStore; // Cam Coach
  let b: PocketBaseStore; // Cy Coach

  beforeAll(async () => {
    server = await startTestServer();
    const { world, accounts } = testWorld();
    await seed(server, world, accounts);
    a = new PocketBaseStore(server.url);
    b = new PocketBaseStore(server.url);
    await a.auth.signInWithPassword(EMAILS.coach, PASSWORD);
    await b.auth.signInWithPassword(EMAILS.coach2, PASSWORD);
  });

  afterAll(async () => {
    // Close the event streams before the server goes, so the SDK does not try to reconnect.
    await a?.pb.realtime.unsubscribe().catch(() => undefined);
    await b?.pb.realtime.unsubscribe().catch(() => undefined);
    await server?.stop();
  });

  it("delivers one coach's entry change to the other, with the author, and announces it", async () => {
    const entries = await listen(b, 'entries');
    const log = await listen(b, 'activity_log');
    const ownLog = await listen(a, 'activity_log');

    await a.update('entries', IDS.entry, { label: 'Realtime V4+' });

    const seen = await eventually(() =>
      entries.events.find((e) => e.action === 'update' && e.record.id === IDS.entry),
    );
    const entry = seen.record as Entry;
    expect(entry.label).toBe('Realtime V4+');
    expect(entry.updatedBy).toBe(IDS.coach);

    // The toast source: the activity line, attributed to coach A.
    const line = await eventually(() =>
      log.events.find(
        (e) => e.action === 'create' && (e.record as ActivityEntry).targetId === IDS.entry,
      ),
    );
    expect(line.record).toMatchObject({
      actorId: IDS.coach,
      regattaId: IDS.regatta,
      targetType: 'entries',
    });
    const names = new Map((await b.list('users')).map((u) => [u.id, u.name]));
    const forB = remoteChange(line, { regattaId: IDS.regatta, meId: IDS.coach2, names });
    expect(forB).toMatchObject({ actorId: IDS.coach, actorName: shortUserName('Cam Coach') });
    const shown: ChangeNotice[] = [];
    const coalescer = new ChangeCoalescer((n) => shown.push(n), { settleMs: 0 });
    coalescer.push(forB!);
    await eventually(() => shown.length > 0);
    expect(shown[0]!.title).toBe('Updated by Cam C. just now');

    // Coach A's own client hears the same line and stays quiet.
    const own = await eventually(() =>
      ownLog.events.find((e) => (e.record as ActivityEntry).targetId === IDS.entry),
    );
    expect(remoteChange(own, { regattaId: IDS.regatta, meId: IDS.coach, names })).toBeNull();

    entries.stop();
    log.stop();
    ownLog.stop();
  });

  it('refuses a stale expectedUpdated with a conflict, for event times and placements', async () => {
    const ev = (await a.get('events', IDS.eventFour))!;
    await b.update('events', IDS.eventFour, { notes: 'Moved by coach B' });
    const stale = a.update(
      'events',
      IDS.eventFour,
      { scheduledAt: '2026-11-01T18:00:00.000Z' },
      { expectedUpdated: ev.updated },
    );
    await expect(stale).rejects.toBeInstanceOf(StoreError);
    await expect(stale).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect((await a.get('events', IDS.eventFour))!.notes).toBe('Moved by coach B');

    const fresh = (await a.get('events', IDS.eventFour))!;
    await expect(
      a.update(
        'events',
        IDS.eventFour,
        { scheduledAt: '2026-11-01T18:00:00.000Z' },
        { expectedUpdated: fresh.updated },
      ),
    ).resolves.toMatchObject({ scheduledAt: '2026-11-01T18:00:00.000Z' });

    const placement = (await a.get('load_placements', IDS.placement))!;
    await b.update('load_placements', IDS.placement, { offsetCm: placement.offsetCm + 10 });
    await expect(
      a.update(
        'load_placements',
        IDS.placement,
        { offsetCm: 0 },
        { expectedUpdated: placement.updated },
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it("shows one coach's presence to the other, live, and only its owner can change it", async () => {
    const live = await listen(b, 'presence');
    const beacon = new PresenceBeacon(a);
    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'lineups', teamId: IDS.girls });
    const rowId = beacon.rowId(IDS.regatta)!;

    await eventually(() => live.events.find((e) => e.action === 'create' && e.record.id === rowId));
    const rows = (await b.list('presence', { where: { regattaId: IDS.regatta } })) as Presence[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: IDS.coach, page: 'lineups', teamId: IDS.girls });

    const users = new Map((await b.list('users')).map((u) => [u.id, u]));
    const teams = new Map((await b.list('teams')).map((t) => [t.id, t]));
    const viewers = activeViewers(rows, {
      now: Date.now(),
      meId: IDS.coach2,
      users,
      teams,
      shortName: shortUserName,
    });
    expect(viewers.map((v) => [v.shortName, v.activity])).toEqual([
      ['Cam C.', 'editing Girls lineups'],
    ]);
    // Coach A does not see themselves.
    expect(
      activeViewers(rows, {
        now: Date.now(),
        meId: IDS.coach,
        users,
        teams,
        shortName: shortUserName,
      }),
    ).toEqual([]);

    // A heartbeat refreshes the same row, and the other coach hears it.
    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'trailer' });
    expect(beacon.rowId(IDS.regatta)).toBe(rowId);
    await eventually(() =>
      live.events.find((e) => e.action === 'update' && (e.record as Presence).page === 'trailer'),
    );

    // Coach B cannot move coach A's row, and cannot write a row in A's name.
    await expect(b.update('presence', rowId, { page: 'schedule' })).rejects.toMatchObject({
      code: 'not_found',
    });
    const forged = await b.create('presence', {
      userId: IDS.coach,
      regattaId: IDS.regatta,
      page: 'schedule',
      seenAt: new Date().toISOString(),
    });
    expect(forged.userId).toBe(IDS.coach2);
    await b.delete('presence', forged.id);

    // Leaving deletes the row, and the other coach hears that too.
    await beacon.leave(IDS.regatta);
    await eventually(() => live.events.find((e) => e.action === 'delete' && e.record.id === rowId));
    expect(await b.list('presence', { where: { regattaId: IDS.regatta } })).toEqual([]);
    live.stop();
  });
});
