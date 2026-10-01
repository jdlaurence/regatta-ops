// Email notifications (PLAN.md §4.6, Phase 3). Scheduled by notify.pb.js.
//
// Change emails. When a signed-in user changes an entry or one of its seats and that user is not a
// coach of the entry's team, the team's coaches hear about it. "Coach of a team" means a user with
// role coach or admin whose default_team is that team. Changes queue on a notification_log row per
// (entry, team) and go out from a once-a-minute job, so a batch (a seat swap is three writes)
// lands in one email. After an email, the next one for that entry waits 10 minutes; changes made
// in between are collected into it, never dropped. Opt out: users.preferences.emailOnChange = false.
//
// Daily digest. Once an hour the digest job looks for regattas that are not archived, have not
// ended, and start within the next 7 days (in the regatta's time zone), and whose local hour is
// REGATTA_OPS_DIGEST_HOUR (default 6). Each coach (role coach or admin with a default_team) whose team is
// in such a regatta gets one email: schedule changes, changes to their team's entries, and how many
// other teams' entries changed in the last 24 hours. Conflicts are computed by the domain engine in
// the browser (TypeScript, not available here), so the digest links to the conflicts panel instead
// of counting them. A notification_log row per (coach, regatta, local day) stops repeats.
// Opt out: users.preferences.emailDigest = false.

const WINDOW_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING = 50;
const MAX_LINES = 30;
const DIGEST_KEEP_MS = 14 * DAY_MS;

const activity = require(`${__hooks}/regatta-ops/activity.js`);
const mail = require(`${__hooks}/regatta-ops/mail.js`);
const time = require(`${__hooks}/regatta-ops/time.js`);

/** ms → PocketBase date text ('2026-05-16 15:00:00.000Z'), which sorts and compares as text. */
function pbDate(ms) {
  return new Date(ms).toISOString().replace('T', ' ');
}

/** PocketBase date text → ms (NaN when empty). */
function msOf(value) {
  return value ? Date.parse(String(value).replace(' ', 'T')) : NaN;
}

function readJson(record, field, fallback) {
  try {
    const parsed = JSON.parse(record.getString(field) || 'null');
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (_) {
    return fallback;
  }
}

function findOrNull(app, collection, id) {
  if (!id) return null;
  try {
    return app.findRecordById(collection, id);
  } catch (_) {
    return null;
  }
}

function findByKey(app, key) {
  try {
    return app.findFirstRecordByData('notification_log', 'key', key);
  } catch (_) {
    return null;
  }
}

function unique(values) {
  const out = [];
  values.forEach((v) => {
    if (out.indexOf(v) === -1) out.push(v);
  });
  return out;
}

/** "Ada", "Ada and Cy", "Ada and 2 others". */
function namesPhrase(names) {
  if (names.length <= 1) return names[0] || 'Someone';
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names[0] + ' and ' + (names.length - 1) + ' others';
}

/** Coaches of a team: role coach or admin, default_team = team. */
function coachesOf(app, teamId) {
  return app.findRecordsByFilter(
    'users',
    "default_team = {:team} && (role = 'coach' || role = 'admin')",
    'name',
    0,
    0,
    { team: teamId },
  );
}

// -- change emails -------------------------------------------------------------------------------

/**
 * Queues a change for the coaches of the entry's team (called by regatta-ops/activity.js after it logs an
 * entry or seat change by a signed-in user). Runs inside the request, and inside the transaction
 * for batch requests, so a rolled-back batch queues nothing.
 *
 * @param ctx { actor: users Record, collection: 'entries' | 'entry_seats', before, after, summary }
 */
function entryChanged(app, ctx) {
  const find = activity.finder(app);
  let entry = null;
  let previous = null;
  if (ctx.collection === 'entries') {
    entry = ctx.after || ctx.before;
    previous = ctx.before;
  } else {
    const seat = ctx.after || ctx.before;
    entry = find('entries', seat && seat.entry);
  }
  if (!entry) return;
  const actorTeam = ctx.actor.getString('default_team');
  // An entry moved to another team: both teams hear about it.
  const teams = unique([previous ? previous.team : '', entry.team]).filter(
    (t) => t && t !== actorTeam,
  );
  if (!teams.length) return;

  const ev = find('events', entry.event);
  const title = activity.entryTitle(find, entry) + (ev ? ' (' + activity.eventLabel(ev) + ')' : '');
  const now = Date.now();
  const item = {
    actor: ctx.actor.id,
    actorName: ctx.actor.getString('name') || 'Someone',
    summary: ctx.summary,
    at: new Date(now).toISOString(),
  };
  // Read-modify-write in a transaction (writes are serialized), so a flush running at the same
  // moment cannot lose or repeat a line. Inside a batch this joins the batch's transaction.
  app.runInTransaction((txApp) => {
    const collection = txApp.findCollectionByNameOrId('notification_log');
    teams.forEach((team) => {
      const key = 'entry:' + entry.id + ':' + team;
      let row = findByKey(txApp, key);
      if (!row) {
        row = new Record(collection);
        row.set('key', key);
        row.set('kind', 'entry_change');
        row.set('target_id', entry.id);
        row.set('team', team);
      }
      row.set('regatta', entry.regatta);
      row.set('title', title.slice(0, 300));
      const pending = readJson(row, 'pending', []);
      if (!pending.length) {
        const last = msOf(row.getString('last_sent_at'));
        row.set('due_at', pbDate(isNaN(last) ? now : Math.max(now, last + WINDOW_MS)));
      }
      pending.push(item);
      row.set('pending', pending.slice(-MAX_PENDING));
      txApp.save(row);
    });
  });
}

function changeEmail(row, pending, regatta, team) {
  const tz = regatta.getString('timezone') || 'America/Los_Angeles';
  const title = row.getString('title');
  const names = unique(pending.map((p) => p.actorName || 'Someone'));
  const who = namesPhrase(names);
  const lines = pending.map((p) => {
    const local = time.zoned(p.at, tz);
    return (
      '- ' +
      (names.length > 1 ? (p.actorName || 'Someone') + ': ' : '') +
      p.summary +
      (local ? ' (' + local.clock + ')' : '')
    );
  });
  const url =
    mail.appUrl() +
    '/regattas/' +
    regatta.id +
    '/lineups/' +
    team.id +
    '?entry=' +
    row.getString('target_id');
  return {
    subject: who + ' changed ' + title,
    text: [
      who + ' changed ' + title + ' at ' + regatta.getString('name') + ':',
      '',
      lines.join('\n'),
      '',
      'Open the lineups: ' + url,
      '',
      '--',
      'You get this email because you coach ' +
        team.getString('name') +
        ' and someone from another team changed one of its entries. To stop these emails, turn off change emails in Settings.',
    ].join('\n'),
  };
}

/** Sends every queued change email that is due at `nowMs`. Returns { sent: <emails sent> }. */
function flushEntryChanges(app, nowMs) {
  const rows = app.findRecordsByFilter(
    'notification_log',
    "kind = 'entry_change' && due_at != '' && due_at <= {:now}",
    'due_at',
    200,
    0,
    { now: pbDate(nowMs) },
  );
  const nowText = pbDate(nowMs);
  let sent = 0;
  rows.forEach((candidate) => {
    // Claim the row in a transaction: the minute job and the jobs route may run at once, and
    // only the one that finds it still due sends. Mail goes out after the commit.
    let pending = [];
    let row = null;
    app.runInTransaction((txApp) => {
      const fresh = findOrNull(txApp, 'notification_log', candidate.id);
      const due = fresh ? fresh.getString('due_at') : '';
      if (!due || due > nowText) return;
      pending = readJson(fresh, 'pending', []);
      fresh.set('pending', []);
      fresh.set('due_at', '');
      if (pending.length) fresh.set('last_sent_at', nowText);
      txApp.save(fresh);
      row = fresh;
    });
    if (!row || !pending.length) return;
    const regatta = findOrNull(app, 'regattas', row.getString('regatta'));
    const team = findOrNull(app, 'teams', row.getString('team'));
    if (!regatta || !team) return;
    const email = changeEmail(row, pending, regatta, team);
    coachesOf(app, team.id).forEach((coach) => {
      if (mail.preferences(coach).emailOnChange === false) return;
      // Someone who has since become the team's coach does not hear about their own edits.
      if (pending.every((p) => p.actor === coach.id)) return;
      const to = mail.recipient(coach);
      if (!to) return;
      if (mail.send(app, { to, subject: email.subject, text: email.text, kind: 'entry_change' })) {
        sent++;
      }
    });
  });
  return { sent: sent };
}

// -- daily digest --------------------------------------------------------------------------------

function digestHour() {
  const hour = parseInt(($os.getenv('REGATTA_OPS_DIGEST_HOUR') || '').trim(), 10);
  return isNaN(hour) || hour < 0 || hour > 23 ? 6 : hour;
}

function dayMs(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

function addDays(day, n) {
  return new Date(dayMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** "Sat, May 16 (in 4 days)", "Sat, May 16 to Sun, May 17 (today)". */
function datesPhrase(start, end, today) {
  const span = time.dayWords(start) + (end && end !== start ? ' to ' + time.dayWords(end) : '');
  const days = Math.round((dayMs(start) - dayMs(today)) / DAY_MS);
  let when = '';
  if (days > 1) when = 'in ' + days + ' days';
  else if (days === 1) when = 'tomorrow';
  else if (days === 0) when = 'today';
  else when = 'under way';
  return span + ' (' + when + ')';
}

function section(d, team, rows, names) {
  const regatta = d.regatta;
  const tz = d.tz;
  const line = (r) => {
    const local = time.zoned(r.created, tz);
    const actor = names(r.actor);
    return (
      '- ' +
      actor +
      ' ' +
      r.summary +
      (local ? ' (' + time.dayWords(local.day) + ', ' + local.clock + ')' : '')
    );
  };
  const list = (items) => {
    const shown = items.slice(0, MAX_LINES).map(line);
    if (items.length > MAX_LINES) shown.push('- and ' + (items.length - MAX_LINES) + ' more');
    return shown.join('\n');
  };
  const isEntry = (r) => r.target_type === 'entries' || r.target_type === 'entry_seats';
  const schedule = rows.filter((r) => r.target_type === 'events');
  const mine = rows.filter((r) => isEntry(r) && r.team === team.id);
  const others = rows.filter((r) => isEntry(r) && r.team !== team.id).length;
  if (!schedule.length && !mine.length && !others) return null;

  const base = mail.appUrl() + '/regattas/' + regatta.id;
  const parts = [
    regatta.getString('name') +
      ', ' +
      datesPhrase(regatta.getString('start_date'), regatta.getString('end_date'), d.today),
    '',
  ];
  if (schedule.length) parts.push('Schedule changes', list(schedule), '');
  parts.push(team.getString('name') + ' entries');
  parts.push(mine.length ? list(mine) : 'No changes to ' + team.getString('name') + ' entries.');
  parts.push('');
  if (others) {
    parts.push(
      others === 1
        ? "1 change to other teams' entries."
        : others + " changes to other teams' entries.",
      '',
    );
  }
  parts.push(
    'Conflicts are worked out in the app, so this email does not list them. Open the conflicts panel for the current list: ' +
      base +
      '/schedule',
    'Lineups: ' + base + '/lineups/' + team.id,
  );
  return parts.join('\n');
}

/**
 * Sends the daily digest. With anyHour, every regatta in the window counts as due now (the jobs
 * route uses this); otherwise only those whose local hour is REGATTA_OPS_DIGEST_HOUR.
 * Returns { emails: [{ to, subject, regattas }] } for the emails handed to the mailer.
 */
function runDigest(app, nowMs, anyHour) {
  const result = { emails: [] };
  // Old digest bookkeeping is only needed for a day; keep two weeks.
  try {
    app
      .findRecordsByFilter(
        'notification_log',
        "kind = 'digest' && created < {:cutoff}",
        '',
        500,
        0,
        { cutoff: pbDate(nowMs - DIGEST_KEEP_MS) },
      )
      .forEach((r) => app.delete(r));
  } catch (err) {
    app.logger().warn('Regatta Ops: digest prune failed', 'error', String(err));
  }

  const hour = digestHour();
  const nowIso = new Date(nowMs).toISOString();
  const due = [];
  app
    .findRecordsByFilter('regattas', "status != 'archived'", 'start_date', 0, 0)
    .forEach((regatta) => {
      const tz = regatta.getString('timezone') || 'America/Los_Angeles';
      const local = time.zoned(nowIso, tz);
      if (!local) return;
      if (regatta.getString('end_date') < local.day) return;
      if (regatta.getString('start_date') > addDays(local.day, 7)) return;
      if (!anyHour && parseInt(local.clock, 10) !== hour) return;
      due.push({ regatta: regatta, tz: tz, today: local.day });
    });
  if (!due.length) return result;

  const activityCache = {};
  const activityFor = (regattaId) => {
    if (!activityCache[regattaId]) {
      activityCache[regattaId] = app
        .findRecordsByFilter(
          'activity_log',
          'regatta = {:regatta} && created >= {:since} && created <= {:now}',
          'created',
          2000,
          0,
          { regatta: regattaId, since: pbDate(nowMs - DAY_MS), now: pbDate(nowMs) },
        )
        .map((r) => ({
          target_type: r.getString('target_type'),
          team: r.getString('team'),
          actor: r.getString('actor'),
          summary: r.getString('summary'),
          created: r.getString('created'),
        }));
    }
    return activityCache[regattaId];
  };
  const nameCache = {};
  const names = (userId) => {
    if (!userId) return 'Someone';
    if (!(userId in nameCache)) {
      const u = findOrNull(app, 'users', userId);
      nameCache[userId] = (u && u.getString('name')) || 'Someone';
    }
    return nameCache[userId];
  };
  const participates = (regattaId, teamId) =>
    app.findRecordsByFilter('regatta_teams', 'regatta = {:regatta} && team = {:team}', '', 1, 0, {
      regatta: regattaId,
      team: teamId,
    }).length > 0 ||
    app.findRecordsByFilter('entries', 'regatta = {:regatta} && team = {:team}', '', 1, 0, {
      regatta: regattaId,
      team: teamId,
    }).length > 0;

  const logCollection = app.findCollectionByNameOrId('notification_log');
  app
    .findRecordsByFilter(
      'users',
      "default_team != '' && (role = 'coach' || role = 'admin')",
      'name',
      0,
      0,
    )
    .forEach((coach) => {
      if (mail.preferences(coach).emailDigest === false) return;
      const to = mail.recipient(coach);
      if (!to) return;
      const team = findOrNull(app, 'teams', coach.getString('default_team'));
      if (!team) return;
      const sections = [];
      const sent = [];
      due.forEach((d) => {
        const key = 'digest:' + coach.id + ':' + d.regatta.id + ':' + d.today;
        if (findByKey(app, key)) return;
        if (!participates(d.regatta.id, team.id)) return;
        const text = section(d, team, activityFor(d.regatta.id), names);
        if (!text) return;
        sections.push(text);
        sent.push({ key: key, regatta: d.regatta });
      });
      if (!sections.length) return;
      const subject =
        sent.length === 1
          ? 'Regatta Ops daily digest: ' + sent[0].regatta.getString('name')
          : 'Regatta Ops daily digest: ' + sent.length + ' regattas this week';
      const text = [
        'Changes in the last 24 hours, for ' + team.getString('name') + '.',
        '',
        sections.join('\n\n'),
        '',
        '--',
        'You get this digest during regatta week because you coach ' +
          team.getString('name') +
          '. To stop it, turn off the daily digest in Settings.',
      ].join('\n');
      if (!mail.send(app, { to, subject, text, kind: 'digest' })) return;
      sent.forEach((s) => {
        const row = new Record(logCollection);
        row.set('key', s.key);
        row.set('kind', 'digest');
        row.set('regatta', s.regatta.id);
        row.set('team', team.id);
        row.set('user', coach.id);
        row.set('last_sent_at', pbDate(nowMs));
        app.save(row);
      });
      result.emails.push({
        to: to.address,
        subject: subject,
        regattas: sent.map((s) => s.regatta.id),
      });
    });
  return result;
}

module.exports = { entryChanged, flushEntryChanges, runDigest, digestHour, WINDOW_MS };
