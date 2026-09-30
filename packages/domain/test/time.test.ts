import { describe, expect, it } from 'vitest';
import {
  addMinutes,
  clockAt,
  daysBetween,
  formatClock,
  instantToZoned,
  minutesBetween,
  zonedToInstant,
} from '../src';

const LA = 'America/Los_Angeles';

describe('time', () => {
  it('converts LA wall time to UTC in summer and winter', () => {
    expect(zonedToInstant('2025-05-16', '08:00', LA)).toBe('2025-05-16T15:00:00.000Z');
    expect(zonedToInstant('2026-11-01', '08:00', LA)).toBe('2026-11-01T16:00:00.000Z');
  });
  it('round-trips', () => {
    const iso = zonedToInstant('2025-05-17', '13:04', LA);
    expect(instantToZoned(iso, LA)).toEqual({ day: '2025-05-17', time: '13:04' });
  });
  it('minutes and add', () => {
    const a = zonedToInstant('2025-05-16', '08:16', LA);
    const b = zonedToInstant('2025-05-16', '09:52', LA);
    expect(minutesBetween(a, b)).toBe(96);
    expect(addMinutes(a, 96)).toBe(b);
  });
  it('formats clocks', () => {
    expect(formatClock('08:16')).toBe('8:16');
    expect(formatClock('13:04', true)).toBe('1:04 PM');
    expect(formatClock('00:05', true)).toBe('12:05 AM');
    expect(clockAt('2025-05-16T16:52:00.000Z', LA)).toBe('9:52');
  });
  it('lists days inclusive', () => {
    expect(daysBetween('2025-05-16', '2025-05-18')).toEqual([
      '2025-05-16',
      '2025-05-17',
      '2025-05-18',
    ]);
    expect(daysBetween('bad', '2025-05-18')).toEqual([]);
  });
  it('rejects invalid input', () => {
    expect(() => minutesBetween('nope', '2025-01-01T00:00:00Z')).toThrow();
    expect(() => zonedToInstant('2025-05-16', 'xx', LA)).toThrow();
  });
});
