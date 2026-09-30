// Soft-rule scoring (PLAN.md §9.3.3 semantics column, §9.3.4 steps 4 and 6). Internal.
//
// The global score is a sum of
// - per-boat terms: class-tier (+10w when satisfied), heavy-low (−weight/10 × (tier−1) × w),
//   fragile-inside (+8w for a fragile boat off the outer lane);
// - per-lane terms: forward-bias (−rear overhang/50 × w);
// - pair terms: team-together (+3w to each of two same-team neighbors), unload-order (+5w when
//   the earlier-racing boat of a pair is easier to reach);
// - one global term: side-balance (−|L−R|/(L+R) × 100 × w).
// The greedy step scores a candidate by how much it changes this sum, and the improvement pass
// accepts the swap or move that raises it most, so both steps optimize the same thing.

import type { Layout } from './layout';
import type { PackModel } from './model';

export function boatTerm(lay: Layout, b: number, s: number, l: number): number {
  const m = lay.m;
  const boat = m.boats[b]!;
  const tier = m.shelves[s]!.def.tier;
  let t = 0;
  for (const r of m.soft.classTier) {
    if (r.params.classes.includes(boat.cls) && r.params.tiers.includes(tier)) t += 10 * r.weight;
  }
  for (const r of m.soft.heavyLow) t -= (boat.weightKg / 10) * (tier - 1) * r.weight;
  if (boat.fragile && m.soft.fragileInside.length > 0 && !lay.isOuterLane(s, l, b)) {
    for (const r of m.soft.fragileInside) t += 8 * r.weight;
  }
  return t;
}

export function laneTerm(lay: Layout, s: number, l: number): number {
  const w = lay.m.weights.forward;
  if (w === 0) return 0;
  return -(lay.laneOverhang(s, l).rear / 50) * w;
}

/** Next to each other: adjacent lane on a shelf, or another shelf on the same tier. */
export function areNeighbors(lay: Layout, a: number, b: number): boolean {
  const sa = lay.shelf[a]!;
  const sb = lay.shelf[b]!;
  if (sa === sb) return Math.abs(lay.lane[a]! - lay.lane[b]!) === 1;
  return lay.m.shelves[sa]!.def.tier === lay.m.shelves[sb]!.def.tier;
}

/** Whether boat `a` comes off before boat `b`: better access rank, or outer lane of a shared shelf. */
export function accessBetter(lay: Layout, a: number, b: number): 'shelf' | 'lane' | null {
  const sa = lay.shelf[a]!;
  const sb = lay.shelf[b]!;
  const sha = lay.m.shelves[sa]!;
  const ra = sha.def.accessRank;
  const rb = lay.m.shelves[sb]!.def.accessRank;
  if (ra < rb) return 'shelf';
  if (sa === sb && sha.def.laneAccess === 'outer_first' && lay.lane[a]! > lay.lane[b]!) {
    return 'lane';
  }
  return null;
}

/** Pair term for two placed boats (both boats' shares). */
export function pairTerm(lay: Layout, a: number, b: number): number {
  const m = lay.m;
  let t = 0;
  const tw = m.weights.team[a]!;
  if (tw > 0 && m.boats[a]!.teamId === m.boats[b]!.teamId && areNeighbors(lay, a, b)) {
    t += 6 * tw;
  }
  if (m.weights.unload > 0) {
    const ta = m.raceTime[a]!;
    const tb = m.raceTime[b]!;
    if (ta !== tb && ta === ta && tb === tb) {
      // (x === x is false only for NaN: boats without a race time are not compared.)
      if (ta < tb ? accessBetter(lay, a, b) : accessBetter(lay, b, a)) t += 5 * m.weights.unload;
    }
  }
  return t;
}

export function balanceTerm(m: PackModel, left: number, right: number): number {
  const w = m.weights.balance;
  if (w === 0) return 0;
  const total = left + right;
  if (total <= 0) return 0;
  return -(Math.abs(left - right) / total) * 100 * w;
}

/** Boat term plus pair terms with every placed boat not in `exclude`. */
function boatAndPairs(lay: Layout, x: number, exclude: number): number {
  let t = boatTerm(lay, x, lay.shelf[x]!, lay.lane[x]!);
  if (!lay.pairs) return t;
  const n = lay.m.boats.length;
  for (let o = 0; o < n; o++) {
    if (o === x || o === exclude || lay.shelf[o]! < 0) continue;
    t += pairTerm(lay, x, o);
  }
  return t;
}

/**
 * The part of the global score that can change when boat `i` (and `j`, when swapping; -1
 * otherwise) change places and the lanes `[s1, l1]` and `[s2, l2]` are re-laid out. Compare
 * before and after a move to get its effect.
 */
export function localScore(
  lay: Layout,
  i: number,
  j: number,
  s1: number,
  l1: number,
  s2 = -1,
  l2 = -1,
): number {
  let t = 0;
  if (lay.shelf[i]! >= 0) t += boatAndPairs(lay, i, j);
  if (j >= 0 && lay.shelf[j]! >= 0) {
    t += boatAndPairs(lay, j, i);
    if (lay.shelf[i]! >= 0 && lay.pairs) t += pairTerm(lay, i, j);
  }
  t += laneTerm(lay, s1, l1);
  if (s2 >= 0 && (s2 !== s1 || l2 !== l1)) t += laneTerm(lay, s2, l2);
  return t + balanceTerm(lay.m, lay.left, lay.right);
}
