// findConflicts (PLAN.md §9.2): pure, deterministic, run in the browser on every change.

import { buildContext } from './context';
import { compareDrafts, type Draft } from './finding';
import { pairChecks } from './pairs';
import { staticChecks } from './static';
import type { ConflictInput, Finding } from './types';

/**
 * Every finding for a regatta's working set, sorted by severity (error, warning, info), then
 * day, then race time, then code. Scratched entries produce no findings. Hot seats whose later
 * entry carries a matching acknowledgment come back with `acknowledged: true` and severity info.
 */
export function findConflicts(input: ConflictInput): Finding[] {
  const ctx = buildContext(input);
  const drafts: Draft[] = [];
  pairChecks(ctx, drafts);
  staticChecks(ctx, drafts);
  return drafts.sort(compareDrafts).map((d) => d.finding);
}
