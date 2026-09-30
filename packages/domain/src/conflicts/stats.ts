// Roster and entry facts (PLAN.md §4.4, §9.2): unboated athletes, entry stats, busy windows.

import {
  isOlderAgeGroup,
  juniorAgeGroup,
  mastersCategory,
  seatsFor,
  type JuniorAgeGroup,
} from '../boat-classes';
import type { Athlete, Entry, EntrySeat, Id } from '../types';
import { buildContext, isComing } from './context';
import type { ConflictInput, EntryStats } from './types';

export interface UnboatedOptions {
  /**
   * Count seats in other teams' entries as boated. Default false: an athlete lent to another
   * team is still unboated for the home team (PLAN.md §9.2 test 13).
   */
  anyTeam?: boolean;
}

/**
 * Active athletes on the team's roster who are coming (available on at least one regatta day)
 * and not seated in any non-scratched entry of the team. Sorted by last name, first name.
 */
export function unboatedAthletes(
  input: ConflictInput,
  teamId: string,
  options: UnboatedOptions = {},
): Athlete[] {
  const days = Array.from(new Set(input.events.map((e) => e.day))).sort();
  const counted = new Set<Id>(
    input.entries
      .filter((e) => e.status !== 'scratched' && (options.anyTeam || e.teamId === teamId))
      .map((e) => e.id),
  );
  const boated = new Set<Id>();
  for (const s of input.seats) if (s.athleteId && counted.has(s.entryId)) boated.add(s.athleteId);
  const availability = new Map(input.availability.map((a) => [a.athleteId, a]));
  return input.athletes
    .filter(
      (a) =>
        a.teamId === teamId &&
        a.status === 'active' &&
        !boated.has(a.id) &&
        isComing(availability.get(a.id), days),
    )
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'en') ||
        a.firstName.localeCompare(b.firstName, 'en') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

/**
 * Computed facts for an entry (PLAN.md §4.4 Entry details). Rowers exclude the cox for
 * age and side counts; `ageGroup` is the oldest junior group of anyone seated, cox
 * included. Ages need `seasonYear` (age = seasonYear − birthYear, USRowing convention).
 * `portCount` / `starboardCount` count seated rowers by their own side (both/none count as neither).
 */
export function entryStats(
  entry: Entry,
  seats: EntrySeat[],
  athletes: Athlete[],
  seasonYear?: number,
): EntryStats {
  const template = seatsFor(entry.boatClass);
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const rowers: Athlete[] = [];
  const everyone: Athlete[] = [];
  const seen = new Set<string>();
  for (const s of seats) {
    if (s.entryId !== entry.id || !s.athleteId || !template.includes(s.seat)) continue;
    if (seen.has(s.seat)) continue;
    seen.add(s.seat);
    const a = byId.get(s.athleteId);
    if (!a) continue;
    everyone.push(a);
    if (s.seat !== 'cox') rowers.push(a);
  }
  const stats: EntryStats = {
    portCount: rowers.filter((a) => a.side === 'port').length,
    starboardCount: rowers.filter((a) => a.side === 'starboard').length,
  };
  if (seasonYear != null) {
    const ages = rowers
      .map((a) => a.birthYear)
      .filter((y): y is number => y != null)
      .map((y) => seasonYear - y);
    if (ages.length > 0) {
      stats.avgAge = ages.reduce((s, a) => s + a, 0) / ages.length;
      stats.mastersCategory = mastersCategory(stats.avgAge);
    }
    let oldest: JuniorAgeGroup | undefined;
    for (const a of everyone) {
      if (a.birthYear == null) continue;
      const g = juniorAgeGroup(a.birthYear, seasonYear);
      if (!oldest || isOlderAgeGroup(g, oldest)) oldest = g;
    }
    if (oldest) stats.ageGroup = oldest;
  }
  return stats;
}

/** An entry's busy window as ISO instants, for the timeline view (PLAN.md §4.5). */
export interface BusyWindow {
  entryId: Id;
  day: string;
  /** T − launch lead: when the crew needs the shell. */
  busyStart: string;
  /** T: race start. */
  raceStart: string;
  /** T + race duration. */
  raceEnd: string;
  /** raceEnd + return time: shell back on the dock. */
  busyEnd: string;
}

/** Busy windows of every non-scratched entry whose event has a time, in time order. */
export function busyWindows(input: ConflictInput): BusyWindow[] {
  const ctx = buildContext(input);
  return Array.from(ctx.scheduled.values())
    .sort((a, b) => a.t - b.t || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0))
    .map((s) => ({
      entryId: s.entry.id,
      day: s.day,
      busyStart: new Date(s.busyStart).toISOString(),
      raceStart: new Date(s.t).toISOString(),
      raceEnd: new Date(s.raceEnd).toISOString(),
      busyEnd: new Date(s.busyEnd).toISOString(),
    }));
}
