/// <reference path="../pb_data/types.d.ts" />
// Notification jobs (PLAN.md §4.6, Phase 3). The logic is in srt/notify.js.
//
// - srt_notify_flush, every minute: sends queued change emails that are due.
// - srt_daily_digest, every hour on the hour (cron runs in UTC): sends the digest for regattas
//   whose local time is SRT_DIGEST_HOUR:00 (default 6).
// - Superuser-only routes run the same jobs on demand (tests, or an admin checking mail setup):
//     POST /api/srt/jobs/notify  { now?: ISO instant }                     → { sent }
//     POST /api/srt/jobs/digest  { now?: ISO instant, anyHour?: boolean }  → { emails }
//   anyHour defaults to true for the route: every regatta in the 7-day window counts as due.

cronAdd('srt_notify_flush', '* * * * *', () => {
  try {
    require(`${__hooks}/srt/notify.js`).flushEntryChanges($app, Date.now());
  } catch (err) {
    $app.logger().error('SRT: change emails failed', 'error', String(err));
  }
});

cronAdd('srt_daily_digest', '0 * * * *', () => {
  try {
    require(`${__hooks}/srt/notify.js`).runDigest($app, Date.now(), false);
  } catch (err) {
    $app.logger().error('SRT: daily digest failed', 'error', String(err));
  }
});

routerAdd(
  'POST',
  '/api/srt/jobs/notify',
  (e) => {
    const body = e.requestInfo().body || {};
    const now = body.now ? Date.parse(String(body.now)) : Date.now();
    if (isNaN(now)) throw new BadRequestError('now must be an ISO instant.');
    return e.json(200, require(`${__hooks}/srt/notify.js`).flushEntryChanges(e.app, now));
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  'POST',
  '/api/srt/jobs/digest',
  (e) => {
    const body = e.requestInfo().body || {};
    const now = body.now ? Date.parse(String(body.now)) : Date.now();
    if (isNaN(now)) throw new BadRequestError('now must be an ISO instant.');
    const anyHour = body.anyHour !== false;
    return e.json(200, require(`${__hooks}/srt/notify.js`).runDigest(e.app, now, anyHour));
  },
  $apis.requireSuperuserAuth(),
);
