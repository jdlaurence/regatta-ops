// Lookup maps and busy windows shared by the conflict checks (PLAN.md §9.2).

import { starboardRigSides } from '../boat-classes';
import { clockAt, toMs } from '../time';
import type {
  Athlete,
  Availability,
  Entry,
  EntrySeat,
  Id,
  OarSet,
  RegattaEvent,
  Seat,
  Shell,
  Side,
  Team,
} from '../types';
import type { ConflictInput } from './types';

const MINUTE = 60_000;

/** A non-scratched entry whose event has a time: the only entries that take part in time checks. */
export interface ScheduledEntry {
  entry: Entry;
  event: RegattaEvent;
  /** ISO instant of the race start (T). */
  at: string;
  /** T in epoch ms. */
  t: number;
  day: string;
  /** T − launchLeadMin, ms. */
  busyStart: number;
  /** T + raceDurationMin, ms. */
  raceEnd: number;
  /** raceEnd + returnMin, ms. */
  busyEnd: number;
}

export interface Ctx {
  input: ConflictInput;
  /** Non-scratched entries in input order. Scratched entries produce no findings at all. */
  entries: Entry[];
  entryById: Map<Id, Entry>;
  eventById: Map<Id, RegattaEvent>;
  shellById: Map<Id, Shell>;
  oarSetById: Map<Id, OarSet>;
  athleteById: Map<Id, Athlete>;
  teamById: Map<Id, Team>;
  seatsByEntry: Map<Id, EntrySeat[]>;
  availabilityByAthlete: Map<Id, Availability>;
  scheduled: Map<Id, ScheduledEntry>;
}

function byId<T extends { id: Id }>(rows: readonly T[]): Map<Id, T> {
  const m = new Map<Id, T>();
  for (const r of rows) m.set(r.id, r);
  return m;
}

export function buildContext(input: ConflictInput): Ctx {
  const { settings } = input;
  const eventById = byId(input.events);
  const entries = input.entries.filter((e) => e.status !== 'scratched');
  const seatsByEntry = new Map<Id, EntrySeat[]>();
  for (const s of input.seats) {
    const list = seatsByEntry.get(s.entryId);
    if (list) list.push(s);
    else seatsByEntry.set(s.entryId, [s]);
  }
  const availabilityByAthlete = new Map<Id, Availability>();
  for (const a of input.availability) availabilityByAthlete.set(a.athleteId, a);

  const scheduled = new Map<Id, ScheduledEntry>();
  for (const entry of entries) {
    const event = entry.eventId ? eventById.get(entry.eventId) : undefined;
    if (!event?.scheduledAt) continue;
    const t = toMs(event.scheduledAt);
    const raceEnd = t + settings.raceDurationMin * MINUTE;
    scheduled.set(entry.id, {
      entry,
      event,
      at: event.scheduledAt,
      t,
      day: event.day,
      busyStart: t - settings.launchLeadMin * MINUTE,
      raceEnd,
      busyEnd: raceEnd + settings.returnMin * MINUTE,
    });
  }

  return {
    input,
    entries,
    entryById: byId(entries),
    eventById,
    shellById: byId(input.shells),
    oarSetById: byId(input.oarSets),
    athleteById: byId(input.athletes),
    teamById: byId(input.teams),
    seatsByEntry,
    availabilityByAthlete,
    scheduled,
  };
}

export function msToMinutes(ms: number): number {
  return Math.round(ms / MINUTE);
}

export const MINUTE_MS = MINUTE;

/** The entry's event, when it has one that exists in the input. */
export function eventOf(ctx: Ctx, entry: Entry): RegattaEvent | undefined {
  return entry.eventId ? ctx.eventById.get(entry.eventId) : undefined;
}

/** The shell the entry uses, when it is set and exists in the input. */
export function shellOf(ctx: Ctx, entry: Entry): Shell | undefined {
  return entry.shellId ? ctx.shellById.get(entry.shellId) : undefined;
}

/** The oar set the entry uses, when it is set and exists in the input. */
export function oarSetOf(ctx: Ctx, entry: Entry): OarSet | undefined {
  return entry.oarSetId ? ctx.oarSetById.get(entry.oarSetId) : undefined;
}

/** Wall time of an instant in the regatta zone: '9:52'. */
export function clock(ctx: Ctx, iso: string): string {
  return clockAt(iso, ctx.input.timezone);
}

// ---------------------------------------------------------------------------
// Availability (PLAN.md §4.2): absence of a record means available; `days[day]` overrides the
// regatta-wide status for multi-day regattas. 'maybe' counts as available (no error).

/** Whether the athlete is available on `day` (or for the regatta when no day is known). */
export function isAvailableOn(av: Availability | undefined, day?: string): boolean {
  if (!av) return true;
  const dayStatus = day ? av.days?.[day] : undefined;
  return (dayStatus ?? av.status) !== 'unavailable';
}

/** True when the unavailability comes from a per-day override rather than the regatta status. */
export function isDaySpecific(av: Availability, day?: string): boolean {
  return !!day && av.days?.[day] != null;
}

/**
 * Whether the athlete is coming on at least one day of the regatta. `days` are the regatta's
 * days (from its events); per-day overrides are considered too.
 */
export function isComing(av: Availability | undefined, days: readonly string[]): boolean {
  if (!av) return true;
  const all = new Set<string>(days);
  for (const d of Object.keys(av.days ?? {})) all.add(d);
  if (all.size === 0) return av.status !== 'unavailable';
  for (const d of all) if (isAvailableOn(av, d)) return true;
  return false;
}

/**
 * Effective seat sides for an entry: the entry's own override, else the shell's rig (a
 * starboard-stroke shell flips every standard side, PLAN.md §4.7), else the standard rig.
 * The UI should use the same helper so what the strip shows matches SIDE_MISMATCH.
 */
export function entrySeatSides(
  entry: Pick<Entry, 'boatClass' | 'seatSides'>,
  shell?: Pick<Shell, 'strokeSide'> | null,
): Partial<Record<Seat, Side>> | null {
  if (entry.seatSides && Object.keys(entry.seatSides).length > 0) return entry.seatSides;
  if (shell?.strokeSide === 'starboard') return starboardRigSides(entry.boatClass);
  return null;
}
