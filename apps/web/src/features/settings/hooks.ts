// Club defaults (PLAN.md §8.1 club_settings). Other features read the season year through these.

import { DEFAULT_CLUB_SETTINGS, type ClubSettings } from '@regatta-ops/domain';
import { useList } from '@/data';
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

/** The season year for age groups: this calendar year in the club's timezone (§9.1). */
export function useSeasonYear(): number {
  const { settings } = useClubSettings();
  return Number(todayIn(settings.timezone).slice(0, 4));
}
