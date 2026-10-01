/// <reference path="../pb_data/types.d.ts" />
// Comment mentions (PLAN.md §4.6). Parsing rules are in regatta-ops/mentions.js.
//
// - comments.mentions is recomputed from the body on every write, by any path (API, batch, seed,
//   dashboard); client-supplied values are ignored. The UI highlights these users.
// - After a signed-in user creates a comment, each mentioned user (not the author) gets an email
//   with who mentioned them, what the comment is on, the comment, and a link into the app
//   (REGATTA_OPS_APP_URL). Editing a comment emails only users mentioned for the first time. Superuser
//   writes (the seed) send nothing.

onRecordCreate((e) => {
  require(`${__hooks}/regatta-ops/mentions.js`).stamp(e.app, e.record);
  e.next();
}, 'comments');

onRecordUpdate((e) => {
  require(`${__hooks}/regatta-ops/mentions.js`).stamp(e.app, e.record);
  e.next();
}, 'comments');

onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth || e.auth.collection().name !== 'users') return e.next();
  e.next();
  try {
    require(`${__hooks}/regatta-ops/mentions.js`).notify(e.app, e.record, [], e.auth);
  } catch (err) {
    e.app.logger().error('Regatta Ops: mention emails failed', 'error', String(err));
  }
}, 'comments');

onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth() || !e.auth || e.auth.collection().name !== 'users') return e.next();
  const mentions = require(`${__hooks}/regatta-ops/mentions.js`);
  const previous = mentions.toArray(e.record.original().getStringSlice('mentions'));
  e.next();
  try {
    mentions.notify(e.app, e.record, previous, e.auth);
  } catch (err) {
    e.app.logger().error('Regatta Ops: mention emails failed', 'error', String(err));
  }
}, 'comments');
