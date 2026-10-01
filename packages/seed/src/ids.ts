// Stable ids for the seed world. Every id is stableId(<meaningful key>), so the same record has
// the same id on every run, in PocketBase and in demo mode. The maps below let tests and the UI
// find well-known records without searching.

import {
  SRA_BOYS_TRAILER,
  SRA_GIRLS_TRAILER,
  stableId,
  type Id,
  type Rule,
} from '@regatta-ops/domain';

export type TeamKey = 'boys' | 'girls' | '5am' | 'evening';
export const TEAM_KEYS: readonly TeamKey[] = ['boys', 'girls', '5am', 'evening'];

export const teamId = (team: TeamKey): Id => stableId(`team:${team}`);

export const SEED_TEAM_IDS = {
  boys: teamId('boys'),
  girls: teamId('girls'),
  fiveAm: teamId('5am'),
  evening: teamId('evening'),
} as const;

export const SEED_EMAILS = {
  admin: 'admin@regatta-ops.local',
  coachBoys: 'coach.boys@regatta-ops.local',
  coachGirls: 'coach.girls@regatta-ops.local',
  coachFiveAm: 'coach.5am@regatta-ops.local',
  coachEvening: 'coach.evening@regatta-ops.local',
  viewer: 'viewer@regatta-ops.local',
} as const;

export type UserKey = keyof typeof SEED_EMAILS;

export const SEED_USER_IDS: Readonly<Record<UserKey, Id>> = {
  admin: stableId('user:admin'),
  coachBoys: stableId('user:coach.boys'),
  coachGirls: stableId('user:coach.girls'),
  coachFiveAm: stableId('user:coach.5am'),
  coachEvening: stableId('user:coach.evening'),
  viewer: stableId('user:viewer'),
};

/** The coach responsible for each team (users.default_team). */
export const TEAM_COACH: Readonly<Record<TeamKey, UserKey>> = {
  boys: 'coachBoys',
  girls: 'coachGirls',
  '5am': 'coachFiveAm',
  evening: 'coachEvening',
};

export const SEED_REGATTA_IDS = {
  /** 2025 USRowing Northwest Youth Championships: three days, sprint, from the sample schedule. */
  nwYouth2025: stableId('regatta:nw-youth-2025'),
  /** Head of the Lake 2026: one day, head race, all four teams, planning. */
  headOfTheLake2026: stableId('regatta:hotl-2026'),
  /** Tail of the Lake 2026: events only. */
  tailOfTheLake2026: stableId('regatta:totl-2026'),
  /** 2025 Head of the Lake: archived, complete lineups for "copy lineups from". */
  headOfTheLake2025: stableId('regatta:hotl-2025'),
} as const;

export const SEED_TRAILER_IDS = {
  boys: stableId('trailer:boys'),
  girls: stableId('trailer:girls'),
} as const;

function shelfMap(trailer: 'boys' | 'girls', ids: readonly string[]): Readonly<Record<string, Id>> {
  return Object.fromEntries(ids.map((s) => [s, stableId(`trailer_shelf:${trailer}:${s}`)]));
}

/** Boys trailer shelves: the ids in SRA_BOYS_TRAILER ('l1'..'l5', 'r1'..'r5') → seeded ids. */
export const BOYS_SHELF_IDS = shelfMap(
  'boys',
  SRA_BOYS_TRAILER.shelves.map((s) => s.id),
);

/** Girls trailer shelves: the ids in SRA_GIRLS_TRAILER ('gl1'..'gl5', 'gr1'..'gr5') → seeded ids. */
export const GIRLS_SHELF_IDS = shelfMap(
  'girls',
  SRA_GIRLS_TRAILER.shelves.map((s) => s.id),
);

/** Both trailers' shelf ids (the sra.ts ids do not overlap). */
export const SHELF_IDS: Readonly<Record<string, Id>> = { ...BOYS_SHELF_IDS, ...GIRLS_SHELF_IDS };

/** Bed zones: the ids in sra.ts ('slings', 'oars', 'riggers', 'gslings', ...) → seeded ids. */
export const COMPARTMENT_IDS: Readonly<Record<string, Id>> = Object.fromEntries([
  ...SRA_BOYS_TRAILER.compartments.map((c) => [c.id, stableId(`trailer_compartment:boys:${c.id}`)]),
  ...SRA_GIRLS_TRAILER.compartments.map((c) => [
    c.id,
    stableId(`trailer_compartment:girls:${c.id}`),
  ]),
]);

/** Id of the shell with this exact name in data/reference/shells.csv ('Live.Laugh.Love'). */
export const seedShellId = (csvName: string): Id => stableId(`shell:${csvName}`);

/** Id of the oar set with this exact name in data/reference/oar-sets.csv ('24-C', 'Blue'). */
export const seedOarSetId = (csvName: string): Id => stableId(`oar_set:${csvName}`);

export const seedGearId = (slug: string): Id => stableId(`gear:${slug}`);

/**
 * A copy of `rules` with every shelf id inside rule params (shelfId, shelfIds) replaced through
 * `map`. Ids not in the map are kept. Used to move sra.ts rules onto the seeded shelf ids.
 */
export function remapRuleShelfIds(
  rules: readonly Rule[],
  map: Readonly<Record<string, Id>>,
): Rule[] {
  const swap = (id: string) => map[id] ?? id;
  return rules.map((rule) => {
    const copy = JSON.parse(JSON.stringify(rule)) as Rule;
    const params = copy.params as { shelfId?: string; shelfIds?: string[] };
    if (typeof params.shelfId === 'string') params.shelfId = swap(params.shelfId);
    if (Array.isArray(params.shelfIds)) params.shelfIds = params.shelfIds.map(swap);
    return copy;
  });
}
