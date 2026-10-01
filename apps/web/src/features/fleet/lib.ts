// Pure helpers for the fleet inventory (PLAN.md §16.1): labels, class defaults for new and edited
// shells, table filters and grouping, and a shell's or oar set's upcoming use. No React here; the
// components and tests share these.

import {
  boatClassSpec,
  clockAt,
  defaultRiggerCount,
  kgToLb,
  parseWeightClassLabel,
  shellClasses,
  type BoatClass,
  type EquipmentStatus,
  type Entry,
  type GearCategory,
  type GenderAffinity,
  type OarSet,
  type Regatta,
  type RegattaEvent,
  type RiggerType,
  type Rigging,
  type Shell,
  type ShellRigging,
} from '@regatta-ops/domain';

// ---------------------------------------------------------------------------
// Labels (glossary words, sentence case)

export const EQUIPMENT_STATUSES = ['in_service', 'limited', 'out_of_service', 'retired'] as const;

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  in_service: 'In service',
  limited: 'Limited',
  out_of_service: 'Out of service',
  retired: 'Retired',
};

export const AFFINITY_ORDER: readonly GenderAffinity[] = ['women', 'men', 'any'];

export const AFFINITY_LABELS: Record<GenderAffinity, string> = {
  women: "Women's",
  men: "Men's",
  any: 'Any',
};

export const RIGGING_LABELS: Record<ShellRigging, string> = {
  sweep: 'Sweep',
  scull: 'Scull',
  convertible: 'Convertible',
};

export const OAR_TYPE_LABELS: Record<Rigging, string> = { sweep: 'Sweep', scull: 'Scull' };

export type ShellLevel = NonNullable<Shell['level']>;
export const SHELL_LEVELS: readonly ShellLevel[] = ['beginner', 'intermediate', 'racer'];
export const LEVEL_LABELS: Record<ShellLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  racer: 'Racer',
};

export const STROKE_SIDE_LABELS = { port: 'Port rig', starboard: 'Starboard rig' } as const;
export const COX_POSITION_LABELS = { stern: 'Stern', bow: 'Bow' } as const;
export const RIGGER_TYPE_LABELS: Record<RiggerType, string> = {
  side: 'Side',
  wing: 'Wing',
  none: 'None',
};

export const GEAR_CATEGORY_LABELS: Record<GearCategory, string> = {
  cox_box: 'Cox box',
  slings: 'Slings',
  rigger_set: 'Rigger set',
  tool_kit: 'Tool kit',
  tent: 'Tent',
  launch: 'Launch',
  straps: 'Straps',
  spare_parts: 'Spare parts',
  other: 'Other',
};

/** Spoken names, shown next to the class symbol in the class picker. */
export const CLASS_NAMES: Record<BoatClass, string> = {
  '8+': 'Eight',
  '4+': 'Coxed four',
  '4-': 'Coxless four',
  '4x+': 'Coxed quad',
  '4x': 'Quad',
  '2+': 'Coxed pair',
  '2-': 'Pair',
  '2x': 'Double',
  '1x': 'Single',
};

/** The club list's order: eights first, singles last. */
export const CLASS_ORDER: readonly BoatClass[] = [
  '8+',
  '4+',
  '4-',
  '4x+',
  '4x',
  '2+',
  '2-',
  '2x',
  '1x',
];

// ---------------------------------------------------------------------------
// Class defaults (§16.1)

/** The shell fields that follow the boat class until someone sets them. */
export interface ClassDefaultFields {
  boatClass: BoatClass;
  compatibleClasses: BoatClass[];
  rigging: ShellRigging;
  coxPosition?: 'stern' | 'bow' | null;
  lengthCm?: number | null;
  beamCm?: number | null;
  weightKg?: number | null;
  riggerType: RiggerType;
  riggerCount?: number | null;
}

export type DimensionField = 'lengthCm' | 'beamCm' | 'weightKg';

export const DIMENSION_FIELDS: readonly DimensionField[] = ['lengthCm', 'beamCm', 'weightKg'];

/** §16.1's value for a dimension: hull length and beam in cm, minimum weight in kg. */
export function classDimension(cls: BoatClass, field: DimensionField): number {
  const spec = boatClassSpec(cls);
  if (field === 'lengthCm') return spec.defaultLengthCm;
  if (field === 'beamCm') return spec.defaultBeamCm;
  return spec.defaultWeightKg;
}

/** Sweep or scull from the class; convertible when the classes it races as differ in rigging or coxing. */
export function suggestedRigging(own: BoatClass, compatible: readonly BoatClass[]): ShellRigging {
  const specs = [own, ...compatible].map(boatClassSpec);
  const riggings = new Set(specs.map((s) => s.rigging));
  const coxed = new Set(specs.map((s) => s.coxed));
  if (riggings.size > 1 || coxed.size > 1) return 'convertible';
  return boatClassSpec(own).rigging;
}

/** Every class-derived field for a new shell of this class. */
export function classDefaults(cls: BoatClass, riggerType: RiggerType = 'side') {
  const spec = boatClassSpec(cls);
  return {
    boatClass: cls,
    compatibleClasses: [] as BoatClass[],
    rigging: spec.rigging as ShellRigging,
    coxPosition: spec.coxed ? ('stern' as const) : null,
    lengthCm: spec.defaultLengthCm,
    beamCm: spec.defaultBeamCm,
    weightKg: spec.defaultWeightKg,
    riggerType,
    riggerCount: defaultRiggerCount(cls, riggerType),
  };
}

/** The input for a new shell of this class: §16.1 defaults, in service, no team. */
export function newShellInput(cls: BoatClass): Omit<Shell, 'id' | 'created' | 'updated'> {
  return {
    name: '',
    nickname: '',
    ...classDefaults(cls),
    manufacturer: '',
    model: '',
    serial: '',
    year: null,
    weightClassLabel: '',
    crewWeightMinKg: null,
    crewWeightMaxKg: null,
    strokeSide: boatClassSpec(cls).rigging === 'sweep' ? 'port' : null,
    shoes: '',
    spreadCm: null,
    spanCm: null,
    level: null,
    genderAffinity: 'any',
    homeTeamId: null,
    location: '',
    status: 'in_service',
    isPrivate: false,
    notes: '',
  };
}

const isAt = (value: number | null | undefined, def: number) => value == null || value === def;

/**
 * Switch a shell to another class. Fields still at the old class's default (or empty) follow
 * the new class; a value someone typed stays. The new class leaves the compatible list.
 */
export function applyClassChange<T extends ClassDefaultFields>(values: T, next: BoatClass): T {
  const prev = values.boatClass;
  if (prev === next) return values;
  const prevSpec = boatClassSpec(prev);
  const nextSpec = boatClassSpec(next);
  const out: T = { ...values, boatClass: next };
  for (const f of DIMENSION_FIELDS) {
    if (isAt(values[f], classDimension(prev, f))) out[f] = classDimension(next, f);
  }
  if (isAt(values.riggerCount, defaultRiggerCount(prev, values.riggerType))) {
    out.riggerCount = defaultRiggerCount(next, values.riggerType);
  }
  out.compatibleClasses = values.compatibleClasses.filter((c) => c !== next);
  if (values.rigging === suggestedRigging(prev, values.compatibleClasses)) {
    out.rigging = suggestedRigging(next, out.compatibleClasses);
  }
  if (nextSpec.coxed && !prevSpec.coxed && values.coxPosition == null) out.coxPosition = 'stern';
  if (!nextSpec.coxed && prevSpec.coxed && values.coxPosition === 'stern') out.coxPosition = null;
  return out;
}

/** Change the rigger type; the count follows when it was still the old type's default. */
export function applyRiggerTypeChange<T extends ClassDefaultFields>(
  values: T,
  next: RiggerType,
): T {
  const out: T = { ...values, riggerType: next };
  if (isAt(values.riggerCount, defaultRiggerCount(values.boatClass, values.riggerType))) {
    out.riggerCount = defaultRiggerCount(values.boatClass, next);
  }
  return out;
}

/** Change the compatible classes; rigging follows when it was still the suggested one. */
export function applyCompatibleChange<T extends ClassDefaultFields>(
  values: T,
  next: BoatClass[],
): T {
  const clean = next.filter((c) => c !== values.boatClass);
  const out: T = { ...values, compatibleClasses: clean };
  if (values.rigging === suggestedRigging(values.boatClass, values.compatibleClasses)) {
    out.rigging = suggestedRigging(values.boatClass, clean);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Weights

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The crew range stored with a shell, from the club's label ('165-200', 'LWT', '<240'). */
export function crewRangeFromLabel(label: string | null | undefined): {
  crewWeightMinKg: number | null;
  crewWeightMaxKg: number | null;
} {
  const { minKg, maxKg } = parseWeightClassLabel(label);
  return {
    crewWeightMinKg: minKg == null ? null : round1(minKg),
    crewWeightMaxKg: maxKg == null ? null : round1(maxKg),
  };
}

function inUnit(kg: number, unit: 'kg' | 'lb'): number {
  return Math.round(unit === 'kg' ? kg : kgToLb(kg));
}

/** "165–200 lb", "Up to 240 lb", "200 lb and up", in the viewer's unit; null when unknown. */
export function crewRangeText(
  range: { crewWeightMinKg?: number | null; crewWeightMaxKg?: number | null },
  unit: 'kg' | 'lb',
): string | null {
  const min = range.crewWeightMinKg;
  const max = range.crewWeightMaxKg;
  if (min != null && max != null) return `${inUnit(min, unit)}–${inUnit(max, unit)} ${unit}`;
  if (max != null) return `Up to ${inUnit(max, unit)} ${unit}`;
  if (min != null) return `${inUnit(min, unit)} ${unit} and up`;
  return null;
}

// ---------------------------------------------------------------------------
// Oar counts

/** "9 oars", or for sculls "6 sculls, 3 pairs". */
export function oarCountText(set: Pick<OarSet, 'type' | 'count'>): string {
  if (set.type === 'scull') {
    const pairs = set.count / 2;
    const pairText = Number.isInteger(pairs) ? `, ${pairs} ${pairs === 1 ? 'pair' : 'pairs'}` : '';
    return `${set.count} ${set.count === 1 ? 'scull' : 'sculls'}${pairText}`;
  }
  return `${set.count} ${set.count === 1 ? 'oar' : 'oars'}`;
}

// ---------------------------------------------------------------------------
// Search, filters, sorting, grouping

function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Every word of the query appears somewhere in the haystack fields. */
export function matchesSearch(query: string, fields: (string | null | undefined)[]): boolean {
  const words = norm(query).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = norm(fields.filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}

/** 'all' shows everything; 'none' matches records without a home team. */
export type TeamFilter = 'all' | 'none' | (string & {});

export interface ShellFilters {
  search: string;
  /** Shells that can race as this class (their own class or a compatible one). */
  boatClass: BoatClass | 'all';
  teamId: TeamFilter;
  status: EquipmentStatus | 'all';
  location: string;
  genderAffinity: GenderAffinity | 'all';
  level: ShellLevel | 'all';
  /** Retired shells are hidden unless this is on or the status filter asks for them. */
  showRetired: boolean;
}

export const DEFAULT_SHELL_FILTERS: ShellFilters = {
  search: '',
  boatClass: 'all',
  teamId: 'all',
  status: 'all',
  location: 'all',
  genderAffinity: 'all',
  level: 'all',
  showRetired: false,
};

function teamMatches(filter: TeamFilter, teamId: string | null | undefined): boolean {
  if (filter === 'all') return true;
  if (filter === 'none') return !teamId;
  return teamId === filter;
}

function retiredVisible(status: EquipmentStatus, f: { status: string; showRetired: boolean }) {
  return status !== 'retired' || f.showRetired || f.status === 'retired';
}

export function filterShells(shells: readonly Shell[], f: ShellFilters): Shell[] {
  return shells.filter(
    (s) =>
      retiredVisible(s.status, f) &&
      (f.status === 'all' || s.status === f.status) &&
      (f.boatClass === 'all' || shellClasses(s).includes(f.boatClass)) &&
      teamMatches(f.teamId, s.homeTeamId) &&
      (f.location === 'all' || (s.location ?? '') === f.location) &&
      (f.genderAffinity === 'all' || s.genderAffinity === f.genderAffinity) &&
      (f.level === 'all' || s.level === f.level) &&
      matchesSearch(f.search, [s.name, s.nickname, s.model, s.serial]),
  );
}

/** How many filters (not counting search) differ from the defaults. */
export function activeFilterCount<F extends object>(f: F, defaults: F): number {
  return (Object.keys(defaults) as (keyof F)[]).filter(
    (k) => k !== 'search' && f[k] !== defaults[k],
  ).length;
}

/** The club list's order: women's, men's, then any; eights to singles; then by name. */
export function compareShells(a: Shell, b: Shell): number {
  return (
    AFFINITY_ORDER.indexOf(a.genderAffinity) - AFFINITY_ORDER.indexOf(b.genderAffinity) ||
    CLASS_ORDER.indexOf(a.boatClass) - CLASS_ORDER.indexOf(b.boatClass) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })
  );
}

export function sortShells(shells: readonly Shell[]): Shell[] {
  return [...shells].sort(compareShells);
}

/** The club list's groups: gender affinity, then class ("Women's 8+"). */
export function shellGroup(s: Pick<Shell, 'genderAffinity' | 'boatClass'>): {
  key: string;
  label: string;
} {
  const who = s.genderAffinity === 'any' ? 'Any squad' : AFFINITY_LABELS[s.genderAffinity];
  return { key: `${s.genderAffinity}|${s.boatClass}`, label: `${who} ${s.boatClass}` };
}

/** Boathouse locations in use, in natural order (A1, A2, …, Berm, Meadow). */
export function distinctLocations(records: readonly { location?: string }[]): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const loc = r.location?.trim();
    if (loc) set.add(loc);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface OarSetFilters {
  search: string;
  type: Rigging | 'all';
  teamId: TeamFilter;
  status: EquipmentStatus | 'all';
  genderAffinity: GenderAffinity | 'all';
  showRetired: boolean;
}

export const DEFAULT_OAR_FILTERS: OarSetFilters = {
  search: '',
  type: 'all',
  teamId: 'all',
  status: 'all',
  genderAffinity: 'all',
  showRetired: false,
};

export function filterOarSets(sets: readonly OarSet[], f: OarSetFilters): OarSet[] {
  return sets.filter(
    (o) =>
      retiredVisible(o.status, f) &&
      (f.status === 'all' || o.status === f.status) &&
      (f.type === 'all' || o.type === f.type) &&
      teamMatches(f.teamId, o.homeTeamId) &&
      (f.genderAffinity === 'all' || o.genderAffinity === f.genderAffinity) &&
      matchesSearch(f.search, [o.name, o.color, o.blade, o.notes]),
  );
}

/** Sweep before scull, women's before men's, then by name. */
export function compareOarSets(a: OarSet, b: OarSet): number {
  return (
    (a.type === b.type ? 0 : a.type === 'sweep' ? -1 : 1) ||
    AFFINITY_ORDER.indexOf(a.genderAffinity) - AFFINITY_ORDER.indexOf(b.genderAffinity) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

// ---------------------------------------------------------------------------
// Upcoming use: a shell's drawer shows its usage across upcoming regattas

export interface UsageRow {
  entry: Entry;
  event: RegattaEvent | null;
  /** 'YYYY-MM-DD'; the regatta's first day when the entry has no event. */
  day: string;
  /** '9:40' in the regatta's timezone, or null when unscheduled or TBD. */
  time: string | null;
}

export interface UsageGroup {
  regatta: Regatta;
  rows: UsageRow[];
}

/**
 * Entries that use a shell or oar set in regattas that are not archived and not over, soonest
 * first. Scratched entries do not use the equipment and are left out.
 */
export function upcomingUsage(input: {
  entries: readonly Entry[];
  regattas: readonly Regatta[];
  events: readonly RegattaEvent[];
  /** Today, 'YYYY-MM-DD'. */
  today: string;
}): UsageGroup[] {
  const regattas = new Map(input.regattas.map((r) => [r.id, r]));
  const events = new Map(input.events.map((e) => [e.id, e]));
  const groups = new Map<string, UsageGroup>();
  for (const entry of input.entries) {
    if (entry.status === 'scratched') continue;
    const regatta = regattas.get(entry.regattaId);
    if (!regatta || regatta.status === 'archived') continue;
    if ((regatta.endDate || regatta.startDate) < input.today) continue;
    const event = entry.eventId ? (events.get(entry.eventId) ?? null) : null;
    const row: UsageRow = {
      entry,
      event,
      day: event?.day ?? regatta.startDate,
      time: event?.scheduledAt ? clockAt(event.scheduledAt, regatta.timezone) : null,
    };
    const group = groups.get(regatta.id) ?? { regatta, rows: [] };
    group.rows.push(row);
    groups.set(regatta.id, group);
  }
  const at = (r: UsageRow) => r.event?.scheduledAt ?? null;
  for (const g of groups.values()) {
    g.rows.sort((a, b) => {
      if (a.day !== b.day) return a.day < b.day ? -1 : 1;
      const ta = at(a);
      const tb = at(b);
      if (ta !== tb) {
        if (ta == null) return 1;
        if (tb == null) return -1;
        return ta < tb ? -1 : 1;
      }
      return a.entry.label.localeCompare(b.entry.label, undefined, { numeric: true });
    });
  }
  return [...groups.values()].sort((a, b) =>
    a.regatta.startDate === b.regatta.startDate
      ? a.regatta.name.localeCompare(b.regatta.name)
      : a.regatta.startDate < b.regatta.startDate
        ? -1
        : 1,
  );
}

/** "Event 14 · Men's Junior 8+", or the event name alone; "Unscheduled" without an event. */
export function eventText(event: Pick<RegattaEvent, 'eventNumber' | 'name'> | null): string {
  if (!event) return 'Unscheduled';
  return event.eventNumber ? `Event ${event.eventNumber} · ${event.name}` : event.name;
}

/**
 * The line over a table: "80 shells", "12 of 78 shells, 2 retired hidden". `retiredHidden` is
 * how many retired records the filters leave out (0 when they are shown).
 */
export function countText(shown: number, total: number, plural: string, retiredHidden = 0): string {
  const base = total - retiredHidden;
  const head = shown === base ? `${base} ${plural}` : `${shown} of ${base} ${plural}`;
  return retiredHidden > 0 ? `${head}, ${retiredHidden} retired hidden` : head;
}

// ---------------------------------------------------------------------------
// Files

/** "regatta-ops-shells-2026-09-29.csv" */
export function exportFileName(kind: 'shells' | 'oar-sets' | 'gear', today: string): string {
  return `regatta-ops-${kind}-${today}.csv`;
}
