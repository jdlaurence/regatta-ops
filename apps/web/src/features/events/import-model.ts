// Paste import (PLAN.md §4.3, §9.5): the parser's column guesses, the coach's corrections, the
// preview rows with anything unrecognized flagged, and the event records to create. Pure.

import {
  applyColumnMapping,
  parseClockTime,
  parsedEventToRecord,
  parseEventNumber,
  parseScheduleDay,
  parseSchedulePaste,
  type ColumnGuess,
  type ColumnRole,
  type ParsedEvent,
  type PasteOptions,
  type RegattaEvent,
  type SchedulePaste,
} from '@regatta-ops/domain';
import type { CreateInput } from '@/data';
import { formatDay } from '@/lib/dates';

export const ROLE_LABELS: Record<ColumnRole, string> = {
  eventNumber: 'Event number',
  time: 'Time',
  day: 'Day',
  name: 'Name',
  boatClass: 'Boat class',
  category: 'Category',
  stage: 'Stage',
  ignore: 'Ignore',
};

export interface ImportContext {
  regattaId: string;
  timezone: string;
  /** The regatta's days, first to last. */
  days: string[];
}

export function pasteOptions(ctx: Pick<ImportContext, 'days'>): PasteOptions {
  const first = ctx.days[0];
  return { days: ctx.days, ...(first ? { year: Number(first.slice(0, 4)) } : {}) };
}

export function parsePaste(text: string, ctx: Pick<ImportContext, 'days'>): SchedulePaste {
  return parseSchedulePaste(text, pasteOptions(ctx));
}

/** Change one column's role. A role other than name, category, or ignore moves off any other column. */
export function setColumnRole(
  columns: readonly ColumnGuess[],
  index: number,
  role: ColumnRole,
): ColumnGuess[] {
  const shared: ColumnRole[] = ['name', 'category', 'ignore'];
  return columns.map((c) => {
    if (c.index === index) return { ...c, role, confidence: 1 };
    if (!shared.includes(role) && c.role === role) return { ...c, role: 'ignore', confidence: 1 };
    return c;
  });
}

/** A row worth importing: some letters or digits, an event number, or a time. */
export function isImportable(p: ParsedEvent): boolean {
  return /[\p{L}\p{N}]/u.test(p.name) || !!p.eventNumber || !!p.time;
}

/** The rows for a column mapping, without lines of only punctuation. */
export function remap(
  raw: string[][],
  columns: readonly ColumnGuess[],
  ctx: Pick<ImportContext, 'days'>,
): ParsedEvent[] {
  return applyColumnMapping(raw, [...columns], pasteOptions(ctx)).filter(isImportable);
}

export type IssueField = 'eventNumber' | 'time' | 'day' | 'boatClass';

export interface RowIssue {
  field: IssueField;
  message: string;
}

function cellsFor(p: ParsedEvent, columns: readonly ColumnGuess[], role: ColumnRole): string[] {
  return columns
    .filter((c) => c.role === role)
    .map((c) => (p.raw[c.index] ?? '').trim())
    .filter((v) => v !== '');
}

/** What the coach should look at before importing a row. */
export function rowIssues(
  p: ParsedEvent,
  columns: readonly ColumnGuess[],
  ctx: Pick<ImportContext, 'days'>,
  fallbackDay: string,
): RowIssue[] {
  const issues: RowIssue[] = [];
  const time = cellsFor(p, columns, 'time')[0];
  if (time && parseClockTime(time) === undefined) {
    issues.push({ field: 'time', message: `"${time}" is not a time. It imports as TBD.` });
  }
  const num = cellsFor(p, columns, 'eventNumber')[0];
  if (num && parseEventNumber(num) === undefined) {
    issues.push({ field: 'eventNumber', message: `"${num}" is not an event number.` });
  }
  const dayCell = cellsFor(p, columns, 'day')[0];
  const lands = formatDay(importDay(p, ctx.days, fallbackDay), false);
  if (dayCell && parseScheduleDay(dayCell, pasteOptions(ctx)) === undefined) {
    issues.push({
      field: 'day',
      message: `"${dayCell}" is not a day of this regatta. It goes on ${lands}.`,
    });
  } else if (p.day && !ctx.days.includes(p.day)) {
    issues.push({
      field: 'day',
      message: `${formatDay(p.day)} is outside this regatta. It goes on ${lands}.`,
    });
  }
  if (p.kind === 'race' && !p.boatClass) {
    issues.push({ field: 'boatClass', message: 'No boat class found. Set it after importing.' });
  }
  return issues;
}

/** The day a row lands on: its own when it is a regatta day, else the chosen fallback. */
export function importDay(p: ParsedEvent, days: readonly string[], fallbackDay: string): string {
  return p.day && days.includes(p.day) ? p.day : fallbackDay;
}

/** Records for the included rows, in paste order, numbered after the existing events. */
export function importRecords(
  rows: readonly ParsedEvent[],
  included: readonly boolean[],
  ctx: ImportContext & { fallbackDay: string; startSortOrder: number; source: string },
): CreateInput<RegattaEvent>[] {
  const out: CreateInput<RegattaEvent>[] = [];
  rows.forEach((p, i) => {
    if (included[i] === false) return;
    const day = importDay(p, ctx.days, ctx.fallbackDay);
    out.push(
      parsedEventToRecord(
        { ...p, day },
        {
          regattaId: ctx.regattaId,
          timezone: ctx.timezone,
          fallbackDay: ctx.fallbackDay,
          sortOrder: ctx.startSortOrder + out.length,
          source: ctx.source,
        },
      ),
    );
  });
  return out;
}

/** "31 races and 12 logistics items". */
export function importCountText(rows: readonly Pick<ParsedEvent, 'kind'>[]): string {
  const races = rows.filter((r) => r.kind === 'race').length;
  const logistics = rows.length - races;
  const parts: string[] = [];
  if (races > 0) parts.push(`${races} ${races === 1 ? 'race' : 'races'}`);
  if (logistics > 0) {
    parts.push(`${logistics} ${logistics === 1 ? 'logistics item' : 'logistics items'}`);
  }
  return parts.length > 0 ? parts.join(' and ') : 'nothing';
}
