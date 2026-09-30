// Sample loads for trying a trailer out: the 2026 Regionals loads from the coaches' sheet
// (data/reference/trailer-layout-2026-regionals.md; equipment names only) and the
// manufacturer's rated load (§16.2). Boat sizes are the class defaults (§16.1).

import {
  BOAT_CLASS_SPECS,
  type BoatClass,
  type PackBoat,
  type Placement,
  type TeamColorKey,
  type TrailerDef,
} from '@srt/domain';
import type { EndViewBoat } from './TrailerEndView';

export interface SampleBoat {
  name: string;
  cls: BoatClass;
  /** Where the 2026 sheet put it, as a shelf id of SRA_BOYS_TRAILER / SRA_GIRLS_TRAILER. */
  shelf?: string;
  lane?: number;
}

export interface SampleLoad {
  id: string;
  label: string;
  teamColor: TeamColorKey;
  boats: SampleBoat[];
}

export const BOYS_2026_LOAD: SampleLoad = {
  id: 'boys-2026',
  label: 'Boys 2026 Regionals: 7 eights, 5 fours',
  teamColor: 'navy',
  boats: [
    { name: 'Peggy', cls: '8+', shelf: 'l5', lane: 0 },
    { name: 'LLL', cls: '8+', shelf: 'r5', lane: 0 },
    { name: 'Waltar', cls: '8+', shelf: 'r5', lane: 1 },
    { name: 'Woodman', cls: '8+', shelf: 'l4', lane: 0 },
    { name: 'Sonic', cls: '8+', shelf: 'r4', lane: 0 },
    { name: 'DeReck', cls: '8+', shelf: 'r4', lane: 1 },
    { name: 'DonQ', cls: '8+', shelf: 'l3', lane: 0 },
    { name: 'Thursday', cls: '4-', shelf: 'r3', lane: 0 },
    { name: 'Kokanee', cls: '4+', shelf: 'r3', lane: 1 },
    { name: 'Dan', cls: '4+', shelf: 'l2', lane: 0 },
    { name: 'Alma', cls: '4+', shelf: 'r2', lane: 0 },
    { name: 'Spencer', cls: '4+', shelf: 'r2', lane: 1 },
  ],
};

export const GIRLS_2026_LOAD: SampleLoad = {
  id: 'girls-2026',
  label: 'Girls 2026 Regionals: 4 eights, 7 fours',
  teamColor: 'raspberry',
  boats: [
    { name: 'WUBA', cls: '8+', shelf: 'gl5', lane: 0 },
    { name: 'Percy', cls: '8+', shelf: 'gr5', lane: 0 },
    { name: 'Bullet', cls: '8+', shelf: 'gr5', lane: 1 },
    { name: 'Legacy', cls: '4+', shelf: 'gl4', lane: 0 },
    { name: 'Hendo', cls: '8+', shelf: 'gr4', lane: 0 },
    { name: 'Lundberg', cls: '4+', shelf: 'gr4', lane: 1 },
    { name: 'Scoot', cls: '4+', shelf: 'gl3', lane: 0 },
    { name: 'Tahoma', cls: '4+', shelf: 'gr3', lane: 0 },
    { name: 'Freespeed', cls: '4+', shelf: 'gr3', lane: 1 },
    { name: 'Snoopy', cls: '4x', shelf: 'gr2', lane: 0 },
    { name: 'Sharon', cls: '4x', shelf: 'gr2', lane: 1 },
  ],
};

export const RATED_LOAD: SampleLoad = {
  id: 'rated',
  label: 'Rated load: 9 eights, 6 fours',
  teamColor: 'slate',
  boats: [
    ...Array.from({ length: 9 }, (_, i) => ({ name: `Eight ${i + 1}`, cls: '8+' as const })),
    ...Array.from({ length: 6 }, (_, i) => ({ name: `Four ${i + 1}`, cls: '4+' as const })),
  ],
};

export const SAMPLE_LOADS: readonly SampleLoad[] = [BOYS_2026_LOAD, GIRLS_2026_LOAD, RATED_LOAD];

function sampleId(load: SampleLoad, boat: SampleBoat): string {
  return `sample-${load.id}-${boat.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/** Packer boats for a sample load, with class-default sizes. */
export function samplePackBoats(load: SampleLoad): PackBoat[] {
  return load.boats.map((b) => {
    const spec = BOAT_CLASS_SPECS[b.cls];
    return {
      shellId: sampleId(load, b),
      name: b.name,
      cls: b.cls,
      teamId: `sample-${load.id}`,
      teamName: 'Sample',
      lengthCm: spec.defaultLengthCm,
      beamCm: spec.defaultBeamCm,
      weightKg: spec.defaultWeightKg,
    };
  });
}

export function sampleEndViewBoats(load: SampleLoad): EndViewBoat[] {
  return samplePackBoats(load).map((b) => ({
    shellId: b.shellId,
    name: b.name,
    cls: b.cls,
    beamCm: b.beamCm,
    lengthCm: b.lengthCm,
    teamColor: load.teamColor,
  }));
}

/** The sheet's layout as placements on the given trailer (shelf ids as in sra.ts). */
export function sampleSheetPlacements(load: SampleLoad, trailer: TrailerDef): Placement[] {
  const shelves = new Set(trailer.shelves.map((s) => s.id));
  return load.boats
    .filter((b) => b.shelf && shelves.has(b.shelf))
    .map((b) => ({
      shellId: sampleId(load, b),
      shelfId: b.shelf!,
      lane: b.lane ?? 0,
      offsetCm: 0,
      bowForward: false,
      locked: false,
      reasons: [],
    }));
}
