import { describe, expect, it } from 'vitest';
import { IDS } from '@/test/fixtures';
import { SHARE_IDS, TOKENS, shareStore } from '@/test/share-fixtures';
import { applyTick, memoryShareApi, type ShareLoadItem } from './share';
import { StoreError } from './store';

const NOW = '2026-11-01T16:00:00.000Z';
const api = (store = shareStore({ now: () => NOW })) => ({
  store,
  share: memoryShareApi(store, () => NOW),
});

// The documented JSON (backend/README.md "Share links"): exactly these keys, nothing else.
const VIEW_KEYS = ['clubName', 'generatedAt', 'link', 'regatta', 'schedule', 'teams'];
const REGATTA_KEYS = [
  'city',
  'endDate',
  'format',
  'id',
  'name',
  'startDate',
  'status',
  'timezone',
  'venue',
];
const TEAM_KEYS = ['colorKey', 'entries', 'id', 'name', 'published', 'publishedAt', 'shortName'];
const ENTRY_KEYS = [
  'boatClass',
  'day',
  'entryId',
  'eventId',
  'eventName',
  'eventNumber',
  'hotSeatPlan',
  'label',
  'oarSetId',
  'oarSetName',
  'scheduledAt',
  'seats',
  'shellId',
  'shellName',
  'stage',
  'status',
];
const EVENT_KEYS = [
  'boatClass',
  'category',
  'day',
  'eventNumber',
  'id',
  'kind',
  'name',
  'progressionGroup',
  'scheduledAt',
  'stage',
  'teamIds',
];
const ITEM_KEYS = [
  'container',
  'id',
  'kind',
  'label',
  'loaded',
  'loadedAt',
  'loadedBy',
  'quantity',
  'returned',
  'returnedAt',
  'returnedBy',
  'trailerName',
];

const keys = (o: object) => Object.keys(o).sort();

describe('the share projection in demo mode', () => {
  it('matches the documented JSON shape field for field', async () => {
    const { share } = api();
    const view = await share.getShare(TOKENS.wide);
    expect(keys(view)).toEqual(VIEW_KEYS);
    expect(view.generatedAt).toBe(NOW);
    expect(view.clubName).toBe('Sammamish Rowing Association');
    expect(view.link).toEqual({ scope: 'regatta', teamId: null, canCheckLoad: false });
    expect(keys(view.regatta)).toEqual(REGATTA_KEYS);
    expect(view.regatta).toMatchObject({
      id: IDS.regatta,
      name: 'Head of the Lake',
      startDate: '2026-11-01',
      endDate: '2026-11-02',
      timezone: 'America/Los_Angeles',
    });
    // Every participating team, by sort order; the girls never published.
    expect(view.teams.map((t) => [t.shortName, t.published, t.publishedAt])).toEqual([
      ['Boys', true, '2026-10-30T04:00:00.000Z'],
      ['Girls', false, null],
    ]);
    for (const t of view.teams) expect(keys(t)).toEqual(TEAM_KEYS);
    const [v4, v8] = view.teams[0]!.entries;
    expect(keys(v4!)).toEqual(ENTRY_KEYS);
    expect(v4).toMatchObject({
      label: 'V4+',
      shellName: 'Spencer',
      hotSeatPlan: 'Meet at dock B',
      seats: [
        { seat: '1', athleteId: 'athboys00000001', athleteName: 'Rowan Test' },
        { seat: '2', athleteId: 'athboys00000002', athleteName: 'Emery Sample' },
      ],
    });
    // Unset text is '', unset ids are null.
    expect(v8).toMatchObject({ oarSetId: null, oarSetName: '', hotSeatPlan: '' });
    expect(view.teams[1]!.entries).toEqual([]);
    for (const s of view.schedule) expect(keys(s)).toEqual(EVENT_KEYS);
    expect('loadItems' in view).toBe(false);
  });

  it('never carries emails, notes, rosters, or drafts', async () => {
    const { share } = api();
    for (const token of [TOKENS.wide, TOKENS.load, TOKENS.girls]) {
      const json = JSON.stringify(await share.getShare(token));
      for (const secret of [
        '@regatta-ops.local',
        'Private note',
        'Regatta notes',
        'Entry notes',
        'Snapshot secret',
        'Event notes',
        'Logistics notes',
        'Item notes',
        'Plan notes',
        'Team notes',
        'Girls draft crew',
        'Quinn', // a girls athlete: rosters stay private
        'Jules', // a masters athlete seated in the live boys boat, but not in the snapshot
      ]) {
        expect(json, `${token} leaks ${secret}`).not.toContain(secret);
      }
    }
  });

  it('orders the schedule by day and time, and scopes logistics to the link', async () => {
    const { share } = api();
    const wide = await share.getShare(TOKENS.wide);
    expect(wide.schedule.map((s) => s.name)).toEqual([
      'Girls cox meeting',
      "Men's Junior 4+",
      "Men's Junior 8+",
      'Lunch at the tent',
      "Men's Junior 8+",
    ]);
    const meeting = wide.schedule.find((s) => s.id === SHARE_IDS.girlsMeeting)!;
    expect(meeting.teamIds).toEqual([IDS.girls]);
    expect(wide.schedule.find((s) => s.kind === 'race')!.teamIds).toEqual([]);

    const boys = await share.getShare(TOKENS.boys);
    expect(boys.link).toEqual({ scope: 'team', teamId: IDS.boys, canCheckLoad: false });
    expect(boys.teams.map((t) => t.id)).toEqual([IDS.boys]);
    expect(boys.schedule.map((s) => s.id)).not.toContain(SHARE_IDS.girlsMeeting);

    const girls = await share.getShare(TOKENS.girls);
    expect(girls.schedule.map((s) => s.id)).toContain(SHARE_IDS.girlsMeeting);
  });

  it('adds the load list, by kind then label, only for links that can check it', async () => {
    const { share } = api();
    const view = await share.getShare(TOKENS.load);
    expect(view.link.canCheckLoad).toBe(true);
    expect(view.loadItems!.map((i) => i.label)).toEqual(['Spencer', 'Cox boxes', 'Slings']);
    for (const i of view.loadItems!) expect(keys(i)).toEqual(ITEM_KEYS);
    expect(view.loadItems![0]).toMatchObject({
      kind: 'shell',
      trailerName: 'Boys trailer',
      loaded: true,
      loadedBy: 'Casey Coach',
      returned: false,
      returnedAt: null,
      returnedBy: null,
    });
    expect(view.loadItems![2]).toMatchObject({ container: 'Truck 1 bed', trailerName: null });
  });

  it('refuses revoked, unknown, and malformed tokens', async () => {
    const { share } = api();
    for (const token of [TOKENS.revoked, 'NoSuchTokenAtAll00000000', 'short', '../../etc']) {
      await expect(share.getShare(token)).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});

describe('ticking the load list through a link', () => {
  it('ticks with the typed name, keeps the first tick, and unticks', async () => {
    const { store, share } = api();
    const item = await share.tickLoadItem(TOKENS.load, SHARE_IDS.coxBoxes, {
      loaded: true,
      by: '  Sam \n',
    });
    expect(item).toMatchObject({ loaded: true, loadedAt: NOW, loadedBy: 'Sam' });
    const rec = await store.get('load_items', SHARE_IDS.coxBoxes);
    expect(rec).toMatchObject({ loadedAt: NOW, loadedBy: null, loadedByName: 'Sam' });

    // Replaying the same tick later changes nothing: first time and name stay.
    const again = memoryShareApi(store, () => '2026-11-01T17:00:00.000Z');
    const same = await again.tickLoadItem(TOKENS.load, SHARE_IDS.coxBoxes, {
      loaded: true,
      by: 'Alex',
    });
    expect(same).toMatchObject({ loadedAt: NOW, loadedBy: 'Sam' });

    const off = await share.tickLoadItem(TOKENS.load, SHARE_IDS.coxBoxes, { loaded: false });
    expect(off).toMatchObject({ loaded: false, loadedAt: null, loadedBy: null });
    expect(await store.get('load_items', SHARE_IDS.coxBoxes)).toMatchObject({
      loadedAt: null,
      loadedByName: '',
    });
  });

  it('logs the tick with no actor, as "via share link"', async () => {
    const { store, share } = api(shareStore({ signedIn: IDS.coach, now: () => NOW }));
    await share.tickLoadItem(TOKENS.load, SHARE_IDS.slings, { returned: true, by: 'Sam' });
    const log = await store.list('activity_log', { where: { targetId: SHARE_IDS.slings } });
    expect(log).toHaveLength(1);
    expect(log[0]!.actorId).toBeNull();
    expect(log[0]!.summary).toMatch(/\(via share link, Sam\)$/);
    // The signed-in coach is still signed in afterwards.
    expect(store.auth.user?.id).toBe(IDS.coach);
  });

  it('refuses links without load permission, foreign items, and bad bodies', async () => {
    const { share } = api();
    await expect(
      share.tickLoadItem(TOKENS.wide, SHARE_IDS.coxBoxes, { loaded: true }),
    ).rejects.toMatchObject({ code: 'forbidden', status: 403 });
    await expect(
      share.tickLoadItem(TOKENS.load, SHARE_IDS.otherRegattaItem, { loaded: true }),
    ).rejects.toMatchObject({ code: 'not_found', status: 404 });
    await expect(share.tickLoadItem(TOKENS.load, SHARE_IDS.coxBoxes, {})).rejects.toBeInstanceOf(
      StoreError,
    );
    await expect(
      share.tickLoadItem(TOKENS.revoked, SHARE_IDS.coxBoxes, { loaded: true }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('applies a tick the way the server does', () => {
    const item: ShareLoadItem = {
      id: 'x',
      kind: 'gear',
      label: 'Slings',
      quantity: 6,
      container: '',
      trailerName: null,
      loaded: false,
      loadedAt: null,
      loadedBy: null,
      returned: false,
      returnedAt: null,
      returnedBy: null,
    };
    const on = applyTick(item, { loaded: true, by: 'Sam' }, NOW);
    expect(on).toMatchObject({ loaded: true, loadedAt: NOW, loadedBy: 'Sam' });
    expect(applyTick(on, { loaded: true, by: 'Alex' }, 'later')).toEqual(on);
    expect(applyTick(on, { loaded: false })).toMatchObject({ loaded: false, loadedBy: null });
    expect(applyTick(item, { returned: true }, NOW)).toMatchObject({
      returned: true,
      returnedBy: null,
    });
  });
});

describe('share links and comments in demo mode (server-owned fields)', () => {
  it('makes the token and creator, stamps revocation, and keeps it permanent', async () => {
    const store = shareStore({ signedIn: IDS.coach, now: () => NOW });
    const link = await store.create('share_links', {
      regattaId: IDS.regatta,
      teamId: IDS.girls,
      canCheckLoad: true,
      token: '',
      createdBy: IDS.admin,
    });
    expect(link.token).toMatch(/^[A-Za-z0-9]{40}$/);
    expect(link.createdBy).toBe(IDS.coach);
    expect(link.revokedAt).toBeNull();

    const revoked = await store.update('share_links', link.id, {
      revokedAt: '1999-01-01T00:00:00.000Z',
      token: 'changed',
      teamId: IDS.boys,
    });
    expect(revoked.revokedAt).toBe(NOW);
    expect(revoked.token).toBe(link.token);
    expect(revoked.teamId).toBe(IDS.girls);
    await expect(store.update('share_links', link.id, { revokedAt: null })).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(memoryShareApi(store).getShare(link.token)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('sets a comment author to the signed-in user and resolves its mentions', async () => {
    const store = shareStore({ signedIn: IDS.viewer });
    const c = await store.create('comments', {
      targetType: 'entry',
      targetId: IDS.entry1,
      authorId: IDS.admin,
      body: 'Thanks @casey coach, and @admin: see you at dock B.',
    });
    expect(c.authorId).toBe(IDS.viewer);
    expect(c.mentions).toEqual([IDS.coach, IDS.admin]);
    const edited = await store.update('comments', c.id, { body: 'Never mind.' });
    expect(edited.mentions).toEqual([]);
  });
});
