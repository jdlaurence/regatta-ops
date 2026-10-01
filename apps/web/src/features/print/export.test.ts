import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExcelJS from 'exceljs';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS } from '@regatta-ops/seed';
import { NO_FILTERS } from '@/features/schedule/lib';
import { fixtureStore, IDS } from '@/test/fixtures';
import {
  dayScheduleRows,
  lineupGrids,
  lineupSheetPages,
  lineupsFor,
  listScheduleRows,
  masterScheduleRows,
  runOfShowRows,
} from './derive';
import { ExportButton } from './ExportButton';
import {
  dayScheduleExport,
  exportFileName,
  lineupGridExport,
  lineupSheetExport,
  masterScheduleExport,
  runOfShowExport,
  scheduleListExport,
  type ExportSheet,
} from './export';
import { oarText } from './format';
import { loadWorkingSet, seedStore } from './test-helpers';
import { buildWorkbook, tabName } from './xlsx';

const DAY = '2026-11-01';

async function fixture() {
  const store = fixtureStore();
  await store.update('entries', IDS.entry1, { bowNumber: '212', clams: '1' });
  const ws = await loadWorkingSet(store, IDS.regatta);
  const boys = ws.byId.teams.get(IDS.boys)!;
  return { ws, boys, lineups: lineupsFor(ws, IDS.boys, 'live') };
}

describe('export to Excel', () => {
  it('exports the run of show as printed, in either version', async () => {
    const { ws, boys, lineups } = await fixture();
    const rows = runOfShowRows(ws, lineups, DAY);
    const athletes = runOfShowExport(ws, DAY, rows, { team: boys, version: 'athletes' });
    expect(athletes).toMatchObject({
      name: 'Sun, Nov 1',
      title: 'Junior boys run of show · Head of the Lake · Sun, Nov 1',
    });
    expect(athletes.tables[0]!.rows).toEqual([
      [
        '12',
        'empty',
        "Men's Junior 4+",
        'V4+',
        '212',
        'Spencer',
        'Port stroke',
        '24-C · yellow-white',
        '1',
        '',
        { time: '08:10' },
        { time: '08:40' },
        { time: '08:55' },
        { time: '09:40' },
      ],
    ]);
    const coaches = runOfShowExport(ws, DAY, rows, { team: boys, version: 'coaches' });
    expect(coaches.tables[0]!.columns).toEqual([
      'Crew',
      'Boat meeting',
      'Launch',
      'Race',
      'Shell',
      'Oars',
      'Clams',
      'Bow #',
    ]);
  });

  it('exports the schedules with the rows their sheets show', async () => {
    const { ws, boys, lineups } = await fixture();
    const list = scheduleListExport(ws, DAY, listScheduleRows(ws, lineups, DAY, NO_FILTERS), {
      showEntries: true,
      team: null,
      filterText: null,
    });
    expect(list.tables[0]!.rows.slice(0, 2)).toEqual([
      [{ time: '09:40' }, "Event 12 · Men's Junior 4+ · 4+"],
      [
        '',
        '',
        'Boys V4+',
        'Spencer',
        '24-C · yellow-white',
        expect.stringMatching(/^Cox empty, 4 /),
      ],
    ]);

    const day = dayScheduleExport(ws, DAY, dayScheduleRows(ws, lineups, DAY, IDS.boys), boys);
    expect(day.tables[0]!.columns).not.toContain('Team');
    expect(day.tables[0]!.rows[0]!.slice(0, 5)).toEqual([
      { time: '09:40' },
      'Race',
      "Event 12 Men's Junior 4+",
      'V4+',
      'empty',
    ]);

    const master = masterScheduleExport(ws, DAY, masterScheduleRows(ws, lineups, DAY));
    expect(master.title).toBe('Master schedule · Head of the Lake · Sun, Nov 1');
    expect(master.tables[0]!.rows[0]!.slice(0, 3)).toEqual([{ time: '09:40' }, 'Boys', 'V4+']);
  });

  it('exports the lineup sheet with a column per seat, and the grid as printed', async () => {
    const ws = await loadWorkingSet(seedStore(), SEED_REGATTA_IDS.nwYouth2025);
    const lineups = lineupsFor(ws, SEED_TEAM_IDS.boys, 'published');
    const [page] = lineupSheetPages(lineups, '2025-05-16');
    const sheet = lineupSheetExport(ws, page!, []);
    expect(sheet.name).toBe('Boys Fri, May 16');
    const [table] = sheet.tables;
    expect(table!.columns.slice(0, 7)).toEqual([
      'Time',
      'Crew',
      'Event',
      'Stage',
      'Shell',
      'Oars',
      'Cox',
    ]);
    expect(table!.columns.at(-1)).toBe('Hot seat');
    expect(table!.rows[0]!.slice(0, 2)).toEqual([{ time: '08:00' }, 'V8']);
    expect(table!.rows).toHaveLength(page!.entries.length);

    const grids = lineupGrids(lineups[0]!.entries, {
      timeZone: ws.regatta.timezone,
      withDay: true,
      groupOf: (id) => (id ? ws.byId.events.get(id)?.progressionGroup : undefined) || undefined,
      oarText: (e) => oarText(e, ws.byId.oarSets),
    });
    const grid = lineupGridExport(ws, lineups[0]!, grids, 'All days');
    expect(grid.tables.map((t) => t.heading)).toEqual(['Eights', 'Fours and smaller boats']);
    expect(grid.tables[0]!.rows.map((r) => r[0])).toEqual([
      'Event',
      'Time trial',
      'Final',
      'Cox',
      '8',
      '7',
      '6',
      '5',
      '4',
      '3',
      '2',
      '1',
      'Shell',
      'Oars',
    ]);
  });

  it('names files after the regatta, team, view, and day', async () => {
    const { ws, boys } = await fixture();
    expect(exportFileName(ws, 'run-of-show', { team: boys, day: DAY })).toBe(
      'head-of-the-lake-junior-boys-run-of-show-2026-11-01.xlsx',
    );
    expect(exportFileName(ws, 'master-schedule')).toBe('head-of-the-lake-master-schedule.xlsx');
  });

  it('writes a workbook Excel reads back: one tab per sheet, times as times', async () => {
    const sheets: ExportSheet[] = [
      {
        name: 'Sun, Nov 1',
        title: 'Run of show',
        tables: [
          {
            columns: ['Crew', 'Race'],
            rows: [
              ['V4+', { time: '09:40' }],
              ['V8', 'TBD'],
            ],
          },
        ],
      },
      { name: 'Sun, Nov 1', title: 'Again', tables: [] },
    ];
    const written = await buildWorkbook(ExcelJS, sheets).xlsx.writeBuffer();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(written);
    expect(book.worksheets.map((w) => w.name)).toEqual(['Sun, Nov 1', 'Sun, Nov 1 (2)']);
    const ws = book.worksheets[0]!;
    expect(ws.getCell('A1').value).toBe('Run of show');
    expect(ws.getRow(3).values).toEqual([undefined, 'Crew', 'Race']);
    // Formatted as a time, it reads back as one: 9:40 on Excel's day zero.
    expect(ws.getCell('B4').value).toEqual(new Date('1899-12-30T09:40:00.000Z'));
    expect(ws.getCell('B4').numFmt).toBe('h:mm AM/PM');
    expect(ws.getCell('B5').value).toBe('TBD');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
  });

  it('keeps tab names within what Excel allows', () => {
    const used = new Set<string>();
    expect(tabName('Lineups: [boys] / girls?', used)).toBe('Lineups   boys    girls');
    expect(tabName('x'.repeat(40), used)).toHaveLength(31);
    expect(tabName('X'.repeat(40), used)).toBe(`${'X'.repeat(27)} (2)`);
  });

  it('downloads from the button with the sheets of the view', async () => {
    const user = userEvent.setup();
    const create = vi.fn((_blob: Blob) => 'blob:xlsx');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const sheets = vi.fn((): ExportSheet[] => [
      { name: 'Sheet', title: 'Title', tables: [{ columns: ['A'], rows: [['1']] }] },
    ]);
    render(createElement(ExportButton, { fileName: 'view.xlsx', sheets }));
    await user.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(sheets).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0].type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });
});
