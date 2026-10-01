// Mutable working layout for the packer (PLAN.md §9.3.2 geometry, §9.3.4 hard checks).
// Internal: callers use packTrailer / validatePlacement / dropBoat.

import type { BoatClass } from '../types';
import { joinAnd, meters, midSentence } from './format';
import { laneRuleFor, shelfSettingRuleId, type EffectiveShelf, type PackModel } from './model';

export interface Violation {
  readonly ruleId: string;
  readonly text: string;
}

/** A violation whose sentence is built only when read (the packer mostly needs the rule id). */
class LazyViolation implements Violation {
  readonly ruleId: string;
  private readonly make: () => string;
  constructor(ruleId: string, make: () => string) {
    this.ruleId = ruleId;
    this.make = make;
  }
  get text(): string {
    return this.make();
  }
}

const EMPTY: readonly number[] = [];
const EPS = 1e-6;

export class Layout {
  readonly m: PackModel;
  /** Shelf index per boat, -1 when unplaced. */
  readonly shelf: number[];
  readonly lane: number[];
  readonly offset: number[];
  readonly locked: boolean[];
  /** Boat indexes per shelf and lane, front to back. */
  readonly lanes: number[][][];
  readonly count: number[];
  readonly weight: number[];
  left = 0;
  right = 0;
  /** Whether any pair rule (team-together, unload-order) is on. */
  readonly pairs: boolean;

  constructor(m: PackModel) {
    this.m = m;
    this.pairs = m.weights.unload > 0 || m.weights.team.some((w) => w > 0);
    const n = m.boats.length;
    this.shelf = new Array<number>(n).fill(-1);
    this.lane = new Array<number>(n).fill(-1);
    this.offset = new Array<number>(n).fill(0);
    this.locked = new Array<boolean>(n).fill(false);
    this.lanes = m.shelves.map(() => []);
    this.count = m.shelves.map(() => 0);
    this.weight = m.shelves.map(() => 0);
  }

  placed(b: number): boolean {
    return this.shelf[b]! >= 0;
  }

  end(b: number): number {
    return this.offset[b]! + this.m.boats[b]!.lengthCm;
  }

  laneBoats(s: number, l: number): readonly number[] {
    return this.lanes[s]![l] ?? EMPTY;
  }

  /** A lane holding a locked boat keeps every position fixed; otherwise it is packed. */
  isFixed(s: number, l: number): boolean {
    for (const b of this.laneBoats(s, l)) if (this.locked[b]) return true;
    return false;
  }

  /**
   * −1 left, +1 right, 0 center: a lane over the trailer's centerline (the inner lane of an
   * offset-post trailer's wide side), or the middle third of a full-width shelf.
   */
  side(s: number, l: number): -1 | 0 | 1 {
    const sh = this.m.shelves[s]!;
    // Depends only on the lane itself so a boat's side never changes while it sits there.
    const n = Math.max(sh.laneSlots, l + 1);
    if (sh.def.columnKey === 'full') {
      const pos = (l + 0.5) / n;
      return pos < 1 / 3 ? -1 : pos > 2 / 3 ? 1 : 0;
    }
    // The shelf runs from the post to the trailer's edge; lanes count out from the post.
    const post = this.m.postAt;
    const reach = sh.def.columnKey === 'left' ? -post : 1 - post;
    const near = post + (reach * l) / n;
    const far = post + (reach * (l + 1)) / n;
    if (Math.max(near, far) <= 0.5 + EPS) return -1;
    if (Math.min(near, far) >= 0.5 - EPS) return 1;
    return 0;
  }

  /** Lane cells to consider on a shelf: every used lane, one new one, and any override lanes. */
  laneCandidates(s: number): number {
    let n = this.lanes[s]!.length + 1;
    for (const r of this.m.shelves[s]!.laneRules) n = Math.max(n, r.params.lanes);
    return n;
  }

  /** Lanes that could hold this boat alone on this shelf (for inside/outside lane rules). */
  capacity(s: number, b: number): number {
    const sh = this.m.shelves[s]!;
    const boat = this.m.boats[b]!;
    const rule = laneRuleFor(sh, [boat.cls]);
    if (rule) return Math.max(1, rule.params.lanes);
    const c = this.m.clearanceCm;
    return Math.max(1, Math.floor((sh.def.widthCm + c) / (boat.beamCm + c)));
  }

  isOuterLane(s: number, l: number, b: number): boolean {
    const cap = this.capacity(s, b);
    if (cap <= 1) return true;
    if (this.m.shelves[s]!.def.columnKey === 'full') return l === 0 || l >= cap - 1;
    return l >= cap - 1;
  }

  // -------------------------------------------------------------------------
  // Low-level mutation

  private attach(b: number, s: number, l: number, index: number, offset: number): void {
    const lanes = this.lanes[s]!;
    while (lanes.length <= l) lanes.push([]);
    lanes[l]!.splice(index, 0, b);
    this.shelf[b] = s;
    this.lane[b] = l;
    this.offset[b] = offset;
    const boat = this.m.boats[b]!;
    this.count[s]! += 1;
    this.weight[s]! += boat.weightKg;
    const side = this.side(s, l);
    if (side < 0) this.left += boat.weightKg;
    else if (side > 0) this.right += boat.weightKg;
  }

  private detach(b: number): { s: number; l: number; index: number } {
    const s = this.shelf[b]!;
    const l = this.lane[b]!;
    const lanes = this.lanes[s]!;
    const arr = lanes[l]!;
    const index = arr.indexOf(b);
    arr.splice(index, 1);
    const boat = this.m.boats[b]!;
    const side = this.side(s, l);
    if (side < 0) this.left -= boat.weightKg;
    else if (side > 0) this.right -= boat.weightKg;
    this.count[s]! -= 1;
    this.weight[s]! -= boat.weightKg;
    while (lanes.length > 0 && lanes[lanes.length - 1]!.length === 0) lanes.pop();
    this.shelf[b] = -1;
    this.lane[b] = -1;
    return { s, l, index };
  }

  /** Offsets for boats laid end to end in this order, or null when they do not fit. */
  packedOffsets(sh: EffectiveShelf, order: readonly number[]): number[] | null {
    const lens = order.map((b) => this.m.boats[b]!.lengthCm);
    const span = lens.reduce((t, x) => t + x, 0) + this.m.gapCm * Math.max(0, lens.length - 1);
    const L = sh.def.lengthCm;
    if (span > sh.frontMaxCm + L + sh.rearMaxCm + EPS) return null;
    const excess = span - L;
    let start = 0;
    if (excess > 0) {
      start = this.m.forward
        ? -Math.min(sh.frontMaxCm, excess)
        : -Math.max(0, excess - sh.rearMaxCm);
    }
    const out: number[] = [];
    let at = start;
    for (const len of lens) {
      out.push(at);
      at += len + this.m.gapCm;
    }
    return out;
  }

  private relayout(s: number, l: number): void {
    if (this.isFixed(s, l)) return;
    const arr = this.laneBoats(s, l);
    if (arr.length === 0) return;
    const offs = this.packedOffsets(this.m.shelves[s]!, arr);
    // A lane only shrinks or was checked before commit, so it always fits here; keep old
    // offsets otherwise (defensive; forced placements never share a packed lane).
    if (!offs) return;
    arr.forEach((b, i) => {
      this.offset[b] = offs[i]!;
    });
  }

  remove(b: number): { s: number; l: number; index: number; offset: number } {
    const offset = this.offset[b]!;
    const at = this.detach(b);
    this.relayout(at.s, at.l);
    return { ...at, offset };
  }

  /** Put a boat back exactly where `remove` took it from. */
  restore(b: number, at: { s: number; l: number; index: number; offset: number }): void {
    this.attach(b, at.s, at.l, at.index, at.offset);
    this.relayout(at.s, at.l);
  }

  /** Literal placement (locked or hand-placed): kept at its offset, sorted into the lane. */
  forceAt(b: number, s: number, l: number, offset: number, locked: boolean): void {
    const arr = this.laneBoats(s, l);
    let index = 0;
    while (index < arr.length && this.offset[arr[index]!]! <= offset) index++;
    this.locked[b] = locked;
    this.attach(b, s, l, index, offset);
  }

  /** Where a boat goes when appended to a lane: after the last boat, or alone as packed. */
  appendOffset(b: number, s: number, l: number): number {
    const arr = this.laneBoats(s, l);
    const last = arr[arr.length - 1];
    if (last !== undefined) return this.end(last) + this.m.gapCm;
    const sh = this.m.shelves[s]!;
    // Too long for the shelf: use all the front overhang, so the rear sticks out least.
    return this.packedOffsets(sh, [b])?.[0] ?? -sh.frontMaxCm;
  }

  /** Append a boat after the last one in a lane without checks (forced pins and drops). */
  forceAppend(b: number, s: number, l: number, locked: boolean): void {
    this.forceAt(b, s, l, this.appendOffset(b, s, l), locked);
  }

  // -------------------------------------------------------------------------
  // Hard checks (§9.3.4 step 3)

  private ruleViolation(ruleId: string): Violation {
    return { ruleId, text: this.m.text(ruleId) };
  }

  /** Shelf-level checks: active, classes, pins, boat count, weight. First only unless `all`. */
  shelfViolations(b: number, s: number, all = false): Violation[] {
    const m = this.m;
    const sh = m.shelves[s]!;
    const boat = m.boats[b]!;
    const out: Violation[] = [];
    if (!sh.active && sh.offRule) {
      out.push(this.ruleViolation(sh.offRule.id));
      if (!all) return out;
    }
    for (const r of sh.classRules) {
      if (r.params.classes.includes(boat.cls)) continue;
      out.push(this.ruleViolation(r.id));
      if (!all) return out;
    }
    for (const r of m.hardClassTier) {
      if (!r.params.classes.includes(boat.cls) || r.params.tiers.includes(sh.def.tier)) continue;
      out.push(this.ruleViolation(r.id));
      if (!all) return out;
    }
    const pin = m.pins.get(boat.shellId);
    if (pin && pin.params.shelfId !== sh.def.id) {
      out.push(this.ruleViolation(pin.id));
      if (!all) return out;
    }
    const here = this.shelf[b] === s ? 0 : 1;
    const count = this.count[s]! + here;
    for (const r of sh.maxBoatRules) {
      if (count <= r.params.max) continue;
      out.push(this.ruleViolation(r.id));
      if (!all) return out;
    }
    if (sh.maxWeightKg != null && this.weight[s]! + here * boat.weightKg > sh.maxWeightKg + EPS) {
      out.push(this.ruleViolation(shelfSettingRuleId(sh.def.id, 'max-weight')));
    }
    return out;
  }

  private classesOnShelf(s: number, extra: number): BoatClass[] {
    const set = new Set<BoatClass>([this.m.boats[extra]!.cls]);
    for (const lane of this.lanes[s]!) for (const x of lane) set.add(this.m.boats[x]!.cls);
    return [...set];
  }

  /** Lane-count and width checks for boat `b` joining lane `l` of shelf `s`. */
  private widthViolation(b: number, s: number, l: number): Violation | null {
    const m = this.m;
    const sh = m.shelves[s]!;
    const pin = m.pins.get(m.boats[b]!.shellId);
    if (
      pin &&
      pin.params.shelfId === sh.def.id &&
      pin.params.lane != null &&
      pin.params.lane !== l
    ) {
      return this.ruleViolation(pin.id);
    }
    if (l < 0 || !Number.isInteger(l))
      return { ruleId: m.fit.id, text: 'Lane is not on this shelf' };
    const rule = sh.laneRules.length > 0 ? laneRuleFor(sh, this.classesOnShelf(s, b)) : undefined;
    if (rule) return l < rule.params.lanes ? null : this.ruleViolation(rule.id);
    const c = m.clearanceCm;
    const lanes = this.lanes[s]!;
    let total = 0;
    const n = Math.max(lanes.length, l + 1);
    for (let j = 0; j < n; j++) {
      let beam = -1;
      for (const x of lanes[j] ?? EMPTY) if (x !== b) beam = Math.max(beam, m.boats[x]!.beamCm);
      if (j === l) beam = Math.max(beam, m.boats[b]!.beamCm);
      if (beam >= 0) total += beam + c;
    }
    if (total <= sh.def.widthCm + c + EPS) return null;
    return new LazyViolation(
      m.fit.id,
      () =>
        `Not enough room across ${midSentence(sh.def.label)}: side by side this needs ${Math.round(total - c)} cm of ${sh.def.widthCm} cm`,
    );
  }

  private lengthRuleId(sh: EffectiveShelf, span: number): string {
    const original = sh.def.frontOverhangMaxCm + sh.def.lengthCm + sh.def.rearOverhangMaxCm;
    return sh.overhangRule && span <= original + EPS ? sh.overhangRule.id : this.m.fit.id;
  }

  private lengthViolation(sh: EffectiveShelf, order: readonly number[], b: number): Violation {
    const m = this.m;
    const span =
      order.reduce((t, x) => t + m.boats[x]!.lengthCm, 0) + m.gapCm * Math.max(0, order.length - 1);
    return new LazyViolation(this.lengthRuleId(sh, span), () => {
      const usable = sh.frontMaxCm + sh.def.lengthCm + sh.rearMaxCm;
      const others = order.filter((x) => x !== b).map((x) => m.boats[x]!.name);
      return others.length === 0
        ? `${meters(span)} m is longer than the ${meters(usable)} m ${midSentence(sh.def.label)} takes, including overhang`
        : `Does not fit end to end with ${joinAnd(others)}: ${meters(span)} m of ${meters(usable)} m including overhang`;
    });
  }

  /** Boundary and spacing checks for a boat at a literal offset among fixed lane-mates. */
  private positionViolations(b: number, s: number, l: number, offset: number): Violation[] {
    const m = this.m;
    const sh = m.shelves[s]!;
    const boat = m.boats[b]!;
    const out: Violation[] = [];
    const front = -offset;
    const rear = offset + boat.lengthCm - sh.def.lengthCm;
    const label = sh.def.label ? midSentence(sh.def.label) : 'this shelf';
    if (front > sh.frontMaxCm + EPS) {
      out.push(
        new LazyViolation(
          this.lengthRuleId(sh, boat.lengthCm),
          () =>
            `Sticks out ${meters(front)} m in front; ${label} allows ${meters(sh.frontMaxCm)} m`,
        ),
      );
    }
    if (rear > sh.rearMaxCm + EPS) {
      out.push(
        new LazyViolation(
          this.lengthRuleId(sh, boat.lengthCm),
          () => `Sticks out ${meters(rear)} m behind; ${label} allows ${meters(sh.rearMaxCm)} m`,
        ),
      );
    }
    for (const x of this.laneBoats(s, l)) {
      if (x === b) continue;
      const apart =
        offset >= this.offset[x]!
          ? offset - this.end(x)
          : this.offset[x]! - (offset + boat.lengthCm);
      if (apart < m.gapCm - EPS) {
        const name = m.boats[x]!.name;
        out.push(
          new LazyViolation(m.fit.id, () =>
            apart < 0
              ? `Overlaps ${name} in this lane`
              : `Too close to ${name}: boats in a lane need ${m.gapCm} cm between ends`,
          ),
        );
      }
    }
    return out;
  }

  /**
   * Try to put boat `b` at position `index` of lane `l` on shelf `s` (shelf-level checks are the
   * caller's). Commits and returns null when it fits; otherwise changes nothing.
   */
  tryInsert(b: number, s: number, l: number, index: number): Violation | null {
    const width = this.widthViolation(b, s, l);
    if (width) return width;
    const sh = this.m.shelves[s]!;
    const arr = this.laneBoats(s, l);
    if (this.isFixed(s, l)) {
      const len = this.m.boats[b]!.lengthCm;
      const gap = this.m.gapCm;
      let offset: number;
      if (index >= arr.length) offset = this.end(arr[arr.length - 1]!) + gap;
      else if (index === 0) offset = this.offset[arr[0]!]! - gap - len;
      else offset = this.end(arr[index - 1]!) + gap;
      const bad = this.positionViolations(b, s, l, offset);
      if (bad.length > 0) return bad[0]!;
      this.attach(b, s, l, index, offset);
      return null;
    }
    const order = [...arr.slice(0, index), b, ...arr.slice(index)];
    const offs = this.packedOffsets(sh, order);
    if (!offs) return this.lengthViolation(sh, order, b);
    this.attach(b, s, l, index, offs[index]!);
    this.relayout(s, l);
    return null;
  }

  /** Every hard rule a literal placement breaks, against the boats already placed. */
  literalViolations(b: number, s: number, l: number, offset: number): Violation[] {
    const out = this.shelfViolations(b, s, true);
    const width = this.widthViolation(b, s, l);
    if (width) out.push(width);
    out.push(...this.positionViolations(b, s, l, offset));
    const seen = new Set<string>();
    return out.filter((v) => {
      const key = `${v.ruleId}|${v.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** Front and rear overhang of a lane, cm. */
  laneOverhang(s: number, l: number): { front: number; rear: number } {
    const arr = this.laneBoats(s, l);
    if (arr.length === 0) return { front: 0, rear: 0 };
    let min = Infinity;
    let max = -Infinity;
    for (const b of arr) {
      min = Math.min(min, this.offset[b]!);
      max = Math.max(max, this.end(b));
    }
    const L = this.m.shelves[s]!.def.lengthCm;
    return { front: Math.max(0, -min), rear: Math.max(0, max - L) };
  }
}
