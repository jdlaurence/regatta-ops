// Conflict engine (PLAN.md §9.2). STUB: WP-A replaces the bodies; the signatures are the contract.

import type { Athlete, Entry, EntrySeat } from '../types';
import type { ConflictInput, EntryStats, Finding } from './types';

export * from './types';

export function findConflicts(_input: ConflictInput): Finding[] {
  return [];
}

export function unboatedAthletes(_input: ConflictInput, _teamId: string): Athlete[] {
  return [];
}

export function entryStats(
  _entry: Entry,
  _seats: EntrySeat[],
  _athletes: Athlete[],
  _seasonYear?: number,
): EntryStats {
  return { portCount: 0, starboardCount: 0 };
}

/**
 * Fingerprint of a hot-seat pair: what must stay unchanged for an acknowledgment to hold
 * (both entries' shell and event time). Stored on the later entry as hotSeatFingerprint.
 */
export function hotSeatFingerprint(_finding: Finding, _input: ConflictInput): string {
  return '';
}
