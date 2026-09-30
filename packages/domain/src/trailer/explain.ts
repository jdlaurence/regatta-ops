// Rule sentences (PLAN.md §9.3.3). STUB: WP-B replaces the body.

import type { Rule, TrailerDef } from './types';

export function explain(rule: Rule, _trailer: TrailerDef): string {
  return rule.type;
}
