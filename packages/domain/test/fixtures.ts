// Fixture builder for conflict-engine tests (PLAN.md §9.2 test cases). Names are invented.
//
//   const input = world()
//     .shell('Monahan', '8+')
//     .entry({ id: 'a', at: '09:00', shell: 'Monahan' })
//     .entry({ id: 'b', at: '09:45', shell: 'Monahan', team: 'Girls' })
//     .build();
//
// Ids are readable: shells 'sh_<slug>', oar sets 'oa_<slug>', athletes 'at_<slug>',
// teams 'tm_<slug>', events 'ev_<slug>'. Entries take the id you give them (default 'en_<n>').

import {
  DEFAULT_TIMING,
  seatSide,
  seatsFor,
  zonedToInstant,
  type Athlete,
  type Availability,
  type AvailabilityStatus,
  type BoatClass,
  type ConflictInput,
  type Entry,
  type EntrySeat,
  type EntryStatus,
  type Finding,
  type FindingCode,
  type OarSet,
  type RegattaEvent,
  type RegattaSettings,
  type Rigging,
  type Seat,
  type Shell,
  type Team,
} from '../src';

export const TZ = 'America/Los_Angeles';
export const DAY1 = '2025-05-16';
export const DAY2 = '2025-05-17';
export const REGATTA = 'rg_test';

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const shellId = (name: string) => `sh_${slug(name)}`;
export const oarSetId = (name: string) => `oa_${slug(name)}`;
export const athleteId = (name: string) => `at_${slug(name)}`;
export const teamId = (shortName: string) => `tm_${slug(shortName)}`;
export const eventId = (key: string) => `ev_${slug(key)}`;

export function instant(day: string, hhmm: string, tz = TZ): string {
  return zonedToInstant(day, hhmm, tz);
}

export interface WorldOptions {
  timezone?: string;
  seasonYear?: number;
  day?: string;
  settings?: Partial<RegattaSettings>;
}

export interface EventOptions {
  /** 'HH:mm' in the regatta zone; null or omitted = no time yet. */
  at?: string | null;
  day?: string;
  cls?: BoatClass;
  name?: string;
  category?: string;
  number?: string;
}

export interface EntryOptions {
  id?: string;
  /** Team short name; default 'Boys'. */
  team?: string;
  label?: string;
  /** Default: the event's class, else the shell's, else '8+'. */
  cls?: BoatClass;
  /** Event key from .event(); otherwise `at` creates an event for this entry. */
  event?: string;
  at?: string | null;
  day?: string;
  shell?: string;
  oars?: string;
  status?: EntryStatus;
  /** 'full' seats generated athletes who fit every seat; a map seats named athletes. */
  crew?: 'full' | Partial<Record<Seat, string>>;
  seatSides?: Entry['seatSides'];
  hotSeatAckBy?: string | null;
  hotSeatFingerprint?: string;
}

export class WorldBuilder {
  private readonly opts: Required<Omit<WorldOptions, 'settings'>> & { settings: RegattaSettings };
  private teams: Team[] = [];
  private shells: Shell[] = [];
  private oarSets: OarSet[] = [];
  private athletes: Athlete[] = [];
  private events: RegattaEvent[] = [];
  private entries: Entry[] = [];
  private seats: EntrySeat[] = [];
  private availability: Availability[] = [];
  private placements: { shellId: string }[] | undefined;

  constructor(options: WorldOptions = {}) {
    this.opts = {
      timezone: options.timezone ?? TZ,
      seasonYear: options.seasonYear ?? 2025,
      day: options.day ?? DAY1,
      settings: { ...DEFAULT_TIMING, ...options.settings },
    };
    this.team('Boys', 'Junior boys').team('Girls', 'Junior girls');
  }

  team(shortName: string, name = shortName): this {
    const id = teamId(shortName);
    if (this.teams.some((t) => t.id === id)) return this;
    this.teams.push({
      id,
      name,
      shortName,
      program: 'juniors',
      colorKey: 'navy',
      sortOrder: this.teams.length + 1,
      archived: false,
    });
    return this;
  }

  shell(name: string, cls: BoatClass, extra: Partial<Shell> = {}): this {
    this.shells.push({
      id: shellId(name),
      name,
      boatClass: cls,
      compatibleClasses: [],
      rigging: cls.includes('x') ? 'scull' : 'sweep',
      riggerType: 'side',
      genderAffinity: 'any',
      status: 'in_service',
      isPrivate: false,
      ...extra,
    });
    return this;
  }

  oars(name: string, type: Rigging, count: number, extra: Partial<OarSet> = {}): this {
    this.oarSets.push({
      id: oarSetId(name),
      name,
      type,
      count,
      genderAffinity: 'any',
      status: 'in_service',
      ...extra,
    });
    return this;
  }

  athlete(fullName: string, extra: Partial<Athlete> & { team?: string } = {}): this {
    const { team = 'Boys', ...rest } = extra;
    this.team(team);
    const [firstName, ...last] = fullName.split(' ');
    this.athletes.push({
      id: athleteId(fullName),
      teamId: teamId(team),
      firstName: firstName!,
      lastName: last.join(' '),
      side: 'both',
      canScull: true,
      canCox: false,
      level: 'experienced',
      status: 'active',
      ...rest,
    });
    return this;
  }

  event(key: string, o: EventOptions = {}): this {
    const day = o.day ?? this.opts.day;
    this.events.push({
      id: eventId(key),
      regattaId: REGATTA,
      kind: 'race',
      eventNumber: o.number,
      name: o.name ?? `${o.cls ?? '8+'} race ${key}`,
      boatClass: o.cls ?? '8+',
      category: o.category,
      day,
      scheduledAt: o.at ? instant(day, o.at, this.opts.timezone) : null,
      stage: 'race',
      sortOrder: this.events.length + 1,
    });
    return this;
  }

  entry(o: EntryOptions = {}): this {
    const id = o.id ?? `en_${this.entries.length + 1}`;
    const team = o.team ?? 'Boys';
    this.team(team);
    let evId: string | null = null;
    if (o.event) {
      evId = eventId(o.event);
    } else if (o.at !== undefined) {
      const key = `auto-${id}`;
      const shellCls = o.shell
        ? this.shells.find((s) => s.id === shellId(o.shell!))?.boatClass
        : undefined;
      this.event(key, { at: o.at, day: o.day, cls: o.cls ?? shellCls });
      evId = eventId(key);
    }
    const ev = evId ? this.events.find((e) => e.id === evId) : undefined;
    const shell = o.shell ? this.shells.find((s) => s.id === shellId(o.shell!)) : undefined;
    const cls: BoatClass = o.cls ?? ev?.boatClass ?? shell?.boatClass ?? '8+';
    this.entries.push({
      id,
      regattaId: REGATTA,
      eventId: evId,
      teamId: teamId(team),
      label: o.label ?? cls,
      boatClass: cls,
      shellId: o.shell ? shellId(o.shell) : null,
      oarSetId: o.oars ? oarSetId(o.oars) : null,
      status: o.status ?? 'planned',
      seatSides: o.seatSides ?? null,
      hotSeatAckBy: o.hotSeatAckBy ?? null,
      hotSeatFingerprint: o.hotSeatFingerprint ?? '',
    });
    if (o.crew === 'full') {
      for (const seat of seatsFor(cls)) {
        const name = `Seat${seat === 'cox' ? 'Cox' : seat} ${id}`;
        const side = seatSide(cls, seat);
        this.athlete(name, {
          team,
          side: side ?? 'none',
          canCox: seat === 'cox',
          canScull: true,
        });
        this.seat(id, seat, name);
      }
    } else if (o.crew) {
      for (const [seat, name] of Object.entries(o.crew)) this.seat(id, seat as Seat, name);
    }
    return this;
  }

  seat(entry: string, seat: Seat, athleteName: string | null): this {
    this.seats.push({
      id: `se_${entry}_${seat}`,
      entryId: entry,
      seat,
      athleteId: athleteName ? athleteId(athleteName) : null,
    });
    return this;
  }

  availabilityFor(
    athleteName: string,
    status: AvailabilityStatus,
    days?: Record<string, AvailabilityStatus>,
    reason?: string,
  ): this {
    this.availability.push({
      id: `av_${slug(athleteName)}`,
      regattaId: REGATTA,
      athleteId: athleteId(athleteName),
      status,
      days: days ?? null,
      reason,
    });
    return this;
  }

  /** Enables NOT_ON_TRAILER: only these shells have a placement. */
  onTrailer(...shellNames: string[]): this {
    this.placements = shellNames.map((n) => ({ shellId: shellId(n) }));
    return this;
  }

  build(): ConflictInput {
    const input: ConflictInput = {
      settings: { ...this.opts.settings },
      timezone: this.opts.timezone,
      seasonYear: this.opts.seasonYear,
      events: [...this.events],
      entries: [...this.entries],
      seats: [...this.seats],
      athletes: [...this.athletes],
      availability: [...this.availability],
      shells: [...this.shells],
      oarSets: [...this.oarSets],
      teams: [...this.teams],
    };
    if (this.placements) input.loadPlacements = [...this.placements];
    return input;
  }
}

export function world(options?: WorldOptions): WorldBuilder {
  return new WorldBuilder(options);
}

// ---------------------------------------------------------------------------
// Immutable edits for "then the schedule changes" cases.

export function patchEntry(input: ConflictInput, id: string, patch: Partial<Entry>): ConflictInput {
  return { ...input, entries: input.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** Move an entry's event to a new wall time ('HH:mm') on the same day. */
export function retime(input: ConflictInput, entry: string, hhmm: string): ConflictInput {
  const evId = input.entries.find((e) => e.id === entry)?.eventId;
  return {
    ...input,
    events: input.events.map((ev) =>
      ev.id === evId ? { ...ev, scheduledAt: instant(ev.day, hhmm, input.timezone) } : ev,
    ),
  };
}

export function codes(findings: Finding[]): FindingCode[] {
  return findings.map((f) => f.code);
}

export function ofCode(findings: Finding[], code: FindingCode): Finding[] {
  return findings.filter((f) => f.code === code);
}

/** The single finding with this code; throws when there are none or several. */
export function one(findings: Finding[], code: FindingCode): Finding {
  const hits = ofCode(findings, code);
  if (hits.length !== 1) {
    throw new Error(`Expected one ${code}, got ${hits.length}: ${codes(findings).join(', ')}`);
  }
  return hits[0]!;
}
