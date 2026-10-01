// Adapters between stored records (types.ts) and packer inputs (trailer/types.ts). Pure.

import { BOAT_CLASS_SPECS } from '../boat-classes';
import { shellLabel } from '../format';
import type {
  Entry,
  Id,
  LoadPlacement,
  RegattaEvent,
  Shell,
  Team,
  Trailer,
  TrailerCompartment,
  TrailerShelf,
} from '../types';
import type { CompartmentDef, PackBoat, Placement, ShelfDef, TrailerDef } from './types';

function byShelfOrder(a: TrailerShelf, b: TrailerShelf): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.tier - b.tier ||
    (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function shelfDefFromRecord(s: TrailerShelf): ShelfDef {
  return {
    id: s.id,
    label: s.label,
    tier: s.tier,
    columnKey: s.columnKey,
    widthCm: s.widthCm,
    lengthCm: s.lengthCm,
    frontOverhangMaxCm: s.frontOverhangMaxCm,
    rearOverhangMaxCm: s.rearOverhangMaxCm,
    ...(s.allowedClasses && s.allowedClasses.length > 0
      ? { allowedClasses: s.allowedClasses }
      : {}),
    ...(s.lanesOverride != null && s.lanesOverride > 0 ? { lanesOverride: s.lanesOverride } : {}),
    laneAccess: s.laneAccess,
    ...(s.maxBoats != null ? { maxBoats: s.maxBoats } : {}),
    ...(s.maxWeightKg != null ? { maxWeightKg: s.maxWeightKg } : {}),
    accessRank: s.accessRank,
    active: s.active,
  };
}

/**
 * A packer trailer from stored records. Shelves and compartments of other trailers are ignored;
 * shelves are ordered by `sortOrder`, then tier.
 */
export function trailerDefFromRecords(
  trailer: Trailer,
  shelves: TrailerShelf[],
  compartments: TrailerCompartment[],
): TrailerDef {
  return {
    id: trailer.id,
    name: trailer.name,
    style: trailer.style,
    ...(trailer.postOffsetPct != null ? { postOffsetPct: trailer.postOffsetPct } : {}),
    frameLengthCm: trailer.frameLengthCm,
    widthCm: trailer.widthCm,
    bowForwardDefault: trailer.bowForwardDefault,
    shelves: shelves
      .filter((s) => s.trailerId === trailer.id)
      .sort(byShelfOrder)
      .map(shelfDefFromRecord),
    compartments: compartments
      .filter((c) => c.trailerId === trailer.id)
      .map((c) => compartmentDefFromRecord(c, trailer.frameLengthCm)),
  };
}

/**
 * A packer compartment from its record. A zone along the frame gets both ends: a blank start is
 * the front (PocketBase stores 0 as blank) and a blank end the back of this frame. With neither,
 * the compartment runs the whole length and carries no position.
 */
export function compartmentDefFromRecord(
  c: TrailerCompartment,
  frameLengthCm: number,
): CompartmentDef {
  const def: CompartmentDef = { id: c.id, kind: c.kind, label: c.label, capacity: c.capacity };
  if (c.startCm == null && c.endCm == null) return def;
  return { ...def, startCm: c.startCm ?? 0, endCm: c.endCm ?? frameLengthCm };
}

/** A packer boat for a shell: its own dimensions, else the class defaults (§16.1). */
export function packBoatFromShell(
  shell: Shell,
  team: Pick<Team, 'id' | 'name'> | undefined,
  firstRaceAt?: string | null,
): PackBoat {
  const spec = BOAT_CLASS_SPECS[shell.boatClass];
  return {
    shellId: shell.id,
    name: shellLabel(shell),
    cls: shell.boatClass,
    teamId: team?.id ?? '',
    teamName: team?.name ?? '',
    lengthCm: shell.lengthCm ?? spec.defaultLengthCm,
    beamCm: shell.beamCm ?? spec.defaultBeamCm,
    weightKg: shell.weightKg ?? spec.defaultWeightKg,
    ...(firstRaceAt ? { firstRaceAt } : {}),
  };
}

/**
 * One boat per shell used by a non-scratched entry, in order of first use in `entries`.
 * `firstRaceAt` is the earliest scheduled race among the shell's entries; the team is that of the
 * shell's first entry, meaning the one racing earliest (entries without a time count as latest,
 * then in list order). `spareShellIds` adds shells on the trailer that no entry uses, with the
 * shell's home team, so their placements survive a re-pack.
 */
export function packBoatsFromEntities(input: {
  shells: Shell[];
  entries: Entry[];
  events: RegattaEvent[];
  teams: Team[];
  spareShellIds?: Id[];
}): PackBoat[] {
  const shells = new Map(input.shells.map((s) => [s.id, s]));
  const events = new Map(input.events.map((e) => [e.id, e]));
  const teams = new Map(input.teams.map((t) => [t.id, t]));
  const uses = new Map<Id, { entry: Entry; at: string | null; order: number }[]>();
  input.entries.forEach((entry, order) => {
    if (entry.status === 'scratched' || !entry.shellId || !shells.has(entry.shellId)) return;
    const at = (entry.eventId ? events.get(entry.eventId)?.scheduledAt : null) ?? null;
    const list = uses.get(entry.shellId) ?? [];
    list.push({ entry, at, order });
    uses.set(entry.shellId, list);
  });

  const out: PackBoat[] = [];
  for (const [shellId, list] of uses) {
    const sorted = [...list].sort((a, b) => {
      if (a.at !== b.at) {
        if (a.at === null) return 1;
        if (b.at === null) return -1;
        return Date.parse(a.at) - Date.parse(b.at);
      }
      return a.order - b.order;
    });
    const first = sorted[0]!;
    const team = teams.get(first.entry.teamId);
    out.push(
      packBoatFromShell(
        shells.get(shellId)!,
        team ?? { id: first.entry.teamId, name: '' },
        first.at,
      ),
    );
  }
  for (const id of input.spareShellIds ?? []) {
    const shell = shells.get(id);
    if (!shell || uses.has(id)) continue;
    out.push(packBoatFromShell(shell, shell.homeTeamId ? teams.get(shell.homeTeamId) : undefined));
  }
  return out;
}

export function placementFromRecord(rec: LoadPlacement): Placement {
  return {
    shellId: rec.shellId,
    shelfId: rec.shelfId,
    lane: rec.lane,
    offsetCm: rec.offsetCm,
    bowForward: rec.bowForward,
    locked: rec.locked,
    reasons: rec.reasons ?? [],
  };
}

/** The stored form of a placement, without the record id and timestamps. */
export function placementToRecord(
  p: Placement,
  loadPlanId: Id,
): Omit<LoadPlacement, 'id' | 'created' | 'updated'> {
  return {
    loadPlanId,
    shellId: p.shellId,
    shelfId: p.shelfId,
    lane: p.lane,
    offsetCm: p.offsetCm,
    bowForward: p.bowForward,
    locked: p.locked,
    reasons: p.reasons,
  };
}
