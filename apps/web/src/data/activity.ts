// Activity log sentences (PLAN.md §8.3). MemoryStore uses this to emulate the server's activity
// hook; the summaries read as "<actor> <summary>": "Sam moved entry Girls V4+ to Event 14". The
// server's wording (backend/pb_hooks/regatta-ops/activity.js) is the reference and is richer (it
// joins several changes into one line); this covers the common single changes.

import {
  athleteName,
  clockAt,
  oarSetLabel,
  shellLabel,
  type ActivityEntry,
  type CollectionName,
  type Entry,
  type RegattaEvent,
} from '@regatta-ops/domain';
import type { RecordOf } from './store';

export type Lookup = <C extends CollectionName>(
  collection: C,
  id: string,
) => RecordOf<C> | undefined;

export const LOGGED_COLLECTIONS = [
  'teams',
  'athletes',
  'regattas',
  'regatta_teams',
  'entries',
  'entry_seats',
  'events',
  'availability',
  'load_placements',
  'load_items',
  'shells',
  'oar_sets',
] as const satisfies readonly CollectionName[];

export type LoggedCollection = (typeof LOGGED_COLLECTIONS)[number];

export function isLogged(c: CollectionName): c is LoggedCollection {
  return (LOGGED_COLLECTIONS as readonly string[]).includes(c);
}

const STATUS_WORDS: Record<string, string> = {
  in_service: 'in service',
  limited: 'limited',
  out_of_service: 'out of service',
  retired: 'retired',
};

type Draft = Pick<
  ActivityEntry,
  'regattaId' | 'action' | 'targetType' | 'targetId' | 'summary' | 'diff'
>;

type AnyRecord = Record<string, unknown> & { id: string };

export function diffRecords(
  before: AnyRecord | null,
  after: AnyRecord | null,
): Record<string, { from: unknown; to: unknown }> | null {
  if (!before || !after) return null;
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'updated' || k === 'created' || k === 'updatedBy') continue;
    const a = before[k] ?? null;
    const b = after[k] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: fileValue(a), to: fileValue(b) };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Demo mode keeps photos as data URLs; the log says "file" rather than copying the photo. */
function fileValue(v: unknown): unknown {
  return typeof v === 'string' && v.startsWith('data:') ? 'file' : v;
}

function changed(diff: Record<string, unknown> | null, field: string): boolean {
  return !!diff && field in diff;
}

function entryName(lookup: Lookup, entry: Entry): string {
  const team = lookup('teams', entry.teamId);
  const prefix = team ? team.shortName || team.name : '';
  return `${prefix} ${entry.label}`.trim();
}

function eventName(event: RegattaEvent | undefined): string {
  if (!event) return 'an event';
  if (event.kind === 'logistics') return `"${event.name}"`;
  return event.eventNumber ? `Event ${event.eventNumber}` : event.name;
}

function seatName(seat: string): string {
  return seat === 'cox' ? 'cox' : `seat ${seat}`;
}

/** The activity entry for one change, or null when the change is not worth a line. */
export function describeChange(
  lookup: Lookup,
  collection: CollectionName,
  action: 'create' | 'update' | 'delete',
  beforeRec: object | null,
  afterRec: object | null,
): Draft | null {
  if (!isLogged(collection)) return null;
  const before = beforeRec as AnyRecord | null;
  const after = afterRec as AnyRecord | null;
  const rec = (after ?? before)!;
  let diff = action === 'update' ? diffRecords(before, after) : null;
  // A published snapshot is the whole lineup; the summary says "published" instead.
  if (diff && collection === 'regatta_teams') {
    delete diff.publishedSnapshot;
    if (Object.keys(diff).length === 0) diff = null;
  }
  if (action === 'update' && !diff) return null;
  const base = {
    action,
    // The collection name, as the server hook and the seed write it.
    targetType: collection,
    targetId: rec.id,
    diff,
  };
  const summary = summarize(lookup, collection, action, before, after, diff);
  if (!summary) return null;
  return { ...base, regattaId: regattaOf(lookup, collection, rec), summary: summary.text };
}

function regattaOf(lookup: Lookup, collection: LoggedCollection, rec: AnyRecord): string | null {
  switch (collection) {
    case 'regattas':
      // A deleted regatta takes its activity with it, so its delete line belongs to no regatta.
      return rec.id;
    case 'regatta_teams':
    case 'entries':
    case 'events':
    case 'availability':
    case 'load_items':
      return (rec.regattaId as string | undefined) ?? null;
    case 'entry_seats':
      return lookup('entries', rec.entryId as string)?.regattaId ?? null;
    case 'load_placements':
      return lookup('load_plans', rec.loadPlanId as string)?.regattaId ?? null;
    default:
      return null;
  }
}

function summarize(
  lookup: Lookup,
  collection: LoggedCollection,
  action: 'create' | 'update' | 'delete',
  before: AnyRecord | null,
  after: AnyRecord | null,
  diff: Record<string, unknown> | null,
): { text: string } | null {
  const text = (t: string) => ({ text: t });
  switch (collection) {
    case 'entries': {
      const entry = (after ?? before) as unknown as Entry;
      const name = entryName(lookup, entry);
      if (action === 'create') {
        const ev = entry.eventId ? lookup('events', entry.eventId) : undefined;
        return text(ev ? `added entry ${name} in ${eventName(ev)}` : `added entry ${name}`);
      }
      if (action === 'delete') {
        const ev = entry.eventId ? lookup('events', entry.eventId) : undefined;
        return text(ev ? `deleted entry ${name} from ${eventName(ev)}` : `deleted entry ${name}`);
      }
      const prev = before as unknown as Entry;
      if (changed(diff, 'eventId')) {
        const to = entry.eventId ? lookup('events', entry.eventId) : undefined;
        if (!to) {
          const from = prev.eventId ? lookup('events', prev.eventId) : undefined;
          return text(`took entry ${name} out of ${eventName(from)}`);
        }
        return text(`moved entry ${name} to ${eventName(to)}`);
      }
      if (changed(diff, 'shellId')) {
        const shell = entry.shellId ? lookup('shells', entry.shellId) : undefined;
        return text(
          shell
            ? `set the shell of ${name} to ${shellLabel(shell)}`
            : `cleared the shell of ${name}`,
        );
      }
      if (changed(diff, 'oarSetId')) {
        const oars = entry.oarSetId ? lookup('oar_sets', entry.oarSetId) : undefined;
        return text(
          oars ? `set the oars of ${name} to ${oars.name}` : `cleared the oars of ${name}`,
        );
      }
      if (changed(diff, 'status')) return text(`marked entry ${name} ${entry.status}`);
      if (changed(diff, 'hotSeatAckBy')) {
        return text(
          entry.hotSeatAckBy
            ? `acknowledged the hot seat for ${name}`
            : `reopened the hot seat for ${name}`,
        );
      }
      if (changed(diff, 'label')) {
        return text(`renamed entry ${entryName(lookup, prev)} to ${entry.label}`);
      }
      return text(`edited entry ${name}`);
    }
    case 'entry_seats': {
      const seat = (after ?? before)!;
      const entry = lookup('entries', seat.entryId as string);
      const where = `${seatName(seat.seat as string)} of ${entry ? entryName(lookup, entry) : 'an entry'}`;
      const who = (id: unknown) => {
        const a = typeof id === 'string' ? lookup('athletes', id) : undefined;
        return a ? athleteName(a) : 'an athlete';
      };
      if (action === 'delete') {
        return text(
          before?.athleteId ? `removed ${who(before.athleteId)} from ${where}` : `removed ${where}`,
        );
      }
      const athleteId = after?.athleteId as string | null | undefined;
      if (!athleteId) {
        if (action === 'create') return null;
        return text(
          before?.athleteId
            ? `cleared ${where} (was ${who(before.athleteId)})`
            : `cleared ${where}`,
        );
      }
      if (action === 'update' && !changed(diff, 'athleteId')) return text(`edited ${where}`);
      return text(`set ${where} to ${who(athleteId)}`);
    }
    case 'events': {
      const ev = (after ?? before) as unknown as RegattaEvent;
      const title =
        ev.eventNumber && ev.name ? `Event ${ev.eventNumber}, ${ev.name}` : eventName(ev);
      if (action === 'create') {
        return text(ev.kind === 'logistics' ? `added logistics item ${ev.name}` : `added ${title}`);
      }
      if (action === 'delete') {
        return text(
          ev.kind === 'logistics' ? `deleted logistics item ${ev.name}` : `deleted ${title}`,
        );
      }
      if (changed(diff, 'scheduledAt')) {
        if (!ev.scheduledAt) return text(`cleared the time of ${eventName(ev)}`);
        const tz = lookup('regattas', ev.regattaId)?.timezone ?? 'America/Los_Angeles';
        return text(`moved ${eventName(ev)} to ${clockAt(ev.scheduledAt, tz)}`);
      }
      if (changed(diff, 'name')) return text(`renamed ${eventName(ev)} to ${ev.name}`);
      return text(`edited ${eventName(ev)}`);
    }
    case 'availability': {
      const rec = (after ?? before)!;
      const athlete = lookup('athletes', rec.athleteId as string);
      const who = athlete ? athleteName(athlete) : 'an athlete';
      if (action === 'delete') return text(`marked ${who} available`);
      const status = after?.status as string;
      if (action === 'update' && !changed(diff, 'status')) {
        return text(`changed availability for ${who}`);
      }
      return text(status === 'maybe' ? `marked ${who} as maybe` : `marked ${who} ${status}`);
    }
    case 'load_placements': {
      const rec = (after ?? before)!;
      const shell = lookup('shells', rec.shellId as string);
      const shelf = lookup('trailer_shelves', rec.shelfId as string);
      const trailer = shelf ? lookup('trailers', shelf.trailerId) : undefined;
      const trailerName = trailer ? `the ${trailer.name}` : 'the trailer';
      const boat = shell ? shellLabel(shell) : 'a shell';
      const spot = shelf?.label ? `${trailerName}, ${shelf.label}` : trailerName;
      if (action === 'create') return text(`placed ${boat} on ${spot}`);
      if (action === 'delete') return text(`took ${boat} off ${trailerName}`);
      if (changed(diff, 'shelfId') || changed(diff, 'lane') || changed(diff, 'offsetCm')) {
        return text(`moved ${boat} to ${spot}`);
      }
      if (changed(diff, 'locked'))
        return text(after?.locked ? `locked ${boat} in place` : `unlocked ${boat}`);
      return text(`edited the placement of ${boat}`);
    }
    case 'load_items': {
      const rec = (after ?? before)!;
      const label = String(rec.label ?? 'an item');
      if (action === 'create') return text(`added ${label} to the load list`);
      if (action === 'delete') return text(`removed ${label} from the load list`);
      if (changed(diff, 'loadedAt')) {
        return text(
          after?.loadedAt ? `checked ${label} as loaded` : `unchecked ${label} as loaded`,
        );
      }
      if (changed(diff, 'returnedAt')) {
        return text(
          after?.returnedAt ? `checked ${label} as returned` : `unchecked ${label} as returned`,
        );
      }
      return text(`edited ${label} on the load list`);
    }
    case 'teams': {
      const rec = (after ?? before)!;
      const name = String(rec.name ?? 'a team');
      if (action === 'create') return text(`added team ${name}`);
      if (action === 'delete') return text(`deleted team ${name}`);
      if (changed(diff, 'name')) return text(`renamed team ${String(before?.name)} to ${name}`);
      if (changed(diff, 'archived')) {
        return text(`${after?.archived ? 'archived' : 'restored'} team ${name}`);
      }
      return text(`edited team ${name}`);
    }
    case 'athletes': {
      const rec = (after ?? before)! as unknown as RecordOf<'athletes'>;
      const who = athleteName(rec);
      const team = lookup('teams', rec.teamId);
      const teamName = team?.name ?? 'a team';
      if (action === 'create') return text(`added ${who} to ${teamName}`);
      if (action === 'delete') return text(`removed ${who} from ${teamName}`);
      if (changed(diff, 'teamId')) return text(`moved ${who} to ${teamName}`);
      if (changed(diff, 'status')) {
        return text(`marked ${who} ${rec.status === 'inactive' ? 'inactive' : 'active'}`);
      }
      return text(`edited ${who}`);
    }
    case 'regattas': {
      const rec = (after ?? before)!;
      const name = String(rec.name ?? 'a regatta');
      if (action === 'create') return text(`created regatta ${name}`);
      if (action === 'delete') return text(`deleted regatta ${name}`);
      if (changed(diff, 'status')) {
        const words: Record<string, string> = {
          planning: 'back to planning',
          final: 'final',
          archived: 'archived',
        };
        return text(`marked the regatta ${words[String(after?.status)] ?? String(after?.status)}`);
      }
      if (changed(diff, 'name')) return text(`renamed regatta ${String(before?.name)} to ${name}`);
      if (changed(diff, 'settings')) return text('changed the timing settings');
      return text('edited the regatta');
    }
    case 'regatta_teams': {
      const rec = (after ?? before)!;
      const team = lookup('teams', rec.teamId as string);
      const teamName = team?.name ?? 'a team';
      if (action === 'create') return text(`added ${teamName} to the regatta`);
      if (action === 'delete') return text(`removed ${teamName} from the regatta`);
      if (changed(diff, 'publishedAt') && after?.publishedAt) {
        return text(`published ${team?.shortName || teamName} lineups`);
      }
      if (changed(diff, 'notes')) return text(`edited notes for ${teamName}`);
      return null;
    }
    case 'shells':
    case 'oar_sets': {
      const rec = (after ?? before)!;
      const kind = collection === 'shells' ? 'shell' : 'oar set';
      const name =
        collection === 'shells'
          ? shellLabel(rec as unknown as RecordOf<'shells'>)
          : oarSetLabel(rec as unknown as RecordOf<'oar_sets'>);
      if (action === 'create') return text(`added ${kind} ${name}`);
      if (action === 'delete') return text(`deleted ${kind} ${name}`);
      if (changed(diff, 'status')) {
        return text(
          `changed ${name} to ${STATUS_WORDS[String(after?.status)] ?? String(after?.status)}`,
        );
      }
      // The server's wording for a photo change (activity.js lists the changed fields).
      if (diff && Object.keys(diff).length === 1 && changed(diff, 'photoUrl')) {
        return text(`edited ${kind} ${name} (photo)`);
      }
      return text(`edited ${kind} ${name}`);
    }
  }
}
