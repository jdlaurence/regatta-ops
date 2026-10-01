/// <reference path="../pb_data/types.d.ts" />
// Activity log (PLAN.md §8.3): after a create, update, or delete on the collections below, write
// an activity_log record with a human sentence and a compact diff. Sentences are built in
// regatta-ops/activity.js. Superuser writes (seed, dashboard) are not logged. Entry and seat changes are
// also queued for change emails (regatta-ops/notify.js). Share-link check-offs are logged by regatta-ops/share.js.
//
// Loaded first (files load in name order), so its handler wraps the other request hooks and
// sees the record as finally saved (stamps, boat class sync, cleared hot seat acknowledgment).

onRecordCreateRequest(
  (e) => {
    require(`${__hooks}/regatta-ops/activity.js`).handle(e, 'create');
  },
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'entries',
  'entry_seats',
  'events',
  'availability',
  'load_placements',
  'load_items',
  'shells',
  'oar_sets',
  'share_links',
);

onRecordUpdateRequest(
  (e) => {
    require(`${__hooks}/regatta-ops/activity.js`).handle(e, 'update');
  },
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'entries',
  'entry_seats',
  'events',
  'availability',
  'load_placements',
  'load_items',
  'shells',
  'oar_sets',
  'share_links',
);

onRecordDeleteRequest(
  (e) => {
    require(`${__hooks}/regatta-ops/activity.js`).handle(e, 'delete');
  },
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'entries',
  'entry_seats',
  'events',
  'availability',
  'load_placements',
  'load_items',
  'shells',
  'oar_sets',
  'share_links',
);
