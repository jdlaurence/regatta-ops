// SRA's two trailers from the domain definitions in @srt/domain trailer/sra.ts (PLAN.md §14,
// §16.4, §17.1), turned into trailer, trailer_shelves, and trailer_compartments records.

import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  SRA_GIRLS_TRAILER,
  type CompartmentDef,
  type TrailerDef,
  type World,
} from '@srt/domain';
import { COMPARTMENT_IDS, SEED_TRAILER_IDS, SHELF_IDS, remapRuleShelfIds } from './ids';

const NOTES = 'Placeholder dimensions until measured (PLAN.md §15 Q1).';

function addTrailer(w: World, def: TrailerDef, id: string): void {
  w.trailers.push({
    id,
    name: def.name,
    style: def.style,
    frameLengthCm: def.frameLengthCm,
    widthCm: def.widthCm,
    postOffsetPct: def.postOffsetPct ?? null,
    bowForwardDefault: def.bowForwardDefault ?? true,
    notes: NOTES,
    defaultRules: remapRuleShelfIds(SRA_DEFAULT_RULES, SHELF_IDS),
  });
  def.shelves.forEach((s, i) => {
    w.trailer_shelves.push({
      id: SHELF_IDS[s.id]!,
      trailerId: id,
      label: s.label,
      tier: s.tier,
      columnKey: s.columnKey,
      widthCm: s.widthCm,
      lengthCm: s.lengthCm,
      frontOverhangMaxCm: s.frontOverhangMaxCm,
      rearOverhangMaxCm: s.rearOverhangMaxCm,
      allowedClasses: s.allowedClasses ? [...s.allowedClasses] : [],
      lanesOverride: s.lanesOverride ?? null,
      laneAccess: s.laneAccess,
      maxBoats: s.maxBoats ?? null,
      maxWeightKg: s.maxWeightKg ?? null,
      accessRank: s.accessRank,
      active: s.active,
      sortOrder: i + 1,
    });
  });
  for (const c of def.compartments) {
    w.trailer_compartments.push({
      id: COMPARTMENT_IDS[c.id]!,
      trailerId: id,
      kind: c.kind,
      label: c.label,
      capacity: c.capacity,
      capacityUnit: unitOf(c),
      // Zones along the frame (§4.9). PocketBase keeps a start of 0 as blank, which reads as the
      // front, so the seed stores it that way too.
      startCm: c.startCm ? c.startCm : null,
      endCm: c.endCm ?? null,
    });
  }
}

function unitOf(c: CompartmentDef): string {
  if (c.kind === 'oar_rack' || c.kind === 'oar_box' || c.kind === 'oar_tube') return 'oars';
  if (c.kind === 'rigger_rack') return 'riggers';
  if (/\bslings?\b/i.test(c.label)) return 'pairs';
  return 'loads';
}

export function addTrailers(w: World): void {
  addTrailer(w, SRA_BOYS_TRAILER, SEED_TRAILER_IDS.boys);
  addTrailer(w, SRA_GIRLS_TRAILER, SEED_TRAILER_IDS.girls);
}
