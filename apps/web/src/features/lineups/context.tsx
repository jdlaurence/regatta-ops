// What every part of the builder reads: the working set and its lookups, the team, findings by
// entry, permissions, layout, and the write actions. Provided once by LineupsPage.

import { createContext, useContext } from 'react';
import type { ConflictInput, Finding, Id, Team } from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';
import type { LineupActions } from './actions';
import type { LineupIndex } from './lib';

export interface LineupContextValue {
  ws: RegattaWorkingSet;
  index: LineupIndex;
  input: ConflictInput;
  team: Team;
  findings: Finding[];
  findingsByEntry: Map<Id, Finding[]>;
  /** Coach or admin (viewers read everything and edit nothing). */
  canEdit: boolean;
  /** Below 768 px: read-mostly, tap a seat for a bottom sheet, no drag. */
  isPhone: boolean;
  /** Room for the roster as a side column (otherwise it sits above the entries). */
  wide: boolean;
  /** Width of the entries column in px (Infinity until measured); see stripFits. */
  entriesWidth: number;
  weightUnit: 'kg' | 'lb';
  seasonYear: number;
  actions: LineupActions;
}

export const LineupContext = createContext<LineupContextValue | null>(null);

export function useLineup(): LineupContextValue {
  const ctx = useContext(LineupContext);
  if (!ctx) throw new Error('useLineup must be used inside the lineup builder.');
  return ctx;
}
