import { describe, expect, it } from 'vitest';
import { cardColumns, CARD_MIN, packRuns, WIDE_MIN } from './layout';

describe('builder layout', () => {
  it('fits three boats across a laptop with the roster beside them, one on a phone', () => {
    // 1280 px: 984 px of builder, less the roster column and its gap.
    expect(cardColumns(984 - 264)).toBe(3);
    expect(cardColumns(358)).toBe(1);
    expect(cardColumns(CARD_MIN - 1)).toBe(1);
    expect(cardColumns(0)).toBe(1);
    expect(WIDE_MIN).toBe(728);
  });

  it('fills rows in order and continues an event on the next row instead of leaving a hole', () => {
    // V8, 2V8, U17 A and B, N8 A and B on three columns.
    expect(packRuns([1, 1, 2, 2], 3)).toEqual([
      [{ row: 0, col: 0, count: 1, offset: 0 }],
      [{ row: 0, col: 1, count: 1, offset: 0 }],
      [
        { row: 0, col: 2, count: 1, offset: 0 },
        { row: 1, col: 0, count: 1, offset: 1 },
      ],
      [{ row: 1, col: 1, count: 2, offset: 0 }],
    ]);
  });

  it('gives an event with no entries one cell, and wraps long events over several rows', () => {
    expect(packRuns([0, 5], 2)).toEqual([
      [{ row: 0, col: 0, count: 1, offset: 0 }],
      [
        { row: 0, col: 1, count: 1, offset: 0 },
        { row: 1, col: 0, count: 2, offset: 1 },
        { row: 2, col: 0, count: 2, offset: 3 },
      ],
    ]);
    expect(
      packRuns([2, 1], 1)
        .flat()
        .map((r) => r.row),
    ).toEqual([0, 1, 2]);
  });
});
