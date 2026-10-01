// CSV import and export for shells, oar sets, and gear (PLAN.md §4.7). Import columns are
// guessed from headers: the export's own headers (the §8.1 field names) and the columns of
// data/reference/shells.csv and oar-sets.csv both map without changes. Pure.

import {
  BOAT_CLASSES,
  defaultRiggerCount,
  GEAR_CATEGORIES,
  gearItemInputSchema,
  oarSetInputSchema,
  parseBoatClass,
  shellInputSchema,
  toCsv,
  type BoatClass,
  type EquipmentStatus,
  type GearCategory,
  type GearItem,
  type GenderAffinity,
  type OarSet,
  type RiggerType,
  type Rigging,
  type Shell,
  type ShellRigging,
  type Team,
} from '@regatta-ops/domain';
import type { z } from 'zod';
import type { CsvField, CsvRowCheck } from '@/components/CsvImport';
import { crewRangeFromLabel, GEAR_CATEGORY_LABELS, newShellInput, suggestedRigging } from './lib';

export type ShellInput = Omit<Shell, 'id' | 'created' | 'updated'>;
export type OarSetInput = Omit<OarSet, 'id' | 'created' | 'updated'>;
export type GearInput = Omit<GearItem, 'id' | 'created' | 'updated'>;

export interface CsvContext {
  teams: readonly Pick<Team, 'id' | 'name' | 'shortName'>[];
  /** Names already in the fleet; a row with one of these is skipped. */
  existingNames: readonly string[];
}

// ---------------------------------------------------------------------------
// Fields. `aliases` lists the export header first, then the reference CSV's column names.

export const SHELL_CSV_FIELDS: CsvField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['shell', 'shell name', 'boat name'] },
  { key: 'nickname', label: 'Nickname', aliases: ['nick'] },
  {
    key: 'boatClass',
    label: 'Boat class',
    required: true,
    aliases: ['boat_class', 'class', 'boat type'],
  },
  {
    key: 'compatibleClasses',
    label: 'Compatible classes',
    aliases: ['compatible_classes', 'also races as'],
  },
  { key: 'rigging', label: 'Rigging', aliases: ['sweep or scull'] },
  { key: 'manufacturer', label: 'Manufacturer', aliases: ['make', 'builder'] },
  { key: 'model', label: 'Model' },
  { key: 'serial', label: 'Serial number', aliases: ['serial', 'serial_no', 'hin'] },
  { key: 'year', label: 'Year', aliases: ['year built', 'built'] },
  {
    key: 'weightClassLabel',
    label: 'Weight class',
    aliases: ['weight_class_label', 'weight_class_lb', 'weight class lb', 'crew weight'],
  },
  { key: 'strokeSide', label: 'Stroke side', aliases: ['stroke_side', 'rig', 'rigged'] },
  { key: 'coxPosition', label: 'Cox position', aliases: ['cox_position', 'cox'] },
  { key: 'shoes', label: 'Shoes' },
  { key: 'spreadCm', label: 'Spread (cm)', aliases: ['spread_cm', 'spread', 'spread_or_span'] },
  { key: 'spanCm', label: 'Span (cm)', aliases: ['span_cm', 'span', 'spread_or_span'] },
  { key: 'level', label: 'Level', aliases: ['size_tier'] },
  { key: 'genderAffinity', label: 'Gender affinity', aliases: ['gender_affinity', 'gender'] },
  { key: 'homeTeam', label: 'Home team', aliases: ['home_team', 'team'] },
  { key: 'location', label: 'Location', aliases: ['rack', 'boathouse location'] },
  { key: 'status', label: 'Status', aliases: ['unavailable'] },
  { key: 'riggerType', label: 'Rigger type', aliases: ['rigger_type', 'riggers'] },
  { key: 'riggerCount', label: 'Rigger count', aliases: ['rigger_count'] },
  { key: 'lengthCm', label: 'Length (cm)', aliases: ['length_cm', 'length'] },
  { key: 'beamCm', label: 'Beam (cm)', aliases: ['beam_cm', 'beam'] },
  { key: 'weightKg', label: 'Hull weight (kg)', aliases: ['weight_kg', 'hull weight'] },
  { key: 'isPrivate', label: 'Private owner', aliases: ['is_private', 'private'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments'] },
];

export const OAR_SET_CSV_FIELDS: CsvField[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['oar set', 'set'] },
  { key: 'type', label: 'Type', required: true, aliases: ['sweep or scull', 'rigging'] },
  { key: 'color', label: 'Color code', aliases: ['color', 'colour', 'colors'] },
  { key: 'count', label: 'Count', aliases: ['oars', 'number of oars', 'quantity'] },
  { key: 'blade', label: 'Blade and shaft', aliases: ['blade', 'shaft'] },
  { key: 'lengthCm', label: 'Length (cm)', aliases: ['length_cm', 'length'] },
  { key: 'inboardCm', label: 'Inboard (cm)', aliases: ['inboard_cm', 'inboard'] },
  { key: 'gripMm', label: 'Grip (mm)', aliases: ['grip_mm', 'grip'] },
  { key: 'genderAffinity', label: 'Gender affinity', aliases: ['gender_affinity', 'gender'] },
  { key: 'homeTeam', label: 'Home team', aliases: ['home_team', 'team'] },
  { key: 'status', label: 'Status', aliases: ['unavailable'] },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments'] },
];

export const GEAR_CSV_FIELDS: CsvField[] = [
  { key: 'category', label: 'Category', aliases: ['kind'] },
  { key: 'name', label: 'Name', required: true, aliases: ['item'] },
  { key: 'quantity', label: 'Quantity', aliases: ['qty', 'count'] },
  {
    key: 'defaultLoad',
    label: 'Default load',
    aliases: ['default_load', 'load by default', 'on every trailer'],
  },
  { key: 'notes', label: 'Notes', aliases: ['note', 'comments'] },
];

// ---------------------------------------------------------------------------
// Cell parsers. Each returns a value and, when the cell could not be read, a sentence.

type Parsed<T> = { value: T; problem?: string };

const lower = (s: string) => s.trim().toLowerCase();

export function parseYesNo(raw: string, label: string): Parsed<boolean> {
  const t = lower(raw);
  if (['true', 'yes', 'y', '1', 'x', 'private', '✓'].includes(t)) return { value: true };
  if (['', 'false', 'no', 'n', '0', '-'].includes(t)) return { value: false };
  return { value: false, problem: `${label} "${raw}" is not yes or no; read as no.` };
}

/** A number, ignoring a unit suffix and thousands commas: '1,990 cm' → 1990. Blank is null. */
export function parseNumber(raw: string, label: string): Parsed<number | null> {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return { value: null };
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm|kg|lbs?)?$/i);
  if (!m) return { value: null, problem: `${label} "${raw}" is not a number.` };
  return { value: Number(m[1]) };
}

export function parseAffinity(raw: string): Parsed<GenderAffinity> {
  const t = lower(raw).replace(/[’']/g, '');
  if (!t || ['any', 'mixed', 'open', 'both', 'all', 'club'].includes(t)) return { value: 'any' };
  if (/^(w|f|women|womens|woman|female|girls?)$/.test(t)) return { value: 'women' };
  if (/^(m|men|mens|man|male|boys?)$/.test(t)) return { value: 'men' };
  return { value: 'any', problem: `Gender affinity "${raw}" is not women's, men's, or any.` };
}

/**
 * Status words, or the reference sheet's "unavailable" column (True → out of service).
 * Unknown words read as in service with a warning.
 */
export function parseStatus(raw: string): Parsed<EquipmentStatus> {
  const t = lower(raw).replace(/[\s_-]+/g, ' ');
  if (!t || ['in service', 'available', 'ok', 'false', 'no', 'n', '0'].includes(t)) {
    return { value: 'in_service' };
  }
  if (t === 'limited' || t.startsWith('limit')) return { value: 'limited' };
  if (['out of service', 'out', 'unavailable', 'broken', 'true', 'yes', 'y', '1'].includes(t)) {
    return { value: 'out_of_service' };
  }
  if (t === 'retired') return { value: 'retired' };
  return {
    value: 'in_service',
    problem: `Status "${raw}" is not in service, limited, out of service, or retired; read as in service.`,
  };
}

export function parseStrokeSide(raw: string): Parsed<'port' | 'starboard' | null> {
  const t = lower(raw);
  if (!t) return { value: null };
  if (/starboard|stbd|^s$|^sb$/.test(t)) return { value: 'starboard' };
  if (/port|^p$/.test(t)) return { value: 'port' };
  return { value: null, problem: `Stroke side "${raw}" is not port or starboard; left blank.` };
}

export function parseCoxPosition(raw: string): Parsed<'stern' | 'bow' | null> {
  const t = lower(raw);
  if (!t) return { value: null };
  if (t.startsWith('stern')) return { value: 'stern' };
  if (t.startsWith('bow')) return { value: 'bow' };
  return { value: null, problem: `Cox position "${raw}" is not stern or bow; left blank.` };
}

export function parseLevel(raw: string): Parsed<Shell['level']> {
  const t = lower(raw);
  if (!t) return { value: null };
  if (/^(beginner|rec|recreational|novice|learn)/.test(t)) return { value: 'beginner' };
  if (/^(intermediate|club)/.test(t)) return { value: 'intermediate' };
  if (/^(racer|racing|race|elite|varsity)/.test(t)) return { value: 'racer' };
  return {
    value: null,
    problem: `Level "${raw}" is not beginner, intermediate, or racer; left blank.`,
  };
}

export function parseRiggerType(raw: string, model: string): Parsed<RiggerType> {
  const t = lower(raw);
  if (!t) return { value: /wing/i.test(model) ? 'wing' : 'side' };
  if (t.startsWith('wing')) return { value: 'wing' };
  if (t.startsWith('side') || t === 'standard') return { value: 'side' };
  if (t === 'none') return { value: 'none' };
  return {
    value: 'side',
    problem: `Rigger type "${raw}" is not side, wing, or none; read as side.`,
  };
}

export function parseShellRigging(raw: string): Parsed<ShellRigging | null> {
  const t = lower(raw);
  if (!t) return { value: null };
  if (t.startsWith('conv')) return { value: 'convertible' };
  if (t.startsWith('scull')) return { value: 'scull' };
  if (t.startsWith('sweep')) return { value: 'sweep' };
  return { value: null, problem: `Rigging "${raw}" is not sweep, scull, or convertible.` };
}

export function parseOarType(raw: string): Parsed<Rigging | null> {
  const t = lower(raw);
  if (t.startsWith('sweep')) return { value: 'sweep' };
  if (t.startsWith('scull')) return { value: 'scull' };
  return { value: null, problem: raw.trim() ? `Type "${raw}" is not sweep or scull.` : undefined };
}

/** '4x;4-', '4x, 4-', '4x/4-' → classes. */
export function parseClassList(raw: string): Parsed<BoatClass[]> {
  const parts = raw
    .split(/[;,/|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: BoatClass[] = [];
  const unknown: string[] = [];
  for (const p of parts) {
    const cls = parseBoatClass(p);
    if (cls) out.push(cls);
    else unknown.push(p);
  }
  return {
    value: Array.from(new Set(out)),
    problem: unknown.length
      ? `Compatible classes "${unknown.join(', ')}" were not read.`
      : undefined,
  };
}

/** The club's labels: '165-200', 'LWT', '<240', '155'. A trailing '.0' is dropped. */
export function parseWeightClass(raw: string): Parsed<string> {
  const t = raw.trim().replace(/\.0$/, '');
  if (!t) return { value: '' };
  if (/^[<>]?\s*\d{2,3}(\s*[-–]\s*\d{2,3})?$/.test(t)) return { value: t };
  if (/^(lwt|hvywt|light|heavy)/i.test(t)) return { value: t };
  return { value: '', problem: `Weight class "${raw}" is not a crew weight; left blank.` };
}

export function parseGearCategory(raw: string): Parsed<GearCategory> {
  const t = lower(raw).replace(/[\s-]+/g, '_');
  if (!t) return { value: 'other' };
  if ((GEAR_CATEGORIES as readonly string[]).includes(t)) return { value: t as GearCategory };
  const byLabel = (Object.entries(GEAR_CATEGORY_LABELS) as [GearCategory, string][]).find(
    ([, label]) => label.toLowerCase().replace(/\s+/g, '_') === t,
  );
  if (byLabel) return { value: byLabel[0] };
  const synonyms: [RegExp, GearCategory][] = [
    [/^cox_?box/, 'cox_box'],
    [/^sling/, 'slings'],
    [/^rigger/, 'rigger_set'],
    [/^tool/, 'tool_kit'],
    [/^tent/, 'tent'],
    [/^launch/, 'launch'],
    [/^strap/, 'straps'],
    [/(spare|parts)/, 'spare_parts'],
  ];
  const hit = synonyms.find(([re]) => re.test(t));
  if (hit) return { value: hit[1] };
  return { value: 'other', problem: `Category "${raw}" is not a gear category; read as other.` };
}

function findTeam(raw: string, ctx: CsvContext): Parsed<string | null> {
  const t = lower(raw);
  if (!t) return { value: null };
  const team = ctx.teams.find((x) => lower(x.name) === t || lower(x.shortName ?? '') === t);
  if (team) return { value: team.id };
  return { value: null, problem: `No team named "${raw}"; left without a home team.` };
}

const MANUFACTURERS = [
  'Hudson',
  'Vespoli',
  'Filippi',
  'Empacher',
  'Pocock',
  'Wintech',
  'Maas',
  'Fluidesign',
  'Resolute',
  'Kaschper',
  'Peinert',
  'Swift',
  'Drew Harris',
];

/** 'Hudson S8.21' → 'Hudson'. */
export function manufacturerFromModel(model: string): string {
  const t = model.toLowerCase();
  return MANUFACTURERS.find((m) => t.includes(m.toLowerCase())) ?? '';
}

/**
 * A sweep spread or a sculling span from one number: 70 to 100 cm is a spread, 140 to 180 cm
 * a span; '86/159' is both. Used when one column fills both fields (the reference sheet's
 * spread_or_span).
 */
export function splitSpreadOrSpan(raw: string): { spreadCm: number | null; spanCm: number | null } {
  const both = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (both) return { spreadCm: Number(both[1]), spanCm: Number(both[2]) };
  const v = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(v)) return { spreadCm: null, spanCm: null };
  if (v >= 140 && v <= 180) return { spreadCm: null, spanCm: v };
  if (v >= 70 && v <= 100) return { spreadCm: v, spanCm: null };
  return { spreadCm: null, spanCm: null };
}

// ---------------------------------------------------------------------------
// Row checks

function schemaErrors(
  result: z.ZodSafeParseResult<unknown>,
  fields: readonly CsvField[],
): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? '');
    const label = fields.find((f) => f.key === key)?.label ?? key;
    return label ? `${label}: ${issue.message}` : issue.message;
  });
}

/** Names that repeat an existing record or an earlier row are errors (the row is skipped). */
function nameErrors(
  name: string,
  seen: Set<string>,
  existing: Set<string>,
  noun: string,
): string[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  if (existing.has(key)) {
    const article = /^[aeiou]/i.test(noun) ? 'An' : 'A';
    return [`${article} ${noun} named "${name.trim()}" is already in the fleet.`];
  }
  if (seen.has(key)) return [`"${name.trim()}" appears more than once in the file.`];
  seen.add(key);
  return [];
}

export function checkShellRows(
  rows: readonly Record<string, string>[],
  ctx: CsvContext,
): CsvRowCheck<ShellInput>[] {
  const existing = new Set(ctx.existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const take = <T>(p: Parsed<T>, asError = false): T => {
      if (p.problem) (asError ? errors : warnings).push(p.problem);
      return p.value;
    };
    const get = (k: string) => row[k] ?? '';

    const name = get('name').trim();
    if (!name) errors.push('Name is missing.');
    errors.push(...nameErrors(name, seen, existing, 'shell'));

    const cls = parseBoatClass(get('boatClass'));
    if (!cls) {
      errors.push(
        get('boatClass').trim()
          ? `Boat class "${get('boatClass')}" is not one of ${BOAT_CLASSES.join(', ')}.`
          : 'Boat class is missing.',
      );
    }
    if (errors.length > 0 || !cls) return { record: null, errors, warnings };

    const base = newShellInput(cls);
    const compatible = take(parseClassList(get('compatibleClasses'))).filter((c) => c !== cls);
    // 'Hudson S8. 21' in the club's sheet is 'Hudson S8.21'.
    const model = get('model')
      .replace(/\s+/g, ' ')
      .replace(/\.\s+(\d)/g, '.$1')
      .trim();
    const riggerType = take(parseRiggerType(get('riggerType'), model));
    const riggerCount = take(parseNumber(get('riggerCount'), 'Rigger count'), true);
    const label = take(parseWeightClass(get('weightClassLabel')));

    // One column can fill spread and span (the reference sheet's spread_or_span).
    let spreadCm: number | null;
    let spanCm: number | null;
    if (get('spreadCm') && get('spreadCm') === get('spanCm')) {
      ({ spreadCm, spanCm } = splitSpreadOrSpan(get('spreadCm')));
    } else {
      spreadCm = take(parseNumber(get('spreadCm'), 'Spread'), true);
      spanCm = take(parseNumber(get('spanCm'), 'Span'), true);
    }

    const dims = {
      lengthCm: take(parseNumber(get('lengthCm'), 'Length'), true) ?? base.lengthCm,
      beamCm: take(parseNumber(get('beamCm'), 'Beam'), true) ?? base.beamCm,
      weightKg: take(parseNumber(get('weightKg'), 'Hull weight'), true) ?? base.weightKg,
    };
    const year = take(parseNumber(get('year'), 'Year'), true);

    const record: ShellInput = {
      ...base,
      name,
      nickname: get('nickname').trim(),
      compatibleClasses: compatible.length ? [cls, ...compatible] : [],
      rigging: take(parseShellRigging(get('rigging'))) ?? suggestedRigging(cls, compatible),
      manufacturer: get('manufacturer').trim() || manufacturerFromModel(model),
      model,
      serial: get('serial').trim(),
      year,
      weightClassLabel: label,
      ...crewRangeFromLabel(label),
      strokeSide: take(parseStrokeSide(get('strokeSide'))),
      coxPosition: take(parseCoxPosition(get('coxPosition'))) ?? base.coxPosition,
      shoes: get('shoes').trim(),
      spreadCm,
      spanCm,
      level: take(parseLevel(get('level'))),
      genderAffinity: take(parseAffinity(get('genderAffinity'))),
      homeTeamId: take(findTeam(get('homeTeam'), ctx)),
      location: get('location').trim(),
      status: take(parseStatus(get('status'))),
      riggerType,
      riggerCount: riggerCount ?? defaultRiggerCount(cls, riggerType),
      ...dims,
      isPrivate: take(parseYesNo(get('isPrivate'), 'Private owner')),
      notes: get('notes').replace(/\s+/g, ' ').trim(),
    };
    errors.push(...schemaErrors(shellInputSchema.safeParse(record), SHELL_CSV_FIELDS));
    return { record: errors.length ? null : record, errors, warnings };
  });
}

/** Scull sets default to 4 pairs, or the pairs the notes name ("only 3 pairs"); sweep to 8. */
export function defaultOarCount(type: Rigging, notes: string): number {
  if (type === 'scull') {
    const pairs = notes.match(/(\d+)\s*pairs?/i);
    return pairs ? Number(pairs[1]) * 2 : 8;
  }
  return 8;
}

export function checkOarSetRows(
  rows: readonly Record<string, string>[],
  ctx: CsvContext,
): CsvRowCheck<OarSetInput>[] {
  const existing = new Set(ctx.existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const take = <T>(p: Parsed<T>, asError = false): T => {
      if (p.problem) (asError ? errors : warnings).push(p.problem);
      return p.value;
    };
    const get = (k: string) => row[k] ?? '';
    const name = get('name').trim();
    if (!name) errors.push('Name is missing.');
    errors.push(...nameErrors(name, seen, existing, 'oar set'));
    const type = take(parseOarType(get('type')), true);
    if (!type && !get('type').trim()) errors.push('Type is missing.');
    if (errors.length > 0 || !type) return { record: null, errors, warnings };

    const notes = get('notes').replace(/\s+/g, ' ').trim();
    const count = take(parseNumber(get('count'), 'Count'), true);
    const record: OarSetInput = {
      name,
      type,
      color: get('color').trim().toLowerCase(),
      count: count ?? defaultOarCount(type, notes),
      blade: get('blade').trim(),
      lengthCm: take(parseNumber(get('lengthCm'), 'Length'), true),
      inboardCm: take(parseNumber(get('inboardCm'), 'Inboard'), true),
      gripMm: take(parseNumber(get('gripMm'), 'Grip'), true),
      genderAffinity: take(parseAffinity(get('genderAffinity'))),
      homeTeamId: take(findTeam(get('homeTeam'), ctx)),
      status: take(parseStatus(get('status'))),
      notes,
    };
    errors.push(...schemaErrors(oarSetInputSchema.safeParse(record), OAR_SET_CSV_FIELDS));
    return { record: errors.length ? null : record, errors, warnings };
  });
}

export function checkGearRows(
  rows: readonly Record<string, string>[],
  ctx: CsvContext,
): CsvRowCheck<GearInput>[] {
  const existing = new Set(ctx.existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  return rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const take = <T>(p: Parsed<T>, asError = false): T => {
      if (p.problem) (asError ? errors : warnings).push(p.problem);
      return p.value;
    };
    const get = (k: string) => row[k] ?? '';
    const name = get('name').trim();
    if (!name) errors.push('Name is missing.');
    errors.push(...nameErrors(name, seen, existing, 'gear item'));
    if (errors.length > 0) return { record: null, errors, warnings };
    const quantity = take(parseNumber(get('quantity'), 'Quantity'), true);
    const record: GearInput = {
      category: take(parseGearCategory(get('category'))),
      name,
      quantity: quantity ?? 1,
      defaultLoad: take(parseYesNo(get('defaultLoad'), 'Default load')),
      notes: get('notes').replace(/\s+/g, ' ').trim(),
    };
    errors.push(...schemaErrors(gearItemInputSchema.safeParse(record), GEAR_CSV_FIELDS));
    return { record: errors.length ? null : record, errors, warnings };
  });
}

// ---------------------------------------------------------------------------
// Export: §8.1 field names as headers, so an export imports again unchanged.

const cell = (v: string | number | boolean | null | undefined) =>
  v == null ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v;

function teamName(id: string | null | undefined, teams: CsvContext['teams']): string {
  return id ? (teams.find((t) => t.id === id)?.name ?? '') : '';
}

export function shellsToCsv(shells: readonly Shell[], teams: CsvContext['teams']): string {
  const header = [
    'name',
    'nickname',
    'boat_class',
    'compatible_classes',
    'rigging',
    'manufacturer',
    'model',
    'serial',
    'year',
    'weight_class_label',
    'stroke_side',
    'cox_position',
    'shoes',
    'spread_cm',
    'span_cm',
    'level',
    'gender_affinity',
    'home_team',
    'location',
    'status',
    'rigger_type',
    'rigger_count',
    'length_cm',
    'beam_cm',
    'weight_kg',
    'is_private',
    'notes',
  ];
  const rows = shells.map((s) =>
    [
      s.name,
      s.nickname,
      s.boatClass,
      s.compatibleClasses.filter((c) => c !== s.boatClass).join(';'),
      s.rigging,
      s.manufacturer,
      s.model,
      s.serial,
      s.year,
      s.weightClassLabel,
      s.strokeSide,
      s.coxPosition,
      s.shoes,
      s.spreadCm,
      s.spanCm,
      s.level,
      s.genderAffinity,
      teamName(s.homeTeamId, teams),
      s.location,
      s.status,
      s.riggerType,
      s.riggerCount,
      s.lengthCm,
      s.beamCm,
      s.weightKg,
      s.isPrivate,
      s.notes,
    ].map(cell),
  );
  return toCsv(header, rows);
}

export function oarSetsToCsv(sets: readonly OarSet[], teams: CsvContext['teams']): string {
  const header = [
    'name',
    'type',
    'color',
    'count',
    'blade',
    'length_cm',
    'inboard_cm',
    'grip_mm',
    'gender_affinity',
    'home_team',
    'status',
    'notes',
  ];
  const rows = sets.map((o) =>
    [
      o.name,
      o.type,
      o.color,
      o.count,
      o.blade,
      o.lengthCm,
      o.inboardCm,
      o.gripMm,
      o.genderAffinity,
      teamName(o.homeTeamId, teams),
      o.status,
      o.notes,
    ].map(cell),
  );
  return toCsv(header, rows);
}

export function gearToCsv(items: readonly GearItem[]): string {
  const header = ['category', 'name', 'quantity', 'default_load', 'notes'];
  const rows = items.map((g) => [g.category, g.name, g.quantity, g.defaultLoad, g.notes].map(cell));
  return toCsv(header, rows);
}
