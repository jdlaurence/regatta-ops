// Finding construction, stable ids, and deterministic ordering (PLAN.md §9.2).

import { hash32 } from '../ids';
import type { Entry, Id } from '../types';
import type { Finding, FindingCode, Severity } from './types';

/** `'f_' + hash32(code + sorted subject ids)`: stable across runs, so acknowledgments persist. */
export function findingId(code: FindingCode, subjectIds: readonly string[]): string {
  return `f_${hash32([code, ...[...subjectIds].sort()].join('|'))}`;
}

/** A finding plus the race time used for ordering (null when unscheduled). */
export interface Draft {
  finding: Finding;
  t: number | null;
}

export interface DraftSpec {
  code: FindingCode;
  severity: Severity;
  message: string;
  /** Entries involved, in time order for pairs (the later entry last). */
  entries: Entry[];
  /** Ids that identify the finding besides the code: entries, athlete, shell, oar set. */
  subjects: string[];
  resource?: Finding['resource'];
  day?: string;
  gapMin?: number;
  acknowledged?: boolean;
  t: number | null;
}

export function draft(spec: DraftSpec): Draft {
  const teamIds: Id[] = [];
  for (const e of spec.entries) if (!teamIds.includes(e.teamId)) teamIds.push(e.teamId);
  const finding: Finding = {
    id: findingId(spec.code, spec.subjects),
    code: spec.code,
    severity: spec.severity,
    message: spec.message,
    entryIds: spec.entries.map((e) => e.id),
    teamIds,
  };
  if (spec.resource) finding.resource = spec.resource;
  if (spec.day) finding.day = spec.day;
  if (spec.gapMin !== undefined) finding.gapMin = spec.gapMin;
  if (spec.acknowledged !== undefined) finding.acknowledged = spec.acknowledged;
  return { finding, t: spec.t };
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Severity (error, warning, info), then day, then time, then code; ties by id then message. */
export function compareDrafts(a: Draft, b: Draft): number {
  const fa = a.finding;
  const fb = b.finding;
  return (
    SEVERITY_RANK[fa.severity] - SEVERITY_RANK[fb.severity] ||
    cmp(fa.day ?? '￿', fb.day ?? '￿') ||
    cmp(a.t ?? Number.POSITIVE_INFINITY, b.t ?? Number.POSITIVE_INFINITY) ||
    cmp(fa.code, fb.code) ||
    cmp(fa.id, fb.id) ||
    cmp(fa.message, fb.message)
  );
}
