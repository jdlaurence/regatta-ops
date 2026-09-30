// Publishing a team's lineups (PLAN.md §4.1 Publishing, §8.1 regatta_teams.published_snapshot).
//
// Coaches edit entries live; "Publish lineups" freezes the team's entries into a snapshot that
// printed sheets and share links show until the next publish. These helpers are pure: the UI
// passes the working set and the publish time, and gets back the snapshot to store, or the
// human-readable changes between the stored snapshot and the live draft ("3 changes since").

import { seatsFor } from './boat-classes';
import { fingerprintTokens } from './conflicts/fingerprint';
import { athleteName, shellLabel } from './format';
import { clockAt } from './time';
import type {
  Athlete,
  BoatClass,
  Entry,
  EntrySeat,
  EventStage,
  Id,
  OarSet,
  PublishedEntry,
  PublishedSnapshot,
  RegattaEvent,
  Seat,
  Shell,
} from './types';

export interface PublishInput {
  teamId: Id;
  /** The regatta's entries (every team: hot seat plans can live on another team's entry). */
  entries: readonly Entry[];
  seats: readonly EntrySeat[];
  events: readonly RegattaEvent[];
  shells: readonly Shell[];
  oarSets: readonly OarSet[];
  athletes: readonly Athlete[];
  /** ISO instant of the publish. The live draft can pass any string (it is not compared). */
  publishedAt: string;
  publishedBy?: Id | null;
}

const LAST = '￿';

/**
 * Schedule order for entries: by day, then race time (no time last within a day), then the
 * event's sortOrder, then label and id. Entries without an event come last.
 */
export function compareEntriesBySchedule(
  a: Pick<Entry, 'id' | 'label' | 'eventId'>,
  b: Pick<Entry, 'id' | 'label' | 'eventId'>,
  eventById: ReadonlyMap<Id, RegattaEvent>,
): number {
  const ea = a.eventId ? eventById.get(a.eventId) : undefined;
  const eb = b.eventId ? eventById.get(b.eventId) : undefined;
  if (!!ea !== !!eb) return ea ? -1 : 1;
  if (ea && eb) {
    if (ea.day !== eb.day) return ea.day < eb.day ? -1 : 1;
    const ta = ea.scheduledAt ?? LAST;
    const tb = eb.scheduledAt ?? LAST;
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ea.sortOrder !== eb.sortOrder) return ea.sortOrder - eb.sortOrder;
    if (ea.id !== eb.id) return ea.id < eb.id ? -1 : 1;
  }
  return (
    a.label.localeCompare(b.label, 'en', { numeric: true }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * Published entries in schedule order: by day (no day last), then race time (no time last).
 * Stable, so entries that tie keep the order they were published in.
 */
export function sortPublishedEntries<T extends Pick<PublishedEntry, 'day' | 'scheduledAt'>>(
  entries: readonly T[],
): T[] {
  return [...entries].sort((a, b) => {
    const da = a.day ?? LAST;
    const db = b.day ?? LAST;
    if (da !== db) return da < db ? -1 : 1;
    const ta = a.scheduledAt ?? LAST;
    const tb = b.scheduledAt ?? LAST;
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
}

/** The entry ids named in a stored hot-seat fingerprint ("shell:<id>|<a>@<ISO>|<b>@<ISO>"). */
function fingerprintEntryIds(stored: string | null | undefined): Set<Id> {
  const ids = new Set<Id>();
  for (const token of fingerprintTokens(stored)) {
    for (const part of token.split('|').slice(1)) {
      const at = part.lastIndexOf('@');
      ids.add(at >= 0 ? part.slice(0, at) : part);
    }
  }
  return ids;
}

/**
 * Hot seat plans that print with an entry (PLAN.md §4.4): the entry's own acknowledged plan and
 * the plans of later entries (any team) whose acknowledgment names this entry. Distinct, in
 * that order.
 */
export function hotSeatPlansFor(
  entry: Pick<Entry, 'id' | 'hotSeatPlan' | 'hotSeatAckBy'>,
  entries: readonly Pick<Entry, 'id' | 'hotSeatPlan' | 'hotSeatAckBy' | 'hotSeatFingerprint'>[],
): string[] {
  const plans: string[] = [];
  const add = (text: string | undefined) => {
    const t = text?.trim();
    if (t && !plans.includes(t)) plans.push(t);
  };
  if (entry.hotSeatAckBy) add(entry.hotSeatPlan);
  for (const other of entries) {
    if (other.id === entry.id || !other.hotSeatAckBy || !other.hotSeatPlan?.trim()) continue;
    if (fingerprintEntryIds(other.hotSeatFingerprint).has(entry.id)) add(other.hotSeatPlan);
  }
  return plans;
}

/**
 * The snapshot "Publish lineups" stores on the team's regatta_teams record: the team's
 * non-scratched entries in schedule order, every seat of the boat class (bow to stroke, cox
 * last; empty seats have a null athlete), with event, shell, oar set, and athlete names baked
 * in so the published copy reads the same after renames. Hot seat plans from both sides of a
 * pair are joined with a newline. Optional fields are left out rather than set to undefined,
 * so the snapshot survives a JSON round trip unchanged.
 */
export function buildPublishedSnapshot(input: PublishInput): PublishedSnapshot {
  const eventById = new Map(input.events.map((e) => [e.id, e]));
  const shellById = new Map(input.shells.map((s) => [s.id, s]));
  const oarById = new Map(input.oarSets.map((o) => [o.id, o]));
  const athleteById = new Map(input.athletes.map((a) => [a.id, a]));
  const seatsByEntry = new Map<Id, Map<Seat, Id | null>>();
  for (const s of input.seats) {
    let m = seatsByEntry.get(s.entryId);
    if (!m) seatsByEntry.set(s.entryId, (m = new Map()));
    if (!m.has(s.seat) || s.athleteId) m.set(s.seat, s.athleteId ?? null);
  }

  const mine = input.entries
    .filter((e) => e.teamId === input.teamId && e.status !== 'scratched')
    .sort((a, b) => compareEntriesBySchedule(a, b, eventById));

  const entries = mine.map((e): PublishedEntry => {
    const ev = e.eventId ? eventById.get(e.eventId) : undefined;
    const shell = e.shellId ? shellById.get(e.shellId) : undefined;
    const oars = e.oarSetId ? oarById.get(e.oarSetId) : undefined;
    const bySeat = seatsByEntry.get(e.id);
    const out: PublishedEntry = {
      entryId: e.id,
      label: e.label,
      boatClass: e.boatClass,
      status: e.status,
      eventId: ev ? ev.id : null,
      shellId: shell ? shell.id : null,
      oarSetId: oars ? oars.id : null,
      seats: seatsFor(e.boatClass).map((seat) => {
        const athleteId = bySeat?.get(seat) ?? null;
        const a = athleteId ? athleteById.get(athleteId) : undefined;
        return a ? { seat, athleteId, athleteName: athleteName(a) } : { seat, athleteId };
      }),
    };
    if (ev) {
      out.eventName = ev.name;
      if (ev.eventNumber) out.eventNumber = ev.eventNumber;
      out.day = ev.day;
      out.scheduledAt = ev.scheduledAt ?? null;
      out.stage = ev.stage ?? null;
    }
    if (shell) out.shellName = shellLabel(shell);
    if (oars) out.oarSetName = oars.name;
    const plans = hotSeatPlansFor(e, input.entries);
    if (plans.length > 0) out.hotSeatPlan = plans.join('\n');
    return out;
  });

  const snapshot: PublishedSnapshot = { publishedAt: input.publishedAt, entries };
  if (input.publishedBy) snapshot.publishedBy = input.publishedBy;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Changes since the last publish

export type SnapshotChangeKind =
  | 'added'
  | 'removed'
  | 'scratched'
  | 'renamed'
  | 'class'
  | 'moved'
  | 'shell'
  | 'oars'
  | 'seat'
  | 'swap';

export interface SnapshotChange {
  kind: SnapshotChangeKind;
  entryId: Id;
  /** A sentence for people: "Seat 3 of V8: Sam Lee → Ava Chen". */
  text: string;
}

export interface SnapshotChangeOptions {
  /** Zone for the times in the sentences (default America/Los_Angeles). */
  timeZone?: string;
  /** Entries that are scratched now: their removal reads "V8 scratched", not "V8 removed". */
  scratchedEntryIds?: Iterable<Id>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekday(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()]!;
}

const STAGE_WORDS: Record<EventStage, string> = {
  heat: 'heat',
  semi: 'semi',
  final: 'final',
  time_trial: 'time trial',
  race: 'race',
};

function labelOf(e: Pick<PublishedEntry, 'label' | 'boatClass'>): string {
  return e.label.trim() || e.boatClass;
}

function seatWord(seat: Seat, capital: boolean): string {
  if (seat === 'cox') return capital ? 'Cox' : 'cox';
  return `${capital ? 'Seat' : 'seat'} ${seat}`;
}

function seatMap(e: PublishedEntry): Map<Seat, { id: Id | null; name?: string }> {
  const m = new Map<Seat, { id: Id | null; name?: string }>();
  for (const s of e.seats) {
    if (!m.has(s.seat) || s.athleteId) m.set(s.seat, { id: s.athleteId, name: s.athleteName });
  }
  return m;
}

function personOf(occupant: { id: Id | null; name?: string } | undefined): string {
  if (!occupant?.id) return 'empty';
  return occupant.name?.trim() || 'an athlete';
}

function seatOrder(before: BoatClass, after: BoatClass): Seat[] {
  const order = seatsFor(after);
  for (const s of seatsFor(before)) if (!order.includes(s)) order.push(s);
  return order;
}

/**
 * What changed between a published snapshot and the live draft (built the same way with
 * buildPublishedSnapshot), as sentences for the "3 changes since" list and the publish dialog.
 * Matching is by entry id. Order: entries in the draft's schedule order, then entries that are
 * gone; within an entry: added, renamed, class, moved, shell, oars, then seats bow to stroke.
 * A pure swap of two seats in one boat is one change. Scratched entries in either snapshot
 * count as absent. An empty list means nothing changed; no published snapshot gives [].
 */
export function snapshotChanges(
  published: PublishedSnapshot | null | undefined,
  current: PublishedSnapshot,
  options: SnapshotChangeOptions = {},
): SnapshotChange[] {
  if (!published) return [];
  const tz = options.timeZone ?? 'America/Los_Angeles';
  const scratched = new Set(options.scratchedEntryIds ?? []);
  const live = (e: PublishedEntry) => e.status !== 'scratched';
  const before = new Map(published.entries.filter(live).map((e) => [e.entryId, e]));
  const after = sortPublishedEntries(current.entries.filter(live));
  const afterIds = new Set(after.map((e) => e.entryId));

  // Labels shared by two or more entries get a day and time so each sentence names one crew.
  const labelCount = new Map<string, Set<Id>>();
  for (const e of [...before.values(), ...after]) {
    const ids = labelCount.get(labelOf(e)) ?? new Set<Id>();
    ids.add(e.entryId);
    labelCount.set(labelOf(e), ids);
  }
  const days = new Set([...before.values(), ...after].map((e) => e.day).filter(Boolean));
  const when = (e: PublishedEntry, withDay: boolean): string => {
    const time = e.scheduledAt ? clockAt(e.scheduledAt, tz, true) : 'TBD';
    if (!e.day) return 'unscheduled';
    return withDay ? `${weekday(e.day)} ${time}` : time;
  };
  // The name people know: the published label (and time) when the entry was published.
  const nameOf = (id: Id): string => {
    const e = before.get(id) ?? after.find((x) => x.entryId === id)!;
    const label = labelOf(e);
    if ((labelCount.get(label)?.size ?? 0) < 2) return label;
    return `${label} (${when(e, days.size > 1)})`;
  };
  const eventRef = (e: PublishedEntry): string => {
    if (e.eventNumber) return `Event ${e.eventNumber}`;
    const stage = e.stage && e.stage !== 'race' ? ` ${STAGE_WORDS[e.stage]}` : '';
    return `${e.eventName ?? 'another event'}${stage}`;
  };

  const out: SnapshotChange[] = [];
  const push = (kind: SnapshotChangeKind, entryId: Id, text: string) =>
    out.push({ kind, entryId, text });

  for (const a of after) {
    const id = a.entryId;
    const b = before.get(id);
    const name = nameOf(id);
    if (!b) {
      push('added', id, `${name} added`);
      continue;
    }
    if (labelOf(a) !== labelOf(b)) push('renamed', id, `${name} renamed ${labelOf(a)}`);
    if (a.boatClass !== b.boatClass) push('class', id, `${name} is now a ${a.boatClass}`);

    if ((a.eventId ?? null) !== (b.eventId ?? null)) {
      if (!a.eventId) push('moved', id, `${name} moved to unscheduled`);
      else {
        const at = a.scheduledAt ? `, ${when(a, a.day !== b.day)}` : '';
        push('moved', id, `${name} moved to ${eventRef(a)}${at}`);
      }
    } else if ((a.scheduledAt ?? null) !== (b.scheduledAt ?? null) || a.day !== b.day) {
      if (!a.scheduledAt) push('moved', id, `${name} time is now TBD`);
      else push('moved', id, `${name} moved to ${when(a, a.day !== b.day)}`);
    }

    if ((a.shellId ?? null) !== (b.shellId ?? null)) {
      const from = b.shellId ? (b.shellName ?? 'a shell') : 'no shell';
      const to = a.shellId ? (a.shellName ?? 'a shell') : 'no shell';
      push('shell', id, `${name} shell: ${from} → ${to}`);
    }
    if ((a.oarSetId ?? null) !== (b.oarSetId ?? null)) {
      const from = b.oarSetId ? (b.oarSetName ?? 'an oar set') : 'no oars';
      const to = a.oarSetId ? (a.oarSetName ?? 'an oar set') : 'no oars';
      push('oars', id, `${name} oars: ${from} → ${to}`);
    }

    const was = seatMap(b);
    const now = seatMap(a);
    const changed = seatOrder(b.boatClass, a.boatClass).filter(
      (s) => (was.get(s)?.id ?? null) !== (now.get(s)?.id ?? null),
    );
    const done = new Set<Seat>();
    for (const s of changed) {
      if (done.has(s)) continue;
      const partner = changed.find(
        (t) =>
          t !== s &&
          !done.has(t) &&
          !!was.get(s)?.id &&
          !!was.get(t)?.id &&
          was.get(s)?.id === now.get(t)?.id &&
          was.get(t)?.id === now.get(s)?.id,
      );
      if (partner) {
        done.add(s).add(partner);
        const pair =
          s === 'cox' || partner === 'cox'
            ? `${seatWord(s, true)} and ${seatWord(partner, false)}`
            : `Seats ${s} and ${partner}`;
        push(
          'swap',
          id,
          `${pair} of ${name} swapped (${personOf(was.get(s))}, ${personOf(was.get(partner))})`,
        );
        continue;
      }
      done.add(s);
      push(
        'seat',
        id,
        `${seatWord(s, true)} of ${name}: ${personOf(was.get(s))} → ${personOf(now.get(s))}`,
      );
    }
  }

  for (const b of published.entries.filter(live)) {
    if (afterIds.has(b.entryId)) continue;
    const kind = scratched.has(b.entryId) ? 'scratched' : 'removed';
    push(kind, b.entryId, `${nameOf(b.entryId)} ${kind}`);
  }
  return out;
}
