// A lineup-sized test world: the shared web fixture plus an eight's worth of invented athletes,
// more events, and a girls' crew sharing a boys' shell. Every name is invented.

import {
  DEFAULT_TIMING,
  DEFAULT_HEAD_RACE_DURATION_MIN,
  effectiveSettings,
  zonedToInstant,
  type AthleteSide,
  type BoatClass,
  type Entry,
  type RegattaEvent,
  type Seat,
  type World,
} from '@regatta-ops/domain';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';
import { buildIndex, type LineupData } from './lib';

const TZ = 'America/Los_Angeles';
const DAY = '2026-11-01';

export const L = {
  ...IDS,
  event3: 'event3000000001',
  event4: 'event4000000001',
  event5: 'event5000000001',
  girlsEntry: 'entrygirls00001',
  boysEight: 'entryboys800001',
  quad: 'shellquad000001',
  oldShell: 'shellbroken0001',
  sculls: 'oarsscull000001',
  shortOars: 'oarsshort000001',
  girlsOars: 'oarsgirls000001',
};

/** Boys athletes a1..a8 plus a cox; sides alternate so seat templates have fits. */
export const BOYS = Array.from({ length: 8 }, (_, i) => `athboyrow00000${i + 1}`);
export const BOYS_COX = 'athboycox000001';
export const BOYS_OUT = 'athboyout000001';
export const GIRLS = ['athgirlrow00001', 'athgirlrow00002'];

function athlete(
  w: World,
  id: string,
  teamId: string,
  firstName: string,
  lastName: string,
  side: AthleteSide,
  extra: Partial<World['athletes'][number]> = {},
) {
  w.athletes.push({
    id,
    teamId,
    firstName,
    lastName,
    side,
    canScull: false,
    canCox: false,
    level: 'experienced',
    status: 'active',
    birthYear: 2009,
    ...extra,
  });
}

function race(
  w: World,
  id: string,
  n: string,
  name: string,
  cls: BoatClass,
  time: string | null,
  sortOrder: number,
  category = '',
): RegattaEvent {
  const e: RegattaEvent = {
    id,
    regattaId: IDS.regatta,
    kind: 'race',
    eventNumber: n,
    name,
    boatClass: cls,
    category,
    day: DAY,
    scheduledAt: time ? zonedToInstant(DAY, time, TZ) : null,
    stage: 'race',
    sortOrder,
  };
  w.events.push(e);
  return e;
}

export function entry(w: World, e: Partial<Entry> & Pick<Entry, 'id' | 'teamId'>): Entry {
  const full: Entry = {
    regattaId: IDS.regatta,
    eventId: null,
    label: 'V8',
    boatClass: '8+',
    shellId: null,
    oarSetId: null,
    status: 'planned',
    ...e,
  };
  w.entries.push(full);
  return full;
}

export function seat(w: World, entryId: string, s: Seat, athleteId: string | null) {
  w.entry_seats.push({
    id: `seat${entryId.slice(0, 7)}${s.padStart(4, 'x')}`,
    entryId,
    seat: s,
    athleteId,
  });
}

export function lineupWorld(): World {
  const w = fixtureWorld();
  const sides: AthleteSide[] = ['starboard', 'port'];
  const firsts = ['Arlo', 'Beck', 'Cole', 'Dax', 'Eli', 'Finn', 'Gus', 'Hal'];
  BOYS.forEach((id, i) =>
    athlete(w, id, IDS.boys, firsts[i]!, 'Rower', sides[i % 2]!, {
      level: i < 6 ? 'experienced' : 'novice',
      canScull: i < 2,
    }),
  );
  athlete(w, BOYS_COX, IDS.boys, 'Ike', 'Coxswain', 'none', { canCox: true });
  athlete(w, BOYS_OUT, IDS.boys, 'Jay', 'Away', 'port');
  w.availability.push({
    id: 'availboyout0001',
    regattaId: IDS.regatta,
    athleteId: BOYS_OUT,
    status: 'unavailable',
    reason: 'Family trip',
  });
  athlete(w, GIRLS[0]!, IDS.girls, 'Kay', 'Oarswoman', 'port');
  athlete(w, GIRLS[1]!, IDS.girls, 'Lia', 'Oarswoman', 'starboard');

  // event1 (12, 4+, 9:40) and event2 (14, 8+, 10:20) come from the shared fixture.
  race(w, L.event3, '15', "Men's Youth 8+", '8+', '11:00', 3, "Men's Youth U19");
  race(w, L.event4, '16', "Men's U17 8+", '8+', '11:30', 4, "Men's U17");
  race(w, L.event5, '20', "Men's Youth 4x", '4x', '12:40', 5);

  w.shells.push(
    {
      id: L.quad,
      name: 'Susan',
      boatClass: '4x',
      compatibleClasses: [],
      rigging: 'scull',
      riggerType: 'side',
      genderAffinity: 'any',
      homeTeamId: null,
      status: 'in_service',
      isPrivate: false,
    },
    {
      id: L.oldShell,
      name: 'Old Faithful',
      nickname: 'Faithful',
      boatClass: '8+',
      compatibleClasses: [],
      rigging: 'sweep',
      riggerType: 'side',
      genderAffinity: 'any',
      homeTeamId: IDS.girls,
      status: 'out_of_service',
      isPrivate: false,
    },
  );
  w.oar_sets.push(
    {
      id: L.sculls,
      name: 'Brown',
      type: 'scull',
      color: 'brown',
      count: 8,
      genderAffinity: 'any',
      status: 'in_service',
    },
    {
      id: L.shortOars,
      name: '21-B',
      type: 'sweep',
      color: 'blue-white',
      count: 7,
      genderAffinity: 'men',
      homeTeamId: IDS.boys,
      status: 'in_service',
    },
    {
      id: L.girlsOars,
      name: '25-A',
      type: 'sweep',
      color: 'red',
      count: 9,
      genderAffinity: 'women',
      homeTeamId: IDS.girls,
      status: 'in_service',
    },
  );

  // The girls race Monahan (a boys' eight) at 10:20: busy until 10:55 on a head-race day.
  entry(w, {
    id: L.girlsEntry,
    teamId: IDS.girls,
    eventId: IDS.event2,
    label: 'V8',
    shellId: IDS.shell2,
    oarSetId: L.girlsOars,
  });
  seat(w, L.girlsEntry, '1', GIRLS[0]!);
  // A boys' eight at 11:00, with no shell yet, three seats set.
  entry(w, { id: L.boysEight, teamId: IDS.boys, eventId: L.event3, label: 'V8' });
  seat(w, L.boysEight, '1', BOYS[0]!);
  seat(w, L.boysEight, '2', BOYS[1]!);
  seat(w, L.boysEight, 'cox', BOYS_COX);
  return w;
}

/** The regatta's lineup data from a world, as the working set would give it. */
export function lineupData(w: World): LineupData {
  const regatta = w.regattas.find((r) => r.id === IDS.regatta)!;
  const club = w.club_settings[0] ?? {
    timingDefaults: DEFAULT_TIMING,
    headRaceDurationMin: DEFAULT_HEAD_RACE_DURATION_MIN,
  };
  const events = w.events
    .filter((e) => e.regattaId === regatta.id)
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        (a.scheduledAt ?? '￿').localeCompare(b.scheduledAt ?? '￿') ||
        a.sortOrder - b.sortOrder,
    );
  const entries = w.entries.filter((e) => e.regattaId === regatta.id);
  const ids = new Set(entries.map((e) => e.id));
  return {
    regatta,
    settings: effectiveSettings(regatta, club),
    events,
    entries,
    seats: w.entry_seats.filter((s) => ids.has(s.entryId)),
    athletes: w.athletes,
    availability: w.availability.filter((a) => a.regattaId === regatta.id),
    shells: w.shells,
    oarSets: w.oar_sets,
    teams: w.teams,
  };
}

export const lineupIndex = (w: World = lineupWorld()) => buildIndex(lineupData(w));

export function lineupStore(opts: { signedIn?: string | null; world?: World } = {}) {
  return new MemoryStore({
    world: opts.world ?? lineupWorld(),
    userId: opts.signedIn === undefined ? IDS.coach : opts.signedIn,
    reseed: lineupWorld,
  });
}
