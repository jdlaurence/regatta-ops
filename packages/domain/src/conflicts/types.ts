// Conflict engine contract (PLAN.md §9.2).

import type { JuniorAgeGroup } from '../boat-classes';
import type {
  Athlete,
  Availability,
  Entry,
  EntrySeat,
  Id,
  LoadPlacement,
  OarSet,
  RegattaEvent,
  RegattaSettings,
  Shell,
  Team,
} from '../types';

export interface ConflictInput {
  settings: RegattaSettings;
  /** IANA zone of the regatta; used to write times into messages ("at 10:20"). */
  timezone: string;
  /** Season year for junior age groups (the regatta's start year). */
  seasonYear: number;
  events: RegattaEvent[];
  entries: Entry[];
  seats: EntrySeat[];
  athletes: Athlete[];
  availability: Availability[];
  shells: Shell[];
  oarSets: OarSet[];
  teams: Team[];
  /** Optional: enables NOT_ON_TRAILER findings. */
  loadPlacements?: Pick<LoadPlacement, 'shellId'>[];
}

export type Severity = 'error' | 'warning' | 'info';

export const FINDING_CODES = [
  'SHELL_CONFLICT',
  'SHELL_HOT_SEAT',
  'OARS_CONFLICT',
  'OARS_HOT_SEAT',
  'ATHLETE_DOUBLE_BOOKED',
  'ATHLETE_TIGHT',
  'RERIG_NEEDED',
  'CLASS_MISMATCH',
  'RIGGING_MISMATCH',
  'OARS_SHORT',
  'SHELL_OUT_OF_SERVICE',
  'SHELL_LIMITED',
  'ATHLETE_UNAVAILABLE',
  'ATHLETE_BORROWED',
  'SEATS_EMPTY',
  'NO_SHELL',
  'NO_OARS',
  'SIDE_MISMATCH',
  'COX_NOT_COX',
  'SCULLER_NOT_SCULLER',
  'UNSCHEDULED',
  'NOT_ON_TRAILER',
  'AGE_GROUP',
] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export interface Finding {
  /** Stable hash of code + sorted subject ids, so acknowledgments persist. */
  id: string;
  code: FindingCode;
  severity: Severity;
  /** One sentence, ready to display. */
  message: string;
  entryIds: Id[];
  teamIds: Id[];
  resource?: { type: 'shell' | 'oar_set' | 'athlete'; id: Id };
  day?: string;
  /** For hot seats and conflicts: minutes from the boat landing to the next race start. */
  gapMin?: number;
  acknowledged?: boolean;
}

export interface EntryStats {
  /** Average rower age (cox excluded); needs seasonYear. */
  avgAge?: number;
  mastersCategory?: string;
  /** Oldest junior age group of anyone seated (cox included); needs seasonYear. */
  ageGroup?: JuniorAgeGroup;
  /** Seated rowers whose own side is port / starboard. */
  portCount: number;
  starboardCount: number;
}

/** Findings the coach can acknowledge with a plan (PLAN.md §4.4). */
export const HOT_SEAT_CODES = [
  'SHELL_HOT_SEAT',
  'OARS_HOT_SEAT',
] as const satisfies readonly FindingCode[];

export const SEVERITIES = ['error', 'warning', 'info'] as const satisfies readonly Severity[];
