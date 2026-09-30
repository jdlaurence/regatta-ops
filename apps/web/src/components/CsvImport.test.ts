import { describe, expect, it } from 'vitest';
import {
  assignColumn,
  guessColumns,
  normalizeHeader,
  readCsvTable,
  readyRows,
  type CsvField,
} from './CsvImport';

describe('CSV import helpers', () => {
  it('reads comma and tab text, padding short rows and naming blank headers', () => {
    expect(readCsvTable('a,b,\n1,2,3\n4\n')).toEqual({
      headers: ['a', 'b', 'Column 3'],
      rows: [
        ['1', '2', '3'],
        ['4', '', ''],
      ],
    });
    expect(readCsvTable('x\ty\n1\t2', false)).toEqual({
      headers: ['Column 1', 'Column 2'],
      rows: [
        ['x', 'y'],
        ['1', '2'],
      ],
    });
    expect(readCsvTable('   ')).toEqual({ headers: [], rows: [] });
  });

  it('normalizes headers for matching', () => {
    expect(normalizeHeader('  Weight (lbs.) ')).toBe('weight lbs');
    expect(normalizeHeader('Côx?')).toBe('cox');
    expect(normalizeHeader('P/S')).toBe('p/s');
  });

  it('guesses exact names first, then the longest alias inside a header', () => {
    const fields: CsvField<'a' | 'b'>[] = [
      { key: 'a', label: 'Shell', aliases: ['boat'] },
      { key: 'b', label: 'Shell class', aliases: ['class'] },
    ];
    expect(guessColumns(['Boat class', 'Boat'], fields)).toEqual(['b', 'a']);
  });

  it('moves a field to the column it is assigned to', () => {
    expect(assignColumn(['a', 'b', null], 2, 'a')).toEqual([null, 'b', 'a']);
    expect(assignColumn(['a', 'b', null], 0, null)).toEqual([null, 'b', null]);
  });

  it('keeps only rows without errors that were not skipped', () => {
    const row = (id: string, over: object) => ({
      id,
      label: id,
      cells: [],
      errors: [],
      warnings: [],
      data: id,
      ...over,
    });
    expect(
      readyRows({
        columns: [],
        rows: [
          row('1', {}),
          row('2', { errors: ['bad'], data: null }),
          row('3', { skipped: true }),
        ],
      }),
    ).toEqual(['1']);
  });
});
