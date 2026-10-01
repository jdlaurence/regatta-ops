// What a trailer holds, in the words coaches use: levels, shelves, lanes, and how many lanes are
// long enough for an eight (PLAN.md §9.3.2, §16.2). Pure.

import {
  BOAT_CLASS_SPECS,
  BUILTIN_FIT_RULE,
  effectiveShelvesFor,
  type FitRule,
  type Rule,
  type TrailerDef,
} from '@regatta-ops/domain';

export interface TrailerCapacity {
  levels: number;
  shelves: number;
  /** Lane cells on shelves in use (a four's width, or the shelf's lane override). */
  lanes: number;
  /** Lanes on shelves in use that take an eight across and along (with overhang). */
  eightLanes: number;
}

export function trailerCapacity(trailer: TrailerDef, rules: readonly Rule[] = []): TrailerCapacity {
  const eff = effectiveShelvesFor(trailer, rules);
  const fit = rules.find((r): r is FitRule => r.type === 'fit' && r.enabled) ?? BUILTIN_FIT_RULE;
  const c = fit.params.clearanceCm;
  const eight = BOAT_CLASS_SPECS['8+'];
  let lanes = 0;
  let eightLanes = 0;
  for (const s of eff) {
    if (!s.active) continue;
    lanes += s.laneSlots;
    const usable = s.frontMaxCm + s.def.lengthCm + s.rearMaxCm;
    if (usable < eight.defaultLengthCm) continue;
    if (
      s.def.allowedClasses &&
      s.def.allowedClasses.length > 0 &&
      !s.def.allowedClasses.includes('8+')
    ) {
      continue;
    }
    const override = s.laneRules.find(
      (r) => !r.params.classes || r.params.classes.length === 0 || r.params.classes.includes('8+'),
    );
    eightLanes += override
      ? override.params.lanes
      : Math.max(0, Math.floor((s.def.widthCm + c) / (eight.defaultBeamCm + c)));
  }
  return {
    levels: new Set(trailer.shelves.map((s) => s.tier)).size,
    shelves: trailer.shelves.length,
    lanes,
    eightLanes,
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "5 levels, 15 lanes, 9 long enough for an eight". */
export function capacitySummary(cap: TrailerCapacity, word = 'level'): string {
  if (cap.shelves === 0) return 'No shelves yet';
  return `${plural(cap.levels, word)}, ${plural(cap.lanes, 'lane')}, ${cap.eightLanes} long enough for an eight`;
}
