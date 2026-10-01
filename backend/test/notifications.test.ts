// Comment mentions, change emails, and the daily digest (PLAN.md §4.6, Phase 3), against a real
// PocketBase running with REGATTA_OPS_MAIL_CAPTURE=1, so every email lands in mail_outbox.

import { stableId } from '@regatta-ops/domain';
import type PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMAILS, IDS, PASSWORD, testWorld } from './fixtures';
import {
  HAS_BINARY,
  call,
  outbox,
  seed,
  signIn,
  startTestServer,
  type TestServer,
} from './helpers';

const APP = 'http://app.test';
const MINUTE = 60_000;
const id = (key: string) => stableId(`notify-test:${key}`);

/** Day and hour in Los Angeles at `ms` (Node has Intl; the hooks runtime does not). */
function laParts(ms: number): { day: string; hour: number } {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    format.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 24 * 60 * MINUTE).toISOString().slice(0, 10);
}

// The digest hour is three hours from now in Los Angeles, so "now" is outside it and a `now` a
// few hours ahead is inside it, with today's activity still in the 24-hour window.
const START = Date.now();
const DIGEST_HOUR = (laParts(START).hour + 3) % 24;
let hoursAhead = 1;
while (laParts(START + hoursAhead * 60 * MINUTE).hour !== DIGEST_HOUR) hoursAhead++;

describe.skipIf(!HAS_BINARY)('mentions and notifications', () => {
  let server: TestServer;
  let coach: PocketBase;
  let coach2: PocketBase;
  let viewer: PocketBase;

  const job = (name: 'notify' | 'digest', body: Record<string, unknown> = {}) =>
    call(server.url, `/api/regatta-ops/jobs/${name}`, {
      method: 'POST',
      body,
      token: server.admin.authStore.token,
    });

  beforeAll(async () => {
    server = await startTestServer({
      REGATTA_OPS_MAIL_CAPTURE: '1',
      REGATTA_OPS_APP_URL: `${APP}/`,
      REGATTA_OPS_DIGEST_HOUR: String(DIGEST_HOUR),
    });
    const { world, accounts } = testWorld();
    await seed(server, world, accounts);
    // Cam coaches the boys, Cy the girls. Ada (admin) coaches the girls but wants no digest.
    await server.admin.collection('users').update(IDS.coach, { default_team: IDS.boys });
    await server.admin.collection('users').update(IDS.coach2, { default_team: IDS.girls });
    await server.admin
      .collection('users')
      .update(IDS.admin, { default_team: IDS.girls, preferences: { emailDigest: false } });
    coach = await signIn(server.url, EMAILS.coach, PASSWORD);
    coach2 = await signIn(server.url, EMAILS.coach2, PASSWORD);
    viewer = await signIn(server.url, EMAILS.viewer, PASSWORD);
  });

  afterAll(async () => {
    await server?.stop();
  });

  describe('mentions', () => {
    let commentId: string;

    it('stores the mentioned users and emails each one except the author', async () => {
      const comment = await viewer.collection('comments').create({
        target_type: 'entry',
        target_id: IDS.entry,
        body: '@Cam Coach can you check seat 1? cc @coach2, @val.\nOr write to someone@regatta-ops.test',
        mentions: [IDS.admin],
      });
      commentId = comment.id;
      expect(comment.mentions).toEqual([IDS.coach, IDS.coach2, IDS.viewer]);

      const mails = await outbox(server, 'kind = "mention"');
      expect(mails.map((m) => m.to.join()).sort()).toEqual([EMAILS.coach, EMAILS.coach2].sort());
      const first = mails.find((m) => m.to[0] === EMAILS.coach);
      expect(first!.subject).toBe('Val Viewer mentioned you on Boys V4+');
      expect(first!.text).toContain(
        'Val Viewer mentioned you in a comment on the entry Boys V4+ (Event 14) at Test regatta:',
      );
      expect(first!.text).toContain('> @Cam Coach can you check seat 1? cc @coach2, @val.');
      expect(first!.text).toContain('> Or write to someone@regatta-ops.test');
      expect(first!.text).toContain(
        `Open it in Regatta Ops: ${APP}/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry}`,
      );
    });

    it('editing a comment emails only people mentioned for the first time', async () => {
      const before = (await outbox(server, 'kind = "mention"')).length;
      const updated = await viewer.collection('comments').update(commentId, {
        body: '@Cam Coach can you check seat 1? cc @coach2 and @Ada Admin',
      });
      expect(updated.mentions).toEqual([IDS.coach, IDS.coach2, IDS.admin]);
      const mails = (await outbox(server, 'kind = "mention"')).slice(before);
      expect(mails.map((m) => m.to)).toEqual([[EMAILS.admin]]);
    });

    it('describes events and ignores names that only start the same way', async () => {
      const before = (await outbox(server, 'kind = "mention"')).length;
      const comment = await coach.collection('comments').create({
        target_type: 'event',
        target_id: IDS.eventFour,
        body: 'Is @Camille here? @CY COACH, the start moved.',
      });
      expect(comment.mentions).toEqual([IDS.coach2]);
      const mails = (await outbox(server, 'kind = "mention"')).slice(before);
      expect(mails).toHaveLength(1);
      expect(mails[0]!.subject).toBe('Cam Coach mentioned you on Event 14');
      expect(mails[0]!.text).toContain(
        "mentioned you in a comment on Event 14, Men's Junior 4+ at Test regatta:",
      );
      expect(mails[0]!.text).toContain(
        `${APP}/regattas/${IDS.regatta}/schedule?event=${IDS.eventFour}`,
      );
    });

    it('superuser writes (the seed) store mentions but send nothing', async () => {
      const before = (await outbox(server)).length;
      const comment = await server.admin.collection('comments').create({
        target_type: 'entry',
        target_id: IDS.entry,
        body: '@Cam Coach seeded',
        author: IDS.admin,
      });
      expect(comment.mentions).toEqual([IDS.coach]);
      expect((await outbox(server)).length).toBe(before);
    });
  });

  describe('change emails', () => {
    const changeMails = async () => outbox(server, 'kind = "entry_change"');

    it('emails the team’s coaches when someone from another team changes an entry', async () => {
      await coach2.collection('entry_seats').update(IDS.seat1, { athlete: IDS.athletes[2] });
      await job('notify');
      const mails = await changeMails();
      expect(mails).toHaveLength(1);
      expect(mails[0]!.to).toEqual([EMAILS.coach]);
      expect(mails[0]!.subject).toBe('Cy Coach changed Boys V4+ (Event 14)');
      expect(mails[0]!.text).toContain('Cy Coach changed Boys V4+ (Event 14) at Test regatta:');
      expect(mails[0]!.text).toMatch(/- set seat 1 of Boys V4\+ to Quinn Example \(\d+:\d\d\)/);
      expect(mails[0]!.text).toContain(
        `Open the lineups: ${APP}/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry}`,
      );
    });

    it('sends at most one email per entry per 10 minutes, collecting what changed meanwhile', async () => {
      await coach2.collection('entries').update(IDS.entry, { notes: 'Bring the spare fin' });
      await job('notify');
      expect(await changeMails()).toHaveLength(1);

      const res = await job('notify', { now: new Date(Date.now() + 11 * MINUTE).toISOString() });
      expect(res.status).toBe(200);
      const mails = await changeMails();
      expect(mails).toHaveLength(2);
      expect(mails[1]!.to).toEqual([EMAILS.coach]);
      expect(mails[1]!.text).toContain('- edited entry Boys V4+ (notes)');
      expect(mails[1]!.text).not.toContain('set seat 1');
    });

    it('stays quiet when a coach edits their own team’s entries', async () => {
      const before = (await changeMails()).length;
      await coach.collection('entries').update(IDS.entry, { notes: 'Fin is in the tool kit' });
      await job('notify', { now: new Date(Date.now() + 60 * MINUTE).toISOString() });
      expect((await changeMails()).length).toBe(before);
    });

    it('puts a batch of changes into one email', async () => {
      const entry = await server.admin.collection('entries').create({
        id: id('entry:batch'),
        regatta: IDS.regatta,
        event: IDS.eventQuad,
        team: IDS.boys,
        label: '2V4x',
        boat_class: '4x',
        status: 'draft',
      });
      const before = (await changeMails()).length;
      const batch = coach2.createBatch();
      batch
        .collection('entry_seats')
        .create({ entry: entry.id, seat: '1', athlete: IDS.athletes[0] });
      batch
        .collection('entry_seats')
        .create({ entry: entry.id, seat: '2', athlete: IDS.athletes[1] });
      await batch.send();
      await job('notify');
      const mails = (await changeMails()).slice(before);
      expect(mails).toHaveLength(1);
      expect(mails[0]!.subject).toBe('Cy Coach changed Boys 2V4x (Event 21)');
      expect(mails[0]!.text).toContain('- set seat 1 of Boys 2V4x to Rowan Test');
      expect(mails[0]!.text).toContain('- set seat 2 of Boys 2V4x to Emery Sample');
    });

    it('respects preferences.emailOnChange = false', async () => {
      await coach.collection('users').update(IDS.coach, { preferences: { emailOnChange: false } });
      const before = (await changeMails()).length;
      await coach2.collection('entries').create({
        regatta: IDS.regatta,
        event: IDS.eventFour,
        team: IDS.boys,
        label: '3V4+',
        boat_class: '4+',
        status: 'draft',
      });
      await job('notify');
      expect((await changeMails()).length).toBe(before);
      await coach.collection('users').update(IDS.coach, { preferences: {} });
    });

    it('the jobs routes are for superusers only', async () => {
      const asCoach = await call(server.url, '/api/regatta-ops/jobs/notify', {
        method: 'POST',
        body: {},
        token: coach.authStore.token,
      });
      expect([401, 403]).toContain(asCoach.status);
      expect(
        (await call(server.url, '/api/regatta-ops/jobs/digest', { method: 'POST', body: {} }))
          .status,
      ).toBe(401);
    });
  });

  describe('daily digest', () => {
    const regattaId = id('regatta:digest');
    const entryId = id('entry:digest');

    beforeAll(async () => {
      const today = laParts(Date.now()).day;
      await server.admin.collection('regattas').create({
        id: regattaId,
        name: 'Digest regatta',
        start_date: addDays(today, 3),
        end_date: addDays(today, 3),
        timezone: 'America/Los_Angeles',
        format: 'head',
        status: 'planning',
      });
      for (const team of [IDS.boys, IDS.girls]) {
        await server.admin.collection('regatta_teams').create({ regatta: regattaId, team });
      }
      await server.admin.collection('entries').create({
        id: entryId,
        regatta: regattaId,
        team: IDS.boys,
        label: 'D8+',
        boat_class: '8+',
        status: 'draft',
      });
      // By the girls' coach: one boys entry change and one schedule change.
      await coach2.collection('entries').update(entryId, { label: 'D8+ A' });
      await coach2.collection('events').create({
        regatta: regattaId,
        kind: 'logistics',
        name: 'Bus departs',
        day: addDays(today, 3),
      });
    });

    it('waits for the digest hour in the regatta’s time zone', async () => {
      const res = await job('digest', { anyHour: false });
      expect(res.body).toEqual({ emails: [] });
    });

    it('emails each coach with a team in a regatta starting this week, once a day', async () => {
      const at = new Date(START + hoursAhead * 60 * MINUTE).toISOString();
      const res = await job('digest', { anyHour: false, now: at });
      expect(res.status).toBe(200);
      const { emails } = res.body as { emails: { to: string; regattas: string[] }[] };
      expect(emails.map((e) => e.to).sort()).toEqual([EMAILS.coach, EMAILS.coach2].sort());
      expect(emails.every((e) => e.regattas.join() === regattaId)).toBe(true);

      const mails = await outbox(server, 'kind = "digest"');
      expect(mails).toHaveLength(2);
      const boys = mails.find((m) => m.to[0] === EMAILS.coach)!;
      expect(boys.subject).toBe('Regatta Ops daily digest: Digest regatta');
      expect(boys.text).toContain('Changes in the last 24 hours, for Junior boys.');
      expect(boys.text).toContain('Schedule changes\n- Cy Coach added logistics item Bus departs');
      expect(boys.text).toContain(
        'Junior boys entries\n- Cy Coach renamed entry Boys D8+ to Boys D8+ A',
      );
      expect(boys.text).toContain(
        `Open the conflicts panel for the current list: ${APP}/regattas/${regattaId}/schedule`,
      );
      const girls = mails.find((m) => m.to[0] === EMAILS.coach2)!;
      expect(girls.text).toContain('No changes to Junior girls entries.');
      expect(girls.text).toContain("1 change to other teams' entries.");

      const again = await job('digest', { now: at });
      expect(again.body).toEqual({ emails: [] });
      expect(await outbox(server, 'kind = "digest"')).toHaveLength(2);
    });
  });
});
