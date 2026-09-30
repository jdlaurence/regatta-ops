import { describe, expect, it } from 'vitest';
import {
  classNoun,
  explain,
  makeRule,
  meters,
  RULE_TYPES,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
  type Rule,
} from '../../src';
import { CENTER_POST, GOALPOST_41FT, trailer, shelf } from './fixtures';

// §9.3.5 case 11: the catalog table's sentences (§9.3.3) for sample params, on a center-post
// trailer whose racks are named the way the table names them.
const CATALOG_SENTENCES: [Rule, string][] = [
  [
    makeRule('fit', { clearanceCm: 20, gapCm: 30 }),
    'Boats must physically fit: 20 cm between hulls, 30 cm between ends',
  ],
  [
    makeRule('shelf-classes', { shelfIds: ['tl', 'tr'], classes: ['8+', '4+'] }),
    'Top rack holds only 8+ and 4+',
  ],
  [
    makeRule('shelf-lanes', { shelfId: 'ml', lanes: 3, classes: ['4+', '4-', '4x', '4x+'] }),
    'Middle rack, driver side fits 3 fours side by side',
  ],
  [makeRule('shelf-off', { shelfIds: ['tl', 'tr'] }), "Don't use the top rack"],
  [
    makeRule('overhang', { tiers: [3], frontMaxCm: 300, rearMaxCm: 120 }),
    'Top rack may stick out 300 cm in front and 120 cm behind',
  ],
  [
    makeRule('max-boats', { shelfId: 'br', max: 2 }),
    'Bottom rack, curb side holds at most 2 boats',
  ],
  [
    makeRule('pin', { shellId: 'sh_monahan', shelfId: 'tl' }),
    'Monahan goes on the top rack, driver side',
  ],
  [makeRule('class-tier', { classes: ['8+'], tiers: [3] }), 'Prefer eights on the top rack'],
  [makeRule('heavy-low'), 'Keep heavier boats low'],
  [makeRule('forward-bias'), 'Put overhang in front, over the truck, rather than behind'],
  [makeRule('side-balance', { tolerancePct: 10 }), 'Balance weight between the two sides'],
  [makeRule('unload-order'), 'Boats racing first should be easiest to reach'],
  [makeRule('team-together'), "Keep each team's boats together"],
  [makeRule('fragile-inside'), 'Keep fragile boats in inside lanes'],
];

describe('explain (§9.3.5 case 11)', () => {
  it.each(CATALOG_SENTENCES)('%# %j', (rule, sentence) => {
    expect(explain(rule, CENTER_POST, { shellNames: { sh_monahan: 'Monahan' } })).toBe(sentence);
  });

  it('covers every rule type', () => {
    expect(new Set(CATALOG_SENTENCES.map(([r]) => r.type))).toEqual(new Set(RULE_TYPES));
  });

  it('uses SRA shelf labels and level numbers', () => {
    const t = SRA_BOYS_TRAILER;
    const byId = Object.fromEntries(SRA_DEFAULT_RULES.map((r) => [r.id, explain(r, t)]));
    expect(byId).toEqual({
      r_fit: 'Boats must physically fit: 15 cm between hulls, 30 cm between ends',
      r_eights_top: 'Prefer eights on levels 5 and 4',
      r_fours_mid: 'Prefer fours on levels 3 and 2',
      r_heavy_low: 'Keep heavier boats low',
      r_forward: 'Put overhang in front, over the truck, rather than behind',
      r_balance: 'Balance weight between the two sides',
      r_unload: 'Boats racing first should be easiest to reach',
      r_team: "Keep each team's boats together",
    });
    expect(explain(THREE_WIDE_EXAMPLE_RULE, t)).toBe(
      'Level 3, wide side fits 3 fours side by side',
    );
    expect(explain(makeRule('shelf-lanes', { shelfId: 'r5', lanes: 3, classes: ['4+'] }), t)).toBe(
      'Top level, wide side fits 3 fours side by side',
    );
    expect(
      explain(
        makeRule('shelf-classes', { shelfIds: ['l5', 'r5', 'l4', 'r4'], classes: ['8+'] }),
        t,
      ),
    ).toBe('Levels 5 and 4 hold only 8+');
    expect(explain(makeRule('shelf-off', { shelfIds: ['l5', 'r5'] }), t)).toBe(
      "Don't use the top level",
    );
    expect(explain(makeRule('shelf-off', { shelfIds: ['l1'] }), t)).toBe(
      "Don't use level 1, narrow side",
    );
    expect(explain(makeRule('shelf-off', { shelfIds: ['l5', 'r5', 'l1'] }), t)).toBe(
      "Don't use the top level and level 1, narrow side",
    );
    expect(
      explain(makeRule('overhang', { tiers: [5, 4], frontMaxCm: 500, rearMaxCm: 300 }), t),
    ).toBe('Levels 5 and 4 may stick out 500 cm in front and 300 cm behind');
    expect(
      explain(makeRule('pin', { shellId: 'sh_x', shelfId: 'r3', lane: 1 }), t, {
        shellNames: { sh_x: 'Peggy' },
      }),
    ).toBe('Peggy goes on level 3, wide side, outside lane');
    expect(explain(makeRule('pin', { shellId: 'sh_x', shelfId: 'r3', lane: 0 }), t)).toBe(
      'A shell goes on level 3, wide side, inside lane',
    );
  });

  it('names several racks by adjective and falls back gracefully', () => {
    expect(
      explain(makeRule('class-tier', { classes: ['4x', '4x+'], tiers: [2, 1] }), CENTER_POST),
    ).toBe('Prefer quads on the middle and bottom racks');
    expect(
      explain(
        makeRule('overhang', { tiers: [2, 1], frontMaxCm: 250, rearMaxCm: 300 }),
        CENTER_POST,
      ),
    ).toBe('The middle and bottom racks may stick out 250 cm in front and 300 cm behind');
    expect(
      explain(makeRule('shelf-classes', { shelfIds: ['tl', 'mr'], classes: ['8+'] }), CENTER_POST),
    ).toBe('Top rack, driver side and the middle rack, curb side hold only 8+');
    // A goalpost trailer has one shelf per rack, so a shelf reads as its label.
    expect(explain(makeRule('shelf-off', { shelfIds: ['g5'] }), GOALPOST_41FT)).toBe(
      "Don't use the top rack",
    );
    expect(explain(makeRule('shelf-off', { shelfIds: ['g2'] }), GOALPOST_41FT)).toBe(
      "Don't use rack 2",
    );
    expect(explain(makeRule('class-tier', { classes: ['8+'], tiers: [9] }), GOALPOST_41FT)).toBe(
      'Prefer eights on rack 9',
    );
    // Gallery defaults before the coach picks anything.
    expect(explain(makeRule('shelf-classes'), CENTER_POST)).toBe(
      'A shelf holds only certain boat classes',
    );
    expect(explain(makeRule('shelf-lanes'), CENTER_POST)).toBe('A shelf fits 3 boats side by side');
    expect(explain(makeRule('shelf-off'), CENTER_POST)).toBe("Don't use a shelf");
    expect(explain(makeRule('overhang'), CENTER_POST)).toBe(
      'Any rack may stick out 300 cm in front and 120 cm behind',
    );
    expect(explain(makeRule('max-boats', { max: 1 }), CENTER_POST)).toBe(
      'A shelf holds at most 1 boat',
    );
    expect(explain(makeRule('pin'), CENTER_POST)).toBe('A shell goes on a shelf');
    expect(explain(makeRule('class-tier'), CENTER_POST)).toBe('Prefer boats on a rack');
    expect(explain(makeRule('shelf-off', { shelfIds: ['gone'] }), CENTER_POST)).toBe(
      "Don't use a removed shelf",
    );
    expect(explain(makeRule('max-boats', { shelfId: 'gone', max: 2 }), CENTER_POST)).toBe(
      'A removed shelf holds at most 2 boats',
    );
    expect(explain(makeRule('pin', { shellId: 'sh_x', shelfId: 'gone' }), CENTER_POST)).toBe(
      'A shell goes on a removed shelf',
    );
    const unlabeled = trailer('t', [shelf('x', '', 1, 'full')]);
    expect(explain(makeRule('max-boats', { shelfId: 'x', max: 2 }), unlabeled)).toBe(
      'X holds at most 2 boats',
    );
    expect(explain(makeRule('class-tier', { classes: ['8+'], tiers: [1, 2] }), unlabeled)).toBe(
      'Prefer eights on levels 1 and 2',
    );
  });

  it('names teams and hard class-tier rules', () => {
    const names = { teamNames: { boys: 'Junior boys', girls: 'Junior girls', m5: '5am masters' } };
    expect(explain(makeRule('team-together', { teamIds: ['boys'] }), CENTER_POST, names)).toBe(
      "Keep Junior boys' boats together",
    );
    expect(explain(makeRule('team-together', { teamIds: ['m5'] }), CENTER_POST, names)).toBe(
      "Keep 5am masters' boats together",
    );
    expect(
      explain(makeRule('team-together', { teamIds: ['boys', 'girls'] }), CENTER_POST, names),
    ).toBe("Keep each team's boats together: Junior boys and Junior girls");
    expect(explain(makeRule('team-together', { teamIds: ['crew'] }), CENTER_POST)).toBe(
      "Keep crew's boats together",
    );
    const must = { ...makeRule('class-tier', { classes: ['8+', '4+'], tiers: [3] }), hard: true };
    expect(explain(must, CENTER_POST)).toBe('Eights and fours must go on the top rack');
  });

  it('formats lengths and class nouns', () => {
    expect(meters(1990)).toBe('19.9');
    expect(meters(1220)).toBe('12.2');
    expect(meters(1670)).toBe('16.7');
    expect(classNoun(['1x'])).toBe('singles');
    expect(classNoun(['2x'])).toBe('doubles');
    expect(classNoun(['2-', '2+'])).toBe('pairs');
    expect(classNoun(['2x', '2-'])).toBe('pairs and doubles');
    expect(classNoun(['4+', '4x'])).toBe('fours');
    expect(classNoun(['8+', '4x', '1x'])).toBe('eights, quads, and singles');
    expect(classNoun([])).toBe('boats');
  });
});
