import { describe, expect, it } from 'vitest';
import { COLLECTION_NAMES, collectionSchemas } from '@regatta-ops/domain';
import { SEED_EMAILS, SEED_PASSWORD, SEED_USER_IDS, buildSeedWorld } from '../src';
import { ALL_FIRST_NAMES, ALL_LAST_NAMES } from '../src/names';

const { world, accounts } = buildSeedWorld();

describe('buildSeedWorld', () => {
  it('has every collection, with valid and unique ids', () => {
    const all = new Set<string>();
    let total = 0;
    for (const name of COLLECTION_NAMES) {
      expect(Array.isArray(world[name]), name).toBe(true);
      const ids = world[name].map((r) => r.id);
      for (const id of ids) expect(id, name).toMatch(/^[a-z0-9]{15}$/);
      expect(new Set(ids).size, `${name} ids are unique`).toBe(ids.length);
      for (const id of ids) all.add(id);
      total += ids.length;
    }
    expect(all.size, 'ids are unique across collections').toBe(total);
  });

  it('is deterministic: same records and ids on every call', () => {
    const again = buildSeedWorld();
    expect(again).toEqual({ world, accounts });
    for (const name of COLLECTION_NAMES) {
      expect(again.world[name].map((r) => r.id)).toEqual(world[name].map((r) => r.id));
    }
  });

  it('returns fresh objects on every call', () => {
    const again = buildSeedWorld();
    expect(again.world.shells[0]).not.toBe(world.shells[0]);
    expect(again.world.trailers[0]!.defaultRules).not.toBe(world.trailers[0]!.defaultRules);
  });

  it('passes the domain schema for every record', () => {
    for (const name of COLLECTION_NAMES) {
      const schema = collectionSchemas[name];
      for (const record of world[name]) {
        const result = schema.safeParse(record);
        expect(result.success, `${name} ${record.id}: ${result.error?.message ?? ''}`).toBe(true);
      }
    }
  });

  it('builds fast enough for demo mode (under 200 ms)', () => {
    buildSeedWorld();
    const runs = 5;
    const start = performance.now();
    for (let i = 0; i < runs; i++) buildSeedWorld();
    expect((performance.now() - start) / runs).toBeLessThan(200);
  });

  it('seeds one admin, four coaches, and one viewer, each with a password account', () => {
    expect(world.users.map((u) => [u.email, u.role])).toEqual([
      [SEED_EMAILS.admin, 'admin'],
      [SEED_EMAILS.coachBoys, 'coach'],
      [SEED_EMAILS.coachGirls, 'coach'],
      [SEED_EMAILS.coachFiveAm, 'coach'],
      [SEED_EMAILS.coachEvening, 'coach'],
      [SEED_EMAILS.viewer, 'viewer'],
    ]);
    expect(accounts).toEqual(
      world.users.map((u) => ({ userId: u.id, email: u.email, password: SEED_PASSWORD })),
    );
    const coaches = world.users.filter((u) => u.role === 'coach');
    expect(new Set(coaches.map((c) => c.defaultTeamId)).size).toBe(4);
    expect(world.users.find((u) => u.id === SEED_USER_IDS.viewer)?.defaultTeamId).toBeNull();
  });

  it('uses only invented athlete names', () => {
    for (const a of world.athletes) {
      expect(ALL_FIRST_NAMES.has(a.firstName), a.firstName).toBe(true);
      expect(ALL_LAST_NAMES.has(a.lastName), a.lastName).toBe(true);
    }
    const lastNames = world.athletes.map((a) => a.lastName);
    expect(new Set(lastNames).size).toBe(lastNames.length);
  });

  it('keeps presence and share links empty and has one club settings record', () => {
    expect(world.presence).toEqual([]);
    expect(world.share_links).toEqual([]);
    expect(world.club_settings).toHaveLength(1);
    expect(world.club_settings[0]).toMatchObject({
      timezone: 'America/Los_Angeles',
      weightUnit: 'lb',
      headRaceDurationMin: 20,
      timingDefaults: {
        launchLeadMin: 40,
        raceDurationMin: 10,
        returnMin: 15,
        hotSeatMinGapMin: 15,
        athleteMinGapMin: 30,
        rerigMin: 30,
      },
    });
  });
});
