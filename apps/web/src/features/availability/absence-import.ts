// Import from the absence form. The boys' team collects absences with a Google Form; its response
// sheet has a timestamp, the athlete's name, and one column per regatta ("Yes, I can attend",
// "No", "Not sure", or blank). This module is the pure part: guess the name and regatta columns,
// read each answer as a status, match names to the roster (exact, then close spellings), keep
// each athlete's latest response, and plan the writes. The dialog (AbsenceImportDialog.tsx) lets
// the coach correct every guess.

import {
  athleteName,
  type Athlete,
  type Availability,
  type AvailabilityStatus,
} from '@regatta-ops/domain';
import type { BatchOp } from '@/data';
import { draftOf, planWrite, type AvailabilityDraft } from './availability-model';

/** The reason stored on records the import marks unavailable or maybe. */
export const ABSENCE_REASON = 'From absence form';

/** What an answer means for this regatta; 'keep' leaves the athlete as they are. */
export type AnswerChoice = AvailabilityStatus | 'keep';

export interface AbsenceTable {
  headers: string[];
  rows: string[][];
}

// ---------------------------------------------------------------------------
// Text

/** Lowercase letters, digits, and single spaces; accents and punctuation dropped. */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 1 for equal strings, falling toward 0 with each edit. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

// ---------------------------------------------------------------------------
// Columns

export interface NameColumns {
  /** The full name, or the first name when `lastName` is set. */
  name: number | null;
  lastName: number | null;
}

const FIRST_HEADERS = ['first name', 'first', 'given name', 'preferred name', 'first name only'];
const LAST_HEADERS = ['last name', 'last', 'surname', 'family name', 'last name only'];
const NOT_A_NAME =
  /\b(emails?|e mail|teams?|coach(es)?|parents?|guardians?|phones?|schools?|boats?|reasons?)\b/;

/** Which columns hold the athlete's name: one full-name column, or first and last. */
export function guessNameColumns(headers: readonly string[]): NameColumns {
  const folded = headers.map(foldText);
  const find = (test: (h: string) => boolean) => {
    const i = folded.findIndex(test);
    return i >= 0 ? i : null;
  };
  const first = find(
    (h) => FIRST_HEADERS.includes(h) || /^(athletes? |rowers? )?first name/.test(h),
  );
  const last = find(
    (h) => LAST_HEADERS.includes(h) || /^(athletes? |rowers? )?(last name|surname)/.test(h),
  );
  if (first !== null && last !== null) return { name: first, lastName: last };
  const full = find((h) => {
    if (NOT_A_NAME.test(h)) return false;
    // "Name (first and last)" is a full name; "First name" alone is not.
    const both = /\bfirst\b/.test(h) && /\blast\b/.test(h);
    if (!both && /\b(first|last)\b/.test(h)) return false;
    return /\bname\b/.test(h) || /^(athlete|rower|student|participant)$/.test(h);
  });
  if (full !== null) return { name: full, lastName: last };
  return { name: first, lastName: first !== null ? last : null };
}

/** The Google Forms "Timestamp" column, if any. */
export function timestampColumn(headers: readonly string[]): number | null {
  const i = headers.findIndex((h) =>
    /^(timestamp|submitted|submitted at|date submitted)$/.test(foldText(h)),
  );
  return i >= 0 ? i : null;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'attend',
  'be',
  'can',
  'for',
  'in',
  'is',
  'of',
  'on',
  'regatta',
  'the',
  'to',
  'will',
  'you',
  'your',
]);

/** A grid question exports as "Which regattas can you attend? [Head of the Lake]". */
function questionSubject(header: string): string {
  const m = header.match(/\[([^\]]+)\]\s*$/);
  return m ? m[1]! : header;
}

function contentWords(s: string): string[] {
  return foldText(s)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w));
}

function initials(s: string): string {
  return foldText(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
}

function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  return Math.min(a.length, b.length) >= 5 && similarity(a, b) >= 0.8;
}

/**
 * How well a column header names this regatta, from 0 to 1: the same name, the name inside a
 * longer header ("Head of the Lake 2026"), its initials ("HOTL"), or shared words, with filler
 * words ("the", "of", "regatta") ignored so "Tail of the Lake" is far from "Head of the Lake".
 */
export function regattaColumnScore(header: string, regattaName: string): number {
  const h = foldText(questionSubject(header));
  const r = foldText(regattaName);
  if (!h || !r) return 0;
  if (h === r) return 1;
  const hw = contentWords(questionSubject(header));
  const rw = contentWords(regattaName);
  if (rw.length > 0 && hw.join(' ') === rw.join(' ')) return 0.98;
  if (` ${h} `.includes(` ${r} `)) return 0.9;
  const compact = h.replace(/ /g, '');
  if (
    compact.length >= 3 &&
    (compact === initials(regattaName) || compact === rw.map((w) => w[0]).join(''))
  ) {
    return 0.85;
  }
  if (hw.length === 0 || rw.length === 0) return 0;
  const matched = rw.filter((w) => hw.some((x) => sameWord(w, x))).length;
  return ((2 * matched) / (hw.length + rw.length)) * 0.8;
}

/** The column with this regatta's answers: the best-named one scoring at least 0.5. */
export function guessRegattaColumn(
  headers: readonly string[],
  regattaName: string,
  exclude: readonly (number | null)[] = [],
): number | null {
  let best: { i: number; score: number } | null = null;
  headers.forEach((h, i) => {
    if (exclude.includes(i)) return;
    const score = regattaColumnScore(h, regattaName);
    if (score >= 0.5 && (!best || score > best.score)) best = { i, score };
  });
  return (best as { i: number } | null)?.i ?? null;
}

// ---------------------------------------------------------------------------
// Answers

const MAYBE =
  /\b(maybe|not sure|unsure|undecided|possibly|perhaps|tbd|tentative|dont know|do not know|might)\b|\?/;
const NO =
  /\b(no|nope|not attending|not going|not coming|cant|cannot|can not|unable|absent|out|unavailable|wont|will not|miss|missing|away)\b/;

function answerText(value: string): string {
  return value.toLowerCase().replace(/['’`]/g, '').replace(/\s+/g, ' ').trim();
}

/** Grouping key for an answer: case and spacing do not matter. */
export function answerKey(value: string): string {
  return answerText(value);
}

/** "No", "can't", "absent", "out" → unavailable; "maybe", "not sure" → maybe; blank → keep. */
export function guessAnswer(value: string): AnswerChoice {
  const t = answerText(value);
  if (!t) return 'keep';
  if (MAYBE.test(t)) return 'maybe';
  if (NO.test(t)) return 'unavailable';
  return 'available';
}

export interface AnswerGroup {
  key: string;
  /** The answer as first written; '' for rows with no answer. */
  label: string;
  count: number;
}

/** Each distinct answer in a column with how many rows gave it; no answer last. */
export function answerGroups(rows: readonly string[][], column: number): AnswerGroup[] {
  const groups = new Map<string, AnswerGroup>();
  for (const r of rows) {
    const raw = (r[column] ?? '').trim();
    const key = answerKey(raw);
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { key, label: raw, count: 1 });
  }
  return [...groups.values()].sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Names

export interface RowName {
  /** As written, for showing ("Test, Rowan"). */
  text: string;
  first: string;
  last: string;
}

/** A row's name from a full-name column ("Rowan Test", "Test, Rowan") or first and last. */
export function rowName(cells: readonly string[], cols: NameColumns): RowName | null {
  const a = cols.name === null ? '' : (cells[cols.name] ?? '').trim();
  const b = cols.lastName === null ? '' : (cells[cols.lastName] ?? '').trim();
  if (cols.lastName !== null) {
    if (!a && !b) return null;
    return { text: `${a} ${b}`.trim(), first: foldText(a), last: foldText(b) };
  }
  if (!a) return null;
  const comma = a.indexOf(',');
  if (comma >= 0) {
    return { text: a, first: foldText(a.slice(comma + 1)), last: foldText(a.slice(0, comma)) };
  }
  const words = foldText(a).split(' ').filter(Boolean);
  return {
    text: a,
    first: words.slice(0, -1).join(' ') || (words[0] ?? ''),
    last: words.length > 1 ? words[words.length - 1]! : '',
  };
}

export interface NameMatch {
  athleteId: string;
  /** 1 for the same name, lower for close spellings. */
  score: number;
}

/** Scores at or above this match without asking, when no one else scores close. */
export const AUTO_MATCH = 0.8;
/** Scores at or above this are offered as close matches. */
const SUGGEST = 0.5;
/** A runner-up this close makes the match ambiguous. */
const MARGIN = 0.06;

function firstScore(row: string, athlete: Athlete): number {
  const names = [athlete.firstName, athlete.preferredName ?? ''].map(foldText).filter(Boolean);
  let best = 0;
  for (const n of names) {
    if (n === row) return 1;
    const [short, long] = row.length < n.length ? [row, n] : [n, row];
    if (short.length >= 3 && long.startsWith(short)) best = Math.max(best, 0.9); // Sam, Samuel
    if (row.length === 1 && n.startsWith(row)) best = Math.max(best, 0.85); // "R Test"
    best = Math.max(best, similarity(row, n));
  }
  return best;
}

function lastScore(row: string, athlete: Athlete): number {
  const last = foldText(athlete.lastName);
  if (row === last) return 1;
  // Double and hyphenated names: "Garcia" for "Garcia Lopez".
  const words = last.split(' ');
  const rowWords = row.split(' ');
  if (words.includes(row) || rowWords.includes(last)) return 0.95;
  return similarity(row, last);
}

/** How well a written name fits an athlete, from 0 to 1. */
export function nameScore(name: RowName, athlete: Athlete): number {
  const first = foldText(athlete.firstName);
  const pref = foldText(athlete.preferredName ?? '');
  const last = foldText(athlete.lastName);
  const written = `${name.first} ${name.last}`.trim();
  const variants = [
    `${first} ${last}`,
    `${last} ${first}`,
    ...(pref ? [`${pref} ${last}`, `${last} ${pref}`] : []),
  ].map((v) => v.trim());
  if (variants.includes(written)) return 1;
  // One word only ("Rowan"): a first or last name, never enough to match on its own.
  if (!name.last) {
    const alone = name.first;
    const hit = [first, pref, last].filter(Boolean).some((n) => n === alone);
    return hit ? 0.7 : 0;
  }
  const structured = 0.55 * lastScore(name.last, athlete) + 0.45 * firstScore(name.first, athlete);
  const whole = Math.max(...variants.map((v) => similarity(written, v)));
  return Math.min(0.99, Math.max(structured, whole));
}

/**
 * The athlete a name belongs to, if one stands out (score at least 0.8 and nobody else within
 * 0.06), and the close candidates for a manual pick, best first.
 */
export function matchName(
  name: RowName,
  athletes: readonly Athlete[],
): { match: NameMatch | null; candidates: NameMatch[] } {
  const scored = athletes
    .map((a) => ({ athleteId: a.id, score: nameScore(name, a) }))
    .filter((m) => m.score >= SUGGEST)
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  const clear =
    !!best && best.score >= AUTO_MATCH && (!second || best.score - second.score >= MARGIN);
  return { match: clear ? best! : null, candidates: scored.slice(0, 5) };
}

// ---------------------------------------------------------------------------
// Rows

export interface AbsenceConfig {
  names: NameColumns;
  answerColumn: number;
  timestampColumn: number | null;
}

export interface AbsenceRow {
  /** Line in the file (the header is line 1). */
  line: number;
  name: RowName;
  /** The answer as written. */
  answer: string;
  answerKey: string;
  /** Milliseconds, for "latest response wins"; null when unreadable. */
  time: number | null;
  match: NameMatch | null;
  candidates: NameMatch[];
}

/** "10/3/2026 18:02:11" (Google Forms), "2026-10-03 18:02:11", or ISO; null otherwise. */
export function parseFormTimestamp(value: string): number | null {
  const s = value.trim();
  let m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i,
  );
  if (m) {
    let hour = Number(m[4] ?? 0);
    const pm = m[7]?.toLowerCase();
    if (pm === 'pm' && hour < 12) hour += 12;
    if (pm === 'am' && hour === 12) hour = 0;
    return Date.UTC(
      Number(m[3]),
      Number(m[1]) - 1,
      Number(m[2]),
      hour,
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    );
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    return Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    );
  }
  return null;
}

/** Every response with a name, matched against the roster. Rows with no name are left out. */
export function readAbsenceRows(
  table: AbsenceTable,
  config: AbsenceConfig,
  athletes: readonly Athlete[],
): AbsenceRow[] {
  const out: AbsenceRow[] = [];
  table.rows.forEach((cells, i) => {
    const name = rowName(cells, config.names);
    if (!name) return;
    const answer = (cells[config.answerColumn] ?? '').trim();
    const { match, candidates } = matchName(name, athletes);
    out.push({
      line: i + 2,
      name,
      answer,
      answerKey: answerKey(answer),
      time:
        config.timestampColumn === null
          ? null
          : parseFormTimestamp(cells[config.timestampColumn] ?? ''),
      match,
      candidates,
    });
  });
  return out;
}

/** A manual choice for a row: an athlete id, or 'skip'. */
export type RowPick = string;
export const SKIP = 'skip';

export interface ResolvedRow extends AbsenceRow {
  /** The athlete this row is for after manual picks; null when unmatched or skipped. */
  athleteId: string | null;
  /** The line of a later response by the same athlete, which is the one used. */
  supersededBy: number | null;
}

/**
 * Apply manual picks, then keep each athlete's latest response (by timestamp when every one of
 * theirs has one, else the lower row, as the form appends responses).
 */
export function resolveRows(
  rows: readonly AbsenceRow[],
  picks: Readonly<Record<number, RowPick>>,
): ResolvedRow[] {
  const resolved: ResolvedRow[] = rows.map((r) => {
    const pick = picks[r.line];
    const athleteId =
      pick === undefined ? (r.match?.athleteId ?? null) : pick === SKIP ? null : pick;
    return { ...r, athleteId, supersededBy: null };
  });
  const byAthlete = new Map<string, ResolvedRow[]>();
  for (const r of resolved) {
    if (!r.athleteId) continue;
    byAthlete.set(r.athleteId, [...(byAthlete.get(r.athleteId) ?? []), r]);
  }
  for (const list of byAthlete.values()) {
    if (list.length < 2) continue;
    const timed = list.every((r) => r.time !== null);
    const latest = list.reduce((a, b) => {
      if (timed && a.time !== b.time) return b.time! > a.time! ? b : a;
      return b.line > a.line ? b : a;
    });
    for (const r of list) if (r !== latest) r.supersededBy = latest.line;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Plan

export interface AbsenceChange {
  line: number;
  athleteId: string;
  before: AvailabilityDraft;
  after: AvailabilityDraft;
  op: BatchOp;
}

/**
 * The writes that apply the form: for each athlete's latest answer, set the regatta-wide status
 * when it differs from theirs now (per-day choices give way to it). Unavailable and maybe carry
 * the reason "From absence form". Athletes whose status already matches, answers read as
 * 'keep', and unmatched rows change nothing.
 */
export function planAbsenceImport(
  rows: readonly ResolvedRow[],
  choices: Readonly<Record<string, AnswerChoice>>,
  ctx: {
    regattaId: string;
    regattaDays: readonly string[];
    byAthlete: ReadonlyMap<string, Availability>;
  },
): AbsenceChange[] {
  const out: AbsenceChange[] = [];
  for (const r of rows) {
    if (!r.athleteId || r.supersededBy !== null) continue;
    const choice = choices[r.answerKey] ?? guessAnswer(r.answer);
    if (choice === 'keep') continue;
    const existing = ctx.byAthlete.get(r.athleteId);
    const before = draftOf(existing);
    if (before.status === choice) continue;
    const after: AvailabilityDraft = {
      status: choice,
      days: {},
      reason: choice === 'available' ? '' : ABSENCE_REASON,
    };
    const op = planWrite(existing, after, {
      regattaId: ctx.regattaId,
      athleteId: r.athleteId,
      regattaDays: ctx.regattaDays,
    });
    if (op) out.push({ line: r.line, athleteId: r.athleteId, before, after, op });
  }
  return out;
}

/** "Rowan Test" for an athlete id, for the dialog's lists. */
export function athleteLabel(athletes: ReadonlyMap<string, Athlete>, id: string): string {
  const a = athletes.get(id);
  return a ? athleteName(a) : 'Unknown athlete';
}
