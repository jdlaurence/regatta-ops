// The drag-and-drop helpers the trailer page uses (interactive layout, "Why here?").

import { describe, expect, it } from 'vitest';
import {
  dropBoat,
  effectiveShelvesFor,
  explainPlacement,
  layoutReport,
  packTrailer,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
  validatePlacement,
  type Placement,
} from '../../src';
import { boat, boysLoad, rule, SINGLES_SHELF, soft } from './fixtures';

describe('dropBoat', () => {
  const boats = boysLoad();
  const packed = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []).placements;

  it('moves a boat into an empty cell with the offset the packer would use, locked', () => {
    const r = dropBoat(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, packed, 'sh_dan', {
      shelfId: 'r1',
      lane: 1,
    });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.placement).toMatchObject({
      shellId: 'sh_dan',
      shelfId: 'r1',
      lane: 1,
      offsetCm: -120,
      locked: true,
    });
    expect(r.placement!.reasons[0]!.ruleId).toBe('r_fit');
    expect(r.placements).toHaveLength(packed.length);
    expect(r.placements.filter((p) => p.shellId === 'sh_dan')).toEqual([r.placement]);
    // Validating the dropped spot against everyone else agrees.
    expect(
      validatePlacement(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, r.placements, r.placement!).ok,
    ).toBe(true);
  });

  it('refuses a drop that breaks a hard rule but returns it flagged', () => {
    const r = dropBoat(
      SRA_BOYS_TRAILER,
      boats,
      SRA_DEFAULT_RULES,
      packed,
      'sh_peggy',
      {
        shelfId: 'l1',
        lane: 0,
      },
      { lock: false },
    );
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual([
      {
        ruleId: 'r_fit',
        text: '19.9 m is longer than the 17.7 m level 1, narrow side takes, including overhang',
        hard: true,
      },
    ]);
    expect(r.placement).toMatchObject({ shelfId: 'l1', offsetCm: -250, locked: false });
    expect(r.placement!.reasons).toEqual(r.violations);
  });

  it('refuses a drop into a lane that is taken, naming the fit rule', () => {
    const eightOnR5 = packed.find((p) => p.shelfId === 'r5' && p.lane === 0)!;
    const r = dropBoat(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, packed, 'sh_dan', {
      shelfId: 'r5',
      lane: eightOnR5.lane,
    });
    expect(r.ok).toBe(false);
    expect(r.violations[0]!.ruleId).toBe('r_fit');
    expect(r.violations[0]!.text).toMatch(
      /^Does not fit end to end with \w+: 33\.6 m of 20\.2 m including overhang$/,
    );
  });

  it('reports shelf-level rules for the target', () => {
    const rules = [
      ...SRA_DEFAULT_RULES,
      rule('shelf-classes', { shelfIds: ['l1', 'r1'], classes: ['1x'] }),
    ];
    const r = dropBoat(SRA_BOYS_TRAILER, boats, rules, packed, 'sh_dan', {
      shelfId: 'r1',
      lane: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.violations.map((v) => v.text)).toEqual(['Level 1 holds only 1x']);
    expect(r.placement!.reasons).toEqual(r.violations);
  });

  it('re-packs a lane of unlocked boats so a second single fits end to end', () => {
    const a = boat('Laurel', '1x');
    const b = boat('Hardy', '1x');
    const placements: Placement[] = [
      {
        shellId: a.shellId,
        shelfId: 's1',
        lane: 0,
        offsetCm: 0,
        bowForward: false,
        locked: false,
        reasons: [],
      },
    ];
    const r = dropBoat(SINGLES_SHELF, [a, b], [soft('forward-bias')], placements, b.shellId, {
      shelfId: 's1',
      lane: 0,
    });
    expect(r.ok).toBe(true);
    expect(r.placements.find((p) => p.shellId === a.shellId)!.offsetCm).toBe(-300);
    expect(r.placement!.offsetCm).toBe(550);
    // Against a locked lane-mate the drop goes in front of it when that is the only room.
    const locked = [{ ...placements[0]!, offsetCm: 550, locked: true }];
    const front = dropBoat(SINGLES_SHELF, [a, b], [], locked, b.shellId, {
      shelfId: 's1',
      lane: 0,
    });
    expect(front.ok).toBe(true);
    expect(front.placement!.offsetCm).toBe(-300);
  });

  it('handles unknown shells and shelves', () => {
    const r = dropBoat(SRA_BOYS_TRAILER, boats, [], packed, 'sh_nope', { shelfId: 'l1', lane: 0 });
    expect(r).toMatchObject({ ok: false, placement: null, placements: packed });
    expect(
      dropBoat(SRA_BOYS_TRAILER, boats, [], packed, 'sh_dan', { shelfId: 'zz', lane: 0 })
        .violations[0]!.text,
    ).toBe('This trailer has no such shelf');
  });
});

describe('explainPlacement and layoutReport', () => {
  const boats = boysLoad();
  const packed = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []);

  it('explains a packed boat the same way the packer did', () => {
    for (const p of packed.placements) {
      expect(
        explainPlacement(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, packed.placements, p.shellId),
      ).toEqual(p.reasons);
    }
    expect(
      explainPlacement(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, packed.placements, 'sh_nope'),
    ).toEqual([]);
  });

  it('puts broken rules first for a boat placed where it does not fit', () => {
    const moved = packed.placements.map((p) =>
      p.shellId === 'sh_peggy' ? { ...p, shelfId: 'l1', offsetCm: -250 } : p,
    );
    const reasons = explainPlacement(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, moved, 'sh_peggy');
    expect(reasons[0]).toEqual({
      ruleId: 'r_fit',
      text: 'Sticks out 5.2 m behind; level 1, narrow side allows 3.0 m',
      hard: true,
    });
    expect(reasons.filter((r) => r.hard && r.text.startsWith('Fits'))).toEqual([]);
    const report = layoutReport(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, moved);
    expect(report.warnings[0]).toBe(
      'Peggy breaks a rule: Sticks out 5.2 m behind; level 1, narrow side allows 3.0 m',
    );
  });

  it('reports metrics and unplaced boats for a layout as it stands', () => {
    const report = layoutReport(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, packed.placements);
    expect(report.metrics).toEqual(packed.metrics);
    expect(report.warnings).toEqual(packed.warnings);
    const fewer = layoutReport(
      SRA_BOYS_TRAILER,
      boats,
      SRA_DEFAULT_RULES,
      packed.placements.filter((p) => p.shellId !== 'sh_dan' && p.shellId !== 'sh_alma'),
    );
    expect(fewer.warnings[0]).toBe('2 boats not placed: Dan and Alma');
  });
});

describe('effectiveShelvesFor', () => {
  it('gives the end view lane cells and active flags', () => {
    const shelves = effectiveShelvesFor(SRA_BOYS_TRAILER, [
      THREE_WIDE_EXAMPLE_RULE,
      rule('shelf-off', { shelfIds: ['l1'] }),
      rule('overhang', { tiers: [5], frontMaxCm: 300, rearMaxCm: 120 }),
    ]);
    const byId = Object.fromEntries(shelves.map((s) => [s.def.id, s]));
    expect(byId.l5!.laneSlots).toBe(1);
    expect(byId.r5!.laneSlots).toBe(2);
    expect(byId.r3!.laneSlots).toBe(3);
    expect(byId.l1!.active).toBe(false);
    expect(byId.r5).toMatchObject({ frontMaxCm: 300, rearMaxCm: 120 });
    expect(byId.r4).toMatchObject({ frontMaxCm: 500, rearMaxCm: 300 });
  });
});
