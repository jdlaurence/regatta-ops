// Share links (PLAN.md §8.2). Used by share.pb.js.
//
// A share link is a token that grants read-only access, without signing in, to one regatta's
// published lineups (one team's, or every participating team's), its day schedule, and, when
// can_check_load is set, its load list with check-off. Everything here is an explicit projection:
// fields are copied one by one, so emails, notes, availability, rosters, and unpublished drafts
// never leave the server through a link.

const activity = require(`${__hooks}/regatta-ops/activity.js`);

const TOKEN_LENGTH = 40;
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_RE = /^[A-Za-z0-9_-]{16,100}$/;
const ID_RE = /^[a-z0-9]{15}$/;
const NAME_MAX = 60;
const KIND_ORDER = ['shell', 'riggers', 'oar_set', 'gear', 'extra'];

// Requests per minute per client IP (e.realIP(); behind a proxy, set the trusted proxy header in
// Settings so this is the visitor's address). Parents on one network and a loading crew on the
// boathouse Wi-Fi share an IP, so reads and check-offs are generous. Tokens are 238 random bits,
// so guessing is hopeless anyway; unknown tokens are still throttled hard.
const LIMITS = { read: 600, check: 600, miss: 30 };
const LIMIT_PREFIX = 'regatta_ops_rl:';
const LIMIT_MAX_KEYS = 20000;

const NOT_FOUND = 'This share link does not exist or was revoked.';

/** 40 characters from a 62-letter alphabet (about 238 bits), crypto/rand. */
function newToken() {
  return $security.randomStringWithAlphabet(TOKEN_LENGTH, TOKEN_ALPHABET);
}

// -- rate limiting -------------------------------------------------------------------------------

function minute() {
  return Math.floor(Date.now() / 60000);
}

/** Counts one request in `bucket` for `ip`; throws 429 when over the limit for this minute. */
function limit(app, ip, bucket) {
  const store = app.store();
  const key = LIMIT_PREFIX + bucket + ':' + (ip || '?') + ':' + minute();
  const count = Number(store.get(key) || 0);
  if (count >= LIMITS[bucket]) {
    throw new TooManyRequestsError('Too many requests from this network. Try again in a minute.');
  }
  if (!store.setIfLessThanLimit(key, count + 1, LIMIT_MAX_KEYS)) {
    prune(app);
    store.setIfLessThanLimit(key, count + 1, LIMIT_MAX_KEYS);
  }
}

/** Drops counters from earlier minutes (run every minute by share.pb.js). */
function prune(app) {
  const store = app.store();
  const current = ':' + minute();
  const keys = store.keys();
  for (let i = 0; i < keys.length; i++) {
    const key = String(keys[i]);
    if (key.indexOf(LIMIT_PREFIX) === 0 && key.slice(-current.length) !== current) {
      store.remove(key);
    }
  }
}

// -- lookups -------------------------------------------------------------------------------------

/** The live share link for `token`, or a 404. Failed lookups count against the "miss" limit. */
function resolve(e, token) {
  let link = null;
  if (TOKEN_RE.test(String(token || ''))) {
    try {
      link = e.app.findFirstRecordByData('share_links', 'token', token);
    } catch (_) {
      link = null;
    }
  }
  if (!link || link.getString('revoked_at')) {
    limit(e.app, e.realIP(), 'miss');
    throw new NotFoundError(NOT_FOUND);
  }
  return link;
}

function findOrNull(app, collection, id) {
  if (!id) return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function readJson(record, field) {
  try {
    return JSON.parse(record.getString(field) || 'null');
  } catch (_) {
    return null;
  }
}

function toArray(slice) {
  const out = [];
  if (!slice) return out;
  for (let i = 0; i < slice.length; i++) out.push(String(slice[i]));
  return out;
}

// -- projection ----------------------------------------------------------------------------------

/** PocketBase date text → ISO instant, or null. */
function iso(value) {
  return value ? String(value).replace(' ', 'T') : null;
}

function str(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function strOrNull(v) {
  return v === null || v === undefined || v === '' ? null : String(v);
}

/** One published entry, copied field by field (PublishedEntry in packages/domain/src/types.ts). */
function projectEntry(e) {
  const seats = Array.isArray(e.seats) ? e.seats : [];
  return {
    entryId: str(e.entryId),
    label: str(e.label),
    boatClass: str(e.boatClass),
    status: str(e.status),
    eventId: strOrNull(e.eventId),
    eventName: str(e.eventName),
    eventNumber: str(e.eventNumber),
    day: str(e.day),
    scheduledAt: strOrNull(e.scheduledAt),
    stage: strOrNull(e.stage),
    shellId: strOrNull(e.shellId),
    shellName: str(e.shellName),
    oarSetId: strOrNull(e.oarSetId),
    oarSetName: str(e.oarSetName),
    hotSeatPlan: str(e.hotSeatPlan),
    seats: seats
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        seat: str(s.seat),
        athleteId: strOrNull(s.athleteId),
        athleteName: str(s.athleteName),
      })),
  };
}

function projectTeam(team, regattaTeam) {
  const snapshot = regattaTeam ? readJson(regattaTeam, 'published_snapshot') : null;
  const entries =
    snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.entries)
      ? snapshot.entries.filter((x) => x && typeof x === 'object').map(projectEntry)
      : [];
  const publishedAt =
    (regattaTeam && iso(regattaTeam.getString('published_at'))) ||
    (snapshot && strOrNull(snapshot.publishedAt)) ||
    null;
  return {
    id: team.id,
    name: team.getString('name'),
    shortName: team.getString('short_name'),
    colorKey: team.getString('color_key'),
    published: !!snapshot && publishedAt !== null,
    publishedAt: publishedAt,
    entries: entries,
  };
}

function projectEvent(ev, teamIds) {
  const logistics = ev.getString('kind') === 'logistics';
  return {
    id: ev.id,
    kind: ev.getString('kind'),
    eventNumber: ev.getString('event_number'),
    name: ev.getString('name'),
    boatClass: strOrNull(ev.getString('boat_class')),
    category: ev.getString('category'),
    day: ev.getString('day'),
    scheduledAt: iso(ev.getString('scheduled_at')),
    stage: strOrNull(ev.getString('stage')),
    progressionGroup: ev.getString('progression_group'),
    // Logistics only: the teams a line is for (empty = everyone), limited to the teams shown.
    teamIds: logistics
      ? toArray(ev.getStringSlice('team_filter')).filter((t) => teamIds.indexOf(t) !== -1)
      : [],
  };
}

function loadItemProjector(app) {
  const names = {};
  const trailers = {};
  const userName = (id) => {
    if (!id) return '';
    if (!(id in names)) {
      const u = findOrNull(app, 'users', id);
      names[id] = u ? u.getString('name') : '';
    }
    return names[id];
  };
  const trailerName = (planId) => {
    if (!planId) return null;
    if (!(planId in trailers)) {
      const plan = findOrNull(app, 'load_plans', planId);
      const trailer = plan && findOrNull(app, 'trailers', plan.getString('trailer'));
      trailers[planId] = trailer ? trailer.getString('name') : null;
    }
    return trailers[planId];
  };
  return (item) => {
    const loadedAt = iso(item.getString('loaded_at'));
    const returnedAt = iso(item.getString('returned_at'));
    return {
      id: item.id,
      kind: item.getString('kind'),
      label: item.getString('label'),
      quantity: item.getInt('quantity'),
      container: item.getString('container'),
      trailerName: trailerName(item.getString('load_plan')),
      loaded: loadedAt !== null,
      loadedAt: loadedAt,
      loadedBy: loadedAt
        ? userName(item.getString('loaded_by')) || item.getString('loaded_by_name') || null
        : null,
      returned: returnedAt !== null,
      returnedAt: returnedAt,
      returnedBy: returnedAt
        ? userName(item.getString('returned_by')) || item.getString('returned_by_name') || null
        : null,
    };
  };
}

function kindRank(kind) {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
}

/** The read-only JSON for GET /api/regatta-ops/share/{token}. */
function project(app, link) {
  const regatta = findOrNull(app, 'regattas', link.getString('regatta'));
  if (!regatta) throw new NotFoundError(NOT_FOUND);
  const scopedTeam = link.getString('team');
  const regattaTeams = app.findRecordsByFilter('regatta_teams', 'regatta = {:regatta}', '', 0, 0, {
    regatta: regatta.id,
  });
  const teamIds = scopedTeam ? [scopedTeam] : regattaTeams.map((rt) => rt.getString('team'));
  const teams = teamIds
    .map((id) => findOrNull(app, 'teams', id))
    .filter((t) => !!t)
    .sort(
      (a, b) =>
        a.getInt('sort_order') - b.getInt('sort_order') ||
        a.getString('name').localeCompare(b.getString('name')),
    )
    .map((team) =>
      projectTeam(
        team,
        regattaTeams.find((rt) => rt.getString('team') === team.id),
      ),
    );

  const shownTeamIds = teams.map((t) => t.id);
  const schedule = app
    .findRecordsByFilter('events', 'regatta = {:regatta}', '', 0, 0, { regatta: regatta.id })
    .filter((ev) => {
      if (!scopedTeam || ev.getString('kind') !== 'logistics') return true;
      const only = toArray(ev.getStringSlice('team_filter'));
      return only.length === 0 || only.indexOf(scopedTeam) !== -1;
    })
    .sort((a, b) => {
      const day = a.getString('day').localeCompare(b.getString('day'));
      if (day) return day;
      const at = a.getString('scheduled_at');
      const bt = b.getString('scheduled_at');
      if (at !== bt) {
        if (!at) return 1;
        if (!bt) return -1;
        return at < bt ? -1 : 1;
      }
      return a.getInt('sort_order') - b.getInt('sort_order');
    })
    .map((ev) => projectEvent(ev, shownTeamIds));

  let clubName = '';
  try {
    const settings = app.findAllRecords('club_settings');
    if (settings.length) clubName = settings[0].getString('club_name');
  } catch (_) {
    clubName = '';
  }

  const out = {
    generatedAt: new Date().toISOString(),
    clubName: clubName,
    link: {
      scope: scopedTeam ? 'team' : 'regatta',
      teamId: scopedTeam || null,
      canCheckLoad: link.getBool('can_check_load'),
    },
    regatta: {
      id: regatta.id,
      name: regatta.getString('name'),
      venue: regatta.getString('venue'),
      city: regatta.getString('city'),
      startDate: regatta.getString('start_date'),
      endDate: regatta.getString('end_date'),
      timezone: regatta.getString('timezone'),
      format: regatta.getString('format'),
      status: regatta.getString('status'),
    },
    teams: teams,
    schedule: schedule,
  };
  if (link.getBool('can_check_load')) out.loadItems = loadItems(app, regatta.id);
  return out;
}

function loadItems(app, regattaId) {
  const projectItem = loadItemProjector(app);
  return app
    .findRecordsByFilter('load_items', 'regatta = {:regatta}', '', 0, 0, { regatta: regattaId })
    .sort(
      (a, b) =>
        kindRank(a.getString('kind')) - kindRank(b.getString('kind')) ||
        a.getString('label').localeCompare(b.getString('label')),
    )
    .map(projectItem);
}

// -- check-off -----------------------------------------------------------------------------------

function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

/**
 * POST /api/regatta-ops/share/{token}/load-items/{id} with { loaded?: boolean, returned?: boolean,
 * by?: string }. Sets or clears loaded_at / returned_at (loaded_by / returned_by stay empty; the
 * typed name goes to loaded_by_name / returned_by_name) and logs the change. Ticking an item that
 * is already ticked keeps the first time and name. Returns { item } in the GET's load item shape.
 */
function checkOff(app, link, itemId, body) {
  if (!link.getBool('can_check_load')) {
    throw new ForbiddenError('This link cannot check off the load list.');
  }
  const item = ID_RE.test(String(itemId || '')) ? findOrNull(app, 'load_items', itemId) : null;
  if (!item || item.getString('regatta') !== link.getString('regatta')) {
    throw new NotFoundError('This regatta has no such load list item.');
  }
  const input = body && typeof body === 'object' ? body : {};
  const loaded = input.loaded;
  const returned = input.returned;
  const valid = (v) => v === undefined || v === null || typeof v === 'boolean';
  if (
    !valid(loaded) ||
    !valid(returned) ||
    (typeof loaded !== 'boolean' && typeof returned !== 'boolean')
  ) {
    throw new BadRequestError('Send loaded or returned as true or false.');
  }
  const by = cleanName(input.by);
  const now = new Date().toISOString();

  let saved = item;
  app.runInTransaction((txApp) => {
    const record = txApp.findRecordById('load_items', item.id);
    const before = activity.snapshot(record);
    const apply = (flag, prefix) => {
      if (typeof flag !== 'boolean') return;
      const at = record.getString(prefix + '_at');
      if (flag && !at) {
        record.set(prefix + '_at', now);
        record.set(prefix + '_by', '');
        record.set(prefix + '_by_name', by);
      } else if (!flag && at) {
        record.set(prefix + '_at', '');
        record.set(prefix + '_by', '');
        record.set(prefix + '_by_name', '');
      }
    };
    apply(loaded, 'loaded');
    apply(returned, 'returned');
    const after = activity.snapshot(record);
    const described = activity.describe(txApp, 'load_items', 'update', before, after);
    if (!described) return;
    txApp.save(record);
    activity.write(txApp, {
      regatta: described.regatta,
      team: described.team,
      actor: '',
      action: 'update',
      targetType: 'load_items',
      targetId: record.id,
      summary: described.summary + ' (via share link' + (by ? ', ' + by : '') + ')',
      diff: described.diff,
    });
    saved = record;
  });
  return { item: loadItemProjector(app)(findOrNull(app, 'load_items', saved.id) || saved) };
}

module.exports = { newToken, limit, prune, resolve, project, checkOff, cleanName, TOKEN_RE };
