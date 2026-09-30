// Conflict findings for a regatta (PLAN.md §4.5, §9.2): the working set turned into a
// ConflictInput and run through the pure engine, recomputed only when the data changes.

import { useMemo } from 'react';
import { findConflicts, type ConflictInput, type Finding, type Severity } from '@srt/domain';
import { useRegattaWorkingSet, type RegattaWorkingSet } from './working-set';

/** The engine's input for a working set. Pure; exported for tests and feature code. */
export function buildConflictInput(ws: RegattaWorkingSet): ConflictInput {
  const seasonYear = Number(ws.regatta.startDate.slice(0, 4));
  return {
    settings: ws.settings,
    timezone: ws.regatta.timezone,
    seasonYear,
    events: ws.events,
    entries: ws.entries,
    seats: ws.seats,
    athletes: ws.athletes,
    availability: ws.availability,
    shells: ws.shells,
    oarSets: ws.oarSets,
    teams: ws.teams,
    // NOT_ON_TRAILER only means something once a load plan exists.
    ...(ws.loadPlans.length > 0 ? { loadPlacements: ws.placements } : {}),
  };
}

export type SeverityCounts = Record<Severity, number>;

export function countBySeverity(findings: readonly Finding[]): SeverityCounts {
  const counts: SeverityCounts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export interface FindingsResult {
  /** Errors first, then warnings, then info. */
  findings: Finding[];
  counts: SeverityCounts;
  input: ConflictInput | null;
  /** The working set the findings were computed from. */
  workingSet: RegattaWorkingSet | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

/** Every finding for a regatta, recomputed when entries, events, availability, or settings change. */
export function useFindings(regattaId: string | null | undefined): FindingsResult {
  const ws = useRegattaWorkingSet(regattaId);
  const input = useMemo(() => (ws.data ? buildConflictInput(ws.data) : null), [ws.data]);
  const findings = useMemo(() => {
    if (!input) return [];
    return [...findConflicts(input)].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    );
  }, [input]);
  const counts = useMemo(() => countBySeverity(findings), [findings]);
  return {
    findings,
    counts,
    input,
    workingSet: ws.data,
    isLoading: ws.isLoading,
    isError: ws.isError,
    error: ws.error,
    refetch: ws.refetch,
  };
}

/** Findings that involve one entry (for badges on a boat strip). */
export function findingsForEntry(findings: readonly Finding[], entryId: string): Finding[] {
  return findings.filter((f) => f.entryIds.includes(entryId));
}

/** Findings that involve one team (the "this team" filter). */
export function findingsForTeam(findings: readonly Finding[], teamId: string): Finding[] {
  return findings.filter((f) => f.teamIds.includes(teamId));
}

/** The most severe level in a list, or null when it is empty. */
export function worstSeverity(findings: readonly Finding[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    if (f.severity === 'error') return 'error';
    if (f.severity === 'warning') worst = 'warning';
    else if (!worst) worst = 'info';
  }
  return worst;
}
