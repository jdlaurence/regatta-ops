// Real junior rosters for pnpm pb:seed, pb:reset, and demo mode (PLAN.md §14). Node only:
// `@regatta-ops/seed/local-rosters`, never imported by the seed itself, which stays pure. Reads the club's
// roster workbooks in data/, which git ignores, so athletes' names reach the local database and
// the local demo build and never the repository. Sides and sculling are not on the rosters; the
// seed assigns them.
//
// Boys: the "Age Groups" sheet, a name cell ("First Last", "(cox)" for coxswains, a nickname in
// parentheses) next to a birth year, in bold for rowers new this season (novices).
// Girls: the sheet with "First Name", "Last Name", "Exp/Nov", "DOB", "Grade", and "Role" columns.

import { readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import type { RosterAthlete } from './people';

export const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA_DIR = join(REPO_DIR, 'data');

/** The seed's season: fall 2026, when 12th graders graduate in 2027. */
const SEASON_YEAR = 2026;

export interface LocalRoster {
  team: 'boys' | 'girls';
  /** Relative to the repository. */
  file: string;
  athletes: RosterAthlete[];
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v).trim();
  if (typeof v === 'object' && 'richText' in v)
    return v.richText
      .map((r) => r.text)
      .join('')
      .trim();
  if (typeof v === 'object' && 'result' in v) return String(v.result ?? '').trim();
  return '';
}

function isBold(cell: ExcelJS.Cell): boolean {
  const v = cell.value;
  if (v && typeof v === 'object' && 'richText' in v) return v.richText.some((r) => r.font?.bold);
  return cell.font?.bold === true;
}

/** "First (Nick) Last", "First Last (cox)" → the parts. */
export function parseNameCell(text: string): {
  name: string;
  preferredName?: string;
  cox: boolean;
} {
  let cox = false;
  let preferredName: string | undefined;
  const name = text
    .replace(/\(?\bcox\b\)?/i, () => {
      cox = true;
      return '';
    })
    .replace(/\(([^)]*)\)?/, (_, nick: string) => {
      if (nick.trim()) preferredName = nick.trim();
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name, cox, ...(preferredName && { preferredName }) };
}

function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = name.split(' ');
  return { firstName, lastName: rest.join(' ') };
}

export function readBoys(wb: ExcelJS.Workbook): RosterAthlete[] {
  const ws = wb.getWorksheet('Age Groups');
  if (!ws) throw new Error('No "Age Groups" sheet.');
  const out: RosterAthlete[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 3) return;
    row.eachCell((cell, col) => {
      const year = Number(cellText(row.getCell(col + 1)));
      const text = cellText(cell);
      if (!text || !/[a-z]/i.test(text) || !(year >= 2000 && year <= 2020)) return;
      const { name, preferredName, cox } = parseNameCell(text);
      out.push({
        team: 'boys',
        ...splitName(name),
        ...(preferredName && { preferredName }),
        birthYear: year,
        level: isBold(cell) ? 'novice' : 'experienced',
        cox,
      });
    });
  });
  return out;
}

export function readGirls(wb: ExcelJS.Workbook): RosterAthlete[] {
  for (const ws of wb.worksheets) {
    let header = 0;
    const cols: Record<string, number> = {};
    ws.eachRow((row, rowNumber) => {
      if (header) return;
      row.eachCell((cell, col) => {
        cols[cellText(cell).toLowerCase()] = col;
      });
      if (cols['first name'] && cols['last name']) header = rowNumber;
      else for (const k of Object.keys(cols)) delete cols[k];
    });
    if (!header) continue;
    const need = ['first name', 'last name', 'exp/nov', 'dob', 'grade', 'role'];
    const missing = need.filter((k) => !cols[k]);
    if (missing.length) throw new Error(`Sheet "${ws.name}" has no ${missing.join(', ')} column.`);
    const out: RosterAthlete[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= header) return;
      const get = (k: string) => row.getCell(cols[k]!);
      const first = parseNameCell(cellText(get('first name')));
      const lastName = cellText(get('last name'));
      if (!first.name || !lastName) return;
      const dob = get('dob').value;
      const birthYear = dob instanceof Date ? dob.getUTCFullYear() : Number(cellText(get('dob')));
      const grade = parseInt(cellText(get('grade')), 10);
      out.push({
        team: 'girls',
        firstName: first.name,
        lastName,
        ...(first.preferredName && { preferredName: first.preferredName }),
        birthYear,
        ...(grade >= 1 && grade <= 12 && { gradYear: SEASON_YEAR + 1 + (12 - grade) }),
        level: /^nov/i.test(cellText(get('exp/nov'))) ? 'novice' : 'experienced',
        cox: /cox/i.test(cellText(get('role'))),
      });
    });
    return out;
  }
  throw new Error('No sheet with "First Name" and "Last Name" columns.');
}

/** The newest roster workbook per team in data/ ("...Boys...Roster....xlsx"), if any. */
async function findWorkbooks(dir: string): Promise<{ team: 'boys' | 'girls'; file: string }[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: { team: 'boys' | 'girls'; file: string }[] = [];
  for (const team of ['boys', 'girls'] as const) {
    const matches = names.filter(
      (n) => /roster/i.test(n) && n.endsWith('.xlsx') && new RegExp(team.slice(0, -1), 'i').test(n),
    );
    const dated = await Promise.all(
      matches.map(async (n) => ({ file: join(dir, n), mtime: (await stat(join(dir, n))).mtimeMs })),
    );
    const newest = dated.sort((a, b) => b.mtime - a.mtime)[0];
    if (newest) out.push({ team, file: newest.file });
  }
  return out;
}

/**
 * Reads the junior rosters in data/. Empty when there are none or REGATTA_OPS_SEED_INVENTED is set, and
 * the seed then invents both teams.
 */
export async function readLocalRosters(dir = DATA_DIR): Promise<LocalRoster[]> {
  if (process.env.REGATTA_OPS_SEED_INVENTED) return [];
  const out: LocalRoster[] = [];
  for (const { team, file } of await findWorkbooks(dir)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const where = relative(REPO_DIR, file);
    let athletes: RosterAthlete[];
    try {
      athletes = team === 'boys' ? readBoys(wb) : readGirls(wb);
    } catch (err) {
      throw new Error(`${where}: ${err instanceof Error ? err.message : String(err)}`, {
        cause: err,
      });
    }
    if (athletes.length === 0) throw new Error(`${where}: no athletes found.`);
    out.push({ team, file: where, athletes });
  }
  return out;
}
