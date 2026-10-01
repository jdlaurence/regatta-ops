// Bed zones (PLAN.md §4.9, §8.1): trailer_compartments carries start_cm and end_cm, the seed
// stores SRA's zones along the frame, and a zone reads back the way the app maps it.

import { SRA_BOYS_TRAILER, SRA_GIRLS_TRAILER } from '@regatta-ops/domain';
import { COMPARTMENT_IDS, SEED_TRAILER_IDS, buildSeedWorld } from '@regatta-ops/seed';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadWorld } from '../seed/load';
import { HAS_BINARY, startTestServer, type TestServer } from './helpers';

describe.skipIf(!HAS_BINARY)('trailer compartments along the frame', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('has start_cm and end_cm number fields that refuse negatives', async () => {
    const collection = await server.admin.collections.getOne('trailer_compartments');
    const fields = new Map(collection.fields.map((f) => [f.name, f]));
    expect(fields.get('start_cm')).toMatchObject({ type: 'number', min: 0 });
    expect(fields.get('end_cm')).toMatchObject({ type: 'number', min: 0 });

    const trailer = await server.admin.collection('trailers').create({
      name: 'Test trailer',
      style: 'goalpost',
      frame_length_cm: 1250,
      width_cm: 240,
    });
    const zone = await server.admin.collection('trailer_compartments').create({
      trailer: trailer.id,
      kind: 'rigger_rack',
      label: 'Riggers',
      capacity: 40,
      start_cm: 800,
      end_cm: 1250,
    });
    expect(zone).toMatchObject({ start_cm: 800, end_cm: 1250 });
    // Unset reads 0: the app treats that as blank (the front, the back, or the whole length).
    const whole = await server.admin.collection('trailer_compartments').create({
      trailer: trailer.id,
      kind: 'oar_box',
      label: 'Oar box',
      capacity: 64,
    });
    expect(whole).toMatchObject({ start_cm: 0, end_cm: 0 });
    await expect(
      server.admin.collection('trailer_compartments').create({
        trailer: trailer.id,
        kind: 'storage',
        label: 'Bad',
        capacity: 1,
        start_cm: -10,
      }),
    ).rejects.toThrow();
  });

  it("seeds SRA's bed as slings, oars, and riggers to the back of each frame", async () => {
    const { world, accounts } = buildSeedWorld();
    await loadWorld(server.admin, world, accounts);
    for (const [def, trailerId] of [
      [SRA_BOYS_TRAILER, SEED_TRAILER_IDS.boys],
      [SRA_GIRLS_TRAILER, SEED_TRAILER_IDS.girls],
    ] as const) {
      const stored = await server.admin
        .collection('trailer_compartments')
        .getFullList({ filter: `trailer = "${trailerId}"` });
      const byId = new Map(stored.map((c) => [c.id, c]));
      for (const c of def.compartments) {
        expect(byId.get(COMPARTMENT_IDS[c.id]!)).toMatchObject({
          label: c.label,
          kind: c.kind,
          start_cm: c.startCm ?? 0,
          end_cm: c.endCm ?? 0,
        });
      }
      const riggers = def.compartments.find((c) => c.kind === 'rigger_rack')!;
      expect(riggers.endCm).toBe(def.frameLengthCm);
    }
  });
});
