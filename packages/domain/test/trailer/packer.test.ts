import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIT_RULE,
  layoutReport,
  packTrailer,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
  validatePlacement,
  type PackBoat,
  type Placement,
  type Rule,
} from '../../src';
import {
  boat,
  BOYS_EIGHTS,
  boysLoad,
  CENTER_POST,
  classGrid,
  GOALPOST_41FT,
  OUTER_FIRST,
  rule,
  shelf,
  SINGLES_ONE_LANE,
  SINGLES_SHELF,
  soft,
  trailer,
  TWO_ACCESS,
  TWO_TIER,
  where,
  WIDE_SIDE,
} from './fixtures';

const EIGHTS = [...BOYS_EIGHTS, 'WUBA', 'Percy', 'Bullet'];
const FOURS = ['Thursday', 'Kokanee', 'Dan', 'Alma', 'Spencer', 'Legacy'];

function fits(result: ReturnType<typeof packTrailer>, shellId: string): Placement {
  const p = where(result, shellId);
  expect(p, `${shellId} should be placed`).toBeDefined();
  return p!;
}

describe('§9.3.5 case 1–2: manufacturer rating on a 41 ft goalpost trailer', () => {
  const eights = EIGHTS.slice(0, 9).map((n) => boat(n, '8+'));
  const fours = FOURS.map((n) => boat(n, '4+'));

  it('places nine eights and six fours', () => {
    const result = packTrailer(GOALPOST_41FT, [...eights, ...fours], [], []);
    expect(result.unplaced).toEqual([]);
    expect(result.placements).toHaveLength(15);
    for (const e of eights) expect(['g3', 'g4', 'g5']).toContain(fits(result, e.shellId).shelfId);
    for (const f of fours) expect(['g1', 'g2']).toContain(fits(result, f.shellId).shelfId);
    // Three lanes per level (§9.3.2).
    for (const m of result.metrics.perShelf) expect(m.lanesUsed).toBe(3);
  });

  it('leaves a tenth eight unplaced, naming the fit rule', () => {
    const tenth = boat('Bullet', '8+');
    const result = packTrailer(GOALPOST_41FT, [...eights, tenth, ...fours], [], []);
    expect(result.placements).toHaveLength(15);
    expect(result.unplaced).toHaveLength(1);
    const [u] = result.unplaced;
    expect(u!.reasons.map((r) => r.ruleId)).toContain(BUILTIN_FIT_RULE.id);
    expect(u!.reasons[0]!.text).toBe(
      "Every active shelf rejected this boat: 5 by 'must physically fit'",
    );
    expect(u!.reasons[1]!.text).toBe('No active shelf has a lane with 19.9 m free');
    expect(result.warnings).toContain(
      `1 boat not placed: ${result.unplaced.map((x) => [...eights, tenth].find((b) => b.shellId === x.shellId)!.name).join('')}`,
    );
  });
});

describe('§9.3.5 case 3: end to end', () => {
  const s1 = boat('Laurel', '1x');
  const s2 = boat('Light Speed', '1x');
  const s3 = boat('Hardy', '1x');
  const double = boat('Tandem', '2x');

  it('pairs two singles in one lane and puts a third in another lane', () => {
    const result = packTrailer(SINGLES_SHELF, [s1, s2, s3], [], []);
    expect(result.unplaced).toEqual([]);
    const lanes = [s1, s2, s3].map((b) => fits(result, b.shellId).lane);
    expect(lanes.filter((l) => l === 0)).toHaveLength(2);
    expect(lanes.filter((l) => l === 1)).toHaveLength(1);
    const pair = result.placements
      .filter((p) => p.lane === 0)
      .sort((a, b) => a.offsetCm - b.offsetCm);
    // 16.7 m in 12.0 m: no forward-bias rule, so rear overhang first (300 cm), then 170 cm front.
    expect(pair.map((p) => p.offsetCm)).toEqual([-170, 680]);
    expect(pair[0]!.reasons[0]!.text).toMatch(
      /^Fits end to end with (Laurel|Hardy) \(16\.7 m of 18\.0 m including overhang\)$/,
    );
  });

  it('does not pair a single and a double; the rejection names the fit rule', () => {
    const placed: Placement[] = [
      {
        shellId: s1.shellId,
        shelfId: 's1',
        lane: 0,
        offsetCm: -300,
        bowForward: false,
        locked: false,
        reasons: [],
      },
    ];
    const v = validatePlacement(SINGLES_SHELF, [s1, double], [], placed, {
      shellId: double.shellId,
      shelfId: 's1',
      lane: 0,
      offsetCm: 550,
      bowForward: false,
      locked: false,
      reasons: [],
    });
    expect(v.ok).toBe(false);
    expect(v.violations.map((r) => r.ruleId)).toEqual(['fit']);

    const result = packTrailer(SINGLES_ONE_LANE, [s1, double], [], []);
    expect(fits(result, double.shellId).lane).toBe(0);
    expect(result.unplaced.map((u) => u.shellId)).toEqual([s1.shellId]);
    expect(result.unplaced[0]!.reasons[0]!.ruleId).toBe('fit');
  });
});

describe('§9.3.5 case 4: shelf-lanes override', () => {
  const fours = ['Thursday', 'Kokanee', 'Dan'].map((n) => boat(n, '4+'));

  it('computes two lanes for fours on a 150 cm shelf', () => {
    const result = packTrailer(WIDE_SIDE, fours, [], []);
    expect(result.placements).toHaveLength(2);
    expect(result.unplaced).toHaveLength(1);
  });

  it('fits a third four with the override', () => {
    const override = rule('shelf-lanes', { shelfId: 'w1', lanes: 3, classes: ['4+', '4-'] });
    const result = packTrailer(WIDE_SIDE, fours, [override], []);
    expect(result.unplaced).toEqual([]);
    expect(result.placements.map((p) => p.lane).sort()).toEqual([0, 1, 2]);
    expect(result.placements[0]!.reasons.map((r) => r.ruleId)).toContain(override.id);
  });

  it('ignores the override when another class shares the shelf', () => {
    const override = rule('shelf-lanes', { shelfId: 'w1', lanes: 3, classes: ['4+'] });
    const result = packTrailer(
      WIDE_SIDE,
      [...fours.slice(0, 2), boat('Snoopy', '4x')],
      [override],
      [],
    );
    expect(result.placements).toHaveLength(2);
    expect(result.unplaced).toHaveLength(1);
  });

  it('honors a lane override from the shelf definition', () => {
    const t = trailer('t', [{ ...WIDE_SIDE.shelves[0]!, lanesOverride: 1 }]);
    const result = packTrailer(t, fours, [], []);
    expect(result.placements).toHaveLength(1);
    expect(result.unplaced[0]!.reasons[0]!.text).toBe(
      "Every active shelf rejected this boat: 1 by 'Level 1, wide side fits 1 boats side by side'",
    );
  });
});

describe('§9.3.5 case 5: heavy-low against class rules', () => {
  const eight = boat('Monahan', '8+');
  const heavyLow = soft('heavy-low', 1);

  it('puts the eight low with heavy-low alone', () => {
    const result = packTrailer(TWO_TIER, [eight], [heavyLow], []);
    expect(fits(result, eight.shellId).shelfId).toBe('t1');
  });

  it('puts the eight on top when shelf-classes forbids the bottom, naming the rule', () => {
    const onlyFours = rule('shelf-classes', { shelfIds: ['t1'], classes: ['4+', '4x'] });
    const result = packTrailer(TWO_TIER, [eight], [heavyLow, onlyFours], []);
    const p = fits(result, eight.shellId);
    expect(p.shelfId).toBe('t2');
    expect(p.reasons.map((r) => r.ruleId)).toEqual(
      expect.arrayContaining([onlyFours.id, heavyLow.id]),
    );
    expect(p.reasons.find((r) => r.ruleId === onlyFours.id)).toEqual({
      ruleId: onlyFours.id,
      text: 'Bottom rack holds only 4+ and 4x',
      hard: true,
    });
  });

  it('with the default-style rule set, the eight goes on top and the reasons name both rules', () => {
    const eightsTop = soft('class-tier', 3, { classes: ['8+'], tiers: [2] });
    const result = packTrailer(TWO_TIER, [eight], [BUILTIN_FIT_RULE, eightsTop, heavyLow], []);
    const p = fits(result, eight.shellId);
    expect(p.shelfId).toBe('t2');
    const byRule = Object.fromEntries(p.reasons.map((r) => [r.ruleId, r]));
    expect(byRule[eightsTop.id]).toMatchObject({
      text: 'Prefer eights on the top rack',
      score: 30,
    });
    expect(byRule[heavyLow.id]).toMatchObject({ text: 'Keep heavier boats low', score: -9.6 });
  });

  it('a Must class-tier rule rejects other tiers', () => {
    const must = { ...rule('class-tier', { classes: ['8+'], tiers: [2] }), hard: true } as Rule;
    const result = packTrailer(TWO_TIER, [eight], [heavyLow, must], []);
    expect(fits(result, eight.shellId).shelfId).toBe('t2');
    expect(fits(result, eight.shellId).reasons[1]).toEqual({
      ruleId: must.id,
      text: 'Eights must go on the top rack',
      hard: true,
    });
  });
});

describe('§9.3.5 case 6: side balance on a center-post trailer', () => {
  it('alternates sides for equal boats and reports balance within tolerance', () => {
    const fours = ['A four', 'B four', 'C four', 'D four'].map((n) => boat(n, '4+'));
    const balance = soft('side-balance', 2, { tolerancePct: 10 });
    const result = packTrailer(CENTER_POST, fours, [balance], []);
    const side = (id: string) => CENTER_POST.shelves.find((s) => s.id === id)!.columnKey;
    expect(fours.map((b) => side(fits(result, b.shellId).shelfId))).toEqual([
      'left',
      'right',
      'left',
      'right',
    ]);
    expect(result.metrics.leftWeightKg).toBe(102);
    expect(result.metrics.rightWeightKg).toBe(102);
    expect(result.metrics.balancePct).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it('warns when the sides are out of tolerance', () => {
    const t = trailer('t', [shelf('only', 'Level 1, left', 1, 'left', { widthCm: 80 })]);
    const result = packTrailer(
      t,
      [boat('A four', '4+')],
      [soft('side-balance', 1, { tolerancePct: 10 })],
      [],
    );
    expect(result.warnings).toContain(
      'Left side is heavier than the right side: 100% apart (tolerance 10%)',
    );
  });

  it('uses lane thirds on full-width shelves', () => {
    const fours = ['A four', 'B four', 'C four'].map((n) => boat(n, '4+'));
    const result = packTrailer(GOALPOST_41FT, fours, [soft('heavy-low', 1)], []);
    // Three fours across level 1: left third, middle (ignored), right third.
    expect(result.metrics.leftWeightKg).toBe(51);
    expect(result.metrics.rightWeightKg).toBe(51);
  });
});

describe('§9.3.5 case 7: locked placements', () => {
  const four = boat('Thursday', '4+');
  const eight = boat('Peggy', '8+');

  it('keeps a locked placement that scores badly', () => {
    const locked: Placement = {
      shellId: four.shellId,
      shelfId: 'l5',
      lane: 0,
      offsetCm: -120,
      bowForward: true,
      locked: true,
      reasons: [{ ruleId: 'locked', text: 'Locked by a coach', hard: true }],
    };
    const result = packTrailer(SRA_BOYS_TRAILER, [four], SRA_DEFAULT_RULES, [locked]);
    expect(result.placements).toEqual([locked]);
    expect(result.warnings.filter((w) => w.includes('breaks'))).toEqual([]);
  });

  it('keeps a locked placement that breaks a hard rule and reports it', () => {
    const locked: Placement = {
      shellId: eight.shellId,
      shelfId: 'l1',
      lane: 0,
      offsetCm: -250,
      bowForward: false,
      locked: true,
      reasons: [],
    };
    const result = packTrailer(SRA_BOYS_TRAILER, [eight, four], SRA_DEFAULT_RULES, [locked]);
    expect(where(result, eight.shellId)).toMatchObject({
      shelfId: 'l1',
      offsetCm: -250,
      locked: true,
    });
    expect(where(result, eight.shellId)!.reasons).toEqual([
      { ruleId: 'locked', text: 'Placed by hand and locked', hard: true },
    ]);
    expect(result.warnings[0]).toBe(
      'Peggy is locked in a spot that breaks a rule: Sticks out 5.2 m behind; level 1, narrow side allows 3.0 m',
    );
  });

  it('drops unlocked existing placements and re-packs them', () => {
    const stale: Placement = {
      shellId: four.shellId,
      shelfId: 'l5',
      lane: 0,
      offsetCm: 0,
      bowForward: false,
      locked: false,
      reasons: [],
    };
    const result = packTrailer(SRA_BOYS_TRAILER, [four], SRA_DEFAULT_RULES, [stale]);
    expect(fits(result, four.shellId).shelfId).not.toBe('l5');
  });

  it('reports locked placements it cannot use', () => {
    const base = { lane: 0, offsetCm: 0, bowForward: false, locked: true, reasons: [] };
    const result = packTrailer(
      SRA_BOYS_TRAILER,
      [four],
      [],
      [
        { ...base, shellId: 'sh_spare', shelfId: 'l2' },
        { ...base, shellId: four.shellId, shelfId: 'nope' },
      ],
    );
    expect(result.placements.map((p) => p.shellId)).toContain('sh_spare');
    expect(where(result, four.shellId)!.shelfId).not.toBe('nope');
    expect(result.warnings).toEqual([
      'A locked placement is for a shell that is not on the load list (sh_spare); it was kept as is',
      'Thursday is locked to a shelf this trailer does not have; it was placed again',
    ]);
  });

  it('keeps only the first of two locked placements for one shell', () => {
    const base = {
      shellId: four.shellId,
      lane: 0,
      offsetCm: -120,
      bowForward: false,
      locked: true,
      reasons: [],
    };
    const result = packTrailer(
      SRA_BOYS_TRAILER,
      [four],
      [],
      [
        { ...base, shelfId: 'l2' },
        { ...base, shelfId: 'l3' },
      ],
    );
    expect(result.placements.map((p) => p.shelfId)).toEqual(['l2']);
    expect(result.warnings).toEqual([
      'Thursday has more than one locked placement; the first one was kept',
    ]);
  });
});

describe('§9.3.5 case 8: unload order across shelves', () => {
  const early = boat('Kokanee', '4+', { firstRaceAt: '2026-05-16T16:00:00.000Z' });
  const late = boat('Alma', '4+', { firstRaceAt: '2026-05-16T18:00:00.000Z' });
  const unload = soft('unload-order', 1);

  it('gives the earlier-racing boat the more accessible shelf', () => {
    const result = packTrailer(TWO_ACCESS, [late, early], [unload], []);
    expect(fits(result, early.shellId).shelfId).toBe('easy');
    expect(fits(result, late.shellId).shelfId).toBe('hard');
    expect(fits(result, early.shellId).reasons).toContainEqual({
      ruleId: unload.id,
      text: 'Boats racing first should be easiest to reach (more accessible shelf)',
      score: 5,
      hard: false,
    });
  });

  it('fixes the order in the improvement pass when the later boat is placed first', () => {
    const heavyLate = { ...late, weightKg: 60 };
    const result = packTrailer(TWO_ACCESS, [heavyLate, early], [unload], []);
    expect(fits(result, early.shellId).shelfId).toBe('easy');
  });
});

describe('orientation', () => {
  it('loads bows forward, over the truck, unless the trailer says otherwise (owner, v0.3)', () => {
    const sra = packTrailer(SRA_BOYS_TRAILER, boysLoad(), SRA_DEFAULT_RULES, []);
    expect(sra.placements.length).toBeGreaterThan(0);
    expect(sra.placements.every((p) => p.bowForward)).toBe(true);
    const unset = trailer('t', [shelf('a', 'Level 1', 1, 'full', { widthCm: 90, lengthCm: 1400 })]);
    expect(unset.bowForwardDefault).toBeUndefined();
    expect(packTrailer(unset, [boat('Dan', '4+')], [], []).placements[0]!.bowForward).toBe(true);
    const sterns = { ...unset, bowForwardDefault: false };
    expect(packTrailer(sterns, [boat('Dan', '4+')], [], []).placements[0]!.bowForward).toBe(false);
  });
});

describe('§9.3.5 case 9: determinism', () => {
  it('same input twice gives deep-equal output', () => {
    const boats = [...boysLoad(), boat('Snoopy', '4x'), boat('Laurel', '1x'), boat('Hardy', '1x')];
    const rules = [...SRA_DEFAULT_RULES, THREE_WIDE_EXAMPLE_RULE];
    const a = packTrailer(SRA_BOYS_TRAILER, boats, rules, []);
    const b = packTrailer(SRA_BOYS_TRAILER, boats, rules, []);
    expect(b).toEqual(a);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('orders look-alike boats by name, then shell id', () => {
    const twins = [
      boat('Twin', '1x', { shellId: 'sh_b' }),
      boat('Twin', '1x', { shellId: 'sh_a' }),
      boat('Solo', '1x'),
    ];
    const one = trailer('t', [shelf('a', 'Level 1', 1, 'full', { widthCm: 40, lengthCm: 800 })]);
    const result = packTrailer(one, twins, [], []);
    expect(result.placements.map((p) => p.shellId)).toEqual(['sh_solo']);
    expect(result.unplaced.map((u) => u.shellId)).toEqual(['sh_a', 'sh_b']);
  });
});

describe('§9.3.5 case 10: validatePlacement', () => {
  const peggy = boat('Peggy', '8+');
  const thursday = boat('Thursday', '4+');
  const placements: Placement[] = [
    {
      shellId: peggy.shellId,
      shelfId: 'r5',
      lane: 0,
      offsetCm: -500,
      bowForward: false,
      locked: false,
      reasons: [],
    },
  ];
  const candidate = (lane: number, offsetCm: number): Placement => ({
    shellId: thursday.shellId,
    shelfId: 'r5',
    lane,
    offsetCm,
    bowForward: false,
    locked: false,
    reasons: [],
  });

  it('rejects a move that would exceed the lane length and names the rule', () => {
    const v = validatePlacement(
      SRA_BOYS_TRAILER,
      [peggy, thursday],
      SRA_DEFAULT_RULES,
      placements,
      candidate(0, 1520),
    );
    expect(v.ok).toBe(false);
    expect(v.violations).toEqual([
      {
        ruleId: 'r_fit',
        text: 'Sticks out 16.4 m behind; the top level, wide side allows 3.0 m',
        hard: true,
      },
    ]);
  });

  it('rejects overlap and front overhang', () => {
    const v = validatePlacement(
      SRA_BOYS_TRAILER,
      [peggy, thursday],
      [],
      placements,
      candidate(0, -600),
    );
    expect(v.violations.map((x) => x.text)).toEqual([
      'Sticks out 6.0 m in front; the top level, wide side allows 5.0 m',
      'Overlaps Peggy in this lane',
    ]);
    const close = validatePlacement(
      SRA_BOYS_TRAILER,
      [peggy, thursday],
      [],
      placements,
      candidate(0, 1500),
    );
    expect(close.violations.map((x) => x.text)).toContain(
      'Too close to Peggy: boats in a lane need 30 cm between ends',
    );
  });

  it('accepts a valid spot, ignoring the shell’s own old placement', () => {
    const own: Placement[] = [...placements, { ...candidate(0, 0), shelfId: 'l2' }];
    const v = validatePlacement(
      SRA_BOYS_TRAILER,
      [peggy, thursday],
      SRA_DEFAULT_RULES,
      own,
      candidate(1, -120),
    );
    expect(v).toEqual({ ok: true, violations: [] });
  });

  it('rejects too many boats across and unknown ids', () => {
    const third = boat('Kokanee', '4+');
    const two: Placement[] = [...placements, { ...candidate(1, -120) }];
    const v = validatePlacement(SRA_BOYS_TRAILER, [peggy, thursday, third], [], two, {
      ...candidate(2, -120),
      shellId: third.shellId,
    });
    expect(v.violations[0]!.text).toBe(
      'Not enough room across the top level, wide side: side by side this needs 201 cm of 150 cm',
    );
    expect(
      validatePlacement(SRA_BOYS_TRAILER, [peggy], [], [], candidate(0, 0)).violations[0]!.text,
    ).toBe('This shell is not on the load list');
    expect(
      validatePlacement(SRA_BOYS_TRAILER, [thursday], [], [], { ...candidate(0, 0), shelfId: 'x' })
        .ok,
    ).toBe(false);
    expect(
      validatePlacement(SRA_BOYS_TRAILER, [thursday], [], [], candidate(-1, 0)).violations[0]!.text,
    ).toBe('Lane is not on this shelf');
  });

  it('reports every hard rule a spot breaks', () => {
    const rules: Rule[] = [
      rule('shelf-off', { shelfIds: ['r5'] }),
      rule('shelf-classes', { shelfIds: ['r5'], classes: ['8+'] }),
      rule('max-boats', { shelfId: 'r5', max: 1 }),
      rule('pin', { shellId: thursday.shellId, shelfId: 'l2' }),
    ];
    const v = validatePlacement(
      SRA_BOYS_TRAILER,
      [peggy, thursday],
      rules,
      placements,
      candidate(1, -120),
    );
    expect(v.violations.map((x) => x.text)).toEqual([
      "Don't use the top level, wide side",
      'Top level, wide side holds only 8+',
      'Thursday goes on level 2, narrow side',
      'Top level, wide side holds at most 1 boat',
    ]);
  });
});

describe('§9.3.5 case 12: the boys’ 2026 Regionals load', () => {
  it('reproduces the coaches’ class grid with the SRA default rules', () => {
    const boats = boysLoad();
    const result = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []);
    expect(result.unplaced).toEqual([]);
    const grid = classGrid(SRA_BOYS_TRAILER, boats, result);
    // Level 3's eight rides in the inner lane, over the centerline, with a four on each side.
    expect(grid).toEqual([
      ['8+', '8+', '8+'],
      ['8+', '8+', '8+'],
      ['4+', '8+', '4+'],
      ['4+', '4+', '4+'],
      [],
    ]);
    // Every eight has the reasons from §17.3: fit with overhang, the eights-on-top preference.
    const peggy = fits(result, 'sh_peggy');
    expect(peggy.reasons[0]).toEqual({
      ruleId: 'r_fit',
      text: 'Fits: 19.9 m in 12.2 m plus 5.0 m front and 3.0 m rear overhang',
      hard: true,
    });
    const top = result.placements.filter((p) => ['l5', 'r5', 'l4', 'r4'].includes(p.shelfId));
    for (const p of top) {
      expect(p.offsetCm).toBe(-500);
      expect(p.reasons).toContainEqual({
        ruleId: 'r_eights_top',
        text: 'Prefer eights on levels 5 and 4',
        score: 30,
        hard: false,
      });
    }
    expect(result.metrics.leftWeightKg).toBe(294);
    expect(result.metrics.rightWeightKg).toBe(294);
    expect(result.warnings).toEqual([
      'Rear overhang reaches 2.7 m on level 3, wide side and 4 other shelves; more than 1.2 m (4 ft) behind needs a flag',
    ]);
  });

  it('holds the same grid for realistic club weights', () => {
    const boats = boysLoad().map((b, i) => ({
      ...b,
      weightKg: b.cls === '8+' ? 92 + ((i * 7) % 20) : 49 + ((i * 5) % 12),
    }));
    const result = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []);
    const grid = classGrid(SRA_BOYS_TRAILER, boats, result).map((row) => [...row].sort());
    expect(grid).toEqual([
      ['8+', '8+', '8+'],
      ['8+', '8+', '8+'],
      ['4+', '4+', '8+'],
      ['4+', '4+', '4+'],
      [],
    ]);
  });

  it('with the §17.2 three-wide override, level 3 wide side can take three fours', () => {
    const boats = [...boysLoad(), boat('Snoopy', '4x')];
    const onlyLevel3: Rule[] = [
      BUILTIN_FIT_RULE,
      THREE_WIDE_EXAMPLE_RULE,
      rule('shelf-off', { shelfIds: ['l1', 'r1', 'l2', 'r2'] }),
    ];
    const fours = boats.filter((b) => b.cls !== '8+');
    const result = packTrailer(SRA_BOYS_TRAILER, fours, onlyLevel3, []);
    expect(result.placements.filter((p) => p.shelfId === 'r3')).toHaveLength(3);
  });
});

describe('§9.3.5 case 13: outer-first lane access', () => {
  it('puts the earlier-racing four in the outer lane and says why', () => {
    const early = boat('Kokanee', '4+', { firstRaceAt: '2026-05-16T16:00:00.000Z' });
    const late = boat('Alma', '4+', { firstRaceAt: '2026-05-16T18:00:00.000Z' });
    const unload = soft('unload-order', 1);
    const result = packTrailer(OUTER_FIRST, [early, late], [unload], []);
    expect(fits(result, early.shellId).lane).toBe(1);
    expect(fits(result, late.shellId).lane).toBe(0);
    expect(fits(result, early.shellId).reasons).toContainEqual({
      ruleId: unload.id,
      text: 'Boats racing first should be easiest to reach (outer lane)',
      score: 5,
      hard: false,
    });
  });
});

describe('§9.3.5 case 14: side balance on an offset-post trailer', () => {
  const at = (b: PackBoat, shelfId: string, lane: number): Placement => ({
    shellId: b.shellId,
    shelfId,
    lane,
    offsetCm: b.cls === '8+' ? -500 : -120,
    bowForward: true,
    locked: true,
    reasons: [],
  });

  it('counts the wide side’s inner lane for neither side', () => {
    const boats = boysLoad();
    // The coaches' own layout: level 3's eight on the narrow side.
    const coaches = packTrailer(
      SRA_BOYS_TRAILER,
      boats,
      SRA_DEFAULT_RULES.filter((r) => r.type !== 'side-balance'),
      [],
    );
    expect(classGrid(SRA_BOYS_TRAILER, boats, coaches)[2]).toEqual(['8+', '4+', '4+']);
    const report = layoutReport(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, coaches.placements);
    expect(report.metrics).toMatchObject({
      leftWeightKg: 339,
      rightWeightKg: 294,
      balancePct: 7.1,
    });
    expect(report.warnings.filter((w) => w.includes('apart'))).toEqual([]);
  });

  it('warns past the tolerance, naming the outer lane', () => {
    const [inner, outer, narrow] = ['Peggy', 'LLL', 'Thursday'].map((n, i) =>
      boat(n, i < 2 ? '8+' : '4+'),
    ) as [PackBoat, PackBoat, PackBoat];
    const boats = [inner, outer, narrow];
    const placements = [at(inner, 'r5', 0), at(outer, 'r5', 1), at(narrow, 'l3', 0)];
    const report = layoutReport(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, placements);
    expect(report.metrics).toMatchObject({
      leftWeightKg: 51,
      rightWeightKg: 96,
      balancePct: 30.6,
    });
    expect(report.warnings).toContain(
      'Wide side, outer lane is heavier than the narrow side: 30.6% apart (tolerance 20%)',
    );
  });

  it('packs a light load down the centerline', () => {
    const boats = [boat('Peggy', '8+'), boat('LLL', '8+'), boat('Thursday', '4+')];
    const result = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []);
    expect(boats.map((b) => fits(result, b.shellId)).map((p) => [p.shelfId, p.lane])).toEqual([
      ['r5', 0],
      ['r4', 0],
      ['r2', 0],
    ]);
    expect(result.metrics).toMatchObject({ leftWeightKg: 0, rightWeightKg: 0, balancePct: 0 });
  });
});

describe('rule semantics', () => {
  it('forward-bias puts overhang in front; without it, behind first', () => {
    const four = boat('Thursday', '4+');
    const t = trailer('t', [shelf('a', 'Level 1', 1, 'full', { lengthCm: 1220, widthCm: 80 })]);
    expect(fits(packTrailer(t, [four], [soft('forward-bias')], []), four.shellId).offsetCm).toBe(
      -120,
    );
    expect(fits(packTrailer(t, [four], [], []), four.shellId).offsetCm).toBe(0);
    const eight = boat('Peggy', '8+');
    const long = trailer('t', [
      shelf('a', 'Level 1', 1, 'full', {
        lengthCm: 1220,
        widthCm: 80,
        frontOverhangMaxCm: 500,
        rearOverhangMaxCm: 400,
      }),
    ]);
    const p = fits(packTrailer(long, [eight], [soft('forward-bias', 2)], []), eight.shellId);
    expect(p.offsetCm).toBe(-500);
    expect(p.reasons.find((r) => r.ruleId.startsWith('r_forward'))?.score).toBe(-10.8);
    expect(fits(packTrailer(long, [eight], [], []), eight.shellId).offsetCm).toBe(-370);
  });

  it('forward-bias prefers the shelf where a boat needs less rear overhang', () => {
    const eight = boat('Peggy', '8+');
    const t = trailer('t', [
      shelf('a', 'Level 1', 1, 'full', {
        lengthCm: 1220,
        widthCm: 80,
        frontOverhangMaxCm: 300,
        rearOverhangMaxCm: 500,
      }),
      shelf('b', 'Level 2', 2, 'full', {
        lengthCm: 1220,
        widthCm: 80,
        frontOverhangMaxCm: 700,
        rearOverhangMaxCm: 100,
      }),
    ]);
    expect(fits(packTrailer(t, [eight], [soft('forward-bias')], []), eight.shellId).shelfId).toBe(
      'b',
    );
  });

  it('overhang rules override shelf limits and are named when they reject', () => {
    const eight = boat('Peggy', '8+');
    const tight = rule('overhang', { tiers: [3, 4, 5], frontMaxCm: 300, rearMaxCm: 120 });
    const result = packTrailer(SRA_BOYS_TRAILER, [eight], [tight], []);
    expect(result.placements).toEqual([]);
    const reasons = result.unplaced[0]!.reasons;
    expect(reasons[0]!.text).toBe(
      "Every active shelf rejected this boat: 6 by 'Levels 3, 4, and 5 may stick out 300 cm in front and 120 cm behind', 4 by 'must physically fit'",
    );
    expect(reasons[0]!.ruleId).toBe(tight.id);
    const loose = rule('overhang', { tiers: [1], frontMaxCm: 600, rearMaxCm: 300 });
    const ok = packTrailer(SRA_BOYS_TRAILER, [eight], [loose, soft('heavy-low', 1)], []);
    expect(fits(ok, eight.shellId).shelfId).toBe('l1');
    expect(fits(ok, eight.shellId).reasons.map((r) => r.ruleId)).toContain(loose.id);
  });

  it('shelf-off and inactive shelves are skipped', () => {
    const four = boat('Thursday', '4+');
    const t = trailer('t', [
      shelf('a', 'Level 1', 1, 'full', { widthCm: 80 }),
      shelf('b', 'Level 2', 2, 'full', { widthCm: 80, active: false }),
      shelf('c', 'Level 3', 3, 'full', { widthCm: 80 }),
    ]);
    const off = rule('shelf-off', { shelfIds: ['a'] });
    expect(fits(packTrailer(t, [four], [off], []), four.shellId).shelfId).toBe('c');
    const none = packTrailer(t, [four], [rule('shelf-off', { shelfIds: ['a', 'c'] })], []);
    expect(none.unplaced[0]!.reasons).toEqual([
      { ruleId: expect.any(String), text: 'Every shelf is turned off', hard: true },
    ]);
  });

  it('disabled rules are ignored, but the fit rule always applies', () => {
    const eight = boat('Peggy', '8+');
    const off = {
      ...rule('shelf-off', { shelfIds: ['l5', 'r5', 'l4', 'r4', 'l3', 'r3'] }),
      enabled: false,
    };
    const disabledFit = { ...BUILTIN_FIT_RULE, id: 'r_fit', enabled: false };
    const result = packTrailer(SRA_BOYS_TRAILER, [eight], [off, disabledFit], []);
    expect(['l3', 'r3']).toContain(fits(result, eight.shellId).shelfId);
    expect(fits(result, eight.shellId).reasons[0]!.ruleId).toBe('fit');
  });

  it('max-boats and max weight cap a shelf', () => {
    const fours = ['Thursday', 'Kokanee'].map((n) => boat(n, '4+'));
    const cap = rule('max-boats', { shelfId: 'w1', max: 1 });
    const capped = packTrailer(WIDE_SIDE, fours, [cap], []);
    expect(capped.placements).toHaveLength(1);
    expect(capped.unplaced[0]!.reasons[0]!.text).toBe(
      "Every active shelf rejected this boat: 1 by 'Level 1, wide side holds at most 1 boat'",
    );
    const heavy = trailer('t', [{ ...WIDE_SIDE.shelves[0]!, maxWeightKg: 60, maxBoats: 5 }]);
    const light = packTrailer(heavy, fours, [], []);
    expect(light.placements).toHaveLength(1);
    expect(light.unplaced[0]!.reasons[1]!.text).toBe('Level 1, wide side carries at most 60 kg');
    const overweight = packTrailer(
      heavy,
      fours,
      [],
      fours.map((f, i) => ({
        shellId: f.shellId,
        shelfId: 'w1',
        lane: i,
        offsetCm: 0,
        bowForward: false,
        locked: true,
        reasons: [],
      })),
    );
    expect(overweight.warnings).toContain(
      'Level 1, wide side carries 102 kg, over its 60 kg limit',
    );
  });

  it('allowedClasses on a shelf acts like a shelf-classes rule', () => {
    const t = trailer('t', [
      shelf('a', 'Level 1', 1, 'full', { widthCm: 80, allowedClasses: ['1x', '2x'] }),
      shelf('b', 'Level 2', 2, 'full', { widthCm: 80 }),
    ]);
    const result = packTrailer(t, [boat('Thursday', '4+')], [], []);
    expect(result.placements[0]!.shelfId).toBe('b');
    expect(result.placements[0]!.reasons).toContainEqual({
      ruleId: 'shelf:a:classes',
      text: 'Level 1 holds only 1x and 2x',
      hard: true,
    });
  });

  it('pins become locked placements', () => {
    const boats = boysLoad();
    const pin = rule('pin', { shellId: 'sh_peggy', shelfId: 'l2' });
    const pinLane = rule('pin', { shellId: 'sh_dan', shelfId: 'r5', lane: 1 });
    const result = packTrailer(SRA_BOYS_TRAILER, boats, [...SRA_DEFAULT_RULES, pin, pinLane], []);
    const peggy = where(result, 'sh_peggy')!;
    expect(peggy).toMatchObject({ shelfId: 'l2', locked: true });
    expect(peggy.reasons[0]).toEqual({
      ruleId: pin.id,
      text: 'Peggy goes on level 2, narrow side',
      hard: true,
    });
    expect(result.warnings[0]).toBe(
      'Peggy is pinned to level 2, narrow side, which breaks a rule: Sticks out 5.2 m behind; level 2, narrow side allows 3.0 m',
    );
    expect(where(result, 'sh_dan')).toMatchObject({ shelfId: 'r5', lane: 1, locked: true });
    expect(where(result, 'sh_dan')!.reasons[0]!.text).toBe(
      'Dan goes on the top level, wide side, outside lane',
    );
  });

  it('a pin with a lane rejects the other lanes of its shelf', () => {
    const dan = boat('Dan', '4+');
    const pin = rule('pin', { shellId: dan.shellId, shelfId: 'r5', lane: 1 });
    const v = validatePlacement(SRA_BOYS_TRAILER, [dan], [pin], [], {
      shellId: dan.shellId,
      shelfId: 'r5',
      lane: 0,
      offsetCm: -120,
      bowForward: false,
      locked: false,
      reasons: [],
    });
    expect(v.violations).toEqual([
      { ruleId: pin.id, text: 'Dan goes on the top level, wide side, outside lane', hard: true },
    ]);
    const onRack = rule('pin', { shellId: dan.shellId, shelfId: 'g5', lane: 1 });
    expect(packTrailer(GOALPOST_41FT, [dan], [onRack], []).placements[0]!.reasons[0]!.text).toBe(
      'Dan goes on the top rack, lane 2',
    );
  });

  it('a pin to an unknown shelf leaves the boat unplaced by the pin', () => {
    const pin = rule('pin', { shellId: 'sh_thursday', shelfId: 'nowhere' });
    const result = packTrailer(WIDE_SIDE, [boat('Thursday', '4+')], [pin], []);
    expect(result.unplaced[0]!.reasons[0]!.ruleId).toBe(pin.id);
  });

  it('team-together keeps a team side by side', () => {
    const t = trailer('t', [
      shelf('a', 'Level 1, left', 1, 'left', { widthCm: 80 }),
      shelf('b', 'Level 1, right', 1, 'right', { widthCm: 80 }),
      shelf('c', 'Level 2, left', 2, 'left', { widthCm: 80 }),
      shelf('d', 'Level 2, right', 2, 'right', { widthCm: 80 }),
    ]);
    const boats = [
      boat('Alma', '4+', { teamId: 'girls', teamName: 'Junior girls' }),
      boat('Dan', '4+'),
      boat('Legacy', '4+', { teamId: 'girls', teamName: 'Junior girls' }),
      boat('Thursday', '4+'),
    ];
    const team = soft('team-together', 2);
    const result = packTrailer(t, boats, [team], []);
    const tierOf = (id: string) => t.shelves.find((s) => s.id === where(result, id)!.shelfId)!.tier;
    expect(tierOf('sh_alma')).toBe(tierOf('sh_legacy'));
    expect(tierOf('sh_dan')).toBe(tierOf('sh_thursday'));
    expect(where(result, 'sh_alma')!.reasons).toContainEqual({
      ruleId: team.id,
      text: "Keep each team's boats together",
      score: 6,
      hard: false,
    });
    const onlyBoys = soft('team-together', 2, { teamIds: ['girls'] });
    const r2 = packTrailer(t, boats, [onlyBoys], []);
    expect(where(r2, 'sh_dan')!.reasons.some((r) => r.ruleId === onlyBoys.id)).toBe(false);
  });

  it('fragile-inside keeps a fragile boat off the outer lane', () => {
    const fragile = boat('Kokanee', '4+', { fragile: true });
    const other = boat('Alma', '4+', { weightKg: 60 });
    const rule8 = soft('fragile-inside', 1);
    const result = packTrailer(OUTER_FIRST, [other, fragile], [rule8], []);
    expect(fits(result, fragile.shellId).lane).toBe(0);
    expect(fits(result, fragile.shellId).reasons).toContainEqual({
      ruleId: rule8.id,
      text: 'Keep fragile boats in inside lanes',
      score: 8,
      hard: false,
    });
    // On a full-width shelf both edges are outside; the middle lane is inside.
    const across = packTrailer(
      GOALPOST_41FT,
      [
        boat('A four', '4+', { weightKg: 60 }),
        boat('B four', '4+', { weightKg: 55 }),
        { ...fragile },
      ],
      [rule8, soft('heavy-low', 3)],
      [],
    );
    expect(fits(across, fragile.shellId)).toMatchObject({ shelfId: 'g1', lane: 1 });
  });

  it('bowForward follows the trailer default', () => {
    const t = { ...WIDE_SIDE, bowForwardDefault: true };
    expect(packTrailer(t, [boat('Dan', '4+')], [], []).placements[0]!.bowForward).toBe(true);
  });

  it('reports per-shelf metrics', () => {
    const result = packTrailer(SRA_BOYS_TRAILER, boysLoad(), SRA_DEFAULT_RULES, []);
    const r5 = result.metrics.perShelf.find((m) => m.shelfId === 'r5')!;
    expect(r5).toEqual({
      shelfId: 'r5',
      boats: 2,
      lanesUsed: 2,
      weightKg: 192,
      frontOverhangCm: 500,
      rearOverhangCm: 270,
    });
    expect(result.metrics.perShelf).toHaveLength(10);
  });

  it('an empty load packs to nothing', () => {
    const result = packTrailer(SRA_BOYS_TRAILER, [], SRA_DEFAULT_RULES, []);
    expect(result).toEqual({
      placements: [],
      unplaced: [],
      metrics: {
        leftWeightKg: 0,
        rightWeightKg: 0,
        balancePct: 0,
        perShelf: expect.any(Array),
      },
      warnings: [],
    });
  });

  it('a trailer without shelves places nothing and says so', () => {
    const result = packTrailer(trailer('t', []), [boat('Dan', '4+')], [], []);
    expect(result.unplaced[0]!.reasons[0]!.text).toBe('This trailer has no shelves');
  });
});

describe('performance (§13)', () => {
  it('packs 40 boats on 15 shelves quickly', () => {
    const shelves = [1, 2, 3, 4, 5].flatMap((tier) =>
      (['left', 'full', 'right'] as const).map((col) =>
        shelf(`${col}${tier}`, `Level ${tier}, ${col}`, tier, col, {
          widthCm: 100,
          frontOverhangMaxCm: 500,
          rearOverhangMaxCm: 300,
        }),
      ),
    );
    const t = trailer('perf', shelves);
    const boats: PackBoat[] = [];
    const classes = ['8+', '4+', '4x', '2x', '2-', '1x'] as const;
    for (let i = 0; i < 40; i++) {
      boats.push(
        boat(`Boat ${String(i).padStart(2, '0')}`, classes[i % classes.length]!, {
          teamId: `team${i % 4}`,
          firstRaceAt: `2026-05-16T${String(15 + (i % 6)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00.000Z`,
          fragile: i % 9 === 0,
        }),
      );
    }
    const rules: Rule[] = [
      ...SRA_DEFAULT_RULES,
      soft('fragile-inside', 1),
      rule('class-tier', { classes: ['1x', '2x', '2-'], tiers: [1] }),
    ];
    packTrailer(t, boats, rules, []); // warm up
    const start = Date.now();
    const result = packTrailer(t, boats, rules, []);
    const ms = Date.now() - start;
    expect(result.placements.length + result.unplaced.length).toBe(40);
    expect(result.placements.length).toBeGreaterThan(25);
    // Budget is 100 ms (§13); the bound here is generous for slow CI machines.
    expect(ms).toBeLessThan(1000);
  });
});
