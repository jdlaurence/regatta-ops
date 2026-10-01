/// <reference path="../pb_data/types.d.ts" />
// Notification jobs (backend/README.md "Email"): the change-email flush every minute, the daily
// digest every hour on the hour (cron runs in UTC), and superuser-only routes that run both on
// demand. The logic is in regatta-ops/notify.js.

cronAdd('regatta_ops_notify_flush', '* * * * *', () => {
  try {
    require(`${__hooks}/regatta-ops/notify.js`).flushEntryChanges($app, Date.now());
  } catch (err) {
    $app.logger().error('Regatta Ops: change emails failed', 'error', String(err));
  }
});

cronAdd('regatta_ops_daily_digest', '0 * * * *', () => {
  try {
    require(`${__hooks}/regatta-ops/notify.js`).runDigest($app, Date.now(), false);
  } catch (err) {
    $app.logger().error('Regatta Ops: daily digest failed', 'error', String(err));
  }
});

routerAdd(
  'POST',
  '/api/regatta-ops/jobs/notify',
  (e) => {
    const body = e.requestInfo().body || {};
    const now = body.now ? Date.parse(String(body.now)) : Date.now();
    if (isNaN(now)) throw new BadRequestError('now must be an ISO instant.');
    return e.json(200, require(`${__hooks}/regatta-ops/notify.js`).flushEntryChanges(e.app, now));
  },
  $apis.requireSuperuserAuth(),
);

routerAdd(
  'POST',
  '/api/regatta-ops/jobs/digest',
  (e) => {
    const body = e.requestInfo().body || {};
    const now = body.now ? Date.parse(String(body.now)) : Date.now();
    if (isNaN(now)) throw new BadRequestError('now must be an ISO instant.');
    const anyHour = body.anyHour !== false;
    return e.json(200, require(`${__hooks}/regatta-ops/notify.js`).runDigest(e.app, now, anyHour));
  },
  $apis.requireSuperuserAuth(),
);
