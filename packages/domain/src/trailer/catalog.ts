// Rule catalog for the rules editor gallery (PLAN.md §4.10, §9.3.3), rule construction, and
// merging trailer defaults with regatta overrides.

import { hash32 } from '../ids';
import type { FitRule, Rule, RuleOrigin, RuleType, RuleWeight } from './types';

export type RuleOfType<T extends RuleType> = Extract<Rule, { type: T }>;
export type RuleParamsOf<T extends RuleType> = RuleOfType<T>['params'];

export const DEFAULT_CLEARANCE_CM = 20;
export const DEFAULT_GAP_CM = 30;
/** Washington: loads more than 4 ft past the rear need flags (§16.5). */
export const REAR_FLAG_THRESHOLD_CM = 122;
export const DEFAULT_BALANCE_TOLERANCE_PCT = 10;

/** The built-in fit rule, used when the rule set has no enabled `fit` rule (§9.3.3). */
export const BUILTIN_FIT_RULE: FitRule = {
  id: 'fit',
  type: 'fit',
  hard: true,
  weight: 3,
  enabled: true,
  origin: 'trailer',
  params: { clearanceCm: DEFAULT_CLEARANCE_CM, gapCm: DEFAULT_GAP_CM },
};

/** A numeric param the editor shows as a field. */
export interface RuleNumberField {
  key: string;
  label: string;
  unit: 'cm' | '%' | 'boats' | 'lanes';
  min: number;
  max?: number;
}

/** What the editor needs to pick for a rule type. */
export interface RuleEditorNeeds {
  /** 'one' for a single shelf (`shelfId`), 'many' for `shelfIds`. */
  shelf: 'one' | 'many' | null;
  /** `tiers` list. */
  tiers: boolean;
  /** `classes`: required, optional (blank means any), or not used. */
  classes: 'required' | 'optional' | null;
  /** `shellId`. */
  shell: boolean;
  /** Optional `lane` (0-based) on the chosen shelf. */
  lane: boolean;
  /** Optional `teamIds`. */
  teams: boolean;
  numbers: RuleNumberField[];
}

export interface RuleCatalogEntry<T extends RuleType = RuleType> {
  type: T;
  /** Gallery wording (§4.10). */
  title: string;
  /** Must (true) or Prefer (false). */
  hard: boolean;
  /** False only for the built-in fit rule, which is always on and not added from the gallery. */
  inGallery: boolean;
  defaultWeight: RuleWeight;
  defaultParams: RuleParamsOf<T>;
  needs: RuleEditorNeeds;
}

/** A catalog entry of any rule type (a union, so `type` narrows `defaultParams`). */
export type AnyRuleCatalogEntry = { [T in RuleType]: RuleCatalogEntry<T> }[RuleType];

const NO_NEEDS: RuleEditorNeeds = {
  shelf: null,
  tiers: false,
  classes: null,
  shell: false,
  lane: false,
  teams: false,
  numbers: [],
};

function entry<T extends RuleType>(
  type: T,
  title: string,
  hard: boolean,
  defaultParams: RuleParamsOf<T>,
  needs: Partial<RuleEditorNeeds> = {},
  inGallery = true,
): RuleCatalogEntry<T> {
  return {
    type,
    title,
    hard,
    inGallery,
    defaultWeight: hard ? 3 : 2,
    defaultParams,
    needs: { ...NO_NEEDS, ...needs },
  };
}

/**
 * Every rule type, in gallery order (§4.10's list, then the two types §9.3.3 adds, then the
 * built-in fit rule). Each rule type appears exactly once.
 */
export const RULE_CATALOG: readonly AnyRuleCatalogEntry[] = [
  entry(
    'shelf-classes',
    'Only certain boat classes on a shelf',
    true,
    { shelfIds: [], classes: [] },
    { shelf: 'many', classes: 'required' },
  ),
  entry(
    'shelf-lanes',
    'A shelf fits N boats side by side',
    true,
    { shelfId: '', lanes: 3 },
    {
      shelf: 'one',
      classes: 'optional',
      numbers: [{ key: 'lanes', label: 'Boats side by side', unit: 'lanes', min: 1, max: 8 }],
    },
  ),
  entry('shelf-off', "Don't use a shelf", true, { shelfIds: [] }, { shelf: 'many' }),
  entry(
    'overhang',
    'Overhang limits for a tier',
    true,
    { tiers: [], frontMaxCm: 300, rearMaxCm: 120 },
    {
      tiers: true,
      numbers: [
        { key: 'frontMaxCm', label: 'In front', unit: 'cm', min: 0, max: 1000 },
        { key: 'rearMaxCm', label: 'Behind', unit: 'cm', min: 0, max: 1000 },
      ],
    },
  ),
  entry(
    'class-tier',
    'Prefer certain classes on a tier',
    false,
    { classes: [], tiers: [] },
    { tiers: true, classes: 'required' },
  ),
  entry('heavy-low', 'Keep heavier boats low', false, {}),
  entry('forward-bias', 'Put weight forward, not behind', false, {}),
  entry(
    'side-balance',
    'Balance the two sides',
    false,
    { tolerancePct: DEFAULT_BALANCE_TOLERANCE_PCT },
    { numbers: [{ key: 'tolerancePct', label: 'Tolerance', unit: '%', min: 0, max: 100 }] },
  ),
  entry('unload-order', 'Boats racing first are easiest to reach', false, {}),
  entry('team-together', "Keep a team's boats together", false, {}, { teams: true }),
  entry(
    'pin',
    'Pin a shell to a spot',
    true,
    { shellId: '', shelfId: '' },
    { shell: true, shelf: 'one', lane: true },
  ),
  entry(
    'max-boats',
    'A shelf holds at most N boats',
    true,
    { shelfId: '', max: 2 },
    {
      shelf: 'one',
      numbers: [{ key: 'max', label: 'Most boats', unit: 'boats', min: 0, max: 20 }],
    },
  ),
  entry('fragile-inside', 'Keep fragile boats in inside lanes', false, {}),
  entry(
    'fit',
    'Boats must physically fit',
    true,
    { clearanceCm: DEFAULT_CLEARANCE_CM, gapCm: DEFAULT_GAP_CM },
    {
      numbers: [
        { key: 'clearanceCm', label: 'Between hulls', unit: 'cm', min: 0, max: 100 },
        { key: 'gapCm', label: 'Between ends', unit: 'cm', min: 0, max: 200 },
      ],
    },
    false,
  ),
];

export function catalogEntry<T extends RuleType>(type: T): RuleCatalogEntry<T> {
  const found = RULE_CATALOG.find((e) => e.type === type);
  if (!found) throw new Error(`Unknown rule type: ${type}`);
  return found as unknown as RuleCatalogEntry<T>;
}

/** JSON with sorted keys, so equal params hash equally. */
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
  return JSON.stringify(value);
}

/** Deterministic id for a rule: `r_<type>_<hash of params>`. */
export function deriveRuleId(type: RuleType, params: unknown): string {
  return `r_${type}_${hash32(canonical(params))}`;
}

/**
 * A new rule of `type` with the catalog defaults, `params` merged over them. The id is `id` when
 * given, otherwise derived from the type and params (same params, same id). Regatta-level by
 * default, since that is what a coach adds from the gallery.
 */
export function makeRule<T extends RuleType>(
  type: T,
  params: Partial<RuleParamsOf<T>> = {},
  origin: RuleOrigin = 'regatta',
  id?: string,
): RuleOfType<T> {
  const cat = catalogEntry(type);
  const merged = { ...cat.defaultParams, ...params } as RuleParamsOf<T>;
  return {
    id: id ?? deriveRuleId(type, merged),
    type,
    hard: cat.hard,
    weight: cat.defaultWeight,
    enabled: true,
    origin,
    params: merged,
  } as RuleOfType<T>;
}

/**
 * The effective rule set for a load plan (§4.9, §4.10): trailer defaults in order, each replaced
 * by the regatta rule with the same id when there is one, then regatta-only rules appended.
 */
export function mergeRules(
  trailerDefaults: readonly Rule[],
  regattaOverrides: readonly Rule[],
): Rule[] {
  const byId = new Map(regattaOverrides.map((r) => [r.id, r]));
  const out = trailerDefaults.map((r) => byId.get(r.id) ?? r);
  const defaultIds = new Set(trailerDefaults.map((r) => r.id));
  for (const r of regattaOverrides) if (!defaultIds.has(r.id)) out.push(r);
  return out;
}

/** True for a rule changed or added for this regatta only ("This regatta" badge). */
export function isRegattaOverride(rule: Rule): boolean {
  return rule.origin === 'regatta';
}

/**
 * Change a rule for this regatta only: the same id, origin 'regatta', so `mergeRules` replaces
 * the trailer default. Use `{ enabled: false }` to turn a default off for one regatta.
 */
export function overrideRule<R extends Rule>(rule: R, changes: Partial<Omit<R, 'id' | 'type'>>): R {
  return { ...rule, ...changes, origin: 'regatta' };
}

/** The regatta overrides in an effective rule set (what "Reset to defaults" removes). */
export function regattaOverrides(rules: readonly Rule[]): Rule[] {
  return rules.filter(isRegattaOverride);
}
