// Availability rules (PLAN.md §4.2, §8.1): absence of a record means available, so a record
// exists only while an athlete is not plainly available (a status other than available, a
// per-day override, or a reason). `days[day]` overrides the regatta-wide status on that day.
// Pure; the team's availability sheet and the lineups roster turn drafts into batch writes.

import {
  isAvailableOn,
  isComing,
  type Athlete,
  type Availability,
  type AvailabilityStatus,
  type Entry,
  type RegattaEvent,
} from '@regatta-ops/domain';
import { batchOp, type BatchOp } from '@/data';

export interface AvailabilityDraft {
  status: AvailabilityStatus;
  days: Record<string, AvailabilityStatus>;
  reason: string;
}

export function draftOf(av: Availability | undefined | null): AvailabilityDraft {
  return {
    status: av?.status ?? 'available',
    days: { ...(av?.days ?? {}) },
    reason: av?.reason ?? '',
  };
}

/**
 * The simplest equivalent draft: overrides only for regatta days and only where they differ
 * from the status; when every day carries the same override, it becomes the status.
 */
export function normalizeDraft(
  d: AvailabilityDraft,
  regattaDays: readonly string[],
): AvailabilityDraft {
  let status = d.status;
  let days: Record<string, AvailabilityStatus> = {};
  for (const day of regattaDays) {
    const v = d.days[day];
    if (v && v !== status) days[day] = v;
  }
  const values = regattaDays.map((day) => days[day]);
  if (regattaDays.length > 0 && values.every((v) => v !== undefined && v === values[0])) {
    status = values[0]!;
    days = {};
  }
  return { status, days, reason: d.reason };
}

/** True when the draft needs no record: available every day, no reason. */
export function isPlainlyAvailable(d: AvailabilityDraft): boolean {
  return d.status === 'available' && Object.keys(d.days).length === 0 && !d.reason.trim();
}

/** Effective status on one day. */
export function statusOn(d: AvailabilityDraft, day: string): AvailabilityStatus {
  return d.days[day] ?? d.status;
}

/** Set the regatta-wide status; per-day overrides that now match it fall away. */
export function withStatus(
  d: AvailabilityDraft,
  status: AvailabilityStatus,
  regattaDays: readonly string[],
): AvailabilityDraft {
  return normalizeDraft({ ...d, status }, regattaDays);
}

/** Flip one day between unavailable and available. */
export function toggleDay(
  d: AvailabilityDraft,
  day: string,
  regattaDays: readonly string[],
): AvailabilityDraft {
  const next: AvailabilityStatus = statusOn(d, day) === 'unavailable' ? 'available' : 'unavailable';
  return normalizeDraft({ ...d, days: { ...d.days, [day]: next } }, regattaDays);
}

function sameDays(a: Record<string, unknown> | null | undefined, b: Record<string, unknown>) {
  const ka = Object.keys(a ?? {}).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a![k] === b[k]);
}

/**
 * The write that makes the stored record match the draft: delete it when the athlete is
 * plainly available, create or update otherwise, nothing when it already matches.
 */
export function planWrite(
  existing: Availability | undefined,
  draft: AvailabilityDraft,
  ctx: { regattaId: string; athleteId: string; regattaDays: readonly string[] },
): BatchOp | null {
  const d = normalizeDraft(draft, ctx.regattaDays);
  const reason = d.reason.trim();
  if (isPlainlyAvailable(d)) {
    return existing ? batchOp.delete('availability', existing.id) : null;
  }
  const days = Object.keys(d.days).length > 0 ? d.days : null;
  if (!existing) {
    return batchOp.create('availability', {
      regattaId: ctx.regattaId,
      athleteId: ctx.athleteId,
      status: d.status,
      days,
      reason,
    });
  }
  if (
    existing.status === d.status &&
    (existing.reason ?? '') === reason &&
    sameDays(existing.days, d.days)
  ) {
    return null;
  }
  return batchOp.update('availability', existing.id, { status: d.status, days, reason });
}

export interface AvailabilityCounts {
  total: number;
  /** Coming on at least one day ('maybe' counts, PLAN.md §9.2). */
  available: number;
  maybe: number;
}

export function countAvailability(
  athletes: readonly Pick<Athlete, 'id'>[],
  byAthlete: ReadonlyMap<string, Availability>,
  regattaDays: readonly string[],
): AvailabilityCounts {
  let available = 0;
  let maybe = 0;
  for (const a of athletes) {
    const av = byAthlete.get(a.id);
    if (isComing(av, regattaDays)) available++;
    if (av && (av.status === 'maybe' || Object.values(av.days ?? {}).includes('maybe'))) maybe++;
  }
  return { total: athletes.length, available, maybe };
}

/** "24 of 27 available", with ", 2 maybe" when any. */
export function countText(c: AvailabilityCounts): string {
  const base = `${c.available} of ${c.total} available`;
  return c.maybe > 0 ? `${base}, ${c.maybe} maybe` : base;
}

/**
 * What one regatta looks like for one athlete, at a glance: coming every day, out every day,
 * out on some days of a multi-day regatta, or a maybe.
 */
export type CellState = 'available' | 'unavailable' | 'partial' | 'maybe';

export function cellState(av: Availability | undefined, regattaDays: readonly string[]): CellState {
  const d = draftOf(av);
  const statuses = regattaDays.length > 0 ? regattaDays.map((day) => statusOn(d, day)) : [d.status];
  if (statuses.every((s) => s === 'unavailable')) return 'unavailable';
  if (statuses.some((s) => s === 'unavailable')) return 'partial';
  if (statuses.some((s) => s === 'maybe')) return 'maybe';
  return 'available';
}

/** The regatta days the athlete is coming (available or maybe). */
export function comingDays(av: Availability | undefined, regattaDays: readonly string[]): string[] {
  const d = draftOf(av);
  return regattaDays.filter((day) => statusOn(d, day) !== 'unavailable');
}

/**
 * A checkbox click on the sheet or the roster: someone plainly coming is marked out for the
 * whole regatta (any reason stays); anyone else (out, out some days, maybe) becomes plainly
 * available, and the absence reason goes with the absence.
 */
export function toggledDraft(
  av: Availability | undefined,
  regattaDays: readonly string[],
): AvailabilityDraft {
  return cellState(av, regattaDays) === 'available'
    ? { status: 'unavailable', days: {}, reason: draftOf(av).reason }
    : { status: 'available', days: {}, reason: '' };
}

export interface SeatProblem {
  entry: Entry;
  event: RegattaEvent | null;
}

/** Entries (not scratched) where the athlete is seated on a day they are not available. */
export function seatProblems(
  av: Availability | undefined,
  entries: readonly Entry[],
  events: ReadonlyMap<string, RegattaEvent>,
): SeatProblem[] {
  if (!av) return [];
  return entries
    .filter((entry) => entry.status !== 'scratched')
    .map((entry) => ({ entry, event: entry.eventId ? (events.get(entry.eventId) ?? null) : null }))
    .filter(({ event }) => !isAvailableOn(av, event?.day));
}
