// Data for the trailers admin pages, through the generic data hooks (PLAN.md §11.2).

import { useMemo } from 'react';
import {
  packBoatsFromEntities,
  trailerDefFromRecords,
  type Id,
  type PackBoat,
  type Team,
  type TrailerDef,
} from '@srt/domain';
import { useBatch, useDelete, useList, useRecord } from '@/data';
import { toast } from '@/components/toast';
import { saveOps, type SavedTrailer, type TrailerDraft } from './draft';

/** Every trailer as a packer definition, with its record, by name. */
export function useTrailerList() {
  const trailers = useList('trailers', { sort: 'name' });
  const shelves = useList('trailer_shelves', { sort: ['sortOrder', 'tier'] });
  const compartments = useList('trailer_compartments');
  const data = useMemo(() => {
    if (!trailers.data || !shelves.data || !compartments.data) return undefined;
    return trailers.data.map((t) => ({
      trailer: t,
      def: trailerDefFromRecords(t, shelves.data, compartments.data),
    }));
  }, [trailers.data, shelves.data, compartments.data]);
  const queries = [trailers, shelves, compartments];
  return {
    data,
    isPending: queries.some((q) => q.isPending),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.error)?.error,
    refetch: () => queries.forEach((q) => void q.refetch()),
  };
}

/** One trailer with its shelves and compartments, as stored. `data` is null when not found. */
export function useSavedTrailer(id: Id | undefined) {
  const trailer = useRecord('trailers', id);
  const shelves = useList(
    'trailer_shelves',
    { where: { trailerId: id ?? '' }, sort: ['sortOrder', 'tier'] },
    { enabled: !!id },
  );
  const compartments = useList(
    'trailer_compartments',
    { where: { trailerId: id ?? '' } },
    { enabled: !!id },
  );
  const data = useMemo((): SavedTrailer | null | undefined => {
    if (trailer.data === undefined || !shelves.data || !compartments.data) return undefined;
    if (trailer.data === null) return null;
    return { trailer: trailer.data, shelves: shelves.data, compartments: compartments.data };
  }, [trailer.data, shelves.data, compartments.data]);
  const queries = [trailer, shelves, compartments];
  return {
    data,
    isPending: data === undefined && !queries.some((q) => q.isError),
    isError: queries.some((q) => q.isError),
    error: queries.find((q) => q.error)?.error,
    refetch: () => queries.forEach((q) => void q.refetch()),
  };
}

/** Save a draft (new or existing trailer) in one batch. */
export function useSaveTrailer() {
  const batch = useBatch({ errorMessage: 'The trailer was not saved. Try again.' });
  return {
    ...batch,
    save: (saved: SavedTrailer | null, draft: TrailerDraft) =>
      batch.mutateAsync(saveOps(saved, draft)),
  };
}

export function useDeleteTrailer() {
  return useDelete('trailers', {
    errorMessage: 'The trailer was not deleted. Try again.',
    onSuccess: () => toast.success('Trailer deleted'),
  });
}

/** Load plans that use a trailer (deleting the trailer deletes them). */
export function useTrailerLoadPlans(trailerId: Id | undefined) {
  return useList('load_plans', { where: { trailerId: trailerId ?? '' } }, { enabled: !!trailerId });
}

/** How many load-plan placements sit on these shelves. */
export function usePlacementsOnShelves(shelfIds: Id[]) {
  const q = useList(
    'load_placements',
    { in: { shelfId: shelfIds } },
    { enabled: shelfIds.length > 0 },
  );
  return shelfIds.length === 0 ? 0 : (q.data?.length ?? 0);
}

/** Boats racing at a regatta (every non-scratched entry's shell), for a test pack. */
export function useRegattaBoats(
  regattaId: Id | null,
  spareShellIds?: Id[],
): {
  boats: PackBoat[] | undefined;
  teams: Team[] | undefined;
  isPending: boolean;
} {
  const enabled = !!regattaId;
  const entries = useList('entries', { where: { regattaId: regattaId ?? '' } }, { enabled });
  const events = useList('events', { where: { regattaId: regattaId ?? '' } }, { enabled });
  const shells = useList('shells', undefined, { enabled });
  const teams = useList('teams', { sort: 'sortOrder' });
  const boats = useMemo(() => {
    if (!entries.data || !events.data || !shells.data || !teams.data) return undefined;
    return packBoatsFromEntities({
      shells: shells.data,
      entries: entries.data,
      events: events.data,
      teams: teams.data,
      ...(spareShellIds ? { spareShellIds } : {}),
    });
  }, [entries.data, events.data, shells.data, teams.data, spareShellIds]);
  return { boats, teams: teams.data, isPending: enabled && boats === undefined };
}

/** Shell ids placed in a load plan. */
export function usePlanShellIds(planId: Id | null): Id[] | undefined {
  const q = useList(
    'load_placements',
    { where: { loadPlanId: planId ?? '' } },
    { enabled: !!planId },
  );
  return useMemo(() => q.data?.map((p) => p.shellId), [q.data]);
}

export type { TrailerDef };
