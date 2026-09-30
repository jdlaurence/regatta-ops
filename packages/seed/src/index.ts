// Seed world (PLAN.md §14). STUB: a minimal valid World so the backend seed script and demo
// mode can run end to end. The seed work package replaces buildSeedWorld with the full world
// built from data/reference; the signature and SeedResult shape are the contract.

import {
  DEFAULT_CLUB_SETTINGS,
  SRA_DEFAULT_RULES,
  stableId,
  zonedToInstant,
  type SeedAccount,
  type World,
} from '@srt/domain';

export interface SeedResult {
  world: World;
  /** Email and password accounts for local development (PLAN.md §14 Users). */
  accounts: SeedAccount[];
}

export const SEED_PASSWORD = 'srt-local-dev';

function emptyWorld(): World {
  return {
    users: [],
    teams: [],
    athletes: [],
    regattas: [],
    regatta_teams: [],
    availability: [],
    events: [],
    entries: [],
    entry_seats: [],
    shells: [],
    oar_sets: [],
    gear_items: [],
    trailers: [],
    trailer_shelves: [],
    trailer_compartments: [],
    load_plans: [],
    load_placements: [],
    load_items: [],
    comments: [],
    activity_log: [],
    presence: [],
    share_links: [],
    club_settings: [],
  };
}

export function buildSeedWorld(): SeedResult {
  const w = emptyWorld();
  const id = stableId;
  w.club_settings.push({ id: id('club'), ...DEFAULT_CLUB_SETTINGS });
  const admin = id('user:admin');
  const coach = id('user:coach-boys');
  const viewer = id('user:viewer');
  w.users.push(
    { id: admin, name: 'Alex Admin', email: 'admin@srt.local', role: 'admin', preferences: {} },
    {
      id: coach,
      name: 'Casey Coach',
      email: 'coach.boys@srt.local',
      role: 'coach',
      preferences: {},
    },
    { id: viewer, name: 'Vic Viewer', email: 'viewer@srt.local', role: 'viewer', preferences: {} },
  );
  const boys = id('team:boys');
  w.teams.push({
    id: boys,
    name: 'Junior boys',
    shortName: 'Boys',
    program: 'juniors',
    colorKey: 'navy',
    sortOrder: 1,
    archived: false,
  });
  const names = [
    ['Rowan', 'Test'],
    ['Emery', 'Sample'],
    ['Quinn', 'Example'],
    ['Jules', 'Fixture'],
    ['Sky', 'Placeholder'],
  ] as const;
  names.forEach(([firstName, lastName], i) =>
    w.athletes.push({
      id: id(`athlete:stub:${i}`),
      teamId: boys,
      firstName,
      lastName,
      side: i === 4 ? 'none' : i % 2 === 0 ? 'port' : 'starboard',
      canScull: true,
      canCox: i === 4,
      weightKg: 70 + i,
      birthYear: 2009,
      level: 'experienced',
      status: 'active',
    }),
  );
  const shell = id('shell:Spencer');
  w.shells.push({
    id: shell,
    name: 'Spencer',
    boatClass: '4+',
    compatibleClasses: [],
    rigging: 'sweep',
    riggerType: 'side',
    riggerCount: 4,
    genderAffinity: 'men',
    homeTeamId: boys,
    status: 'in_service',
    isPrivate: false,
  });
  const oars = id('oars:24-C');
  w.oar_sets.push({
    id: oars,
    name: '24-C',
    type: 'sweep',
    color: 'yellow-white',
    count: 8,
    genderAffinity: 'men',
    homeTeamId: boys,
    status: 'in_service',
  });
  const regatta = id('regatta:stub');
  const tz = 'America/Los_Angeles';
  w.regattas.push({
    id: regatta,
    name: 'Stub regatta',
    venue: 'Lake Sammamish',
    city: 'Redmond, WA',
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    timezone: tz,
    format: 'sprint',
    status: 'planning',
    settings: {},
    createdBy: admin,
  });
  w.regatta_teams.push({ id: id('rt:stub:boys'), regattaId: regatta, teamId: boys });
  const event = id('event:stub:1');
  w.events.push({
    id: event,
    regattaId: regatta,
    kind: 'race',
    eventNumber: '1',
    name: "Men's Junior 4+",
    boatClass: '4+',
    day: '2026-11-01',
    scheduledAt: zonedToInstant('2026-11-01', '09:40', tz),
    stage: 'race',
    sortOrder: 1,
  });
  const entry = id('entry:stub:1');
  w.entries.push({
    id: entry,
    regattaId: regatta,
    eventId: event,
    teamId: boys,
    label: 'V4+',
    boatClass: '4+',
    shellId: shell,
    oarSetId: oars,
    status: 'planned',
  });
  (['1', '2', '3', '4', 'cox'] as const).forEach((seat, i) =>
    w.entry_seats.push({
      id: id(`seat:stub:${seat}`),
      entryId: entry,
      seat,
      athleteId: w.athletes[i]!.id,
    }),
  );
  w.trailers.push({
    id: id('trailer:boys'),
    name: 'Boys trailer',
    style: 'offset_post',
    frameLengthCm: 1220,
    widthCm: 240,
    postOffsetPct: 33,
    bowForwardDefault: false,
    defaultRules: SRA_DEFAULT_RULES,
  });
  const accounts: SeedAccount[] = w.users.map((u) => ({
    userId: u.id,
    email: u.email,
    password: SEED_PASSWORD,
  }));
  return { world: w, accounts };
}
