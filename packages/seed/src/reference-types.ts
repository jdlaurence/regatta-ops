// Row shapes of the CSVs in data/reference/ (see data/reference/README.md). Every cell is the
// trimmed string from the CSV; mapping to domain types happens in fleet.ts and regattas/.
// scripts/gen-reference.ts checks each CSV's header against these column lists.

export const SHELL_COLUMNS = [
  'name',
  'nickname',
  'boat_class',
  'compatible_classes',
  'gender_affinity',
  'size_tier',
  'model',
  'serial',
  'weight_class_lb',
  'year',
  'location',
  'spread_or_span',
  'rig',
  'stroke_side',
  'cox_position',
  'shoes',
  'unavailable',
  'notes',
] as const;

export const OAR_SET_COLUMNS = [
  'name',
  'type',
  'gender_affinity',
  'color',
  'blade',
  'length_cm',
  'inboard_cm',
  'grip_mm',
  'unavailable',
  'notes',
] as const;

export const SCHEDULE_COLUMNS = [
  'day',
  'time',
  'kind',
  'name',
  'boat_class',
  'stage',
  'shell',
  'oars',
] as const;

export type ShellRow = Record<(typeof SHELL_COLUMNS)[number], string>;
export type OarSetRow = Record<(typeof OAR_SET_COLUMNS)[number], string>;
export type ScheduleRow = Record<(typeof SCHEDULE_COLUMNS)[number], string>;

/** The CSV files, relative to data/reference/, and the columns each must have. */
export const REFERENCE_FILES = {
  shells: { file: 'shells.csv', columns: SHELL_COLUMNS },
  oarSets: { file: 'oar-sets.csv', columns: OAR_SET_COLUMNS },
  schedule: { file: 'schedule-sample-2025-nw-youth-champs.csv', columns: SCHEDULE_COLUMNS },
} as const;
