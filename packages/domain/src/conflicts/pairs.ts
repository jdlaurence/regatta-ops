// Resource pairs (PLAN.md §9.2): for each shell, oar set, and athlete, the scheduled entries
// that use it are sorted by race time per day, and each consecutive pair (a, b) is checked with
// gap = b.T − a.busyEnd (minutes from landing to the next race start). Different days never
// pair. Checking consecutive pairs is sufficient because a later race is never closer.

import type { Id } from '../types';
import { clock, msToMinutes, MINUTE_MS, type Ctx, type ScheduledEntry } from './context';
import { draft, type Draft } from './finding';
import { isAcknowledgedBy, pairFingerprint } from './fingerprint';
import {
  entryName,
  equipmentGapClause,
  oarSetName,
  personName,
  plural,
  shellName,
  withArticle,
} from './messages';

function compareScheduled(a: ScheduledEntry, b: ScheduledEntry): number {
  return a.t - b.t || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0);
}

/** Group scheduled entries by resource id, then by day, each list sorted by time. */
function consecutivePairs(
  users: Map<Id, ScheduledEntry[]>,
): { resourceId: Id; a: ScheduledEntry; b: ScheduledEntry }[] {
  const out: { resourceId: Id; a: ScheduledEntry; b: ScheduledEntry }[] = [];
  for (const [resourceId, list] of users) {
    const byDay = new Map<string, ScheduledEntry[]>();
    for (const s of list) {
      const d = byDay.get(s.day);
      if (d) d.push(s);
      else byDay.set(s.day, [s]);
    }
    for (const dayList of byDay.values()) {
      dayList.sort(compareScheduled);
      for (let i = 1; i < dayList.length; i++) {
        out.push({ resourceId, a: dayList[i - 1]!, b: dayList[i]! });
      }
    }
  }
  return out;
}

function addUser(map: Map<Id, ScheduledEntry[]>, key: Id, s: ScheduledEntry): void {
  const list = map.get(key);
  if (!list) map.set(key, [s]);
  else if (!list.includes(s)) list.push(s);
}

function side(s: ScheduledEntry) {
  return { id: s.entry.id, at: s.at };
}

function shellPairs(ctx: Ctx, out: Draft[]): void {
  const { launchLeadMin, hotSeatMinGapMin, rerigMin } = ctx.input.settings;
  const users = new Map<Id, ScheduledEntry[]>();
  for (const s of ctx.scheduled.values()) {
    if (s.entry.shellId && ctx.shellById.has(s.entry.shellId)) addUser(users, s.entry.shellId, s);
  }
  for (const { resourceId, a, b } of consecutivePairs(users)) {
    const shell = ctx.shellById.get(resourceId)!;
    const name = shellName(shell);
    const nameA = entryName(ctx, a.entry);
    const nameB = entryName(ctx, b.entry);
    const timeA = clock(ctx, a.at);
    const timeB = clock(ctx, b.at);
    const rerig = a.entry.boatClass !== b.entry.boatClass;
    const subjects = [a.entry.id, b.entry.id, resourceId];
    const resource = { type: 'shell' as const, id: resourceId };
    if (rerig) {
      out.push(
        draft({
          code: 'RERIG_NEEDED',
          severity: 'info',
          message:
            `${name} is rigged as ${withArticle(a.entry.boatClass)} for ${nameA} at ${timeA} and as ` +
            `${withArticle(b.entry.boatClass)} for ${nameB} at ${timeB}; bring the second rigger set.`,
          entries: [a.entry, b.entry],
          subjects,
          resource,
          day: a.day,
          t: a.t,
        }),
      );
    }
    const landed = a.busyEnd + (rerig ? rerigMin * MINUTE_MS : 0);
    const gap = msToMinutes(b.t - landed);
    if (gap >= launchLeadMin) continue;
    const rerigNote = rerig ? `, counting ${plural(rerigMin, 'minute')} to re-rig` : '';
    const lead = `${name} is used by ${nameA} at ${timeA} and also by ${nameB} at ${timeB}`;
    if (gap >= hotSeatMinGapMin) {
      const fp = pairFingerprint('shell', resourceId, side(a), side(b));
      const acknowledged = isAcknowledgedBy(b.entry, fp);
      out.push(
        draft({
          code: 'SHELL_HOT_SEAT',
          severity: acknowledged ? 'info' : 'warning',
          message:
            `${lead}; ${plural(gap, 'minute')} between the boat landing and the next race` +
            `${rerigNote}, less than the ${launchLeadMin} minute launch lead.`,
          entries: [a.entry, b.entry],
          subjects,
          resource,
          day: a.day,
          gapMin: gap,
          acknowledged,
          t: a.t,
        }),
      );
    } else {
      out.push(
        draft({
          code: 'SHELL_CONFLICT',
          severity: 'error',
          message: `${lead}; ${equipmentGapClause(gap, 'boat')}${rerigNote}.`,
          entries: [a.entry, b.entry],
          subjects,
          resource,
          day: a.day,
          gapMin: gap,
          t: a.t,
        }),
      );
    }
  }
}

function oarPairs(ctx: Ctx, out: Draft[]): void {
  const { launchLeadMin, hotSeatMinGapMin } = ctx.input.settings;
  const users = new Map<Id, ScheduledEntry[]>();
  for (const s of ctx.scheduled.values()) {
    if (s.entry.oarSetId && ctx.oarSetById.has(s.entry.oarSetId)) {
      addUser(users, s.entry.oarSetId, s);
    }
  }
  for (const { resourceId, a, b } of consecutivePairs(users)) {
    const gap = msToMinutes(b.t - a.busyEnd);
    if (gap >= launchLeadMin) continue;
    const oars = ctx.oarSetById.get(resourceId)!;
    const lead =
      `${oarSetName(oars)} is used by ${entryName(ctx, a.entry)} at ${clock(ctx, a.at)} ` +
      `and also by ${entryName(ctx, b.entry)} at ${clock(ctx, b.at)}`;
    const subjects = [a.entry.id, b.entry.id, resourceId];
    const resource = { type: 'oar_set' as const, id: resourceId };
    if (gap >= hotSeatMinGapMin) {
      const fp = pairFingerprint('oar_set', resourceId, side(a), side(b));
      const acknowledged = isAcknowledgedBy(b.entry, fp);
      out.push(
        draft({
          code: 'OARS_HOT_SEAT',
          severity: acknowledged ? 'info' : 'warning',
          message:
            `${lead}; ${plural(gap, 'minute')} between the oars landing and the next race, ` +
            `less than the ${launchLeadMin} minute launch lead.`,
          entries: [a.entry, b.entry],
          subjects,
          resource,
          day: a.day,
          gapMin: gap,
          acknowledged,
          t: a.t,
        }),
      );
    } else {
      out.push(
        draft({
          code: 'OARS_CONFLICT',
          severity: 'error',
          message: `${lead}; ${equipmentGapClause(gap, 'oars')}.`,
          entries: [a.entry, b.entry],
          subjects,
          resource,
          day: a.day,
          gapMin: gap,
          t: a.t,
        }),
      );
    }
  }
}

function athletePairs(ctx: Ctx, out: Draft[]): void {
  const { athleteMinGapMin } = ctx.input.settings;
  const users = new Map<Id, ScheduledEntry[]>();
  for (const s of ctx.scheduled.values()) {
    for (const seat of ctx.seatsByEntry.get(s.entry.id) ?? []) {
      if (seat.athleteId) addUser(users, seat.athleteId, s);
    }
  }
  for (const { resourceId, a, b } of consecutivePairs(users)) {
    const gap = msToMinutes(b.t - a.busyEnd);
    if (gap >= athleteMinGapMin) continue;
    const who = personName(ctx.athleteById.get(resourceId));
    const lead =
      `${who} races in ${entryName(ctx, a.entry)} at ${clock(ctx, a.at)} ` +
      `and ${entryName(ctx, b.entry)} at ${clock(ctx, b.at)}`;
    const base = {
      entries: [a.entry, b.entry],
      subjects: [a.entry.id, b.entry.id, resourceId],
      resource: { type: 'athlete' as const, id: resourceId },
      day: a.day,
      gapMin: gap,
      t: a.t,
    };
    if (gap < 0) {
      out.push(
        draft({
          ...base,
          code: 'ATHLETE_DOUBLE_BOOKED',
          severity: 'error',
          message: `${lead}; the first boat is not back until ${plural(-gap, 'minute')} after the second race starts.`,
        }),
      );
    } else {
      const clause =
        gap === 0
          ? 'the first boat lands just as the second race starts'
          : `only ${plural(gap, 'minute')} between landing and the next race`;
      out.push(
        draft({
          ...base,
          code: 'ATHLETE_TIGHT',
          severity: 'warning',
          message: `${lead}; ${clause}, less than the ${athleteMinGapMin} minute minimum.`,
        }),
      );
    }
  }
}

export function pairChecks(ctx: Ctx, out: Draft[]): void {
  shellPairs(ctx, out);
  oarPairs(ctx, out);
  athletePairs(ctx, out);
}
