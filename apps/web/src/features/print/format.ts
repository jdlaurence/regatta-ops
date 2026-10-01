// Text for print views: times in the regatta zone, stages, seats, and the "what is printed"
// line. Pure, so the derivations and tests can share it.

import {
  clockAt,
  instantToZoned,
  oarSetLabel,
  seatsFor,
  type BoatClass,
  type EventStage,
  type OarSet,
  type PublishedEntry,
  type Seat,
} from '@regatta-ops/domain';
import { formatDay, formatWeekday } from '@/lib/dates';

export const STAGE_ORDER: EventStage[] = ['time_trial', 'heat', 'semi', 'final', 'race'];

const STAGE_TEXT: Record<EventStage, string> = {
  time_trial: 'Time trial',
  heat: 'Heat',
  semi: 'Semifinal',
  final: 'Final',
  race: 'Race',
};

export function stageText(stage: EventStage | null | undefined): string {
  return stage ? STAGE_TEXT[stage] : '';
}

/** "8:00 AM" in the regatta zone, or "TBD" when there is no time. */
export function timeText(iso: string | null | undefined, timeZone: string): string {
  return iso ? clockAt(iso, timeZone, true) : 'TBD';
}

/** "Fri 8:00 AM" on multi-day regattas, "8:00 AM" otherwise. */
export function dayTimeText(
  entry: Pick<PublishedEntry, 'day' | 'scheduledAt'>,
  timeZone: string,
  withDay: boolean,
): string {
  const time = timeText(entry.scheduledAt, timeZone);
  if (!withDay || !entry.day) return time;
  return `${formatWeekday(entry.day).split(',')[0]} ${time}`;
}

/** "Fri, May 16" for a day, or "Unscheduled" for entries without an event. */
export function dayHeading(day: string | null): string {
  return day ? formatWeekday(day) : 'Unscheduled';
}

/** "Tue, May 13, 9:00 PM" in the regatta zone. */
export function instantText(iso: string, timeZone: string): string {
  const { day } = instantToZoned(iso, timeZone);
  return `${formatWeekday(day)}, ${clockAt(iso, timeZone, true)}`;
}

/** "Nov 1, 2026, 3:12 PM" for the printed-at stamp. */
export function printedText(iso: string, timeZone: string): string {
  const { day } = instantToZoned(iso, timeZone);
  return `${formatDay(day)}, ${clockAt(iso, timeZone, true)}`;
}

/** "Event 14 Men's Junior 4+", or the name alone. */
export function eventText(entry: Pick<PublishedEntry, 'eventNumber' | 'eventName'>): string {
  if (!entry.eventName) return 'No event';
  return entry.eventNumber ? `Event ${entry.eventNumber} ${entry.eventName}` : entry.eventName;
}

/** The oar set as printed: the published name with the live color code ("24-C · yellow-white"). */
export function oarText(
  entry: Pick<PublishedEntry, 'oarSetId' | 'oarSetName'>,
  oarSets: ReadonlyMap<string, OarSet>,
): string {
  if (!entry.oarSetId) return '';
  const live = oarSets.get(entry.oarSetId);
  const name = entry.oarSetName ?? live?.name ?? 'Oar set';
  return oarSetLabel({ name, color: live?.color });
}

/** "Cox", "8", ..., "1": row labels on the grid and the names list. */
export function seatText(seat: Seat): string {
  return seat === 'cox' ? 'Cox' : seat;
}

/**
 * The seats of a class with the cox first, then stroke down to bow: how the club's printed
 * sheets read (PLAN.md §4.4).
 */
export function paperSeatOrder(boatClass: BoatClass): Seat[] {
  const seats = seatsFor(boatClass);
  const rowing = seats.filter((s) => s !== 'cox').reverse();
  return seats.includes('cox') ? ['cox', ...rowing] : rowing;
}

/** "Ava C." from "Ava Chen": first name and last initial, for tight boat strips. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  return `${parts.slice(0, -1).join(' ')} ${parts[parts.length - 1]![0]}.`;
}
