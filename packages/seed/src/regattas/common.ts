// Helpers shared by the regatta builders: events, entries, seats, availability, crews, snapshots.

import {
  buildPublishedSnapshot,
  effectiveSettings,
  entrySeatSides,
  stableId,
  toMs,
  zonedToInstant,
  type Athlete,
  type BoatClass,
  type Entry,
  type EntrySeat,
  type EntryStatus,
  type EventStage,
  type Id,
  type PublishedSnapshot,
  type Regatta,
  type RegattaEvent,
  type Seat,
  type World,
} from '@regatta-ops/domain';
import { assignCrews, type CrewRequest, type Eligibility } from '../crews';
import { bucketRigSides, type FleetIndex } from '../fleet';
import { rng } from '../prng';
import { SEED_USER_IDS, TEAM_COACH, teamId, type TeamKey } from '../ids';
import { TZ } from '../world';

export interface RaceSpec {
  day: string;
  /** 'HH:mm' in the regatta zone, or null for TBD. */
  time: string | null;
  name: string;
  cls: BoatClass;
  category?: string;
  stage: EventStage;
  eventNumber?: string;
  progressionGroup?: string;
  notes?: string;
  source?: string;
  sortOrder: number;
}

export function raceEvent(regattaKey: string, regattaId: Id, r: RaceSpec): RegattaEvent {
  const ev: RegattaEvent = {
    id: stableId(`event:${regattaKey}:${r.day}:${r.time ?? 'tbd'}:${r.name}`),
    regattaId,
    kind: 'race',
    name: r.name,
    boatClass: r.cls,
    day: r.day,
    scheduledAt: r.time ? zonedToInstant(r.day, r.time, TZ) : null,
    stage: r.stage,
    sortOrder: r.sortOrder,
  };
  if (r.eventNumber) ev.eventNumber = r.eventNumber;
  if (r.category) ev.category = r.category;
  if (r.progressionGroup) ev.progressionGroup = r.progressionGroup;
  if (r.notes) ev.notes = r.notes;
  if (r.source) ev.source = r.source;
  return ev;
}

export interface EntrySpec {
  key: string;
  regattaId: Id;
  event: RegattaEvent | null;
  team: TeamKey;
  label: string;
  cls: BoatClass;
  shell: string | null;
  oars: string | null;
  status: EntryStatus;
  rule: Eligibility;
  notes?: string;
  reuseKey?: string;
}

export interface PlannedEntry {
  entry: Entry;
  request: CrewRequest;
}

/** Builds an entry (shell and oars looked up by name) and the crew request that will fill it. */
export function planEntry(fleet: FleetIndex, spec: EntrySpec): PlannedEntry {
  const shell = spec.shell ? fleet.shell(spec.shell) : null;
  const oars = spec.oars ? fleet.oarSet(spec.oars) : null;
  const coach = SEED_USER_IDS[TEAM_COACH[spec.team]];
  const entry: Entry = {
    id: stableId(`entry:${spec.key}`),
    regattaId: spec.regattaId,
    eventId: spec.event?.id ?? null,
    teamId: teamId(spec.team),
    label: spec.label,
    boatClass: spec.cls,
    shellId: shell?.id ?? null,
    oarSetId: oars?.id ?? null,
    status: spec.status,
    coachId: coach,
    createdBy: coach,
    updatedBy: coach,
  };
  const bucket = shell ? bucketRigSides(shell, spec.cls) : null;
  if (bucket) entry.seatSides = bucket;
  if (spec.notes) entry.notes = spec.notes;
  const request: CrewRequest = {
    entryId: entry.id,
    teamId: entry.teamId,
    cls: spec.cls,
    day: spec.event?.day ?? '',
    atMs: spec.event?.scheduledAt ? toMs(spec.event.scheduledAt) : null,
    // The sides the conflict engine and the boat strip will use.
    seatSides: entrySeatSides(entry, shell),
    rule: spec.rule,
  };
  if (spec.reuseKey) request.reuseKey = spec.reuseKey;
  return { entry, request };
}

export interface CrewOptions {
  seasonYear: number;
  /** Order in which crews are filled; defaults to `planned` order. */
  fillOrder?: readonly PlannedEntry[];
  /** Never seat an athlete where the conflict engine would warn (see crews.ts). */
  strictGaps: boolean;
}

/**
 * Fills the planned entries' seats with the greedy, then adds the entries (in `planned` order)
 * and their seat records to the world. Seat records exist only for filled seats.
 */
export function crewAndAdd(
  w: World,
  regatta: Regatta,
  planned: readonly PlannedEntry[],
  options: CrewOptions,
): void {
  const settings = effectiveSettings(regatta, w.club_settings[0]);
  const unavailable = new Map<Id, { all: boolean; days: Set<string> }>();
  for (const a of w.availability.filter((x) => x.regattaId === regatta.id)) {
    const days = new Set(
      Object.entries(a.days ?? {})
        .filter(([, s]) => s === 'unavailable' || s === 'maybe')
        .map(([d]) => d),
    );
    unavailable.set(a.athleteId, { all: a.status !== 'available', days });
  }
  const crews = assignCrews(
    (options.fillOrder ?? planned).map((p) => p.request),
    {
      athletes: w.athletes,
      seasonYear: options.seasonYear,
      busyMin: settings.raceDurationMin + settings.returnMin,
      athleteMinGapMin: settings.athleteMinGapMin,
      strictGaps: options.strictGaps,
      maxRacesPerDay: 4,
      maxCoxRacesPerDay: 6,
      isUnavailable: (id, day) => {
        const u = unavailable.get(id);
        return !!u && (u.all || u.days.has(day));
      },
      rng: rng(`crews:${regatta.id}`),
    },
  );
  for (const { entry } of planned) {
    w.entries.push(entry);
    const crew = crews.get(entry.id)!;
    for (const [seat, athleteId] of crew) {
      if (!athleteId) continue;
      w.entry_seats.push(seatRecord(entry.id, seat, athleteId));
    }
  }
}

export function seatRecord(entryId: Id, seat: Seat, athleteId: Id): EntrySeat {
  return { id: stableId(`entry_seat:${entryId}:${seat}`), entryId, seat, athleteId };
}

/** The club's entry labels: 'V8', '2V4+', 'U17 8 A', 'N4+ B', 'U16 4x+'. */
export function entryLabel(prefix: string, cls: BoatClass, crew: string | null): string {
  const boat = cls === '8+' ? '8' : cls;
  const sep = /\d$/.test(prefix) && /^\d/.test(boat) ? ' ' : '';
  return `${prefix}${sep}${boat}${crew ? ` ${crew}` : ''}`;
}

/** Snapshot of a team's entries in a regatta, as Publish lineups stores it. */
export function snapshotFor(
  w: World,
  regattaId: Id,
  teamKey: TeamKey,
  publishedAt: string,
): PublishedSnapshot {
  const entries = w.entries.filter((e) => e.regattaId === regattaId);
  const entryIds = new Set(entries.map((e) => e.id));
  const snapshot = buildPublishedSnapshot({
    teamId: teamId(teamKey),
    entries,
    seats: w.entry_seats.filter((s) => entryIds.has(s.entryId)),
    events: w.events.filter((e) => e.regattaId === regattaId),
    shells: w.shells,
    oarSets: w.oar_sets,
    athletes: w.athletes,
    publishedAt,
    publishedBy: SEED_USER_IDS[TEAM_COACH[teamKey]],
  });
  // JSON round trip drops undefined keys, as PocketBase's json field would.
  return JSON.parse(JSON.stringify(snapshot)) as PublishedSnapshot;
}

export function athletesOf(w: World, team: TeamKey): Athlete[] {
  return w.athletes.filter((a) => a.teamId === teamId(team));
}
