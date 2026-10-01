// Writes export sheets to an .xlsx file. exceljs loads on the first export, not with the app.

import type { Workbook } from 'exceljs';
import { downloadBlob } from '@/lib/download';
import type { ExportCell, ExportSheet } from './export';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Excel's limits on tab names: 31 characters, none of : \ / ? * [ ], unique ignoring case. */
export function tabName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** A time as Excel stores it: a fraction of a day. */
function cellValue(cell: ExportCell): string | number {
  if (typeof cell === 'string') return cell;
  const [h, m] = cell.time.split(':').map(Number);
  return ((h ?? 0) * 60 + (m ?? 0)) / 1440;
}

function textLength(cell: ExportCell): number {
  return typeof cell === 'string' ? cell.length : 8;
}

export function buildWorkbook(ExcelJS: { Workbook: new () => Workbook }, sheets: ExportSheet[]) {
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(tabName(sheet.name, used));
    ws.addRow([sheet.title]).font = { bold: true, size: 14 };
    const widths: number[] = [];
    const fit = (cells: readonly ExportCell[]) =>
      cells.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 8, Math.min(textLength(c), 60))));
    let headerRow = 0;
    for (const table of sheet.tables) {
      ws.addRow([]);
      if (table.heading) ws.addRow([table.heading]).font = { bold: true, size: 12 };
      const header = ws.addRow(table.columns);
      header.font = { bold: true };
      header.eachCell((c) => (c.border = { bottom: { style: 'medium' } }));
      headerRow ||= header.number;
      fit(table.columns);
      for (const cells of table.rows) {
        const row = ws.addRow(cells.map(cellValue));
        cells.forEach((c, i) => {
          if (typeof c !== 'string') row.getCell(i + 1).numFmt = 'h:mm AM/PM';
        });
        fit(cells);
      }
    }
    widths.forEach((w, i) => (ws.getColumn(i + 1).width = w + 2));
    // One table: keep its header in view while scrolling.
    if (sheet.tables.length === 1) ws.views = [{ state: 'frozen', ySplit: headerRow }];
  }
  return wb;
}

export async function downloadWorkbook(fileName: string, sheets: ExportSheet[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const buffer = await buildWorkbook(ExcelJS, sheets).xlsx.writeBuffer();
  downloadBlob(fileName, new Blob([buffer], { type: XLSX_TYPE }));
}
