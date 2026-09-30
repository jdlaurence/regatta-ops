import { describe, expect, it } from 'vitest';
import {
  packBoatsFromEntities,
  packTrailer,
  placementFromRecord,
  placementToRecord,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  trailerDefFromRecords,
  type Entry,
  type LoadPlacement,
  type RegattaEvent,
  type Shell,
  type Team,
  type Trailer,
  type TrailerCompartment,
  type TrailerShelf,
} from '../../src';

function shell(
  id: string,
  name: string,
  boatClass: Shell['boatClass'],
  extra: Partial<Shell> = {},
): Shell {
  return {
    id,
    name,
    boatClass,
    compatibleClasses: [],
    rigging: 'sweep',
    riggerType: 'side',
    genderAffinity: 'men',
    status: 'in_service',
    isPrivate: false,
    ...extra,
  };
}

function entry(id: string, shellId: string | null, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    regattaId: 'reg',
    teamId: 'boys',
    label: id,
    boatClass: '8+',
    shellId,
    status: 'planned',
    ...extra,
  };
}

function event(id: string, scheduledAt: string | null): RegattaEvent {
  return {
    id,
    regattaId: 'reg',
    kind: 'race',
    name: id,
    day: '2026-05-16',
    scheduledAt,
    sortOrder: 0,
  };
}

const teams: Team[] = [
  {
    id: 'boys',
    name: 'Junior boys',
    shortName: 'Boys',
    program: 'juniors',
    colorKey: 'navy',
    sortOrder: 1,
    archived: false,
  },
  {
    id: 'girls',
    name: 'Junior girls',
    shortName: 'Girls',
    program: 'juniors',
    colorKey: 'raspberry',
    sortOrder: 2,
    archived: false,
  },
];

describe('packBoatsFromEntities', () => {
  const shells = [
    shell('sh_lll', 'Live.Laugh.Love', '8+', { nickname: 'LLL', lengthCm: 1950, weightKg: 105 }),
    shell('sh_lund', 'Lundberg', '4x+', { rigging: 'convertible', homeTeamId: 'girls' }),
    shell('sh_spare', 'Laurel', '1x', { homeTeamId: 'boys' }),
    shell('sh_unused', 'Hardy', '1x'),
  ];
  const events = [
    event('e1', '2026-05-16T15:16:00.000Z'),
    event('e2', '2026-05-16T16:52:00.000Z'),
    event('e3', null),
  ];

  it('makes one boat per shell used by a non-scratched entry', () => {
    const entries = [
      entry('late', 'sh_lll', { eventId: 'e2', teamId: 'girls' }),
      entry('early', 'sh_lll', { eventId: 'e1' }),
      entry('scratched', 'sh_lund', { eventId: 'e1', status: 'scratched' }),
      entry('tbd', 'sh_lund', { eventId: 'e3', teamId: 'girls', boatClass: '4x+' }),
      entry('noshell', null),
      entry('ghost', 'sh_missing'),
    ];
    const boats = packBoatsFromEntities({
      shells,
      entries,
      events,
      teams,
      spareShellIds: ['sh_spare', 'sh_lll', 'sh_gone'],
    });
    expect(boats).toEqual([
      {
        shellId: 'sh_lll',
        name: 'LLL',
        cls: '8+',
        teamId: 'boys',
        teamName: 'Junior boys',
        lengthCm: 1950,
        beamCm: 57,
        weightKg: 105,
        firstRaceAt: '2026-05-16T15:16:00.000Z',
      },
      {
        shellId: 'sh_lund',
        name: 'Lundberg',
        cls: '4x+',
        teamId: 'girls',
        teamName: 'Junior girls',
        lengthCm: 1340,
        beamCm: 52,
        weightKg: 53,
      },
      {
        shellId: 'sh_spare',
        name: 'Laurel',
        cls: '1x',
        teamId: 'boys',
        teamName: 'Junior boys',
        lengthCm: 820,
        beamCm: 28,
        weightKg: 14,
      },
    ]);
  });

  it('breaks ties between untimed entries by list order and tolerates unknown teams', () => {
    const entries = [
      entry('a', 'sh_lll', { teamId: 'masters' }),
      entry('b', 'sh_lll', { teamId: 'boys' }),
    ];
    const [b] = packBoatsFromEntities({ shells, entries, events, teams });
    expect(b).toMatchObject({ teamId: 'masters', teamName: '' });
    expect(b!.firstRaceAt).toBeUndefined();
    const spare = packBoatsFromEntities({
      shells,
      entries: [],
      events,
      teams,
      spareShellIds: ['sh_unused'],
    });
    expect(spare[0]).toMatchObject({ teamId: '', teamName: '' });
  });
});

describe('trailerDefFromRecords', () => {
  it('rebuilds the seeded trailer from records', () => {
    const src = SRA_BOYS_TRAILER;
    const trailer: Trailer = {
      id: src.id,
      name: src.name,
      style: src.style,
      frameLengthCm: src.frameLengthCm,
      widthCm: src.widthCm,
      postOffsetPct: src.postOffsetPct ?? null,
      bowForwardDefault: true,
      defaultRules: SRA_DEFAULT_RULES,
    };
    const shelves: TrailerShelf[] = src.shelves
      .map((s, i) => ({
        ...s,
        trailerId: src.id,
        sortOrder: i,
        lanesOverride: null,
        maxBoats: null,
        maxWeightKg: null,
        allowedClasses: [],
      }))
      .reverse();
    shelves.push({ ...shelves[0]!, id: 'other', trailerId: 'trl_girls' });
    const compartments: TrailerCompartment[] = src.compartments.map((c) => ({
      ...c,
      trailerId: src.id,
    }));
    compartments.push({
      id: 'x',
      trailerId: 'trl_girls',
      kind: 'storage',
      label: 'Box',
      capacity: 1,
    });
    expect(trailerDefFromRecords(trailer, shelves, compartments)).toEqual(src);
  });

  it('keeps optional shelf limits', () => {
    const trailer: Trailer = {
      id: 't',
      name: 'T',
      style: 'goalpost',
      frameLengthCm: 1250,
      widthCm: 240,
      bowForwardDefault: true,
      defaultRules: [],
    };
    const base: TrailerShelf = {
      id: 's',
      trailerId: 't',
      label: 'Top rack',
      tier: 3,
      columnKey: 'full',
      widthCm: 240,
      lengthCm: 1250,
      frontOverhangMaxCm: 300,
      rearOverhangMaxCm: 300,
      laneAccess: 'any',
      accessRank: 3,
      active: true,
      sortOrder: 0,
    };
    const def = trailerDefFromRecords(
      trailer,
      [
        { ...base, id: 'b', label: 'B', sortOrder: 1, tier: 1 },
        { ...base, id: 'a', label: 'A', sortOrder: 1, tier: 1 },
        { ...base, allowedClasses: ['8+'], lanesOverride: 3, maxBoats: 2, maxWeightKg: 300 },
      ],
      [],
    );
    expect(def.postOffsetPct).toBeUndefined();
    expect(def.shelves.map((s) => s.id)).toEqual(['s', 'a', 'b']);
    expect(def.shelves[0]).toMatchObject({
      allowedClasses: ['8+'],
      lanesOverride: 3,
      maxBoats: 2,
      maxWeightKg: 300,
    });
    expect(def.shelves[1]!.allowedClasses).toBeUndefined();
  });
});

describe('placement records', () => {
  it('round-trips a pack result through load_placements', () => {
    const boats = [
      {
        shellId: 'sh_peggy',
        name: 'Peggy',
        cls: '8+' as const,
        teamId: 'boys',
        teamName: 'Junior boys',
        lengthCm: 1990,
        beamCm: 57,
        weightKg: 96,
      },
    ];
    const [p] = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []).placements;
    const rec: LoadPlacement = { id: 'lp1', ...placementToRecord(p!, 'plan1') };
    expect(rec.loadPlanId).toBe('plan1');
    expect(placementFromRecord(rec)).toEqual(p);
    expect(placementFromRecord({ ...rec, reasons: undefined as never }).reasons).toEqual([]);
  });
});
