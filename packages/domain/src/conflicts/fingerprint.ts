// Hot-seat fingerprints (PLAN.md §9.2 Determinism and ids, §4.4 Hot seat acknowledgment).
//
// A fingerprint captures what must stay unchanged for an acknowledgment to hold: the resource
// (shell or oar set), both entries, and both scheduled times. It is readable on purpose, so a
// PocketBase hook can check it without the domain package:
//
//   shell:<shellId>|<earlierEntryId>@<ISO>|<laterEntryId>@<ISO>
//
// The acknowledgment is stored on the LATER entry of the pair (hotSeatAckBy, hotSeatPlan,
// hotSeatFingerprint). The stored value may hold several fingerprints separated by spaces, so
// one entry can acknowledge both the shell and the oar handoff from the same crew.

import type { Entry, Id } from '../types';
import type { ConflictInput, Finding } from './types';

export interface PairSide {
  id: Id;
  /** ISO instant of the entry's race. */
  at: string;
}

/** Sort a pair the way the engine does: by race time, then entry id. */
export function orderPair<T extends PairSide>(a: T, b: T): [T, T] {
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (ta === tb) return a.id <= b.id ? [a, b] : [b, a];
  return ta < tb ? [a, b] : [b, a];
}

export function pairFingerprint(
  type: 'shell' | 'oar_set',
  resourceId: Id,
  a: PairSide,
  b: PairSide,
): string {
  const [first, second] = orderPair(a, b);
  return `${type}:${resourceId}|${first.id}@${first.at}|${second.id}@${second.at}`;
}

/** The fingerprints stored on an entry (space separated). */
export function fingerprintTokens(stored: string | null | undefined): string[] {
  return (stored ?? '').split(/\s+/).filter((t) => t.length > 0);
}

/** Whether the later entry's stored acknowledgment covers `fingerprint`. */
export function isAcknowledgedBy(later: Entry, fingerprint: string): boolean {
  if (!later.hotSeatAckBy || !fingerprint) return false;
  return fingerprintTokens(later.hotSeatFingerprint).includes(fingerprint);
}

/**
 * Fingerprint of a shell or oar-set pair finding: both entries' resource id and scheduled times.
 * Returns '' for findings that are not about a shell or oar set pair, or when an entry or its
 * event time is missing from the input.
 */
export function hotSeatFingerprint(finding: Finding, input: ConflictInput): string {
  const res = finding.resource;
  if (!res || res.type === 'athlete' || finding.entryIds.length !== 2) return '';
  const sides: PairSide[] = [];
  for (const id of finding.entryIds) {
    const entry = input.entries.find((e) => e.id === id);
    const event = entry?.eventId ? input.events.find((ev) => ev.id === entry.eventId) : undefined;
    if (!event?.scheduledAt) return '';
    sides.push({ id, at: event.scheduledAt });
  }
  return pairFingerprint(res.type, res.id, sides[0]!, sides[1]!);
}
