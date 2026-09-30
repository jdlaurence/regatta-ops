// Display names and sentence pieces for findings. Messages are complete sentences with names,
// never ids (PLAN.md §9.2), with times in the regatta zone.

import { athleteName, shellLabel } from '../format';
import type { Athlete, BoatClass, Entry, OarSet, RegattaEvent, Shell } from '../types';
import type { Ctx } from './context';

/** "Girls V8": the team's short name and the entry label. */
export function entryName(ctx: Ctx, entry: Entry): string {
  const team = ctx.teamById.get(entry.teamId);
  const teamPart = team ? team.shortName || team.name : '';
  const label = entry.label.trim() || entry.boatClass;
  return `${teamPart} ${label}`.trim();
}

/** "Event 14 (Men's Junior 4+)", or the name alone when there is no number. */
export function eventName(event: RegattaEvent): string {
  return event.eventNumber ? `Event ${event.eventNumber} (${event.name})` : event.name;
}

export function shellName(shell: Shell): string {
  return shellLabel(shell);
}

export function oarSetName(oars: OarSet): string {
  return `Oar set ${oars.name}`;
}

export function personName(athlete: Athlete | undefined): string {
  return athlete ? athleteName(athlete) : 'An athlete';
}

/** Article for a boat class as spoken: "an 8+" (an eight), "a 4x+". */
export function withArticle(cls: BoatClass): string {
  return cls === '8+' ? `an ${cls}` : `a ${cls}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "A", "A and B", "A, B, and C". */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** '2025-05-17' → 'May 17'. */
export function dayName(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : day;
}

/**
 * The gap clause for equipment pairs, where `gap` is minutes from the equipment landing to the
 * next race start. `thing` is 'boat' or 'oars'.
 */
export function equipmentGapClause(gap: number, thing: 'boat' | 'oars'): string {
  const isAre = thing === 'boat' ? 'is' : 'are';
  const lands = thing === 'boat' ? 'lands' : 'land';
  if (gap < 0)
    return `the ${thing} ${isAre} not back until ${plural(-gap, 'minute')} after that race starts`;
  if (gap === 0) return `the ${thing} ${lands} just as that race starts`;
  return `only ${plural(gap, 'minute')} between the ${thing} landing and the next race`;
}
