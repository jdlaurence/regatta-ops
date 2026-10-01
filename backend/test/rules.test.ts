// API rules and hooks against a real PocketBase (PLAN.md §8.2, §8.3, §13 integration).

import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMAILS, IDS, PASSWORD, testWorld } from './fixtures';
import {
  HAS_BINARY,
  client,
  seed,
  signIn,
  startTestServer,
  statusOf,
  type TestServer,
} from './helpers';

const DOMAIN = 'regatta-ops.test';

describe.skipIf(!HAS_BINARY)('PocketBase rules and hooks', () => {
  let server: TestServer;
  let admin: PocketBase;
  let coach: PocketBase;
  let coach2: PocketBase;
  let viewer: PocketBase;
  let anon: PocketBase;

  beforeAll(async () => {
    server = await startTestServer({ REGATTA_OPS_ALLOWED_DOMAIN: DOMAIN });
    const { world, accounts } = testWorld();
    await seed(server, world, accounts);
    admin = await signIn(server.url, EMAILS.admin, PASSWORD);
    coach = await signIn(server.url, EMAILS.coach, PASSWORD);
    coach2 = await signIn(server.url, EMAILS.coach2, PASSWORD);
    viewer = await signIn(server.url, EMAILS.viewer, PASSWORD);
    anon = client(server.url);
  });

  afterAll(async () => {
    await server?.stop();
  });

  async function latestActivity(targetId: string) {
    const page = await server.admin
      .collection('activity_log')
      .getList(1, 1, { filter: `target_id = "${targetId}"`, sort: '-created,-id' });
    return page.items[0];
  }

  describe('reads', () => {
    it('an unauthenticated request lists nothing', async () => {
      for (const name of ['entries', 'teams', 'athletes', 'users', 'shells', 'activity_log']) {
        const list = await anon.collection(name).getList(1, 50);
        expect(list.totalItems, name).toBe(0);
      }
      expect(await statusOf(anon.collection('entries').getOne(IDS.entry))).toBe(404);
    });

    it('any signed-in user reads everything except share links', async () => {
      expect((await viewer.collection('entries').getList(1, 50)).totalItems).toBe(1);
      expect((await viewer.collection('users').getList(1, 50)).totalItems).toBe(5);
      // Coaches and admins list share links (share.test.ts); viewers never see them.
      expect((await viewer.collection('share_links').getList(1, 50)).totalItems).toBe(0);
    });

    it('other users’ emails stay hidden, except from admins', async () => {
      const other = await coach.collection('users').getOne(IDS.viewer);
      expect(other.email ?? '').toBe('');
      expect(other.role).toBe('viewer');
      expect((await coach.collection('users').getOne(IDS.coach)).email).toBe(EMAILS.coach);
      expect((await admin.collection('users').getOne(IDS.viewer)).email).toBe(EMAILS.viewer);
    });
  });

  describe('batch writes', () => {
    it('swaps two athletes between seats in one transaction, logging each change', async () => {
      const [a, b] = [IDS.athletes[0]!, IDS.athletes[1]!];
      const seat2 = await coach
        .collection('entry_seats')
        .create({ entry: IDS.entry, seat: '2', athlete: b });
      // Seat 1 holds a, seat 2 holds b. The (entry, athlete) unique index means the swap needs
      // an intermediate clear; the batch makes it atomic.
      const batch = coach.createBatch();
      batch.collection('entry_seats').update(seat2.id, { athlete: '' });
      batch.collection('entry_seats').update(IDS.seat1, { athlete: b });
      batch.collection('entry_seats').update(seat2.id, { athlete: a });
      await batch.send();
      expect((await coach.collection('entry_seats').getOne(IDS.seat1)).athlete).toBe(b);
      expect((await coach.collection('entry_seats').getOne(seat2.id)).athlete).toBe(a);
      // Writes in one batch can share a millisecond, so compare as a set.
      const logs = await server.admin
        .collection('activity_log')
        .getFullList({ filter: `target_id = "${seat2.id}" && action = "update"` });
      expect(logs.map((l) => l.summary).sort()).toEqual([
        'cleared seat 2 of Boys V4+ (was Emery Sample)',
        'set seat 2 of Boys V4+ to Rowan Test',
      ]);
      await coach.collection('entry_seats').delete(seat2.id);
      await coach.collection('entry_seats').update(IDS.seat1, { athlete: a });
    });

    it('rolls the whole batch back when one write is refused', async () => {
      const batch = viewer.createBatch();
      batch
        .collection('comments')
        .create({ target_type: 'entry', target_id: IDS.entry, body: 'x' });
      batch.collection('entries').update(IDS.entry, { label: 'Hijacked' });
      expect(await statusOf(batch.send())).toBe(400);
      const comments = await admin.collection('comments').getList(1, 1, { filter: 'body = "x"' });
      expect(comments.totalItems).toBe(0);
    });
  });

  describe('writes by role', () => {
    it('a coach can create and update entries', async () => {
      const created = await coach.collection('entries').create({
        regatta: IDS.regatta,
        event: IDS.eventFour,
        team: IDS.boys,
        label: '2V4+',
        boat_class: '4+',
        status: 'draft',
        created_by: IDS.admin,
      });
      expect(created.created_by).toBe(IDS.coach);
      expect(created.updated_by).toBe(IDS.coach);
      const updated = await coach.collection('entries').update(created.id, { status: 'planned' });
      expect(updated.status).toBe('planned');
      expect((await latestActivity(created.id))?.summary).toBe('marked entry Boys 2V4+ planned');
    });

    it('a viewer cannot create, update, or delete entries', async () => {
      const create = viewer.collection('entries').create({
        regatta: IDS.regatta,
        team: IDS.boys,
        label: 'Nope',
        boat_class: '4+',
        status: 'draft',
      });
      expect(await statusOf(create)).toBeGreaterThanOrEqual(400);
      expect(await statusOf(viewer.collection('entries').update(IDS.entry, { label: 'X' }))).toBe(
        404,
      );
      expect(await statusOf(viewer.collection('entries').delete(IDS.entry))).toBe(404);
      const entry = await admin.collection('entries').getOne(IDS.entry);
      expect(entry.label).toBe('V4+');
    });

    it('a coach cannot edit teams or trailers; an admin can', async () => {
      expect(await statusOf(coach.collection('teams').update(IDS.boys, { name: 'X' }))).toBe(404);
      expect(await statusOf(coach.collection('trailers').update(IDS.trailer, { name: 'X' }))).toBe(
        404,
      );
      const create = coach.collection('teams').create({
        name: 'New team',
        program: 'other',
        color_key: 'slate',
      });
      expect(await statusOf(create)).toBe(400);
      expect(
        (await admin.collection('teams').update(IDS.girls, { short_name: 'JG' })).short_name,
      ).toBe('JG');
      expect((await admin.collection('teams').getOne(IDS.boys)).name).toBe('Junior boys');
    });

    it('a coach can edit the fleet and rosters', async () => {
      const shell = await coach.collection('shells').update(IDS.shellQuad, { location: 'Bay 3' });
      expect(shell.location).toBe('Bay 3');
      const athlete = await coach
        .collection('athletes')
        .update(IDS.athletes[1]!, { notes: 'Lefty' });
      expect(athlete.notes).toBe('Lefty');
    });

    it('only hooks write the activity log', async () => {
      const create = admin.collection('activity_log').create({
        action: 'create',
        target_type: 'entries',
        target_id: IDS.entry,
        summary: 'forged',
      });
      expect(await statusOf(create)).toBe(403);
    });

    it('club settings hold one record, written by admins', async () => {
      const [settings] = await viewer.collection('club_settings').getFullList();
      expect(settings?.weight_unit).toBe('lb');
      expect(
        await statusOf(
          coach.collection('club_settings').update(settings!.id, { weight_unit: 'kg' }),
        ),
      ).toBe(404);
      const second = admin.collection('club_settings').create({
        club_name: 'Another club',
        timezone: 'UTC',
        weight_unit: 'kg',
      });
      expect(await statusOf(second)).toBe(400);
    });

    it('viewers can comment, and the author is always the signed-in user', async () => {
      const comment = await viewer.collection('comments').create({
        target_type: 'entry',
        target_id: IDS.entry,
        body: 'Who is stroking?',
        author: IDS.admin,
      });
      expect(comment.author).toBe(IDS.viewer);
      expect(await statusOf(coach.collection('comments').update(comment.id, { body: 'x' }))).toBe(
        404,
      );
    });
  });

  describe('users and roles', () => {
    it('a user cannot change their own role, email, or verified flag', async () => {
      // The update rule rejects these before any hook runs; PocketBase answers 404 for a failed
      // update rule. (auth.pb.js repeats the role check with a 403 as a second line.)
      expect(await statusOf(coach.collection('users').update(IDS.coach, { role: 'admin' }))).toBe(
        404,
      );
      expect(await statusOf(viewer.collection('users').update(IDS.viewer, { role: 'coach' }))).toBe(
        404,
      );
      expect(
        await statusOf(
          coach.collection('users').update(IDS.coach, { email: 'x@regatta-ops.test' }),
        ),
      ).toBe(404);
      expect(await statusOf(coach.collection('users').update(IDS.coach, { verified: false }))).toBe(
        404,
      );
      const me = await server.admin.collection('users').getOne(IDS.coach);
      expect(me.role).toBe('coach');
      expect(me.email).toBe(EMAILS.coach);
      // Sending the unchanged role back (a full-record save) is fine.
      expect((await coach.collection('users').update(IDS.coach, { role: 'coach' })).role).toBe(
        'coach',
      );
    });

    it('a user can edit their own name and preferences but not someone else', async () => {
      const me = await coach.collection('users').update(IDS.coach, {
        name: 'Cam C.',
        preferences: { theme: 'dark' },
        default_team: IDS.boys,
      });
      expect(me.name).toBe('Cam C.');
      expect(me.preferences).toEqual({ theme: 'dark' });
      expect(await statusOf(coach.collection('users').update(IDS.viewer, { name: 'X' }))).toBe(404);
    });

    it('an admin can change roles', async () => {
      const promoted = await admin.collection('users').update(IDS.coach2, { role: 'admin' });
      expect(promoted.role).toBe('admin');
      await admin.collection('users').update(IDS.coach2, { role: 'coach' });
    });

    it('a non-admin cannot create accounts', async () => {
      const create = coach.collection('users').create({
        email: 'friend@regatta-ops.test',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        role: 'coach',
      });
      expect(await statusOf(create)).toBe(400);
    });

    it('new accounts default to coach', async () => {
      const user = await admin.collection('users').create({
        email: 'fresh@regatta-ops.test',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
        name: 'Fresh Face',
      });
      expect(user.role).toBe('coach');
    });
  });

  describe('sign-in domain allowlist', () => {
    it('rejects a password sign-in from outside the domain', async () => {
      const pb = client(server.url);
      expect(
        await statusOf(pb.collection('users').authWithPassword(EMAILS.outsider, PASSWORD)),
      ).toBe(403);
      expect(pb.authStore.isValid).toBe(false);
    });

    it('rejects creating an account outside the domain', async () => {
      const create = admin.collection('users').create({
        email: 'friend@gmail.test',
        password: PASSWORD,
        passwordConfirm: PASSWORD,
      });
      expect(await statusOf(create)).toBe(403);
    });

    describe('Google OAuth2 (provider endpoints faked locally)', () => {
      let google: http.Server;
      let googleUrl: string;
      const profiles: Record<string, { email: string; name: string }> = {
        inside: { email: 'newcoach@regatta-ops.test', name: 'New Coach' },
        outside: { email: 'stranger@elsewhere.test', name: 'Stranger' },
      };

      beforeAll(async () => {
        google = http.createServer((req, res) => {
          const send = (status: number, body: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
          };
          if (req.method === 'POST' && req.url?.startsWith('/token')) {
            let raw = '';
            req.on('data', (c: Buffer) => (raw += c.toString()));
            req.on('end', () => {
              const code = new URLSearchParams(raw).get('code') ?? '';
              send(200, { access_token: `tok-${code}`, token_type: 'Bearer', expires_in: 3600 });
            });
            return;
          }
          if (req.url?.startsWith('/userinfo')) {
            const code = (req.headers.authorization ?? '').replace('Bearer tok-', '');
            const profile = profiles[code];
            if (!profile) return send(401, { error: 'invalid_token' });
            return send(200, { sub: `google-${code}`, email_verified: true, ...profile });
          }
          send(404, {});
        });
        await new Promise<void>((resolve) => google.listen(0, '127.0.0.1', resolve));
        googleUrl = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;
        await server.admin.collections.update('users', {
          oauth2: {
            enabled: true,
            providers: [
              {
                name: 'google',
                clientId: 'test-client',
                clientSecret: 'test-secret',
                authURL: `${googleUrl}/auth`,
                tokenURL: `${googleUrl}/token`,
                userInfoURL: `${googleUrl}/userinfo`,
              },
            ],
          },
        });
      });

      afterAll(async () => {
        await new Promise((resolve) => google?.close(resolve));
      });

      it('rejects a Google account outside the domain and creates nothing', async () => {
        const pb = client(server.url);
        const auth = pb
          .collection('users')
          .authWithOAuth2Code('google', 'outside', 'verifier', 'http://127.0.0.1/redirect');
        expect(await statusOf(auth)).toBe(403);
        const found = await server.admin
          .collection('users')
          .getList(1, 1, { filter: `email = "${profiles.outside!.email}"` });
        expect(found.totalItems).toBe(0);
      });

      it('creates a coach for a Google account inside the domain, ignoring createData', async () => {
        const pb = client(server.url);
        const auth = await pb
          .collection('users')
          .authWithOAuth2Code('google', 'inside', 'verifier', 'http://127.0.0.1/redirect', {
            role: 'admin',
            email: 'boss@regatta-ops.test',
          });
        expect(auth.record.email).toBe(profiles.inside!.email);
        expect(auth.record.role).toBe('coach');
        expect(auth.record.name).toBe('New Coach');
        expect(auth.meta?.isNew).toBe(true);
      });
    });
  });

  describe('entries hook', () => {
    it('keeps boat_class in sync with the event and clears a stale hot seat acknowledgment', async () => {
      const before = await coach.collection('entries').getOne(IDS.entry);
      expect(before.boat_class).toBe('4+');
      expect(before.hot_seat_ack_by).toBe(IDS.coach2);
      const moved = await coach.collection('entries').update(IDS.entry, { event: IDS.eventQuad });
      expect(moved.boat_class).toBe('4x');
      expect(moved.hot_seat_ack_by).toBe('');
      expect(moved.hot_seat_plan).toBe('Meet at dock B');
      expect(moved.updated_by).toBe(IDS.coach);
      const log = await latestActivity(IDS.entry);
      expect(log?.summary).toBe('moved entry Boys V4+ to Event 21');
      expect(log?.actor).toBe(IDS.coach);
      expect(log?.regatta).toBe(IDS.regatta);
      expect(log?.diff).toMatchObject({
        event: { from: IDS.eventFour, to: IDS.eventQuad },
        boat_class: { from: '4+', to: '4x' },
      });
    });

    it('copies the boat class from the event on create', async () => {
      const created = await coach.collection('entries').create({
        regatta: IDS.regatta,
        event: IDS.eventQuad,
        team: IDS.boys,
        label: 'N4x',
        boat_class: '8+',
        status: 'draft',
      });
      expect(created.boat_class).toBe('4x');
    });

    it('keeps an acknowledgment set in the same write as a shell change', async () => {
      const entry = await coach.collection('entries').update(IDS.entry, {
        shell: IDS.shellQuad,
        hot_seat_ack_by: IDS.coach,
        hot_seat_fingerprint: 'new',
      });
      expect(entry.hot_seat_ack_by).toBe(IDS.coach);
      expect((await latestActivity(IDS.entry))?.summary).toBe(
        'set the shell of Boys V4+ to Lundy; acknowledged the hot seat for Boys V4+',
      );
    });

    it('follows the event when the event’s boat class is edited', async () => {
      await coach.collection('events').update(IDS.eventQuad, { boat_class: '4x+' });
      expect((await coach.collection('entries').getOne(IDS.entry)).boat_class).toBe('4x+');
      expect((await latestActivity(IDS.eventQuad))?.summary).toBe(
        'changed the boat class of Event 21 to 4x+',
      );
    });
  });

  describe('activity log', () => {
    it('describes seat changes with names', async () => {
      await coach.collection('entry_seats').update(IDS.seat1, { athlete: IDS.athletes[2] });
      expect((await latestActivity(IDS.seat1))?.summary).toBe(
        'set seat 1 of Boys V4+ to Quinn Example',
      );
      const cox = await coach
        .collection('entry_seats')
        .create({ entry: IDS.entry, seat: 'cox', athlete: IDS.athletes[4] });
      expect((await latestActivity(cox.id))?.summary).toBe(
        'set cox of Boys V4+ to Sky Placeholder',
      );
      await coach.collection('entry_seats').delete(cox.id);
      const deleted = await latestActivity(cox.id);
      expect(deleted?.summary).toBe('removed Sky Placeholder from cox of Boys V4+');
      expect(deleted?.action).toBe('delete');
    });

    it('describes event time moves in the regatta time zone', async () => {
      await coach
        .collection('events')
        .update(IDS.eventFour, { scheduled_at: '2026-05-16T17:05:00.000Z' });
      expect((await latestActivity(IDS.eventFour))?.summary).toBe('moved Event 14 to 10:05');
    });

    it('describes availability, placements, and load items', async () => {
      const a = await coach
        .collection('availability')
        .create({ regatta: IDS.regatta, athlete: IDS.athletes[3], status: 'unavailable' });
      expect(a.updated_by).toBe(IDS.coach);
      expect((await latestActivity(a.id))?.summary).toBe('marked Jules Fixture unavailable');

      await coach.collection('load_placements').update(IDS.placement, { lane: 1 });
      expect((await latestActivity(IDS.placement))?.summary).toBe(
        'moved Spencer to lane 2 of Level 3 right',
      );

      const item = await coach
        .collection('load_items')
        .create({ regatta: IDS.regatta, kind: 'gear', label: 'Cox boxes', quantity: 4 });
      expect((await latestActivity(item.id))?.summary).toBe('added Cox boxes to the load list');
      const loaded = await coach
        .collection('load_items')
        .update(item.id, { loaded_at: '2026-05-15T20:00:00.000Z' });
      expect(loaded.loaded_by).toBe(IDS.coach);
      expect((await latestActivity(item.id))?.summary).toBe('checked off Cox boxes as loaded');
    });

    it('describes regatta and participating-team changes', async () => {
      await coach.collection('regattas').update(IDS.regatta, {
        status: 'final',
        settings: { launchLeadMin: 75 },
      });
      expect((await latestActivity(IDS.regatta))?.summary).toBe(
        'marked the regatta final; changed timing (launch lead default → 75 min)',
      );
      await coach.collection('regattas').update(IDS.regatta, { status: 'planning' });
      const rt = await coach
        .collection('regatta_teams')
        .create({ regatta: IDS.regatta, team: IDS.girls });
      const added = await latestActivity(rt.id);
      expect(added?.summary).toBe('added Junior girls to the regatta');
      expect(added?.regatta).toBe(IDS.regatta);
      await coach.collection('regatta_teams').update(rt.id, {
        published_at: '2026-05-15T20:00:00.000Z',
        published_snapshot: { publishedAt: '2026-05-15T20:00:00.000Z', entries: [] },
      });
      const published = await latestActivity(rt.id);
      // An earlier test renames the girls' short name, so read it back.
      const girls = await coach.collection('teams').getOne(IDS.girls);
      expect(published?.summary).toBe(`published ${girls.short_name} lineups`);
      expect(Object.keys(published?.diff ?? {})).not.toContain('published_snapshot');
      await coach.collection('regatta_teams').delete(rt.id);
      expect((await latestActivity(rt.id))?.summary).toBe('removed Junior girls from the regatta');
    });

    it('describes roster and team changes', async () => {
      await coach.collection('athletes').update(IDS.athletes[1], { status: 'inactive' });
      const marked = await latestActivity(IDS.athletes[1]);
      expect(marked?.summary).toBe('marked Emery Sample inactive');
      expect(marked?.team).toBe(IDS.boys);
      await coach.collection('athletes').update(IDS.athletes[1], { status: 'active' });
      const team = await admin.collection('teams').getOne(IDS.girls);
      await admin.collection('teams').update(IDS.girls, { archived: true });
      expect((await latestActivity(IDS.girls))?.summary).toBe(`archived team ${team.name}`);
      await admin.collection('teams').update(IDS.girls, { archived: false });
    });

    it('skips updates that change nothing', async () => {
      const before = await latestActivity(IDS.shellFour);
      await coach.collection('shells').update(IDS.shellFour, { name: 'Spencer' });
      expect((await latestActivity(IDS.shellFour))?.id).toBe(before?.id);
    });

    it('does not log superuser writes (the seed)', async () => {
      await server.admin.collection('shells').update(IDS.shellFour, { notes: 'Seeded note' });
      const page = await server.admin
        .collection('activity_log')
        .getList(1, 1, { filter: `target_id = "${IDS.shellFour}"` });
      expect(page.totalItems).toBe(0);
    });
  });

  describe('stale writes', () => {
    it('refuses an event update carrying an outdated expected_updated', async () => {
      const current = await coach.collection('events').getOne(IDS.eventFour);
      await coach2.collection('events').update(IDS.eventFour, { notes: 'Bow numbers at 7' });
      const stale = coach
        .collection('events')
        .update(IDS.eventFour, { notes: 'Mine', expected_updated: current.updated });
      expect(await statusOf(stale)).toBe(409);
      const fresh = await coach.collection('events').getOne(IDS.eventFour);
      const ok = await coach
        .collection('events')
        .update(IDS.eventFour, { notes: 'Mine', expected_updated: fresh.updated });
      expect(ok.notes).toBe('Mine');
    });
  });
});
