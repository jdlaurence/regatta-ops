// Schedule paste parser (PLAN.md §9.5). A coach pastes rows copied from a published schedule
// (RegattaCentral, a PDF, a spreadsheet); the parser splits them, guesses what each column is,
// and returns parsed events for the mapping step. Pure and deterministic.

import { parseBoatClass } from './boat-classes';
import { detectDelimiter, parseDelimited } from './csv';
import { zonedToInstant } from './time';
import type { BoatClass, EventKind, EventStage, RegattaEvent } from './types';

export type ColumnRole =
  'eventNumber' | 'time' | 'day' | 'name' | 'boatClass' | 'category' | 'stage' | 'ignore';

export const COLUMN_ROLES = [
  'eventNumber',
  'time',
  'day',
  'name',
  'boatClass',
  'category',
  'stage',
  'ignore',
] as const satisfies readonly ColumnRole[];

export interface ColumnGuess {
  index: number;
  role: ColumnRole;
  /** 0..1 */
  confidence: number;
  header?: string;
}

export interface ParsedEvent {
  kind: EventKind;
  eventNumber?: string;
  name: string;
  boatClass?: BoatClass | null;
  category?: string;
  /** 'YYYY-MM-DD' if a day column was found. */
  day?: string;
  /** 'HH:mm' 24 h, or null for TBD. */
  time?: string | null;
  stage?: EventStage | null;
  raw: string[];
}

export interface PasteOptions {
  /** Year for dates written without one ('5/17', 'May 17'). */
  year?: number;
  /** The regatta's days ('YYYY-MM-DD'), to resolve weekday names ('Sat') and 'Day 2'. */
  days?: string[];
}

/** Tab, comma, or runs of two or more spaces (PDF copy-paste). */
export type PasteDelimiter = '\t' | ',' | 'spaces';

export interface SchedulePaste {
  rows: ParsedEvent[];
  columns: ColumnGuess[];
  /** 0..1: how sure the parser is about the column mapping as a whole. */
  confidence: number;
  /** Data rows split into cells (header removed): re-map them with applyColumnMapping. */
  raw: string[][];
  delimiter: PasteDelimiter;
}

// ---------------------------------------------------------------------------
// Cell recognizers

const WEEKDAY =
  '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)';
const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const DATE_PART = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?)`;
const DAY_CELL = new RegExp(
  `^(?:${WEEKDAY}\\.?(?:,?\\s*${DATE_PART})?|${DATE_PART}|day\\s*\\d)$`,
  'i',
);
const DAY_LEAD = new RegExp(
  `^(?:${WEEKDAY}\\.?(?:,?\\s*${DATE_PART})?|${DATE_PART}|day\\s*\\d)(?=,?\\s|,?$)`,
  'i',
);
const TIME_CELL = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([ap])\.?\s*m?\.?)?$/i;
const TBD = /^(?:tbd|tba|tbc|-+|—)$/i;
const TIME_LEAD = /^(?:\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]\.?\s*m\.?)?|tbd|tba)(?=\s|$)/i;
const NUMBER_LEAD =
  /^(?:(?:[Ee]vent|EVENT|[Rr]ace|RACE)\s*)?#?\s*(\d{1,3}[A-Z]?)(?=\s{2,}|\s+\d{1,2}:\d{2}|\s+(?:TBD|TBA)\b|$)/;
const STAGE_TAIL =
  /\s+((?:heat|semi(?:-?final)?|(?:petite\s+|grand\s+)?final|time\s+trial|rep(?:echage)?|tt)(?:\s+[a-z0-9]{1,2})?)$/i;
const STAGE_CELL =
  /^(?:heat|semi(?:-?final)?|(?:petite |grand )?final|time ?trial|tt|race|rep(?:echage)?|exhibition|h\d{1,2}|sf\d?|f[a-d])(?:\s*[a-z0-9]{1,2})?$/i;
const LOGISTICS =
  /\b(?:bus|buses|lunch|dinner|breakfast|break|meeting|awards?|depart(?:s|ure)?|arrive[sd]?|arrival|hotel|trailer|unload|load(?:ing)?|de-?rig|rig(?:ging)?|weigh[- ]?in|check[- ]?in|registration|parking)\b/i;

const CLASS_WORDS = new Set([
  'single',
  'single scull',
  'double',
  'double scull',
  'pair',
  'coxed pair',
  'coxless pair',
  'straight pair',
  'four',
  'coxed four',
  'coxless four',
  'straight four',
  'four with',
  'quad',
  'quad scull',
  'quadruple',
  'coxed quad',
  'eight',
]);

/** A cell that is a boat class and nothing else ('4+', '4x+', 'Coxed Four', '8'). */
function isBoatClassCell(cell: string): boolean {
  const t = cell.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^[1248] ?(?:x\+|x|\+|-|−)?$/.test(t)) return parseBoatClass(t) !== null;
  return CLASS_WORDS.has(t);
}

/** '14', '14A', 'Event 14', '#14' → '14' / '14A'; anything else → undefined. */
export function parseEventNumber(cell: string): string | undefined {
  const t = cell.trim().replace(/^(?:event|race|ev)\.?\s*#?\s*|^#\s*/i, '');
  return /^\d{1,3}[A-Z]?$/.test(t) ? t : undefined;
}

/**
 * '8:00' → '08:00', '1:04 PM' → '13:04', '12:30 am' → '00:30'. TBD, TBA, and dashes → null.
 * Not a time → undefined. Without AM/PM, 1:00–5:59 read as afternoon: regattas do not race
 * before 6 am, and club sheets write afternoon times on a 12-hour clock.
 */
export function parseClockTime(cell: string): string | null | undefined {
  const t = cell.trim();
  if (TBD.test(t)) return null;
  const m = TIME_CELL.exec(t);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (min > 59 || h > 23) return undefined;
  if (ap) {
    if (h < 1 || h > 12) return undefined;
    if (ap === 'a') h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h >= 1 && h <= 5) {
    h += 12;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** Stage from a stage cell or an event name. Pass `nameOnly` to ignore the bare word "race". */
export function parseStage(text: string, nameOnly = false): EventStage | null {
  const t = text.toLowerCase();
  if (/time\s*trial|\btt\b/.test(t)) return 'time_trial';
  if (/\bsemi|\bsf\d?\b/.test(t)) return 'semi';
  if (/\bfinal|\bf[a-d]\b/.test(t)) return 'final';
  if (/\bheat|\bh\d{1,2}\b|\brep(?:echage)?\b/.test(t)) return 'heat';
  if (!nameOnly && /\brace\b|\bexhibition\b/.test(t)) return 'race';
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isoDay(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  if (back.getUTCMonth() !== m - 1) return undefined;
  return back.toISOString().slice(0, 10);
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function resolveMonthDay(m: number, d: number, year: number | undefined, options: PasteOptions) {
  if (year !== undefined) return isoDay(year, m, d);
  const mmdd = `-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hit = options.days?.find((day) => day.endsWith(mmdd));
  if (hit) return hit;
  return options.year !== undefined ? isoDay(options.year, m, d) : undefined;
}

/**
 * A day cell → 'YYYY-MM-DD': '2025-05-17', '5/17/2025', '5/17/25', 'May 17, 2025', 'Sat 5/17',
 * 'Saturday', 'Day 2'. Dates without a year use `options.year` or match `options.days`;
 * weekday names and 'Day N' need `options.days`. Unresolvable → undefined.
 */
export function parseScheduleDay(cell: string, options: PasteOptions = {}): string | undefined {
  let t = cell.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!DAY_CELL.test(t)) return undefined;
  const dayN = /^day ?(\d)$/.exec(t);
  if (dayN) return options.days?.[Number(dayN[1]) - 1];
  let weekday: number | undefined;
  const wd = new RegExp(`^(${WEEKDAY})\\.?,?\\s*`).exec(t);
  if (wd) {
    weekday = WEEKDAYS.indexOf(wd[1]!.slice(0, 3));
    t = t.slice(wd[0].length);
  }
  let out: string | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) {
    out = isoDay(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(t))) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined;
    out = resolveMonthDay(Number(m[1]), Number(m[2]), y, options);
  } else if ((m = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(t))) {
    const month = MONTHS.indexOf(m[1]!.slice(0, 3)) + 1;
    out = resolveMonthDay(month, Number(m[2]), m[3] ? Number(m[3]) : undefined, options);
  } else if (t === '' && weekday !== undefined) {
    out = options.days?.find((d) => weekdayOf(d) === weekday);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Splitting

/**
 * Tab and comma via csv.detectDelimiter; runs of 2+ spaces (PDF copy-paste) when commas do
 * not split most lines, or when spaces split more of them than commas do.
 */
export function detectPasteDelimiter(text: string): PasteDelimiter {
  if (detectDelimiter(text) === '\t') return '\t';
  const rows = parseDelimited(text, ',');
  if (rows.length === 0) return 'spaces';
  const byComma = rows.filter((r) => r.filter((c) => c.trim() !== '').length >= 2).length;
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const bySpaces = lines.filter((l) => l.trim().split(/\s{2,}/).length >= 2).length;
  return byComma / rows.length >= 0.5 && byComma >= bySpaces ? ',' : 'spaces';
}

const HEADER_WORD =
  /^(?:event|events|race|races|#|no\.?|num|number|event ?(?:#|no\.?|num|number)|race ?(?:#|no\.?|number)|bow|time|start|start time|time of race|scheduled|sched|day|date|class|boat|boat ?class|boat ?type|type|stage|round|progression|category|division|level|name|event name|race name|description|title|shell|oars?|kind|crew|crews|lane|lanes|entries|notes?|status|heat)$/;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.map((c) => c.trim()).filter((c) => c !== '');
  if (filled.length < 2) return false;
  if (filled.some((c) => parseClockTime(c) !== undefined && !TBD.test(c))) return false;
  if (filled.some((c) => parseEventNumber(c) !== undefined)) return false;
  const words = filled.filter((c) => HEADER_WORD.test(normalizeHeader(c))).length;
  return words >= Math.ceil(filled.length / 2);
}

/** One whitespace-separated line → [day, eventNumber, time, name, stage] by pattern. */
function looseCells(line: string): string[] {
  let rest = line.trim().replace(/\t/g, '  ');
  let day = '';
  let num = '';
  let time = '';
  for (let i = 0; i < 3; i++) {
    let m: RegExpExecArray | null;
    if (!day && !num && !time && (m = DAY_LEAD.exec(rest))) {
      day = m[0].trim();
      rest = rest.slice(m[0].length).replace(/^,/, '').trim();
    } else if (!num && (m = NUMBER_LEAD.exec(rest))) {
      num = m[1]!;
      rest = rest.slice(m[0].length).trim();
    } else if (!time && (m = TIME_LEAD.exec(rest))) {
      time = m[0].trim();
      rest = rest.slice(m[0].length).trim();
    } else break;
  }
  let stage = '';
  const s = STAGE_TAIL.exec(rest);
  if (s && s.index > 0) {
    stage = s[1]!.replace(/\s+/g, ' ').trim();
    rest = rest.slice(0, s.index);
  }
  const name = rest.replace(/\s+/g, ' ').trim();
  return [day, num, time, name, stage];
}

const LOOSE_ROLES: ColumnRole[] = ['day', 'eventNumber', 'time', 'name', 'stage'];

// ---------------------------------------------------------------------------
// Column guessing

function headerRole(h: string | undefined): ColumnRole | null {
  if (!h) return null;
  const t = normalizeHeader(h);
  if (!t) return null;
  if (/^(?:(?:event|race) ?)?(?:#|no|num|number)$|^bow$/.test(t)) return 'eventNumber';
  if (/\b(?:time|start|sched(?:uled)?)\b/.test(t)) return 'time';
  if (/\b(?:day|date)\b/.test(t)) return 'day';
  if (/\bclass\b|\btype\b/.test(t)) return 'boatClass';
  if (/\b(?:stage|round|progression|heat)\b/.test(t)) return 'stage';
  if (/\b(?:category|division|level|age)\b/.test(t)) return 'category';
  if (/\b(?:shell|boat|oars?|kind|crews?|lanes?|entries|notes?|status|coach)\b/.test(t))
    return 'ignore';
  if (/\b(?:name|event|events|race|races|description|title)\b/.test(t)) return 'name';
  return null;
}

type Scored = Exclude<ColumnRole, 'name' | 'category' | 'ignore'>;
const SCORED_ROLES: Scored[] = ['time', 'eventNumber', 'day', 'boatClass', 'stage'];
const TESTS: Record<Scored, (c: string) => boolean> = {
  time: (c) => parseClockTime(c) !== undefined,
  eventNumber: (c) => parseEventNumber(c) !== undefined,
  day: (c) => DAY_CELL.test(c.trim()),
  boatClass: isBoatClassCell,
  stage: (c) => STAGE_CELL.test(c.trim()),
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function guessColumns(table: string[][], header: string[] | null): ColumnGuess[] {
  const width = Math.max(0, ...table.map((r) => r.length), header?.length ?? 0);
  const cols = Array.from({ length: width }, (_, i) => {
    const cells = table.map((r) => (r[i] ?? '').trim()).filter((c) => c !== '');
    const hint = headerRole(header?.[i]);
    const frac = (f: (c: string) => boolean) =>
      cells.length ? cells.filter(f).length / cells.length : 0;
    const scores = Object.fromEntries(
      SCORED_ROLES.map((r) => {
        let s = frac(TESTS[r]);
        if (hint === r) s += 0.5;
        else if (hint) s -= 0.3;
        return [r, s];
      }),
    ) as Record<Scored, number>;
    const text = frac((c) => /[a-z]{2}/i.test(c));
    const avgLen = cells.length ? cells.reduce((s, c) => s + c.length, 0) / cells.length : 0;
    return { index: i, cells, hint, scores, text, avgLen, header: header?.[i]?.trim() };
  });

  const assigned = new Map<number, { role: ColumnRole; confidence: number }>();
  const taken = new Set<ColumnRole>();
  const candidates = cols
    .flatMap((c) => SCORED_ROLES.map((role) => ({ col: c.index, role, score: c.scores[role] })))
    .filter((x) => x.score >= 0.6 && cols[x.col]!.cells.length > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        SCORED_ROLES.indexOf(a.role) - SCORED_ROLES.indexOf(b.role) ||
        a.col - b.col,
    );
  for (const c of candidates) {
    if (assigned.has(c.col) || taken.has(c.role)) continue;
    assigned.set(c.col, { role: c.role, confidence: Math.min(1, c.score) });
    taken.add(c.role);
  }

  // Name: the header-named text column, else the text column with the longest cells.
  const free = cols.filter(
    (c) => !assigned.has(c.index) && c.cells.length > 0 && c.hint !== 'ignore' && c.text >= 0.5,
  );
  const nameCol =
    free.find((c) => c.hint === 'name') ??
    [...free]
      .filter((c) => c.hint !== 'category')
      .sort((a, b) => b.avgLen - a.avgLen || a.index - b.index)[0];
  if (nameCol) {
    assigned.set(nameCol.index, {
      role: 'name',
      confidence: Math.min(1, nameCol.text * (nameCol.hint === 'name' ? 1 : 0.85)),
    });
  }
  const catCol = free.find((c) => c.hint === 'category' && !assigned.has(c.index));
  if (catCol) assigned.set(catCol.index, { role: 'category', confidence: 0.9 });

  return cols.map((c) => {
    const a = assigned.get(c.index);
    const guess: ColumnGuess = a
      ? { index: c.index, role: a.role, confidence: round2(a.confidence) }
      : { index: c.index, role: 'ignore', confidence: c.hint === 'ignore' ? 0.9 : 0.5 };
    if (c.header) guess.header = c.header;
    return guess;
  });
}

function overallConfidence(columns: ColumnGuess[], rows: number, factor: number): number {
  if (rows === 0) return 0;
  const used = columns.filter((c) => c.role !== 'ignore');
  if (used.length === 0) return 0;
  let conf = used.reduce((s, c) => s + c.confidence, 0) / used.length;
  if (!used.some((c) => c.role === 'name')) conf *= 0.5;
  if (!used.some((c) => c.role === 'time')) conf *= 0.8;
  return round2(conf * factor);
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Split a pasted schedule, guess its columns, and parse its rows. Detects tab, comma, or
 * whitespace-aligned text (PDF copy-paste), skips header rows, and carries a day down from
 * the last row (or day heading line) that named one. Rows with no boat class and no event
 * number but some text become logistics items ("Lunch", "Bus departs hotel").
 */
export function parseSchedulePaste(text: string, options: PasteOptions = {}): SchedulePaste {
  const clean = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const delimiter = detectPasteDelimiter(clean);
  let raw: string[][];
  let columns: ColumnGuess[];
  let factor = 1;

  if (delimiter === 'spaces') {
    const lines = clean.split('\n').filter((l) => l.trim() !== '');
    const body = lines.filter((l) => !looksLikeHeader(l.trim().split(/\s{2,}|\t/)));
    const loose = body.map(looseCells);
    const keep = LOOSE_ROLES.map((_, i) => loose.some((r) => r[i] !== '')).flatMap((k, i) =>
      k ? [i] : [],
    );
    raw = loose.map((r) => keep.map((i) => r[i]!));
    columns = keep.map((i, index) => {
      const role = LOOSE_ROLES[i]!;
      const cells = raw.map((r) => r[index]!).filter((c) => c !== '');
      const ok =
        role === 'name'
          ? cells.filter((c) => /[a-z]{2}/i.test(c)).length
          : role === 'stage'
            ? cells.filter((c) => parseStage(c) !== null).length
            : cells.length;
      return { index, role, confidence: round2(cells.length ? (ok / cells.length) * 0.9 : 0) };
    });
    factor = 0.85;
  } else {
    const table = parseDelimited(clean, delimiter).map((r) => r.map((c) => c.trim()));
    const headerRows = table.filter(looksLikeHeader);
    const header = table.length > 0 && looksLikeHeader(table[0]!) ? table[0]! : null;
    const body = table.filter((r) => !headerRows.includes(r));
    const width = Math.max(0, ...body.map((r) => r.length));
    const keep = Array.from({ length: width }, (_, i) => i).filter((i) =>
      body.some((r) => (r[i] ?? '') !== ''),
    );
    raw = body.map((r) => keep.map((i) => r[i] ?? ''));
    const keptHeader = header ? keep.map((i) => header[i] ?? '') : null;
    columns = guessColumns(raw, keptHeader);
  }

  const rows = applyColumnMapping(raw, columns, options);
  return {
    rows,
    columns,
    confidence: overallConfidence(columns, rows.length, factor),
    raw,
    delimiter,
  };
}

/** Re-apply a (possibly user-edited) column mapping to the raw rows. */
export function applyColumnMapping(
  raw: string[][],
  columns: ColumnGuess[],
  options: PasteOptions = {},
): ParsedEvent[] {
  const indexes = (role: ColumnRole) => columns.filter((c) => c.role === role).map((c) => c.index);
  const first = (row: string[], role: ColumnRole) => {
    for (const i of indexes(role)) {
      const v = (row[i] ?? '').trim();
      if (v) return v;
    }
    return '';
  };
  const joined = (row: string[], role: ColumnRole) =>
    indexes(role)
      .map((i) => (row[i] ?? '').trim())
      .filter((v) => v !== '')
      .join(' ');
  const mapped = new Set(columns.filter((c) => c.role !== 'ignore').map((c) => c.index));

  const out: ParsedEvent[] = [];
  let currentDay: string | undefined;
  for (const row of raw) {
    const cells = row.map((c) => c.trim());
    const filled = cells.filter((c, i) => c !== '' && mapped.has(i));
    if (filled.length === 0) continue;

    // A day heading on its own ("Saturday, May 17") sets the day for the rows below it.
    const dayCell = first(cells, 'day');
    if (filled.length === 1 && (dayCell || DAY_CELL.test(filled[0]!))) {
      const d = parseScheduleDay(dayCell || filled[0]!, options);
      if (d) currentDay = d;
      continue;
    }
    if (dayCell) {
      const d = parseScheduleDay(dayCell, options);
      if (d) currentDay = d;
    }

    const eventNumber = parseEventNumber(first(cells, 'eventNumber'));
    const timeCell = first(cells, 'time');
    const time = timeCell ? (parseClockTime(timeCell) ?? null) : null;
    const classCell = first(cells, 'boatClass');
    const category = joined(cells, 'category');
    const stageCell = first(cells, 'stage');
    let name = joined(cells, 'name');

    const logisticsWords = LOGISTICS.test(name);
    const classFromCell = classCell ? parseBoatClass(classCell) : null;
    const boatClass =
      classFromCell ?? (name && !logisticsWords ? parseBoatClass(name) : null) ?? null;
    if (!name) {
      name = [category, classCell].filter(Boolean).join(' ');
      if (!name && eventNumber) name = `Event ${eventNumber}`;
    } else if (classCell && classFromCell && parseBoatClass(name) === null) {
      name = `${name} ${classCell}`;
    }
    if (!name && !eventNumber) continue;

    const kind: EventKind = boatClass || eventNumber ? 'race' : 'logistics';
    const ev: ParsedEvent = {
      kind,
      name,
      boatClass: kind === 'race' ? boatClass : null,
      time,
      stage: kind === 'race' ? (stageCell ? parseStage(stageCell) : parseStage(name, true)) : null,
      raw: row,
    };
    if (eventNumber) ev.eventNumber = eventNumber;
    if (category) ev.category = category;
    if (currentDay) ev.day = currentDay;
    out.push(ev);
  }
  return out;
}

/**
 * A parsed row as a new RegattaEvent record (no id): scheduledAt from day + time in the
 * regatta zone, `fallbackDay` when the paste named no day, stage 'race' when none was found.
 */
export function parsedEventToRecord(
  p: ParsedEvent,
  ctx: {
    regattaId: string;
    timezone: string;
    fallbackDay: string;
    sortOrder: number;
    source?: string;
  },
): Omit<RegattaEvent, 'id'> {
  const day = p.day ?? ctx.fallbackDay;
  const rec: Omit<RegattaEvent, 'id'> = {
    regattaId: ctx.regattaId,
    kind: p.kind,
    name: p.name,
    day,
    scheduledAt: p.time ? zonedToInstant(day, p.time, ctx.timezone) : null,
    sortOrder: ctx.sortOrder,
  };
  if (p.kind === 'race') {
    rec.boatClass = p.boatClass ?? null;
    rec.stage = p.stage ?? 'race';
  }
  if (p.eventNumber) rec.eventNumber = p.eventNumber;
  if (p.category) rec.category = p.category;
  if (ctx.source) rec.source = ctx.source;
  return rec;
}
