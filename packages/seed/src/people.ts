// Club settings, users, teams, and invented athletes (PLAN.md §14).

import {
  DEFAULT_CLUB_SETTINGS,
  stableId,
  type Athlete,
  type AthleteLevel,
  type AthleteSide,
  type ClubSettings,
  type Team,
  type User,
  type World,
} from '@srt/domain';
import {
  BOYS_FIRST_NAMES,
  GIRLS_FIRST_NAMES,
  LAST_NAMES,
  MASTERS_MEN_FIRST_NAMES,
  MASTERS_WOMEN_FIRST_NAMES,
  PREFERRED_NAMES,
} from './names';
import { rng } from './prng';
import { SEED_EMAILS, SEED_USER_IDS, TEAM_COACH, teamId, type TeamKey, type UserKey } from './ids';
import { clone } from './world';

export function addClubSettings(w: World): void {
  const settings: ClubSettings = {
    id: stableId('club_settings:sra'),
    ...clone(DEFAULT_CLUB_SETTINGS),
  };
  w.club_settings.push(settings);
}

const USER_NAMES: Record<UserKey, string> = {
  admin: 'Morgan Hale',
  coachBoys: 'Theo Marsh',
  coachGirls: 'Dana Whitcombe',
  coachFiveAm: 'Grant Okafor',
  coachEvening: 'Lena Vasquez',
  viewer: 'Sam Whitlock',
};

export function addUsers(w: World): void {
  const defaultTeam = (key: UserKey): string | null => {
    const team = (Object.keys(TEAM_COACH) as TeamKey[]).find((t) => TEAM_COACH[t] === key);
    return team ? teamId(team) : null;
  };
  for (const key of Object.keys(SEED_EMAILS) as UserKey[]) {
    const user: User = {
      id: SEED_USER_IDS[key],
      name: USER_NAMES[key],
      email: SEED_EMAILS[key],
      role: key === 'admin' ? 'admin' : key === 'viewer' ? 'viewer' : 'coach',
      defaultTeamId: defaultTeam(key),
      preferences: key === 'admin' ? { theme: 'system', weightUnit: 'lb' } : {},
    };
    w.users.push(user);
  }
}

const TEAMS: { key: TeamKey; team: Omit<Team, 'id'> }[] = [
  {
    key: 'boys',
    team: {
      name: 'Junior boys',
      shortName: 'Boys',
      program: 'juniors',
      colorKey: 'navy',
      sortOrder: 1,
      archived: false,
    },
  },
  {
    key: 'girls',
    team: {
      name: 'Junior girls',
      shortName: 'Girls',
      program: 'juniors',
      colorKey: 'raspberry',
      sortOrder: 2,
      archived: false,
    },
  },
  {
    key: '5am',
    team: {
      name: '5am masters',
      shortName: '5am',
      program: 'masters',
      colorKey: 'green',
      sortOrder: 3,
      archived: false,
    },
  },
  {
    key: 'evening',
    team: {
      name: 'Evening masters',
      shortName: 'Evening',
      program: 'masters',
      colorKey: 'violet',
      sortOrder: 4,
      archived: false,
    },
  },
];

export function addTeams(w: World): void {
  for (const { key, team } of TEAMS) w.teams.push({ id: teamId(key), ...team });
}

// ---------------------------------------------------------------------------
// Athletes

/**
 * A junior athlete from the club's roster workbooks. `pnpm pb:seed` reads them from the ignored
 * files in data/ and passes them to buildSeedWorld, so real names reach the local database and
 * never the repository (CLAUDE.md). Sides and sculling are not on the rosters and are assigned.
 */
export interface RosterAthlete {
  team: 'boys' | 'girls';
  firstName: string;
  lastName: string;
  preferredName?: string;
  birthYear: number;
  /** Defaults to birthYear + 19. */
  gradYear?: number;
  level: AthleteLevel;
  cox: boolean;
}

interface AthleteSpec {
  cox: boolean;
  birthYear: number;
  level: AthleteLevel;
  gender: 'M' | 'F';
  /** Defaults to birthYear + 19 for juniors. */
  gradYear?: number;
  inactive?: boolean;
  notes?: string;
  /** Real names from a roster; invented names are drawn when absent. */
  name?: { firstName: string; lastName: string; preferredName?: string };
}

/** Roster rows in the invented rosters' order: by birth year, coxswains then experienced first. */
function rosterSpecs(rows: readonly RosterAthlete[]): AthleteSpec[] {
  const rank = (r: RosterAthlete) => (r.cox ? 0 : r.level === 'experienced' ? 1 : 2);
  return [...rows]
    .sort((a, b) => a.birthYear - b.birthYear || rank(a) - rank(b))
    .map((r) => ({
      cox: r.cox,
      birthYear: r.birthYear,
      level: r.level,
      gender: r.team === 'boys' ? 'M' : 'F',
      ...(r.gradYear !== undefined && { gradYear: r.gradYear }),
      name: {
        firstName: r.firstName,
        lastName: r.lastName,
        ...(r.preferredName && { preferredName: r.preferredName }),
      },
    }));
}

/**
 * Junior rosters for the 2026/27 season (seasonYear 2026: born 2008 is U19, 2013 is U15). The
 * counts by birth year, level, grade, and coxswain match the club's fall 2026 rosters; the names
 * are invented. The rosters do not record sides or sculling, so addAthletes assigns those.
 */
function juniorSpecs(team: 'boys' | 'girls'): AthleteSpec[] {
  if (team === 'boys') {
    const b = (n: number, birthYear: number, level: AthleteLevel, cox = false) =>
      Array.from({ length: n }, () => ({ cox, birthYear, level, gender: 'M' as const }));
    return [
      { cox: true, birthYear: 2008, level: 'experienced', gender: 'M', notes: 'Head coxswain.' },
      ...b(5, 2008, 'experienced'),
      ...b(1, 2008, 'novice'),
      ...b(4, 2009, 'experienced', true),
      ...b(12, 2009, 'experienced'),
      ...b(2, 2009, 'novice'),
      ...b(1, 2010, 'experienced', true),
      ...b(16, 2010, 'experienced'),
      ...b(2, 2010, 'novice'),
      ...b(2, 2011, 'experienced', true),
      ...b(12, 2011, 'experienced'),
      ...b(6, 2011, 'novice'),
      ...b(4, 2012, 'experienced'),
      ...b(1, 2012, 'novice', true),
      ...b(8, 2012, 'novice'),
      ...b(1, 2013, 'novice'),
    ];
  }
  // The girls' roster lists grades; 12th grade graduates in 2027. A few rows pair a birth year
  // with an unusual grade; they are kept as the roster has them.
  const g = (n: number, birthYear: number, grade: number, level: AthleteLevel, cox = false) =>
    Array.from({ length: n }, () => ({
      cox,
      birthYear,
      gradYear: 2039 - grade,
      level,
      gender: 'F' as const,
    }));
  return [
    { ...g(1, 2008, 12, 'experienced', true)[0]!, notes: 'Head coxswain.' },
    ...g(1, 2008, 11, 'experienced'),
    ...g(1, 2009, 12, 'experienced', true),
    ...g(7, 2009, 12, 'experienced'),
    ...g(2, 2009, 11, 'experienced'),
    ...g(1, 2009, 10, 'experienced'),
    ...g(1, 2009, 8, 'novice'),
    ...g(1, 2010, 11, 'experienced', true),
    ...g(7, 2010, 11, 'experienced'),
    ...g(1, 2010, 10, 'experienced', true),
    ...g(5, 2010, 10, 'experienced'),
    ...g(1, 2010, 10, 'novice', true),
    ...g(4, 2010, 10, 'novice'),
    ...g(1, 2011, 10, 'experienced', true),
    ...g(3, 2011, 10, 'experienced'),
    ...g(5, 2011, 9, 'experienced'),
    ...g(1, 2011, 9, 'novice'),
    ...g(1, 2012, 11, 'experienced'),
    ...g(1, 2012, 9, 'experienced', true),
    ...g(6, 2012, 9, 'experienced'),
    ...g(1, 2012, 9, 'novice', true),
    ...g(3, 2012, 9, 'novice'),
    ...g(1, 2012, 8, 'novice'),
    ...g(1, 2013, 8, 'novice'),
  ];
}

/** Masters: ages in 2026 span categories B (36-42) to F (60-64). */
function mastersSpecs(team: '5am' | 'evening'): AthleteSpec[] {
  const w = (birthYear: number, extra: Partial<AthleteSpec> = {}): AthleteSpec => ({
    cox: false,
    birthYear,
    level: 'experienced',
    gender: 'F',
    ...extra,
  });
  const m = (birthYear: number, extra: Partial<AthleteSpec> = {}): AthleteSpec =>
    w(birthYear, { gender: 'M', ...extra });
  if (team === '5am') {
    return [
      m(1972, { cox: true, notes: 'Coxes the 5am eights.' }),
      w(1988),
      w(1985, { level: 'novice', notes: 'Learn-to-row graduate, spring 2026.' }),
      w(1981),
      w(1979),
      w(1975),
      w(1973),
      w(1969),
      w(1966),
      w(1963),
      m(1989),
      m(1978, { level: 'novice' }),
      m(1970),
      m(1964),
    ];
  }
  return [
    w(1980, { cox: true }),
    m(1990),
    m(1986, { level: 'novice' }),
    m(1982),
    m(1976),
    m(1968),
    m(1962),
    w(1987),
    w(1983),
    w(1977),
    w(1974),
    w(1971, { inactive: true, notes: 'On leave until January.' }),
  ];
}

/**
 * Every invented last name is unique across the club, so "Ava C." style short names differ. A
 * junior team with rows in `rosters` gets those athletes instead of invented ones.
 */
export function addAthletes(w: World, rosters: readonly RosterAthlete[] = []): void {
  const lastNames = rng('names:last').shuffle(LAST_NAMES);
  let nextLast = 0;
  const firstNamePools: Record<TeamKey, { M: readonly string[]; F: readonly string[] }> = {
    boys: { M: rng('names:boys').shuffle(BOYS_FIRST_NAMES), F: [] },
    girls: { M: [], F: rng('names:girls').shuffle(GIRLS_FIRST_NAMES) },
    '5am': {
      M: rng('names:5am:m').shuffle(MASTERS_MEN_FIRST_NAMES),
      F: rng('names:5am:f').shuffle(MASTERS_WOMEN_FIRST_NAMES),
    },
    evening: {
      // Take from the far end of the shuffled masters lists so the two teams do not repeat names.
      M: rng('names:5am:m').shuffle(MASTERS_MEN_FIRST_NAMES).reverse(),
      F: rng('names:5am:f').shuffle(MASTERS_WOMEN_FIRST_NAMES).reverse(),
    },
  };

  for (const team of ['boys', 'girls', '5am', 'evening'] as const) {
    const roster = rosters.filter((r) => r.team === team);
    const specs =
      team === 'boys' || team === 'girls'
        ? roster.length > 0
          ? rosterSpecs(roster)
          : juniorSpecs(team)
        : mastersSpecs(team);
    const used = { M: 0, F: 0 };
    let rowerIndex = 0;
    let portNext = true;
    let rowersWhoCox = 0;
    specs.forEach((spec, i) => {
      const firstName =
        spec.name?.firstName ?? firstNamePools[team][spec.gender][used[spec.gender]++]!;
      const lastName = spec.name?.lastName ?? lastNames[nextLast++]!;
      const junior = team === 'boys' || team === 'girls';
      let side: AthleteSide = 'none';
      let canScull = false;
      let canCox = spec.cox;
      if (!spec.cox) {
        // Alternate port and starboard; every eighth rower rows both sides.
        if (rowerIndex % 8 === 5) side = 'both';
        else {
          side = portNext ? 'port' : 'starboard';
          portNext = !portNext;
        }
        canScull = junior ? rowerIndex % 3 === 1 : rowerIndex % 5 !== 3;
        // The first two of the youngest novice rowers on each junior team can also cox.
        if (junior && spec.level === 'novice' && spec.birthYear >= 2012 && !spec.inactive) {
          canCox = rowersWhoCox < 2;
          rowersWhoCox++;
        }
        rowerIndex++;
      }
      const athlete: Athlete = {
        // Roster athletes keep their id when the roster gains or loses someone.
        id: stableId(
          spec.name ? `athlete:${team}:${firstName} ${lastName}` : `athlete:${team}:${i}`,
        ),
        teamId: teamId(team),
        firstName,
        lastName,
        side,
        canScull,
        canCox,
        birthYear: spec.birthYear,
        gender: spec.gender,
        gradYear: junior ? (spec.gradYear ?? spec.birthYear + 19) : null,
        level: spec.level,
        status: spec.inactive ? 'inactive' : 'active',
      };
      const preferred = spec.name ? spec.name.preferredName : PREFERRED_NAMES[firstName];
      if (preferred) athlete.preferredName = preferred;
      if (spec.notes) athlete.notes = spec.notes;
      w.athletes.push(athlete);
    });
  }
}
