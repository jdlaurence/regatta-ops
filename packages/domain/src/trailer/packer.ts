// Trailer packer (PLAN.md §9.3.4): deterministic greedy placement plus a local-improvement pass,
// with the per-candidate hard checks exposed for drag and drop (validatePlacement, dropBoat).

import { classSizeRank } from '../boat-classes';
import type { Id } from '../types';
import { DEFAULT_BALANCE_TOLERANCE_PCT, REAR_FLAG_THRESHOLD_CM } from './catalog';
import { capitalize, countOf, joinAnd, meters, midSentence } from './format';
import { Layout, type Violation } from './layout';
import { buildModel, laneRuleFor, type PackModel } from './model';
import { accessBetter, areNeighbors, balanceTerm, laneTerm, localScore } from './scoring';
import type {
  PackBoat,
  PackResult,
  Placement,
  Reason,
  Rule,
  ShelfMetrics,
  TrailerDef,
} from './types';

const MAX_IMPROVE_ITERATIONS = 200;
const MIN_IMPROVEMENT = 0.5;
const EPS = 1e-9;

/** Reason attached to a locked placement that arrives without reasons of its own. */
export const LOCKED_REASON: Reason = {
  ruleId: 'locked',
  text: 'Placed by hand and locked',
  hard: true,
};

function round1(x: number): number {
  const r = Math.round(x * 10) / 10;
  return r === 0 ? 0 : r;
}

// ---------------------------------------------------------------------------
// Candidates (§9.3.4 steps 3 to 5)

interface Candidate {
  s: number;
  l: number;
  index: number;
  score: number;
}

function better(m: PackModel, a: Candidate, b: Candidate): boolean {
  if (Math.abs(a.score - b.score) > EPS) return a.score > b.score;
  const ra = m.shelves[a.s]!.def.accessRank;
  const rb = m.shelves[b.s]!.def.accessRank;
  if (ra !== rb) return ra < rb;
  if (a.l !== b.l) return a.l < b.l;
  if (a.index !== b.index) return a.index < b.index;
  return a.s < b.s;
}

/**
 * The best spot for boat `b` against the current layout, or null. When `rejections` is given,
 * records per active shelf the rule that rejected it (a rule other than fit wins, since it says
 * more about why).
 */
function bestCandidate(
  lay: Layout,
  b: number,
  restrict?: { s: number; l?: number | undefined },
  rejections?: Map<number, string>,
): Candidate | null {
  const m = lay.m;
  let best: Candidate | null = null;
  const shelves = restrict ? [restrict.s] : m.shelves.map((s) => s.index);
  for (const s of shelves) {
    const shelfBad = lay.shelfViolations(b, s)[0];
    if (shelfBad) {
      if (m.shelves[s]!.active) rejections?.set(s, shelfBad.ruleId);
      continue;
    }
    let found = false;
    let rejectedBy: string | undefined;
    const lanes = restrict?.l != null ? [restrict.l] : range(lay.laneCandidates(s));
    for (const l of lanes) {
      const n = lay.laneBoats(s, l).length;
      for (const index of n === 0 ? ZERO : [0, n]) {
        const before = localScore(lay, b, -1, s, l);
        const v = lay.tryInsert(b, s, l, index);
        if (v) {
          if (!rejectedBy || rejectedBy === m.fit.id) rejectedBy = v.ruleId;
          continue;
        }
        const score = localScore(lay, b, -1, s, l) - before;
        lay.remove(b);
        found = true;
        const cand = { s, l, index, score };
        if (!best || better(m, cand, best)) best = cand;
      }
    }
    if (!found && rejectedBy) rejections?.set(s, rejectedBy);
  }
  return best;
}

const ZERO = [0];

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// ---------------------------------------------------------------------------
// Improvement pass (§9.3.4 step 6)

interface Move {
  delta: number;
  i: number;
  /** Swap partner, or -1 for a move to an empty spot. */
  j: number;
  s: number;
  l: number;
  index: number;
}

function signature(m: PackModel, b: number): string {
  const x = m.boats[b]!;
  return [
    x.cls,
    x.lengthCm,
    x.beamCm,
    x.weightKg,
    x.teamId,
    m.raceTime[b],
    x.fragile ?? false,
  ].join('|');
}

/** Swap boats i and j. Returns the score change, or null when a hard rule breaks. */
function trySwap(lay: Layout, i: number, j: number, commit: boolean): number | null {
  const si = lay.shelf[i]!;
  const li = lay.lane[i]!;
  const sj = lay.shelf[j]!;
  const lj = lay.lane[j]!;
  const before = localScore(lay, i, j, si, li, sj, lj);
  const at_i = lay.remove(i);
  const at_j = lay.remove(j);
  let delta: number | null = null;
  const vi = lay.shelfViolations(i, sj)[0] ?? lay.tryInsert(i, sj, lj, at_j.index);
  if (!vi) {
    const vj = lay.shelfViolations(j, si)[0] ?? lay.tryInsert(j, si, li, at_i.index);
    if (!vj) {
      delta = localScore(lay, i, j, si, li, sj, lj) - before;
      if (commit) return delta;
      lay.remove(j);
    }
    lay.remove(i);
  }
  lay.restore(j, at_j);
  lay.restore(i, at_i);
  return delta;
}

/**
 * Move boat i to an empty spot. Returns the score change, or null when a hard rule breaks.
 * `before` is `localScore(lay, i, -1, s0, l0)` for its current spot, shared across targets.
 */
function tryMove(
  lay: Layout,
  i: number,
  s: number,
  l: number,
  index: number,
  commit: boolean,
  before = localScore(lay, i, -1, lay.shelf[i]!, lay.lane[i]!),
): number | null {
  const s0 = lay.shelf[i]!;
  const l0 = lay.lane[i]!;
  const start = before + (s === s0 && l === l0 ? 0 : laneTerm(lay, s, l));
  const at = lay.remove(i);
  const v = lay.tryInsert(i, s, l, index);
  if (v) {
    lay.restore(i, at);
    return null;
  }
  const delta = localScore(lay, i, -1, s0, l0, s, l) - start;
  if (commit) return delta;
  lay.remove(i);
  lay.restore(i, at);
  return delta;
}

function improve(lay: Layout): void {
  const m = lay.m;
  const sig = m.boats.map((_, b) => signature(m, b));
  for (let iter = 0; iter < MAX_IMPROVE_ITERATIONS; iter++) {
    const movable = range(m.boats.length).filter((b) => lay.placed(b) && !lay.locked[b]);
    let best: Move | null = null;
    const consider = (mv: Move) => {
      if (!best || mv.delta > best.delta + EPS) best = mv;
    };
    for (let a = 0; a < movable.length; a++) {
      const i = movable[a]!;
      for (let c = a + 1; c < movable.length; c++) {
        const j = movable[c]!;
        if (sig[i] === sig[j]) continue;
        if (lay.shelf[i] === lay.shelf[j] && lay.lane[i] === lay.lane[j]) continue;
        const d = trySwap(lay, i, j, false);
        if (d !== null) consider({ delta: d, i, j, s: -1, l: -1, index: -1 });
      }
    }
    for (const i of movable) {
      const before = localScore(lay, i, -1, lay.shelf[i]!, lay.lane[i]!);
      for (const sh of m.shelves) {
        const s = sh.index;
        // Shelf-level rules do not depend on where the boat sits now (its own shelf counts it).
        if (!sh.active || lay.shelfViolations(i, s).length > 0) continue;
        const lanes = lay.laneCandidates(s);
        for (let l = 0; l < lanes; l++) {
          if (lay.shelf[i] === s && lay.lane[i] === l) continue;
          const n = lay.laneBoats(s, l).length;
          for (const index of n === 0 ? ZERO : [0, n]) {
            const d = tryMove(lay, i, s, l, index, false, before);
            if (d !== null) consider({ delta: d, i, j: -1, s, l, index });
          }
        }
      }
    }
    const chosen = best as Move | null;
    if (!chosen || chosen.delta <= MIN_IMPROVEMENT) return;
    if (chosen.j >= 0) trySwap(lay, chosen.i, chosen.j, true);
    else tryMove(lay, chosen.i, chosen.s, chosen.l, chosen.index, true);
  }
}

// ---------------------------------------------------------------------------
// Reasons (§9.3.4 step 5, §17.3)

function fitReason(lay: Layout, b: number): Reason {
  const m = lay.m;
  const s = lay.shelf[b]!;
  const l = lay.lane[b]!;
  const sh = m.shelves[s]!;
  const boat = m.boats[b]!;
  const L = sh.def.lengthCm;
  const lane = lay.laneBoats(s, l);
  let text: string;
  if (lane.length <= 1) {
    text =
      boat.lengthCm <= L
        ? `Fits: ${meters(boat.lengthCm)} m in ${meters(L)} m`
        : `Fits: ${meters(boat.lengthCm)} m in ${meters(L)} m plus ${meters(sh.frontMaxCm)} m front and ${meters(sh.rearMaxCm)} m rear overhang`;
  } else {
    const others = lane.filter((x) => x !== b).map((x) => m.boats[x]!.name);
    const start = Math.min(...lane.map((x) => lay.offset[x]!));
    const end = Math.max(...lane.map((x) => lay.end(x)));
    const usable = sh.frontMaxCm + L + sh.rearMaxCm;
    text = `Fits end to end with ${joinAnd(others)} (${meters(end - start)} m of ${meters(usable)} m including overhang)`;
  }
  return { ruleId: m.fit.id, text, hard: true };
}

function hardReasons(lay: Layout, b: number): Reason[] {
  const m = lay.m;
  const s = lay.shelf[b]!;
  const sh = m.shelves[s]!;
  const boat = m.boats[b]!;
  const ids = new Set<string>();
  for (const r of sh.classRules) ids.add(r.id);
  const classes = new Set([boat.cls]);
  for (const lane of lay.lanes[s]!) for (const x of lane) classes.add(m.boats[x]!.cls);
  const laneRule = laneRuleFor(sh, [...classes]);
  if (laneRule) ids.add(laneRule.id);
  for (const r of sh.maxBoatRules) ids.add(r.id);
  if (sh.overhangRule && (lay.offset[b]! < 0 || lay.end(b) > sh.def.lengthCm)) {
    ids.add(sh.overhangRule.id);
  }
  for (const r of m.hardClassTier) if (r.params.classes.includes(boat.cls)) ids.add(r.id);
  for (const other of m.shelves) {
    if (other.index === s || !other.active) continue;
    const v = lay.shelfViolations(b, other.index)[0];
    if (v && v.ruleId !== m.fit.id) ids.add(v.ruleId);
  }
  const pin = m.pins.get(boat.shellId);
  if (pin) ids.delete(pin.id);
  return [...ids]
    .sort((x, y) => (m.ruleOrder.get(x) ?? 1e9) - (m.ruleOrder.get(y) ?? 1e9))
    .map((ruleId) => ({ ruleId, text: m.text(ruleId), hard: true }));
}

function softReasons(lay: Layout, b: number): Reason[] {
  const m = lay.m;
  const s = lay.shelf[b]!;
  const l = lay.lane[b]!;
  const sh = m.shelves[s]!;
  const boat = m.boats[b]!;
  const tier = sh.def.tier;
  const out: Reason[] = [];
  const push = (r: Rule, score: number, suffix = '') => {
    const v = round1(score);
    if (v !== 0)
      out.push({ ruleId: r.id, text: `${m.text(r.id)}${suffix}`, score: v, hard: false });
  };
  for (const r of m.soft.classTier) {
    if (r.params.classes.includes(boat.cls) && r.params.tiers.includes(tier))
      push(r, 10 * r.weight);
  }
  for (const r of m.soft.heavyLow) push(r, -(boat.weightKg / 10) * (tier - 1) * r.weight);
  if (m.weights.forward > 0) {
    const lane = lay.laneBoats(s, l);
    const last = lane.reduce((a, x) => (lay.end(x) > lay.end(a) ? x : a), lane[0]!);
    if (last === b) {
      const rear = lay.laneOverhang(s, l).rear;
      for (const r of m.soft.forwardBias) push(r, -(rear / 50) * r.weight);
    }
  }
  if (boat.fragile && !lay.isOuterLane(s, l, b)) {
    for (const r of m.soft.fragileInside) push(r, 8 * r.weight);
  }
  for (const r of m.soft.teamTogether) {
    const only = r.params.teamIds;
    if (only && only.length > 0 && !only.includes(boat.teamId)) continue;
    let n = 0;
    for (let o = 0; o < m.boats.length; o++) {
      if (
        o !== b &&
        lay.placed(o) &&
        m.boats[o]!.teamId === boat.teamId &&
        areNeighbors(lay, b, o)
      ) {
        n++;
      }
    }
    push(r, 3 * r.weight * n);
  }
  if (m.soft.unloadOrder.length > 0 && Number.isFinite(m.raceTime[b])) {
    let n = 0;
    let viaShelf = false;
    for (let o = 0; o < m.boats.length; o++) {
      if (o === b || !lay.placed(o) || !(m.raceTime[o]! > m.raceTime[b]!)) continue;
      const how = accessBetter(lay, b, o);
      if (how) n++;
      if (how === 'shelf') viaShelf = true;
    }
    const suffix = n === 0 ? '' : viaShelf ? ' (more accessible shelf)' : ' (outer lane)';
    for (const r of m.soft.unloadOrder) push(r, 5 * r.weight * n, suffix);
  }
  const side = lay.side(s, l);
  if (side !== 0) {
    const w = boat.weightKg;
    const without = balanceTerm(m, lay.left - (side < 0 ? w : 0), lay.right - (side > 0 ? w : 0));
    const total = m.weights.balance;
    const delta = balanceTerm(m, lay.left, lay.right) - without;
    for (const r of m.soft.sideBalance) push(r, (delta * r.weight) / total);
  }
  return out.sort((x, y) => (y.score ?? 0) - (x.score ?? 0));
}

function reasonsFor(lay: Layout, b: number): Reason[] {
  const m = lay.m;
  const pin = m.pins.get(m.boats[b]!.shellId);
  const pinReason: Reason[] =
    pin && m.shelves[lay.shelf[b]!]!.def.id === pin.params.shelfId
      ? [{ ruleId: pin.id, text: m.text(pin.id), hard: true }]
      : [];
  return [...pinReason, fitReason(lay, b), ...hardReasons(lay, b), ...softReasons(lay, b)];
}

function unplacedReasons(lay: Layout, b: number): Reason[] {
  const m = lay.m;
  const rejections = new Map<number, string>();
  bestCandidate(lay, b, undefined, rejections);
  const active = m.shelves.filter((s) => s.active);
  if (active.length === 0) {
    const off = m.shelves.find((s) => s.offRule)?.offRule;
    return [
      {
        ruleId: off?.id ?? m.fit.id,
        text: m.shelves.length === 0 ? 'This trailer has no shelves' : 'Every shelf is turned off',
        hard: true,
      },
    ];
  }
  const counts = new Map<string, number>();
  for (const ruleId of rejections.values()) counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
  const ranked = [...counts.entries()].sort(
    (a, b2) => b2[1] - a[1] || (m.ruleOrder.get(a[0]) ?? 1e9) - (m.ruleOrder.get(b2[0]) ?? 1e9),
  );
  if (ranked.length === 0) {
    return [{ ruleId: m.fit.id, text: 'No active shelf has room for this boat', hard: true }];
  }
  const summary = `Every active shelf rejected this boat: ${ranked
    .map(([id, n]) => `${n} by '${m.label(id)}'`)
    .join(', ')}`;
  const len = meters(m.boats[b]!.lengthCm);
  return [
    { ruleId: ranked[0]![0], text: summary, hard: true },
    ...ranked.map(([ruleId]) => ({
      ruleId,
      text: ruleId === m.fit.id ? `No active shelf has a lane with ${len} m free` : m.text(ruleId),
      hard: true,
    })),
  ];
}

// ---------------------------------------------------------------------------
// Metrics and warnings (§9.3.4 step 7)

function metricsOf(lay: Layout): PackResult['metrics'] {
  const m = lay.m;
  const perShelf: ShelfMetrics[] = m.shelves.map((sh) => {
    let front = 0;
    let rear = 0;
    let lanesUsed = 0;
    lay.lanes[sh.index]!.forEach((lane, l) => {
      if (lane.length === 0) return;
      lanesUsed++;
      const oh = lay.laneOverhang(sh.index, l);
      front = Math.max(front, oh.front);
      rear = Math.max(rear, oh.rear);
    });
    return {
      shelfId: sh.def.id,
      boats: lay.count[sh.index]!,
      lanesUsed,
      weightKg: round1(lay.weight[sh.index]!),
      frontOverhangCm: round1(front),
      rearOverhangCm: round1(rear),
    };
  });
  const total = lay.left + lay.right;
  return {
    leftWeightKg: round1(lay.left),
    rightWeightKg: round1(lay.right),
    balancePct: total > 0 ? round1((Math.abs(lay.left - lay.right) / total) * 100) : 0,
    perShelf,
  };
}

function reportWarnings(lay: Layout, unplaced: readonly number[]): string[] {
  const m = lay.m;
  const out: string[] = [];
  if (unplaced.length > 0) {
    out.push(
      `${countOf(unplaced.length, 'boat')} not placed: ${joinAnd(unplaced.map((b) => m.boats[b]!.name))}`,
    );
  }
  for (const sh of m.shelves) {
    const w = lay.weight[sh.index]!;
    if (sh.maxWeightKg != null && w > sh.maxWeightKg + 1e-6) {
      out.push(`${sh.def.label} carries ${Math.round(w)} kg, over its ${sh.maxWeightKg} kg limit`);
    }
  }
  const balance = m.soft.sideBalance[0];
  const total = lay.left + lay.right;
  if (balance && total > 0) {
    const tol = balance.params.tolerancePct ?? DEFAULT_BALANCE_TOLERANCE_PCT;
    const pct = (Math.abs(lay.left - lay.right) / total) * 100;
    if (pct > tol + 1e-9) {
      const [heavy, light] =
        lay.left > lay.right
          ? [m.sideNames.left, m.sideNames.right]
          : [m.sideNames.right, m.sideNames.left];
      out.push(
        `${capitalize(heavy)} carries ${Math.round(pct)}% more than the ${light} (tolerance ${tol}%)`,
      );
    }
  }
  let worst = 0;
  let worstShelf = '';
  const flagged = new Set<number>();
  lay.lanes.forEach((lanes, s) =>
    lanes.forEach((_, l) => {
      const rear = lay.laneOverhang(s, l).rear;
      if (rear > REAR_FLAG_THRESHOLD_CM + 1e-6) {
        flagged.add(s);
        if (rear > worst) {
          worst = rear;
          worstShelf = m.shelves[s]!.def.label;
        }
      }
    }),
  );
  if (flagged.size > 0) {
    const more =
      flagged.size > 1 ? ` and ${countOf(flagged.size - 1, 'other shelf', 'other shelves')}` : '';
    out.push(
      `Rear overhang reaches ${meters(worst)} m on ${midSentence(worstShelf)}${more}; more than 1.2 m (4 ft) behind needs a flag`,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API

function orderBoats(m: PackModel, ids: number[]): number[] {
  return [...ids].sort((a, b) => {
    const x = m.boats[a]!;
    const y = m.boats[b]!;
    const size = classSizeRank(y.cls) - classSizeRank(x.cls);
    if (size !== 0) return size;
    if (x.weightKg !== y.weightKg) return y.weightKg - x.weightKg;
    const ta = m.raceTime[a]!;
    const tb = m.raceTime[b]!;
    const fa = Number.isFinite(ta);
    const fb = Number.isFinite(tb);
    if (fa !== fb) return fa ? -1 : 1;
    if (fa && fb && ta !== tb) return ta - tb;
    if (x.name !== y.name) return x.name < y.name ? -1 : 1;
    return x.shellId < y.shellId ? -1 : x.shellId > y.shellId ? 1 : 0;
  });
}

function toPlacement(lay: Layout, b: number, bowForward: boolean, reasons: Reason[]): Placement {
  const m = lay.m;
  return {
    shellId: m.boats[b]!.shellId,
    shelfId: m.shelves[lay.shelf[b]!]!.def.id,
    lane: lay.lane[b]!,
    offsetCm: round1(lay.offset[b]!),
    bowForward,
    locked: lay.locked[b]!,
    reasons,
  };
}

function sortedPlaced(lay: Layout): number[] {
  const out: number[] = [];
  lay.lanes.forEach((lanes) => lanes.forEach((lane) => out.push(...lane)));
  return out;
}

function toReasons(vs: readonly Violation[]): Reason[] {
  return vs.map((v) => ({ ruleId: v.ruleId, text: v.text, hard: true }));
}

/** Build a layout from stored placements as given (no packing). Unknown shells and shelves are skipped. */
function literalLayout(m: PackModel, placements: readonly Placement[], skipShellId?: Id): Layout {
  const lay = new Layout(m);
  for (const p of placements) {
    if (p.shellId === skipShellId) continue;
    const b = m.boatIndex.get(p.shellId);
    const s = m.shelfIndex.get(p.shelfId);
    if (b === undefined || s === undefined || lay.placed(b)) continue;
    lay.forceAt(b, s, p.lane, p.offsetCm, p.locked);
  }
  return lay;
}

/**
 * Pack a trailer (§9.3.4). Locked placements in `existing` and `pin` rules are kept; every other
 * boat is placed greedily (biggest first), then pairs are swapped while that improves the score.
 * Deterministic: the same input gives a deep-equal result.
 */
export function packTrailer(
  trailer: TrailerDef,
  boats: PackBoat[],
  rules: Rule[],
  existing: Placement[],
): PackResult {
  const m = buildModel(trailer, boats, rules);
  const lay = new Layout(m);
  const warnings: string[] = [];
  const bowDefault = trailer.bowForwardDefault ?? true;
  const bow = new Map<number, boolean>();
  const keptReasons = new Map<number, Reason[]>();
  const foreign: Placement[] = [];

  // 1–2. Locked placements first, as given; report the rules they break but keep them.
  for (const p of existing) {
    if (!p.locked) continue;
    const b = m.boatIndex.get(p.shellId);
    if (b === undefined) {
      foreign.push(p);
      warnings.push(
        `A locked placement is for a shell that is not on the load list (${p.shellId}); it was kept as is`,
      );
      continue;
    }
    const name = m.boats[b]!.name;
    if (lay.placed(b)) {
      warnings.push(`${name} has more than one locked placement; the first one was kept`);
      continue;
    }
    const s = m.shelfIndex.get(p.shelfId);
    if (s === undefined) {
      warnings.push(`${name} is locked to a shelf this trailer does not have; it was placed again`);
      continue;
    }
    const v = lay.literalViolations(b, s, p.lane, p.offsetCm);
    if (v.length > 0) {
      warnings.push(
        `${name} is locked in a spot that breaks a rule: ${v.map((x) => x.text).join('; ')}`,
      );
    }
    lay.forceAt(b, s, p.lane, p.offsetCm, true);
    bow.set(b, p.bowForward);
    keptReasons.set(b, p.reasons.length > 0 ? p.reasons : [LOCKED_REASON]);
  }

  // Pins become locked placements in their spot (the best lane there when none is given).
  for (const [shellId, pin] of m.pins) {
    const b = m.boatIndex.get(shellId);
    if (b === undefined || lay.placed(b)) continue;
    const s = m.shelfIndex.get(pin.params.shelfId);
    if (s === undefined) continue; // Unknown shelf: every shelf rejects the boat by the pin.
    const best = bestCandidate(lay, b, { s, l: pin.params.lane });
    if (best) {
      lay.tryInsert(b, best.s, best.l, best.index);
      lay.locked[b] = true;
    } else {
      const l = pin.params.lane ?? 0;
      const v = lay.literalViolations(b, s, l, lay.appendOffset(b, s, l));
      warnings.push(
        `${m.boats[b]!.name} is pinned to ${midSentence(m.shelves[s]!.def.label)}, which breaks a rule: ${v.map((x) => x.text).join('; ')}`,
      );
      lay.forceAppend(b, s, l, true);
    }
  }

  // 2–5. Everyone else, biggest first.
  const rest = orderBoats(
    m,
    range(m.boats.length).filter((b) => !lay.placed(b)),
  );
  let unplaced: number[] = [];
  for (const b of rest) {
    const best = bestCandidate(lay, b);
    if (best) lay.tryInsert(b, best.s, best.l, best.index);
    else unplaced.push(b);
  }

  // 6. Improve, then give boats that did not fit one more chance in the improved layout.
  improve(lay);
  unplaced = unplaced.filter((b) => {
    const best = bestCandidate(lay, b);
    if (best) lay.tryInsert(b, best.s, best.l, best.index);
    return !best;
  });

  // 7. Report.
  const placements: Placement[] = sortedPlaced(lay).map((b) =>
    toPlacement(lay, b, bow.get(b) ?? bowDefault, keptReasons.get(b) ?? reasonsFor(lay, b)),
  );
  placements.push(...foreign);
  return {
    placements,
    unplaced: unplaced.map((b) => ({
      shellId: m.boats[b]!.shellId,
      reasons: unplacedReasons(lay, b),
    })),
    metrics: metricsOf(lay),
    warnings: [...warnings, ...reportWarnings(lay, unplaced)],
  };
}

/**
 * The hard checks of §9.3.4 step 3 for one candidate against the current layout, taken
 * literally (lane and offset as given). `placements` may include the candidate's shell; its
 * old spot is ignored. For drag and drop, `dropBoat` also finds the offset.
 */
export function validatePlacement(
  trailer: TrailerDef,
  boats: PackBoat[],
  rules: Rule[],
  placements: Placement[],
  candidate: Placement,
): { ok: boolean; violations: Reason[] } {
  const m = buildModel(trailer, boats, rules);
  const b = m.boatIndex.get(candidate.shellId);
  const s = m.shelfIndex.get(candidate.shelfId);
  if (b === undefined || s === undefined) {
    const text =
      b === undefined ? 'This shell is not on the load list' : 'This trailer has no such shelf';
    return { ok: false, violations: [{ ruleId: m.fit.id, text, hard: true }] };
  }
  const lay = literalLayout(m, placements, candidate.shellId);
  const violations = toReasons(lay.literalViolations(b, s, candidate.lane, candidate.offsetCm));
  return { ok: violations.length === 0, violations };
}

export interface DropResult {
  ok: boolean;
  violations: Reason[];
  /** The moved boat's new placement (with reasons), or null for an unknown shell or shelf. */
  placement: Placement | null;
  /** Every placement after the drop: lane-mates of a packed lane may shift along the shelf. */
  placements: Placement[];
}

/**
 * Drop a boat into a cell of the end view (shelf and lane). Finds the offset the packer would
 * use (after the last boat, else in front of the first) and validates it. When it breaks a hard
 * rule, the move is still returned with `ok: false` and the violations, so the UI can refuse it
 * or accept it flagged (§4.10). The moved placement is locked unless `lock` is false.
 */
export function dropBoat(
  trailer: TrailerDef,
  boats: PackBoat[],
  rules: Rule[],
  placements: Placement[],
  shellId: Id,
  target: { shelfId: Id; lane: number },
  options: { lock?: boolean; bowForward?: boolean } = {},
): DropResult {
  const m = buildModel(trailer, boats, rules);
  const b = m.boatIndex.get(shellId);
  const s = m.shelfIndex.get(target.shelfId);
  if (b === undefined || s === undefined) {
    const text =
      b === undefined ? 'This shell is not on the load list' : 'This trailer has no such shelf';
    return {
      ok: false,
      violations: [{ ruleId: m.fit.id, text, hard: true }],
      placement: null,
      placements,
    };
  }
  const lock = options.lock ?? true;
  const lay = literalLayout(m, placements, shellId);
  const l = target.lane;
  const shelfBad = lay.shelfViolations(b, s, true);
  let violations: Violation[] = shelfBad;
  let placed = false;
  if (shelfBad.length === 0) {
    const n = lay.laneBoats(s, l).length;
    for (const index of n === 0 ? [0] : [n, 0]) {
      const v = lay.tryInsert(b, s, l, index);
      if (!v) {
        placed = true;
        break;
      }
      if (violations.length === 0) violations = [v];
    }
  }
  if (!placed) {
    // The shelf refuses the boat outright: list everything the spot breaks. Otherwise keep the
    // lane's own reason ("Does not fit end to end with Peggy …").
    if (shelfBad.length > 0) violations = lay.literalViolations(b, s, l, lay.appendOffset(b, s, l));
    lay.forceAppend(b, s, l, lock);
  }
  lay.locked[b] = lock;

  const previous = placements.find((p) => p.shellId === shellId);
  const bowForward =
    options.bowForward ?? previous?.bowForward ?? trailer.bowForwardDefault ?? true;
  const moved = toPlacement(
    lay,
    b,
    bowForward,
    placed ? reasonsFor(lay, b) : toReasons(violations),
  );
  const out = placements
    .filter((p) => p.shellId !== shellId)
    .map((p) => {
      const x = m.boatIndex.get(p.shellId);
      if (x === undefined || !lay.placed(x) || lay.offset[x] === p.offsetCm) return p;
      return { ...p, offsetCm: round1(lay.offset[x]!) };
    });
  out.push(moved);
  return {
    ok: placed,
    violations: placed ? [] : toReasons(violations),
    placement: moved,
    placements: out,
  };
}

/**
 * "Why here?" for one placed boat in any layout (packed or arranged by hand): the pin, fit, and
 * hard rules that shaped the spot, then soft-rule scores. Rules the spot breaks come first.
 */
export function explainPlacement(
  trailer: TrailerDef,
  boats: PackBoat[],
  rules: Rule[],
  placements: Placement[],
  shellId: Id,
): Reason[] {
  const m = buildModel(trailer, boats, rules);
  const lay = literalLayout(m, placements);
  const b = m.boatIndex.get(shellId);
  if (b === undefined || !lay.placed(b)) return [];
  const at = lay.remove(b);
  const broken = lay.literalViolations(b, at.s, at.l, at.offset);
  lay.restore(b, at);
  const reasons = reasonsFor(lay, b);
  if (broken.length === 0) return reasons;
  return [...toReasons(broken), ...reasons.filter((r) => r.ruleId !== m.fit.id || !r.hard)];
}

/**
 * Metrics and warnings for a layout as it stands (after drags), without packing. Includes
 * boats not on the trailer and placements that break a hard rule.
 */
export function layoutReport(
  trailer: TrailerDef,
  boats: PackBoat[],
  rules: Rule[],
  placements: Placement[],
): Pick<PackResult, 'metrics' | 'warnings'> {
  const m = buildModel(trailer, boats, rules);
  const lay = literalLayout(m, placements);
  const broken: string[] = [];
  for (const b of sortedPlaced(lay)) {
    const at = lay.remove(b);
    const v = lay.literalViolations(b, at.s, at.l, at.offset);
    lay.restore(b, at);
    if (v.length > 0) {
      broken.push(`${m.boats[b]!.name} breaks a rule: ${v.map((x) => x.text).join('; ')}`);
    }
  }
  const unplaced = range(m.boats.length).filter((b) => !lay.placed(b));
  return { metrics: metricsOf(lay), warnings: [...broken, ...reportWarnings(lay, unplaced)] };
}
