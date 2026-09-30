import { describe, expect, it } from 'vitest';
import { COLLECTION_NAMES } from '@srt/domain';
import { buildSeedWorld } from '../src';

describe('buildSeedWorld', () => {
  it('has every collection and valid ids', () => {
    const { world, accounts } = buildSeedWorld();
    for (const name of COLLECTION_NAMES) {
      expect(Array.isArray(world[name])).toBe(true);
      for (const r of world[name]) expect(r.id).toMatch(/^[a-z0-9]{15}$/);
    }
    expect(accounts.length).toBe(world.users.length);
  });
  it('is deterministic', () => {
    expect(buildSeedWorld()).toEqual(buildSeedWorld());
  });
});
