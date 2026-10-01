// Deterministic greedy crew assignment for seeded entries.
//
// Hard rules (a seat stays empty when nobody passes them): the athlete is active, on the entry's
// team, available that day, not already in the entry, fits the seat (coxswains cox, dedicated
// coxswains never row, sweep seats match side or 'both', scull seats need can_scull), fits the
// event (novice-only, junior age limit, masters gender or mixed balance), races at most the daily
// cap, and has at least 15 minutes from landing to the next start (the conflict engine's athlete
// gap), so nobody is ever double-booked. With `strictGaps` the gap must reach the regatta's
// athlete minimum, so the engine raises no athlete finding at all.
//
// Soft preferences (the score): races at least the athlete minimum gap apart (about an hour at a
// sprint regatta), exact side over 'both', dedicated coxswains in cox seats, experienced athletes
// where the event prefers them, fewer races that day and overall, plus a small seeded jitter so
// crews vary. A crew that races a time trial and then a final (same reuseKey) keeps its seats
// when the rules allow. A repair pass then fills an empty seat by moving a crew member into it
// and finding someone for the seat they left (fixes side and gender dead ends).

import {
  boatClassSpec,
  seatSide,
  seatsFor,
  type Athlete,
  type AthleteLevel,
  type BoatClass,
  type Id,
  type Seat,
  type Side,
} from '@regatta-ops/domain';
import type { Rng } from './prng';

export interface Eligibility {
  /** Required level for rowers (novice events). */
  level?: AthleteLevel;
  /** Rowers must be experienced (varsity events). */
  experiencedOnly?: boolean;
  /** Prefer experienced rowers. */
  preferExperienced?: boolean;
  /** Junior age limit: seasonYear - birthYear <= maxAge, for everyone including the cox. */
  maxAge?: number;
  /** Masters single-gender events: rowers of this gender. */
  gender?: 'M' | 'F';
  /** Mixed events: half the rowers of each gender. */
  mixed?: boolean;
}

export interface CrewRequest {
  entryId: Id;
  teamId: Id;
  cls: BoatClass;
  day: string;
  /** Epoch ms of the race, or null when unscheduled. */
  atMs: number | null;
  seatSides?: Partial<Record<Seat, Side>> | null;
  rule: Eligibility;
  /** Entries with the same key (a time trial and its final) keep the same crew when possible. */
  reuseKey?: string;
}

export interface CrewContext {
  athletes: readonly Athlete[];
  seasonYear: number;
  /** Race duration + return, minutes: closer than this, one athlete would be in two boats. */
  busyMin: number;
  /** The regatta's athlete minimum gap (ATHLETE_TIGHT below it). */
  athleteMinGapMin: number;
  /** When true, never seat an athlete where the engine would warn (ATHLETE_TIGHT). */
  strictGaps: boolean;
  maxRacesPerDay: number;
  /** Cap for dedicated coxswains, who can take more races than rowers. */
  maxCoxRacesPerDay: number;
  isUnavailable: (athleteId: Id, day: string) => boolean;
  rng: Rng;
}

export type Crew = Map<Seat, Id | null>;

interface Booking {
  entryId: Id;
  day: string;
  atMs: number | null;
}

const MINUTE = 60_000;
/** Without strictGaps: the smallest athlete gap (landing to next start) the greedy accepts. */
const RELAXED_FLOOR_MIN = 15;

/** Seats in fill order: cox first, then stroke down to bow. */
function fillOrder(cls: BoatClass): Seat[] {
  const seats = seatsFor(cls);
  const rowing = seats.filter((s) => s !== 'cox').reverse();
  return seats.includes('cox') ? ['cox', ...rowing] : rowing;
}

export function assignCrews(requests: readonly CrewRequest[], ctx: CrewContext): Map<Id, Crew> {
  const bookings = new Map<Id, Booking[]>();
  const reuse = new Map<string, Crew>();
  const result = new Map<Id, Crew>();
  const byId = new Map(ctx.athletes.map((a) => [a.id, a]));
  const hardGapMs =
    (ctx.busyMin + (ctx.strictGaps ? ctx.athleteMinGapMin : RELAXED_FLOOR_MIN)) * MINUTE;
  const softGapMs = (ctx.busyMin + ctx.athleteMinGapMin) * MINUTE;

  const pending = new Set(requests);
  const teamAthletes = new Map<Id, Athlete[]>();
  for (const a of ctx.athletes) {
    if (a.status !== 'active') continue;
    teamAthletes.set(a.teamId, [...(teamAthletes.get(a.teamId) ?? []), a]);
  }

  const age = (a: Athlete) => ctx.seasonYear - (a.birthYear ?? ctx.seasonYear - 30);
  const sameDay = (a: Athlete, day: string) =>
    (bookings.get(a.id) ?? []).filter((b) => b.day === day);

  /** The event-level rules only (no seat, crew, or time checks). */
  function fitsRule(a: Athlete, rule: Eligibility, cox: boolean): boolean {
    if (rule.maxAge != null && age(a) > rule.maxAge) return false;
    if (cox) return a.canCox;
    if (a.side === 'none') return false;
    if (rule.level && a.level !== rule.level) return false;
    if (rule.experiencedOnly && a.level !== 'experienced') return false;
    if (rule.gender && a.gender !== rule.gender) return false;
    return true;
  }

  function eligible(a: Athlete, req: CrewRequest, seat: Seat, crew: Crew): boolean {
    if (a.status !== 'active' || a.teamId !== req.teamId) return false;
    if (ctx.isUnavailable(a.id, req.day)) return false;
    if ([...crew.values()].includes(a.id)) return false;
    const spec = boatClassSpec(req.cls);
    const rule = req.rule;
    if (rule.maxAge != null && age(a) > rule.maxAge) return false;
    if (seat === 'cox') {
      if (!a.canCox) return false;
    } else {
      if (a.side === 'none') return false; // dedicated coxswains do not row
      if (spec.rigging === 'scull') {
        if (!a.canScull) return false;
      } else {
        const side = seatSide(req.cls, seat, req.seatSides);
        if (a.side !== 'both' && a.side !== side) return false;
      }
      if (rule.level && a.level !== rule.level) return false;
      if (rule.experiencedOnly && a.level !== 'experienced') return false;
      if (rule.gender && a.gender !== rule.gender) return false;
      if (rule.mixed) {
        const sameGender = [...crew.entries()].filter(
          ([s, id]) => s !== 'cox' && id && byId.get(id)?.gender === a.gender,
        ).length;
        if (sameGender >= spec.rowers / 2) return false;
      }
    }
    const mine = sameDay(a, req.day);
    const cap = a.side === 'none' ? ctx.maxCoxRacesPerDay : ctx.maxRacesPerDay;
    if (mine.length >= cap) return false;
    if (req.atMs != null) {
      for (const b of mine) {
        if (b.atMs != null && Math.abs(b.atMs - req.atMs) < hardGapMs) return false;
      }
    }
    return true;
  }

  function score(a: Athlete, req: CrewRequest, seat: Seat): number {
    let s = 0;
    const spec = boatClassSpec(req.cls);
    if (seat === 'cox') {
      if (a.side === 'none') s += 6;
    } else {
      const rule = req.rule;
      if (spec.rigging === 'sweep') s += a.side === 'both' ? 1 : 3;
      if ((rule.preferExperienced || rule.experiencedOnly) && a.level === 'experienced') s += 3;
      // Open events leave novices for the novice races.
      if (!rule.level && (rule.maxAge ?? 99) >= 18 && a.level === 'novice') s -= 2;
    }
    // Scarcity: an athlete who could also fill a still-empty race close to this one is worth
    // saving for it (the 2V8 takes the oldest so the U17 eight can use the rest, and so on).
    const all = bookings.get(a.id) ?? [];
    const today = sameDay(a, req.day);
    const near = (t: number, within: number) =>
      today.some((b) => b.atMs != null && Math.abs(b.atMs - t) < within);
    if (req.atMs != null) {
      for (const other of pending) {
        if (other === req || other.day !== req.day || other.teamId !== req.teamId) continue;
        if (other.atMs == null || Math.abs(other.atMs - req.atMs) >= softGapMs) continue;
        // Only races the athlete could still take without a tight turnaround.
        if (near(other.atMs, softGapMs)) continue;
        if (fitsRule(a, other.rule, seat === 'cox')) s -= 2;
      }
    }
    s -= 2 * today.length;
    s -= 0.5 * all.length;
    if (req.atMs != null && today.length > 0) {
      if (near(req.atMs, softGapMs)) s -= 20;
      else if (near(req.atMs, 90 * MINUTE)) s -= 1;
    }
    return s + ctx.rng.next() * 1.5;
  }

  function best(req: CrewRequest, seat: Seat, crew: Crew, except?: Id): Athlete | null {
    let pick: Athlete | null = null;
    let top = -Infinity;
    for (const a of teamAthletes.get(req.teamId) ?? []) {
      if (a.id === except || !eligible(a, req, seat, crew)) continue;
      const sc = score(a, req, seat);
      if (sc > top) {
        pick = a;
        top = sc;
      }
    }
    return pick;
  }

  /** Move a crew member into the empty seat when someone else can take theirs. */
  function moveIn(req: CrewRequest, crew: Crew, empty: Seat): boolean {
    for (const [from, id] of crew) {
      if (!id || from === empty) continue;
      const mover = byId.get(id)!;
      crew.set(from, null);
      if (eligible(mover, req, empty, crew)) {
        crew.set(empty, mover.id);
        const filler = best(req, from, crew, mover.id);
        if (filler) {
          crew.set(from, filler.id);
          return true;
        }
        crew.set(empty, null);
      }
      crew.set(from, mover.id);
    }
    return false;
  }

  /** Swap a crew member for someone outside the crew when that lets someone fill the empty seat
   * (a mixed crew that ran out of one gender's slots on the wrong side). */
  function swapOut(req: CrewRequest, crew: Crew, empty: Seat): boolean {
    for (const [seat, id] of crew) {
      if (!id || seat === empty) continue;
      crew.set(seat, null);
      for (const sub of teamAthletes.get(req.teamId) ?? []) {
        if (sub.id === id || !eligible(sub, req, seat, crew)) continue;
        crew.set(seat, sub.id);
        const filler = best(req, empty, crew, id);
        if (filler) {
          crew.set(empty, filler.id);
          return true;
        }
        crew.set(seat, null);
      }
      crew.set(seat, id);
    }
    return false;
  }

  function repair(req: CrewRequest, crew: Crew): void {
    for (const empty of fillOrder(req.cls)) {
      if (!crew.get(empty) && !moveIn(req, crew, empty)) swapOut(req, crew, empty);
    }
  }

  for (const req of requests) {
    pending.delete(req);
    const crew: Crew = new Map();
    const seats = fillOrder(req.cls);
    for (const seat of seats) crew.set(seat, null);
    const previous = req.reuseKey ? reuse.get(req.reuseKey) : undefined;
    if (previous) {
      for (const seat of seats) {
        const id = previous.get(seat);
        const a = id ? byId.get(id) : undefined;
        if (a && eligible(a, req, seat, crew)) crew.set(seat, a.id);
      }
    }
    for (const seat of seats) {
      if (crew.get(seat)) continue;
      crew.set(seat, best(req, seat, crew)?.id ?? null);
    }
    repair(req, crew);
    for (const id of crew.values()) {
      if (!id) continue;
      const list = bookings.get(id) ?? [];
      list.push({ entryId: req.entryId, day: req.day, atMs: req.atMs });
      bookings.set(id, list);
    }
    if (req.reuseKey && !previous) reuse.set(req.reuseKey, crew);
    result.set(req.entryId, crew);
  }
  return result;
}
