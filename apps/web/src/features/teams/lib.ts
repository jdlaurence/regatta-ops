// Pure roster helpers (PLAN.md §4.2, §9.1): age-group badges, roster filters, and the CSV import
// and export. No React; tested in lib.test.ts.

import {
  athleteInputSchema,
  juniorAgeGroup,
  mastersCategory,
  toCsv,
  type Athlete,
  type AthleteLevel,
  type AthleteSide,
  type Program,
} from '@regatta-ops/domain';
import { guessMapping, type CsvField, type CsvMapping } from '@/components/CsvImport';

export type AthleteInput = Omit<Athlete, 'id' | 'created' | 'updated'>;

// ---------------------------------------------------------------------------
// Labels

export const SIDE_LABELS: Record<AthleteSide, string> = {
  port: 'Port',
  starboard: 'Starboard',
  both: 'Both',
  none: 'None',
};

export const LEVEL_LABELS: Record<AthleteLevel, string> = {
  experienced: 'Experienced',
  novice: 'Novice',
};

export const STATUS_LABELS: Record<Athlete['status'], string> = {
  active: 'Active',
  inactive: 'Inactive',
};

export const PROGRAM_LABELS: Record<Program, string> = {
  juniors: 'Juniors',
  masters: 'Masters',
  other: 'Other',
};

/** Roster groups, in the order the boys' sheet uses. */
export const LEVEL_ORDER: readonly AthleteLevel[] = ['experienced', 'novice'];

// ---------------------------------------------------------------------------
// Age groups (§9.1)

export interface AgeBadge {
  kind: 'junior' | 'masters';
  /** "U17", "Open", or a masters letter such as "C". */
  label: string;
  /** "U17 in 2026 (age 16)". */
  title: string;
}

/**
 * The badge derived from a birth year: the junior age group on a juniors team, the masters
 * category letter on a masters team (age 21 and up), and for other teams whichever fits the age.
 * Age is the season year minus the birth year, as USRowing counts it.
 */
export function ageBadge(
  birthYear: number | null | undefined,
  program: Program,
  seasonYear: number,
): AgeBadge | null {
  if (!birthYear) return null;
  const age = seasonYear - birthYear;
  if (age < 5 || age > 110) return null;
  const kind =
    program === 'juniors'
      ? 'junior'
      : program === 'masters'
        ? 'masters'
        : age <= 18
          ? 'junior'
          : 'masters';
  if (kind === 'junior') {
    const group = juniorAgeGroup(birthYear, seasonYear);
    if (group === 'open') {
      return { kind, label: 'Open', title: `Past junior age groups in ${seasonYear} (age ${age})` };
    }
    return { kind, label: group, title: `${group} in ${seasonYear} (age ${age})` };
  }
  if (age < 21) return null;
  const cat = mastersCategory(age);
  return { kind, label: cat, title: `Masters ${cat} in ${seasonYear} (age ${age})` };
}

/** Parse a four-digit year between `min` and `max`. Blank is null. */
export function parseYear(
  text: string,
  { min, max, label }: { min: number; max: number; label: string },
): { value: number | null; error?: undefined } | { value?: undefined; error: string } {
  const t = text.trim();
  if (!t) return { value: null };
  if (!/^\d{4}$/.test(t)) return { error: `Enter the ${label} as four digits, like ${max - 10}` };
  const y = Number(t);
  if (y < min || y > max) return { error: `Enter a ${label} between ${min} and ${max}` };
  return { value: y };
}

// ---------------------------------------------------------------------------
// Filters

export type SideFilter = 'all' | 'port' | 'starboard' | 'both' | 'none';

export interface RosterFilters {
  search: string;
  /** Port and starboard include athletes who row both. */
  side: SideFilter;
  level: 'all' | AthleteLevel;
  scullers: boolean;
  coxswains: boolean;
  showInactive: boolean;
}

export const DEFAULT_FILTERS: RosterFilters = {
  search: '',
  side: 'all',
  level: 'all',
  scullers: false,
  coxswains: false,
  showInactive: false,
};

function fold(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function filterRoster(athletes: readonly Athlete[], f: RosterFilters): Athlete[] {
  const words = fold(f.search.trim()).split(/\s+/).filter(Boolean);
  return athletes.filter((a) => {
    if (!f.showInactive && a.status === 'inactive') return false;
    if (f.level !== 'all' && a.level !== f.level) return false;
    if (f.scullers && !a.canScull) return false;
    if (f.coxswains && !a.canCox) return false;
    if (f.side !== 'all') {
      const ok =
        f.side === 'port' || f.side === 'starboard'
          ? a.side === f.side || a.side === 'both'
          : a.side === f.side;
      if (!ok) return false;
    }
    if (words.length > 0) {
      const hay = fold([a.firstName, a.lastName, a.preferredName ?? '', a.notes ?? ''].join(' '));
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

/** Sort key for the name column: last name, then first. */
export function nameSortKey(a: Pick<Athlete, 'firstName' | 'lastName' | 'preferredName'>): string {
  return fold(`${a.lastName} ${a.preferredName?.trim() || a.firstName}`);
}

// ---------------------------------------------------------------------------
// CSV import (§4.2)

export type RosterField =
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'preferredName'
  | 'side'
  | 'canScull'
  | 'canCox'
  | 'birthYear'
  | 'birthdate'
  | 'gradYear'
  | 'gender'
  | 'level'
  | 'status'
  | 'notes';

export const ROSTER_FIELDS: readonly (CsvField & { key: RosterField })[] = [
  { key: 'firstName', label: 'First name', aliases: ['first', 'given name', 'given'] },
  { key: 'lastName', label: 'Last name', aliases: ['last', 'surname', 'family name'] },
  {
    key: 'fullName',
    label: 'Full name',
    aliases: ['name', 'athlete', 'athlete name', 'rower', 'rower name'],
  },
  {
    key: 'preferredName',
    label: 'Preferred name',
    aliases: ['preferred first name', 'preferred', 'nickname', 'goes by'],
  },
  {
    key: 'side',
    label: 'Side',
    aliases: ['sweep side', 'p/s', 'port/starboard', 'rowing side'],
  },
  { key: 'canScull', label: 'Can scull', aliases: ['scull', 'sculls', 'sculler', 'sculling'] },
  { key: 'canCox', label: 'Can cox', aliases: ['cox', 'coxswain', 'coxes'] },
  {
    key: 'birthYear',
    label: 'Birth year',
    aliases: ['year of birth', 'yob', 'born', 'birth yr'],
  },
  {
    key: 'birthdate',
    label: 'Birthdate',
    aliases: ['birthday', 'date of birth', 'dob'],
  },
  {
    key: 'gradYear',
    label: 'Graduation year',
    aliases: ['grad year', 'grad yr', 'class of', 'class', 'hs grad year'],
  },
  { key: 'gender', label: 'Gender', aliases: ['sex', 'm/f'] },
  { key: 'level', label: 'Level', aliases: ['experience', 'novice/varsity', 'squad'] },
  { key: 'status', label: 'Status', aliases: ['active'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments', 'comment'] },
];

/** Guess which column holds each roster field, from the headers. */
export function guessRosterMapping(headers: readonly string[]): CsvMapping {
  return guessMapping(headers, ROSTER_FIELDS);
}

/** Why the mapping cannot import names yet, or null. */
export function checkRosterMapping(mapping: CsvMapping): string | null {
  if (mapping.firstName != null || mapping.fullName != null) return null;
  return 'Choose the column that holds first names, or one that holds full names.';
}

type Parsed<T> = { value: T; error?: undefined } | { value?: undefined; error: string };

/** "P", "Port", "S", "Both", "P/S", "Cox", "Scull" and friends. Blank is none. */
export function parseSide(
  text: string,
): Parsed<{ side: AthleteSide; cox?: boolean; scull?: boolean }> {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t || ['none', 'n/a', 'na', '-', '–', '—'].includes(t)) return { value: { side: 'none' } };
  if (['p', 'port'].includes(t)) return { value: { side: 'port' } };
  if (['s', 'sb', 'stbd', 'star', 'starboard', 'starbord'].includes(t)) {
    return { value: { side: 'starboard' } };
  }
  const both =
    /^(b|both|either|any|ps|sp|p\s*[/&,]\s*s|s\s*[/&,]\s*p|p or s|s or p|port\s*[/&,]\s*starboard|starboard\s*[/&,]\s*port|port or starboard|starboard or port)$/;
  if (both.test(t)) return { value: { side: 'both' } };
  if (['c', 'cox', 'coxswain'].includes(t)) return { value: { side: 'none', cox: true } };
  if (['x', 'scull', 'sculler', 'sculling', 'sculls', '1x', '2x'].includes(t)) {
    return { value: { side: 'none', scull: true } };
  }
  return { error: `Side "${text.trim()}" is not port, starboard, both, or cox` };
}

const YES = ['y', 'yes', 'true', 't', '1', 'x', '✓', '✔', 'ok'];
const NO = ['n', 'no', 'false', 'f', '0', '-', '–', ''];

export function parseYesNo(text: string, label: string): Parsed<boolean> {
  const t = text.trim().toLowerCase();
  if (YES.includes(t)) return { value: true };
  if (NO.includes(t)) return { value: false };
  return { error: `${label} "${text.trim()}" should be yes or no` };
}

export function parseLevel(text: string): Parsed<AthleteLevel | null> {
  const t = text.trim().toLowerCase();
  if (!t) return { value: null };
  if (/^(n|nov|novice|new|first[- ]year|beginner|learn to row|ltr)$/.test(t)) {
    return { value: 'novice' };
  }
  if (/^(e|exp|experienced|v|var|varsity|jv|returning|advanced|competitive)$/.test(t)) {
    return { value: 'experienced' };
  }
  return { error: `Level "${text.trim()}" should be novice or experienced` };
}

export function parseStatus(text: string): Parsed<Athlete['status']> {
  const t = text.trim().toLowerCase();
  if (!t || ['active', 'yes', 'y', 'true', '1', 'current'].includes(t)) return { value: 'active' };
  if (['inactive', 'no', 'n', 'false', '0', 'injured', 'left', 'retired', 'former'].includes(t)) {
    return { value: 'inactive' };
  }
  return { error: `Status "${text.trim()}" should be active or inactive` };
}

/** "M", "F", or the text as given. */
export function normalizeGender(text: string): string {
  const t = text.trim().toLowerCase();
  if (['m', 'male', 'man', 'men', 'boy', 'boys'].includes(t)) return 'M';
  if (['f', 'w', 'female', 'woman', 'women', 'girl', 'girls'].includes(t)) return 'F';
  return text.trim();
}

/** 'YYYY-MM-DD' from "2009-05-12" or "5/12/2009"; null for blank; error otherwise. */
export function parseDate(text: string): Parsed<string | null> {
  const t = text.trim();
  if (!t) return { value: null };
  let y: number, m: number, d: number;
  const iso = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (us) [y, m, d] = [Number(us[3]), Number(us[1]), Number(us[2])];
  else return { error: `Birthdate "${t}" should look like 2009-05-12 or 5/12/2009` };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: `Birthdate "${t}" is not a real date` };
  }
  return { value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** "Chen, Ava" or "Ava Chen" (the last word is the last name). */
export function splitFullName(text: string): { firstName: string; lastName: string } {
  const t = text.trim().replace(/\s+/g, ' ');
  const comma = t.indexOf(',');
  if (comma >= 0) {
    return { lastName: t.slice(0, comma).trim(), firstName: t.slice(comma + 1).trim() };
  }
  const parts = t.split(' ');
  if (parts.length === 1) return { firstName: t, lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1]! };
}

export function personKey(first: string, last: string): string {
  return `${fold(first.trim())}|${fold(last.trim())}`;
}

export interface RosterImportOptions {
  teamId: string;
  /** The team's current roster, for duplicate checks. */
  existing: readonly Athlete[];
  /** Skip rows whose name is already on the roster (default: add them anyway, with a note). */
  skipDuplicates: boolean;
  seasonYear: number;
  /** Level for rows without one. */
  defaultLevel?: AthleteLevel;
}

export interface RosterImportRow {
  /** The row's line in the file; the header is line 1. */
  line: number;
  values: Partial<Record<RosterField, string>>;
  athlete: AthleteInput | null;
  errors: string[];
  warnings: string[];
  /** Same name as someone on the roster, or as an earlier row of the file. */
  duplicateOf: 'roster' | 'file' | null;
  /** Left out (an error): already on the roster and `skipDuplicates` is on. */
  skipped: boolean;
}

/**
 * Parse and validate each mapped row (field key → cell text, as `mapRow` makes them) into an
 * athlete ready to create.
 */
export function buildRosterImport(
  rows: readonly Partial<Record<string, string>>[],
  opts: RosterImportOptions,
): RosterImportRow[] {
  const existing = new Map(opts.existing.map((a) => [personKey(a.firstName, a.lastName), a]));
  const seen = new Map<string, number>();
  return rows.map((raw, index) => {
    const line = index + 2;
    const values: Partial<Record<RosterField, string>> = {};
    for (const f of ROSTER_FIELDS) {
      const v = raw[f.key]?.trim();
      if (v) values[f.key] = v;
    }
    const errors: string[] = [];
    const warnings: string[] = [];
    const take = <T>(p: Parsed<T>, fallback: T): T => {
      if (p.error !== undefined) {
        errors.push(p.error);
        return fallback;
      }
      return p.value as T;
    };

    let firstName = values.firstName ?? '';
    let lastName = values.lastName ?? '';
    if (!firstName && values.fullName) {
      const split = splitFullName(values.fullName);
      firstName = split.firstName;
      lastName = lastName || split.lastName;
    }

    const side = take(parseSide(values.side ?? ''), { side: 'none' as AthleteSide });
    const canScull = values.canScull
      ? take(parseYesNo(values.canScull, 'Can scull'), false)
      : !!side.scull;
    const canCox = values.canCox ? take(parseYesNo(values.canCox, 'Can cox'), false) : !!side.cox;

    const birthdate = take(parseDate(values.birthdate ?? ''), null);
    let birthYear = take(
      parseYear(values.birthYear ?? '', {
        min: 1900,
        max: opts.seasonYear,
        label: 'birth year',
      }),
      null,
    );
    if (birthYear === null && birthdate) birthYear = Number(birthdate.slice(0, 4));
    if (birthYear !== null && birthdate && Number(birthdate.slice(0, 4)) !== birthYear) {
      warnings.push('The birth year and birthdate disagree; the birth year is kept');
    }
    let gradText = values.gradYear ?? '';
    const shortGrad = gradText.trim().match(/^'?(\d{2})$/);
    if (shortGrad) gradText = `20${shortGrad[1]}`;
    const gradYear = take(
      parseYear(gradText, { min: 1950, max: opts.seasonYear + 12, label: 'graduation year' }),
      null,
    );
    const level = take(parseLevel(values.level ?? ''), null) ?? opts.defaultLevel ?? 'experienced';
    const status = take(parseStatus(values.status ?? ''), 'active' as const);

    const input: AthleteInput = {
      teamId: opts.teamId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      side: side.side,
      canScull,
      canCox,
      level,
      status,
      ...(values.preferredName ? { preferredName: values.preferredName } : {}),
      ...(birthYear !== null ? { birthYear } : {}),
      ...(birthdate ? { birthdate } : {}),
      ...(gradYear !== null ? { gradYear } : {}),
      ...(values.gender ? { gender: normalizeGender(values.gender) } : {}),
      ...(values.notes ? { notes: values.notes } : {}),
    };
    if (!input.firstName) {
      errors.unshift('The name is blank');
    } else {
      const parsed = athleteInputSchema.safeParse(input);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          if (!errors.includes(issue.message)) errors.push(issue.message);
        }
      }
    }

    let duplicateOf: RosterImportRow['duplicateOf'] = null;
    if (input.firstName) {
      const key = personKey(input.firstName, input.lastName);
      const onRoster = existing.get(key);
      const earlier = seen.get(key);
      if (onRoster) {
        duplicateOf = 'roster';
        if (opts.skipDuplicates) errors.push('Already on this roster');
        else warnings.push('Someone with this name is already on this roster');
      } else if (earlier !== undefined) {
        duplicateOf = 'file';
        warnings.push(`Same name as row ${earlier}`);
      } else {
        seen.set(key, line);
      }
    }

    return {
      line,
      values,
      athlete: errors.length === 0 ? input : null,
      errors,
      warnings,
      duplicateOf,
      skipped: duplicateOf === 'roster' && opts.skipDuplicates,
    };
  });
}

// ---------------------------------------------------------------------------
// CSV export

const yesNo = (b: boolean) => (b ? 'Yes' : 'No');

/** The roster as CSV, in columns the import reads back. */
export function rosterToCsv(athletes: readonly Athlete[]): string {
  const header = [
    'First name',
    'Last name',
    'Preferred name',
    'Side',
    'Can scull',
    'Can cox',
    'Birth year',
    'Graduation year',
    'Gender',
    'Level',
    'Status',
    'Notes',
  ];
  const sorted = [...athletes].sort((a, b) => nameSortKey(a).localeCompare(nameSortKey(b)));
  const rows = sorted.map((a) => [
    a.firstName,
    a.lastName,
    a.preferredName ?? '',
    a.side === 'none' ? '' : SIDE_LABELS[a.side],
    yesNo(a.canScull),
    yesNo(a.canCox),
    a.birthYear ?? '',
    a.gradYear ?? '',
    a.gender ?? '',
    LEVEL_LABELS[a.level],
    STATUS_LABELS[a.status],
    a.notes ?? '',
  ]);
  return toCsv(header, rows);
}

/** A file-name-safe slug: "Junior boys" → "junior-boys". */
export function fileSlug(text: string): string {
  return (
    fold(text)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export'
  );
}
