// Counts for the regattas list and the regatta overview (PLAN.md §4.1, §6.1, §6.2): entries,
// boated athletes, conflicts by severity, and load plan status per team. Pure; the pages feed
// it the working set and the findings.

import {
  isComing,
  unboatedAthletes,
  type ConflictInput,
  type Entry,
  type Finding,
  type LoadPlacement,
  type LoadPlan,
  type Team,
} from '@srt/domain';
import { countBySeverity, findingsForTeam, type SeverityCounts } from '@/data';
import type { RegattaWorkingSet } from '@/data';

export interface LoadStatus {
  /** 'none' until a load plan exists; 'final' only when every plan is final. */
  state: 'none' | 'draft' | 'final';
  /** Distinct shells the entries use that have a placement on one of the regatta's plans. */
  placed: number;
  /** Distinct shells the entries use. */
  needed: number;
}

/** Load plan status for a set of entries (one team's, or the whole regatta's). */
export function loadStatus(
  entries: readonly Pick<Entry, 'shellId' | 'status'>[],
  loadPlans: readonly Pick<LoadPlan, 'id' | 'status'>[],
  placements: readonly Pick<LoadPlacement, 'loadPlanId' | 'shellId'>[],
): LoadStatus {
  const shells = new Set<string>();
  for (const e of entries) if (e.status !== 'scratched' && e.shellId) shells.add(e.shellId);
  if (loadPlans.length === 0) return { state: 'none', placed: 0, needed: shells.size };
  const planIds = new Set(loadPlans.map((p) => p.id));
  const onTrailer = new Set(
    placements.filter((p) => planIds.has(p.loadPlanId)).map((p) => p.shellId),
  );
  let placed = 0;
  for (const s of shells) if (onTrailer.has(s)) placed++;
  const state = loadPlans.every((p) => p.status === 'final') ? 'final' : 'draft';
  return { state, placed, needed: shells.size };
}

/** "Draft · 18 of 22 placed", "Final · 22 of 22 placed", "No load plan". */
export function loadStatusText(s: LoadStatus): string {
  if (s.state === 'none') return 'No load plan';
  const word = s.state === 'final' ? 'Final' : 'Draft';
  return s.needed === 0 ? word : `${word} · ${s.placed} of ${s.needed} placed`;
}

export interface TeamSummary {
  team: Team;
  /** The regatta_teams record that makes the team a participant. */
  regattaTeamId: string;
  /** Entries that are not scratched. */
  entries: number;
  /** Every entry, scratched too: a team can leave the regatta only when this is 0. */
  allEntries: number;
  /** Active athletes coming (available on at least one day) and seated in a team entry. */
  boated: number;
  /** Active athletes on the roster who are coming. */
  coming: number;
  findings: Finding[];
  counts: SeverityCounts;
  load: LoadStatus;
}

/** One row per participating team, in team order (PLAN.md §6.2). */
export function teamSummaries(
  ws: RegattaWorkingSet,
  input: ConflictInput,
  findings: readonly Finding[],
): TeamSummary[] {
  const days = Array.from(new Set(input.events.map((e) => e.day))).sort();
  const availability = new Map(ws.availability.map((a) => [a.athleteId, a]));
  const rtByTeam = new Map(ws.regattaTeams.map((rt) => [rt.teamId, rt.id]));
  return ws.participatingTeams.map((team) => {
    const teamEntries = ws.entries.filter((e) => e.teamId === team.id);
    const live = teamEntries.filter((e) => e.status !== 'scratched');
    const coming = ws.athletes.filter(
      (a) =>
        a.teamId === team.id && a.status === 'active' && isComing(availability.get(a.id), days),
    ).length;
    const unboated = unboatedAthletes(input, team.id).length;
    const teamFindings = findingsForTeam(findings, team.id);
    return {
      team,
      regattaTeamId: rtByTeam.get(team.id) ?? '',
      entries: live.length,
      allEntries: teamEntries.length,
      boated: coming - unboated,
      coming,
      findings: teamFindings,
      counts: countBySeverity(teamFindings),
      load: loadStatus(teamEntries, ws.loadPlans, ws.placements),
    };
  });
}

export interface RegattaSummary {
  teams: Team[];
  entries: number;
  counts: SeverityCounts;
  load: LoadStatus;
}

/** The whole regatta at a glance, for the regattas list. */
export function regattaSummary(
  ws: RegattaWorkingSet,
  findings: readonly Finding[],
): RegattaSummary {
  return {
    teams: ws.participatingTeams,
    entries: ws.entries.filter((e) => e.status !== 'scratched').length,
    counts: countBySeverity(findings),
    load: loadStatus(ws.entries, ws.loadPlans, ws.placements),
  };
}
