// The trailer editor's unsaved draft: the trailer, its shelves, and its compartments as the form
// holds them, with number fields that may be blank or invalid while someone types. Pure:
// converting records to a draft, a draft to a packer TrailerDef for the live diagram, validation,
// shelf edits, and the batch of writes that saves it.

import {
  BOAT_CLASSES,
  zoneOverlaps,
  type BoatClass,
  type CompartmentDef,
  type ColumnKey,
  type CompartmentKind,
  type Id,
  type LaneAccess,
  type Rule,
  type ShelfDef,
  type Trailer,
  type TrailerCompartment,
  type TrailerDef,
  type TrailerShelf,
  type TrailerStyle,
} from '@regatta-ops/domain';
import { batchOp, type BatchOp } from '@/data';

/** A number field: null when blank, NaN when not a number. */
export type NumberValue = number | null;

export interface ShelfDraft {
  id: Id;
  label: string;
  tier: NumberValue;
  columnKey: ColumnKey;
  widthCm: NumberValue;
  lengthCm: NumberValue;
  frontOverhangMaxCm: NumberValue;
  rearOverhangMaxCm: NumberValue;
  allowedClasses: BoatClass[];
  lanesOverride: NumberValue;
  laneAccess: LaneAccess;
  maxBoats: NumberValue;
  maxWeightKg: NumberValue;
  accessRank: NumberValue;
  active: boolean;
}

export interface CompartmentDraft {
  id: Id;
  kind: CompartmentKind;
  label: string;
  capacity: NumberValue;
  capacityUnit: string;
  /**
   * Where it sits along the frame, cm from the front. Blank "from" is the front and blank "to"
   * the back; both blank, the whole length.
   */
  startCm: NumberValue;
  endCm: NumberValue;
}

export interface TrailerDraft {
  id: Id;
  name: string;
  style: TrailerStyle;
  frameLengthCm: NumberValue;
  widthCm: NumberValue;
  postOffsetPct: NumberValue;
  bowForwardDefault: boolean;
  notes: string;
  defaultRules: Rule[];
  shelves: ShelfDraft[];
  compartments: CompartmentDraft[];
}

export interface SavedTrailer {
  trailer: Trailer;
  shelves: TrailerShelf[];
  compartments: TrailerCompartment[];
}

export const COMPARTMENT_KIND_LABELS: Record<CompartmentKind, string> = {
  bed: 'Bed',
  oar_box: 'Oar box',
  oar_tube: 'Oar tube',
  oar_rack: 'Oar rack',
  rigger_rack: 'Rigger rack',
  storage: 'Storage',
};

export function defaultUnit(kind: CompartmentKind): string {
  if (kind === 'oar_box' || kind === 'oar_tube' || kind === 'oar_rack') return 'oars';
  if (kind === 'rigger_rack') return 'riggers';
  return 'loads';
}

// ---------------------------------------------------------------------------
// Conversions

function byShelfOrder(a: TrailerShelf, b: TrailerShelf): number {
  return a.sortOrder - b.sortOrder || a.tier - b.tier || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function shelfDraftFromRecord(s: TrailerShelf): ShelfDraft {
  return {
    id: s.id,
    label: s.label,
    tier: s.tier,
    columnKey: s.columnKey,
    widthCm: s.widthCm,
    lengthCm: s.lengthCm,
    frontOverhangMaxCm: s.frontOverhangMaxCm,
    rearOverhangMaxCm: s.rearOverhangMaxCm,
    allowedClasses: BOAT_CLASSES.filter((c) => (s.allowedClasses ?? []).includes(c)),
    lanesOverride: s.lanesOverride && s.lanesOverride > 0 ? s.lanesOverride : null,
    laneAccess: s.laneAccess,
    maxBoats: s.maxBoats ?? null,
    maxWeightKg: s.maxWeightKg ?? null,
    accessRank: s.accessRank,
    active: s.active,
  };
}

export function draftFromRecords(saved: SavedTrailer): TrailerDraft {
  const t = saved.trailer;
  return {
    id: t.id,
    name: t.name,
    style: t.style,
    frameLengthCm: t.frameLengthCm,
    widthCm: t.widthCm,
    postOffsetPct: t.postOffsetPct ?? null,
    bowForwardDefault: t.bowForwardDefault,
    notes: t.notes ?? '',
    defaultRules: t.defaultRules ?? [],
    shelves: saved.shelves
      .filter((s) => s.trailerId === t.id)
      .sort(byShelfOrder)
      .map(shelfDraftFromRecord),
    compartments: saved.compartments
      .filter((c) => c.trailerId === t.id)
      .map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.label,
        capacity: c.capacity,
        capacityUnit: c.capacityUnit ?? defaultUnit(c.kind),
        // A zone that starts at the front is stored with a blank start: show it as 0.
        startCm: c.startCm ?? (c.endCm != null ? 0 : null),
        endCm: c.endCm ?? null,
      })),
  };
}

function shelfDraftFromDef(s: ShelfDef): ShelfDraft {
  return {
    id: s.id,
    label: s.label,
    tier: s.tier,
    columnKey: s.columnKey,
    widthCm: s.widthCm,
    lengthCm: s.lengthCm,
    frontOverhangMaxCm: s.frontOverhangMaxCm,
    rearOverhangMaxCm: s.rearOverhangMaxCm,
    allowedClasses: s.allowedClasses ? [...s.allowedClasses] : [],
    lanesOverride: s.lanesOverride ?? null,
    laneAccess: s.laneAccess,
    maxBoats: s.maxBoats ?? null,
    maxWeightKg: s.maxWeightKg ?? null,
    accessRank: s.accessRank,
    active: s.active,
  };
}

/** A draft from a packer definition (the "New trailer" presets). */
export function draftFromDef(def: TrailerDef, rules: Rule[], notes = ''): TrailerDraft {
  return {
    id: def.id,
    name: def.name,
    style: def.style,
    frameLengthCm: def.frameLengthCm,
    widthCm: def.widthCm,
    postOffsetPct: def.style === 'offset_post' ? (def.postOffsetPct ?? 33) : null,
    bowForwardDefault: def.bowForwardDefault ?? true,
    notes,
    defaultRules: rules,
    shelves: def.shelves.map(shelfDraftFromDef),
    compartments: def.compartments.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.label,
      capacity: c.capacity,
      capacityUnit: defaultUnit(c.kind),
      startCm: c.startCm ?? null,
      endCm: c.endCm ?? null,
    })),
  };
}

function num(v: NumberValue, fallback = 0): number {
  return v !== null && Number.isFinite(v) ? v : fallback;
}

function optionalPositive(v: NumberValue): number | undefined {
  return v !== null && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * The packer's view of the draft, for the live diagram and the test pack. Blank or invalid
 * numbers count as 0; shelves without a valid level are left out until they have one.
 */
export function defFromDraft(d: TrailerDraft): TrailerDef {
  return {
    id: d.id,
    name: d.name.trim() || 'New trailer',
    style: d.style,
    ...(d.style === 'offset_post' ? { postOffsetPct: num(d.postOffsetPct, 33) } : {}),
    frameLengthCm: num(d.frameLengthCm),
    widthCm: num(d.widthCm),
    bowForwardDefault: d.bowForwardDefault,
    shelves: d.shelves
      .filter((s) => s.tier !== null && Number.isInteger(s.tier) && s.tier >= 1)
      .map((s): ShelfDef => {
        const lanes = optionalPositive(s.lanesOverride);
        const maxBoats =
          s.maxBoats !== null && Number.isFinite(s.maxBoats) ? s.maxBoats : undefined;
        const maxWeightKg = optionalPositive(s.maxWeightKg);
        return {
          id: s.id,
          label: s.label.trim(),
          tier: s.tier!,
          columnKey: s.columnKey,
          widthCm: Math.max(0, num(s.widthCm)),
          lengthCm: Math.max(0, num(s.lengthCm)),
          frontOverhangMaxCm: Math.max(0, num(s.frontOverhangMaxCm)),
          rearOverhangMaxCm: Math.max(0, num(s.rearOverhangMaxCm)),
          ...(s.allowedClasses.length > 0 ? { allowedClasses: s.allowedClasses } : {}),
          ...(lanes !== undefined ? { lanesOverride: Math.round(lanes) } : {}),
          laneAccess: s.laneAccess,
          ...(maxBoats !== undefined ? { maxBoats } : {}),
          ...(maxWeightKg !== undefined ? { maxWeightKg } : {}),
          accessRank: num(s.accessRank, s.tier!),
          active: s.active,
        };
      }),
    compartments: d.compartments.map((c) => compartmentDefFromDraft(c, num(d.frameLengthCm))),
  };
}

/**
 * A draft compartment as the diagrams read it: a zone with both ends when either is typed (a
 * blank start is the front, a blank end the back), else the whole length. Invalid numbers
 * count as blank while someone types.
 */
function compartmentDefFromDraft(c: CompartmentDraft, frameLengthCm: number): CompartmentDef {
  const def: CompartmentDef = {
    id: c.id,
    kind: c.kind,
    label: c.label.trim() || COMPARTMENT_KIND_LABELS[c.kind],
    capacity: num(c.capacity),
  };
  const start = isNum(c.startCm) ? c.startCm : null;
  const end = isNum(c.endCm) ? c.endCm : null;
  if (start === null && end === null) return def;
  return { ...def, startCm: Math.max(0, start ?? 0), endCm: end ?? frameLengthCm };
}

// ---------------------------------------------------------------------------
// Validation

export type DraftErrors = Record<string, string>;

/** Error key for a field: 'name', 'shelf:<id>:widthCm', 'compartment:<id>:label'. */
export const fieldKey = {
  trailer: (field: keyof TrailerDraft) => field,
  shelf: (id: Id, field: keyof ShelfDraft) => `shelf:${id}:${field}`,
  compartment: (id: Id, field: keyof CompartmentDraft) => `compartment:${id}:${field}`,
};

function isNum(v: NumberValue): v is number {
  return v !== null && Number.isFinite(v);
}

export function validateDraft(d: TrailerDraft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.name.trim()) e.name = 'Enter a name.';
  if (!isNum(d.frameLengthCm) || d.frameLengthCm <= 0) {
    e.frameLengthCm = 'Enter the frame length in centimeters.';
  }
  if (!isNum(d.widthCm) || d.widthCm <= 0) e.widthCm = 'Enter the width in centimeters.';
  if (
    d.style === 'offset_post' &&
    (!isNum(d.postOffsetPct) || d.postOffsetPct <= 0 || d.postOffsetPct >= 100)
  ) {
    e.postOffsetPct = 'Enter a percentage between 1 and 99.';
  }
  for (const s of d.shelves) {
    const k = (f: keyof ShelfDraft) => fieldKey.shelf(s.id, f);
    if (!s.label.trim()) e[k('label')] = 'Enter a label.';
    if (!isNum(s.tier) || !Number.isInteger(s.tier) || s.tier < 1) {
      e[k('tier')] = 'Level is a whole number, 1 at the bottom.';
    }
    if (!isNum(s.widthCm) || s.widthCm <= 0) e[k('widthCm')] = 'Width must be more than 0 cm.';
    if (!isNum(s.lengthCm) || s.lengthCm <= 0) e[k('lengthCm')] = 'Length must be more than 0 cm.';
    if (!isNum(s.frontOverhangMaxCm) || s.frontOverhangMaxCm < 0) {
      e[k('frontOverhangMaxCm')] = 'Front overhang is 0 cm or more.';
    }
    if (!isNum(s.rearOverhangMaxCm) || s.rearOverhangMaxCm < 0) {
      e[k('rearOverhangMaxCm')] = 'Rear overhang is 0 cm or more.';
    }
    if (
      s.lanesOverride !== null &&
      (!isNum(s.lanesOverride) ||
        !Number.isInteger(s.lanesOverride) ||
        s.lanesOverride < 1 ||
        s.lanesOverride > 8)
    ) {
      e[k('lanesOverride')] = 'Lanes is blank or a whole number from 1 to 8.';
    }
    if (
      s.maxBoats !== null &&
      (!isNum(s.maxBoats) || !Number.isInteger(s.maxBoats) || s.maxBoats < 0)
    ) {
      e[k('maxBoats')] = 'Most boats is blank or a whole number.';
    }
    if (s.maxWeightKg !== null && (!isNum(s.maxWeightKg) || s.maxWeightKg <= 0)) {
      e[k('maxWeightKg')] = 'Most weight is blank or more than 0 kg.';
    }
    if (!isNum(s.accessRank) || !Number.isInteger(s.accessRank) || s.accessRank < 1) {
      e[k('accessRank')] = 'Access rank is a whole number, 1 for the easiest to reach.';
    }
  }
  const frame = isNum(d.frameLengthCm) && d.frameLengthCm > 0 ? d.frameLengthCm : null;
  for (const c of d.compartments) {
    const k = (f: keyof CompartmentDraft) => fieldKey.compartment(c.id, f);
    if (!c.label.trim()) e[k('label')] = 'Enter a label.';
    if (!isNum(c.capacity) || c.capacity < 0) e[k('capacity')] = 'Capacity is 0 or more.';
    // Where it sits along the frame: inside the frame, starting before it ends.
    const start = c.startCm;
    const end = c.endCm;
    if (start !== null && (!isNum(start) || start < 0 || (frame !== null && start >= frame))) {
      e[k('startCm')] = frame
        ? `From front is 0 or more and inside the ${frame} cm frame.`
        : 'From front is 0 or more.';
    } else if (end !== null && (!isNum(end) || end <= 0 || (frame !== null && end > frame))) {
      e[k('endCm')] = frame
        ? `To is more than 0 and at most ${frame} cm, the back of the frame.`
        : 'To is more than 0.';
    } else if (isNum(start) && isNum(end) && end <= start) {
      e[k('endCm')] = 'To must be further back than From front.';
    }
  }
  return e;
}

/** The name a compartment goes by in messages. */
function compartmentName(c: CompartmentDraft, i: number): string {
  return c.label.trim() || `Compartment ${i + 1}`;
}

/**
 * Things worth a second look that do not stop a save: compartments that share part of the bed
 * ("Slings and Oars overlap by 20 cm."). Two that both run the whole length share it side by
 * side, as they always have, so they pass.
 */
export function draftWarnings(d: TrailerDraft): string[] {
  const names = new Map(d.compartments.map((c, i) => [c.id, compartmentName(c, i)]));
  const whole = new Set(
    d.compartments.filter((c) => !isNum(c.startCm) && !isNum(c.endCm)).map((c) => c.id),
  );
  return zoneOverlaps(defFromDraft(d)).map(({ a, b, cm }) => {
    const [x, y] = [names.get(a)!, names.get(b)!];
    if (whole.has(a) || whole.has(b)) {
      const [wholeName, other] = whole.has(a) ? [x, y] : [y, x];
      return `${wholeName} runs the whole length, so it overlaps ${other}. Give it a place along the frame.`;
    }
    return `${x} and ${y} overlap by ${Math.round(cm)} cm.`;
  });
}

// ---------------------------------------------------------------------------
// Shelf edits

type ShelfTemplate = Omit<ShelfDraft, 'id'>;

function relabel(label: string, from: number, to: number): string {
  const numbered = label.replace(
    /\b(level|rack|tier)(\s+)(\d+)\b/i,
    (m, word: string, sp: string, n: string) => (Number(n) === from ? `${word}${sp}${to}` : m),
  );
  if (numbered !== label) return numbered;
  const top = label.match(/^top\s+(level|rack|tier)\b(.*)$/i);
  if (top) return `${top[1]![0]!.toUpperCase()}${top[1]!.slice(1).toLowerCase()} ${to}${top[2]}`;
  return label;
}

function blankShelves(style: TrailerStyle, tier: number, lengthCm: number): ShelfTemplate[] {
  const base = {
    tier,
    lengthCm,
    frontOverhangMaxCm: 250,
    rearOverhangMaxCm: 300,
    allowedClasses: [] as BoatClass[],
    lanesOverride: null,
    maxBoats: null,
    maxWeightKg: null,
    accessRank: tier,
    active: true,
  };
  if (style === 'goalpost') {
    return [{ ...base, label: `Rack ${tier}`, columnKey: 'full', widthCm: 240, laneAccess: 'any' }];
  }
  if (style === 'center_post') {
    return [
      {
        ...base,
        label: `Rack ${tier}, driver side`,
        columnKey: 'left',
        widthCm: 100,
        laneAccess: 'any',
      },
      {
        ...base,
        label: `Rack ${tier}, curb side`,
        columnKey: 'right',
        widthCm: 100,
        laneAccess: 'any',
      },
    ];
  }
  return [
    {
      ...base,
      label: `Level ${tier}, narrow side`,
      columnKey: 'left',
      widthCm: 75,
      laneAccess: 'any',
    },
    {
      ...base,
      label: `Level ${tier}, wide side`,
      columnKey: 'right',
      widthCm: 150,
      laneAccess: 'outer_first',
    },
  ];
}

function topTier(d: TrailerDraft): number {
  return d.shelves.reduce((m, s) => (isNum(s.tier) ? Math.max(m, s.tier) : m), 0);
}

/**
 * A new level on top: a copy of the current top level's shelves one tier up (labels
 * renumbered), or the style's usual shelves when there are none.
 */
export function addLevel(d: TrailerDraft, newId: () => string): TrailerDraft {
  const top = topTier(d);
  const next = top + 1;
  const source = d.shelves.filter((s) => s.tier === top);
  const added: ShelfDraft[] =
    source.length > 0
      ? source.map((s) => ({
          ...s,
          allowedClasses: [...s.allowedClasses],
          id: newId(),
          tier: next,
          label: relabel(s.label, top, next),
          accessRank: isNum(s.accessRank) ? s.accessRank + 1 : next,
        }))
      : blankShelves(d.style, next, num(d.frameLengthCm, 1220)).map((s) => ({ ...s, id: newId() }));
  return { ...d, shelves: [...d.shelves, ...added] };
}

/** One more shelf on the top level (or level 1), after the others. */
export function addShelf(d: TrailerDraft, newId: () => string): TrailerDraft {
  const tier = Math.max(1, topTier(d));
  const template = blankShelves(d.style, tier, num(d.frameLengthCm, 1220));
  const last = template[template.length - 1]!;
  return {
    ...d,
    shelves: [...d.shelves, { ...last, id: newId(), label: `${last.label} (new)` }],
  };
}

export function duplicateShelf(d: TrailerDraft, id: Id, newId: () => string): TrailerDraft {
  const i = d.shelves.findIndex((s) => s.id === id);
  if (i < 0) return d;
  const src = d.shelves[i]!;
  const copy: ShelfDraft = {
    ...src,
    allowedClasses: [...src.allowedClasses],
    id: newId(),
    label: `${src.label} (copy)`,
  };
  return { ...d, shelves: [...d.shelves.slice(0, i + 1), copy, ...d.shelves.slice(i + 1)] };
}

export function removeShelf(d: TrailerDraft, id: Id): TrailerDraft {
  return { ...d, shelves: d.shelves.filter((s) => s.id !== id) };
}

export function updateShelf(d: TrailerDraft, id: Id, patch: Partial<ShelfDraft>): TrailerDraft {
  return { ...d, shelves: d.shelves.map((s) => (s.id === id ? { ...s, ...patch } : s)) };
}

export function updateCompartment(
  d: TrailerDraft,
  id: Id,
  patch: Partial<CompartmentDraft>,
): TrailerDraft {
  return {
    ...d,
    compartments: d.compartments.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

// ---------------------------------------------------------------------------
// Saving

function shelfRecord(
  s: ShelfDraft,
  trailerId: Id,
  sortOrder: number,
): Omit<TrailerShelf, 'id' | 'created' | 'updated'> {
  return {
    trailerId,
    label: s.label.trim(),
    tier: num(s.tier, 1),
    columnKey: s.columnKey,
    widthCm: num(s.widthCm),
    lengthCm: num(s.lengthCm),
    frontOverhangMaxCm: num(s.frontOverhangMaxCm),
    rearOverhangMaxCm: num(s.rearOverhangMaxCm),
    allowedClasses: [...s.allowedClasses],
    lanesOverride: isNum(s.lanesOverride) ? s.lanesOverride : null,
    laneAccess: s.laneAccess,
    maxBoats: isNum(s.maxBoats) ? s.maxBoats : null,
    maxWeightKg: isNum(s.maxWeightKg) ? s.maxWeightKg : null,
    accessRank: num(s.accessRank, 1),
    active: s.active,
    sortOrder,
  };
}

/** 0 and blank are the same for a zone's ends (PocketBase stores 0 as blank). */
function zoneEnd(v: NumberValue | undefined): number | null {
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

function compartmentRecord(
  c: CompartmentDraft,
  trailerId: Id,
): Omit<TrailerCompartment, 'id' | 'created' | 'updated'> {
  return {
    trailerId,
    kind: c.kind,
    label: c.label.trim(),
    capacity: num(c.capacity),
    capacityUnit: c.capacityUnit.trim() || defaultUnit(c.kind),
    startCm: zoneEnd(c.startCm),
    endCm: zoneEnd(c.endCm),
  };
}

function trailerRecord(d: TrailerDraft): Omit<Trailer, 'id' | 'created' | 'updated'> {
  return {
    name: d.name.trim(),
    style: d.style,
    frameLengthCm: num(d.frameLengthCm),
    widthCm: num(d.widthCm),
    postOffsetPct: d.style === 'offset_post' && isNum(d.postOffsetPct) ? d.postOffsetPct : null,
    bowForwardDefault: d.bowForwardDefault,
    notes: d.notes,
    defaultRules: d.defaultRules,
  };
}

/** Sorted-key JSON, so records compare by content. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function pick<T extends object>(rec: T, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) out[k] = rec[k];
  return out;
}

/** Only the fields that differ, or null when nothing does. */
function patchOf<T extends object>(before: Partial<T>, after: T): Partial<T> | null {
  const patch: Partial<T> = {};
  let changed = false;
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (canonical(before[k]) !== canonical(after[k])) {
      patch[k] = after[k];
      changed = true;
    }
  }
  return changed ? patch : null;
}

/**
 * The writes that make the stored trailer match the draft, for one atomic batch: the trailer,
 * then removed, new, and changed shelves, then compartments. `saved` is null for a new trailer.
 */
export function saveOps(saved: SavedTrailer | null, d: TrailerDraft): BatchOp[] {
  const ops: BatchOp[] = [];
  const t = trailerRecord(d);
  if (!saved) {
    ops.push(batchOp.create('trailers', { id: d.id, ...t }));
  } else {
    const patch = patchOf(pick(saved.trailer, Object.keys(t) as (keyof Trailer)[]), t);
    if (patch) ops.push(batchOp.update('trailers', d.id, patch));
  }

  const oldShelves = new Map((saved?.shelves ?? []).map((s) => [s.id, s]));
  const keepShelves = new Set(d.shelves.map((s) => s.id));
  for (const s of saved?.shelves ?? []) {
    if (!keepShelves.has(s.id)) ops.push(batchOp.delete('trailer_shelves', s.id));
  }
  d.shelves.forEach((s, i) => {
    const rec = shelfRecord(s, d.id, i + 1);
    const old = oldShelves.get(s.id);
    if (!old) ops.push(batchOp.create('trailer_shelves', { id: s.id, ...rec }));
    else {
      const patch = patchOf(
        {
          ...pick(old, Object.keys(rec) as (keyof TrailerShelf)[]),
          allowedClasses: old.allowedClasses ?? [],
          lanesOverride: old.lanesOverride ?? null,
          maxBoats: old.maxBoats ?? null,
          maxWeightKg: old.maxWeightKg ?? null,
        },
        rec,
      );
      if (patch) ops.push(batchOp.update('trailer_shelves', s.id, patch));
    }
  });

  const oldComps = new Map((saved?.compartments ?? []).map((c) => [c.id, c]));
  const keepComps = new Set(d.compartments.map((c) => c.id));
  for (const c of saved?.compartments ?? []) {
    if (!keepComps.has(c.id)) ops.push(batchOp.delete('trailer_compartments', c.id));
  }
  for (const c of d.compartments) {
    const rec = compartmentRecord(c, d.id);
    const old = oldComps.get(c.id);
    if (!old) ops.push(batchOp.create('trailer_compartments', { id: c.id, ...rec }));
    else {
      const patch = patchOf(
        {
          ...pick(old, Object.keys(rec) as (keyof TrailerCompartment)[]),
          capacityUnit: old.capacityUnit ?? defaultUnit(old.kind),
          startCm: zoneEnd(old.startCm),
          endCm: zoneEnd(old.endCm),
        },
        rec,
      );
      if (patch) ops.push(batchOp.update('trailer_compartments', c.id, patch));
    }
  }
  return ops;
}

/** Whether two drafts would save the same records. */
export function sameDraft(a: TrailerDraft, b: TrailerDraft): boolean {
  return canonical(a) === canonical(b);
}

/** Saved shelves the draft removes (their placements in load plans go with them). */
export function removedShelfIds(saved: SavedTrailer | null, d: TrailerDraft): Id[] {
  const keep = new Set(d.shelves.map((s) => s.id));
  return (saved?.shelves ?? []).filter((s) => !keep.has(s.id)).map((s) => s.id);
}
