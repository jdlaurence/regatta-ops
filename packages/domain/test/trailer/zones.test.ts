import { describe, expect, it } from 'vitest';
import {
  aheadCaption,
  bedFromBehind,
  bedZones,
  compartmentDefFromRecord,
  compartmentFor,
  compartmentSpan,
  SRA_BOYS_TRAILER,
  SRA_GIRLS_TRAILER,
  trailerCompartmentInputSchema,
  trailerCompartmentSchema,
  trailerDefFromRecords,
  zoneContainer,
  zoneExtent,
  zoneName,
  zoneOverlaps,
  zoneWords,
  type CompartmentDef,
  type Trailer,
  type TrailerCompartment,
} from '../../src';

const comp = (
  id: string,
  label: string,
  startCm?: number,
  endCm?: number,
  kind: CompartmentDef['kind'] = 'storage',
): CompartmentDef => ({
  id,
  kind,
  label,
  capacity: 1,
  ...(startCm !== undefined ? { startCm } : {}),
  ...(endCm !== undefined ? { endCm } : {}),
});

describe("SRA's bed zones", () => {
  it('run oars (the front half), slings, then riggers to the back, across the full width', () => {
    for (const trailer of [SRA_BOYS_TRAILER, SRA_GIRLS_TRAILER]) {
      const zones = bedZones(trailer);
      expect(zones.map((z) => z.compartment.label)).toEqual(['Oars', 'Slings', 'Riggers']);
      expect(zones[0]!.startCm).toBe(0);
      // Each zone starts where the one ahead of it ends, and the riggers reach the back.
      expect(zones[1]!.startCm).toBe(zones[0]!.endCm);
      expect(zones[2]!.startCm).toBe(zones[1]!.endCm);
      expect(zones[2]!.endCm).toBe(trailer.frameLengthCm);
      // Oars are long: they take roughly the front half of the bed (sweeps are about 3.7 m).
      expect(zones[0]!.endCm).toBe(Math.round(trailer.frameLengthCm / 2));
      // Slings are a small section in the middle; riggers take the rest of the back.
      expect(zones[1]!.endCm - zones[1]!.startCm).toBeLessThan(200);
      expect(zones[2]!.endCm - zones[2]!.startCm).toBeGreaterThan(400);
      expect(zones.every((z) => z.rows === 1 && z.row === 0 && z.positioned)).toBe(true);
      expect(zoneOverlaps(trailer)).toEqual([]);
      expect(compartmentFor(trailer, 'riggers')!.kind).toBe('rigger_rack');
      expect(compartmentFor(trailer, 'oars')!.kind).toBe('oar_rack');
      expect(compartmentFor(trailer, 'slings')!.label).toBe('Slings');
    }
  });

  it('are seen from the back as the riggers, with slings and oars ahead', () => {
    const { back, ahead } = bedFromBehind(bedZones(SRA_BOYS_TRAILER));
    expect(back.map((z) => z.compartment.label)).toEqual(['Riggers']);
    expect(ahead.map((z) => z.compartment.label)).toEqual(['Slings', 'Oars']);
    expect(aheadCaption(ahead)).toBe('Slings and oars ahead');
    expect(aheadCaption([])).toBeNull();
  });

  it('name the rigger zone as the back of the bed', () => {
    const [oars, slings, riggers] = SRA_BOYS_TRAILER.compartments;
    expect(zoneName(riggers!, 1220)).toBe('Riggers (back of bed)');
    expect(zoneName(oars!, 1220)).toBe('Oars');
    expect(zoneContainer('Boys trailer', riggers!, 1220)).toBe(
      'Boys trailer · Riggers (back of bed)',
    );
    expect(zoneContainer('Boys trailer', slings!, 1220)).toBe('Boys trailer · Slings');
    // A label that already says so is left alone; a blank one reads as the bed.
    expect(zoneName(comp('x', 'Back box', 900, 1220), 1220)).toBe('Back box');
    expect(zoneName(comp('x', '  '), 1220)).toBe('Bed');
  });
});

describe('compartmentSpan', () => {
  it('runs the whole length without a position, and fills in a missing end', () => {
    expect(compartmentSpan({}, 1220)).toEqual({ startCm: 0, endCm: 1220, positioned: false });
    expect(compartmentSpan({ endCm: 300 }, 1220)).toEqual({
      startCm: 0,
      endCm: 300,
      positioned: true,
    });
    expect(compartmentSpan({ startCm: 700 }, 1220)).toMatchObject({ startCm: 700, endCm: 1220 });
    // Kept within the frame.
    expect(compartmentSpan({ startCm: -50, endCm: 5000 }, 1220)).toMatchObject({
      startCm: 0,
      endCm: 1220,
    });
    expect(compartmentSpan({ startCm: 900, endCm: 400 }, 1220)).toMatchObject({
      startCm: 900,
      endCm: 900,
    });
  });
});

describe('bedZones', () => {
  it('sorts front to back and puts overlapping zones side by side', () => {
    const zones = bedZones({
      frameLengthCm: 1000,
      compartments: [
        comp('back', 'Back', 600, 1000),
        comp('front', 'Front', 0, 400),
        comp('mid', 'Middle', 300, 700),
      ],
    });
    expect(zones.map((z) => [z.compartment.id, z.row, z.rows])).toEqual([
      ['front', 0, 2],
      ['mid', 1, 2],
      ['back', 0, 2],
    ]);
  });

  it('shares the width between compartments that all run the whole length', () => {
    const zones = bedZones({
      frameLengthCm: 1250,
      compartments: [comp('a', 'Oar box'), comp('b', 'Rigger rack', undefined, undefined)],
    });
    expect(zones.map((z) => [z.row, z.rows])).toEqual([
      [0, 2],
      [1, 2],
    ]);
    const { back, ahead } = bedFromBehind(zones);
    expect(back).toHaveLength(2);
    expect(ahead).toEqual([]);
    // Two whole-length compartments share the bed as before: no warning.
    expect(
      zoneOverlaps({ frameLengthCm: 1250, compartments: zones.map((z) => z.compartment) }),
    ).toEqual([]);
    expect(bedFromBehind([])).toEqual({ back: [], ahead: [] });
  });

  it('warns when a zone overlaps another', () => {
    expect(
      zoneOverlaps({
        frameLengthCm: 1220,
        compartments: [comp('a', 'Slings', 0, 320), comp('b', 'Oars', 300, 700), comp('c', 'Box')],
      }),
    ).toEqual([
      { a: 'a', b: 'b', cm: 20 },
      { a: 'a', b: 'c', cm: 320 },
      { a: 'b', b: 'c', cm: 400 },
    ]);
  });
});

describe('zone words', () => {
  it('says where a zone runs and how long it is', () => {
    const f = 1220;
    const span = (s: number, e: number) => ({ startCm: s, endCm: e, positioned: true });
    expect(zoneExtent(span(0, 300), f)).toBe('from the front to 3.0 m');
    expect(zoneExtent(span(300, 700), f)).toBe('3.0 to 7.0 m from the front');
    expect(zoneExtent(span(700, 1220), f)).toBe('from 7.0 m to the back');
    expect(zoneExtent(span(0, 1220), f)).toBe('the whole length');
    expect(zoneExtent({ startCm: 0, endCm: f, positioned: false }, f)).toBe('the whole length');
    const [, , riggers] = bedZones(SRA_BOYS_TRAILER);
    expect(zoneWords(riggers!, f)).toBe('Riggers, from 7.6 m to the back (4.6 m)');
    const [box] = bedZones({ frameLengthCm: f, compartments: [comp('b', 'Oar box')] });
    expect(zoneWords(box!, f)).toBe('Oar box, the whole length');
    expect(
      aheadCaption(bedZones({ frameLengthCm: f, compartments: [comp('x', 'LLL box', 0, 100)] })),
    ).toBe('LLL box ahead');
  });

  it('finds compartments by label when no kind matches', () => {
    const def = {
      compartments: [comp('b', 'Trailer bed: riggers, oars, slings', undefined, undefined, 'bed')],
    };
    expect(compartmentFor(def, 'riggers')!.id).toBe('b');
    expect(compartmentFor(def, 'oars')!.id).toBe('b');
    expect(compartmentFor(def, 'slings')!.id).toBe('b');
    expect(compartmentFor({ compartments: [] }, 'oars')).toBeNull();
  });
});

describe('stored compartments', () => {
  const trailer: Trailer = {
    id: 't',
    name: 'T',
    style: 'offset_post',
    frameLengthCm: 1220,
    widthCm: 240,
    bowForwardDefault: false,
    defaultRules: [],
  };
  const rec = (extra: Partial<TrailerCompartment>): TrailerCompartment => ({
    id: 'c',
    trailerId: 't',
    kind: 'storage',
    label: 'Slings',
    capacity: 12,
    ...extra,
  });

  it('become zones with both ends, or no position for the whole length', () => {
    // PocketBase keeps a start of 0 as blank: it reads as the front.
    expect(compartmentDefFromRecord(rec({ startCm: null, endCm: 300 }), 1220)).toEqual({
      id: 'c',
      kind: 'storage',
      label: 'Slings',
      capacity: 12,
      startCm: 0,
      endCm: 300,
    });
    // A blank end is the back of the frame.
    expect(compartmentDefFromRecord(rec({ startCm: 700, endCm: null }), 1220)).toMatchObject({
      startCm: 700,
      endCm: 1220,
    });
    const whole = compartmentDefFromRecord(rec({}), 1220);
    expect('startCm' in whole || 'endCm' in whole).toBe(false);
    const def = trailerDefFromRecords(trailer, [], [rec({ startCm: 700, endCm: 1220 })]);
    expect(def.compartments[0]).toMatchObject({ startCm: 700, endCm: 1220 });
  });

  it('parse with positions and refuse a zone that ends before it starts', () => {
    expect(trailerCompartmentSchema.safeParse(rec({ startCm: 0, endCm: 300 })).success).toBe(true);
    expect(trailerCompartmentSchema.safeParse(rec({ startCm: -1 })).success).toBe(false);
    const { id: _id, ...input } = rec({ startCm: 700, endCm: 300 });
    const backwards = trailerCompartmentInputSchema.safeParse(input);
    expect(backwards.success).toBe(false);
    expect(backwards.error?.issues[0]).toMatchObject({
      path: ['endCm'],
      message: 'Make the zone start before it ends',
    });
    expect(trailerCompartmentInputSchema.safeParse({ ...input, startCm: null }).success).toBe(true);
  });
});
