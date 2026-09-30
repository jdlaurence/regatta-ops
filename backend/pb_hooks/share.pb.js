/// <reference path="../pb_data/types.d.ts" />
// Share links (PLAN.md §2, §4.8, §8.2; Phase 3). Projection and check-off logic: srt/share.js.
//
// Records (coaches and admins, through the normal collection API):
// - create: the server generates the token (40 random letters and digits) and sets created_by;
//   client values for token, revoked_at, and created_by are ignored.
// - update: revoke by setting revoked_at (the server stamps its own time). A revoked link stays
//   revoked. token, regatta, team, and created_by never change; can_check_load may.
//
// Public routes (no sign-in; the token is the credential; revoked or unknown tokens get 404):
//   GET  /api/srt/share/{token}                     read-only projection (see backend/README.md)
//   POST /api/srt/share/{token}/load-items/{id}     { loaded?, returned?, by? }, links with
//                                                   can_check_load only
// Both are rate-limited per client IP, and the POST body is capped at 4 KB.

onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set('token', require(`${__hooks}/srt/share.js`).newToken());
    e.record.set('revoked_at', '');
    e.record.set('created_by', e.auth && e.auth.collection().name === 'users' ? e.auth.id : '');
  }
  e.next();
}, 'share_links');

// Any other path (seed, dashboard) that leaves the token empty still gets one.
onRecordCreate((e) => {
  if (!e.record.getString('token')) {
    e.record.set('token', require(`${__hooks}/srt/share.js`).newToken());
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

cronAdd('srt_share_rate_prune', '* * * * *', () => {
  require(`${__hooks}/srt/share.js`).prune($app);
});

routerAdd('GET', '/api/srt/share/{token}', (e) => {
  const share = require(`${__hooks}/srt/share.js`);
  share.limit(e.app, e.realIP(), 'read');
  const link = share.resolve(e, e.request.pathValue('token'));
  e.response.header().set('Cache-Control', 'no-store');
  e.response.header().set('X-Robots-Tag', 'noindex');
  return e.json(200, share.project(e.app, link));
});

routerAdd(
  'POST',
  '/api/srt/share/{token}/load-items/{id}',
  (e) => {
    const share = require(`${__hooks}/srt/share.js`);
    share.limit(e.app, e.realIP(), 'check');
    const link = share.resolve(e, e.request.pathValue('token'));
    const body = e.requestInfo().body || {};
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, share.checkOff(e.app, link, e.request.pathValue('id'), body));
  },
  $apis.bodyLimit(4096),
);
