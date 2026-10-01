// Display helpers for calendar days ('YYYY-MM-DD'). Days are formatted as UTC noon so no
// timezone can move them to a neighboring date.

import type { Regatta } from '@regatta-ops/domain';
import { instantToZoned } from '@regatta-ops/domain';

function asDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });

const MONTH_DAY = fmt({ month: 'short', day: 'numeric' });
const MONTH_DAY_YEAR = fmt({ month: 'short', day: 'numeric', year: 'numeric' });
const WEEKDAY = fmt({ weekday: 'short', month: 'short', day: 'numeric' });

/** "Nov 1, 2026" (or "Nov 1" without the year). */
export function formatDay(day: string, withYear = true): string {
  return (withYear ? MONTH_DAY_YEAR : MONTH_DAY).format(asDate(day));
}

/** "Sat, May 17" for day pickers on multi-day regattas. */
export function formatWeekday(day: string): string {
  return WEEKDAY.format(asDate(day));
}

/** "Nov 1, 2026", "May 16–18, 2025", "Apr 30–May 2, 2026". */
export function formatDayRange(start: string, end: string, withYear = true): string {
  if (!end || end === start) return formatDay(start, withYear);
  const [sy, sm] = start.split('-');
  const [ey, em] = end.split('-');
  const year = withYear ? `, ${ey}` : '';
  if (sy !== ey) return `${formatDay(start)}–${formatDay(end, withYear)}`;
  if (sm === em) {
    return `${MONTH_DAY.format(asDate(start))}–${Number(end.slice(8, 10))}${year}`;
  }
  return `${MONTH_DAY.format(asDate(start))}–${MONTH_DAY.format(asDate(end))}${year}`;
}

/** Today in a timezone, as 'YYYY-MM-DD'. */
export function todayIn(timeZone = 'America/Los_Angeles', now: Date = new Date()): string {
  return instantToZoned(now.toISOString(), timeZone).day;
}

/**
 * Regattas for navigation: upcoming (not yet over) soonest first, then past ones most recent
 * first. Archived regattas are left out.
 */
export function splitRegattas(
  regattas: readonly Regatta[],
  today: string,
): { upcoming: Regatta[]; past: Regatta[] } {
  const live = regattas.filter((r) => r.status !== 'archived');
  const upcoming = live
    .filter((r) => (r.endDate || r.startDate) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = live
    .filter((r) => (r.endDate || r.startDate) < today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { upcoming, past };
}
