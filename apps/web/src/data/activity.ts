// Activity log sentences (PLAN.md §4.6, §8.3). MemoryStore uses this to emulate the server's
// activity.pb.js hook; the summaries read as "<actor> <summary>": "Sam moved entry Girls V4+
// from Event 12 to Event 14". Keep the wording in step with backend/pb_hooks/activity.pb.js.

import {
  athleteName,
  clockAt,
  oarSetLabel,
  shellLabel,
  type ActivityEntry,
  type CollectionName,
  type Entry,
  type RegattaEvent,
} from '@srt/domain';
import type { RecordOf } from './store';

export type Lookup = <C extends CollectionName>(collection: C, id: string) => RecordOf<C> | undefined;

export const LOGGED_COLLECTIONS = [
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

const TARGET_TYPE: Record<LoggedCollection, string> = {
  entries: 'entry',
  entry_seats: 'entry_seat',
  events: 'event',
  availability: 'availability',
  load_placements: 'load_placement',
  load_items: 'load_item',
  shells: 'shell',
  oar_sets: 'oar_set',
};

const STATUS_WORDS: Record<string, string> = {
  in_service: 'in service',
  limited: 'limited',
  out_of_service: 'out of service',
  retired: 'retired',
};

type Draft = Pick<ActivityEntry, 'regattaId' | 'action' | 'targetType' | 'targetId' | 'summary' | 'diff'>;

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
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return Object.keys(out).length > 0 ? out : null;
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
  const diff = action === 'update' ? diffRecords(before, after) : null;
  if (action === 'update' && !diff) return null;
  const base = {
    action,
    targetType: TARGET_TYPE[collection],
    targetId: rec.id,
    diff,
  };
  const summary = summarize(lookup, collection, action, before, after, diff);
  if (!summary) return null;
  return { ...base, regattaId: regattaOf(lookup, collection, rec), summary: summary.text };
}

function regattaOf(lookup: Lookup, collection: LoggedCollection, rec: AnyRecord): string | null {
  switch (collection) {
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
        return text(ev ? `added entry ${name} to ${eventName(ev)}` : `added entry ${name} as unscheduled`);
      }
      if (action === 'delete') return text(`deleted entry ${name}`);
      const prev = before as unknown as Entry;
      if (changed(diff, 'eventId')) {
        const to = entry.eventId ? lookup('events', entry.eventId) : undefined;
        if (!to) return text(`made entry ${name} unscheduled`);
        return text(`moved entry ${name} to ${eventName(to)}`);
      }
      if (changed(diff, 'shellId')) {
        const shell = entry.shellId ? lookup('shells', entry.shellId) : undefined;
        return text(
          shell ? `put ${shellLabel(shell)} on entry ${name}` : `removed the shell from entry ${name}`,
        );
      }
      if (changed(diff, 'oarSetId')) {
        const oars = entry.oarSetId ? lookup('oar_sets', entry.oarSetId) : undefined;
        return text(
          oars ? `picked oars ${oarSetLabel(oars)} for entry ${name}` : `removed the oars from entry ${name}`,
        );
      }
      if (changed(diff, 'status')) return text(`marked entry ${name} ${entry.status}`);
      if (changed(diff, 'hotSeatAckBy')) {
        return text(
          entry.hotSeatAckBy
            ? `acknowledged the hot seat for entry ${name}`
            : `reopened the hot seat for entry ${name}`,
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
      if (action === 'delete') return before?.athleteId ? text(`cleared ${where}`) : null;
      const athleteId = after?.athleteId as string | null | undefined;
      if (!athleteId) return action === 'create' ? null : text(`cleared ${where}`);
      if (action === 'update' && !changed(diff, 'athleteId')) return text(`edited ${where}`);
      const athlete = lookup('athletes', athleteId);
      return text(`set ${where} to ${athlete ? athleteName(athlete) : 'an athlete'}`);
    }
    case 'events': {
      const ev = (after ?? before) as unknown as RegattaEvent;
      if (action === 'create') {
        return text(
          ev.kind === 'race' && ev.eventNumber
            ? `added Event ${ev.eventNumber}, ${ev.name}`
            : `added ${eventName(ev)}`,
        );
      }
      if (action === 'delete') return text(`deleted ${eventName(ev)}`);
      if (changed(diff, 'scheduledAt')) {
        if (!ev.scheduledAt) return text(`marked ${eventName(ev)} unscheduled`);
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
      const boat = shell ? shellLabel(shell) : 'a shell';
      const spot = shelf ? shelf.label : 'the trailer';
      if (action === 'create') return text(`placed ${boat} on ${spot}`);
      if (action === 'delete') return text(`took ${boat} off the trailer`);
      if (changed(diff, 'shelfId') || changed(diff, 'lane') || changed(diff, 'offsetCm')) {
        return text(`moved ${boat} to ${spot}`);
      }
      if (changed(diff, 'locked')) return text(after?.locked ? `locked ${boat} in place` : `unlocked ${boat}`);
      return text(`edited the placement of ${boat}`);
    }
    case 'load_items': {
      const rec = (after ?? before)!;
      const label = String(rec.label ?? 'an item');
      if (action === 'create') return text(`added ${label} to the load list`);
      if (action === 'delete') return text(`removed ${label} from the load list`);
      if (changed(diff, 'loadedAt')) {
        return text(after?.loadedAt ? `checked ${label} as loaded` : `unchecked ${label} as loaded`);
      }
      if (changed(diff, 'returnedAt')) {
        return text(
          after?.returnedAt ? `checked ${label} as returned` : `unchecked ${label} as returned`,
        );
      }
      return text(`edited ${label} on the load list`);
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
        return text(`changed ${name} to ${STATUS_WORDS[String(after?.status)] ?? String(after?.status)}`);
      }
      return text(`edited ${kind} ${name}`);
    }
  }
}
