// Share links and the load checklist through a link (PLAN.md §2, §4.8, §8.2; Phase 3), against a
// real PocketBase. The response shapes checked here are the contract for the web share page and
// the phone checklist (backend/README.md "Share links").

import { stableId, type PublishedSnapshot } from '@regatta-ops/domain';
import type PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMAILS, IDS, PASSWORD, testWorld } from './fixtures';
import {
  HAS_BINARY,
  call,
  client,
  seed,
  signIn,
  startTestServer,
  statusOf,
  type TestServer,
} from './helpers';

const id = (key: string) => stableId(`share-test:${key}`);

const X = {
  rtGirls: id('rt:girls'),
  girlsEntry: id('entry:girls'),
  lunch: id('event:lunch'),
  girlsMeeting: id('event:girls-meeting'),
  otherRegatta: id('regatta:other'),
  coxBoxes: id('item:cox-boxes'),
  slings: id('item:slings'),
  foreignItem: id('item:foreign'),
};

interface ShareSeat {
  seat: string;
  athleteId: string | null;
  athleteName: string;
}
interface ShareEntry {
  entryId: string;
  label: string;
  boatClass: string;
  eventId: string | null;
  shellName: string;
  seats: ShareSeat[];
}
interface ShareTeam {
  id: string;
  name: string;
  published: boolean;
  publishedAt: string | null;
  entries: ShareEntry[];
}
interface ShareEvent {
  id: string;
  kind: 'race' | 'logistics';
  name: string;
  scheduledAt: string | null;
  teamIds: string[];
}
interface ShareLoadItem {
  id: string;
  kind: string;
  label: string;
  quantity: number;
  loaded: boolean;
  loadedAt: string | null;
  loadedBy: string | null;
  returned: boolean;
  returnedAt: string | null;
  returnedBy: string | null;
}
interface SharePayload {
  generatedAt: string;
  clubName: string;
  link: { scope: 'team' | 'regatta'; teamId: string | null; canCheckLoad: boolean };
  regatta: { id: string; name: string; startDate: string; timezone: string };
  teams: ShareTeam[];
  schedule: ShareEvent[];
  loadItems?: ShareLoadItem[];
}

describe.skipIf(!HAS_BINARY)('share links', () => {
  let server: TestServer;
  let admin: PocketBase;
  let coach: PocketBase;
  let viewer: PocketBase;
  let teamLink: { id: string; token: string };
  let wideLink: { id: string; token: string };

  const share = (token: string) => call(server.url, `/api/regatta-ops/share/${token}`);
  const tick = (token: string, itemId: string, body: unknown) =>
    call(server.url, `/api/regatta-ops/share/${token}/load-items/${itemId}`, {
      method: 'POST',
      body,
    });

  beforeAll(async () => {
    server = await startTestServer();
    const { world, accounts } = testWorld();
    await seed(server, world, accounts);
    admin = await signIn(server.url, EMAILS.admin, PASSWORD);
    coach = await signIn(server.url, EMAILS.coach, PASSWORD);
    viewer = await signIn(server.url, EMAILS.viewer, PASSWORD);

    // Private data that must never reach a share link.
    await server.admin.collection('athletes').update(IDS.athletes[0]!, { notes: 'Private note' });
    await server.admin.collection('regattas').update(IDS.regatta, { notes: 'Regatta notes' });
    await server.admin.collection('entries').update(IDS.entry, { notes: 'Entry notes' });

    // Boys published; the snapshot carries an extra field that the projection must drop.
    const snapshot: PublishedSnapshot = {
      publishedAt: '2026-05-10T18:00:00.000Z',
      publishedBy: IDS.coach,
      entries: [
        {
          entryId: IDS.entry,
          label: 'V4+',
          boatClass: '4+',
          status: 'planned',
          eventId: IDS.eventFour,
          eventName: "Men's Junior 4+",
          eventNumber: '14',
          day: '2026-05-16',
          scheduledAt: '2026-05-16T16:40:00.000Z',
          stage: 'final',
          shellId: IDS.shellFour,
          shellName: 'Spencer',
          oarSetId: IDS.oars,
          oarSetName: '24-C',
          hotSeatPlan: 'Meet at dock B',
          seats: [{ seat: '1', athleteId: IDS.athletes[0]!, athleteName: 'Rowan Test' }],
        },
      ],
    };
    const leaky = {
      ...snapshot,
      entries: [{ ...snapshot.entries[0], notes: 'Snapshot secret', coachEmail: EMAILS.coach }],
    };
    await server.admin.collection('regatta_teams').update(stableId('test:rt:boys'), {
      published_at: snapshot.publishedAt,
      published_snapshot: leaky,
    });

    // Girls participate but never published; their live draft must stay private.
    await server.admin
      .collection('regatta_teams')
      .create({ id: X.rtGirls, regatta: IDS.regatta, team: IDS.girls });
    await server.admin.collection('entries').create({
      id: X.girlsEntry,
      regatta: IDS.regatta,
      event: IDS.eventFour,
      team: IDS.girls,
      label: 'Girls draft crew',
      boat_class: '4+',
      status: 'draft',
    });

    // Logistics: one for everyone, one for the girls only.
    await server.admin.collection('events').create({
      id: X.lunch,
      regatta: IDS.regatta,
      kind: 'logistics',
      name: 'Lunch',
      day: '2026-05-16',
      scheduled_at: '2026-05-16T19:00:00.000Z',
      notes: 'Logistics notes',
    });
    await server.admin.collection('events').create({
      id: X.girlsMeeting,
      regatta: IDS.regatta,
      kind: 'logistics',
      name: 'Girls cox meeting',
      day: '2026-05-16',
      scheduled_at: '2026-05-16T15:00:00.000Z',
      team_filter: [IDS.girls],
    });

    // Load items: two here, one on another regatta.
    await server.admin.collection('regattas').create({
      id: X.otherRegatta,
      name: 'Other regatta',
      start_date: '2026-06-01',
      end_date: '2026-06-01',
      timezone: 'America/Los_Angeles',
      format: 'sprint',
      status: 'planning',
    });
    await server.admin.collection('load_items').create({
      id: X.coxBoxes,
      regatta: IDS.regatta,
      load_plan: IDS.plan,
      kind: 'gear',
      label: 'Cox boxes',
      quantity: 4,
      container: 'Boys trailer bed',
      notes: 'Item notes',
    });
    await server.admin.collection('load_items').create({
      id: X.slings,
      regatta: IDS.regatta,
      kind: 'gear',
      label: 'Slings',
      quantity: 6,
      container: 'Truck 1 bed',
    });
    await server.admin.collection('load_items').create({
      id: X.foreignItem,
      regatta: X.otherRegatta,
      kind: 'gear',
      label: 'Launch',
      quantity: 1,
    });
  });

  afterAll(async () => {
    await server?.stop();
  });

  describe('records', () => {
    it('a coach creates a team link; the server makes the token and records the author', async () => {
      const created = await coach.collection('share_links').create({
        regatta: IDS.regatta,
        team: IDS.boys,
        can_check_load: false,
        token: 'chosen-by-the-client-0000',
        revoked_at: '2026-01-01T00:00:00.000Z',
        created_by: IDS.admin,
      });
      expect(created.token).toMatch(/^[A-Za-z0-9]{40}$/);
      expect(created.created_by).toBe(IDS.coach);
      expect(created.revoked_at).toBe('');
      teamLink = { id: created.id, token: created.token as string };

      const log = await server.admin
        .collection('activity_log')
        .getFirstListItem(`target_id = "${created.id}"`);
      expect(log.summary).toBe('created a share link for Junior boys');
      expect(log.team).toBe(IDS.boys);
      // Activity is readable by every signed-in user; the token is not.
      expect(JSON.stringify(log.diff)).not.toContain(created.token);
    });

    it('an admin creates a regatta-wide link that can check off the load list', async () => {
      const created = await admin
        .collection('share_links')
        .create({ regatta: IDS.regatta, can_check_load: true });
      expect(created.token).not.toBe(teamLink.token);
      wideLink = { id: created.id, token: created.token as string };
    });

    it('coaches list links; viewers cannot see or create them', async () => {
      expect((await coach.collection('share_links').getFullList()).length).toBe(2);
      expect((await viewer.collection('share_links').getFullList()).length).toBe(0);
      const create = viewer.collection('share_links').create({ regatta: IDS.regatta });
      expect(await statusOf(create)).toBe(400);
      expect((await client(server.url).collection('share_links').getFullList()).length).toBe(0);
    });

    it('token, regatta, and team never change on update', async () => {
      const updated = await coach.collection('share_links').update(teamLink.id, {
        token: 'x'.repeat(40),
        team: IDS.girls,
        regatta: X.otherRegatta,
      });
      expect(updated.token).toBe(teamLink.token);
      expect(updated.team).toBe(IDS.boys);
      expect(updated.regatta).toBe(IDS.regatta);
    });
  });

  describe('public read', () => {
    it('a team link shows that team’s published lineups, the schedule, and nothing private', async () => {
      const res = await share(teamLink.token);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      const body = res.body as SharePayload;
      expect(body.link).toEqual({ scope: 'team', teamId: IDS.boys, canCheckLoad: false });
      expect(body.regatta).toMatchObject({
        id: IDS.regatta,
        name: 'Test regatta',
        venue: 'Lake Sammamish',
        city: 'Redmond, WA',
        startDate: '2026-05-16',
        endDate: '2026-05-17',
        timezone: 'America/Los_Angeles',
      });
      expect(body.teams.map((t) => t.id)).toEqual([IDS.boys]);
      const [boys] = body.teams;
      expect(boys!.published).toBe(true);
      expect(boys!.publishedAt).toBe('2026-05-10T18:00:00.000Z');
      expect(boys!.entries).toEqual([
        {
          entryId: IDS.entry,
          label: 'V4+',
          boatClass: '4+',
          status: 'planned',
          eventId: IDS.eventFour,
          eventName: "Men's Junior 4+",
          eventNumber: '14',
          day: '2026-05-16',
          scheduledAt: '2026-05-16T16:40:00.000Z',
          stage: 'final',
          shellId: IDS.shellFour,
          shellName: 'Spencer',
          oarSetId: IDS.oars,
          oarSetName: '24-C',
          hotSeatPlan: 'Meet at dock B',
          seats: [{ seat: '1', athleteId: IDS.athletes[0], athleteName: 'Rowan Test' }],
        },
      ]);
      // Races plus the logistics for everyone; the girls-only meeting is left out.
      expect(body.schedule.map((ev) => ev.name)).toEqual([
        "Men's Junior 4+",
        "Men's Junior 4x",
        'Lunch',
      ]);
      expect(body.schedule[0]).toEqual({
        id: IDS.eventFour,
        kind: 'race',
        eventNumber: '14',
        name: "Men's Junior 4+",
        boatClass: '4+',
        category: '',
        day: '2026-05-16',
        scheduledAt: '2026-05-16T16:40:00.000Z',
        stage: 'final',
        progressionGroup: '',
        teamIds: [],
      });
      expect('loadItems' in body).toBe(false);

      const raw = JSON.stringify(body);
      for (const secret of [
        '@regatta-ops.test',
        'Private note',
        'Regatta notes',
        'Entry notes',
        'Snapshot secret',
        'Logistics notes',
        'Girls draft crew',
        'Emery Sample',
      ]) {
        expect(raw, secret).not.toContain(secret);
      }
    });

    it('a regatta-wide link shows every participating team and the load list', async () => {
      const res = await share(wideLink.token);
      expect(res.status).toBe(200);
      const body = res.body as SharePayload;
      expect(body.link).toEqual({ scope: 'regatta', teamId: null, canCheckLoad: true });
      expect(body.teams.map((t) => [t.id, t.published, t.entries.length])).toEqual([
        [IDS.boys, true, 1],
        [IDS.girls, false, 0],
      ]);
      expect(body.schedule.map((ev) => ev.name)).toEqual([
        'Girls cox meeting',
        "Men's Junior 4+",
        "Men's Junior 4x",
        'Lunch',
      ]);
      expect(body.schedule[0]!.teamIds).toEqual([IDS.girls]);
      expect(body.loadItems).toEqual([
        {
          id: X.coxBoxes,
          kind: 'gear',
          label: 'Cox boxes',
          quantity: 4,
          container: 'Boys trailer bed',
          trailerName: 'Boys trailer',
          loaded: false,
          loadedAt: null,
          loadedBy: null,
          returned: false,
          returnedAt: null,
          returnedBy: null,
        },
        expect.objectContaining({ id: X.slings, label: 'Slings', trailerName: null }),
      ]);
      const raw = JSON.stringify(body);
      expect(raw).not.toContain('Girls draft crew');
      expect(raw).not.toContain('Item notes');
      expect(raw).not.toContain('Launch');
    });

    it('unknown and malformed tokens are 404', async () => {
      expect((await share('A'.repeat(40))).status).toBe(404);
      expect((await share('short')).status).toBe(404);
      expect((await share('has%20space-and-more-chars')).status).toBe(404);
    });
  });

  describe('load checklist through a link', () => {
    it('ticks an item as loaded with the typed name and logs it', async () => {
      const res = await tick(wideLink.token, X.coxBoxes, { loaded: true, by: '  Sam  ' });
      expect(res.status).toBe(200);
      const { item } = res.body as { item: ShareLoadItem };
      expect(item).toMatchObject({ id: X.coxBoxes, loaded: true, loadedBy: 'Sam' });
      expect(item.loadedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const stored = await server.admin.collection('load_items').getOne(X.coxBoxes);
      expect(stored.loaded_at).not.toBe('');
      expect(stored.loaded_by).toBe('');
      expect(stored.loaded_by_name).toBe('Sam');

      const log = await server.admin
        .collection('activity_log')
        .getFirstListItem(`target_id = "${X.coxBoxes}"`, { sort: '-created,-id' });
      expect(log.summary).toBe('checked off Cox boxes as loaded (via share link, Sam)');
      expect(log.actor).toBe('');
      expect(log.regatta).toBe(IDS.regatta);

      // Ticking again keeps the first time and name.
      const again = await tick(wideLink.token, X.coxBoxes, { loaded: true, by: 'Alex' });
      expect((again.body as { item: ShareLoadItem }).item).toMatchObject({
        loadedAt: item.loadedAt,
        loadedBy: 'Sam',
      });
      const logs = await server.admin
        .collection('activity_log')
        .getFullList({ filter: `target_id = "${X.coxBoxes}"` });
      expect(logs.length).toBe(1);
    });

    it('unticks, and ticks returned without a name', async () => {
      const cleared = await tick(wideLink.token, X.coxBoxes, { loaded: false });
      expect((cleared.body as { item: ShareLoadItem }).item).toMatchObject({
        loaded: false,
        loadedAt: null,
        loadedBy: null,
      });
      expect((await server.admin.collection('load_items').getOne(X.coxBoxes)).loaded_by_name).toBe(
        '',
      );
      const returned = await tick(wideLink.token, X.slings, { returned: true });
      expect((returned.body as { item: ShareLoadItem }).item).toMatchObject({
        returned: true,
        returnedBy: null,
      });
      const log = await server.admin
        .collection('activity_log')
        .getFirstListItem(`target_id = "${X.slings}"`, { sort: '-created,-id' });
      expect(log.summary).toBe('checked off Slings as returned (via share link)');
    });

    it('shows the new state on the next read', async () => {
      const body = (await share(wideLink.token)).body as SharePayload;
      const slings = body.loadItems!.find((i) => i.id === X.slings);
      expect(slings).toMatchObject({ returned: true, loaded: false });
    });

    it('a coach ticking in the app replaces the typed name with their account', async () => {
      await tick(wideLink.token, X.slings, { loaded: true, by: 'Sam' });
      const updated = await coach
        .collection('load_items')
        .update(X.slings, { loaded_at: '2026-05-15T20:00:00.000Z' });
      expect(updated.loaded_by).toBe(IDS.coach);
      expect(updated.loaded_by_name).toBe('');
      const body = (await share(wideLink.token)).body as SharePayload;
      expect(body.loadItems!.find((i) => i.id === X.slings)?.loadedBy).toBe('Cam Coach');
    });

    it('refuses links without check permission, other regattas’ items, and bad bodies', async () => {
      expect((await tick(teamLink.token, X.coxBoxes, { loaded: true })).status).toBe(403);
      expect((await tick(wideLink.token, X.foreignItem, { loaded: true })).status).toBe(404);
      expect((await tick(wideLink.token, 'nosuchitem0000a', { loaded: true })).status).toBe(404);
      expect((await tick(wideLink.token, X.coxBoxes, {})).status).toBe(400);
      expect((await tick(wideLink.token, X.coxBoxes, { loaded: 'yes' })).status).toBe(400);
      const huge = await tick(wideLink.token, X.coxBoxes, { loaded: true, by: 'x'.repeat(5000) });
      expect(huge.status).toBe(413);
      const foreign = await server.admin.collection('load_items').getOne(X.foreignItem);
      expect(foreign.loaded_at).toBe('');
    });
  });

  describe('revoking', () => {
    it('a revoked link is 404 for reads and check-offs, and stays revoked', async () => {
      const revoked = await coach
        .collection('share_links')
        .update(wideLink.id, { revoked_at: '2000-01-01T00:00:00.000Z' });
      // The server stamps its own time.
      expect(revoked.revoked_at.startsWith('2000')).toBe(false);
      expect((await share(wideLink.token)).status).toBe(404);
      expect((await tick(wideLink.token, X.coxBoxes, { loaded: true })).status).toBe(404);
      expect(
        await statusOf(coach.collection('share_links').update(wideLink.id, { revoked_at: '' })),
      ).toBe(400);
      const log = await server.admin
        .collection('activity_log')
        .getFirstListItem(`target_id = "${wideLink.id}"`, { sort: '-created,-id' });
      expect(log.summary).toBe('revoked a share link for the whole regatta');
      // The team link still works.
      expect((await share(teamLink.token)).status).toBe(200);
    });

    it('only admins delete links', async () => {
      expect(await statusOf(coach.collection('share_links').delete(teamLink.id))).toBe(404);
      await admin.collection('share_links').delete(wideLink.id);
      expect((await share(wideLink.token)).status).toBe(404);
    });
  });

  describe('rate limiting', () => {
    it('throttles repeated unknown tokens from one address', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 40; i++) statuses.push((await share('B'.repeat(40))).status);
      expect(statuses).toContain(429);
      expect(statuses.filter((s) => s === 404).length).toBeLessThanOrEqual(30);
    });
  });
});
