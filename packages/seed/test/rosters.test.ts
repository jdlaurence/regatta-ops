// Real junior rosters passed in by pnpm pb:seed (PLAN.md §14). The rows here are synthetic:
// real names never enter the repository.

import { describe, expect, it } from 'vitest';
import { stableId } from '@regatta-ops/domain';
import { ALL_LAST_NAMES } from '../src/names';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS, buildSeedWorld, type RosterAthlete } from '../src';

function roster(team: 'boys' | 'girls', n: number): RosterAthlete[] {
  return Array.from({ length: n }, (_, i) => ({
    team,
    firstName: `Rower${i}`,
    lastName: `${team}Test`,
    birthYear: 2008 + (i % 6),
    level: i % 4 === 0 ? 'novice' : 'experienced',
    cox: i % 9 === 0,
    ...(team === 'girls' && { gradYear: 2027 + (i % 5) }),
    ...(i === 3 && { preferredName: 'Nick' }),
  }));
}

describe('real junior rosters', () => {
  const rows = [...roster('boys', 50), ...roster('girls', 40)];
  const { world } = buildSeedWorld({ juniorRosters: rows });
  const byTeam = (id: string) => world.athletes.filter((a) => a.teamId === id);

  it('replaces the invented junior athletes and keeps the invented masters', () => {
    expect(byTeam(SEED_TEAM_IDS.boys)).toHaveLength(50);
    expect(byTeam(SEED_TEAM_IDS.girls)).toHaveLength(40);
    for (const a of [...byTeam(SEED_TEAM_IDS.boys), ...byTeam(SEED_TEAM_IDS.girls)]) {
      expect(a.firstName).toMatch(/^Rower\d+$/);
    }
    const masters = world.athletes.filter(
      (a) => a.teamId === SEED_TEAM_IDS.fiveAm || a.teamId === SEED_TEAM_IDS.evening,
    );
    expect(masters).toHaveLength(26);
    for (const a of masters) expect(ALL_LAST_NAMES.has(a.lastName)).toBe(true);
  });

  it('keeps the roster facts and assigns sides', () => {
    const boy = world.athletes.find((a) => a.id === stableId('athlete:boys:Rower3 boysTest'));
    expect(boy).toMatchObject({ preferredName: 'Nick', birthYear: 2011, gradYear: 2030 });
    const girl = world.athletes.find((a) => a.id === stableId('athlete:girls:Rower1 girlsTest'));
    expect(girl).toMatchObject({ gender: 'F', gradYear: 2028, level: 'experienced' });
    const coxes = byTeam(SEED_TEAM_IDS.boys).filter((a) => a.side === 'none');
    expect(coxes).toHaveLength(rows.filter((r) => r.team === 'boys' && r.cox).length);
    expect(byTeam(SEED_TEAM_IDS.boys).every((a) => a.status === 'active')).toBe(true);
  });

  it('seats roster athletes in the seeded lineups', () => {
    const ids = new Set(byTeam(SEED_TEAM_IDS.boys).map((a) => a.id));
    const nwEntries = new Set(
      world.entries.filter((e) => e.regattaId === SEED_REGATTA_IDS.nwYouth2025).map((e) => e.id),
    );
    const seated = world.entry_seats.filter((s) => nwEntries.has(s.entryId) && s.athleteId);
    expect(seated.length).toBeGreaterThan(0);
    expect(seated.some((s) => ids.has(s.athleteId!))).toBe(true);
  });

  it('builds one team from its roster and leaves the other invented', () => {
    const { world: w } = buildSeedWorld({ juniorRosters: roster('boys', 50) });
    expect(w.athletes.filter((a) => a.teamId === SEED_TEAM_IDS.girls)).toHaveLength(57);
  });
});
