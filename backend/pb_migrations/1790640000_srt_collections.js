/// <reference path="../pb_data/types.d.ts" />
// SRT collections, fields, indexes, and API rules (PLAN.md §8.1, §8.2, §18 club_settings).
//
// Storage choices (see backend/README.md):
// - Instants (scheduled_at, published_at, packed_at, loaded_at, returned_at, seen_at, revoked_at)
//   are `date` fields. PocketBase returns them as 'YYYY-MM-DD HH:MM:SS.sssZ' and '' when unset.
// - Calendar days (start_date, end_date, day, birthdate) are `text` fields constrained to
//   'YYYY-MM-DD', so they round-trip unchanged and never shift across time zones.
// - Optional single relations and selects come back as ''; multi relations and selects as [].
// - Numbers are never null in PocketBase: an unset number comes back as 0.
//
// Collection ids are stable ('srt_<name>'); field ids are '<collection>__<field>'.

const DAY = '^\\d{4}-\\d{2}-\\d{2}$';
const BOAT_CLASSES = ['1x', '2x', '2-', '2+', '4x', '4x+', '4+', '4-', '8+'];
const SEATS = ['1', '2', '3', '4', '5', '6', '7', '8', 'cox'];
const EQUIPMENT_STATUS = ['in_service', 'limited', 'out_of_service', 'retired'];
const GENDER_AFFINITY = ['women', 'men', 'any'];
const TEAM_COLOR_KEYS = [
  'navy',
  'raspberry',
  'ochre',
  'green',
  'violet',
  'cyan',
  'bronze',
  'slate',
];
const GEAR_CATEGORIES = [
  'cox_box',
  'slings',
  'rigger_set',
  'tool_kit',
  'tent',
  'launch',
  'straps',
  'spare_parts',
  'other',
];

// API rules (§8.2). Superusers bypass every rule; null locks an action to superusers and hooks.
const AUTH = '@request.auth.id != ""';
const EDIT = '@request.auth.role = "coach" || @request.auth.role = "admin"';
const ADMIN = '@request.auth.role = "admin"';

const USERS_ID = '_pb_users_auth_';

function cid(name) {
  return 'srt_' + name;
}

// Field builders. `o` carries the per-field options (required, max, values, ...).
function text(name, o) {
  return Object.assign({ type: 'text', name: name, max: 0 }, o || {});
}
function longText(name, o) {
  return Object.assign({ type: 'text', name: name, max: 20000 }, o || {});
}
function day(name, o) {
  return Object.assign({ type: 'text', name: name, pattern: DAY, max: 10 }, o || {});
}
function num(name, o) {
  return Object.assign({ type: 'number', name: name }, o || {});
}
function int(name, o) {
  return Object.assign({ type: 'number', name: name, onlyInt: true }, o || {});
}
function bool(name) {
  return { type: 'bool', name: name };
}
function date(name) {
  return { type: 'date', name: name };
}
function json(name, o) {
  return Object.assign({ type: 'json', name: name, maxSize: 1048576 }, o || {});
}
function select(name, values, o) {
  return Object.assign({ type: 'select', name: name, values: values, maxSelect: 1 }, o || {});
}
function multiSelect(name, values) {
  return { type: 'select', name: name, values: values, maxSelect: values.length };
}
function rel(name, collectionId, o) {
  return Object.assign(
    {
      type: 'relation',
      name: name,
      collectionId: collectionId,
      maxSelect: 1,
      cascadeDelete: false,
    },
    o || {},
  );
}
function multiRel(name, collectionId) {
  return {
    type: 'relation',
    name: name,
    collectionId: collectionId,
    maxSelect: 999,
    cascadeDelete: false,
  };
}
function timestamps() {
  return [
    { type: 'autodate', name: 'created', onCreate: true, onUpdate: false },
    { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
  ];
}

function withFieldIds(collectionName, fields) {
  return fields.map(function (f) {
    return Object.assign({ id: collectionName + '__' + f.name }, f);
  });
}

// rules: [list, view, create, update, delete]
function base(name, rules, fields, indexes) {
  return new Collection({
    id: cid(name),
    type: 'base',
    name: name,
    listRule: rules[0],
    viewRule: rules[1],
    createRule: rules[2],
    updateRule: rules[3],
    deleteRule: rules[4],
    fields: withFieldIds(name, fields.concat(timestamps())),
    indexes: indexes || [],
  });
}

const READ_EDIT = [AUTH, AUTH, EDIT, EDIT, EDIT];
const READ_ADMIN = [AUTH, AUTH, ADMIN, ADMIN, ADMIN];

migrate(
  (app) => {
    // -- teams --------------------------------------------------------------------------------
    app.save(
      base(
        'teams',
        READ_ADMIN,
        [
          text('name', { required: true, max: 100 }),
          text('short_name', { max: 40 }),
          select('program', ['juniors', 'masters', 'other'], { required: true }),
          select('color_key', TEAM_COLOR_KEYS, { required: true }),
          int('sort_order'),
          bool('archived'),
        ],
        ['CREATE INDEX idx_teams_sort ON teams (sort_order)'],
      ),
    );

    // -- users (the built-in auth collection) --------------------------------------------------
    const users = app.findCollectionByNameOrId(USERS_ID);
    users.fields.add(
      new Field(
        Object.assign(
          { id: 'users__role' },
          select('role', ['admin', 'coach', 'viewer'], { required: true }),
        ),
      ),
    );
    users.fields.add(
      new Field(Object.assign({ id: 'users__default_team' }, rel('default_team', cid('teams')))),
    );
    users.fields.add(
      new Field(
        Object.assign({ id: 'users__preferences' }, json('preferences', { maxSize: 65536 })),
      ),
    );
    users.listRule = AUTH;
    users.viewRule = AUTH;
    // New accounts: admins, or Google sign-in (the auth hook enforces the domain and the role).
    users.createRule =
      ADMIN +
      ' || (@request.context = "oauth2" && (@request.body.role:isset = false || @request.body.role = "coach"))';
    // A user may edit their own name, avatar, preferences, and default team, never their role,
    // email, or verified flag. Admins may edit anyone.
    users.updateRule =
      ADMIN +
      ' || (id = @request.auth.id && @request.body.role:changed = false' +
      ' && @request.body.email:changed = false && @request.body.verified:changed = false)';
    users.deleteRule = ADMIN;
    users.manageRule = ADMIN;
    users.passwordAuth.enabled = true;
    users.passwordAuth.identityFields = ['email'];
    // Google is configured at startup from SRT_GOOGLE_CLIENT_ID / SRT_GOOGLE_CLIENT_SECRET
    // (pb_hooks/auth.pb.js). Disabled until then.
    users.oauth2.enabled = false;
    users.oauth2.mappedFields.name = 'name';
    users.oauth2.mappedFields.avatarURL = 'avatar';
    users.authAlert.enabled = false;
    app.save(users);

    // -- athletes -----------------------------------------------------------------------------
    app.save(
      base(
        'athletes',
        READ_EDIT,
        [
          rel('team', cid('teams'), { required: true }),
          text('first_name', { required: true, max: 100 }),
          text('last_name', { max: 100 }),
          text('preferred_name', { max: 100 }),
          select('side', ['port', 'starboard', 'both', 'none'], { required: true }),
          bool('can_scull'),
          bool('can_cox'),
          num('weight_kg', { min: 0 }),
          int('birth_year'),
          day('birthdate'),
          text('gender', { max: 40 }),
          int('grad_year'),
          select('level', ['novice', 'experienced'], { required: true }),
          select('status', ['active', 'inactive'], { required: true }),
          longText('notes'),
        ],
        ['CREATE INDEX idx_athletes_team_status ON athletes (team, status)'],
      ),
    );

    // -- regattas -----------------------------------------------------------------------------
    app.save(
      base(
        'regattas',
        READ_EDIT,
        [
          text('name', { required: true, max: 200 }),
          text('venue', { max: 200 }),
          text('city', { max: 200 }),
          day('start_date', { required: true }),
          day('end_date', { required: true }),
          text('timezone', { required: true, max: 64 }),
          select('format', ['sprint', 'head'], { required: true }),
          longText('notes'),
          select('status', ['planning', 'final', 'archived'], { required: true }),
          json('settings', { maxSize: 65536 }),
          rel('created_by', USERS_ID),
        ],
        ['CREATE INDEX idx_regattas_start ON regattas (start_date)'],
      ),
    );

    app.save(
      base(
        'regatta_teams',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('team', cid('teams'), { required: true }),
          longText('notes'),
          date('published_at'),
          json('published_snapshot', { maxSize: 5242880 }),
        ],
        ['CREATE UNIQUE INDEX idx_regatta_teams_unique ON regatta_teams (regatta, team)'],
      ),
    );

    app.save(
      base(
        'availability',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('athlete', cid('athletes'), { required: true, cascadeDelete: true }),
          select('status', ['available', 'unavailable', 'maybe'], { required: true }),
          json('days', { maxSize: 65536 }),
          text('reason', { max: 500 }),
          rel('updated_by', USERS_ID),
        ],
        ['CREATE UNIQUE INDEX idx_availability_unique ON availability (regatta, athlete)'],
      ),
    );

    app.save(
      base(
        'events',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          select('kind', ['race', 'logistics'], { required: true }),
          text('event_number', { max: 20 }),
          text('name', { required: true, max: 200 }),
          select('boat_class', BOAT_CLASSES),
          text('category', { max: 100 }),
          day('day', { required: true }),
          date('scheduled_at'),
          select('stage', ['heat', 'semi', 'final', 'time_trial', 'race']),
          text('progression_group', { max: 100 }),
          multiRel('team_filter', cid('teams')),
          longText('notes'),
          int('sort_order'),
          text('source', { max: 200 }),
        ],
        ['CREATE INDEX idx_events_schedule ON events (regatta, day, scheduled_at)'],
      ),
    );

    // -- fleet --------------------------------------------------------------------------------
    app.save(
      base(
        'shells',
        READ_EDIT,
        [
          text('name', { required: true, max: 100 }),
          text('nickname', { max: 60 }),
          select('boat_class', BOAT_CLASSES, { required: true }),
          multiSelect('compatible_classes', BOAT_CLASSES),
          select('rigging', ['sweep', 'scull', 'convertible'], { required: true }),
          text('manufacturer', { max: 100 }),
          text('model', { max: 100 }),
          text('serial', { max: 100 }),
          int('year'),
          num('length_cm', { min: 0 }),
          num('beam_cm', { min: 0 }),
          num('weight_kg', { min: 0 }),
          text('weight_class_label', { max: 40 }),
          num('crew_weight_min_kg', { min: 0 }),
          num('crew_weight_max_kg', { min: 0 }),
          select('stroke_side', ['port', 'starboard']),
          select('cox_position', ['stern', 'bow']),
          select('rigger_type', ['wing', 'side', 'none'], { required: true }),
          int('rigger_count', { min: 0 }),
          text('shoes', { max: 100 }),
          num('spread_cm', { min: 0 }),
          num('span_cm', { min: 0 }),
          select('level', ['beginner', 'intermediate', 'racer']),
          select('gender_affinity', GENDER_AFFINITY, { required: true }),
          rel('home_team', cid('teams')),
          text('location', { max: 100 }),
          select('status', EQUIPMENT_STATUS, { required: true }),
          text('color', { max: 60 }),
          bool('is_private'),
          longText('notes'),
          {
            type: 'file',
            name: 'photo',
            maxSelect: 1,
            maxSize: 10485760,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
            thumbs: ['320x0', '96x96'],
          },
        ],
        ['CREATE INDEX idx_shells_class ON shells (boat_class)'],
      ),
    );

    app.save(
      base('oar_sets', READ_EDIT, [
        text('name', { required: true, max: 100 }),
        select('type', ['sweep', 'scull'], { required: true }),
        text('color', { max: 60 }),
        int('count', { min: 0 }),
        text('blade', { max: 60 }),
        num('length_cm', { min: 0 }),
        num('inboard_cm', { min: 0 }),
        num('grip_mm', { min: 0 }),
        select('gender_affinity', GENDER_AFFINITY, { required: true }),
        rel('home_team', cid('teams')),
        select('status', EQUIPMENT_STATUS, { required: true }),
        longText('notes'),
      ]),
    );

    app.save(
      base('gear_items', READ_EDIT, [
        select('category', GEAR_CATEGORIES, { required: true }),
        text('name', { required: true, max: 100 }),
        int('quantity', { min: 0 }),
        bool('default_load'),
        longText('notes'),
      ]),
    );

    // -- entries ------------------------------------------------------------------------------
    app.save(
      base(
        'entries',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('event', cid('events')),
          rel('team', cid('teams'), { required: true }),
          text('label', { max: 60 }),
          select('boat_class', BOAT_CLASSES, { required: true }),
          rel('shell', cid('shells')),
          rel('oar_set', cid('oar_sets')),
          select('status', ['draft', 'planned', 'confirmed', 'scratched'], { required: true }),
          rel('coach', USERS_ID),
          longText('notes'),
          text('hot_seat_plan', { max: 500 }),
          rel('hot_seat_ack_by', USERS_ID),
          text('hot_seat_fingerprint', { max: 200 }),
          json('seat_sides', { maxSize: 4096 }),
          rel('created_by', USERS_ID),
          rel('updated_by', USERS_ID),
        ],
        [
          'CREATE INDEX idx_entries_team ON entries (regatta, team)',
          'CREATE INDEX idx_entries_shell ON entries (regatta, shell)',
          'CREATE INDEX idx_entries_oar_set ON entries (regatta, oar_set)',
          'CREATE INDEX idx_entries_event ON entries (event)',
        ],
      ),
    );

    app.save(
      base(
        'entry_seats',
        READ_EDIT,
        [
          rel('entry', cid('entries'), { required: true, cascadeDelete: true }),
          select('seat', SEATS, { required: true }),
          rel('athlete', cid('athletes')),
          text('note', { max: 500 }),
        ],
        [
          'CREATE UNIQUE INDEX idx_entry_seats_seat ON entry_seats (entry, seat)',
          "CREATE UNIQUE INDEX idx_entry_seats_athlete ON entry_seats (entry, athlete) WHERE athlete != ''",
          'CREATE INDEX idx_entry_seats_by_athlete ON entry_seats (athlete)',
        ],
      ),
    );

    // -- trailers -----------------------------------------------------------------------------
    app.save(
      base('trailers', READ_ADMIN, [
        text('name', { required: true, max: 100 }),
        select('style', ['offset_post', 'center_post', 'goalpost'], { required: true }),
        num('frame_length_cm', { min: 0 }),
        num('width_cm', { min: 0 }),
        num('post_offset_pct', { min: 0, max: 100 }),
        bool('bow_forward_default'),
        longText('notes'),
        json('default_rules', { maxSize: 262144 }),
      ]),
    );

    app.save(
      base(
        'trailer_shelves',
        READ_ADMIN,
        [
          rel('trailer', cid('trailers'), { required: true, cascadeDelete: true }),
          text('label', { max: 100 }),
          int('tier'),
          select('column_key', ['left', 'right', 'full'], { required: true }),
          num('width_cm', { min: 0 }),
          num('length_cm', { min: 0 }),
          num('front_overhang_max_cm', { min: 0 }),
          num('rear_overhang_max_cm', { min: 0 }),
          multiSelect('allowed_classes', BOAT_CLASSES),
          int('lanes_override', { min: 0 }),
          select('lane_access', ['any', 'outer_first'], { required: true }),
          int('max_boats', { min: 0 }),
          num('max_weight_kg', { min: 0 }),
          int('access_rank'),
          bool('active'),
          int('sort_order'),
        ],
        ['CREATE INDEX idx_trailer_shelves_trailer ON trailer_shelves (trailer)'],
      ),
    );

    app.save(
      base(
        'trailer_compartments',
        READ_ADMIN,
        [
          rel('trailer', cid('trailers'), { required: true, cascadeDelete: true }),
          select('kind', ['bed', 'oar_box', 'oar_tube', 'oar_rack', 'rigger_rack', 'storage'], {
            required: true,
          }),
          text('label', { max: 100 }),
          num('capacity', { min: 0 }),
          text('capacity_unit', { max: 40 }),
        ],
        ['CREATE INDEX idx_trailer_compartments_trailer ON trailer_compartments (trailer)'],
      ),
    );

    // -- load plans ---------------------------------------------------------------------------
    app.save(
      base(
        'load_plans',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('trailer', cid('trailers'), { required: true }),
          select('status', ['draft', 'final'], { required: true }),
          json('rules', { maxSize: 262144 }),
          date('packed_at'),
          longText('notes'),
        ],
        ['CREATE UNIQUE INDEX idx_load_plans_unique ON load_plans (regatta, trailer)'],
      ),
    );

    app.save(
      base(
        'load_placements',
        READ_EDIT,
        [
          rel('load_plan', cid('load_plans'), { required: true, cascadeDelete: true }),
          rel('shell', cid('shells'), { required: true, cascadeDelete: true }),
          rel('shelf', cid('trailer_shelves'), { required: true, cascadeDelete: true }),
          int('lane', { min: 0 }),
          num('offset_cm'),
          bool('bow_forward'),
          bool('locked'),
          json('reasons', { maxSize: 65536 }),
        ],
        ['CREATE UNIQUE INDEX idx_load_placements_unique ON load_placements (load_plan, shell)'],
      ),
    );

    app.save(
      base(
        'load_items',
        READ_EDIT,
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('load_plan', cid('load_plans')),
          select('kind', ['shell', 'riggers', 'oar_set', 'gear', 'extra'], { required: true }),
          text('ref_id', { max: 30 }),
          text('label', { required: true, max: 200 }),
          int('quantity', { min: 0 }),
          text('container', { max: 100 }),
          date('loaded_at'),
          rel('loaded_by', USERS_ID),
          date('returned_at'),
          rel('returned_by', USERS_ID),
          longText('notes'),
        ],
        [
          'CREATE INDEX idx_load_items_regatta ON load_items (regatta)',
          'CREATE INDEX idx_load_items_plan ON load_items (load_plan)',
        ],
      ),
    );

    // -- communication ------------------------------------------------------------------------
    // Everyone signed in may comment (§2: viewers comment too); authors edit their own.
    // pb_hooks/stamp.pb.js sets author to the signed-in user.
    app.save(
      base(
        'comments',
        [
          AUTH,
          AUTH,
          AUTH,
          'author = @request.auth.id || ' + ADMIN,
          'author = @request.auth.id || ' + ADMIN,
        ],
        [
          select('target_type', ['entry', 'event', 'load_plan'], { required: true }),
          text('target_id', { required: true, max: 30 }),
          rel('author', USERS_ID),
          longText('body', { required: true, max: 10000 }),
        ],
        ['CREATE INDEX idx_comments_target ON comments (target_type, target_id)'],
      ),
    );

    // Written only by pb_hooks/activity.pb.js.
    app.save(
      base(
        'activity_log',
        [AUTH, AUTH, null, null, null],
        [
          rel('regatta', cid('regattas')),
          rel('actor', USERS_ID),
          select('action', ['create', 'update', 'delete'], { required: true }),
          text('target_type', { required: true, max: 40 }),
          text('target_id', { required: true, max: 30 }),
          text('summary', { required: true, max: 1000 }),
          json('diff', { maxSize: 262144 }),
        ],
        [
          'CREATE INDEX idx_activity_regatta ON activity_log (regatta, created)',
          'CREATE INDEX idx_activity_target ON activity_log (target_type, target_id)',
          'CREATE INDEX idx_activity_created ON activity_log (created)',
        ],
      ),
    );

    // Heartbeats (Phase 2). pb_hooks/stamp.pb.js sets user to the signed-in user;
    // pb_hooks/housekeeping.pb.js prunes rows older than 2 minutes.
    app.save(
      base(
        'presence',
        [AUTH, AUTH, AUTH, 'user = @request.auth.id', 'user = @request.auth.id'],
        [
          rel('user', USERS_ID, { required: true, cascadeDelete: true }),
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          text('page', { max: 200 }),
          rel('team', cid('teams')),
          date('seen_at'),
        ],
        [
          'CREATE INDEX idx_presence_regatta ON presence (regatta, seen_at)',
          'CREATE INDEX idx_presence_user ON presence (user, regatta)',
        ],
      ),
    );

    app.save(
      base(
        'share_links',
        [ADMIN, ADMIN, ADMIN, ADMIN, ADMIN],
        [
          rel('regatta', cid('regattas'), { required: true, cascadeDelete: true }),
          rel('team', cid('teams')),
          text('token', { required: true, min: 16, max: 100 }),
          bool('can_check_load'),
          date('revoked_at'),
        ],
        ['CREATE UNIQUE INDEX idx_share_links_token ON share_links (token)'],
      ),
    );

    // One record (§18). pb_hooks/singletons.pb.js refuses a second.
    app.save(
      base(
        'club_settings',
        [AUTH, AUTH, ADMIN, ADMIN, null],
        [
          text('club_name', { required: true, max: 200 }),
          text('timezone', { required: true, max: 64 }),
          select('weight_unit', ['kg', 'lb'], { required: true }),
          int('week_starts_on', { min: 0, max: 6 }),
          json('timing_defaults', { maxSize: 65536 }),
          num('head_race_duration_min', { min: 0 }),
        ],
      ),
    );
  },
  (app) => {
    const names = [
      'club_settings',
      'share_links',
      'presence',
      'activity_log',
      'comments',
      'load_items',
      'load_placements',
      'load_plans',
      'trailer_compartments',
      'trailer_shelves',
      'trailers',
      'entry_seats',
      'entries',
      'gear_items',
      'oar_sets',
      'shells',
      'events',
      'availability',
      'regatta_teams',
      'regattas',
      'athletes',
    ];
    for (const name of names) {
      app.delete(app.findCollectionByNameOrId(cid(name)));
    }
    const users = app.findCollectionByNameOrId(USERS_ID);
    users.fields.removeByName('role');
    users.fields.removeByName('default_team');
    users.fields.removeByName('preferences');
    users.listRule = 'id = @request.auth.id';
    users.viewRule = 'id = @request.auth.id';
    users.createRule = '';
    users.updateRule = 'id = @request.auth.id';
    users.deleteRule = 'id = @request.auth.id';
    users.manageRule = null;
    app.save(users);
    app.delete(app.findCollectionByNameOrId(cid('teams')));
  },
);
