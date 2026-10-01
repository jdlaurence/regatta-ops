/// <reference path="../pb_data/types.d.ts" />
// Comment mentions (backend/README.md "Email"): comments.mentions is recomputed from the body on
// every write, by any path (API, batch, seed, dashboard), and users mentioned for the first time
// are emailed. Parsing rules are in regatta-ops/mentions.js.

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
