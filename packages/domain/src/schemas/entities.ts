// One zod schema per entity in types.ts (PLAN.md §7.1 Forms, §8.1). The drift checks at the
// bottom fail the typecheck if a schema and its type stop matching in either direction.

import { z } from 'zod';
import type {
  ActivityEntry,
  Athlete,
  Availability,
  ClubSettings,
  CollectionMap,
  CollectionName,
  Comment,
  Entry,
  EntrySeat,
  GearItem,
  LoadItem,
  LoadPlacement,
  LoadPlan,
  OarSet,
  Presence,
  PublishedEntry,
  PublishedSnapshot,
  Regatta,
  RegattaEvent,
  RegattaSettings,
  RegattaTeam,
  ShareLink,
  Shell,
  Team,
  Trailer,
  TrailerCompartment,
  TrailerShelf,
  User,
  UserPreferences,
} from '../types';
import type { Reason, Rule } from '../trailer/types';
import {
  athleteSideSchema,
  availabilityStatusSchema,
  baseRecordShape,
  boatClassSchema,
  countSchema,
  daySchema,
  entryStatusSchema,
  equipmentStatusSchema,
  eventStageSchema,
  gearCategorySchema,
  genderAffinitySchema,
  idSchema,
  instantSchema,
  measureSchema,
  requiredText,
  riggingSchema,
  seatSchema,
  sideSchema,
  teamColorKeySchema,
} from './common';
import { reasonSchema, ruleSchema } from './rules';

const optionalRef = idSchema.nullable().optional();
const optionalText = z.string().optional();
const optionalInstant = instantSchema.nullable().optional();
const optionalMeasure = measureSchema.nullable().optional();
const optionalYear = z.number().int().min(1900).max(2100).nullable().optional();

// ---------------------------------------------------------------------------
// People and teams

export const userPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  weightUnit: z.enum(['kg', 'lb']).optional(),
  emailDigest: z.boolean().optional(),
  emailOnChange: z.boolean().optional(),
});

export const userSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter a name'),
  email: z.email('Enter an email address'),
  role: z.enum(['admin', 'coach', 'viewer']),
  avatarUrl: z.string().nullable().optional(),
  defaultTeamId: optionalRef,
  preferences: userPreferencesSchema,
});

export const teamSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter a team name'),
  shortName: requiredText('Enter a short name').max(16, 'Keep the short name to 16 characters'),
  program: z.enum(['juniors', 'masters', 'other']),
  colorKey: teamColorKeySchema,
  sortOrder: z.number().int(),
  archived: z.boolean(),
});

export const athleteSchema = z.object({
  ...baseRecordShape,
  teamId: idSchema,
  firstName: requiredText('Enter a first name'),
  lastName: z.string().trim(),
  preferredName: optionalText,
  side: athleteSideSchema,
  canScull: z.boolean(),
  canCox: z.boolean(),
  weightKg: optionalMeasure,
  birthYear: optionalYear,
  birthdate: daySchema.nullable().optional(),
  gender: optionalText,
  gradYear: optionalYear,
  level: z.enum(['novice', 'experienced']),
  status: z.enum(['active', 'inactive']),
  notes: optionalText,
});

// ---------------------------------------------------------------------------
// Regattas

export const regattaSettingsSchema = z.object({
  launchLeadMin: countSchema,
  raceDurationMin: countSchema,
  returnMin: countSchema,
  hotSeatMinGapMin: countSchema,
  athleteMinGapMin: countSchema,
  rerigMin: countSchema,
});

export const regattaSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter a regatta name'),
  venue: z.string(),
  city: z.string(),
  startDate: daySchema,
  endDate: daySchema,
  timezone: requiredText('Choose a timezone'),
  format: z.enum(['sprint', 'head']),
  notes: optionalText,
  status: z.enum(['planning', 'final', 'archived']),
  settings: regattaSettingsSchema.partial(),
  createdBy: optionalRef,
});

export const publishedEntrySchema = z.object({
  entryId: idSchema,
  label: z.string(),
  boatClass: boatClassSchema,
  status: entryStatusSchema,
  eventId: idSchema.nullable(),
  eventName: optionalText,
  eventNumber: optionalText,
  day: daySchema.optional(),
  scheduledAt: optionalInstant,
  stage: eventStageSchema.nullable().optional(),
  shellId: idSchema.nullable(),
  shellName: optionalText,
  oarSetId: idSchema.nullable(),
  oarSetName: optionalText,
  hotSeatPlan: optionalText,
  seats: z.array(
    z.object({ seat: seatSchema, athleteId: idSchema.nullable(), athleteName: optionalText }),
  ),
});

export const publishedSnapshotSchema = z.object({
  publishedAt: instantSchema,
  publishedBy: optionalRef,
  entries: z.array(publishedEntrySchema),
});

export const regattaTeamSchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  teamId: idSchema,
  notes: optionalText,
  publishedAt: optionalInstant,
  publishedSnapshot: publishedSnapshotSchema.nullable().optional(),
});

export const availabilitySchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  athleteId: idSchema,
  status: availabilityStatusSchema,
  days: z.record(daySchema, availabilityStatusSchema).nullable().optional(),
  reason: optionalText,
  updatedBy: optionalRef,
});

export const regattaEventSchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  kind: z.enum(['race', 'logistics']),
  eventNumber: optionalText,
  name: requiredText('Enter the event name'),
  boatClass: boatClassSchema.nullable().optional(),
  category: optionalText,
  day: daySchema,
  scheduledAt: optionalInstant,
  stage: eventStageSchema.nullable().optional(),
  progressionGroup: optionalText,
  teamFilter: z.array(idSchema).optional(),
  notes: optionalText,
  sortOrder: z.number(),
  source: optionalText,
});

export const entrySchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  eventId: optionalRef,
  teamId: idSchema,
  label: z.string().trim(),
  boatClass: boatClassSchema,
  shellId: optionalRef,
  oarSetId: optionalRef,
  status: entryStatusSchema,
  coachId: optionalRef,
  notes: optionalText,
  hotSeatPlan: optionalText,
  hotSeatAckBy: optionalRef,
  hotSeatFingerprint: optionalText,
  seatSides: z.partialRecord(seatSchema, sideSchema).nullable().optional(),
  createdBy: optionalRef,
  updatedBy: optionalRef,
});

export const entrySeatSchema = z.object({
  ...baseRecordShape,
  entryId: idSchema,
  seat: seatSchema,
  athleteId: optionalRef,
  note: optionalText,
});

// ---------------------------------------------------------------------------
// Fleet

export const shellSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter the shell name'),
  nickname: optionalText,
  boatClass: boatClassSchema,
  compatibleClasses: z.array(boatClassSchema),
  rigging: z.enum(['sweep', 'scull', 'convertible']),
  manufacturer: optionalText,
  model: optionalText,
  serial: optionalText,
  year: optionalYear,
  lengthCm: optionalMeasure,
  beamCm: optionalMeasure,
  weightKg: optionalMeasure,
  weightClassLabel: optionalText,
  crewWeightMinKg: optionalMeasure,
  crewWeightMaxKg: optionalMeasure,
  strokeSide: sideSchema.nullable().optional(),
  coxPosition: z.enum(['stern', 'bow']).nullable().optional(),
  riggerType: z.enum(['wing', 'side', 'none']),
  riggerCount: countSchema.nullable().optional(),
  shoes: optionalText,
  spreadCm: optionalMeasure,
  spanCm: optionalMeasure,
  level: z.enum(['beginner', 'intermediate', 'racer']).nullable().optional(),
  genderAffinity: genderAffinitySchema,
  homeTeamId: optionalRef,
  location: optionalText,
  status: equipmentStatusSchema,
  color: optionalText,
  isPrivate: z.boolean(),
  notes: optionalText,
  photoUrl: z.string().nullable().optional(),
});

export const oarSetSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter the oar set name'),
  type: riggingSchema,
  color: optionalText,
  count: countSchema,
  blade: optionalText,
  lengthCm: optionalMeasure,
  inboardCm: optionalMeasure,
  gripMm: optionalMeasure,
  genderAffinity: genderAffinitySchema,
  homeTeamId: optionalRef,
  status: equipmentStatusSchema,
  notes: optionalText,
});

export const gearItemSchema = z.object({
  ...baseRecordShape,
  category: gearCategorySchema,
  name: requiredText('Enter a name'),
  quantity: countSchema,
  defaultLoad: z.boolean(),
  notes: optionalText,
});

// ---------------------------------------------------------------------------
// Trailers and load plans

export const trailerSchema = z.object({
  ...baseRecordShape,
  name: requiredText('Enter the trailer name'),
  style: z.enum(['offset_post', 'center_post', 'goalpost']),
  frameLengthCm: measureSchema,
  widthCm: measureSchema,
  postOffsetPct: z.number().min(0).max(100).nullable().optional(),
  bowForwardDefault: z.boolean(),
  notes: optionalText,
  defaultRules: z.array(ruleSchema),
});

export const trailerShelfSchema = z.object({
  ...baseRecordShape,
  trailerId: idSchema,
  label: requiredText('Enter a label'),
  tier: z.number().int().min(1),
  columnKey: z.enum(['left', 'right', 'full']),
  widthCm: measureSchema,
  lengthCm: measureSchema,
  frontOverhangMaxCm: z.number().min(0),
  rearOverhangMaxCm: z.number().min(0),
  allowedClasses: z.array(boatClassSchema).optional(),
  lanesOverride: z.number().int().min(1).nullable().optional(),
  laneAccess: z.enum(['any', 'outer_first']),
  maxBoats: countSchema.nullable().optional(),
  maxWeightKg: optionalMeasure,
  accessRank: z.number().int(),
  active: z.boolean(),
  sortOrder: z.number(),
});

export const trailerCompartmentSchema = z.object({
  ...baseRecordShape,
  trailerId: idSchema,
  kind: z.enum(['bed', 'oar_box', 'oar_tube', 'oar_rack', 'rigger_rack', 'storage']),
  label: requiredText('Enter a label'),
  capacity: countSchema,
  capacityUnit: optionalText,
});

export const loadPlanSchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  trailerId: idSchema,
  status: z.enum(['draft', 'final']),
  rules: z.array(ruleSchema),
  packedAt: optionalInstant,
  notes: optionalText,
});

export const loadPlacementSchema = z.object({
  ...baseRecordShape,
  loadPlanId: idSchema,
  shellId: idSchema,
  shelfId: idSchema,
  lane: z.number().int().min(0),
  offsetCm: z.number(),
  bowForward: z.boolean(),
  locked: z.boolean(),
  reasons: z.array(reasonSchema),
});

export const loadItemSchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  loadPlanId: optionalRef,
  kind: z.enum(['shell', 'riggers', 'oar_set', 'gear', 'extra']),
  refId: optionalText,
  label: requiredText('Enter what to load'),
  quantity: countSchema,
  container: optionalText,
  loadedAt: optionalInstant,
  loadedBy: optionalRef,
  returnedAt: optionalInstant,
  returnedBy: optionalRef,
  loadedByName: optionalText,
  returnedByName: optionalText,
  notes: optionalText,
});

// ---------------------------------------------------------------------------
// Communication and settings

export const commentSchema = z.object({
  ...baseRecordShape,
  targetType: z.enum(['entry', 'event', 'load_plan']),
  targetId: idSchema,
  authorId: idSchema,
  body: requiredText('Write a comment'),
  mentions: z.array(idSchema).optional(),
});

export const activityEntrySchema = z.object({
  ...baseRecordShape,
  regattaId: optionalRef,
  actorId: optionalRef,
  teamId: optionalRef,
  action: z.enum(['create', 'update', 'delete']),
  targetType: z.string(),
  targetId: idSchema,
  summary: z.string(),
  diff: z
    .record(z.string(), z.object({ from: z.unknown(), to: z.unknown() }))
    .nullable()
    .optional(),
});

export const presenceSchema = z.object({
  ...baseRecordShape,
  userId: idSchema,
  regattaId: idSchema,
  page: z.string(),
  teamId: optionalRef,
  seenAt: instantSchema,
});

export const shareLinkSchema = z.object({
  ...baseRecordShape,
  regattaId: idSchema,
  teamId: optionalRef,
  token: z.string().min(16, 'Tokens are at least 16 characters'),
  canCheckLoad: z.boolean(),
  revokedAt: optionalInstant,
  createdBy: optionalRef,
});

export const clubSettingsSchema = z.object({
  ...baseRecordShape,
  clubName: requiredText('Enter the club name'),
  timezone: requiredText('Choose a timezone'),
  weightUnit: z.enum(['kg', 'lb']),
  weekStartsOn: z.literal([0, 1]),
  timingDefaults: regattaSettingsSchema,
  headRaceDurationMin: countSchema,
});

/** Schema per collection, for imports and for validating a whole World (MemoryStore, seed). */
export const collectionSchemas: { [K in CollectionName]: z.ZodType<CollectionMap[K]> } = {
  users: userSchema,
  teams: teamSchema,
  athletes: athleteSchema,
  regattas: regattaSchema,
  regatta_teams: regattaTeamSchema,
  availability: availabilitySchema,
  events: regattaEventSchema,
  entries: entrySchema,
  entry_seats: entrySeatSchema,
  shells: shellSchema,
  oar_sets: oarSetSchema,
  gear_items: gearItemSchema,
  trailers: trailerSchema,
  trailer_shelves: trailerShelfSchema,
  trailer_compartments: trailerCompartmentSchema,
  load_plans: loadPlanSchema,
  load_placements: loadPlacementSchema,
  load_items: loadItemSchema,
  comments: commentSchema,
  activity_log: activityEntrySchema,
  presence: presenceSchema,
  share_links: shareLinkSchema,
  club_settings: clubSettingsSchema,
};

// ---------------------------------------------------------------------------
// Drift checks: each line fails the typecheck when the schema's output type and the entity
// type stop being mutually assignable.

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;
type Out<S extends z.ZodType> = z.infer<S>;

export type EntitySchemaDriftChecks = [
  Check<Same<Out<typeof userPreferencesSchema>, UserPreferences>>,
  Check<Same<Out<typeof userSchema>, User>>,
  Check<Same<Out<typeof teamSchema>, Team>>,
  Check<Same<Out<typeof athleteSchema>, Athlete>>,
  Check<Same<Out<typeof regattaSettingsSchema>, RegattaSettings>>,
  Check<Same<Out<typeof regattaSchema>, Regatta>>,
  Check<Same<Out<typeof publishedEntrySchema>, PublishedEntry>>,
  Check<Same<Out<typeof publishedSnapshotSchema>, PublishedSnapshot>>,
  Check<Same<Out<typeof regattaTeamSchema>, RegattaTeam>>,
  Check<Same<Out<typeof availabilitySchema>, Availability>>,
  Check<Same<Out<typeof regattaEventSchema>, RegattaEvent>>,
  Check<Same<Out<typeof entrySchema>, Entry>>,
  Check<Same<Out<typeof entrySeatSchema>, EntrySeat>>,
  Check<Same<Out<typeof shellSchema>, Shell>>,
  Check<Same<Out<typeof oarSetSchema>, OarSet>>,
  Check<Same<Out<typeof gearItemSchema>, GearItem>>,
  Check<Same<Out<typeof trailerSchema>, Trailer>>,
  Check<Same<Out<typeof trailerShelfSchema>, TrailerShelf>>,
  Check<Same<Out<typeof trailerCompartmentSchema>, TrailerCompartment>>,
  Check<Same<Out<typeof loadPlanSchema>, LoadPlan>>,
  Check<Same<Out<typeof loadPlacementSchema>, LoadPlacement>>,
  Check<Same<Out<typeof loadItemSchema>, LoadItem>>,
  Check<Same<Out<typeof commentSchema>, Comment>>,
  Check<Same<Out<typeof activityEntrySchema>, ActivityEntry>>,
  Check<Same<Out<typeof presenceSchema>, Presence>>,
  Check<Same<Out<typeof shareLinkSchema>, ShareLink>>,
  Check<Same<Out<typeof clubSettingsSchema>, ClubSettings>>,
  Check<Same<Out<typeof ruleSchema>, Rule>>,
  Check<Same<Out<typeof reasonSchema>, Reason>>,
];
