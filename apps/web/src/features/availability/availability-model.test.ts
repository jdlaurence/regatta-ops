import { describe, expect, it } from 'vitest';
import type { Availability, Entry, RegattaEvent } from '@regatta-ops/domain';
import {
  cellState,
  comingDays,
  countAvailability,
  countText,
  draftOf,
  normalizeDraft,
  planWrite,
  seatProblems,
  statusOn,
  toggledDraft,
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

describe('the availability sheet', () => {
  it('reads each cell as coming, out, out some days, or maybe', () => {
    expect(cellState(undefined, DAYS)).toBe('available');
    expect(cellState(rec({ status: 'unavailable' }), DAYS)).toBe('unavailable');
    expect(cellState(rec({ status: 'maybe' }), DAYS)).toBe('maybe');
    const sundayOut = rec({ status: 'available', days: { '2025-05-18': 'unavailable' } });
    expect(cellState(sundayOut, DAYS)).toBe('partial');
    expect(comingDays(sundayOut, DAYS)).toEqual(['2025-05-16', '2025-05-17']);
    // Out on every day by override is out.
    const allDays = rec({
      status: 'available',
      days: Object.fromEntries(DAYS.map((d) => [d, 'unavailable' as const])),
    });
    expect(cellState(allDays, DAYS)).toBe('unavailable');
    // An available record kept only for its reason is still coming.
    expect(cellState(rec({ status: 'available', reason: 'Late' }), ['2026-11-01'])).toBe(
      'available',
    );
  });

  it('toggles coming to out for the whole regatta, and anything else back to plainly coming', () => {
    expect(toggledDraft(undefined, DAYS)).toEqual({ status: 'unavailable', days: {}, reason: '' });
    expect(toggledDraft(rec({ status: 'available', reason: 'Late' }), DAYS)).toEqual({
      status: 'unavailable',
      days: {},
      reason: 'Late',
    });
    for (const r of [
      rec({ status: 'unavailable', reason: 'Trip' }),
      rec({ status: 'maybe' }),
      rec({ status: 'available', days: { '2025-05-18': 'unavailable' } }),
    ]) {
      expect(toggledDraft(r, DAYS)).toEqual({ status: 'available', days: {}, reason: '' });
      // Plainly available needs no record: the write deletes it.
      expect(planWrite(r, toggledDraft(r, DAYS), ctx)).toEqual({
        op: 'delete',
        collection: 'availability',
        id: r.id,
      });
    }
  });

  it('finds seats on days the athlete is out, skipping scratched entries', () => {
    const entry = (id: string, eventId: string | null, status: Entry['status'] = 'planned') =>
      ({ id, eventId, status }) as Entry;
    const events = new Map([
      ['sat', { id: 'sat', day: '2025-05-17' } as RegattaEvent],
      ['sun', { id: 'sun', day: '2025-05-18' } as RegattaEvent],
    ]);
    const entries = [
      entry('e1', 'sat'),
      entry('e2', 'sun'),
      entry('e3', 'sun', 'scratched'),
      entry('e4', null),
    ];
    const sundayOut = rec({ status: 'available', days: { '2025-05-18': 'unavailable' } });
    expect(seatProblems(sundayOut, entries, events).map((p) => p.entry.id)).toEqual(['e2']);
    expect(seatProblems(rec(), entries, events).map((p) => p.entry.id)).toEqual(['e1', 'e2', 'e4']);
    expect(seatProblems(undefined, entries, events)).toEqual([]);
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
