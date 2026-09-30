// @-mentions in comments (PLAN.md §4.6). The same rules as the server
// (backend/pb_hooks/srt/mentions.js), so demo mode resolves mentions the way PocketBase does and
// the comment thread highlights exactly what the server matched:
//
// A mention is "@" at the start of the text or after a non-word character, followed by one of
//   - a user's full name ("@Dana Whitcombe"), any case, longest match first;
//   - the local part of a user's email ("@coach.girls");
//   - a first name that exactly one user has ("@Dana").
// The match must end at the end of the text or before a non-word character, so "@Dana" does not
// match inside "@Danaher", and "a@b.org" is not a mention. Runs of whitespace inside a name match
// one space ("@Dana  Whitcombe").

export interface MentionUser {
  id: string;
  name: string;
  email?: string;
}

export interface MentionMatch {
  /** Index of the "@". */
  start: number;
  /** Index just past the matched name. */
  end: number;
  userId: string;
}

const WORD = /[A-Za-z0-9_À-ɏ]/;

function isWord(ch: string | undefined): boolean {
  return !!ch && WORD.test(ch);
}

function norm(s: string | undefined): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

interface Candidate {
  key: string;
  id: string;
}

function candidatesFor(users: readonly MentionUser[]): Candidate[] {
  const out: Candidate[] = [];
  const firstNames = new Map<string, string[]>();
  for (const u of users) {
    const name = norm(u.name);
    if (name) {
      out.push({ key: name, id: u.id });
      const first = name.split(' ')[0]!;
      if (first && first !== name && first.length >= 2) {
        firstNames.set(first, [...(firstNames.get(first) ?? []), u.id]);
      }
    }
    const email = String(u.email ?? '').toLowerCase();
    const at = email.lastIndexOf('@');
    if (at > 0) out.push({ key: email.slice(0, at), id: u.id });
  }
  for (const [first, ids] of firstNames) {
    if (ids.length === 1) out.push({ key: first, id: ids[0]! });
  }
  return out.sort((a, b) => b.key.length - a.key.length);
}

/** Length of `key` matched at `from` in `text` (a space in the key matches any whitespace run). */
function matchAt(text: string, from: number, key: string): number {
  let i = from;
  for (let k = 0; k < key.length; k++) {
    const want = key[k]!;
    if (want === ' ') {
      if (!/\s/.test(text[i] ?? '')) return -1;
      while (/\s/.test(text[i] ?? '')) i++;
      continue;
    }
    const got = text[i];
    if (got === undefined || got.toLowerCase() !== want) return -1;
    i++;
  }
  return isWord(text[i]) ? -1 : i - from;
}

/** Every mention in `text`, in order, with its position. */
export function findMentions(text: string, users: readonly MentionUser[]): MentionMatch[] {
  if (!text.includes('@') || users.length === 0) return [];
  const candidates = candidatesFor(users);
  const out: MentionMatch[] = [];
  for (let i = text.indexOf('@'); i !== -1; i = text.indexOf('@', i + 1)) {
    if (i > 0 && isWord(text[i - 1])) continue;
    for (const c of candidates) {
      const len = matchAt(text, i + 1, c.key);
      if (len > 0) {
        out.push({ start: i, end: i + 1 + len, userId: c.id });
        break;
      }
    }
  }
  return out;
}

/** The ids of the users mentioned in `text`, in order of first mention, without repeats. */
export function parseMentions(text: string, users: readonly MentionUser[]): string[] {
  const ids: string[] = [];
  for (const m of findMentions(text, users)) if (!ids.includes(m.userId)) ids.push(m.userId);
  return ids;
}
