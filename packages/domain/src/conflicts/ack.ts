// Hot-seat acknowledgment helper for the UI (PLAN.md §4.4). Pure: returns the patch to write.

import type { Id } from '../types';
import { findConflicts } from './engine';
import { fingerprintTokens, hotSeatFingerprint } from './fingerprint';
import { HOT_SEAT_CODES, type ConflictInput, type Finding } from './types';

export interface HotSeatAckPatch {
  /** The later entry of the pair: where hotSeatAckBy, hotSeatPlan, and the fingerprint live. */
  entryId: Id;
  /** The new value for entries.hotSeatFingerprint. Empty after the last acknowledgment is removed. */
  hotSeatFingerprint: string;
}

export function isHotSeat(finding: Pick<Finding, 'code'>): boolean {
  return (HOT_SEAT_CODES as readonly string[]).includes(finding.code);
}

function samePair(a: Finding, b: Finding): boolean {
  return a.entryIds.length === 2 && [...a.entryIds].sort().join() === [...b.entryIds].sort().join();
}

/**
 * The patch that acknowledges (or, with `remove`, un-acknowledges) a hot seat. Acknowledging
 * covers every hot seat between the same two entries (the shell and the oars change hands
 * together) and keeps the later entry's other acknowledgments that still match. Returns null
 * for findings that cannot be acknowledged (anything but SHELL_HOT_SEAT and OARS_HOT_SEAT).
 *
 * The UI writes `{ hotSeatFingerprint, hotSeatAckBy: userId, hotSeatPlan }` to `entryId`, or
 * clears hotSeatAckBy and hotSeatPlan when the returned fingerprint is empty.
 */
export function hotSeatAckPatch(
  finding: Finding,
  input: ConflictInput,
  options: { remove?: boolean } = {},
): HotSeatAckPatch | null {
  if (!isHotSeat(finding) || finding.entryIds.length !== 2) return null;
  const laterId = finding.entryIds[1]!;
  const later = input.entries.find((e) => e.id === laterId);
  if (!later) return null;

  const current = findConflicts(input).filter((f) => isHotSeat(f) && f.entryIds[1] === laterId);
  const valid = new Set(current.map((f) => hotSeatFingerprint(f, input)));
  const pair = new Set(
    current.filter((f) => samePair(f, finding)).map((f) => hotSeatFingerprint(f, input)),
  );
  pair.add(hotSeatFingerprint(finding, input));
  pair.delete('');

  const kept = later.hotSeatAckBy
    ? fingerprintTokens(later.hotSeatFingerprint).filter((t) => valid.has(t))
    : [];
  const tokens = new Set(kept);
  for (const t of pair) {
    if (options.remove) tokens.delete(t);
    else tokens.add(t);
  }
  return { entryId: laterId, hotSeatFingerprint: Array.from(tokens).sort().join(' ') };
}
