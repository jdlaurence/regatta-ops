// Rule-list edits for the rules editor (PLAN.md §4.10, §9.3.3). Pure. In regatta mode every
// change becomes a regatta override (same id, origin 'regatta', so mergeRules replaces the
// trailer default); a change that lands back on the default drops the override again.

import {
  isRegattaOverride,
  makeRule,
  overrideRule,
  type Rule,
  type RuleParamsOf,
  type RuleType,
  type RuleWeight,
} from '@regatta-ops/domain';

export type RulesMode = 'trailer' | 'regatta';

export const WEIGHT_LABELS: Record<RuleWeight, string> = { 1: 'Low', 2: 'Medium', 3: 'High' };

/** JSON with sorted keys, ignoring undefined. */
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

/** Same rule apart from where it came from. */
export function sameRule(a: Rule, b: Rule): boolean {
  const strip = (r: Rule) => ({ ...r, origin: undefined });
  return canonical(strip(a)) === canonical(strip(b));
}

export function sameRules(a: readonly Rule[], b: readonly Rule[]): boolean {
  return a.length === b.length && a.every((r, i) => canonical(r) === canonical(b[i]));
}

/** The trailer default this rule overrides, if any. */
export function defaultFor(rule: Rule, defaults: readonly Rule[] | undefined): Rule | undefined {
  return defaults?.find((d) => d.id === rule.id);
}

/**
 * A changed rule as it should be stored. Trailer mode: the change itself. Regatta mode: an
 * override, or the default again when the change undoes every difference.
 */
export function settleChange(
  rule: Rule,
  changes: Partial<Omit<Rule, 'id' | 'type'>>,
  mode: RulesMode,
  defaults: readonly Rule[] | undefined,
): Rule {
  const next = { ...rule, ...changes } as Rule;
  if (mode === 'trailer') return { ...next, origin: 'trailer' } as Rule;
  const def = defaultFor(rule, defaults);
  if (def && sameRule(def, next)) return def;
  return overrideRule(rule, changes as Partial<Omit<typeof rule, 'id' | 'type'>>);
}

export function replaceRule(rules: readonly Rule[], next: Rule): Rule[] {
  return rules.map((r) => (r.id === next.id ? next : r));
}

/** An id not used by any rule in the list (nor by a default it might collide with). */
export function uniqueRuleId(id: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** A new rule from the gallery, with params filled in by the editor. */
export function newRule<T extends RuleType>(
  type: T,
  params: Partial<RuleParamsOf<T>>,
  mode: RulesMode,
  taken: Iterable<string>,
  overrides: Partial<Pick<Rule, 'hard' | 'weight'>> = {},
): Rule {
  const base = makeRule(type, params, mode === 'regatta' ? 'regatta' : 'trailer');
  return { ...base, ...overrides, id: uniqueRuleId(base.id, taken) } as Rule;
}

/** Whether the editor may delete this rule: never the fit rule; in regatta mode, only rules
 * added for this regatta (defaults are turned off instead). */
export function canDelete(
  rule: Rule,
  mode: RulesMode,
  defaults: readonly Rule[] | undefined,
): boolean {
  if (rule.type === 'fit') return false;
  if (mode === 'trailer') return true;
  return isRegattaOverride(rule) && !defaultFor(rule, defaults);
}

/** Whether this rule is a regatta change to a trailer default (offer "Use trailer default"). */
export function isChangedDefault(
  rule: Rule,
  mode: RulesMode,
  defaults: readonly Rule[] | undefined,
): boolean {
  return mode === 'regatta' && isRegattaOverride(rule) && !!defaultFor(rule, defaults);
}
