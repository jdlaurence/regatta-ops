// The regatta working set (PLAN.md §6, §8.4, §10.1): everything a regatta page needs, loaded
// once with a handful of list queries and kept fresh by realtime invalidation. Each piece is
// an ordinary list query, so optimistic updates from useUpdate/useStoreMutation flow straight
// into the working set without special cases.

import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import {
  effectiveSettings,
  type Athlete,
  type Availability,
  type ClubSettings,
  type Entry,
  type EntrySeat,
  type GearItem,
  type Id,
  type LoadItem,
  type LoadPlacement,
  type LoadPlan,
  type OarSet,
  type Regatta,
  type RegattaEvent,
  type RegattaSettings,
  type RegattaTeam,
  type Shell,
  type Team,
  type Trailer,
  type TrailerCompartment,
  type TrailerShelf,
  type User,
} from '@srt/domain';
import { listQueryOptions, recordQueryOptions, useList, useRecord } from './hooks';
import type { DataStore, ListQuery, RecordOf } from './store';

export interface RegattaWorkingSet {
  regatta: Regatta;
  /** Club defaults overlaid with the regatta's overrides. */
  settings: RegattaSettings;
  clubSettings: ClubSettings | null;
  /** Races and logistics lines, by day, time (unscheduled last within a day), then sortOrder. */
  events: RegattaEvent[];
  entries: Entry[];
  seats: EntrySeat[];
  availability: Availability[];
  regattaTeams: RegattaTeam[];
  /** Every team (borrowed athletes and chips need teams that are not participating). */
  teams: Team[];
  /** Teams in this regatta, by sortOrder. */
  participatingTeams: Team[];
  /** Athletes of participating teams, plus athletes from other teams seated in an entry. */
  athletes: Athlete[];
  shells: Shell[];
  oarSets: OarSet[];
  gear: GearItem[];
  trailers: Trailer[];
  shelves: TrailerShelf[];
  compartments: TrailerCompartment[];
  loadPlans: LoadPlan[];
  placements: LoadPlacement[];
  loadItems: LoadItem[];
  users: User[];
  byId: {
    teams: Map<Id, Team>;
    athletes: Map<Id, Athlete>;
    shells: Map<Id, Shell>;
    oarSets: Map<Id, OarSet>;
    events: Map<Id, RegattaEvent>;
    entries: Map<Id, Entry>;
    users: Map<Id, User>;
    trailers: Map<Id, Trailer>;
    shelves: Map<Id, TrailerShelf>;
  };
  /** Seats of each entry, in seat-template order is up to the caller (seatsFor). */
  seatsByEntry: Map<Id, EntrySeat[]>;
}

export interface WorkingSetResult {
  data: RegattaWorkingSet | undefined;
  /** True until every piece has loaded once. */
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** The regatta id does not exist. */
  notFound: boolean;
  /** Refetch whatever failed. */
  refetch: () => void;
}

/** The regatta-scoped queries that do not depend on other results (shared with the loader). */
function independentQueries(regattaId: string) {
  return {
    events: {
      where: { regattaId },
      sort: ['day', 'scheduledAt', 'sortOrder'],
    } satisfies ListQuery<RegattaEvent>,
    entries: { where: { regattaId } } satisfies ListQuery<Entry>,
    availability: { where: { regattaId } } satisfies ListQuery<Availability>,
    regattaTeams: { where: { regattaId } } satisfies ListQuery<RegattaTeam>,
    teams: { sort: ['sortOrder', 'name'] } satisfies ListQuery<Team>,
    shells: { sort: 'name' } satisfies ListQuery<Shell>,
    oarSets: { sort: 'name' } satisfies ListQuery<OarSet>,
    gear: { sort: 'name' } satisfies ListQuery<GearItem>,
    trailers: { sort: 'name' } satisfies ListQuery<Trailer>,
    shelves: { sort: ['trailerId', 'sortOrder'] } satisfies ListQuery<TrailerShelf>,
    compartments: {} satisfies ListQuery<TrailerCompartment>,
    loadPlans: { where: { regattaId } } satisfies ListQuery<LoadPlan>,
    loadItems: { where: { regattaId } } satisfies ListQuery<LoadItem>,
    users: { sort: 'name' } satisfies ListQuery<User>,
    clubSettings: {} satisfies ListQuery<ClubSettings>,
  };
}

/**
 * Start loading a regatta's working set without waiting (used by the route loader, §10.1).
 * The hook then finds everything already in flight or cached.
 */
export function prefetchRegattaWorkingSet(qc: QueryClient, store: DataStore, regattaId: string) {
  const q = independentQueries(regattaId);
  const prefetch = <C extends Parameters<typeof listQueryOptions>[1]>(
    c: C,
    query: ListQuery<RecordOf<C>>,
  ) => void qc.prefetchQuery(listQueryOptions(store, c, query));
  void qc.prefetchQuery(recordQueryOptions(store, 'regattas', regattaId));
  prefetch('events', q.events);
  prefetch('entries', q.entries);
  prefetch('availability', q.availability);
  prefetch('regatta_teams', q.regattaTeams);
  prefetch('teams', q.teams);
  prefetch('shells', q.shells);
  prefetch('oar_sets', q.oarSets);
  prefetch('gear_items', q.gear);
  prefetch('trailers', q.trailers);
  prefetch('trailer_shelves', q.shelves);
  prefetch('trailer_compartments', q.compartments);
  prefetch('load_plans', q.loadPlans);
  prefetch('load_items', q.loadItems);
  prefetch('users', q.users);
  prefetch('club_settings', q.clubSettings);
}

function byId<T extends { id: Id }>(rows: T[]): Map<Id, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

function sortEvents(events: RegattaEvent[]): RegattaEvent[] {
  // Unscheduled events go last within their day (PLAN.md §4.3).
  return [...events].sort((a, b) => {
    if (a.day !== b.day) return a.day < b.day ? -1 : 1;
    const ta = a.scheduledAt ?? '￿';
    const tb = b.scheduledAt ?? '￿';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Everything a regatta page needs, in one object (see RegattaWorkingSet). Loads with a few
 * list queries, stays fresh through realtime, and reflects optimistic writes immediately.
 */
export function useRegattaWorkingSet(regattaId: string | null | undefined): WorkingSetResult {
  const id = regattaId ?? '';
  const enabled = !!regattaId;
  const q = useMemo(() => independentQueries(id), [id]);

  const regatta = useRecord('regattas', enabled ? id : null);
  const events = useList('events', q.events, { enabled });
  const entries = useList('entries', q.entries, { enabled });
  const availability = useList('availability', q.availability, { enabled });
  const regattaTeams = useList('regatta_teams', q.regattaTeams, { enabled });
  const teams = useList('teams', q.teams, { enabled });
  const shells = useList('shells', q.shells, { enabled });
  const oarSets = useList('oar_sets', q.oarSets, { enabled });
  const gear = useList('gear_items', q.gear, { enabled });
  const trailers = useList('trailers', q.trailers, { enabled });
  const shelves = useList('trailer_shelves', q.shelves, { enabled });
  const compartments = useList('trailer_compartments', q.compartments, { enabled });
  const loadPlans = useList('load_plans', q.loadPlans, { enabled });
  const loadItems = useList('load_items', q.loadItems, { enabled });
  const users = useList('users', q.users, { enabled });
  const clubSettings = useList('club_settings', q.clubSettings, { enabled });

  // Dependent pieces: seats of this regatta's entries, athletes of its teams, placements of
  // its load plans. keepPrevious avoids a loading flash when an entry or team is added.
  const entryIds = useMemo(() => (entries.data ?? []).map((e) => e.id), [entries.data]);
  const seats = useList(
    'entry_seats',
    { in: { entryId: entryIds } },
    { enabled: enabled && !!entries.data, keepPrevious: true },
  );
  const teamIds = useMemo(
    () => (regattaTeams.data ?? []).map((rt) => rt.teamId),
    [regattaTeams.data],
  );
  const athletes = useList(
    'athletes',
    { in: { teamId: teamIds } },
    { enabled: enabled && !!regattaTeams.data, keepPrevious: true },
  );
  const borrowedIds = useMemo(() => {
    if (!seats.data || !athletes.data) return [];
    const known = new Set(athletes.data.map((a) => a.id));
    const ids = new Set<string>();
    for (const s of seats.data) if (s.athleteId && !known.has(s.athleteId)) ids.add(s.athleteId);
    return [...ids];
  }, [seats.data, athletes.data]);
  const borrowed = useList(
    'athletes',
    { in: { id: borrowedIds } },
    { enabled: enabled && borrowedIds.length > 0, keepPrevious: true },
  );
  const planIds = useMemo(() => (loadPlans.data ?? []).map((p) => p.id), [loadPlans.data]);
  const placements = useList(
    'load_placements',
    { in: { loadPlanId: planIds } },
    { enabled: enabled && !!loadPlans.data, keepPrevious: true },
  );

  const parts = [
    regatta,
    events,
    entries,
    availability,
    regattaTeams,
    teams,
    shells,
    oarSets,
    gear,
    trailers,
    shelves,
    compartments,
    loadPlans,
    loadItems,
    users,
    clubSettings,
    seats,
    athletes,
    placements,
  ];
  const borrowedReady = borrowedIds.length === 0 || !!borrowed.data;
  const allLoaded = parts.every((p) => p.data !== undefined) && borrowedReady;
  const failed = [...parts, borrowed].filter((p) => p.isError);
  const notFound = regatta.isSuccess && !regatta.isPlaceholderData && regatta.data === null;

  const data = useMemo<RegattaWorkingSet | undefined>(() => {
    if (!allLoaded || !regatta.data) return undefined;
    const club = clubSettings.data![0] ?? null;
    const allTeams = teams.data!;
    const rtTeamIds = new Set(regattaTeams.data!.map((rt) => rt.teamId));
    const athleteRows = [
      ...athletes.data!,
      ...(borrowedIds.length > 0 ? (borrowed.data ?? []) : []),
    ];
    const seatsByEntry = new Map<Id, EntrySeat[]>();
    for (const s of seats.data!) {
      const list = seatsByEntry.get(s.entryId) ?? [];
      list.push(s);
      seatsByEntry.set(s.entryId, list);
    }
    const sortedEvents = sortEvents(events.data!);
    return {
      regatta: regatta.data,
      settings: effectiveSettings(regatta.data, club),
      clubSettings: club,
      events: sortedEvents,
      entries: entries.data!,
      seats: seats.data!,
      availability: availability.data!,
      regattaTeams: regattaTeams.data!,
      teams: allTeams,
      participatingTeams: allTeams.filter((t) => rtTeamIds.has(t.id)),
      athletes: athleteRows,
      shells: shells.data!,
      oarSets: oarSets.data!,
      gear: gear.data!,
      trailers: trailers.data!,
      shelves: shelves.data!,
      compartments: compartments.data!,
      loadPlans: loadPlans.data!,
      placements: placements.data!,
      loadItems: loadItems.data!,
      users: users.data!,
      byId: {
        teams: byId(allTeams),
        athletes: byId(athleteRows),
        shells: byId(shells.data!),
        oarSets: byId(oarSets.data!),
        events: byId(sortedEvents),
        entries: byId(entries.data!),
        users: byId(users.data!),
        trailers: byId(trailers.data!),
        shelves: byId(shelves.data!),
      },
      seatsByEntry,
    };
  }, [
    allLoaded,
    borrowedIds,
    regatta.data,
    events.data,
    entries.data,
    availability.data,
    regattaTeams.data,
    teams.data,
    shells.data,
    oarSets.data,
    gear.data,
    trailers.data,
    shelves.data,
    compartments.data,
    loadPlans.data,
    loadItems.data,
    users.data,
    clubSettings.data,
    seats.data,
    athletes.data,
    borrowed.data,
    placements.data,
  ]);

  const refetchFailed = () => {
    for (const p of failed) void p.refetch();
  };

  return {
    data,
    isLoading: enabled && !data && failed.length === 0 && !notFound,
    isError: failed.length > 0,
    error: failed[0]?.error ?? null,
    notFound,
    refetch: refetchFailed,
  };
}
