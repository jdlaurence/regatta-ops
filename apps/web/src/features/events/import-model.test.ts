// Paste import model (PLAN.md §4.3, §9.5) on the club's reference schedule and a
// RegattaCentral-style paste. Equipment names only; no athletes.

import { describe, expect, it } from 'vitest';
import { clockAt } from '@srt/domain';
import {
  importCountText,
  importDay,
  importRecords,
  parsePaste,
  remap,
  rowIssues,
  setColumnRole,
} from './import-model';
import { NW_DAYS, REFERENCE_CSV, REGATTACENTRAL } from './__fixtures__/paste-samples';

const TZ = 'America/Los_Angeles';

describe('the reference schedule CSV', () => {
  const parsed = parsePaste(REFERENCE_CSV, { days: NW_DAYS });

  it('maps its columns and keeps every row on its own day', () => {
    expect(parsed.columns.map((c) => c.role)).toEqual([
      'day',
      'time',
      'ignore',
      'name',
      'boatClass',
      'stage',
      'ignore',
      'ignore',
    ]);
    const rows = parsed.rows;
    expect(rows.length).toBeGreaterThan(60);
    expect(importCountText(rows)).toMatch(/^\d+ races and \d+ logistics items$/);
    expect(new Set(rows.map((r) => importDay(r, NW_DAYS, '2025-05-16')))).toEqual(new Set(NW_DAYS));
    // Races without a time in the sheet are rare; logistics lines carry none.
    const issues = rows.flatMap((r) =>
      rowIssues(r, parsed.columns, { days: NW_DAYS }, NW_DAYS[0]!),
    );
    expect(issues).toEqual([]);
  });

  it('builds records with instants in the regatta zone and running sort order', () => {
    const records = importRecords(parsed.rows, [], {
      regattaId: 'regattanwyouth1',
      timezone: TZ,
      days: NW_DAYS,
      fallbackDay: NW_DAYS[0]!,
      startSortOrder: 10,
      source: 'schedule.csv',
    });
    expect(records).toHaveLength(parsed.rows.length);
    const lll = records.find((r) => r.name === "2V Men's 8+" && r.day === '2025-05-16')!;
    expect(clockAt(lll.scheduledAt!, TZ)).toBe('8:16');
    expect(lll).toMatchObject({ kind: 'race', boatClass: '8+', stage: 'time_trial' });
    expect(records[0]!.sortOrder).toBe(10);
    expect(records.at(-1)!.sortOrder).toBe(10 + records.length - 1);
    expect(records.every((r) => r.source === 'schedule.csv')).toBe(true);
    const bus = records.find((r) => r.kind === 'logistics')!;
    expect(bus).toMatchObject({ scheduledAt: null, day: '2025-05-16' });
    expect(bus.boatClass).toBeUndefined();
  });
});

describe('a RegattaCentral-style paste', () => {
  const days = ['2026-11-01'];
  const parsed = parsePaste(REGATTACENTRAL, { days });

  it('flags what it could not read', () => {
    const last = parsed.rows.at(-1)!;
    expect(rowIssues(last, parsed.columns, { days }, days[0]!).map((i) => i.message)).toEqual([
      '"9.40" is not a time. It imports as TBD.',
      'No boat class found. Set it after importing.',
    ]);
    // "TBD" is a known blank time, not a problem.
    expect(rowIssues(parsed.rows[5]!, parsed.columns, { days }, days[0]!)).toEqual([]);
  });

  it('re-maps when the coach changes a column, moving a taken role off its old column', () => {
    const time = parsed.columns.find((c) => c.role === 'time')!.index;
    const name = parsed.columns.find((c) => c.role === 'name')!.index;
    const cols = setColumnRole(parsed.columns, name, 'time');
    expect(cols.find((c) => c.index === time)!.role).toBe('ignore');
    expect(cols.find((c) => c.index === name)!.role).toBe('time');
    // Several columns may share name, category, or ignore.
    const two = setColumnRole(parsed.columns, time, 'name');
    expect(two.filter((c) => c.role === 'name')).toHaveLength(2);

    const stage = parsed.columns.find((c) => c.role === 'stage')!.index;
    const noStage = remap(parsed.raw, setColumnRole(parsed.columns, stage, 'ignore'), { days });
    expect(parsed.rows[2]!.stage).toBe('final');
    expect(noStage.map((r) => r.stage ?? null)).toEqual(noStage.map(() => null));
  });

  it('skips unchecked rows and puts rows on the chosen day', () => {
    const included = parsed.rows.map((_, i) => i !== 3);
    const records = importRecords(parsed.rows, included, {
      regattaId: 'regattahotl0001',
      timezone: TZ,
      days,
      fallbackDay: days[0]!,
      startSortOrder: 1,
      source: 'paste',
    });
    expect(records.map((r) => r.eventNumber ?? r.name)).toEqual([
      '1',
      '2',
      '14A',
      '31',
      '40',
      '41',
    ]);
    expect(records.every((r) => r.day === '2026-11-01')).toBe(true);
    expect(clockAt(records[3]!.scheduledAt!, TZ)).toBe('13:04');
    expect(records[4]!.scheduledAt).toBeNull();
  });
});
