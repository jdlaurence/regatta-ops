// Shared zod building blocks: ids, days, instants, and the rowing vocabulary enums. Messages are
// sentence case and say what to do.

import { z } from 'zod';
import { BOAT_CLASSES, GEAR_CATEGORIES, SEATS, TEAM_COLOR_KEYS } from '../types';

export const idSchema = z.string().min(1, 'Choose a record');

/** 'YYYY-MM-DD' calendar day in the regatta zone. */
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Enter a real date');

/** An ISO instant. Lenient on format (PocketBase writes a space instead of 'T'). */
export const instantSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Enter a date and time');

export const boatClassSchema = z.enum(BOAT_CLASSES, 'Choose a boat class');
export const seatSchema = z.enum(SEATS);
export const sideSchema = z.enum(['port', 'starboard']);
export const riggingSchema = z.enum(['sweep', 'scull']);
export const athleteSideSchema = z.enum(['port', 'starboard', 'both', 'none']);
export const equipmentStatusSchema = z.enum(['in_service', 'limited', 'out_of_service', 'retired']);
export const genderAffinitySchema = z.enum(['women', 'men', 'any']);
export const teamColorKeySchema = z.enum(TEAM_COLOR_KEYS);
export const gearCategorySchema = z.enum(GEAR_CATEGORIES);
export const entryStatusSchema = z.enum(['draft', 'planned', 'confirmed', 'scratched']);
export const eventStageSchema = z.enum(['heat', 'semi', 'final', 'time_trial', 'race']);
export const availabilityStatusSchema = z.enum(['available', 'unavailable', 'maybe']);

/** A required name-like field: trimmed, not empty. */
export function requiredText(message: string) {
  return z.string().trim().min(1, message);
}

/** A non-negative whole number (minutes, counts, centimetres). */
export const countSchema = z.number().int('Enter a whole number').min(0, 'Enter zero or more');

/** A positive measurement (kg, cm) that may be blank. */
export const measureSchema = z.number().positive('Enter a number above zero');

/** id / created / updated, shared by every record (types.ts BaseRecord). */
export const baseRecordShape = {
  id: idSchema,
  created: z.string().optional(),
  updated: z.string().optional(),
};

/** The keys a form never edits: pass to `.omit()` to make an input schema. */
export const BASE_KEYS = { id: true, created: true, updated: true } as const;
