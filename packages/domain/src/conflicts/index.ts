// Conflict engine (PLAN.md §9.2). Public surface:
//
//   findConflicts(input)                  every finding, sorted
//   unboatedAthletes(input, teamId, opts?) the crossed-off roster's leftovers
//   entryStats(entry, seats, athletes, seasonYear?)
//   hotSeatFingerprint(finding, input)    what an acknowledgment pins
//   hotSeatAckPatch(finding, input, opts?) the write that acknowledges a hot seat
//   busyWindows(input)                    busy windows for the timeline view
//   entrySeatSides(entry, shell)          the seat sides SIDE_MISMATCH uses

export * from './types';
export { findConflicts } from './engine';
export { unboatedAthletes, entryStats, busyWindows } from './stats';
export type { UnboatedOptions, BusyWindow } from './stats';
export { hotSeatFingerprint, fingerprintTokens } from './fingerprint';
export { hotSeatAckPatch, isHotSeat } from './ack';
export type { HotSeatAckPatch } from './ack';
export { findingId } from './finding';
export { entrySeatSides, isAvailableOn, isComing } from './context';
export { eventAgeGroup } from './static';
