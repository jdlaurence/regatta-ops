// Conflict engine (PLAN.md §9.2).

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
