// Boat classes and seat templates (PLAN.md §9.1, §16.1).

import type { BoatClass, Rigging, Seat, Side } from './types';

export interface BoatClassSpec {
  cls: BoatClass;
  rowers: 1 | 2 | 4 | 8;
  coxed: boolean;
  rigging: Rigging;
  /** sweep: rowers; scull: rowers * 2 */
  oarsNeeded: number;
  defaultLengthCm: number;
  defaultBeamCm: number;
  defaultWeightKg: number;
  /** Side-mounted riggers: one per rower (scull: two per rower). Wing riggers: half that. */
  defaultRiggerCount: number;
}

function spec(
  cls: BoatClass,
  rowers: 1 | 2 | 4 | 8,
  coxed: boolean,
  rigging: Rigging,
  lengthCm: number,
  beamCm: number,
  weightKg: number,
): BoatClassSpec {
  const oarsNeeded = rigging === 'scull' ? rowers * 2 : rowers;
  return {
    cls,
    rowers,
    coxed,
    rigging,
    oarsNeeded,
    defaultLengthCm: lengthCm,
    defaultBeamCm: beamCm,
    defaultWeightKg: weightKg,
    // §16.1: a single has 2 side riggers, a 4x has 8, an 8+ has 8.
    defaultRiggerCount: oarsNeeded,
  };
}

export const BOAT_CLASS_SPECS: Record<BoatClass, BoatClassSpec> = {
  '1x': spec('1x', 1, false, 'scull', 820, 28, 14),
  '2x': spec('2x', 2, false, 'scull', 1040, 35, 27),
  '2-': spec('2-', 2, false, 'sweep', 1040, 35, 27),
  '2+': spec('2+', 2, true, 'sweep', 1040, 38, 32),
  '4x': spec('4x', 4, false, 'scull', 1340, 50, 52),
  '4x+': spec('4x+', 4, true, 'scull', 1340, 52, 53),
  '4+': spec('4+', 4, true, 'sweep', 1340, 52, 51),
  '4-': spec('4-', 4, false, 'sweep', 1340, 50, 50),
  '8+': spec('8+', 8, true, 'sweep', 1990, 57, 96),
};

export function boatClassSpec(cls: BoatClass): BoatClassSpec {
  return BOAT_CLASS_SPECS[cls];
}

/** Rigger count for a shell of this class with the given rigger type (§16.1: wing is half of side). */
export function defaultRiggerCount(cls: BoatClass, riggerType: 'wing' | 'side' | 'none'): number {
  if (riggerType === 'none') return 0;
  const side = BOAT_CLASS_SPECS[cls].defaultRiggerCount;
  return riggerType === 'wing' ? Math.max(1, side / 2) : side;
}

/** Seats bow to stroke, then cox if coxed: ['1','2','3','4','cox'] for 4+. */
export function seatsFor(cls: BoatClass): Seat[] {
  const { rowers, coxed } = BOAT_CLASS_SPECS[cls];
  const seats: Seat[] = [];
  for (let i = 1; i <= rowers; i++) seats.push(String(i) as Seat);
  if (coxed) seats.push('cox');
  return seats;
}

/** Rowing seats only (no cox), bow to stroke. */
export function rowingSeats(cls: BoatClass): Seat[] {
  return seatsFor(cls).filter((s) => s !== 'cox');
}

/**
 * Side of a sweep seat. Standard rig: even seats port, odd seats starboard
 * (stroke of an eight is 8, port). Sculling seats and the cox return null.
 */
export function seatSide(
  cls: BoatClass,
  seat: Seat,
  override?: Partial<Record<Seat, Side>> | null,
): Side | null {
  if (seat === 'cox') return null;
  if (BOAT_CLASS_SPECS[cls].rigging === 'scull') return null;
  const o = override?.[seat];
  if (o) return o;
  return Number(seat) % 2 === 0 ? 'port' : 'starboard';
}

/** Seat sides for a shell rigged starboard-stroke: every standard side flipped. */
export function starboardRigSides(cls: BoatClass): Partial<Record<Seat, Side>> {
  const out: Partial<Record<Seat, Side>> = {};
  for (const s of rowingSeats(cls)) {
    const std = seatSide(cls, s);
    if (std) out[s] = std === 'port' ? 'starboard' : 'port';
  }
  return out;
}

const CONVERTIBLE_PAIRS: [BoatClass, BoatClass][] = [
  ['4+', '4-'],
  ['4x', '4x+'],
  ['2x', '2-'],
  ['4x', '4-'],
];

/**
 * Whether a shell can race in an event of `eventClass`.
 *
 * `shellClasses` is the shell's explicit compatible classes plus its own class. When the shell
 * has no explicit list, pass `[shell.boatClass]` and `convertible` to get the §9.1 defaults:
 * its own class only, except 4+↔4- and 4x↔4x+ when convertible.
 */
export function isCompatible(
  shellClasses: BoatClass[],
  eventClass: BoatClass,
  convertible = false,
): boolean {
  if (shellClasses.includes(eventClass)) return true;
  if (!convertible) return false;
  return shellClasses.some((c) =>
    CONVERTIBLE_PAIRS.slice(0, 2).some(
      ([a, b]) => (c === a && eventClass === b) || (c === b && eventClass === a),
    ),
  );
}

/** Classes a shell can race as: explicit list if present, otherwise the §9.1 defaults. */
export function shellClasses(shell: {
  boatClass: BoatClass;
  compatibleClasses?: BoatClass[];
  rigging?: string;
}): BoatClass[] {
  const own = shell.boatClass;
  if (shell.compatibleClasses && shell.compatibleClasses.length > 0) {
    return Array.from(new Set([own, ...shell.compatibleClasses]));
  }
  if (shell.rigging === 'convertible') {
    const pair = CONVERTIBLE_PAIRS.slice(0, 2).find(([a, b]) => a === own || b === own);
    if (pair) return [own, pair[0] === own ? pair[1] : pair[0]];
  }
  return [own];
}

/** Convenience: can this shell race as this class? */
export function shellFits(
  shell: { boatClass: BoatClass; compatibleClasses?: BoatClass[]; rigging?: string },
  cls: BoatClass,
): boolean {
  return shellClasses(shell).includes(cls);
}

export type JuniorAgeGroup = 'U15' | 'U16' | 'U17' | 'U19' | 'open';

/**
 * age = seasonYear − birthYear: ≤14 → U15, 15 → U16, 16 → U17, 17 or 18 → U19, else open.
 * Born 2009 → U19 in 2026, 2010 → U17, 2011 → U16, 2012 → U15.
 */
export function juniorAgeGroup(birthYear: number, seasonYear: number): JuniorAgeGroup {
  const age = seasonYear - birthYear;
  if (age <= 14) return 'U15';
  if (age === 15) return 'U16';
  if (age === 16) return 'U17';
  if (age <= 18) return 'U19';
  return 'open';
}

const AGE_GROUP_ORDER: Record<JuniorAgeGroup, number> = { U15: 0, U16: 1, U17: 2, U19: 3, open: 4 };

/** True when `athlete` is older than `event` allows (U19 athlete in a U17 event). */
export function isOlderAgeGroup(athlete: JuniorAgeGroup, event: JuniorAgeGroup): boolean {
  return AGE_GROUP_ORDER[athlete] > AGE_GROUP_ORDER[event];
}

export type MastersCategory =
  'AA' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K';

const MASTERS_BANDS: [number, MastersCategory][] = [
  [85, 'K'],
  [80, 'J'],
  [75, 'I'],
  [70, 'H'],
  [65, 'G'],
  [60, 'F'],
  [55, 'E'],
  [50, 'D'],
  [43, 'C'],
  [36, 'B'],
  [27, 'A'],
];

/**
 * USRowing masters bands by average age (rounded down): AA 21+, A 27+, B 36+, C 43+, D 50+,
 * E 55+, F 60+, G 65+, H 70+, I 75+, J 80+, K 85+. Ages under 27 are AA.
 */
export function mastersCategory(avgAge: number): MastersCategory {
  const age = Math.floor(avgAge);
  for (const [min, cat] of MASTERS_BANDS) if (age >= min) return cat;
  return 'AA';
}

/** Short classes like 'V8' use the rowers count; used by label helpers. */
export function isSculling(cls: BoatClass): boolean {
  return BOAT_CLASS_SPECS[cls].rigging === 'scull';
}

export function isCoxed(cls: BoatClass): boolean {
  return BOAT_CLASS_SPECS[cls].coxed;
}

/** Size rank used for ordering: 8+ = 3, fours = 2, pairs/doubles = 1, singles = 0. */
export function classSizeRank(cls: BoatClass): number {
  const r = BOAT_CLASS_SPECS[cls].rowers;
  return r === 8 ? 3 : r === 4 ? 2 : r === 2 ? 1 : 0;
}

/**
 * Parse a boat class out of free text: '4+', '4x+', 'Coxed Four', 'V8', 'JV4+', '1x',
 * 'Quad', 'Double', 'Single', 'Pair', "Men's 8+". Returns null when nothing matches.
 */
export function parseBoatClass(text: string): BoatClass | null {
  const t = text.toLowerCase();
  const sym = t.match(/([1248])\s*(x\+|x|\+|-|−)?/g);
  if (sym) {
    for (const raw of sym) {
      const m = raw.replace(/\s+/g, '').replace('−', '-');
      const n = m[0];
      const suffix = m.slice(1);
      const candidates: Record<string, BoatClass | undefined> = {
        '1x': '1x',
        '1': undefined,
        '2x': '2x',
        '2-': '2-',
        '2+': '2+',
        '4x': '4x',
        '4x+': '4x+',
        '4+': '4+',
        '4-': '4-',
        '8+': '8+',
        '8': '8+',
      };
      const key = `${n}${suffix}`;
      const hit = candidates[key];
      if (hit) return hit;
    }
  }
  if (/\beights?\b/.test(t)) return '8+';
  if (/\bcoxed quad/.test(t) || /\bquad(ruple)?\s*\+/.test(t)) return '4x+';
  if (/\bquad/.test(t)) return '4x';
  if (/\bcoxless four|straight four/.test(t)) return '4-';
  if (/\bcoxed four|\bfours?\b/.test(t)) return '4+';
  if (/\bdouble/.test(t)) return '2x';
  if (/\bcoxed pair/.test(t)) return '2+';
  if (/\bpair/.test(t)) return '2-';
  if (/\bsingle/.test(t)) return '1x';
  return null;
}
