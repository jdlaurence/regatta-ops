// Trailer packer (PLAN.md §9.3.4). STUB: WP-B replaces the bodies; the signatures are the contract.

import type { PackBoat, PackResult, Placement, Reason, Rule, TrailerDef } from './types';

export function packTrailer(
  _trailer: TrailerDef,
  boats: PackBoat[],
  _rules: Rule[],
  existing: Placement[],
): PackResult {
  const locked = existing.filter((p) => p.locked);
  const placed = new Set(locked.map((p) => p.shellId));
  return {
    placements: locked,
    unplaced: boats
      .filter((b) => !placed.has(b.shellId))
      .map((b) => ({ shellId: b.shellId, reasons: [] })),
    metrics: { leftWeightKg: 0, rightWeightKg: 0, balancePct: 0, perShelf: [] },
    warnings: [],
  };
}

export function validatePlacement(
  _trailer: TrailerDef,
  _boats: PackBoat[],
  _rules: Rule[],
  _placements: Placement[],
  _candidate: Placement,
): { ok: boolean; violations: Reason[] } {
  return { ok: true, violations: [] };
}
