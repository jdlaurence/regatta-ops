// Packer boats to end-view chips: the team color comes from the team record.

import type { PackBoat, Team } from '@regatta-ops/domain';
import type { EndViewBoat } from './TrailerEndView';

export function toEndViewBoats(
  boats: readonly PackBoat[],
  teams: readonly Pick<Team, 'id' | 'name' | 'colorKey'>[],
): EndViewBoat[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return boats.map((b) => {
    const team = byId.get(b.teamId);
    return {
      shellId: b.shellId,
      name: b.name,
      cls: b.cls,
      beamCm: b.beamCm,
      lengthCm: b.lengthCm,
      teamColor: team?.colorKey ?? null,
      teamName: team?.name ?? b.teamName,
    };
  });
}
