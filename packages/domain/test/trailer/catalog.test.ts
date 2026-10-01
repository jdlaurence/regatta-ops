import { describe, expect, it } from 'vitest';
import {
  catalogEntry,
  explain,
  HARD_RULE_TYPES,
  isRegattaOverride,
  makeRule,
  mergeRules,
  overrideRule,
  regattaOverrides,
  RULE_CATALOG,
  RULE_TYPES,
  deriveRuleId,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
} from '../../src';

describe('RULE_CATALOG', () => {
  it('has every rule type exactly once, hard where §9.3.3 says', () => {
    expect(RULE_CATALOG.map((e) => e.type).sort()).toEqual([...RULE_TYPES].sort());
    for (const e of RULE_CATALOG) expect(e.hard).toBe(HARD_RULE_TYPES.includes(e.type));
  });

  it('lists the gallery in order, with the built-in fit rule kept out', () => {
    expect(RULE_CATALOG.filter((e) => e.inGallery).map((e) => e.title)).toEqual([
      'Only certain boat classes on a shelf',
      'A shelf fits N boats side by side',
      "Don't use a shelf",
      'Overhang limits for a tier',
      'Prefer certain classes on a tier',
      'Keep heavier boats low',
      'Put weight forward, not behind',
      'Balance the two sides',
      'Boats racing first are easiest to reach',
      "Keep a team's boats together",
      'Pin a shell to a spot',
      'A shelf holds at most N boats',
      'Keep fragile boats in inside lanes',
    ]);
    expect(catalogEntry('fit').inGallery).toBe(false);
  });

  it('says which pickers each rule needs', () => {
    expect(catalogEntry('shelf-classes').needs).toMatchObject({
      shelf: 'many',
      classes: 'required',
    });
    expect(catalogEntry('shelf-lanes').needs).toMatchObject({ shelf: 'one', classes: 'optional' });
    expect(catalogEntry('shelf-lanes').needs.numbers.map((n) => n.key)).toEqual(['lanes']);
    expect(catalogEntry('overhang').needs).toMatchObject({ tiers: true, shelf: null });
    expect(catalogEntry('class-tier').needs).toMatchObject({ tiers: true, classes: 'required' });
    expect(catalogEntry('pin').needs).toMatchObject({ shell: true, shelf: 'one', lane: true });
    expect(catalogEntry('team-together').needs.teams).toBe(true);
    expect(catalogEntry('heavy-low').needs).toMatchObject({
      shelf: null,
      tiers: false,
      classes: null,
      shell: false,
      numbers: [],
    });
    expect(() => catalogEntry('nope' as never)).toThrow('Unknown rule type: nope');
  });
});

describe('makeRule', () => {
  it('fills catalog defaults and derives a stable id from the params', () => {
    const a = makeRule('shelf-lanes', { shelfId: 'r3', lanes: 3 });
    expect(a).toEqual({
      id: a.id,
      type: 'shelf-lanes',
      hard: true,
      weight: 3,
      enabled: true,
      origin: 'regatta',
      params: { shelfId: 'r3', lanes: 3 },
    });
    expect(a.id).toMatch(/^r_shelf-lanes_[0-9a-f]{8}$/);
    expect(makeRule('shelf-lanes', { lanes: 3, shelfId: 'r3' }).id).toBe(a.id);
    expect(makeRule('shelf-lanes', { shelfId: 'r4', lanes: 3 }).id).not.toBe(a.id);
    expect(deriveRuleId('shelf-lanes', { shelfId: 'r3', lanes: 3, classes: undefined })).toBe(a.id);
  });

  it('takes an origin and an explicit id', () => {
    const r = makeRule('side-balance', {}, 'trailer', 'r_balance');
    expect(r).toEqual({
      id: 'r_balance',
      type: 'side-balance',
      hard: false,
      weight: 2,
      enabled: true,
      origin: 'trailer',
      params: { tolerancePct: 20 },
    });
    expect(makeRule('fit').params).toEqual({ clearanceCm: 20, gapCm: 30 });
  });

  it('makes a rule for every type that explain can read', () => {
    for (const type of RULE_TYPES) {
      expect(explain(makeRule(type), SRA_BOYS_TRAILER).length).toBeGreaterThan(5);
    }
  });
});

describe('mergeRules', () => {
  it('replaces trailer rules by id and appends regatta-only rules', () => {
    const lowerEights = overrideRule(SRA_DEFAULT_RULES[1]!, { weight: 1 });
    const offBalance = overrideRule(SRA_DEFAULT_RULES[5]!, { enabled: false });
    const merged = mergeRules(SRA_DEFAULT_RULES, [
      THREE_WIDE_EXAMPLE_RULE,
      lowerEights,
      offBalance,
    ]);
    expect(merged.map((r) => r.id)).toEqual([
      ...SRA_DEFAULT_RULES.map((r) => r.id),
      'r_three_wide',
    ]);
    expect(merged[1]).toEqual({ ...SRA_DEFAULT_RULES[1], weight: 1, origin: 'regatta' });
    expect(merged[5]!.enabled).toBe(false);
    expect(merged.filter(isRegattaOverride).map((r) => r.id)).toEqual([
      'r_eights_top',
      'r_balance',
      'r_three_wide',
    ]);
    expect(regattaOverrides(merged)).toHaveLength(3);
    expect(isRegattaOverride(SRA_DEFAULT_RULES[0]!)).toBe(false);
  });

  it('with no overrides is the trailer defaults', () => {
    expect(mergeRules(SRA_DEFAULT_RULES, [])).toEqual(SRA_DEFAULT_RULES);
  });
});
