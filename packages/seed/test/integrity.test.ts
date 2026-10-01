// Referential integrity of the seed world: every relation resolves and the unique indexes of
// PLAN.md §8.1 hold.

import { describe, expect, it } from 'vitest';
import { COLLECTION_NAMES, seatsFor, type CollectionName, type Id } from '@regatta-ops/domain';
import { buildSeedWorld } from '../src';

const { world } = buildSeedWorld();

const idsOf = (name: CollectionName) => new Set(world[name].map((r) => r.id));

type Rel = [from: CollectionName, field: string, to: CollectionName, optional?: 'optional'];

const RELATIONS: Rel[] = [
  ['users', 'defaultTeamId', 'teams', 'optional'],
  ['athletes', 'teamId', 'teams'],
  ['regattas', 'createdBy', 'users', 'optional'],
  ['regatta_teams', 'regattaId', 'regattas'],
  ['regatta_teams', 'teamId', 'teams'],
  ['availability', 'regattaId', 'regattas'],
  ['availability', 'athleteId', 'athletes'],
  ['availability', 'updatedBy', 'users', 'optional'],
  ['events', 'regattaId', 'regattas'],
  ['entries', 'regattaId', 'regattas'],
  ['entries', 'eventId', 'events', 'optional'],
  ['entries', 'teamId', 'teams'],
  ['entries', 'shellId', 'shells', 'optional'],
  ['entries', 'oarSetId', 'oar_sets', 'optional'],
  ['entries', 'coachId', 'users', 'optional'],
  ['entries', 'hotSeatAckBy', 'users', 'optional'],
  ['entries', 'createdBy', 'users', 'optional'],
  ['entries', 'updatedBy', 'users', 'optional'],
  ['entry_seats', 'entryId', 'entries'],
  ['entry_seats', 'athleteId', 'athletes', 'optional'],
  ['shells', 'homeTeamId', 'teams', 'optional'],
  ['oar_sets', 'homeTeamId', 'teams', 'optional'],
  ['trailer_shelves', 'trailerId', 'trailers'],
  ['trailer_compartments', 'trailerId', 'trailers'],
  ['load_plans', 'regattaId', 'regattas'],
  ['load_plans', 'trailerId', 'trailers'],
  ['load_placements', 'loadPlanId', 'load_plans'],
  ['load_placements', 'shellId', 'shells'],
  ['load_placements', 'shelfId', 'trailer_shelves'],
  ['load_items', 'regattaId', 'regattas'],
  ['load_items', 'loadPlanId', 'load_plans', 'optional'],
  ['load_items', 'loadedBy', 'users', 'optional'],
  ['load_items', 'returnedBy', 'users', 'optional'],
  ['comments', 'authorId', 'users'],
  ['activity_log', 'regattaId', 'regattas', 'optional'],
  ['activity_log', 'actorId', 'users', 'optional'],
];

function unique<T>(rows: T[], key: (r: T) => string): boolean {
  const keys = rows.map(key);
  return new Set(keys).size === keys.length;
}

describe('referential integrity', () => {
  it.each(RELATIONS)('%s.%s resolves to %s', (from, field, to, optional) => {
    const targets = idsOf(to);
    for (const r of world[from] as unknown as Record<string, unknown>[]) {
      const v = r[field];
      if (v == null || v === '') {
        expect(optional, `${from} ${String(r.id)} has no ${field}`).toBe('optional');
        continue;
      }
      expect(targets.has(v as Id), `${from} ${String(r.id)}.${field} = ${String(v)}`).toBe(true);
    }
  });

  it('logistics team filters resolve to teams', () => {
    const teams = idsOf('teams');
    for (const e of world.events)
      for (const t of e.teamFilter ?? []) expect(teams.has(t)).toBe(true);
  });

  it("every entry's event belongs to the same regatta and has the entry's boat class", () => {
    const events = new Map(world.events.map((e) => [e.id, e]));
    for (const entry of world.entries) {
      if (!entry.eventId) continue;
      const ev = events.get(entry.eventId)!;
      expect(ev.regattaId, entry.id).toBe(entry.regattaId);
      expect(ev.kind).toBe('race');
      expect(ev.boatClass, entry.label).toBe(entry.boatClass);
    }
  });

  it('seats: unique (entry, seat), a seat the class has, no athlete twice in one entry', () => {
    const entries = new Map(world.entries.map((e) => [e.id, e]));
    expect(unique(world.entry_seats, (s) => `${s.entryId}|${s.seat}`)).toBe(true);
    expect(
      unique(
        world.entry_seats.filter((s) => s.athleteId),
        (s) => `${s.entryId}|${s.athleteId}`,
      ),
    ).toBe(true);
    for (const s of world.entry_seats) {
      expect(seatsFor(entries.get(s.entryId)!.boatClass)).toContain(s.seat);
    }
  });

  it('seated athletes are on the entry team, active, and in a participating team', () => {
    const entries = new Map(world.entries.map((e) => [e.id, e]));
    const athletes = new Map(world.athletes.map((a) => [a.id, a]));
    const participating = new Set(world.regatta_teams.map((rt) => `${rt.regattaId}|${rt.teamId}`));
    for (const s of world.entry_seats) {
      const entry = entries.get(s.entryId)!;
      const a = athletes.get(s.athleteId!)!;
      expect(a.teamId).toBe(entry.teamId);
      expect(a.status).toBe('active');
      expect(participating.has(`${entry.regattaId}|${entry.teamId}`)).toBe(true);
    }
  });

  it('unique (regatta, team), (regatta, athlete), (regatta, trailer), (plan, shell)', () => {
    expect(unique(world.regatta_teams, (r) => `${r.regattaId}|${r.teamId}`)).toBe(true);
    expect(unique(world.availability, (r) => `${r.regattaId}|${r.athleteId}`)).toBe(true);
    expect(unique(world.load_plans, (r) => `${r.regattaId}|${r.trailerId}`)).toBe(true);
    expect(unique(world.load_placements, (r) => `${r.loadPlanId}|${r.shellId}`)).toBe(true);
  });

  it("a placement's shelf is on its load plan's trailer", () => {
    const plans = new Map(world.load_plans.map((p) => [p.id, p]));
    const shelves = new Map(world.trailer_shelves.map((s) => [s.id, s]));
    for (const p of world.load_placements) {
      expect(shelves.get(p.shelfId)!.trailerId).toBe(plans.get(p.loadPlanId)!.trailerId);
    }
  });

  it('load items reference what their kind says, in their own regatta', () => {
    const plans = new Map(world.load_plans.map((p) => [p.id, p]));
    const byKind: Record<string, CollectionName | null> = {
      shell: 'shells',
      riggers: 'shells',
      oar_set: 'oar_sets',
      gear: 'gear_items',
      extra: null,
    };
    for (const item of world.load_items) {
      const target = byKind[item.kind];
      if (target) expect(idsOf(target).has(item.refId!), item.label).toBe(true);
      if (item.loadPlanId) expect(plans.get(item.loadPlanId)!.regattaId).toBe(item.regattaId);
    }
  });

  it('comment and activity targets resolve', () => {
    const commentTargets: Record<string, CollectionName> = {
      entry: 'entries',
      event: 'events',
      load_plan: 'load_plans',
    };
    for (const c of world.comments) {
      expect(idsOf(commentTargets[c.targetType]!).has(c.targetId)).toBe(true);
    }
    for (const a of world.activity_log) {
      expect(idsOf(a.targetType as CollectionName).has(a.targetId), a.summary).toBe(true);
    }
  });

  it('published snapshots point at entries of their own regatta and team', () => {
    const entries = new Map(world.entries.map((e) => [e.id, e]));
    const published = world.regatta_teams.filter((rt) => rt.publishedSnapshot);
    expect(published.length).toBeGreaterThan(0);
    for (const rt of published) {
      expect(rt.publishedAt).toBe(rt.publishedSnapshot!.publishedAt);
      for (const pe of rt.publishedSnapshot!.entries) {
        const e = entries.get(pe.entryId)!;
        expect(e.regattaId).toBe(rt.regattaId);
        expect(e.teamId).toBe(rt.teamId);
      }
    }
  });

  it('has exactly the collections of the contract', () => {
    expect(Object.keys(world).sort()).toEqual([...COLLECTION_NAMES].sort());
  });
});
