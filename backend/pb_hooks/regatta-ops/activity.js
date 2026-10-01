// Activity log sentences (PLAN.md §8.1 activity_log, §8.3).
//
// describe() turns a create, update, or delete into { summary, diff, regatta, team }. The summary
// is a sentence without the actor and without a final period, so the UI can render
// "<actor name> <summary>": "moved entry Girls V4+ to Event 14". Several changes in one update
// are joined with "; ". Returns null when nothing worth logging changed. `team` is the team whose
// data changed (entries, seats, availability, share links), '' otherwise.
//
// handle() also hands entry and seat changes to regatta-ops/notify.js, which emails the team's
// coaches when someone from another team made the change.

const time = require(`${__hooks}/regatta-ops/time.js`);

const LOGGED = [
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
];

// Never part of a diff: bookkeeping, and packer output that changes on every pack.
const IGNORED = [
  'id',
  'created',
  'updated',
  'collectionId',
  'collectionName',
  'expand',
  'created_by',
  'updated_by',
];
const QUIET = {
  // A published snapshot is the whole lineup; the summary says "published" instead.
  regatta_teams: ['published_snapshot'],
  entries: ['hot_seat_fingerprint'],
  load_placements: ['reasons'],
  load_items: ['loaded_by', 'returned_by', 'loaded_by_name', 'returned_by_name'],
  // The token is a secret: activity rows are readable by every signed-in user, share links are not.
  share_links: ['token'],
};

const STATUS_WORDS = {
  in_service: 'in service',
  limited: 'limited',
  out_of_service: 'out of service',
  retired: 'retired',
};

/** Record → plain object with json fields parsed (PocketBase's public export). */
function snapshot(record) {
  return record ? JSON.parse(JSON.stringify(record)) : null;
}

function isEmpty(v) {
  if (v === '' || v === null || v === undefined || v === false || v === 0) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function same(a, b) {
  return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
}

function computeDiff(collection, action, before, after) {
  const skip = IGNORED.concat(QUIET[collection] || []);
  const keys = {};
  Object.keys(before || {}).forEach((k) => (keys[k] = true));
  Object.keys(after || {}).forEach((k) => (keys[k] = true));
  const diff = {};
  Object.keys(keys).forEach((k) => {
    if (skip.indexOf(k) !== -1) return;
    const from = before ? before[k] : null;
    const to = after ? after[k] : null;
    if (action === 'create') {
      if (!isEmpty(to)) diff[k] = { from: null, to: to };
    } else if (action === 'delete') {
      if (!isEmpty(from)) diff[k] = { from: from, to: null };
    } else if (!same(from, to)) {
      diff[k] = { from: from === undefined ? null : from, to: to === undefined ? null : to };
    }
  });
  return diff;
}

// -- lookups -----------------------------------------------------------------------------------

function finder(app) {
  const cache = {};
  return function find(collection, id) {
    if (!id) return null;
    const key = collection + ':' + id;
    if (!(key in cache)) {
      try {
        cache[key] = snapshot(app.findRecordById(collection, id));
      } catch (_) {
        cache[key] = null;
      }
    }
    return cache[key];
  };
}

function words(field) {
  return String(field).replace(/_/g, ' ');
}

function teamShort(find, teamId) {
  const t = find('teams', teamId);
  return t ? t.short_name || t.name : '';
}

/** "Boys V4+": team short name and the entry's label (or boat class). */
function entryTitle(find, entry) {
  if (!entry) return 'an entry';
  const label = entry.label || entry.boat_class || 'entry';
  const team = teamShort(find, entry.team);
  if (!team || label.toLowerCase().indexOf(team.toLowerCase()) === 0) return label;
  return team + ' ' + label;
}

/** "Event 14", or the event's name when it has no number. */
function eventLabel(ev) {
  if (!ev) return 'an event';
  return ev.event_number ? 'Event ' + ev.event_number : ev.name || 'an event';
}

/** "Event 14, Men's Junior 4+". */
function eventTitle(ev) {
  if (!ev) return 'an event';
  if (ev.event_number && ev.name) return 'Event ' + ev.event_number + ', ' + ev.name;
  return eventLabel(ev);
}

function athleteName(a) {
  if (!a) return 'an athlete';
  const first = (a.preferred_name || '').trim() || a.first_name || '';
  return (first + ' ' + (a.last_name || '')).trim() || 'an athlete';
}

function shellName(s) {
  if (!s) return 'a shell';
  return (s.nickname || '').trim() || s.name || 'a shell';
}

function seatWord(seat) {
  return seat === 'cox' ? 'cox' : 'seat ' + seat;
}

function changedKeys(before, after, collection) {
  const diff = computeDiff(collection, 'update', before, after);
  return Object.keys(diff);
}

function editedClause(noun, fields) {
  return 'edited ' + noun + ' (' + fields.map(words).join(', ') + ')';
}

// -- per collection ----------------------------------------------------------------------------

function entries(find, action, before, after) {
  const rec = after || before;
  const name = entryTitle(find, rec);
  const regatta = rec.regatta;
  const team = rec.team;
  if (action === 'create') {
    const ev = find('events', rec.event);
    return { regatta, team, summary: 'added entry ' + name + (ev ? ' in ' + eventLabel(ev) : '') };
  }
  if (action === 'delete') {
    const ev = find('events', rec.event);
    return {
      regatta,
      team,
      summary: 'deleted entry ' + name + (ev ? ' from ' + eventLabel(ev) : ''),
    };
  }
  const changed = changedKeys(before, after, 'entries');
  const has = (k) => changed.indexOf(k) !== -1;
  const handled = ['boat_class'];
  const clauses = [];
  if (has('label')) {
    clauses.push('renamed entry ' + entryTitle(find, before) + ' to ' + name);
    handled.push('label');
  }
  if (has('team')) {
    const team = find('teams', after.team);
    clauses.push('moved entry ' + name + ' to ' + (team ? team.name : 'another team'));
    handled.push('team');
  }
  if (has('event')) {
    clauses.push(
      after.event
        ? 'moved entry ' + name + ' to ' + eventLabel(find('events', after.event))
        : 'took entry ' + name + ' out of ' + eventLabel(find('events', before.event)),
    );
    handled.push('event');
  } else if (has('boat_class')) {
    clauses.push('changed the boat class of ' + name + ' to ' + after.boat_class);
  }
  if (has('shell')) {
    clauses.push(
      after.shell
        ? 'set the shell of ' + name + ' to ' + shellName(find('shells', after.shell))
        : 'cleared the shell of ' + name,
    );
    handled.push('shell');
  }
  if (has('oar_set')) {
    const oars = find('oar_sets', after.oar_set);
    clauses.push(
      after.oar_set
        ? 'set the oars of ' + name + ' to ' + (oars ? oars.name : 'another set')
        : 'cleared the oars of ' + name,
    );
    handled.push('oar_set');
  }
  if (has('status')) {
    clauses.push('marked entry ' + name + ' ' + after.status);
    handled.push('status');
  }
  if (has('hot_seat_ack_by')) {
    // Cleared by the entries hook because the shell or event changed: already said above.
    if (after.hot_seat_ack_by) clauses.push('acknowledged the hot seat for ' + name);
    else if (!has('shell') && !has('event')) clauses.push('reopened the hot seat for ' + name);
    handled.push('hot_seat_ack_by');
    if (has('hot_seat_plan')) handled.push('hot_seat_plan');
  }
  if (has('hot_seat_plan') && handled.indexOf('hot_seat_plan') === -1) {
    clauses.push('edited the hot seat plan for ' + name);
    handled.push('hot_seat_plan');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause('entry ' + name, rest));
  return clauses.length ? { regatta, team, summary: clauses.join('; ') } : null;
}

function entrySeats(find, action, before, after) {
  const rec = after || before;
  const entry = find('entries', rec.entry);
  const ename = entryTitle(find, entry);
  const regatta = entry ? entry.regatta : '';
  const team = entry ? entry.team : '';
  const who = (id) => athleteName(find('athletes', id));
  if (action === 'create') {
    return {
      regatta,
      team,
      summary: rec.athlete
        ? 'set ' + seatWord(rec.seat) + ' of ' + ename + ' to ' + who(rec.athlete)
        : 'added ' + seatWord(rec.seat) + ' to ' + ename,
    };
  }
  if (action === 'delete') {
    return {
      regatta,
      team,
      summary: rec.athlete
        ? 'removed ' + who(rec.athlete) + ' from ' + seatWord(rec.seat) + ' of ' + ename
        : 'removed ' + seatWord(rec.seat) + ' of ' + ename,
    };
  }
  const changed = changedKeys(before, after, 'entry_seats');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  if (has('athlete')) {
    clauses.push(
      after.athlete
        ? 'set ' + seatWord(after.seat) + ' of ' + ename + ' to ' + who(after.athlete)
        : 'cleared ' +
            seatWord(after.seat) +
            ' of ' +
            ename +
            (before.athlete ? ' (was ' + who(before.athlete) + ')' : ''),
    );
  } else if (has('seat') || has('entry')) {
    clauses.push(
      'moved ' +
        (after.athlete ? who(after.athlete) : 'an empty seat') +
        ' to ' +
        seatWord(after.seat) +
        ' of ' +
        ename,
    );
  }
  if (has('note')) clauses.push('edited the note on ' + seatWord(after.seat) + ' of ' + ename);
  return clauses.length ? { regatta, team, summary: clauses.join('; ') } : null;
}

function events(find, action, before, after) {
  const rec = after || before;
  const regatta = rec.regatta;
  const logistics = rec.kind === 'logistics';
  if (action === 'create') {
    return {
      regatta,
      summary: logistics ? 'added logistics item ' + rec.name : 'added ' + eventTitle(rec),
    };
  }
  if (action === 'delete') {
    return {
      regatta,
      summary: logistics ? 'deleted logistics item ' + rec.name : 'deleted ' + eventTitle(rec),
    };
  }
  const changed = changedKeys(before, after, 'events');
  const has = (k) => changed.indexOf(k) !== -1;
  const handled = [];
  const clauses = [];
  let label = eventLabel(after);
  if (has('event_number') || has('name')) {
    clauses.push('renamed ' + eventTitle(before) + ' to ' + eventTitle(after));
    handled.push('event_number', 'name');
  }
  if (has('scheduled_at')) {
    const reg = find('regattas', regatta);
    const local = time.zoned(after.scheduled_at, (reg && reg.timezone) || 'America/Los_Angeles');
    if (!local) clauses.push('cleared the time of ' + label);
    else if (has('day')) {
      clauses.push('moved ' + label + ' to ' + time.dayWords(after.day) + ' at ' + local.clock);
    } else clauses.push('moved ' + label + ' to ' + local.clock);
    handled.push('scheduled_at', 'day');
  } else if (has('day')) {
    clauses.push('moved ' + label + ' to ' + time.dayWords(after.day));
    handled.push('day');
  }
  if (has('boat_class')) {
    clauses.push(
      after.boat_class
        ? 'changed the boat class of ' + label + ' to ' + after.boat_class
        : 'cleared the boat class of ' + label,
    );
    handled.push('boat_class');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause(label, rest));
  return clauses.length ? { regatta, summary: clauses.join('; ') } : null;
}

function availability(find, action, before, after) {
  const rec = after || before;
  const athlete = find('athletes', rec.athlete);
  const who = athleteName(athlete);
  const regatta = rec.regatta;
  const team = athlete ? athlete.team : '';
  const statusClause = (status) =>
    status === 'unavailable'
      ? 'marked ' + who + ' unavailable'
      : status === 'maybe'
        ? 'marked ' + who + ' as maybe'
        : 'marked ' + who + ' available';
  if (action === 'create') return { regatta, team, summary: statusClause(rec.status) };
  // No record means available (§8.1).
  if (action === 'delete') return { regatta, team, summary: 'marked ' + who + ' available' };
  const changed = changedKeys(before, after, 'availability');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  if (has('status')) clauses.push(statusClause(after.status));
  if (has('days')) clauses.push('changed which days ' + who + ' is coming');
  if (has('reason') && !has('status')) clauses.push('edited the availability note for ' + who);
  return clauses.length ? { regatta, team, summary: clauses.join('; ') } : null;
}

function loadPlacements(find, action, before, after) {
  const rec = after || before;
  const plan = find('load_plans', rec.load_plan);
  const regatta = plan ? plan.regatta : '';
  const shell = shellName(find('shells', rec.shell));
  const where = (placement) => {
    const shelf = find('trailer_shelves', placement.shelf);
    const trailer = find('trailers', (shelf && shelf.trailer) || (plan && plan.trailer));
    const trailerName = trailer ? 'the ' + trailer.name : 'the trailer';
    return shelf && shelf.label ? trailerName + ', ' + shelf.label : trailerName;
  };
  const trailerOnly = (placement) => {
    const shelf = find('trailer_shelves', placement.shelf);
    const trailer = find('trailers', (shelf && shelf.trailer) || (plan && plan.trailer));
    return trailer ? 'the ' + trailer.name : 'the trailer';
  };
  if (action === 'create') return { regatta, summary: 'placed ' + shell + ' on ' + where(rec) };
  if (action === 'delete')
    return { regatta, summary: 'took ' + shell + ' off ' + trailerOnly(rec) };
  const changed = changedKeys(before, after, 'load_placements');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  const handled = ['lane', 'offset_cm'];
  if (has('shelf')) {
    clauses.push('moved ' + shell + ' to ' + where(after));
    handled.push('shelf');
  } else if (has('lane')) {
    const shelf = find('trailer_shelves', after.shelf);
    clauses.push(
      'moved ' +
        shell +
        ' to lane ' +
        (Number(after.lane) + 1) +
        (shelf && shelf.label ? ' of ' + shelf.label : ''),
    );
  } else if (has('offset_cm')) {
    const delta = Number(after.offset_cm) - Number(before.offset_cm);
    clauses.push(
      'slid ' +
        shell +
        ' ' +
        (delta < 0 ? 'forward ' : 'back ') +
        Math.abs(Math.round(delta)) +
        ' cm',
    );
  }
  if (has('bow_forward')) {
    clauses.push('turned ' + shell + (after.bow_forward ? ' bow forward' : ' stern forward'));
    handled.push('bow_forward');
  }
  if (has('locked')) {
    clauses.push(after.locked ? 'locked ' + shell + ' in place' : 'unlocked ' + shell);
    handled.push('locked');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause('the placement of ' + shell, rest));
  return clauses.length ? { regatta, summary: clauses.join('; ') } : null;
}

function loadItems(find, action, before, after) {
  const rec = after || before;
  const regatta = rec.regatta;
  const label = rec.label || 'an item';
  if (action === 'create') return { regatta, summary: 'added ' + label + ' to the load list' };
  if (action === 'delete') return { regatta, summary: 'removed ' + label + ' from the load list' };
  const changed = changedKeys(before, after, 'load_items');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  const handled = [];
  if (has('label')) {
    clauses.push('renamed load item ' + (before.label || 'an item') + ' to ' + label);
    handled.push('label');
  }
  if (has('loaded_at')) {
    clauses.push((after.loaded_at ? 'checked off ' : 'unchecked ') + label + ' as loaded');
    handled.push('loaded_at');
  }
  if (has('returned_at')) {
    clauses.push((after.returned_at ? 'checked off ' : 'unchecked ') + label + ' as returned');
    handled.push('returned_at');
  }
  if (has('container')) {
    clauses.push(
      after.container
        ? 'moved ' + label + ' to ' + after.container
        : 'cleared the container of ' + label,
    );
    handled.push('container');
  }
  if (has('quantity')) {
    clauses.push('changed the quantity of ' + label + ' to ' + after.quantity);
    handled.push('quantity');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause('load item ' + label, rest));
  return clauses.length ? { regatta, summary: clauses.join('; ') } : null;
}

function equipment(noun, nameOf) {
  return function (_find, action, before, after) {
    const rec = after || before;
    const name = nameOf(rec);
    if (action === 'create') return { regatta: '', summary: 'added ' + noun + ' ' + name };
    if (action === 'delete') return { regatta: '', summary: 'deleted ' + noun + ' ' + name };
    const changed = changedKeys(before, after, noun === 'shell' ? 'shells' : 'oar_sets');
    const has = (k) => changed.indexOf(k) !== -1;
    const clauses = [];
    const handled = [];
    if (has('name') || has('nickname')) {
      clauses.push('renamed ' + noun + ' ' + nameOf(before) + ' to ' + name);
      handled.push('name', 'nickname');
    }
    if (has('status')) {
      clauses.push('marked ' + noun + ' ' + name + ' ' + (STATUS_WORDS[rec.status] || rec.status));
      handled.push('status');
    }
    const rest = changed.filter((k) => handled.indexOf(k) === -1);
    if (rest.length) clauses.push(editedClause(noun + ' ' + name, rest));
    return clauses.length ? { regatta: '', summary: clauses.join('; ') } : null;
  };
}

const REGATTA_STATUS_WORDS = { planning: 'back to planning', final: 'final', archived: 'archived' };
const TIMING_WORDS = {
  launchLeadMin: 'launch lead',
  raceDurationMin: 'race duration',
  returnMin: 'return time',
  hotSeatMinGapMin: 'hot seat minimum',
  athleteMinGapMin: 'athlete minimum gap',
  rerigMin: 're-rig time',
};

function teams(_find, action, before, after) {
  const rec = after || before;
  const name = rec.name || 'a team';
  if (action === 'create') return { regatta: '', team: rec.id, summary: 'added team ' + name };
  if (action === 'delete') return { regatta: '', team: '', summary: 'deleted team ' + name };
  const changed = changedKeys(before, after, 'teams');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  const handled = [];
  if (has('name')) {
    clauses.push('renamed team ' + before.name + ' to ' + name);
    handled.push('name');
  }
  if (has('archived')) {
    clauses.push((after.archived ? 'archived team ' : 'restored team ') + name);
    handled.push('archived');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause('team ' + name, rest));
  return clauses.length ? { regatta: '', team: rec.id, summary: clauses.join('; ') } : null;
}

function athletes(find, action, before, after) {
  const rec = after || before;
  const who = athleteName(rec);
  const team = find('teams', rec.team);
  const teamName = team ? team.name : 'a team';
  const base = { regatta: '', team: rec.team || '' };
  if (action === 'create') {
    return Object.assign(base, { summary: 'added ' + who + ' to ' + teamName });
  }
  if (action === 'delete') {
    return Object.assign(base, { summary: 'removed ' + who + ' from ' + teamName });
  }
  const changed = changedKeys(before, after, 'athletes');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  const handled = [];
  if (has('team')) {
    clauses.push('moved ' + who + ' to ' + teamName);
    handled.push('team');
  }
  if (has('status')) {
    clauses.push('marked ' + who + ' ' + (after.status === 'inactive' ? 'inactive' : 'active'));
    handled.push('status');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause(who, rest));
  return clauses.length ? Object.assign(base, { summary: clauses.join('; ') }) : null;
}

function regattas(_find, action, before, after) {
  const rec = after || before;
  const name = rec.name || 'a regatta';
  // A deleted regatta takes its activity rows with it, so the delete row belongs to no regatta.
  if (action === 'create') return { regatta: rec.id, summary: 'created regatta ' + name };
  if (action === 'delete') return { regatta: '', summary: 'deleted regatta ' + name };
  const changed = changedKeys(before, after, 'regattas');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  const handled = [];
  if (has('name')) {
    clauses.push('renamed regatta ' + before.name + ' to ' + name);
    handled.push('name');
  }
  if (has('status')) {
    clauses.push('marked the regatta ' + (REGATTA_STATUS_WORDS[rec.status] || rec.status));
    handled.push('status');
  }
  if (has('settings')) {
    const was = before.settings || {};
    const now = after.settings || {};
    const keys = Object.keys(TIMING_WORDS).filter((k) => !same(was[k], now[k]));
    const parts = keys.map((k) => {
      const w = TIMING_WORDS[k];
      if (now[k] == null) return 'reset ' + w + ' to the club default';
      return w + ' ' + (was[k] == null ? 'default' : was[k]) + ' → ' + now[k] + ' min';
    });
    if (parts.length) clauses.push('changed timing (' + parts.join(', ') + ')');
    handled.push('settings');
  }
  const rest = changed.filter((k) => handled.indexOf(k) === -1);
  if (rest.length) clauses.push(editedClause('the regatta', rest));
  return clauses.length ? { regatta: rec.id, summary: clauses.join('; ') } : null;
}

function regattaTeams(find, action, before, after) {
  const rec = after || before;
  const teamRec = find('teams', rec.team);
  const teamName = teamRec ? teamRec.name : 'a team';
  const base = { regatta: rec.regatta, team: rec.team || '' };
  if (action === 'create')
    return Object.assign(base, { summary: 'added ' + teamName + ' to the regatta' });
  if (action === 'delete') {
    return Object.assign(base, { summary: 'removed ' + teamName + ' from the regatta' });
  }
  const changed = changedKeys(before, after, 'regatta_teams');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  if (has('published_at') && after.published_at) {
    clauses.push('published ' + ((teamRec && teamRec.short_name) || teamName) + ' lineups');
  }
  if (has('notes')) clauses.push('edited notes for ' + teamName);
  return clauses.length ? Object.assign(base, { summary: clauses.join('; ') }) : null;
}

function shareLinks(find, action, before, after) {
  const rec = after || before;
  const regatta = rec.regatta;
  const team = rec.team || '';
  const teamRec = find('teams', rec.team);
  const what = 'a share link for ' + (teamRec ? teamRec.name : 'the whole regatta');
  if (action === 'create') {
    return {
      regatta,
      team,
      summary: 'created ' + what + (rec.can_check_load ? ' that can check off the load list' : ''),
    };
  }
  if (action === 'delete') return { regatta, team, summary: 'deleted ' + what };
  const changed = changedKeys(before, after, 'share_links');
  const has = (k) => changed.indexOf(k) !== -1;
  const clauses = [];
  if (has('revoked_at')) clauses.push((after.revoked_at ? 'revoked ' : 'restored ') + what);
  if (has('can_check_load')) {
    clauses.push(
      after.can_check_load
        ? 'let ' + what + ' check off the load list'
        : 'stopped ' + what + ' from checking off the load list',
    );
  }
  return clauses.length ? { regatta, team, summary: clauses.join('; ') } : null;
}

const DESCRIBERS = {
  teams: teams,
  athletes: athletes,
  regattas: regattas,
  regatta_teams: regattaTeams,
  entries: entries,
  entry_seats: entrySeats,
  events: events,
  availability: availability,
  load_placements: loadPlacements,
  load_items: loadItems,
  shells: equipment('shell', shellName),
  oar_sets: equipment('oar set', (o) => (o && o.name) || 'an oar set'),
  share_links: shareLinks,
};

/**
 * @param app PocketBase app (the transactional one inside batch requests)
 * @param collection collection name
 * @param action 'create' | 'update' | 'delete'
 * @param before snapshot before the change (null on create)
 * @param after snapshot after the change (null on delete)
 */
function describe(app, collection, action, before, after) {
  const fn = DESCRIBERS[collection];
  if (!fn) return null;
  const result = fn(finder(app), action, before, after);
  if (!result || !result.summary) return null;
  const diff = computeDiff(collection, action, before, after);
  if (action === 'update' && Object.keys(diff).length === 0) return null;
  return {
    summary: result.summary,
    regatta: result.regatta || '',
    team: result.team || '',
    diff: diff,
  };
}

/** Writes one activity_log row. `actor` is a users id or '' (share-link check-offs). */
function write(app, opts) {
  const log = new Record(app.findCollectionByNameOrId('activity_log'));
  log.set('regatta', opts.regatta || '');
  log.set('team', opts.team || '');
  log.set('actor', opts.actor || '');
  log.set('action', opts.action);
  log.set('target_type', opts.targetType);
  log.set('target_id', opts.targetId);
  log.set('summary', String(opts.summary).slice(0, 1000));
  log.set('diff', opts.diff || {});
  app.save(log);
  return log;
}

/** The request hook body shared by create, update, and delete (see activity.pb.js). */
function handle(e, action) {
  // Superuser writes (the seed, the dashboard) are not attributed to a Regatta Ops user.
  if (e.hasSuperuserAuth() || !e.auth) {
    e.next();
    return;
  }
  const before = action === 'create' ? null : snapshot(e.record.original());
  e.next();
  try {
    const after = action === 'delete' ? null : snapshot(e.record);
    const collection = e.collection.name;
    const entry = describe(e.app, collection, action, before, after);
    if (!entry) return;
    const isUser = e.auth.collection().name === 'users';
    write(e.app, {
      regatta: entry.regatta,
      team: entry.team,
      actor: isUser ? e.auth.id : '',
      action: action,
      targetType: collection,
      targetId: (after || before).id,
      summary: entry.summary,
      diff: entry.diff,
    });
    if (isUser && (collection === 'entries' || collection === 'entry_seats')) {
      try {
        require(`${__hooks}/regatta-ops/notify.js`).entryChanged(e.app, {
          actor: e.auth,
          collection: collection,
          before: before,
          after: after,
          summary: entry.summary,
        });
      } catch (err) {
        e.app.logger().error('Regatta Ops change email queueing failed', 'error', String(err));
      }
    }
  } catch (err) {
    e.app.logger().error('Regatta Ops activity log write failed', 'error', String(err));
  }
}

module.exports = {
  LOGGED,
  describe,
  handle,
  write,
  snapshot,
  computeDiff,
  finder,
  entryTitle,
  eventLabel,
  eventTitle,
  athleteName,
  shellName,
};
