/// <reference path="../pb_data/types.d.ts" />
// Share links (backend/README.md "Share links"): the server makes the token and stamps
// revocation, and two public, rate-limited routes read a link and tick its load list. Projection
// and check-off logic: regatta-ops/share.js.

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set('token', require(`${__hooks}/regatta-ops/share.js`).newToken());
    e.record.set('revoked_at', '');
    e.record.set('created_by', e.auth && e.auth.collection().name === 'users' ? e.auth.id : '');
  }
  e.next();
}, 'share_links');

// Any other path (seed, dashboard) that leaves the token empty still gets one.
onRecordCreate((e) => {
  if (!e.record.getString('token')) {
    e.record.set('token', require(`${__hooks}/regatta-ops/share.js`).newToken());
  }
  e.next();
}, 'share_links');

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const r = e.record;
  const o = r.original();
  ['token', 'regatta', 'team', 'created_by'].forEach((k) => r.set(k, o.getString(k)));
  const was = o.getString('revoked_at');
  const now = r.getString('revoked_at');
  if (was && now !== was) {
    throw new BadRequestError('A revoked link stays revoked. Create a new link instead.');
  }
  if (!was && now) r.set('revoked_at', new Date().toISOString());
  e.next();
}, 'share_links');

cronAdd('regatta_ops_share_rate_prune', '* * * * *', () => {
  require(`${__hooks}/regatta-ops/share.js`).prune($app);
});

routerAdd('GET', '/api/regatta-ops/share/{token}', (e) => {
  const share = require(`${__hooks}/regatta-ops/share.js`);
  share.limit(e.app, e.realIP(), 'read');
  const link = share.resolve(e, e.request.pathValue('token'));
  e.response.header().set('Cache-Control', 'no-store');
  e.response.header().set('X-Robots-Tag', 'noindex');
  return e.json(200, share.project(e.app, link));
});

routerAdd(
  'POST',
  '/api/regatta-ops/share/{token}/load-items/{id}',
  (e) => {
    const share = require(`${__hooks}/regatta-ops/share.js`);
    share.limit(e.app, e.realIP(), 'check');
    const link = share.resolve(e, e.request.pathValue('token'));
    const body = e.requestInfo().body || {};
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, share.checkOff(e.app, link, e.request.pathValue('id'), body));
  },
  $apis.bodyLimit(4096),
);
