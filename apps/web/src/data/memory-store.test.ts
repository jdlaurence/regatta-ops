import { describe, expect, it, vi } from 'vitest';
import { flush, fixtureStore, IDS } from '@/test/fixtures';
import { batchOp, StoreError, type ChangeEvent } from './store';

describe('MemoryStore reads', () => {
  it('filters with where, in, and sort', async () => {
    const store = fixtureStore();
    const events = await store.list('events', {
      where: { regattaId: IDS.regatta },
      sort: 'scheduledAt',
    });
    expect(events.map((e) => e.eventNumber)).toEqual(['12', '14']);

    const desc = await store.list('events', {
      where: { regattaId: IDS.regatta },
      sort: '-sortOrder',
    });
    expect(desc.map((e) => e.sortOrder)).toEqual([2, 1]);

    const athletes = await store.list('athletes', { in: { teamId: [IDS.girls, IDS.masters] } });
    expect(athletes.map((a) => a.firstName).sort()).toEqual(['Jules', 'Quinn']);

    expect(await store.list('athletes', { in: { teamId: [] } })).toEqual([]);
  });

  it('matches null against missing and empty values', async () => {
    const store = fixtureStore();
    await store.create('entries', {
      regattaId: IDS.regatta,
      teamId: IDS.girls,
      label: 'V1x',
      boatClass: '1x',
      status: 'draft',
    });
    const unscheduled = await store.list('entries', { where: { eventId: null } });
    expect(unscheduled.map((e) => e.label)).toEqual(['V1x']);
  });

  it('returns null for a missing record and copies, not live objects', async () => {
    const store = fixtureStore();
    expect(await store.get('teams', 'nope00000000000')).toBeNull();
    const team = await store.get('teams', IDS.boys);
    team!.name = 'Changed';
    expect((await store.get('teams', IDS.boys))!.name).toBe('Junior boys');
  });
});

describe('MemoryStore writes', () => {
  it('creates with a generated or supplied id, and stamps created/updated', async () => {
    const store = fixtureStore({ now: () => '2026-10-01T12:00:00.000Z' });
    const a = await store.create('teams', {
      name: 'Evening masters',
      shortName: 'PM',
      program: 'masters',
      colorKey: 'violet',
      sortOrder: 4,
      archived: false,
    });
    expect(a.id).toMatch(/^[a-z0-9]{15}$/);
    expect(a.created).toBe('2026-10-01T12:00:00.000Z');
    const b = await store.create('teams', { ...a, id: 'teamchosen00001' });
    expect(b.id).toBe('teamchosen00001');
    await expect(store.create('teams', { ...a, id: 'teamchosen00001' })).rejects.toMatchObject({
      code: 'unique',
    });
  });

  it('stamps createdBy and updatedBy from the signed-in user', async () => {
    const store = fixtureStore();
    const entry = await store.create('entries', {
      regattaId: IDS.regatta,
      teamId: IDS.girls,
      label: 'V8',
      boatClass: '8+',
      status: 'draft',
    });
    expect(entry.createdBy).toBe(IDS.coach);
    expect(entry.updatedBy).toBe(IDS.coach);
    const regatta = await store.create('regattas', {
      name: 'Frostbite',
      venue: 'Green Lake',
      city: 'Seattle, WA',
      startDate: '2026-12-05',
      endDate: '2026-12-05',
      timezone: 'America/Los_Angeles',
      format: 'head',
      status: 'planning',
      settings: {},
    });
    expect(regatta.createdBy).toBe(IDS.coach);
  });

  it('keeps entries.boatClass in step with its event', async () => {
    const store = fixtureStore();
    const moved = await store.update('entries', IDS.entry1, { eventId: IDS.event2 });
    expect(moved.boatClass).toBe('8+');
    const created = await store.create('entries', {
      regattaId: IDS.regatta,
      eventId: IDS.event1,
      teamId: IDS.girls,
      label: 'V4+',
      boatClass: '8+',
      status: 'draft',
    });
    expect(created.boatClass).toBe('4+');
  });

  it('writes activity log lines with a human summary', async () => {
    const store = fixtureStore();
    await store.update('entries', IDS.entry1, { eventId: IDS.event2 });
    await store.update('entry_seats', 'seatentry1s0001', { athleteId: 'athboys00000002' });
    await store.create('availability', {
      regattaId: IDS.regatta,
      athleteId: 'athgirls0000001',
      status: 'unavailable',
    });
    const log = await store.list('activity_log', { sort: 'created' });
    expect(log.map((l) => l.summary)).toEqual([
      'moved entry Boys V4+ to Event 14',
      'set seat 1 of Boys V4+ to Emery Sample',
      'marked Quinn Example unavailable',
    ]);
    expect(log.every((l) => l.regattaId === IDS.regatta && l.actorId === IDS.coach)).toBe(true);
    expect(log[0]!.diff).toMatchObject({ eventId: { from: IDS.event1, to: IDS.event2 } });
  });

  it('logs event time changes and placements', async () => {
    const store = fixtureStore();
    await store.update('events', IDS.event1, { scheduledAt: '2026-11-01T18:05:00.000Z' });
    const plan = await store.create('load_plans', {
      regattaId: IDS.regatta,
      trailerId: IDS.trailer,
      status: 'draft',
      rules: [],
    });
    await store.create('load_placements', {
      loadPlanId: plan.id,
      shellId: IDS.shell,
      shelfId: IDS.shelf,
      lane: 0,
      offsetCm: 0,
      bowForward: false,
      locked: false,
      reasons: [],
    });
    const log = await store.list('activity_log', { sort: 'created' });
    expect(log.map((l) => l.summary)).toEqual([
      'moved Event 12 to 10:05',
      'placed Spencer on the Boys trailer, Level 5, left',
    ]);
  });

  it('enforces unique indexes', async () => {
    const store = fixtureStore();
    await expect(
      store.create('entry_seats', { entryId: IDS.entry1, seat: '1', athleteId: null }),
    ).rejects.toBeInstanceOf(StoreError);
    await expect(
      store.create('entry_seats', { entryId: IDS.entry1, seat: '3', athleteId: 'athboys00000001' }),
    ).rejects.toMatchObject({ code: 'unique' });
    // Empty athletes are exempt from (entry, athlete).
    await store.create('entry_seats', { entryId: IDS.entry1, seat: '3', athleteId: null });
    await store.create('entry_seats', { entryId: IDS.entry1, seat: '4', athleteId: null });
  });

  it('cascades, unsets, and restricts on delete', async () => {
    const store = fixtureStore();
    await store.delete('entries', IDS.entry1);
    expect(await store.list('entry_seats', { where: { entryId: IDS.entry1 } })).toEqual([]);

    const entry = await store.create('entries', {
      regattaId: IDS.regatta,
      eventId: IDS.event1,
      teamId: IDS.girls,
      label: 'V4+',
      boatClass: '4+',
      status: 'draft',
    });
    await store.delete('events', IDS.event1);
    expect((await store.get('entries', entry.id))!.eventId).toBeNull();

    await expect(store.delete('teams', IDS.boys)).rejects.toMatchObject({ code: 'in_use' });
  });

  it('refuses a stale write when expectedUpdated no longer matches', async () => {
    let t = 0;
    const store = fixtureStore({
      now: () => new Date(Date.UTC(2026, 9, 1, 0, 0, t++)).toISOString(),
    });
    const ev = await store.update('events', IDS.event1, { notes: 'Stamp it' });
    const first = await store.update(
      'events',
      ev.id,
      { name: 'A' },
      { expectedUpdated: ev.updated },
    );
    await expect(
      store.update('events', ev.id, { name: 'B' }, { expectedUpdated: ev.updated }),
    ).rejects.toMatchObject({ code: 'conflict', status: 409 });
    await store.update('events', ev.id, { name: 'C' }, { expectedUpdated: first.updated });
  });
});

describe('MemoryStore batch', () => {
  it('swaps two athletes under the unique (entry, athlete) index', async () => {
    const store = fixtureStore();
    const [a, b] = ['seatentry1s0001', 'seatentry1s0002'];
    await expect(
      store.update('entry_seats', a, { athleteId: 'athmasters00001' }),
    ).rejects.toMatchObject({
      code: 'unique',
    });
    await store.batch([
      batchOp.update('entry_seats', a, { athleteId: null }),
      batchOp.update('entry_seats', b, { athleteId: 'athboys00000001' }),
      batchOp.update('entry_seats', a, { athleteId: 'athmasters00001' }),
    ]);
    expect((await store.get('entry_seats', a))!.athleteId).toBe('athmasters00001');
    expect((await store.get('entry_seats', b))!.athleteId).toBe('athboys00000001');
  });

  it('applies nothing and emits nothing when a step fails', async () => {
    const store = fixtureStore();
    const handler = vi.fn();
    store.subscribe('teams', handler);
    await expect(
      store.batch([
        batchOp.update('teams', IDS.boys, { name: 'Renamed' }),
        batchOp.delete('teams', 'missing00000000'),
      ]),
    ).rejects.toMatchObject({ code: 'not_found' });
    await flush();
    expect((await store.get('teams', IDS.boys))!.name).toBe('Junior boys');
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('MemoryStore subscribe', () => {
  it('emits create, update, and delete events after the write resolves', async () => {
    const store = fixtureStore();
    const events: ChangeEvent<'teams'>[] = [];
    const unsubscribe = store.subscribe('teams', (e) => events.push(e));
    const team = await store.create('teams', {
      name: 'Adaptive',
      shortName: 'Adaptive',
      program: 'other',
      colorKey: 'cyan',
      sortOrder: 9,
      archived: false,
    });
    expect(events).toHaveLength(0);
    await flush();
    await store.update('teams', team.id, { archived: true });
    await store.delete('teams', team.id);
    await flush();
    expect(events.map((e) => [e.action, e.record.id])).toEqual([
      ['create', team.id],
      ['update', team.id],
      ['delete', team.id],
    ]);
    unsubscribe();
    await store.create('teams', { ...team, id: undefined });
    await flush();
    expect(events).toHaveLength(3);
  });

  it('emits activity_log creates alongside logged changes', async () => {
    const store = fixtureStore();
    const handler = vi.fn();
    store.subscribe('activity_log', handler);
    await store.update('entries', IDS.entry1, { status: 'confirmed' });
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]![0].record.summary).toBe('marked entry Boys V4+ confirmed');
  });
});

describe('MemoryStore auth', () => {
  it('signs in as any seeded user by email, ignoring the password', async () => {
    const store = fixtureStore({ signedIn: null });
    const seen: (string | null)[] = [];
    store.auth.onChange((u) => seen.push(u?.id ?? null));
    expect(store.auth.user).toBeNull();
    const user = await store.auth.signInWithPassword('ADMIN@srt.local', 'anything');
    expect(user.role).toBe('admin');
    expect(store.auth.user).toBe(store.auth.user); // stable between reads
    await expect(store.auth.signInWithPassword('nobody@srt.local', '')).rejects.toMatchObject({
      code: 'auth',
    });
    await expect(store.auth.signInWithGoogle()).rejects.toBeInstanceOf(StoreError);
    store.auth.signOut();
    expect(seen).toEqual([IDS.admin, null]);
  });

  it('reflects updates to the signed-in user record', async () => {
    const store = fixtureStore();
    const before = store.auth.user;
    await store.update('users', IDS.coach, { preferences: { theme: 'dark' } });
    expect(store.auth.user).not.toBe(before);
    expect(store.auth.user!.preferences.theme).toBe('dark');
  });

  it('persists to localStorage and resets to the seed', async () => {
    const { MemoryStore } = await import('./memory-store');
    const { fixtureWorld } = await import('@/test/fixtures');
    const store = new MemoryStore({
      world: fixtureWorld(),
      persistKey: 'srt-test',
      reseed: fixtureWorld,
      userId: IDS.coach,
    });
    await store.update('teams', IDS.boys, { name: 'Renamed' });
    store.flush();
    expect(localStorage.getItem('srt-test')).toContain('Renamed');
    await store.resetDemo();
    expect((await store.get('teams', IDS.boys))!.name).toBe('Junior boys');
    expect(localStorage.getItem('srt-test')).not.toContain('Renamed');
  });
});
