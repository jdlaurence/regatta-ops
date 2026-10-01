// The regatta form (PLAN.md §4.1): new regatta and regatta settings share one schema. Timing
// values are overrides: null means "use the club default" (§4.1, club_settings §8.1).

import { z } from 'zod';
import {
  DEFAULT_CLUB_SETTINGS,
  effectiveSettings,
  regattaSchema,
  TIMING_LABELS,
  type ClubSettings,
  type Regatta,
  type RegattaFormat,
  type RegattaSettings,
} from '@regatta-ops/domain';
import type { CreateInput, Patch } from '@/data';

export const TIMING_KEYS = Object.keys(TIMING_LABELS) as (keyof RegattaSettings)[];

/** Longest regatta the form accepts, in days. */
export const MAX_REGATTA_DAYS = 14;

const overrideSchema = z
  .number('Enter a number of minutes')
  .int('Enter whole minutes')
  .min(0, 'Enter zero or more')
  .max(600, 'Enter at most 600 minutes')
  .nullable();

const timingSchema = z.object(
  Object.fromEntries(TIMING_KEYS.map((k) => [k, overrideSchema])) as Record<
    keyof RegattaSettings,
    typeof overrideSchema
  >,
);

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const regattaFormSchema = regattaSchema
  .pick({ name: true, timezone: true, format: true, status: true })
  .extend({
    startDate: z.string().regex(DAY, 'Choose a start date'),
    endDate: z.string().regex(DAY, 'Choose an end date'),
    venue: z.string().trim(),
    city: z.string().trim(),
    notes: z.string(),
    timing: timingSchema,
  })
  .refine((r) => r.endDate >= r.startDate, {
    message: 'Choose an end date on or after the start date',
    path: ['endDate'],
  })
  .refine(
    (r) =>
      r.endDate < r.startDate ||
      (Date.parse(r.endDate) - Date.parse(r.startDate)) / 86_400_000 < MAX_REGATTA_DAYS,
    { message: `A regatta can last up to ${MAX_REGATTA_DAYS} days`, path: ['endDate'] },
  );

export type RegattaFormValues = z.infer<typeof regattaFormSchema>;
export type TimingOverrides = RegattaFormValues['timing'];

export function emptyTiming(): TimingOverrides {
  return Object.fromEntries(TIMING_KEYS.map((k) => [k, null])) as TimingOverrides;
}

export function newRegattaDefaults(timezone = DEFAULT_CLUB_SETTINGS.timezone): RegattaFormValues {
  return {
    name: '',
    venue: '',
    city: '',
    startDate: '',
    endDate: '',
    timezone,
    format: 'sprint',
    status: 'planning',
    notes: '',
    timing: emptyTiming(),
  };
}

export function regattaToForm(r: Regatta): RegattaFormValues {
  const timing = emptyTiming();
  for (const k of TIMING_KEYS) {
    const v = r.settings?.[k];
    if (typeof v === 'number') timing[k] = v;
  }
  return {
    name: r.name,
    venue: r.venue ?? '',
    city: r.city ?? '',
    startDate: r.startDate,
    endDate: r.endDate || r.startDate,
    timezone: r.timezone,
    format: r.format,
    status: r.status,
    notes: r.notes ?? '',
    timing,
  };
}

/** Only the overrides that are set: a missing key falls back to the club default. */
export function timingToSettings(timing: TimingOverrides): Partial<RegattaSettings> {
  const out: Partial<RegattaSettings> = {};
  for (const k of TIMING_KEYS) {
    const v = timing[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function formToCreate(v: RegattaFormValues): CreateInput<Regatta> {
  const rec: CreateInput<Regatta> = {
    name: v.name.trim(),
    venue: v.venue.trim(),
    city: v.city.trim(),
    startDate: v.startDate,
    endDate: v.endDate || v.startDate,
    timezone: v.timezone,
    format: v.format,
    status: v.status,
    settings: timingToSettings(v.timing),
  };
  if (v.notes.trim()) rec.notes = v.notes.trim();
  return rec;
}

export function formToPatch(v: RegattaFormValues): Patch<Regatta> {
  return { ...formToCreate(v), notes: v.notes.trim() };
}

/** The club default for each timing value, for a regatta of this format. */
export function clubDefaults(
  format: RegattaFormat,
  club: Pick<ClubSettings, 'timingDefaults' | 'headRaceDurationMin'> | null | undefined,
): RegattaSettings {
  return effectiveSettings({ format, settings: {} }, club);
}

/** Common zones first; the regatta's own zone is kept even when it is not in the list. */
export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Los_Angeles', label: 'Pacific time (Los Angeles)' },
  { value: 'America/Denver', label: 'Mountain time (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona (Phoenix)' },
  { value: 'America/Chicago', label: 'Central time (Chicago)' },
  { value: 'America/New_York', label: 'Eastern time (New York)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
  { value: 'Europe/London', label: 'United Kingdom (London)' },
];

export function timezoneOptions(current?: string): { value: string; label: string }[] {
  if (!current || TIMEZONES.some((t) => t.value === current)) return TIMEZONES;
  return [{ value: current, label: current.replace(/_/g, ' ') }, ...TIMEZONES];
}

export const FORMAT_LABELS: Record<RegattaFormat, string> = {
  sprint: 'Sprint',
  head: 'Head race',
};

export const STATUS_LABELS: Record<Regatta['status'], string> = {
  planning: 'Planning',
  final: 'Final',
  archived: 'Archived',
};
