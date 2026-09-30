/// <reference path="../pb_data/types.d.ts" />
// Phase 3 fields on existing collections (PLAN.md §4.6, §4.8).
//
// - comments.mentions: the users an @-mention in the body resolves to, set by
//   pb_hooks/comments.pb.js on every write (client values are ignored). The UI highlights them.
// - load_items.loaded_by_name / returned_by_name: the free-text name someone typed when ticking an
//   item through a share link (no account, so loaded_by / returned_by stay empty). Cleared when a
//   signed-in user ticks or unticks the item.
// - activity_log.team: the team whose data changed (entries, seats, availability, share links),
//   so the daily digest and a "this team" activity filter need no joins.

const USERS_ID = '_pb_users_auth_';

migrate(
  (app) => {
    const comments = app.findCollectionByNameOrId('srt_comments');
    comments.fields.add(
      new Field({
        id: 'comments__mentions',
        type: 'relation',
        name: 'mentions',
        collectionId: USERS_ID,
        maxSelect: 999,
        cascadeDelete: false,
      }),
    );
    app.save(comments);

    const items = app.findCollectionByNameOrId('srt_load_items');
    items.fields.add(
      new Field({
        id: 'load_items__loaded_by_name',
        type: 'text',
        name: 'loaded_by_name',
        max: 100,
      }),
    );
    items.fields.add(
      new Field({
        id: 'load_items__returned_by_name',
        type: 'text',
        name: 'returned_by_name',
        max: 100,
      }),
    );
    app.save(items);

    const log = app.findCollectionByNameOrId('srt_activity_log');
    log.fields.add(
      new Field({
        id: 'activity_log__team',
        type: 'relation',
        name: 'team',
        collectionId: 'srt_teams',
        maxSelect: 1,
        cascadeDelete: false,
      }),
    );
    log.addIndex('idx_activity_team', false, 'regatta, team, created', '');
    app.save(log);
  },
  (app) => {
    const comments = app.findCollectionByNameOrId('srt_comments');
    comments.fields.removeByName('mentions');
    app.save(comments);

    const items = app.findCollectionByNameOrId('srt_load_items');
    items.fields.removeByName('loaded_by_name');
    items.fields.removeByName('returned_by_name');
    app.save(items);

    const log = app.findCollectionByNameOrId('srt_activity_log');
    log.removeIndex('idx_activity_team');
    log.fields.removeByName('team');
    app.save(log);
  },
);
