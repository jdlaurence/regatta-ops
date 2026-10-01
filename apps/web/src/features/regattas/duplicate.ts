// Duplicating a regatta (PLAN.md §4.1): settings, events, and participating teams are copied;
// entries, availability, load plans, and published lineups are not. Days move with the new
// start date and race times keep their wall-clock time in the regatta's timezone. Pure.

import {
  daysBetween,
  instantToZoned,
  zonedToInstant,
  type Regatta,
  type RegattaEvent,
  type RegattaTeam,
} from '@regatta-ops/domain';
import { batchOp, type BatchOp, type CreateInput } from '@/data';

const DAY_MS = 86_400_000;

function dayMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/** Whole days from `from` to `to` ('YYYY-MM-DD'); negative when `to` is earlier. */
export function dayDelta(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
}

/** The day `delta` days after `day`. */
export function shiftDay(day: string, delta: number): string {
  return new Date(dayMs(day) + delta * DAY_MS).toISOString().slice(0, 10);
}

/** The days of a regatta, first to last. */
export function regattaDays(r: Pick<Regatta, 'startDate' | 'endDate'>): string[] {
  const days = daysBetween(r.startDate, r.endDate || r.startDate);
  return days.length > 0 ? days : [r.startDate];
}

/**
 * Defaults for the duplicate form: the same weekday next year (364 days on) and, when the name
 * carries the year, the new year in its place ("2025 Head of the Lake" → "2026 Head of the
 * Lake").
 */
export function suggestDuplicate(source: Pick<Regatta, 'name' | 'startDate'>): {
  name: string;
  startDate: string;
} {
  const startDate = shiftDay(source.startDate, 364);
  const fromYear = source.startDate.slice(0, 4);
  const toYear = startDate.slice(0, 4);
  const re = new RegExp(`\\b${fromYear}\\b`);
  const name = re.test(source.name) ? source.name.replace(re, toYear) : source.name;
  return { name, startDate };
}

type WithId<T> = T & { id: string };

export interface DuplicatePlan {
  regatta: WithId<CreateInput<Regatta>>;
  events: WithId<CreateInput<RegattaEvent>>[];
  regattaTeams: WithId<CreateInput<RegattaTeam>>[];
}

/** An event copied onto the new regatta, `delta` days later, at the same wall-clock time. */
export function shiftEvent(
  event: RegattaEvent,
  ctx: { regattaId: string; delta: number; timezone: string },
): CreateInput<RegattaEvent> {
  const day = shiftDay(event.day, ctx.delta);
  const time = event.scheduledAt ? instantToZoned(event.scheduledAt, ctx.timezone).time : null;
  const copy: CreateInput<RegattaEvent> = {
    regattaId: ctx.regattaId,
    kind: event.kind,
    name: event.name,
    day,
    scheduledAt: time ? zonedToInstant(day, time, ctx.timezone) : null,
    sortOrder: event.sortOrder,
  };
  if (event.eventNumber) copy.eventNumber = event.eventNumber;
  if (event.boatClass !== undefined) copy.boatClass = event.boatClass;
  if (event.category) copy.category = event.category;
  if (event.stage !== undefined) copy.stage = event.stage;
  if (event.progressionGroup) copy.progressionGroup = event.progressionGroup;
  if (event.teamFilter && event.teamFilter.length > 0) copy.teamFilter = [...event.teamFilter];
  if (event.notes) copy.notes = event.notes;
  if (event.source) copy.source = event.source;
  return copy;
}

/** Everything a duplicate creates, with ids assigned, ready for one batch. */
export function planDuplicate(
  source: Regatta,
  events: readonly RegattaEvent[],
  regattaTeams: readonly RegattaTeam[],
  opts: { name: string; startDate: string; newId: () => string },
): DuplicatePlan {
  const id = opts.newId();
  const delta = dayDelta(source.startDate, opts.startDate);
  const regatta: WithId<CreateInput<Regatta>> = {
    id,
    name: opts.name.trim(),
    venue: source.venue,
    city: source.city,
    startDate: opts.startDate,
    endDate: shiftDay(source.endDate || source.startDate, delta),
    timezone: source.timezone,
    format: source.format,
    status: 'planning',
    settings: { ...source.settings },
  };
  if (source.notes) regatta.notes = source.notes;
  return {
    regatta,
    events: events
      .filter((e) => e.regattaId === source.id)
      .map((e) => ({
        ...shiftEvent(e, { regattaId: id, delta, timezone: source.timezone }),
        id: opts.newId(),
      })),
    regattaTeams: regattaTeams
      .filter((rt) => rt.regattaId === source.id)
      .map((rt) => {
        const copy: WithId<CreateInput<RegattaTeam>> = {
          id: opts.newId(),
          regattaId: id,
          teamId: rt.teamId,
        };
        if (rt.notes) copy.notes = rt.notes;
        return copy;
      }),
  };
}

/** PocketBase batches take at most 200 operations. */
export const BATCH_LIMIT = 200;

/** The plan as batches of at most BATCH_LIMIT writes; the regatta is always in the first. */
export function duplicateBatches(plan: DuplicatePlan): BatchOp[][] {
  const ops: BatchOp[] = [
    batchOp.create('regattas', plan.regatta),
    ...plan.regattaTeams.map((rt) => batchOp.create('regatta_teams', rt)),
    ...plan.events.map((e) => batchOp.create('events', e)),
  ];
  return chunk(ops, BATCH_LIMIT);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
