// A small, fixed world for web tests. Every name is invented.

import { COLLECTION_NAMES, DEFAULT_CLUB_SETTINGS, zonedToInstant, type World } from '@srt/domain';
import { MemoryStore } from '@/data/memory-store';

export function emptyWorld(): World {
  const w = {} as Record<string, unknown[]>;
  for (const c of COLLECTION_NAMES) w[c] = [];
  return w as unknown as World;
}

export const IDS = {
  admin: 'useradmin000001',
  coach: 'usercoach000001',
  viewer: 'userviewer00001',
  boys: 'teamboys0000001',
  girls: 'teamgirls000001',
  masters: 'teammasters0001',
  regatta: 'regattahotl0001',
  other: 'regattatail0001',
  event1: 'event1000000001',
  event2: 'event2000000001',
  entry1: 'entry1000000001',
  shell: 'shellspencer001',
  shell2: 'shellmonahan001',
  oars: 'oars24c00000001',
  trailer: 'trailerboys0001',
  shelf: 'shelftop0000001',
  plan: 'loadplan0000001',
};

const TZ = 'America/Los_Angeles';

export function fixtureWorld(): World {
  const w = emptyWorld();
  w.club_settings.push({ id: 'clubsettings001', ...DEFAULT_CLUB_SETTINGS });
  w.users.push(
    { id: IDS.admin, name: 'Alex Admin', email: 'admin@srt.local', role: 'admin', preferences: {} },
    {
      id: IDS.coach,
      name: 'Casey Coach',
      email: 'coach.boys@srt.local',
      role: 'coach',
      defaultTeamId: IDS.girls,
      preferences: {},
    },
    {
      id: IDS.viewer,
      name: 'Vic Viewer',
      email: 'viewer@srt.local',
      role: 'viewer',
      preferences: {},
    },
  );
  w.teams.push(
    {
      id: IDS.boys,
      name: 'Junior boys',
      shortName: 'Boys',
      program: 'juniors',
      colorKey: 'navy',
      sortOrder: 1,
      archived: false,
    },
    {
      id: IDS.girls,
      name: 'Junior girls',
      shortName: 'Girls',
      program: 'juniors',
      colorKey: 'raspberry',
      sortOrder: 2,
      archived: false,
    },
    {
      id: IDS.masters,
      name: '5am masters',
      shortName: '5am',
      program: 'masters',
      colorKey: 'green',
      sortOrder: 3,
      archived: false,
    },
  );
  const athlete = (id: string, teamId: string, firstName: string, lastName: string) =>
    w.athletes.push({
      id,
      teamId,
      firstName,
      lastName,
      side: 'port',
      canScull: true,
      canCox: false,
      level: 'experienced',
      status: 'active',
      birthYear: 2009,
    });
  athlete('athboys00000001', IDS.boys, 'Rowan', 'Test');
  athlete('athboys00000002', IDS.boys, 'Emery', 'Sample');
  athlete('athgirls0000001', IDS.girls, 'Quinn', 'Example');
  athlete('athmasters00001', IDS.masters, 'Jules', 'Fixture');
  w.regattas.push(
    {
      id: IDS.regatta,
      name: 'Head of the Lake',
      venue: 'Lake Washington',
      city: 'Seattle, WA',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      timezone: TZ,
      format: 'head',
      status: 'planning',
      settings: { launchLeadMin: 45 },
    },
    {
      id: IDS.other,
      name: 'Tail of the Lake',
      venue: 'Lake Washington',
      city: 'Seattle, WA',
      startDate: '2027-03-01',
      endDate: '2027-03-01',
      timezone: TZ,
      format: 'sprint',
      status: 'planning',
      settings: {},
    },
  );
  w.regatta_teams.push(
    { id: 'rtboys000000001', regattaId: IDS.regatta, teamId: IDS.boys },
    { id: 'rtgirls00000001', regattaId: IDS.regatta, teamId: IDS.girls },
  );
  w.events.push(
    {
      id: IDS.event2,
      regattaId: IDS.regatta,
      kind: 'race',
      eventNumber: '14',
      name: "Men's Junior 8+",
      boatClass: '8+',
      day: '2026-11-01',
      scheduledAt: zonedToInstant('2026-11-01', '10:20', TZ),
      stage: 'race',
      sortOrder: 2,
    },
    {
      id: IDS.event1,
      regattaId: IDS.regatta,
      kind: 'race',
      eventNumber: '12',
      name: "Men's Junior 4+",
      boatClass: '4+',
      day: '2026-11-01',
      scheduledAt: zonedToInstant('2026-11-01', '09:40', TZ),
      stage: 'race',
      sortOrder: 1,
    },
  );
  w.shells.push(
    {
      id: IDS.shell,
      name: 'Spencer',
      boatClass: '4+',
      compatibleClasses: [],
      rigging: 'sweep',
      riggerType: 'side',
      genderAffinity: 'men',
      homeTeamId: IDS.boys,
      status: 'in_service',
      isPrivate: false,
    },
    {
      id: IDS.shell2,
      name: 'Monahan',
      boatClass: '8+',
      compatibleClasses: [],
      rigging: 'sweep',
      riggerType: 'side',
      genderAffinity: 'men',
      homeTeamId: IDS.boys,
      status: 'in_service',
      isPrivate: false,
    },
  );
  w.oar_sets.push({
    id: IDS.oars,
    name: '24-C',
    type: 'sweep',
    color: 'yellow-white',
    count: 8,
    genderAffinity: 'men',
    status: 'in_service',
  });
  w.entries.push({
    id: IDS.entry1,
    regattaId: IDS.regatta,
    eventId: IDS.event1,
    teamId: IDS.boys,
    label: 'V4+',
    boatClass: '4+',
    shellId: IDS.shell,
    oarSetId: IDS.oars,
    status: 'planned',
  });
  w.entry_seats.push(
    { id: 'seatentry1s0001', entryId: IDS.entry1, seat: '1', athleteId: 'athboys00000001' },
    // Borrowed: a masters athlete in a boys' boat.
    { id: 'seatentry1s0002', entryId: IDS.entry1, seat: '2', athleteId: 'athmasters00001' },
  );
  w.trailers.push({
    id: IDS.trailer,
    name: 'Boys trailer',
    style: 'offset_post',
    frameLengthCm: 1220,
    widthCm: 240,
    postOffsetPct: 33,
    bowForwardDefault: false,
    defaultRules: [],
  });
  w.trailer_shelves.push({
    id: IDS.shelf,
    trailerId: IDS.trailer,
    label: 'Level 5, left',
    tier: 5,
    columnKey: 'left',
    widthCm: 75,
    lengthCm: 1220,
    frontOverhangMaxCm: 500,
    rearOverhangMaxCm: 300,
    laneAccess: 'any',
    accessRank: 1,
    active: true,
    sortOrder: 1,
  });
  return w;
}

export function fixtureStore(opts: { signedIn?: string | null; now?: () => string } = {}) {
  return new MemoryStore({
    world: fixtureWorld(),
    userId: opts.signedIn === undefined ? IDS.coach : opts.signedIn,
    now: opts.now,
    reseed: fixtureWorld,
  });
}

/** Let pending MemoryStore change events (queued with setTimeout 0) run. */
export const flush = () => new Promise((r) => setTimeout(r, 0));
