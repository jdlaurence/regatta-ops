// Fleet: shells and oar sets from data/reference, and the gear list from the trailer sheet
// (PLAN.md §4.7, §14). Mapping rules are documented next to each helper.

import {
  BOAT_CLASSES,
  boatClassSpec,
  defaultRiggerCount,
  parseWeightClassLabel,
  type BoatClass,
  type EquipmentStatus,
  type GearCategory,
  type GearItem,
  type GenderAffinity,
  type Id,
  type OarSet,
  type RiggerType,
  type Seat,
  type Shell,
  type ShellRigging,
  type Side,
  type World,
} from '@srt/domain';
import { OAR_SET_ROWS, SHELL_ROWS } from './generated/reference';
import type { OarSetRow, ShellRow } from './reference-types';
import { SEED_TEAM_IDS, seedGearId, seedOarSetId, seedShellId } from './ids';
import { round1 } from './world';

const isBoatClass = (s: string): s is BoatClass => (BOAT_CLASSES as readonly string[]).includes(s);

function num(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function affinity(raw: string): GenderAffinity {
  return raw === 'women' || raw === 'men' ? raw : 'any';
}

/** Home team from gender affinity: women's equipment to Junior girls, men's to Junior boys. */
function homeTeamFor(a: GenderAffinity): Id | null {
  return a === 'women' ? SEED_TEAM_IDS.girls : a === 'men' ? SEED_TEAM_IDS.boys : null;
}

const MANUFACTURERS = ['Hudson', 'Vespoli', 'Filippi', 'Pocock', 'Wintech', 'Maas', 'Fluidesign'];

function manufacturerOf(model: string): string | undefined {
  const t = model.toLowerCase();
  if (t.includes('drew harris')) return 'Drew Harris';
  return MANUFACTURERS.find((m) => t.includes(m.toLowerCase()));
}

/** Hull lengths the model name states (recreational singles); everything else uses §16.1. */
const MODEL_LENGTH_CM: [RegExp, number][] = [
  [/^Maas 24$/i, 732],
  [/^Maas 27$/i, 823],
  [/^Maas Aero$/i, 610],
  [/Exp(lorer)? 21/i, 640],
];

/**
 * Classes a shell can race as. The Lundberg 4+ is the club's one 4+ used as a 4x+: the 2025
 * schedule lists it as "Lundberg 4x+ (rerig)" (PLAN.md §4.7), though shells.csv lists no
 * compatible classes for it.
 */
const COMPATIBLE_OVERRIDES: Record<string, BoatClass[]> = { Lundberg: ['4+', '4x+'] };

function compatibleClasses(row: ShellRow, own: BoatClass): BoatClass[] {
  const override = COMPATIBLE_OVERRIDES[row.name];
  if (override) return override;
  const listed = row.compatible_classes
    .split(';')
    .map((s) => s.trim())
    .filter(isBoatClass);
  return listed.length > 0 ? Array.from(new Set([own, ...listed])) : [];
}

/** Convertible when the classes a shell races as differ in rigging (4x/4-) or coxing (4+/4x+). */
function riggingFor(own: BoatClass, classes: BoatClass[]): ShellRigging {
  const all = [own, ...classes].map(boatClassSpec);
  const riggings = new Set(all.map((s) => s.rigging));
  const coxed = new Set(all.map((s) => s.coxed));
  if (riggings.size > 1 || coxed.size > 1) return 'convertible';
  return boatClassSpec(own).rigging;
}

/** '165-200', 'LWT', '<240', 'HvyWt'; '155.0' becomes '155'; serial numbers in the column are dropped. */
function weightClassLabel(raw: string): string | undefined {
  const t = raw.trim().replace(/\.0$/, '');
  if (/^[<>]?\s*\d{2,3}(\s*[-–]\s*\d{2,3})?$/.test(t)) return t;
  if (/^(lwt|hvywt|light|heavy)/i.test(t)) return t;
  return undefined;
}

/** '85.0' is a sweep spread; '160.0' on a sculling hull is a span; '86/159' is both. */
function spreadAndSpan(
  raw: string,
  rigging: ShellRigging,
): { spreadCm: number | null; spanCm: number | null } {
  const both = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (both) return { spreadCm: Number(both[1]), spanCm: Number(both[2]) };
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) return { spreadCm: null, spanCm: null };
  const v = Number(raw);
  if (rigging === 'scull' && v >= 140 && v <= 180) return { spreadCm: null, spanCm: v };
  if (rigging !== 'scull' && v >= 70 && v <= 100) return { spreadCm: v, spanCm: null };
  return { spreadCm: null, spanCm: null };
}

/**
 * The sheet's "unavailable" column marks two boats out of service (PLAN.md §14). A "do not row"
 * note on a boat the column still lists as available (Fowler: "Serious hull damage do not row.")
 * becomes 'limited', so it is flagged without reading as an error on the 2025 schedule that raced
 * it; the owner should confirm whether it is out of service now.
 */
function statusFor(row: Pick<ShellRow, 'name' | 'notes' | 'unavailable'>): EquipmentStatus {
  if (row.unavailable === 'True') return 'out_of_service';
  if (/do not (row|use)/i.test(`${row.name} ${row.notes}`)) return 'limited';
  return 'in_service';
}

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function shellFromRow(row: ShellRow): Shell {
  if (!isBoatClass(row.boat_class)) throw new Error(`Unknown boat class for ${row.name}`);
  const own = row.boat_class;
  const spec = boatClassSpec(own);
  const classes = compatibleClasses(row, own);
  const rigging = riggingFor(own, classes);
  const model = tidy(row.model).replace(/\.\s+(\d)/g, '.$1');
  const riggerType: RiggerType = /wing/i.test(model) ? 'wing' : 'side';
  const label = weightClassLabel(row.weight_class_lb);
  const crew = parseWeightClassLabel(label);
  const genderAffinity = affinity(row.gender_affinity);
  const lengthCm = MODEL_LENGTH_CM.find(([re]) => re.test(model))?.[1] ?? spec.defaultLengthCm;
  const shoes = /^[PS]{4,8}$/.test(row.shoes) ? '' : row.shoes; // a rig pattern, also in notes
  const shell: Shell = {
    id: seedShellId(row.name),
    name: row.name,
    boatClass: own,
    compatibleClasses: classes,
    rigging,
    year: num(row.year),
    lengthCm,
    beamCm: spec.defaultBeamCm,
    weightKg: spec.defaultWeightKg,
    crewWeightMinKg: crew.minKg == null ? null : round1(crew.minKg),
    crewWeightMaxKg: crew.maxKg == null ? null : round1(crew.maxKg),
    strokeSide:
      row.stroke_side === 'port' || row.stroke_side === 'starboard' ? row.stroke_side : null,
    coxPosition:
      row.cox_position === 'stern' || row.cox_position === 'bow' ? row.cox_position : null,
    riggerType,
    riggerCount: defaultRiggerCount(own, riggerType),
    ...spreadAndSpan(row.spread_or_span, rigging),
    level: row.size_tier === 'Rec' ? 'beginner' : /\bRec 8\b/.test(model) ? 'intermediate' : null,
    genderAffinity,
    homeTeamId: homeTeamFor(genderAffinity),
    location: row.location === 'Rollling Rack' ? 'Rolling Rack' : row.location,
    status: statusFor(row),
    isPrivate: /private/i.test(row.name),
  };
  if (row.nickname) shell.nickname = row.nickname;
  if (model) shell.model = model;
  const manufacturer = manufacturerOf(model);
  if (manufacturer) shell.manufacturer = manufacturer;
  if (row.serial.trim()) shell.serial = row.serial.trim();
  if (label) shell.weightClassLabel = label;
  if (shoes) shell.shoes = shoes;
  if (tidy(row.notes)) shell.notes = tidy(row.notes);
  return shell;
}

export function oarSetFromRow(row: OarSetRow): OarSet {
  const type = row.type === 'scull' ? 'scull' : 'sweep';
  const notes = tidy(row.notes);
  // Numbered sweep sets ('24-C') carry a spare: 9 oars. Older named sets: 8. Sculls: 4 pairs,
  // or 3 pairs when the notes say so.
  const count =
    type === 'scull'
      ? /only 3 pairs/i.test(notes)
        ? 6
        : 8
      : /^\d{2}-?[A-Z]$/.test(row.name)
        ? 9
        : 8;
  const genderAffinity = affinity(row.gender_affinity);
  const blade = /^[\d.]+$/.test(row.blade) ? '' : row.blade.replace(/\(Old\)i$/, '(old)');
  const status: EquipmentStatus =
    row.unavailable === 'True'
      ? 'out_of_service'
      : /on way out/i.test(notes)
        ? 'limited'
        : 'in_service';
  const set: OarSet = {
    id: seedOarSetId(row.name),
    name: row.name,
    type,
    count,
    lengthCm: num(row.length_cm),
    inboardCm: num(row.inboard_cm),
    gripMm: num(row.grip_mm),
    genderAffinity,
    homeTeamId: homeTeamFor(genderAffinity),
    status,
  };
  if (row.color) set.color = row.color.toLowerCase();
  if (blade) set.blade = blade;
  if (notes) set.notes = notes;
  return set;
}

interface GearSpec {
  slug: string;
  category: GearCategory;
  name: string;
  quantity: number;
  defaultLoad: boolean;
  notes?: string;
}

/** From the 2026 Regionals sheet's item lists (data/reference/trailer-layout-2026-regionals.md). */
const GEAR: GearSpec[] = [
  { slug: 'cox-boxes', category: 'cox_box', name: 'Cox boxes', quantity: 6, defaultLoad: true },
  {
    slug: 'slings',
    category: 'slings',
    name: 'Slings',
    quantity: 12,
    defaultLoad: true,
    notes: 'Pairs. Rode in the bed of a tow truck in 2026.',
  },
  { slug: 'tool-kit', category: 'tool_kit', name: 'Tool kit', quantity: 2, defaultLoad: true },
  { slug: 'straps', category: 'straps', name: 'Straps', quantity: 40, defaultLoad: true },
  { slug: 'tents', category: 'tent', name: 'Tents', quantity: 3, defaultLoad: false },
  {
    slug: 'small-tent',
    category: 'tent',
    name: 'Small tent',
    quantity: 1,
    defaultLoad: false,
  },
  {
    slug: 'tent-box',
    category: 'tent',
    name: 'Box with tent side and top',
    quantity: 1,
    defaultLoad: false,
  },
  { slug: 'chairs', category: 'other', name: 'Chairs', quantity: 10, defaultLoad: false },
  { slug: 'big-chair', category: 'other', name: 'Big chair', quantity: 1, defaultLoad: false },
  { slug: 'small-table', category: 'other', name: 'Small table', quantity: 1, defaultLoad: false },
  { slug: 'flags', category: 'other', name: 'Flags', quantity: 4, defaultLoad: false },
  {
    slug: 'caution-tape',
    category: 'other',
    name: 'Caution tape',
    quantity: 1,
    defaultLoad: false,
  },
  {
    slug: 'measuring-tape',
    category: 'other',
    name: 'Measuring tape',
    quantity: 1,
    defaultLoad: false,
  },
  {
    slug: 'parts-boxes',
    category: 'spare_parts',
    name: 'Parts boxes',
    quantity: 2,
    defaultLoad: false,
  },
  {
    slug: 'aluminum-rack',
    category: 'other',
    name: 'Aluminum boat rack',
    quantity: 1,
    defaultLoad: false,
    notes: 'Rides in the truck bed with the slings.',
  },
  { slug: 'low-boys', category: 'other', name: 'Low boys', quantity: 2, defaultLoad: false },
];

export function addFleet(w: World): void {
  for (const row of SHELL_ROWS) w.shells.push(shellFromRow(row));
  for (const row of OAR_SET_ROWS) w.oar_sets.push(oarSetFromRow(row));
  for (const g of GEAR) {
    const item: GearItem = {
      id: seedGearId(g.slug),
      category: g.category,
      name: g.name,
      quantity: g.quantity,
      defaultLoad: g.defaultLoad,
    };
    if (g.notes) item.notes = g.notes;
    w.gear_items.push(item);
  }
}

// ---------------------------------------------------------------------------
// Lookups used by the regatta builders

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Finds shells and oar sets by the names coaches write in schedules. */
export class FleetIndex {
  private shells = new Map<string, Shell>();
  private oars = new Map<string, OarSet>();

  constructor(w: World) {
    for (const s of w.shells) {
      this.shells.set(norm(s.name), s);
      if (s.nickname) this.shells.set(norm(s.nickname), s);
    }
    for (const o of w.oar_sets) this.oars.set(norm(o.name), o);
  }

  /**
   * By name or nickname, case-insensitive. Schedule decorations are ignored:
   * 'Lundberg 4x+ (rerig)' finds Lundberg.
   */
  shell(text: string): Shell | null {
    const direct = this.shells.get(norm(text));
    if (direct) return direct;
    const stripped = norm(text.replace(/\(.*?\)/g, '').replace(/\b[1248]x?[+-]?(?=\s|$)/gi, ''));
    return this.shells.get(stripped) ?? null;
  }

  /** '24-C', or 'Blue Sculls' for the scull set named Blue. */
  oarSet(text: string): OarSet | null {
    return (
      this.oars.get(norm(text)) ??
      this.oars.get(norm(text.replace(/\b(sculls?|oars)\b/i, ''))) ??
      null
    );
  }

  shellByName(name: string): Shell {
    const s = this.shell(name);
    if (!s) throw new Error(`No shell named ${name}`);
    return s;
  }

  oarSetByName(name: string): OarSet {
    const o = this.oarSet(name);
    if (!o) throw new Error(`No oar set named ${name}`);
    return o;
  }
}

/**
 * Seat sides of a bucket rig written in the shell's notes, stroke to bow: 'SPPS' on Lundberg and
 * Tahoma, 'PSSP' on Trust. Shell has no rig-pattern field, so entries in these shells store the
 * sides as Entry.seatSides. Null for sculling classes and for plain port or starboard rigs (the
 * conflict engine's entrySeatSides derives a starboard rig from shell.strokeSide).
 */
export function bucketRigSides(shell: Shell, cls: BoatClass): Partial<Record<Seat, Side>> | null {
  const spec = boatClassSpec(cls);
  if (spec.rigging === 'scull') return null;
  const pattern = (shell.notes ?? '').match(/\b([PS]{4}|[PS]{8})\b/);
  if (!pattern || pattern[1]!.length !== spec.rowers) return null;
  const out: Partial<Record<Seat, Side>> = {};
  pattern[1]!.split('').forEach((ch, i) => {
    out[String(spec.rowers - i) as Seat] = ch === 'P' ? 'port' : 'starboard';
  });
  return out;
}
