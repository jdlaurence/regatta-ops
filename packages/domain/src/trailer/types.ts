// Trailer packer contract (PLAN.md §9.3.1, §9.3.3).

import type { BoatClass, ColumnKey, CompartmentKind, Id, LaneAccess, TrailerStyle } from '../types';

export interface ShelfDef {
  id: Id;
  label: string;
  /** 1 = bottom. */
  tier: number;
  columnKey: ColumnKey;
  widthCm: number;
  lengthCm: number;
  frontOverhangMaxCm: number;
  rearOverhangMaxCm: number;
  allowedClasses?: BoatClass[];
  lanesOverride?: number;
  /** outer_first: lane 0 is nearest the post and is blocked by lane 1. */
  laneAccess: LaneAccess;
  maxBoats?: number;
  maxWeightKg?: number;
  /** 1 = easiest to load and unload. */
  accessRank: number;
  active: boolean;
}

export interface CompartmentDef {
  id: Id;
  kind: CompartmentKind;
  label: string;
  capacity: number;
  /**
   * A zone of the bed along the frame, cm from the front (PLAN.md §4.9), across the bed's full
   * width. Both set, or both unset for a compartment that runs the whole length.
   */
  startCm?: number;
  endCm?: number;
}

export interface TrailerDef {
  id: Id;
  name: string;
  style: TrailerStyle;
  /** offset_post: where the post sits across the width, percent (SRA: 33). */
  postOffsetPct?: number;
  frameLengthCm: number;
  widthCm: number;
  bowForwardDefault?: boolean;
  shelves: ShelfDef[];
  compartments: CompartmentDef[];
}

export interface PackBoat {
  shellId: Id;
  name: string;
  cls: BoatClass;
  teamId: Id;
  teamName: string;
  lengthCm: number;
  beamCm: number;
  weightKg: number;
  /** ISO instant of the earliest race using this shell; drives unload order. */
  firstRaceAt?: string;
  fragile?: boolean;
}

export interface Reason {
  ruleId: string;
  text: string;
  score?: number;
  hard: boolean;
}

export interface Placement {
  shellId: Id;
  shelfId: Id;
  lane: number;
  /** Start of the boat relative to the front of the frame, cm; negative = front overhang. */
  offsetCm: number;
  bowForward: boolean;
  locked: boolean;
  reasons: Reason[];
}

export interface ShelfMetrics {
  shelfId: Id;
  boats: number;
  lanesUsed: number;
  weightKg: number;
  frontOverhangCm: number;
  rearOverhangCm: number;
}

export interface PackResult {
  placements: Placement[];
  unplaced: { shellId: Id; reasons: Reason[] }[];
  metrics: {
    leftWeightKg: number;
    rightWeightKg: number;
    balancePct: number;
    perShelf: ShelfMetrics[];
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Rules (§9.3.3). `weight` is 1 (Low), 2 (Medium), 3 (High).

export type RuleWeight = 1 | 2 | 3;
export type RuleOrigin = 'trailer' | 'regatta';

interface RuleBase<T extends string, P> {
  id: string;
  type: T;
  hard: boolean;
  weight: RuleWeight;
  enabled: boolean;
  origin: RuleOrigin;
  params: P;
}

export type FitRule = RuleBase<'fit', { clearanceCm: number; gapCm: number }>;
export type ShelfClassesRule = RuleBase<'shelf-classes', { shelfIds: Id[]; classes: BoatClass[] }>;
export type ShelfLanesRule = RuleBase<
  'shelf-lanes',
  { shelfId: Id; lanes: number; classes?: BoatClass[] }
>;
export type ShelfOffRule = RuleBase<'shelf-off', { shelfIds: Id[] }>;
export type OverhangRule = RuleBase<
  'overhang',
  { tiers: number[]; frontMaxCm: number; rearMaxCm: number }
>;
export type MaxBoatsRule = RuleBase<'max-boats', { shelfId: Id; max: number }>;
export type PinRule = RuleBase<'pin', { shellId: Id; shelfId: Id; lane?: number }>;
export type ClassTierRule = RuleBase<'class-tier', { classes: BoatClass[]; tiers: number[] }>;
export type HeavyLowRule = RuleBase<'heavy-low', Record<string, never>>;
export type ForwardBiasRule = RuleBase<'forward-bias', Record<string, never>>;
export type SideBalanceRule = RuleBase<'side-balance', { tolerancePct: number }>;
export type UnloadOrderRule = RuleBase<'unload-order', Record<string, never>>;
export type TeamTogetherRule = RuleBase<'team-together', { teamIds?: Id[] }>;
export type FragileInsideRule = RuleBase<'fragile-inside', Record<string, never>>;

export type Rule =
  | FitRule
  | ShelfClassesRule
  | ShelfLanesRule
  | ShelfOffRule
  | OverhangRule
  | MaxBoatsRule
  | PinRule
  | ClassTierRule
  | HeavyLowRule
  | ForwardBiasRule
  | SideBalanceRule
  | UnloadOrderRule
  | TeamTogetherRule
  | FragileInsideRule;

export type RuleType = Rule['type'];

export const RULE_TYPES = [
  'fit',
  'shelf-classes',
  'shelf-lanes',
  'shelf-off',
  'overhang',
  'max-boats',
  'pin',
  'class-tier',
  'heavy-low',
  'forward-bias',
  'side-balance',
  'unload-order',
  'team-together',
  'fragile-inside',
] as const satisfies readonly RuleType[];

export const HARD_RULE_TYPES: readonly RuleType[] = [
  'fit',
  'shelf-classes',
  'shelf-lanes',
  'shelf-off',
  'overhang',
  'max-boats',
  'pin',
];
