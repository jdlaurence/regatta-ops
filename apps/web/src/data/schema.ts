// What the client knows about the collections beyond their TypeScript types (PLAN.md §8.1):
// which fields are relations, which are dates, and which the server stamps. Used by the
// PocketBase mapper ('' ↔ null, field names) and by MemoryStore (cascades, stamping, unique
// indexes). If the backend's schema and this file disagree, fix it here: one line per field.

import type { CollectionName } from '@srt/domain';

export type OnDelete = 'cascade' | 'unset' | 'restrict';

export interface RelationDef {
  target: CollectionName;
  multi?: boolean;
  /** What happens to this record when the target is deleted. */
  onDelete: OnDelete;
}

/** Relation fields by collection, keyed by the domain (camelCase) field name. */
export const RELATIONS: { [C in CollectionName]: Record<string, RelationDef> } = {
  users: { defaultTeamId: { target: 'teams', onDelete: 'unset' } },
  teams: {},
  athletes: { teamId: { target: 'teams', onDelete: 'restrict' } },
  regattas: { createdBy: { target: 'users', onDelete: 'unset' } },
  regatta_teams: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    teamId: { target: 'teams', onDelete: 'restrict' },
  },
  availability: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    athleteId: { target: 'athletes', onDelete: 'cascade' },
    updatedBy: { target: 'users', onDelete: 'unset' },
  },
  events: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    teamFilter: { target: 'teams', multi: true, onDelete: 'unset' },
  },
  entries: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    eventId: { target: 'events', onDelete: 'unset' },
    teamId: { target: 'teams', onDelete: 'restrict' },
    shellId: { target: 'shells', onDelete: 'unset' },
    oarSetId: { target: 'oar_sets', onDelete: 'unset' },
    coachId: { target: 'users', onDelete: 'unset' },
    hotSeatAckBy: { target: 'users', onDelete: 'unset' },
    createdBy: { target: 'users', onDelete: 'unset' },
    updatedBy: { target: 'users', onDelete: 'unset' },
  },
  entry_seats: {
    entryId: { target: 'entries', onDelete: 'cascade' },
    athleteId: { target: 'athletes', onDelete: 'unset' },
  },
  shells: { homeTeamId: { target: 'teams', onDelete: 'unset' } },
  oar_sets: { homeTeamId: { target: 'teams', onDelete: 'unset' } },
  gear_items: {},
  trailers: {},
  trailer_shelves: { trailerId: { target: 'trailers', onDelete: 'cascade' } },
  trailer_compartments: { trailerId: { target: 'trailers', onDelete: 'cascade' } },
  load_plans: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    trailerId: { target: 'trailers', onDelete: 'cascade' },
  },
  load_placements: {
    loadPlanId: { target: 'load_plans', onDelete: 'cascade' },
    shellId: { target: 'shells', onDelete: 'cascade' },
    shelfId: { target: 'trailer_shelves', onDelete: 'cascade' },
  },
  load_items: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    loadPlanId: { target: 'load_plans', onDelete: 'unset' },
    loadedBy: { target: 'users', onDelete: 'unset' },
    returnedBy: { target: 'users', onDelete: 'unset' },
  },
  comments: {
    authorId: { target: 'users', onDelete: 'unset' },
    mentions: { target: 'users', multi: true, onDelete: 'unset' },
  },
  activity_log: {
    regattaId: { target: 'regattas', onDelete: 'unset' },
    actorId: { target: 'users', onDelete: 'unset' },
    teamId: { target: 'teams', onDelete: 'unset' },
  },
  presence: {
    userId: { target: 'users', onDelete: 'cascade' },
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    teamId: { target: 'teams', onDelete: 'unset' },
  },
  share_links: {
    regattaId: { target: 'regattas', onDelete: 'cascade' },
    teamId: { target: 'teams', onDelete: 'cascade' },
    createdBy: { target: 'users', onDelete: 'unset' },
  },
  club_settings: {},
};

/**
 * 'day' fields are 'YYYY-MM-DD' text in both places; 'instant' fields are PocketBase dates
 * ('2025-05-16 15:00:00.000Z' on read, ISO accepted on write). Empty ('') means null.
 */
export const DATE_FIELDS: Partial<Record<CollectionName, Record<string, 'day' | 'instant'>>> = {
  athletes: { birthdate: 'day' },
  regattas: { startDate: 'day', endDate: 'day' },
  regatta_teams: { publishedAt: 'instant' },
  events: { day: 'day', scheduledAt: 'instant' },
  load_plans: { packedAt: 'instant' },
  load_items: { loadedAt: 'instant', returnedAt: 'instant' },
  presence: { seenAt: 'instant' },
  share_links: { revokedAt: 'instant' },
};

/** Fields the server stamps from the signed-in user (backend/pb_hooks/stamp.pb.js, §8.3). */
export const STAMPED: Partial<Record<CollectionName, { onCreate: string[]; onUpdate: string[] }>> =
  {
    regattas: { onCreate: ['createdBy'], onUpdate: [] },
    availability: { onCreate: ['updatedBy'], onUpdate: ['updatedBy'] },
    entries: { onCreate: ['createdBy', 'updatedBy'], onUpdate: ['updatedBy'] },
  };

/** Unique indexes (§8.1). Rows with an empty value in any listed field are exempt. */
export const UNIQUE: Partial<Record<CollectionName, string[][]>> = {
  regatta_teams: [['regattaId', 'teamId']],
  availability: [['regattaId', 'athleteId']],
  entry_seats: [
    ['entryId', 'seat'],
    ['entryId', 'athleteId'],
  ],
  load_plans: [['regattaId', 'trailerId']],
  load_placements: [['loadPlanId', 'shellId']],
};

/**
 * Optional selects: PocketBase returns '' when unset, the domain uses null.
 * (Multi-selects come back as [] and need no entry.)
 */
export const NULLABLE_SELECTS: Partial<Record<CollectionName, string[]>> = {
  events: ['boatClass', 'stage'],
  shells: ['strokeSide', 'coxPosition', 'level'],
};

/**
 * Optional numbers: PocketBase has no null number and returns 0 when unset, so 0 reads as null
 * for these fields (none of them is meaningfully zero).
 */
export const NULLABLE_NUMBERS: Partial<Record<CollectionName, string[]>> = {
  athletes: ['weightKg', 'birthYear', 'gradYear'],
  shells: [
    'year',
    'lengthCm',
    'beamCm',
    'weightKg',
    'crewWeightMinKg',
    'crewWeightMaxKg',
    'spreadCm',
    'spanCm',
  ],
  oar_sets: ['lengthCm', 'inboardCm', 'gripMm'],
  trailers: ['postOffsetPct'],
  trailer_shelves: ['lanesOverride', 'maxBoats', 'maxWeightKg'],
  // A blank start is the front of the frame, a blank end the back (PLAN.md §4.9).
  trailer_compartments: ['startCm', 'endCm'],
};

/** JSON fields the domain types as required: PocketBase's empty json (null) reads as this. */
export const JSON_DEFAULTS: Partial<Record<CollectionName, Record<string, () => unknown>>> = {
  users: { preferences: () => ({}) },
  regattas: { settings: () => ({}) },
  trailers: { defaultRules: () => [] },
  load_plans: { rules: () => [] },
  load_placements: { reasons: () => [] },
};
