// Builds the conflict engine's input for one seeded regatta, the way the app will (§9.2).

import { effectiveSettings, type ConflictInput, type Id, type World } from '@srt/domain';

export function conflictInputFor(w: World, regattaId: Id): ConflictInput {
  const regatta = w.regattas.find((r) => r.id === regattaId);
  if (!regatta) throw new Error(`No regatta ${regattaId}`);
  const entries = w.entries.filter((e) => e.regattaId === regattaId);
  const entryIds = new Set(entries.map((e) => e.id));
  const teamIds = new Set(
    w.regatta_teams.filter((rt) => rt.regattaId === regattaId).map((rt) => rt.teamId),
  );
  const planIds = new Set(w.load_plans.filter((p) => p.regattaId === regattaId).map((p) => p.id));
  const input: ConflictInput = {
    settings: effectiveSettings(regatta, w.club_settings[0]),
    timezone: regatta.timezone,
    seasonYear: Number(regatta.startDate.slice(0, 4)),
    events: w.events.filter((e) => e.regattaId === regattaId),
    entries,
    seats: w.entry_seats.filter((s) => entryIds.has(s.entryId)),
    athletes: w.athletes.filter((a) => teamIds.has(a.teamId)),
    availability: w.availability.filter((a) => a.regattaId === regattaId),
    shells: w.shells,
    oarSets: w.oar_sets,
    teams: w.teams,
  };
  if (planIds.size > 0) {
    input.loadPlacements = w.load_placements.filter((p) => planIds.has(p.loadPlanId));
  }
  return input;
}
