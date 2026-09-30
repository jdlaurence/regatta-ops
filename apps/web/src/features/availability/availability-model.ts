// Availability rules (PLAN.md §4.2, §8.1): absence of a record means available, so a record
// exists only while an athlete is not plainly available (a status other than available, a
// per-day override, or a reason). `days[day]` overrides the regatta-wide status on that day.
// Pure; the page turns drafts into batch writes.

import { isComing, type Athlete, type Availability, type AvailabilityStatus } from '@srt/domain';
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

/**
 * The draft for another regatta's record, with per-day overrides moved by position (day 1 to
 * day 1). Overrides for days the target does not have are dropped.
 */
export function carryOver(
  source: Availability | undefined,
  sourceDays: readonly string[],
  targetDays: readonly string[],
): AvailabilityDraft {
  const d = draftOf(source);
  const days: Record<string, AvailabilityStatus> = {};
  sourceDays.forEach((day, i) => {
    const v = d.days[day];
    const target = targetDays[i];
    if (v && target) days[target] = v;
  });
  return normalizeDraft({ ...d, days }, targetDays);
}

export interface AvailabilityCounts {
  total: number;
  /** Coming on at least one day ('maybe' counts, PLAN.md §18 item 5). */
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
 * Writes that make this regatta's availability match another's for these athletes: the
 * source's status, reason, and per-day choices (by position); athletes with no source record
 * become available here.
 */
export function copyOps(
  athletes: readonly Pick<Athlete, 'id'>[],
  target: ReadonlyMap<string, Availability>,
  source: ReadonlyMap<string, Availability>,
  ctx: { regattaId: string; sourceDays: readonly string[]; targetDays: readonly string[] },
): BatchOp[] {
  const ops: BatchOp[] = [];
  for (const a of athletes) {
    const draft = carryOver(source.get(a.id), ctx.sourceDays, ctx.targetDays);
    const op = planWrite(target.get(a.id), draft, {
      regattaId: ctx.regattaId,
      athleteId: a.id,
      regattaDays: ctx.targetDays,
    });
    if (op) ops.push(op);
  }
  return ops;
}
