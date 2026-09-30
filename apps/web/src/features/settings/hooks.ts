// Club defaults and the signed-in user's preferences (PLAN.md §4.12, §8.1 club_settings).
// Other features read the weight unit and season year through these.

import { DEFAULT_CLUB_SETTINGS, type ClubSettings } from '@srt/domain';
import { useCurrentUser, useList } from '@/data';
import { todayIn } from '@/lib/dates';

/**
 * The club settings record. `settings` falls back to the built-in defaults while loading or
 * when the record does not exist yet; `record` is the stored one (null when missing).
 */
export function useClubSettings() {
  const query = useList('club_settings');
  const record = query.data?.[0] ?? null;
  const settings: ClubSettings = record ?? { id: '', ...DEFAULT_CLUB_SETTINGS };
  return { ...query, record, settings };
}

/** The weight unit to show: the user's preference, else the club's. Weights are stored in kg. */
export function useWeightUnit(): 'kg' | 'lb' {
  const user = useCurrentUser();
  const { settings } = useClubSettings();
  return user?.preferences?.weightUnit ?? settings.weightUnit;
}

/** The season year for age groups: this calendar year in the club's timezone (§9.1). */
export function useSeasonYear(): number {
  const { settings } = useClubSettings();
  return Number(todayIn(settings.timezone).slice(0, 4));
}
