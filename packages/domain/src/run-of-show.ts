// Run of show for one crew (PLAN.md §4.11): its warm-up, boat meeting, and launch times, and
// the side its stroke rows.
//
// A typed time is stored as minutes before the race, so it moves when the race does. A time not
// typed is suggested in a chain back from the race: launch is the launch lead before the race,
// the boat meeting the boat meeting lead before launch, the warm-up the warm-up lead before the
// boat meeting. A typed launch moves the suggested meeting and warm-up with it.

import { rowingSeats, seatSide } from './boat-classes';
import { entrySeatSides } from './conflicts';
import { addMinutes } from './time';
import type { Entry, RegattaSettings, Shell, Side } from './types';

export const RUN_OF_SHOW_STEPS = ['warmUp', 'boatMeeting', 'launch'] as const;
export type RunOfShowStep = (typeof RUN_OF_SHOW_STEPS)[number];

/** The entry field that holds each step's typed time. */
export const RUN_OF_SHOW_FIELDS = {
  warmUp: 'warmUpBeforeRaceMin',
  boatMeeting: 'boatMeetingBeforeRaceMin',
  launch: 'launchBeforeRaceMin',
} as const satisfies Record<RunOfShowStep, keyof Entry>;

export interface RunOfShowTime {
  /** ISO instant. */
  at: string;
  /** Typed for this crew; false when suggested from the timing settings. */
  typed: boolean;
}

export type RunOfShowTimes = Record<RunOfShowStep, RunOfShowTime>;

/** The crew's times before a race at `raceAt`; null when the race has no time yet. */
export function runOfShowTimes(
  raceAt: string | null | undefined,
  entry: Pick<Entry, (typeof RUN_OF_SHOW_FIELDS)[RunOfShowStep]>,
  settings: Pick<RegattaSettings, 'launchLeadMin' | 'boatMeetingLeadMin' | 'warmUpLeadMin'>,
): RunOfShowTimes | null {
  if (!raceAt) return null;
  const launch = entry.launchBeforeRaceMin ?? settings.launchLeadMin;
  const boatMeeting = entry.boatMeetingBeforeRaceMin ?? launch + settings.boatMeetingLeadMin;
  const warmUp = entry.warmUpBeforeRaceMin ?? boatMeeting + settings.warmUpLeadMin;
  const time = (before: number, typed: number | null | undefined): RunOfShowTime => ({
    at: addMinutes(raceAt, -before),
    typed: typed != null,
  });
  return {
    warmUp: time(warmUp, entry.warmUpBeforeRaceMin),
    boatMeeting: time(boatMeeting, entry.boatMeetingBeforeRaceMin),
    launch: time(launch, entry.launchBeforeRaceMin),
  };
}

/** The side the stroke seat rows (the shell's rig, or the entry's own sides); null for sculls. */
export function strokeSide(
  entry: Pick<Entry, 'boatClass' | 'seatSides'>,
  shell?: Pick<Shell, 'strokeSide'> | null,
): Side | null {
  const seats = rowingSeats(entry.boatClass);
  const stroke = seats[seats.length - 1];
  return stroke ? seatSide(entry.boatClass, stroke, entrySeatSides(entry, shell)) : null;
}
