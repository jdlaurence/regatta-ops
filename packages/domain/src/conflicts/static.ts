// Static checks (PLAN.md §9.2): run on every non-scratched entry regardless of time.

import {
  boatClassSpec,
  isOlderAgeGroup,
  juniorAgeGroup,
  seatSide,
  seatsFor,
  shellFits,
  type JuniorAgeGroup,
} from '../boat-classes';
import { athleteName } from '../format';
import type { Entry, Id, Seat } from '../types';
import {
  entrySeatSides,
  eventOf,
  isAvailableOn,
  isDaySpecific,
  oarSetOf,
  shellOf,
  type Ctx,
} from './context';
import { draft, type Draft } from './finding';
import {
  dayName,
  entryName,
  eventName,
  listJoin,
  oarSetName,
  plural,
  shellName,
  withArticle,
} from './messages';

/** The junior age group an event is restricted to, from its category or name ("U17 Men's 8+"). */
export function eventAgeGroup(text: string): Exclude<JuniorAgeGroup, 'open'> | null {
  const m = /\bU\s?-?(15|16|17|19)(?!\d)/i.exec(text);
  return m ? (`U${m[1]}` as Exclude<JuniorAgeGroup, 'open'>) : null;
}

function entryChecks(ctx: Ctx, entry: Entry, out: Draft[]): void {
  const name = entryName(ctx, entry);
  const event = eventOf(ctx, entry);
  const sched = ctx.scheduled.get(entry.id);
  const day = event?.day;
  const t = sched ? sched.t : null;
  const spec = boatClassSpec(entry.boatClass);
  const push = (
    code: Draft['finding']['code'],
    severity: Draft['finding']['severity'],
    message: string,
    subjects: string[] = [],
    resource?: Draft['finding']['resource'],
  ) =>
    out.push(
      draft({
        code,
        severity,
        message,
        entries: [entry],
        subjects: [entry.id, ...subjects],
        ...(resource ? { resource } : {}),
        ...(day ? { day } : {}),
        t,
      }),
    );

  // Schedule
  if (!sched) {
    push(
      'UNSCHEDULED',
      'info',
      event
        ? `${name} is entered in ${eventName(event)}, which has no time yet.`
        : `${name} has no event yet.`,
    );
  }

  // Shell
  const shell = shellOf(ctx, entry);
  if (!shell) {
    push('NO_SHELL', 'warning', `${name} has no shell yet.`);
  } else {
    const sName = shellName(shell);
    const res = { type: 'shell' as const, id: shell.id };
    if (!shellFits(shell, entry.boatClass)) {
      push(
        'CLASS_MISMATCH',
        'error',
        `${sName} is ${withArticle(shell.boatClass)} and cannot race as ${withArticle(entry.boatClass)} in ${name}.`,
        [shell.id],
        res,
      );
    }
    if (shell.status === 'out_of_service' || shell.status === 'retired') {
      const state = shell.status === 'retired' ? 'retired' : 'out of service';
      push(
        'SHELL_OUT_OF_SERVICE',
        'error',
        `${sName} is ${state}, but ${name} is using it.`,
        [shell.id],
        res,
      );
    } else if (shell.status === 'limited') {
      push(
        'SHELL_LIMITED',
        'info',
        `${sName} is in limited service; check its notes before ${name} races.`,
        [shell.id],
        res,
      );
    }
  }

  // Oars
  const oars = oarSetOf(ctx, entry);
  if (!oars) {
    push('NO_OARS', 'warning', `${name} has no oars yet.`);
  } else {
    const oName = oarSetName(oars);
    const res = { type: 'oar_set' as const, id: oars.id };
    if (oars.type !== spec.rigging) {
      const have = oars.type === 'sweep' ? 'sweep oars' : 'sculls';
      const need = spec.rigging === 'sweep' ? 'a sweep boat' : 'a sculling boat';
      push(
        'RIGGING_MISMATCH',
        'error',
        `${oName} is ${have}, but ${name} is ${need}.`,
        [oars.id],
        res,
      );
    } else if (oars.count < spec.oarsNeeded) {
      push(
        'OARS_SHORT',
        'warning',
        `${oName} has ${plural(oars.count, 'oar')}; ${name} needs ${spec.oarsNeeded}.`,
        [oars.id],
        res,
      );
    }
  }

  // Seats
  const template = seatsFor(entry.boatClass);
  const bySeat = new Map<Seat, Id>();
  for (const s of ctx.seatsByEntry.get(entry.id) ?? []) {
    if (s.athleteId && template.includes(s.seat)) bySeat.set(s.seat, s.athleteId);
  }
  const empty = template.length - bySeat.size;
  if (empty > 0) {
    push('SEATS_EMPTY', 'warning', `${name} has ${plural(empty, 'empty seat')}.`);
  }

  const sides = entrySeatSides(entry, shell);
  const ageText = `${event?.category ?? ''} ${event?.name ?? ''}`;
  const eventGroup = eventAgeGroup(ageText);
  const rowerWeights: number[] = [];

  for (const seat of template) {
    const athleteId = bySeat.get(seat);
    if (!athleteId) continue;
    const athlete = ctx.athleteById.get(athleteId);
    if (!athlete) continue;
    const who = athleteName(athlete);
    const subjects = [athlete.id];
    const res = { type: 'athlete' as const, id: athlete.id };
    const isCox = seat === 'cox';
    if (!isCox && athlete.weightKg != null) rowerWeights.push(athlete.weightKg);

    const av = ctx.availabilityByAthlete.get(athlete.id);
    if (av && !isAvailableOn(av, day)) {
      const when = isDaySpecific(av, day) ? `on ${dayName(day!)}` : 'for this regatta';
      const reason = av.reason?.trim() ? ` (${av.reason.trim()})` : '';
      push(
        'ATHLETE_UNAVAILABLE',
        'error',
        `${who} is seated in ${name} but is unavailable ${when}${reason}.`,
        subjects,
        res,
      );
    }

    if (athlete.teamId !== entry.teamId) {
      const home = ctx.teamById.get(athlete.teamId);
      const from = home ? home.shortName || home.name : 'another team';
      push(
        'ATHLETE_BORROWED',
        'info',
        `${who} is borrowed from ${from} for ${name}.`,
        subjects,
        res,
      );
    }

    if (isCox) {
      if (!athlete.canCox) {
        push(
          'COX_NOT_COX',
          'info',
          `${who} is in the cox seat of ${name} but is not marked as a coxswain.`,
          subjects,
          res,
        );
      }
    } else if (spec.rigging === 'scull') {
      if (!athlete.canScull) {
        push(
          'SCULLER_NOT_SCULLER',
          'info',
          `${who} is in seat ${seat} of ${name} but is not marked as a sculler.`,
          subjects,
          res,
        );
      }
    } else {
      const want = seatSide(entry.boatClass, seat, sides);
      if (
        want &&
        (athlete.side === 'port' || athlete.side === 'starboard') &&
        athlete.side !== want
      ) {
        push(
          'SIDE_MISMATCH',
          'info',
          `${who} rows ${athlete.side} but sits in seat ${seat} of ${name}, a ${want} seat.`,
          subjects,
          res,
        );
      }
    }

    if (eventGroup && athlete.birthYear != null) {
      const group = juniorAgeGroup(athlete.birthYear, ctx.input.seasonYear);
      if (isOlderAgeGroup(group, eventGroup)) {
        const is = group === 'open' ? 'past junior age' : group;
        push(
          'AGE_GROUP',
          'info',
          `${name} is in a ${eventGroup} event, but ${who} is ${is}.`,
          subjects,
          res,
        );
      }
    }
  }

  // Crew weight: average rower weight (cox excluded) against the shell's range.
  if (shell && rowerWeights.length > 0) {
    const min = shell.crewWeightMinKg ?? null;
    const max = shell.crewWeightMaxKg ?? null;
    const avg = rowerWeights.reduce((s, w) => s + w, 0) / rowerWeights.length;
    const label = shell.weightClassLabel?.trim() ? ` (${shell.weightClassLabel.trim()})` : '';
    const res = { type: 'shell' as const, id: shell.id };
    const avgText = `${name} averages ${Math.round(avg)} kg a rower`;
    if (max != null && avg > max) {
      push(
        'CREW_WEIGHT',
        'info',
        `${avgText}, above the ${Math.round(max)} kg limit for ${shellName(shell)}${label}.`,
        [shell.id],
        res,
      );
    } else if (min != null && avg < min) {
      push(
        'CREW_WEIGHT',
        'info',
        `${avgText}, below the ${Math.round(min)} kg minimum for ${shellName(shell)}${label}.`,
        [shell.id],
        res,
      );
    }
  }
}

/** NOT_ON_TRAILER: one finding per shell used by a non-scratched entry with no placement. */
function trailerChecks(ctx: Ctx, out: Draft[]): void {
  const placements = ctx.input.loadPlacements;
  if (!placements) return;
  const placed = new Set(placements.map((p) => p.shellId));
  const users = new Map<Id, Entry[]>();
  for (const entry of ctx.entries) {
    const shell = shellOf(ctx, entry);
    if (!shell || placed.has(shell.id)) continue;
    const list = users.get(shell.id);
    if (list) list.push(entry);
    else users.set(shell.id, [entry]);
  }
  const timeOf = (e: Entry) => ctx.scheduled.get(e.id)?.t ?? Number.POSITIVE_INFINITY;
  for (const [shellId, entries] of users) {
    entries.sort((a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const first = ctx.scheduled.get(entries[0]!.id);
    const shell = ctx.shellById.get(shellId)!;
    const names = listJoin(entries.map((e) => entryName(ctx, e)));
    out.push(
      draft({
        code: 'NOT_ON_TRAILER',
        severity: 'warning',
        message: `${shellName(shell)} is used by ${names} but is not on a trailer.`,
        entries,
        subjects: [shellId],
        resource: { type: 'shell', id: shellId },
        ...(first ? { day: first.day } : {}),
        t: first ? first.t : null,
      }),
    );
  }
}

export function staticChecks(ctx: Ctx, out: Draft[]): void {
  for (const entry of ctx.entries) entryChecks(ctx, entry, out);
  trailerChecks(ctx, out);
}
