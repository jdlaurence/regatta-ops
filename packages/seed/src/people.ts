// Club settings, users, teams, and invented athletes (PLAN.md §14).

import {
  DEFAULT_CLUB_SETTINGS,
  lbToKg,
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
import { clone, round1 } from './world';

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

interface AthleteSpec {
  cox: boolean;
  birthYear: number;
  level: AthleteLevel;
  gender: 'M' | 'F';
  inactive?: boolean;
  notes?: string;
}

function repeat(n: number, spec: Omit<AthleteSpec, 'cox'>): AthleteSpec[] {
  return Array.from({ length: n }, () => ({ cox: false, ...spec }));
}

/**
 * Junior rosters for the 2026/27 season (seasonYear 2026: born 2008 is U19, 2012 is U15; in the
 * 2025 season the same athletes are one year younger). Three dedicated coxswains per team.
 */
function juniorSpecs(team: 'boys' | 'girls'): AthleteSpec[] {
  const g = team === 'boys' ? 'M' : 'F';
  if (team === 'boys') {
    return [
      { cox: true, birthYear: 2009, level: 'experienced', gender: g, notes: 'Head coxswain.' },
      { cox: true, birthYear: 2010, level: 'experienced', gender: g },
      { cox: true, birthYear: 2011, level: 'novice', gender: g },
      ...repeat(6, { birthYear: 2008, level: 'experienced', gender: g }),
      {
        cox: false,
        birthYear: 2008,
        level: 'experienced',
        gender: g,
        inactive: true,
        notes: 'Taking the fall season off for cross country.',
      },
      ...repeat(7, { birthYear: 2009, level: 'experienced', gender: g }),
      ...repeat(4, { birthYear: 2010, level: 'experienced', gender: g }),
      ...repeat(2, { birthYear: 2009, level: 'novice', gender: g }),
      ...repeat(5, { birthYear: 2010, level: 'novice', gender: g }),
      ...repeat(6, { birthYear: 2011, level: 'novice', gender: g }),
      ...repeat(5, { birthYear: 2012, level: 'novice', gender: g }),
      { cox: false, birthYear: 2012, level: 'novice', gender: g, inactive: true },
    ];
  }
  return [
    { cox: true, birthYear: 2009, level: 'experienced', gender: g, notes: 'Head coxswain.' },
    { cox: true, birthYear: 2010, level: 'experienced', gender: g },
    { cox: true, birthYear: 2012, level: 'novice', gender: g },
    ...repeat(7, { birthYear: 2008, level: 'experienced', gender: g }),
    ...repeat(6, { birthYear: 2009, level: 'experienced', gender: g }),
    {
      cox: false,
      birthYear: 2009,
      level: 'experienced',
      gender: g,
      inactive: true,
      notes: 'Out for the season with a back injury.',
    },
    ...repeat(5, { birthYear: 2010, level: 'experienced', gender: g }),
    ...repeat(1, { birthYear: 2009, level: 'novice', gender: g }),
    ...repeat(4, { birthYear: 2010, level: 'novice', gender: g }),
    ...repeat(5, { birthYear: 2011, level: 'novice', gender: g }),
    ...repeat(4, { birthYear: 2012, level: 'novice', gender: g }),
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

/** Rowers' weight bands by birth year, lb. Set so most crews sit inside their shells' ranges. */
const WEIGHT_LB: Record<'M' | 'F', Record<number, [number, number]>> = {
  M: { 2008: [172, 202], 2009: [168, 198], 2010: [162, 192], 2011: [152, 182], 2012: [140, 170] },
  F: { 2008: [142, 170], 2009: [140, 168], 2010: [136, 164], 2011: [130, 158], 2012: [124, 152] },
};

function weightLb(spec: AthleteSpec, r: ReturnType<typeof rng>): number {
  if (spec.cox) {
    if (spec.birthYear < 2000) return spec.gender === 'M' ? r.int(148, 165) : r.int(112, 128);
    return spec.gender === 'M' ? r.int(104, 122) : r.int(92, 110);
  }
  if (spec.birthYear < 2000) return spec.gender === 'M' ? r.int(165, 205) : r.int(125, 165);
  const [lo, hi] = WEIGHT_LB[spec.gender][spec.birthYear]!;
  return r.int(lo, hi);
}

/** Every athlete's last name is unique across the club, so "Ava C." style short names differ. */
export function addAthletes(w: World): void {
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
    const specs = team === 'boys' || team === 'girls' ? juniorSpecs(team) : mastersSpecs(team);
    const r = rng(`athletes:${team}`);
    const used = { M: 0, F: 0 };
    let rowerIndex = 0;
    let portNext = true;
    let rowersWhoCox = 0;
    specs.forEach((spec, i) => {
      const firstName = firstNamePools[team][spec.gender][used[spec.gender]++]!;
      const lastName = lastNames[nextLast++]!;
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
        id: stableId(`athlete:${team}:${i}`),
        teamId: teamId(team),
        firstName,
        lastName,
        side,
        canScull,
        canCox,
        weightKg: round1(lbToKg(weightLb(spec, r))),
        birthYear: spec.birthYear,
        gender: spec.gender,
        gradYear: junior ? spec.birthYear + 19 : null,
        level: spec.level,
        status: spec.inactive ? 'inactive' : 'active',
      };
      const preferred = PREFERRED_NAMES[firstName];
      if (preferred) athlete.preferredName = preferred;
      if (spec.notes) athlete.notes = spec.notes;
      w.athletes.push(athlete);
    });
  }
}
