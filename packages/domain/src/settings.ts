// Regatta timing settings (PLAN.md §14).

import type { ClubSettings, Regatta, RegattaSettings } from './types';

export const DEFAULT_TIMING: RegattaSettings = {
  launchLeadMin: 40,
  boatMeetingLeadMin: 15,
  warmUpLeadMin: 30,
  raceDurationMin: 10,
  returnMin: 15,
  hotSeatMinGapMin: 15,
  athleteMinGapMin: 30,
  rerigMin: 30,
};

export const DEFAULT_HEAD_RACE_DURATION_MIN = 20;

export const DEFAULT_CLUB_SETTINGS: Omit<ClubSettings, 'id'> = {
  clubName: 'Sammamish Rowing Association',
  timezone: 'America/Los_Angeles',
  weightUnit: 'lb',
  weekStartsOn: 0,
  timingDefaults: DEFAULT_TIMING,
  headRaceDurationMin: DEFAULT_HEAD_RACE_DURATION_MIN,
};

/** Club defaults (by format) overlaid with the regatta's own overrides. */
export function effectiveSettings(
  regatta: Pick<Regatta, 'format' | 'settings'>,
  club?: Pick<ClubSettings, 'timingDefaults' | 'headRaceDurationMin'> | null,
): RegattaSettings {
  // Club records saved before a setting existed lack its key.
  const base = { ...DEFAULT_TIMING, ...club?.timingDefaults };
  if (regatta.format === 'head') {
    base.raceDurationMin = club?.headRaceDurationMin ?? DEFAULT_HEAD_RACE_DURATION_MIN;
  }
  const overrides = Object.fromEntries(
    Object.entries(regatta.settings ?? {}).filter(([, v]) => typeof v === 'number'),
  ) as Partial<RegattaSettings>;
  return { ...base, ...overrides };
}

export const TIMING_LABELS: Record<keyof RegattaSettings, { label: string; help: string }> = {
  launchLeadMin: {
    label: 'Launch lead',
    help: 'Minutes before race time a crew needs its shell.',
  },
  boatMeetingLeadMin: {
    label: 'Boat meeting lead',
    help: 'Minutes before launch the crew meets at its shell. Suggests boat meeting times on the run of show.',
  },
  warmUpLeadMin: {
    label: 'Warm-up lead',
    help: 'Minutes before the boat meeting the crew starts warming up. Suggests warm-up times on the run of show.',
  },
  raceDurationMin: { label: 'Race duration', help: 'Minutes from start to finish.' },
  returnMin: {
    label: 'Return time',
    help: 'Minutes from the finish until the shell is back on the dock or in slings.',
  },
  hotSeatMinGapMin: {
    label: 'Hot seat minimum',
    help: 'The smallest dock-to-race-start gap a hot seat can survive.',
  },
  athleteMinGapMin: {
    label: 'Athlete minimum gap',
    help: "The smallest gap between an athlete's races before a warning.",
  },
  rerigMin: {
    label: 'Re-rig time',
    help: 'Extra minutes a convertible shell needs when its rigging changes between entries.',
  },
};
