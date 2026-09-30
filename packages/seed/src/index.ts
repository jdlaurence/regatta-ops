// Seed world (PLAN.md §14). buildSeedWorld() is pure and deterministic: no clock, no
// Math.random, every id from stableId(<meaningful key>). The PocketBase seed script and demo mode
// (MemoryStore) both call it, so it must stay fast and must not touch the file system; the
// reference CSVs are compiled into src/generated/reference.ts by `pnpm --filter @srt/seed gen`.

import type { SeedAccount, World } from '@srt/domain';
import { addActivity, addComments } from './comms';
import { FleetIndex, addFleet } from './fleet';
import { addAthletes, addClubSettings, addTeams, addUsers } from './people';
import {
  addHeadOfTheLake2025,
  addHeadOfTheLake2026,
  addTailOfTheLake2026,
} from './regattas/head-races';
import { addNwYouth } from './regattas/nw-youth';
import { addTrailers } from './trailers';
import { emptyWorld } from './world';

export interface SeedResult {
  world: World;
  /** Email and password accounts for local development (PLAN.md §14 Users). */
  accounts: SeedAccount[];
}

/** Password of every seeded account. Local development only. */
export const SEED_PASSWORD = 'srt-local-dev';

export function buildSeedWorld(): SeedResult {
  const w = emptyWorld();
  addClubSettings(w);
  addTeams(w);
  addUsers(w);
  addAthletes(w);
  addFleet(w);
  addTrailers(w);
  const fleet = new FleetIndex(w);
  addNwYouth(w, fleet);
  addHeadOfTheLake2026(w, fleet);
  addTailOfTheLake2026(w, fleet);
  addHeadOfTheLake2025(w, fleet);
  addComments(w);
  addActivity(w);
  const accounts: SeedAccount[] = w.users.map((u) => ({
    userId: u.id,
    email: u.email,
    password: SEED_PASSWORD,
  }));
  return { world: w, accounts };
}

export {
  BOYS_SHELF_IDS,
  COMPARTMENT_IDS,
  GIRLS_SHELF_IDS,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  SEED_USER_IDS,
  SHELF_IDS,
  remapRuleShelfIds,
  seedGearId,
  seedOarSetId,
  seedShellId,
} from './ids';
export type { TeamKey, UserKey } from './ids';
export { bucketRigSides } from './fleet';
export { OAR_SET_ROWS, SCHEDULE_ROWS, SHELL_ROWS } from './generated/reference';
export type { OarSetRow, ScheduleRow, ShellRow } from './reference-types';
