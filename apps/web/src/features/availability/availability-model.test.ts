import { describe, expect, it } from 'vitest';
import type { Availability } from '@srt/domain';
import {
  carryOver,
  copyOps,
  countAvailability,
  countText,
  draftOf,
  normalizeDraft,
  planWrite,
  statusOn,
  toggleDay,
  withStatus,
} from './availability-model';

const DAYS = ['2025-05-16', '2025-05-17', '2025-05-18'];
const ctx = { regattaId: 'regatta00000001', athleteId: 'athlete00000001', regattaDays: DAYS };

const rec = (patch: Partial<Availability> = {}): Availability => ({
  id: 'avail0000000001',
  regattaId: ctx.regattaId,
  athleteId: ctx.athleteId,
  status: 'unavailable',
  reason: '',
  ...patch,
});

describe('availability drafts', () => {
  it('reads a missing record as available', () => {
    expect(draftOf(undefined)).toEqual({ status: 'available', days: {}, reason: '' });
  });

  it('keeps only overrides that differ, and folds an override on every day into the status', () => {
    const d = normalizeDraft(
      {
        status: 'available',
        days: {
          '2025-05-16': 'available',
          '2025-05-18': 'unavailable',
          '2024-01-01': 'unavailable',
        },
        reason: '',
      },
      DAYS,
    );
    expect(d.days).toEqual({ '2025-05-18': 'unavailable' });
    const all = normalizeDraft(
      { status: 'available', days: Object.fromEntries(DAYS.map((x) => [x, 'maybe'])), reason: '' },
      DAYS,
    );
    expect(all).toEqual({ status: 'maybe', days: {}, reason: '' });
  });

  it('toggles single days and sets the whole regatta', () => {
    let d = draftOf(undefined);
    d = toggleDay(d, '2025-05-18', DAYS);
    expect(d).toMatchObject({ status: 'available', days: { '2025-05-18': 'unavailable' } });
    expect(statusOn(d, '2025-05-18')).toBe('unavailable');
    d = toggleDay(d, '2025-05-16', DAYS);
    d = toggleDay(d, '2025-05-17', DAYS);
    expect(d).toMatchObject({ status: 'unavailable', days: {} });
    d = toggleDay(d, '2025-05-17', DAYS);
    expect(d).toMatchObject({ status: 'unavailable', days: { '2025-05-17': 'available' } });
    expect(withStatus(d, 'available', DAYS)).toMatchObject({ status: 'available', days: {} });
  });
});

describe('planWrite', () => {
  it('creates a record only when needed', () => {
    expect(planWrite(undefined, draftOf(undefined), ctx)).toBeNull();
    expect(planWrite(undefined, { status: 'maybe', days: {}, reason: ' Exam ' }, ctx)).toEqual({
      op: 'create',
      collection: 'availability',
      data: {
        regattaId: ctx.regattaId,
        athleteId: ctx.athleteId,
        status: 'maybe',
        days: null,
        reason: 'Exam',
      },
    });
  });

  it('updates a changed record, leaves a matching one, and deletes when plainly available', () => {
    const r = rec({ reason: 'Sick' });
    expect(planWrite(r, draftOf(r), ctx)).toBeNull();
    expect(planWrite(r, { ...draftOf(r), status: 'maybe' }, ctx)).toEqual({
      op: 'update',
      collection: 'availability',
      id: r.id,
      patch: { status: 'maybe', days: null, reason: 'Sick' },
    });
    // Available with a reason still needs the record for the reason.
    expect(planWrite(r, { ...draftOf(r), status: 'available' }, ctx)?.op).toBe('update');
    expect(planWrite(r, { status: 'available', days: {}, reason: '' }, ctx)).toEqual({
      op: 'delete',
      collection: 'availability',
      id: r.id,
    });
  });
});

describe('copying availability', () => {
  it('moves per-day choices by position', () => {
    const source = rec({ status: 'available', days: { '2025-05-18': 'unavailable' } });
    expect(carryOver(source, DAYS, ['2026-05-15', '2026-05-16', '2026-05-17'])).toMatchObject({
      status: 'available',
      days: { '2026-05-17': 'unavailable' },
    });
    // A one-day target keeps only day 1.
    expect(carryOver(source, DAYS, ['2026-11-01'])).toMatchObject({
      status: 'available',
      days: {},
    });
  });

  it('makes the target match the source for the listed athletes', () => {
    const athletes = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const target = new Map([
      ['a1', rec({ id: 't1', athleteId: 'a1', status: 'unavailable' })],
      ['a2', rec({ id: 't2', athleteId: 'a2', status: 'maybe', reason: 'Exam' })],
    ]);
    const source = new Map([
      ['a2', rec({ id: 's2', athleteId: 'a2', status: 'maybe', reason: 'Exam' })],
      ['a3', rec({ id: 's3', athleteId: 'a3', status: 'unavailable', reason: 'Away' })],
    ]);
    const ops = copyOps(athletes, target, source, {
      regattaId: ctx.regattaId,
      sourceDays: ['2025-05-16'],
      targetDays: ['2026-11-01'],
    });
    expect(
      ops.map((o) => `${o.op}:${o.op === 'create' ? (o.data as Availability).athleteId : o.id}`),
    ).toEqual(['delete:t1', 'create:a3']);
  });

  it('counts athletes coming on some day, maybe included', () => {
    const byAthlete = new Map([
      ['a1', rec({ athleteId: 'a1', status: 'unavailable' })],
      ['a2', rec({ athleteId: 'a2', status: 'maybe' })],
      ['a3', rec({ athleteId: 'a3', status: 'available', days: { '2025-05-16': 'unavailable' } })],
    ]);
    const c = countAvailability(
      [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }],
      byAthlete,
      DAYS,
    );
    expect(c).toEqual({ total: 4, available: 3, maybe: 1 });
    expect(countText(c)).toBe('3 of 4 available, 1 maybe');
  });
});
