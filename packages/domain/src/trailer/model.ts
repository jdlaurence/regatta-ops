// Normalization (PLAN.md §9.3.4 step 1): rules and shelf settings folded into effective shelves,
// plus the lookup tables the packer, validator, and reasons share. Pure.

import type { BoatClass, Id } from '../types';
import { BUILTIN_FIT_RULE, DEFAULT_CLEARANCE_CM } from './catalog';
import { explain, ruleLabel, type ExplainContext } from './explain';
import type {
  ClassTierRule,
  FitRule,
  ForwardBiasRule,
  FragileInsideRule,
  HeavyLowRule,
  MaxBoatsRule,
  OverhangRule,
  PackBoat,
  PinRule,
  Rule,
  ShelfClassesRule,
  ShelfDef,
  ShelfLanesRule,
  ShelfOffRule,
  SideBalanceRule,
  TeamTogetherRule,
  TrailerDef,
  UnloadOrderRule,
} from './types';

/** Reference beam for drawing lane slots on shelves without a lane override: a four. */
const SLOT_REFERENCE_BEAM_CM = 52;

/** Rule ids for constraints that come from a shelf's own settings rather than a rule. */
export function shelfSettingRuleId(shelfId: Id, key: string): string {
  return `shelf:${shelfId}:${key}`;
}

/** A shelf after rules are applied: what the packer and the end view actually use. */
export interface EffectiveShelf {
  def: ShelfDef;
  index: number;
  active: boolean;
  /** Why the shelf is inactive: a `shelf-off` rule or the shelf's own setting. */
  offRule?: ShelfOffRule;
  frontMaxCm: number;
  rearMaxCm: number;
  /** The `overhang` rule that set the limits above, if any. */
  overhangRule?: OverhangRule;
  /** Lane overrides, most specific first: `shelf-lanes` rules (last wins), then the shelf's own. */
  laneRules: ShelfLanesRule[];
  /** Class restrictions: the shelf's `allowedClasses` and any `shelf-classes` rules naming it. */
  classRules: ShelfClassesRule[];
  maxBoatRules: MaxBoatsRule[];
  maxWeightKg?: number;
  /** Lane cells to draw in the end view. Computed-lane shelves can hold more narrow boats. */
  laneSlots: number;
}

export interface SoftRules {
  classTier: ClassTierRule[];
  heavyLow: HeavyLowRule[];
  forwardBias: ForwardBiasRule[];
  sideBalance: SideBalanceRule[];
  unloadOrder: UnloadOrderRule[];
  teamTogether: TeamTogetherRule[];
  fragileInside: FragileInsideRule[];
}

export interface PackModel {
  trailer: TrailerDef;
  shelves: EffectiveShelf[];
  shelfIndex: Map<Id, number>;
  /** Shelf indexes by tier. */
  tiers: Map<number, number[]>;
  boats: PackBoat[];
  boatIndex: Map<Id, number>;
  /** Earliest race per boat as epoch ms (NaN when unknown); drives unload order. */
  raceTime: number[];
  fit: FitRule;
  clearanceCm: number;
  gapCm: number;
  /** Front overhang before rear (forward-bias enabled). */
  forward: boolean;
  /** Summed rule weights, precomputed for scoring. */
  weights: { forward: number; balance: number; unload: number; team: number[] };
  soft: SoftRules;
  /** `class-tier` rules marked Must. */
  hardClassTier: ClassTierRule[];
  /** Enabled pins by shell id (last wins). */
  pins: Map<Id, PinRule>;
  /** Every enabled rule plus the synthetic shelf-setting rules, by id. */
  rulesById: Map<string, Rule>;
  /** Rule order for sorting reasons. */
  ruleOrder: Map<string, number>;
  explainContext: ExplainContext;
  /** Sentence per rule id (cached). */
  text: (ruleId: string) => string;
  /** Name inside another sentence ("must physically fit"). */
  label: (ruleId: string) => string;
  /** Column names for balance warnings. */
  sideNames: { left: string; right: string };
}

function synthetic<R extends Rule>(rule: Omit<R, 'hard' | 'weight' | 'enabled' | 'origin'>): R {
  return { hard: true, weight: 3, enabled: true, origin: 'trailer', ...rule } as R;
}

function effectiveShelves(
  trailer: TrailerDef,
  enabled: Rule[],
  clearanceCm: number,
  extra: Map<string, Rule>,
  extraText: Map<string, string>,
): EffectiveShelf[] {
  return trailer.shelves.map((def, index) => {
    const offRules = enabled.filter(
      (r): r is ShelfOffRule => r.type === 'shelf-off' && r.params.shelfIds.includes(def.id),
    );
    let offRule: ShelfOffRule | undefined = offRules[0];
    if (!offRule && !def.active) {
      offRule = synthetic<ShelfOffRule>({
        id: shelfSettingRuleId(def.id, 'off'),
        type: 'shelf-off',
        params: { shelfIds: [def.id] },
      });
      extra.set(offRule.id, offRule);
    }

    const overhangRules = enabled.filter(
      (r): r is OverhangRule => r.type === 'overhang' && r.params.tiers.includes(def.tier),
    );
    const overhangRule = overhangRules[overhangRules.length - 1];

    const laneRules = enabled
      .filter((r): r is ShelfLanesRule => r.type === 'shelf-lanes' && r.params.shelfId === def.id)
      .reverse();
    if (def.lanesOverride != null && def.lanesOverride > 0) {
      const r = synthetic<ShelfLanesRule>({
        id: shelfSettingRuleId(def.id, 'lanes'),
        type: 'shelf-lanes',
        params: { shelfId: def.id, lanes: def.lanesOverride },
      });
      extra.set(r.id, r);
      laneRules.push(r);
    }

    const classRules: ShelfClassesRule[] = [];
    if (def.allowedClasses && def.allowedClasses.length > 0) {
      const r = synthetic<ShelfClassesRule>({
        id: shelfSettingRuleId(def.id, 'classes'),
        type: 'shelf-classes',
        params: { shelfIds: [def.id], classes: def.allowedClasses },
      });
      extra.set(r.id, r);
      classRules.push(r);
    }
    classRules.push(
      ...enabled.filter(
        (r): r is ShelfClassesRule =>
          r.type === 'shelf-classes' && r.params.shelfIds.includes(def.id),
      ),
    );

    const maxBoatRules: MaxBoatsRule[] = [];
    if (def.maxBoats != null) {
      const r = synthetic<MaxBoatsRule>({
        id: shelfSettingRuleId(def.id, 'max-boats'),
        type: 'max-boats',
        params: { shelfId: def.id, max: def.maxBoats },
      });
      extra.set(r.id, r);
      maxBoatRules.push(r);
    }
    maxBoatRules.push(
      ...enabled.filter(
        (r): r is MaxBoatsRule => r.type === 'max-boats' && r.params.shelfId === def.id,
      ),
    );

    if (def.maxWeightKg != null) {
      extraText.set(
        shelfSettingRuleId(def.id, 'max-weight'),
        `${def.label || def.id} carries at most ${def.maxWeightKg} kg`,
      );
    }

    const unconditional = laneRules.some((r) => !r.params.classes || r.params.classes.length === 0);
    const computedSlots = Math.floor(
      (def.widthCm + clearanceCm) / (SLOT_REFERENCE_BEAM_CM + clearanceCm),
    );
    const laneSlots = Math.max(
      0,
      ...laneRules.map((r) => r.params.lanes),
      unconditional ? 0 : computedSlots,
    );

    return {
      def,
      index,
      active: !offRule,
      ...(offRule ? { offRule } : {}),
      frontMaxCm: overhangRule ? overhangRule.params.frontMaxCm : def.frontOverhangMaxCm,
      rearMaxCm: overhangRule ? overhangRule.params.rearMaxCm : def.rearOverhangMaxCm,
      ...(overhangRule ? { overhangRule } : {}),
      laneRules,
      classRules,
      maxBoatRules,
      ...(def.maxWeightKg != null ? { maxWeightKg: def.maxWeightKg } : {}),
      laneSlots: Math.max(1, laneSlots),
    };
  });
}

/** The lane override that applies when these classes share the shelf, if any. */
export function laneRuleFor(
  shelf: EffectiveShelf,
  classes: readonly BoatClass[],
): ShelfLanesRule | undefined {
  return shelf.laneRules.find((r) => {
    const only = r.params.classes;
    return !only || only.length === 0 || classes.every((c) => only.includes(c));
  });
}

function sideNames(trailer: TrailerDef): { left: string; right: string } {
  if (trailer.style === 'offset_post') {
    const width = (key: 'left' | 'right') =>
      trailer.shelves.filter((s) => s.columnKey === key).reduce((t, s) => t + s.widthCm, 0);
    const leftNarrow = width('left') <= width('right');
    return leftNarrow
      ? { left: 'narrow side', right: 'wide side' }
      : { left: 'wide side', right: 'narrow side' };
  }
  return { left: 'left side', right: 'right side' };
}

export function buildModel(
  trailer: TrailerDef,
  boatsIn: readonly PackBoat[],
  rules: readonly Rule[],
): PackModel {
  const enabled = rules.filter((r) => r.enabled);
  const fit = (enabled.find((r) => r.type === 'fit') as FitRule | undefined) ?? BUILTIN_FIT_RULE;
  const clearanceCm = fit.params.clearanceCm ?? DEFAULT_CLEARANCE_CM;
  const gapCm = fit.params.gapCm ?? BUILTIN_FIT_RULE.params.gapCm;

  const extra = new Map<string, Rule>();
  const extraText = new Map<string, string>();
  const shelves = effectiveShelves(trailer, enabled, clearanceCm, extra, extraText);
  const shelfIndex = new Map(shelves.map((s) => [s.def.id, s.index]));
  const tiers = new Map<number, number[]>();
  for (const s of shelves) tiers.set(s.def.tier, [...(tiers.get(s.def.tier) ?? []), s.index]);

  const boats: PackBoat[] = [];
  const boatIndex = new Map<Id, number>();
  for (const b of boatsIn) {
    if (boatIndex.has(b.shellId)) continue;
    boatIndex.set(b.shellId, boats.length);
    boats.push(b);
  }
  const raceTime = boats.map((b) => (b.firstRaceAt ? Date.parse(b.firstRaceAt) : Number.NaN));

  const of = <T extends Rule['type']>(type: T) =>
    enabled.filter((r): r is Extract<Rule, { type: T }> => r.type === type && !r.hard);
  const soft: SoftRules = {
    classTier: of('class-tier'),
    heavyLow: enabled.filter((r): r is HeavyLowRule => r.type === 'heavy-low'),
    forwardBias: enabled.filter((r): r is ForwardBiasRule => r.type === 'forward-bias'),
    sideBalance: enabled.filter((r): r is SideBalanceRule => r.type === 'side-balance'),
    unloadOrder: enabled.filter((r): r is UnloadOrderRule => r.type === 'unload-order'),
    teamTogether: enabled.filter((r): r is TeamTogetherRule => r.type === 'team-together'),
    fragileInside: enabled.filter((r): r is FragileInsideRule => r.type === 'fragile-inside'),
  };
  const hardClassTier = enabled.filter(
    (r): r is ClassTierRule => r.type === 'class-tier' && r.hard,
  );

  const pins = new Map<Id, PinRule>();
  for (const r of enabled) if (r.type === 'pin' && r.params.shellId) pins.set(r.params.shellId, r);

  const rulesById = new Map<string, Rule>();
  rulesById.set(fit.id, fit);
  for (const r of enabled) rulesById.set(r.id, r);
  for (const [id, r] of extra) rulesById.set(id, r);
  const ruleOrder = new Map<string, number>();
  [fit, ...enabled, ...extra.values()].forEach((r, i) => {
    if (!ruleOrder.has(r.id)) ruleOrder.set(r.id, i);
  });

  const explainContext: ExplainContext = {
    shellNames: Object.fromEntries(boats.map((b) => [b.shellId, b.name])),
    teamNames: Object.fromEntries(boats.map((b) => [b.teamId, b.teamName])),
  };
  const textCache = new Map<string, string>();
  const text = (id: string): string => {
    let t = textCache.get(id) ?? extraText.get(id);
    if (t === undefined) {
      const rule = rulesById.get(id);
      t = rule ? explain(rule, trailer, explainContext) : id;
      textCache.set(id, t);
    }
    return t;
  };
  const label = (id: string): string => {
    const rule = rulesById.get(id);
    return rule ? ruleLabel(rule, trailer, explainContext) : text(id);
  };

  return {
    trailer,
    shelves,
    shelfIndex,
    tiers,
    boats,
    boatIndex,
    raceTime,
    fit,
    clearanceCm,
    gapCm,
    forward: soft.forwardBias.length > 0,
    weights: {
      forward: soft.forwardBias.reduce((t, r) => t + r.weight, 0),
      balance: soft.sideBalance.reduce((t, r) => t + r.weight, 0),
      unload: soft.unloadOrder.reduce((t, r) => t + r.weight, 0),
      team: boats.map((b) =>
        soft.teamTogether.reduce((t, r) => {
          const only = r.params.teamIds;
          return !only || only.length === 0 || only.includes(b.teamId) ? t + r.weight : t;
        }, 0),
      ),
    },
    soft,
    hardClassTier,
    pins,
    rulesById,
    ruleOrder,
    explainContext,
    text,
    label,
    sideNames: sideNames(trailer),
  };
}

/**
 * Effective shelves for a trailer under a rule set: active flag, overhang limits, and the number
 * of lane cells to draw (§4.10 end view). Lanes on shelves without an override depend on the
 * boats, so draw `max(laneSlots, highest used lane + 1)`.
 */
export function effectiveShelvesFor(trailer: TrailerDef, rules: readonly Rule[]): EffectiveShelf[] {
  return buildModel(trailer, [], rules).shelves;
}
