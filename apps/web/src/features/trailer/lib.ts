// Pure helpers for the regatta trailer page: the boats a regatta takes and where they are, which
// trailer each still-to-load boat is headed for, the writes a drop, a lock, or a pack turns into,
// and the numbers under the drawing. No React, no store.

import {
  DEFAULT_BALANCE_TOLERANCE_PCT,
  REAR_FLAG_THRESHOLD_CM,
  dropBoat,
  effectiveShelvesFor,
  explainPlacement,
  layoutReport,
  meters,
  mergeRules,
  packBoatsFromEntities,
  packTrailer,
  placementFromRecord,
  placementToRecord,
  regattaOverrides,
  trailerDefFromRecords,
  validatePlacement,
  type DropResult,
  type Id,
  type LoadPlacement,
  type LoadPlan,
  type PackBoat,
  type PackResult,
  type Placement,
  type Reason,
  type Rule,
  type Team,
  type Trailer,
  type TrailerDef,
} from '@regatta-ops/domain';
import { batchOp, type BatchOp, type RegattaWorkingSet } from '@/data';
import { cellLabel, sideNamesOf, tierLabel } from '@/components/trailer/labels';

// ---------------------------------------------------------------------------
// The page model: boats, trailers, plans, and where every boat is

export interface TrailerModel {
  trailer: Trailer;
  def: TrailerDef;
  /** This regatta's load plan for the trailer, if one was started. */
  plan: LoadPlan | null;
  /** Effective rules: the trailer's defaults with this regatta's overrides merged in. */
  rules: Rule[];
  /** The trailer's own default rules (what "Reset to defaults" restores). */
  defaults: Rule[];
  /** Stored placements on this trailer's plan. */
  records: LoadPlacement[];
  /** The same placements as the packer reads them. */
  placements: Placement[];
  /** Boats placed on this trailer, in placement order. */
  boats: PackBoat[];
}

export interface TrailerPageModel {
  /** Every boat the regatta takes: shells of non-scratched entries, then spares on a trailer. */
  boats: PackBoat[];
  boatById: Map<Id, PackBoat>;
  trailers: TrailerModel[];
  /** Shell → trailer it is placed on (any of the regatta's plans). */
  placedOn: Map<Id, Id>;
  /** Boats on no trailer yet, in load-list order. */
  toLoad: PackBoat[];
  /** Shells placed on a trailer that no entry uses. */
  spareIds: Set<Id>;
  /** Where each boat still to load is headed: shell → trailer (see `assignTrailers`). */
  assignment: Map<Id, Id>;
}

/**
 * The effective rule set for a plan: the trailer's current defaults with the plan's regatta
 * overrides merged in, so an admin's later change to a default still applies to plans that did
 * not override it. Without a plan, the defaults.
 */
export function effectiveRules(trailer: Pick<Trailer, 'defaultRules'>, plan: LoadPlan | null) {
  const defaults = trailer.defaultRules ?? [];
  return plan ? mergeRules(defaults, regattaOverrides(plan.rules ?? [])) : [...defaults];
}

export function buildTrailerPageModel(
  ws: Pick<
    RegattaWorkingSet,
    | 'shells'
    | 'entries'
    | 'events'
    | 'teams'
    | 'trailers'
    | 'shelves'
    | 'compartments'
    | 'loadPlans'
    | 'placements'
  >,
): TrailerPageModel {
  const planById = new Map(ws.loadPlans.map((p) => [p.id, p]));
  const shellIds = new Set(ws.shells.map((s) => s.id));
  const placedOn = new Map<Id, Id>();
  for (const p of ws.placements) {
    const plan = planById.get(p.loadPlanId);
    if (plan && shellIds.has(p.shellId) && !placedOn.has(p.shellId)) {
      placedOn.set(p.shellId, plan.trailerId);
    }
  }
  const used = new Set(
    ws.entries.filter((e) => e.status !== 'scratched' && e.shellId).map((e) => e.shellId!),
  );
  const spareIds = new Set([...placedOn.keys()].filter((id) => !used.has(id)));
  const boats = packBoatsFromEntities({
    shells: ws.shells,
    entries: ws.entries,
    events: ws.events,
    teams: ws.teams,
    spareShellIds: [...spareIds],
  });
  const boatById = new Map(boats.map((b) => [b.shellId, b]));

  const trailers: TrailerModel[] = [...ws.trailers]
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || (a.id < b.id ? -1 : 1))
    .map((trailer) => {
      const plan = ws.loadPlans.find((p) => p.trailerId === trailer.id) ?? null;
      const records = plan
        ? ws.placements.filter(
            (p) => p.loadPlanId === plan.id && placedOn.get(p.shellId) === trailer.id,
          )
        : [];
      return {
        trailer,
        def: trailerDefFromRecords(trailer, ws.shelves, ws.compartments),
        plan,
        rules: effectiveRules(trailer, plan),
        defaults: trailer.defaultRules ?? [],
        records,
        placements: records.map(placementFromRecord),
        boats: records.map((r) => boatById.get(r.shellId)).filter((b): b is PackBoat => !!b),
      };
    });

  const toLoad = boats.filter((b) => !placedOn.has(b.shellId));
  return {
    boats,
    boatById,
    trailers,
    placedOn,
    toLoad,
    spareIds,
    assignment: assignTrailers(trailers, ws.teams, toLoad),
  };
}

// ---------------------------------------------------------------------------
// Which trailer a boat still to load is headed for

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'of',
  'club',
  'team',
  'trailer',
  'big',
  'small',
  'new',
  'old',
  'junior',
  'juniors',
]);

function nameWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
      .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)),
  );
}

/** Lane cells on the trailer's active shelves: roughly how many hulls it carries. */
export function trailerCapacity(def: TrailerDef, rules: readonly Rule[]): number {
  return effectiveShelvesFor(def, rules)
    .filter((s) => s.active)
    .reduce((n, s) => n + Math.max(1, s.laneSlots), 0);
}

/**
 * Where each boat still to load should go, for "Auto pack trailer" and "Auto pack both
 * trailers". A team
 * whose name shares a word with a trailer's goes on that trailer (Junior boys → Boys trailer);
 * every other team, whole, goes on the trailer with the most room left, counting boats already
 * placed and boats sent there so far. Deterministic: teams in the order given.
 */
export function assignTrailers(
  trailers: readonly Pick<TrailerModel, 'trailer' | 'def' | 'rules' | 'records'>[],
  teams: readonly Pick<Team, 'id' | 'name' | 'shortName'>[],
  toLoad: readonly PackBoat[],
): Map<Id, Id> {
  const out = new Map<Id, Id>();
  if (trailers.length === 0) return out;
  const trailerWords = trailers.map((t) => nameWords(t.trailer.name));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const matchFor = (teamId: Id): number => {
    const team = teamById.get(teamId);
    if (!team) return -1;
    const words = nameWords(`${team.name} ${team.shortName ?? ''}`);
    return trailerWords.findIndex((tw) => [...words].some((w) => tw.has(w)));
  };
  const room = trailers.map((t) => trailerCapacity(t.def, t.rules) - t.records.length);
  const byTeam = new Map<Id, PackBoat[]>();
  for (const b of toLoad) byTeam.set(b.teamId, [...(byTeam.get(b.teamId) ?? []), b]);
  const teamOrder = [...byTeam.keys()].sort((a, b) => {
    const ia = teams.findIndex((t) => t.id === a);
    const ib = teams.findIndex((t) => t.id === b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });
  const unmatched: Id[] = [];
  for (const teamId of teamOrder) {
    const i = matchFor(teamId);
    if (i < 0) {
      unmatched.push(teamId);
      continue;
    }
    for (const b of byTeam.get(teamId)!) out.set(b.shellId, trailers[i]!.trailer.id);
    room[i] = room[i]! - byTeam.get(teamId)!.length;
  }
  for (const teamId of unmatched) {
    let best = 0;
    for (let i = 1; i < room.length; i++) if (room[i]! > room[best]!) best = i;
    for (const b of byTeam.get(teamId)!) out.set(b.shellId, trailers[best]!.trailer.id);
    room[best] = room[best]! - byTeam.get(teamId)!.length;
  }
  return out;
}

/** The boats "Auto pack trailer" works on: those on the trailer, plus those headed for it. */
export function boatsForPack(model: TrailerPageModel, tm: TrailerModel): PackBoat[] {
  const headed = model.toLoad.filter((b) => model.assignment.get(b.shellId) === tm.trailer.id);
  return [...tm.boats, ...headed];
}

// ---------------------------------------------------------------------------
// Drops, moves, and locks

export const LOCK_RULE_ID = 'locked';

/** "Locked by Sam" — the reason a hand-placed boat carries (shown in "Why here?"). */
export function lockReason(userName: string): Reason {
  return { ruleId: LOCK_RULE_ID, text: `Locked by ${userName}`, hard: true };
}

/** The stored lock reason ("Locked by Sam"), if the placement is locked. */
export function lockedBy(p: Pick<Placement, 'locked' | 'reasons'>): string | null {
  if (!p.locked) return null;
  const r = p.reasons.find((x) => x.ruleId === LOCK_RULE_ID);
  return r?.text ?? 'Locked';
}

/**
 * The lock line in "Why here?": "Locked by Sam W. Auto pack keeps it here." One period
 * even when the name ends with an initial's.
 */
export function lockNote(lock: string): string {
  return `${lock.endsWith('.') ? lock : `${lock}.`} Auto pack keeps it here.`;
}

function withoutLockReason(reasons: readonly Reason[]): Reason[] {
  return reasons.filter((r) => r.ruleId !== LOCK_RULE_ID);
}

/** A placement locked by hand: the lock reason first, the rest as they were. */
export function lockPlacement<P extends Pick<Placement, 'locked' | 'reasons'>>(
  p: P,
  userName: string,
): P {
  return { ...p, locked: true, reasons: [lockReason(userName), ...withoutLockReason(p.reasons)] };
}

export function unlockPlacement<P extends Pick<Placement, 'locked' | 'reasons'>>(p: P): P {
  return { ...p, locked: false, reasons: withoutLockReason(p.reasons) };
}

/**
 * "Doesn't fit: 19.9 m is longer than …" — the first rule a drop breaks, as one line. Fit
 * problems read "Doesn't fit"; other rules name themselves.
 */
export function refusalText(violations: readonly Reason[], rules: readonly Rule[] = []): string {
  const v = violations[0];
  if (!v) return 'This spot is not allowed.';
  if (/^does not fit/i.test(v.text)) return v.text.replace(/^Does not fit/i, "Doesn't fit");
  const text = v.text.length > 0 ? v.text[0]!.toLowerCase() + v.text.slice(1) : v.text;
  const rule = rules.find((r) => r.id === v.ruleId);
  const isFit = v.ruleId === 'fit' || v.ruleId.startsWith('shelf:') || rule?.type === 'fit';
  return isFit ? `Doesn't fit: ${text}` : `Not allowed: ${v.text}`;
}

export interface DropCheck {
  ok: boolean;
  /** The refusal, when the spot breaks a hard rule. */
  reason: string | null;
  result: DropResult;
}

/**
 * Drop a boat into a lane of this trailer: where it would sit and whether that breaks a hard
 * rule. The boat may come from "To load", this trailer, or another trailer.
 */
export function checkDrop(
  tm: TrailerModel,
  boat: PackBoat,
  cell: { shelfId: Id; lane: number },
): DropCheck {
  const boats = tm.boats.some((b) => b.shellId === boat.shellId) ? tm.boats : [...tm.boats, boat];
  const result = dropBoat(tm.def, boats, tm.rules, tm.placements, boat.shellId, cell);
  return {
    ok: result.ok,
    reason: result.ok ? null : refusalText(result.violations, tm.rules),
    result,
  };
}

export interface PlanRef {
  /** The target plan's id (new or existing). */
  id: Id;
  /** Set when the plan does not exist yet: create it in the same batch. */
  create?: Omit<LoadPlan, 'id' | 'created' | 'updated'>;
}

/** The record a new load plan starts from: the trailer's default rules, draft. */
export function newPlanData(regattaId: Id, trailer: Trailer): Omit<LoadPlan, 'id'> {
  return {
    regattaId,
    trailerId: trailer.id,
    status: 'draft',
    rules: structuredClone(trailer.defaultRules ?? []),
    packedAt: null,
    notes: '',
  };
}

export interface GuardedWrite {
  id: Id;
  patch: Partial<Omit<LoadPlacement, 'id' | 'created' | 'updated'>>;
}

export interface Writes {
  /** Single-record updates to placements (stale-write checked). */
  guarded: GuardedWrite[];
  /** Everything else, applied together. */
  batch: BatchOp[];
}

function placementPatch(p: Placement): GuardedWrite['patch'] {
  return {
    shelfId: p.shelfId,
    lane: p.lane,
    offsetCm: p.offsetCm,
    bowForward: p.bowForward,
    locked: p.locked,
    reasons: p.reasons,
  };
}

/**
 * The writes for a boat dropped by hand: the moved placement is locked ("Locked by Sam"); a
 * flagged drop keeps the rules it breaks as its reasons. A move within the plan is one guarded
 * update (plus lane-mates the drop shifted along the shelf); a move from another plan, or from
 * "To load", deletes and creates in one batch, starting the plan if needed.
 */
export function dropWrites(input: {
  result: DropResult;
  target: PlanRef;
  /** Records on the target plan. */
  targetRecords: readonly LoadPlacement[];
  /** The boat's current record, on any plan, if it is placed. */
  from: LoadPlacement | null;
  userName: string;
}): Writes {
  const { result, target, targetRecords, from, userName } = input;
  const out: Writes = { guarded: [], batch: [] };
  if (!result.placement) return out;
  const moved = lockPlacement(result.placement, userName);
  const shifted: GuardedWrite[] = [];
  for (const p of result.placements) {
    if (p.shellId === moved.shellId) continue;
    const rec = targetRecords.find((r) => r.shellId === p.shellId);
    if (rec && rec.offsetCm !== p.offsetCm)
      shifted.push({ id: rec.id, patch: { offsetCm: p.offsetCm } });
  }
  if (from && from.loadPlanId === target.id && !target.create) {
    out.guarded.push({ id: from.id, patch: placementPatch(moved) }, ...shifted);
    return out;
  }
  if (target.create)
    out.batch.push(batchOp.create('load_plans', { id: target.id, ...target.create }));
  if (from) out.batch.push(batchOp.delete('load_placements', from.id));
  out.batch.push(batchOp.create('load_placements', placementToRecord(moved, target.id)));
  for (const s of shifted) out.batch.push(batchOp.update('load_placements', s.id, s.patch));
  return out;
}

/** The best free spot for one boat on a trailer, leaving every boat already there in place. */
export function bestSpot(
  tm: Pick<TrailerModel, 'def' | 'rules' | 'placements' | 'boats'>,
  boat: PackBoat,
): { ok: true; placement: Placement } | { ok: false; reasons: Reason[] } {
  const boats = tm.boats.some((b) => b.shellId === boat.shellId)
    ? tm.boats.filter((b) => b.shellId !== boat.shellId)
    : tm.boats;
  const kept = tm.placements
    .filter((p) => p.shellId !== boat.shellId)
    .map((p) => ({ ...p, locked: true }));
  const res = packTrailer(tm.def, [...boats, boat], tm.rules, kept);
  const placed = res.placements.find((p) => p.shellId === boat.shellId);
  if (placed) return { ok: true, placement: { ...placed, locked: false } };
  const u = res.unplaced.find((x) => x.shellId === boat.shellId);
  return {
    ok: false,
    reasons: u?.reasons ?? [{ ruleId: 'fit', text: 'No shelf has room for this boat', hard: true }],
  };
}

// ---------------------------------------------------------------------------
// Packing

function samePlacement(rec: LoadPlacement, p: Placement): boolean {
  return (
    rec.shelfId === p.shelfId &&
    rec.lane === p.lane &&
    rec.offsetCm === p.offsetCm &&
    rec.bowForward === p.bowForward &&
    rec.locked === p.locked &&
    JSON.stringify(rec.reasons ?? []) === JSON.stringify(p.reasons)
  );
}

/**
 * A pack result as writes to one plan (the result replaces unlocked placements): moved
 * boats update their records, new boats get records, boats no longer placed lose theirs, and
 * the plan is stamped `packedAt`. Unchanged records are left alone.
 */
export function packOps(input: {
  plan: PlanRef;
  records: readonly LoadPlacement[];
  result: Pick<PackResult, 'placements'>;
  packedAt: string;
}): BatchOp[] {
  const { plan, records, result, packedAt } = input;
  const ops: BatchOp[] = [];
  if (plan.create)
    ops.push(batchOp.create('load_plans', { id: plan.id, ...plan.create, packedAt }));
  const byShell = new Map(records.map((r) => [r.shellId, r]));
  const placed = new Set<Id>();
  for (const p of result.placements) {
    placed.add(p.shellId);
    const rec = byShell.get(p.shellId);
    if (!rec) ops.push(batchOp.create('load_placements', placementToRecord(p, plan.id)));
    else if (!samePlacement(rec, p)) {
      ops.push(batchOp.update('load_placements', rec.id, placementPatch(p)));
    }
  }
  for (const rec of records) {
    if (!placed.has(rec.shellId)) ops.push(batchOp.delete('load_placements', rec.id));
  }
  if (!plan.create) ops.push(batchOp.update('load_plans', plan.id, { packedAt }));
  return ops;
}

/** Pack one trailer: its boats and the boats headed for it; locked placements stay. */
export function packOne(model: TrailerPageModel, tm: TrailerModel): PackResult {
  return packTrailer(tm.def, boatsForPack(model, tm), tm.rules, tm.placements);
}

/**
 * "Auto pack both trailers": pack each trailer with its boats and the boats headed for it, then put
 * whatever did not fit into free space on another trailer without disturbing it. Boats already
 * on a trailer stay on that trailer (drag one across to change that).
 */
export function packAll(model: TrailerPageModel): Map<Id, PackResult> {
  const results = new Map<Id, PackResult>();
  const boatsOn = new Map<Id, PackBoat[]>();
  for (const tm of model.trailers) {
    const boats = boatsForPack(model, tm);
    boatsOn.set(tm.trailer.id, boats);
    results.set(tm.trailer.id, packTrailer(tm.def, boats, tm.rules, tm.placements));
  }
  for (const tm of model.trailers) {
    const res = results.get(tm.trailer.id)!;
    for (const u of [...res.unplaced]) {
      const boat = model.boatById.get(u.shellId);
      if (!boat) continue;
      for (const other of model.trailers) {
        if (other === tm) continue;
        const current = results.get(other.trailer.id)!;
        const spot = bestSpot(
          {
            def: other.def,
            rules: other.rules,
            placements: current.placements,
            boats: boatsOn.get(other.trailer.id)!,
          },
          boat,
        );
        if (!spot.ok) continue;
        results.set(other.trailer.id, {
          ...current,
          placements: [...current.placements, spot.placement],
        });
        boatsOn.set(other.trailer.id, [...boatsOn.get(other.trailer.id)!, boat]);
        res.unplaced = res.unplaced.filter((x) => x.shellId !== u.shellId);
        break;
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// "Why here?"

export interface WhyHere {
  /** Rules this spot breaks (a flagged drop). */
  broken: Reason[];
  /** Hard rules that shaped the spot, then soft-rule scores, best first. */
  reasons: Reason[];
  /** "Locked by Sam", when locked. */
  lock: string | null;
  /** Stored notes that are not rules ("Where the 2026 Regionals trailer sheet put it"). */
  notes: string[];
}

export function whyHere(tm: TrailerModel, shellId: Id): WhyHere | null {
  const p = tm.placements.find((x) => x.shellId === shellId);
  if (!p) return null;
  const broken = validatePlacement(tm.def, tm.boats, tm.rules, tm.placements, p).violations;
  const all = explainPlacement(tm.def, tm.boats, tm.rules, tm.placements, shellId);
  const reasons = all.slice(broken.length);
  const ruleIds = new Set([...tm.rules.map((r) => r.id), 'fit', LOCK_RULE_ID]);
  const notes = p.reasons
    .filter((r) => !ruleIds.has(r.ruleId) && !r.ruleId.startsWith('shelf:'))
    .map((r) => r.text);
  return { broken, reasons, lock: lockedBy(p), notes };
}

/** Placements that break a hard rule (flagged drops, or rules changed since), by shell. */
export function flaggedPlacements(tm: TrailerModel): Record<Id, string> {
  const out: Record<Id, string> = {};
  for (const p of tm.placements) {
    const v = validatePlacement(tm.def, tm.boats, tm.rules, tm.placements, p).violations;
    if (v.length > 0) out[p.shellId] = v[0]!.text;
  }
  return out;
}

/** "+30", "−10.8": a soft rule's score with a real minus sign. */
export function formatScore(score: number): string {
  if (score > 0) return `+${score}`;
  if (score < 0) return `−${Math.abs(score)}`;
  return '0';
}

/** "Level 5, wide side, outer lane" for a placement on this trailer. */
export function placementWhere(
  tm: Pick<TrailerModel, 'def' | 'rules'>,
  p: Pick<Placement, 'shelfId' | 'lane'>,
): string {
  const shelves = effectiveShelvesFor(tm.def, tm.rules);
  const s = shelves.find((x) => x.def.id === p.shelfId);
  if (!s) return 'A shelf this trailer no longer has';
  const count = Math.max(1, s.laneSlots, p.lane + 1);
  return cellLabel(tm.def, s.def, p.lane, count);
}

// ---------------------------------------------------------------------------
// Metrics footer

export interface TierOverhang {
  tier: number;
  label: string;
  frontCm: number;
  rearCm: number;
  /** Rear overhang past 1.2 m (4 ft) needs a flag (§16.5). */
  needsFlag: boolean;
}

export interface MetricsSummary {
  leftName: string;
  rightName: string;
  leftKg: number;
  rightKg: number;
  balancePct: number;
  /** The side-balance rule's tolerance, when that rule is on. */
  tolerancePct: number | null;
  withinTolerance: boolean;
  tiers: TierOverhang[];
  warnings: string[];
}

/** Weight per side, per-level overhang, and warnings for the layout as it stands. */
export function metricsSummary(tm: TrailerModel): MetricsSummary {
  const report = layoutReport(tm.def, tm.boats, tm.rules, tm.placements);
  const sides = sideNamesOf(tm.def);
  const balance = tm.rules.find((r) => r.type === 'side-balance' && r.enabled);
  const tolerancePct =
    balance && balance.type === 'side-balance'
      ? (balance.params.tolerancePct ?? DEFAULT_BALANCE_TOLERANCE_PCT)
      : null;
  const shelfTier = new Map(tm.def.shelves.map((s) => [s.id, s.tier]));
  const byTier = new Map<number, { front: number; rear: number; boats: number }>();
  for (const m of report.metrics.perShelf) {
    const tier = shelfTier.get(m.shelfId);
    if (tier === undefined) continue;
    const t = byTier.get(tier) ?? { front: 0, rear: 0, boats: 0 };
    t.front = Math.max(t.front, m.frontOverhangCm);
    t.rear = Math.max(t.rear, m.rearOverhangCm);
    t.boats += m.boats;
    byTier.set(tier, t);
  }
  const tiers: TierOverhang[] = [...byTier.entries()]
    .filter(([, t]) => t.boats > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([tier, t]) => ({
      tier,
      label: tierLabel(tm.def, tier),
      frontCm: t.front,
      rearCm: t.rear,
      needsFlag: t.rear > REAR_FLAG_THRESHOLD_CM + 1e-6,
    }));
  const { leftWeightKg, rightWeightKg, balancePct } = report.metrics;
  return {
    leftName: sides.left,
    rightName: sides.right,
    leftKg: leftWeightKg,
    rightKg: rightWeightKg,
    balancePct,
    tolerancePct,
    withinTolerance: tolerancePct === null || balancePct <= tolerancePct + 1e-9,
    tiers,
    warnings: report.warnings.filter((w) => !/\bnot placed:/.test(w)),
  };
}

/** "5.0 m front, 2.7 m rear" / "No overhang". */
export function overhangText(t: Pick<TierOverhang, 'frontCm' | 'rearCm'>): string {
  const parts: string[] = [];
  if (t.frontCm > 0) parts.push(`${meters(t.frontCm)} m front`);
  if (t.rearCm > 0) parts.push(`${meters(t.rearCm)} m rear`);
  return parts.length > 0 ? parts.join(', ') : 'No overhang';
}
