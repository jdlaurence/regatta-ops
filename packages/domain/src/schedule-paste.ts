// Schedule paste parser (PLAN.md §9.5). STUB: WP-A replaces the body; the signature is the contract.

import type { BoatClass, EventKind, EventStage } from './types';

export type ColumnRole =
  'eventNumber' | 'time' | 'day' | 'name' | 'boatClass' | 'category' | 'stage' | 'ignore';

export interface ColumnGuess {
  index: number;
  role: ColumnRole;
  /** 0..1 */
  confidence: number;
  header?: string;
}

export interface ParsedEvent {
  kind: EventKind;
  eventNumber?: string;
  name: string;
  boatClass?: BoatClass | null;
  category?: string;
  /** 'YYYY-MM-DD' if a day column was found. */
  day?: string;
  /** 'HH:mm' 24 h, or null for TBD. */
  time?: string | null;
  stage?: EventStage | null;
  raw: string[];
}

export function parseSchedulePaste(_text: string): {
  rows: ParsedEvent[];
  columns: ColumnGuess[];
  confidence: number;
} {
  return { rows: [], columns: [], confidence: 0 };
}

/** Re-apply a (possibly user-edited) column mapping to the raw rows. */
export function applyColumnMapping(_raw: string[][], _columns: ColumnGuess[]): ParsedEvent[] {
  return [];
}
