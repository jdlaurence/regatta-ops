// Entity types for SRT (PLAN.md §8), in camelCase. This file is the contract between
// the domain package, the DataStore implementations, the seed, and the UI.
//
// Conventions:
// - Every id is a string. Seeded and PocketBase ids are 15 lowercase alphanumerics.
// - Calendar days are 'YYYY-MM-DD' strings in the regatta's timezone.
// - Instants (scheduledAt, publishedAt, loadedAt, ...) are ISO 8601 UTC strings
//   ('2025-05-16T15:00:00.000Z'). Convert for display with the helpers in time.ts.
// - Optional relations are `string | null`; PocketBaseStore maps '' to null at the boundary.
// - PocketBase field names are the snake_case forms of these names (PLAN.md §8.1).

import type { Reason, Rule } from './trailer/types';

export type Id = string;

// ---------------------------------------------------------------------------
// Rowing vocabulary (PLAN.md §3, §9.1)

export const BOAT_CLASSES = ['1x', '2x', '2-', '2+', '4x', '4x+', '4+', '4-', '8+'] as const;
export type BoatClass = (typeof BOAT_CLASSES)[number];

export const SEATS = ['1', '2', '3', '4', '5', '6', '7', '8', 'cox'] as const;
export type Seat = (typeof SEATS)[number];

export type Side = 'port' | 'starboard';
export type Rigging = 'sweep' | 'scull';

// ---------------------------------------------------------------------------
// Shared

export interface BaseRecord {
  id: Id;
  /** ISO instant, set by the store. */
  created?: string;
  /** ISO instant, set by the store. */
  updated?: string;
}

export type Role = 'admin' | 'coach' | 'viewer';

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'system';
  weightUnit?: 'kg' | 'lb';
}

export interface User extends BaseRecord {
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string | null;
  defaultTeamId?: Id | null;
  preferences: UserPreferences;
}

export const TEAM_COLOR_KEYS = [
  'navy',
  'raspberry',
  'ochre',
  'green',
  'violet',
  'cyan',
  'bronze',
  'slate',
] as const;
export type TeamColorKey = (typeof TEAM_COLOR_KEYS)[number];

export type Program = 'juniors' | 'masters' | 'other';

export interface Team extends BaseRecord {
  name: string;
  shortName: string;
  program: Program;
  colorKey: TeamColorKey;
  sortOrder: number;
  archived: boolean;
}

export type AthleteSide = 'port' | 'starboard' | 'both' | 'none';
export type AthleteLevel = 'novice' | 'experienced';

export interface Athlete extends BaseRecord {
  teamId: Id;
  firstName: string;
  lastName: string;
  preferredName?: string;
  side: AthleteSide;
  canScull: boolean;
  canCox: boolean;
  weightKg?: number | null;
  birthYear?: number | null;
  /** 'YYYY-MM-DD', optional; birth year is what the club tracks. */
  birthdate?: string | null;
  gender?: string;
  gradYear?: number | null;
  level: AthleteLevel;
  status: 'active' | 'inactive';
  notes?: string;
}

// ---------------------------------------------------------------------------
// Regattas (PLAN.md §4.1)

export interface RegattaSettings {
  launchLeadMin: number;
  raceDurationMin: number;
  returnMin: number;
  hotSeatMinGapMin: number;
  athleteMinGapMin: number;
  rerigMin: number;
}

export type RegattaFormat = 'sprint' | 'head';
export type RegattaStatus = 'planning' | 'final' | 'archived';

export interface Regatta extends BaseRecord {
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  /** IANA zone, default 'America/Los_Angeles'. */
  timezone: string;
  format: RegattaFormat;
  notes?: string;
  status: RegattaStatus;
  /** Per-regatta overrides; missing keys fall back to club defaults (see effectiveSettings). */
  settings: Partial<RegattaSettings>;
  createdBy?: Id | null;
}

/** One entry of a team's published lineups (PLAN.md §4.1 Publishing). */
export interface PublishedEntry {
  entryId: Id;
  label: string;
  boatClass: BoatClass;
  status: EntryStatus;
  eventId: Id | null;
  eventName?: string;
  eventNumber?: string;
  day?: string;
  scheduledAt?: string | null;
  stage?: EventStage | null;
  shellId: Id | null;
  shellName?: string;
  oarSetId: Id | null;
  oarSetName?: string;
  hotSeatPlan?: string;
  seats: { seat: Seat; athleteId: Id | null; athleteName?: string }[];
}

export interface PublishedSnapshot {
  publishedAt: string;
  publishedBy?: Id | null;
  entries: PublishedEntry[];
}

export interface RegattaTeam extends BaseRecord {
  regattaId: Id;
  teamId: Id;
  notes?: string;
  publishedAt?: string | null;
  publishedSnapshot?: PublishedSnapshot | null;
}

export type AvailabilityStatus = 'available' | 'unavailable' | 'maybe';

export interface Availability extends BaseRecord {
  regattaId: Id;
  athleteId: Id;
  status: AvailabilityStatus;
  /** Per-day overrides for multi-day regattas, keyed by 'YYYY-MM-DD'. */
  days?: Record<string, AvailabilityStatus> | null;
  reason?: string;
  updatedBy?: Id | null;
}

export type EventKind = 'race' | 'logistics';
export type EventStage = 'heat' | 'semi' | 'final' | 'time_trial' | 'race';

/** A race or logistics line on a regatta's schedule. Named RegattaEvent to avoid the DOM `Event`. */
export interface RegattaEvent extends BaseRecord {
  regattaId: Id;
  kind: EventKind;
  eventNumber?: string;
  name: string;
  boatClass?: BoatClass | null;
  category?: string;
  day: string;
  /** ISO instant; null means TBD / unscheduled. */
  scheduledAt?: string | null;
  stage?: EventStage | null;
  progressionGroup?: string;
  /** Logistics only: the teams this line applies to (empty = everyone). */
  teamFilter?: Id[];
  notes?: string;
  sortOrder: number;
  source?: string;
}

export type EntryStatus = 'draft' | 'planned' | 'confirmed' | 'scratched';

export interface Entry extends BaseRecord {
  regattaId: Id;
  eventId?: Id | null;
  teamId: Id;
  label: string;
  boatClass: BoatClass;
  shellId?: Id | null;
  oarSetId?: Id | null;
  status: EntryStatus;
  coachId?: Id | null;
  notes?: string;
  hotSeatPlan?: string;
  hotSeatAckBy?: Id | null;
  /** Fingerprint of the hot-seat pair when it was acknowledged (see conflicts/fingerprint). */
  hotSeatFingerprint?: string;
  /** Per-seat side overrides for non-standard rigs. */
  seatSides?: Partial<Record<Seat, Side>> | null;
  createdBy?: Id | null;
  updatedBy?: Id | null;
}

export interface EntrySeat extends BaseRecord {
  entryId: Id;
  seat: Seat;
  athleteId?: Id | null;
  note?: string;
}

// ---------------------------------------------------------------------------
// Fleet (PLAN.md §4.7)

export type EquipmentStatus = 'in_service' | 'limited' | 'out_of_service' | 'retired';
export type GenderAffinity = 'women' | 'men' | 'any';
export type ShellRigging = 'sweep' | 'scull' | 'convertible';
export type RiggerType = 'wing' | 'side' | 'none';

export interface Shell extends BaseRecord {
  name: string;
  nickname?: string;
  boatClass: BoatClass;
  /** Explicit compatible classes; empty means "use the defaults" (see isCompatible). */
  compatibleClasses: BoatClass[];
  rigging: ShellRigging;
  manufacturer?: string;
  model?: string;
  serial?: string;
  year?: number | null;
  lengthCm?: number | null;
  beamCm?: number | null;
  weightKg?: number | null;
  /** As the club writes it: '165-200', 'LWT', '<240'. */
  weightClassLabel?: string;
  crewWeightMinKg?: number | null;
  crewWeightMaxKg?: number | null;
  strokeSide?: Side | null;
  coxPosition?: 'stern' | 'bow' | null;
  riggerType: RiggerType;
  riggerCount?: number | null;
  shoes?: string;
  spreadCm?: number | null;
  spanCm?: number | null;
  level?: 'beginner' | 'intermediate' | 'racer' | null;
  genderAffinity: GenderAffinity;
  homeTeamId?: Id | null;
  location?: string;
  status: EquipmentStatus;
  color?: string;
  isPrivate: boolean;
  notes?: string;
  photoUrl?: string | null;
}

export interface OarSet extends BaseRecord {
  name: string;
  type: Rigging;
  /** Color code, e.g. 'yellow-red'. How people find them at the trailer. */
  color?: string;
  count: number;
  blade?: string;
  lengthCm?: number | null;
  inboardCm?: number | null;
  gripMm?: number | null;
  genderAffinity: GenderAffinity;
  homeTeamId?: Id | null;
  status: EquipmentStatus;
  notes?: string;
}

export const GEAR_CATEGORIES = [
  'cox_box',
  'slings',
  'rigger_set',
  'tool_kit',
  'tent',
  'launch',
  'straps',
  'spare_parts',
  'other',
] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export interface GearItem extends BaseRecord {
  category: GearCategory;
  name: string;
  quantity: number;
  defaultLoad: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Trailers and load plans (PLAN.md §4.8, §4.9). Packer-facing types live in trailer/types.ts.

export type TrailerStyle = 'offset_post' | 'center_post' | 'goalpost';

export interface Trailer extends BaseRecord {
  name: string;
  style: TrailerStyle;
  frameLengthCm: number;
  widthCm: number;
  /** offset_post only: where the post sits across the width, percent (SRA: 33). */
  postOffsetPct?: number | null;
  bowForwardDefault: boolean;
  notes?: string;
  defaultRules: Rule[];
}

export type ColumnKey = 'left' | 'right' | 'full';
export type LaneAccess = 'any' | 'outer_first';

export interface TrailerShelf extends BaseRecord {
  trailerId: Id;
  label: string;
  tier: number;
  columnKey: ColumnKey;
  widthCm: number;
  lengthCm: number;
  frontOverhangMaxCm: number;
  rearOverhangMaxCm: number;
  allowedClasses?: BoatClass[];
  lanesOverride?: number | null;
  laneAccess: LaneAccess;
  maxBoats?: number | null;
  maxWeightKg?: number | null;
  accessRank: number;
  active: boolean;
  sortOrder: number;
}

export type CompartmentKind =
  'bed' | 'oar_box' | 'oar_tube' | 'oar_rack' | 'rigger_rack' | 'storage';

export interface TrailerCompartment extends BaseRecord {
  trailerId: Id;
  kind: CompartmentKind;
  label: string;
  capacity: number;
  capacityUnit?: string;
}

export interface LoadPlan extends BaseRecord {
  regattaId: Id;
  trailerId: Id;
  status: 'draft' | 'final';
  /** The effective rule set: trailer defaults plus regatta overrides (origin 'regatta'). */
  rules: Rule[];
  packedAt?: string | null;
  notes?: string;
}

export interface LoadPlacement extends BaseRecord {
  loadPlanId: Id;
  shellId: Id;
  shelfId: Id;
  lane: number;
  offsetCm: number;
  bowForward: boolean;
  locked: boolean;
  reasons: Reason[];
}

export type LoadItemKind = 'shell' | 'riggers' | 'oar_set' | 'gear' | 'extra';

export interface LoadItem extends BaseRecord {
  regattaId: Id;
  loadPlanId?: Id | null;
  kind: LoadItemKind;
  /** The shell, oar set, or gear item id; empty for extras. */
  refId?: string;
  label: string;
  quantity: number;
  /** Free text: 'Boys trailer bed', 'Truck 1 bed'. */
  container?: string;
  loadedAt?: string | null;
  loadedBy?: Id | null;
  returnedAt?: string | null;
  returnedBy?: Id | null;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Communication (PLAN.md §4.6)

export type CommentTarget = 'entry' | 'event' | 'load_plan';

export interface Comment extends BaseRecord {
  targetType: CommentTarget;
  targetId: Id;
  authorId: Id;
  body: string;
}

export interface ActivityEntry extends BaseRecord {
  regattaId?: Id | null;
  actorId?: Id | null;
  action: 'create' | 'update' | 'delete';
  targetType: string;
  targetId: Id;
  /** A human sentence: "moved entry Girls V4+ to Event 14". */
  summary: string;
  diff?: Record<string, { from: unknown; to: unknown }> | null;
}

export interface Presence extends BaseRecord {
  userId: Id;
  regattaId: Id;
  page: string;
  teamId?: Id | null;
  seenAt: string;
}

export interface ShareLink extends BaseRecord {
  regattaId: Id;
  teamId?: Id | null;
  token: string;
  canCheckLoad: boolean;
  revokedAt?: string | null;
}

/** Club-wide defaults (PLAN.md §4.12). A single record. */
export interface ClubSettings extends BaseRecord {
  clubName: string;
  timezone: string;
  weightUnit: 'kg' | 'lb';
  weekStartsOn: 0 | 1;
  /** Sprint defaults; raceDurationMin for head races comes from headRaceDurationMin. */
  timingDefaults: RegattaSettings;
  headRaceDurationMin: number;
}

// ---------------------------------------------------------------------------
// Collections: the name → record map used by DataStore and the seed.

export interface CollectionMap {
  users: User;
  teams: Team;
  athletes: Athlete;
  regattas: Regatta;
  regatta_teams: RegattaTeam;
  availability: Availability;
  events: RegattaEvent;
  entries: Entry;
  entry_seats: EntrySeat;
  shells: Shell;
  oar_sets: OarSet;
  gear_items: GearItem;
  trailers: Trailer;
  trailer_shelves: TrailerShelf;
  trailer_compartments: TrailerCompartment;
  load_plans: LoadPlan;
  load_placements: LoadPlacement;
  load_items: LoadItem;
  comments: Comment;
  activity_log: ActivityEntry;
  presence: Presence;
  share_links: ShareLink;
  club_settings: ClubSettings;
}

export type CollectionName = keyof CollectionMap;

export const COLLECTION_NAMES = [
  'users',
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'availability',
  'events',
  'entries',
  'entry_seats',
  'shells',
  'oar_sets',
  'gear_items',
  'trailers',
  'trailer_shelves',
  'trailer_compartments',
  'load_plans',
  'load_placements',
  'load_items',
  'comments',
  'activity_log',
  'presence',
  'share_links',
  'club_settings',
] as const satisfies readonly CollectionName[];

/** A whole dataset: what the seed produces and what MemoryStore holds. */
export type World = { [K in CollectionName]: CollectionMap[K][] };

/** Local-dev accounts created by the seed (email + password), PLAN.md §14. */
export interface SeedAccount {
  userId: Id;
  email: string;
  password: string;
}
