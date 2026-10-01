// @-mentions in comments (PLAN.md §4.6). Used by comments.pb.js.
//
// A mention is "@" at the start of the body or after a non-word character, followed by one of:
//   - a user's full name ("@Dana Whitcombe"), case-insensitive, longest match first;
//   - the local part of a user's email ("@coach.girls" for coach.girls@example.org);
//   - a first name that exactly one user has ("@Dana").
// The match must end at the end of the body or before a non-word character, so "@Dana" does not
// match inside "@Danaher". "a@b.org" is not a mention (a word character precedes the "@").

const activity = require(`${__hooks}/regatta-ops/activity.js`);
const mail = require(`${__hooks}/regatta-ops/mail.js`);

const WORD = /[A-Za-z0-9_À-ɏ]/;

function norm(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isWord(ch) {
  return !!ch && WORD.test(ch);
}

/**
 * @param body comment text
 * @param users [{ id, name, email }]
 * @returns ids of the mentioned users, in order of first mention, without repeats
 */
function parse(body, users) {
  const text = String(body || '');
  if (text.indexOf('@') === -1) return [];
  const candidates = [];
  const firstNames = {};
  users.forEach((u) => {
    const name = norm(u.name);
    if (name) {
      candidates.push({ key: name, id: u.id });
      const first = name.split(' ')[0];
      if (first && first !== name && first.length >= 2) {
        (firstNames[first] = firstNames[first] || []).push(u.id);
      }
    }
    const email = String(u.email || '').toLowerCase();
    const at = email.lastIndexOf('@');
    if (at > 0) candidates.push({ key: email.slice(0, at), id: u.id });
  });
  Object.keys(firstNames).forEach((first) => {
    if (firstNames[first].length === 1) candidates.push({ key: first, id: firstNames[first][0] });
  });
  candidates.sort((a, b) => b.key.length - a.key.length);

  const lower = text.toLowerCase().replace(/\s/g, ' ');
  const found = [];
  for (let i = lower.indexOf('@'); i !== -1; i = lower.indexOf('@', i + 1)) {
    if (i > 0 && isWord(lower.charAt(i - 1))) continue;
    // Collapse runs of spaces so "@Dana  Whitcombe" still matches.
    const rest = lower.slice(i + 1, i + 1 + 200).replace(/ +/g, ' ');
    for (let c = 0; c < candidates.length; c++) {
      const key = candidates[c].key;
      if (rest.indexOf(key) === 0 && !isWord(rest.charAt(key.length))) {
        if (found.indexOf(candidates[c].id) === -1) found.push(candidates[c].id);
        break;
      }
    }
  }
  return found;
}

/** Sets comment.mentions from its body (model hook; every write path). */
function stamp(app, comment) {
  const users = app.findAllRecords('users').map((u) => ({
    id: u.id,
    name: u.getString('name'),
    email: u.email(),
  }));
  comment.set('mentions', parse(comment.getString('body'), users));
}

function toArray(slice) {
  const out = [];
  if (!slice) return out;
  for (let i = 0; i < slice.length; i++) out.push(String(slice[i]));
  return out;
}

/**
 * What a comment is about, for the email: { regatta, short, phrase, path }.
 * "the entry Girls V4+ (Event 14)", "Event 14, Men's Junior 4+", "the load plan for the Boys trailer".
 */
function describeTarget(app, targetType, targetId) {
  const find = activity.finder(app);
  if (targetType === 'entry') {
    const entry = find('entries', targetId);
    if (entry) {
      const ev = find('events', entry.event);
      const title = activity.entryTitle(find, entry);
      return {
        regatta: find('regattas', entry.regatta),
        short: title,
        phrase: 'the entry ' + title + (ev ? ' (' + activity.eventLabel(ev) + ')' : ''),
        path:
          '/regattas/' +
          entry.regatta +
          '/lineups/' +
          entry.team +
          '?entry=' +
          encodeURIComponent(entry.id),
      };
    }
  } else if (targetType === 'event') {
    const ev = find('events', targetId);
    if (ev) {
      const logistics = ev.kind === 'logistics';
      return {
        regatta: find('regattas', ev.regatta),
        short: logistics ? ev.name : activity.eventLabel(ev),
        phrase: logistics ? 'the schedule item ' + ev.name : activity.eventTitle(ev),
        path: '/regattas/' + ev.regatta + '/schedule?event=' + encodeURIComponent(ev.id),
      };
    }
  } else if (targetType === 'load_plan') {
    const plan = find('load_plans', targetId);
    if (plan) {
      const trailer = find('trailers', plan.trailer);
      const name = trailer ? trailer.name : 'trailer';
      return {
        regatta: find('regattas', plan.regatta),
        short: 'the ' + name + ' load plan',
        phrase: 'the load plan for the ' + name,
        path: '/regattas/' + plan.regatta + '/trailer/' + plan.trailer,
      };
    }
  }
  return { regatta: null, short: 'a comment', phrase: 'a comment in Regatta Ops', path: '/' };
}

/**
 * Emails users newly mentioned in `comment` (not in `previous`, not the author).
 * @returns the number of emails handed to the mailer
 */
function notify(app, comment, previous, author) {
  const ids = toArray(comment.getStringSlice('mentions')).filter(
    (id) => previous.indexOf(id) === -1 && id !== author.id,
  );
  if (!ids.length) return 0;
  const target = describeTarget(
    app,
    comment.getString('target_type'),
    comment.getString('target_id'),
  );
  const authorName = author.getString('name') || 'Someone';
  const quoted = comment
    .getString('body')
    .split('\n')
    .map((l) => '> ' + l)
    .join('\n');
  const text = [
    authorName +
      ' mentioned you in a comment on ' +
      target.phrase +
      (target.regatta ? ' at ' + target.regatta.name : '') +
      ':',
    '',
    quoted,
    '',
    'Open it in Regatta Ops: ' + mail.appUrl() + target.path,
    '',
    '--',
    'You get this email because someone mentioned you in a comment in Regatta Ops.',
  ].join('\n');
  let sent = 0;
  ids.forEach((id) => {
    let user = null;
    try {
      user = app.findRecordById('users', id);
    } catch (_) {
      return;
    }
    const to = mail.recipient(user);
    if (!to) return;
    const ok = mail.send(app, {
      to: to,
      subject: authorName + ' mentioned you on ' + target.short,
      text: text,
      kind: 'mention',
    });
    if (ok) sent++;
  });
  return sent;
}

module.exports = { parse, stamp, notify, toArray, describeTarget };
