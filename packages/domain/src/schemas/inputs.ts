// Form-friendly "input" schemas: the entity without id / created / updated (the store sets
// those), plus cross-field checks a form should show. Use with react-hook-form's zodResolver.

import type { z } from 'zod';
import type {
  Athlete,
  Availability,
  ClubSettings,
  Comment,
  Entry,
  EntrySeat,
  GearItem,
  LoadItem,
  OarSet,
  Regatta,
  RegattaEvent,
  Shell,
  Team,
  Trailer,
  TrailerCompartment,
  TrailerShelf,
} from '../types';
import { BASE_KEYS } from './common';
import {
  athleteSchema,
  availabilitySchema,
  clubSettingsSchema,
  commentSchema,
  entrySchema,
  entrySeatSchema,
  gearItemSchema,
  loadItemSchema,
  oarSetSchema,
  regattaEventSchema,
  regattaSchema,
  shellSchema,
  teamSchema,
  trailerCompartmentSchema,
  trailerSchema,
  trailerShelfSchema,
} from './entities';

export const teamInputSchema = teamSchema.omit(BASE_KEYS);
export const athleteInputSchema = athleteSchema.omit(BASE_KEYS);
export const availabilityInputSchema = availabilitySchema.omit(BASE_KEYS);
export const entryInputSchema = entrySchema.omit(BASE_KEYS);
export const entrySeatInputSchema = entrySeatSchema.omit(BASE_KEYS);
export const oarSetInputSchema = oarSetSchema.omit(BASE_KEYS);
export const gearItemInputSchema = gearItemSchema.omit(BASE_KEYS);
export const trailerInputSchema = trailerSchema.omit(BASE_KEYS);
export const trailerShelfInputSchema = trailerShelfSchema.omit(BASE_KEYS);
export const trailerCompartmentInputSchema = trailerCompartmentSchema.omit(BASE_KEYS);
export const loadItemInputSchema = loadItemSchema.omit(BASE_KEYS);
export const commentInputSchema = commentSchema.omit(BASE_KEYS);
export const clubSettingsInputSchema = clubSettingsSchema.omit(BASE_KEYS);

/** A regatta form: the end date may not come before the start date. */
export const regattaInputSchema = regattaSchema
  .omit(BASE_KEYS)
  .refine((r) => r.endDate >= r.startDate, {
    message: 'Choose an end date on or after the start date',
    path: ['endDate'],
  });

/** An event form: races need a boat class; logistics lines do not. */
export const regattaEventInputSchema = regattaEventSchema
  .omit(BASE_KEYS)
  .refine((e) => e.kind !== 'race' || !!e.boatClass, {
    message: 'Choose a boat class for a race',
    path: ['boatClass'],
  });

/** A shell form: a crew weight range must run from low to high. */
export const shellInputSchema = shellSchema
  .omit(BASE_KEYS)
  .refine(
    (s) =>
      s.crewWeightMinKg == null ||
      s.crewWeightMaxKg == null ||
      s.crewWeightMinKg <= s.crewWeightMaxKg,
    { message: 'Make the minimum crew weight no more than the maximum', path: ['crewWeightMaxKg'] },
  );

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Check<T extends true> = T;
type Input<T> = Omit<T, 'id' | 'created' | 'updated'>;

export type InputSchemaDriftChecks = [
  Check<Same<z.infer<typeof teamInputSchema>, Input<Team>>>,
  Check<Same<z.infer<typeof athleteInputSchema>, Input<Athlete>>>,
  Check<Same<z.infer<typeof availabilityInputSchema>, Input<Availability>>>,
  Check<Same<z.infer<typeof entryInputSchema>, Input<Entry>>>,
  Check<Same<z.infer<typeof entrySeatInputSchema>, Input<EntrySeat>>>,
  Check<Same<z.infer<typeof oarSetInputSchema>, Input<OarSet>>>,
  Check<Same<z.infer<typeof gearItemInputSchema>, Input<GearItem>>>,
  Check<Same<z.infer<typeof trailerInputSchema>, Input<Trailer>>>,
  Check<Same<z.infer<typeof trailerShelfInputSchema>, Input<TrailerShelf>>>,
  Check<Same<z.infer<typeof trailerCompartmentInputSchema>, Input<TrailerCompartment>>>,
  Check<Same<z.infer<typeof loadItemInputSchema>, Input<LoadItem>>>,
  Check<Same<z.infer<typeof commentInputSchema>, Input<Comment>>>,
  Check<Same<z.infer<typeof clubSettingsInputSchema>, Input<ClubSettings>>>,
  Check<Same<z.infer<typeof regattaInputSchema>, Input<Regatta>>>,
  Check<Same<z.infer<typeof regattaEventInputSchema>, Input<RegattaEvent>>>,
  Check<Same<z.infer<typeof shellInputSchema>, Input<Shell>>>,
];
