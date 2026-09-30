/// <reference path="../pb_data/types.d.ts" />
// Email notifications (PLAN.md §4.6, Phase 3). Both collections are server-only: every API rule is
// null, so only hooks and superusers read or write them.
//
// - notification_log: bookkeeping for pb_hooks/notify.pb.js.
//     kind 'entry_change': one row per (entry, team to notify), key 'entry:<entryId>:<teamId>'.
//       `pending` queues change lines until `due_at`; `last_sent_at` enforces one email per entry
//       per 10 minutes.
//     kind 'digest': one row per daily digest section sent, key
//       'digest:<userId>:<regattaId>:<YYYY-MM-DD>', so a digest never goes out twice in a day.
// - mail_outbox: with SRT_MAIL_CAPTURE=1, pb_hooks/mail.pb.js stores every outgoing email here
//   instead of sending it (tests and local development).

function timestamps(name) {
  return [
    { id: name + '__created', type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
    { id: name + '__updated', type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
  ];
}

migrate(
  (app) => {
    app.save(
      new Collection({
        id: 'srt_notification_log',
        type: 'base',
        name: 'notification_log',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            id: 'notification_log__key',
            type: 'text',
            name: 'key',
            required: true,
            max: 200,
          },
          {
            id: 'notification_log__kind',
            type: 'select',
            name: 'kind',
            values: ['entry_change', 'digest'],
            maxSelect: 1,
            required: true,
          },
          {
            id: 'notification_log__regatta',
            type: 'relation',
            name: 'regatta',
            collectionId: 'srt_regattas',
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            id: 'notification_log__team',
            type: 'relation',
            name: 'team',
            collectionId: 'srt_teams',
            maxSelect: 1,
            cascadeDelete: true,
          },
          {
            id: 'notification_log__user',
            type: 'relation',
            name: 'user',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            cascadeDelete: true,
          },
          { id: 'notification_log__target_id', type: 'text', name: 'target_id', max: 30 },
          { id: 'notification_log__title', type: 'text', name: 'title', max: 300 },
          { id: 'notification_log__pending', type: 'json', name: 'pending', maxSize: 262144 },
          { id: 'notification_log__due_at', type: 'date', name: 'due_at' },
          { id: 'notification_log__last_sent_at', type: 'date', name: 'last_sent_at' },
        ].concat(timestamps('notification_log')),
        indexes: [
          'CREATE UNIQUE INDEX idx_notification_log_key ON notification_log (key)',
          'CREATE INDEX idx_notification_log_due ON notification_log (kind, due_at)',
        ],
      }),
    );

    app.save(
      new Collection({
        id: 'srt_mail_outbox',
        type: 'base',
        name: 'mail_outbox',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { id: 'mail_outbox__to', type: 'json', name: 'to', maxSize: 65536 },
          { id: 'mail_outbox__subject', type: 'text', name: 'subject', max: 1000 },
          { id: 'mail_outbox__text', type: 'text', name: 'text', max: 200000 },
          { id: 'mail_outbox__html', type: 'text', name: 'html', max: 200000 },
          { id: 'mail_outbox__kind', type: 'text', name: 'kind', max: 40 },
        ].concat(timestamps('mail_outbox')),
        indexes: ['CREATE INDEX idx_mail_outbox_created ON mail_outbox (created)'],
      }),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('srt_mail_outbox'));
    app.delete(app.findCollectionByNameOrId('srt_notification_log'));
  },
);
