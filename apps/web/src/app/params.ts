import { useParams } from 'react-router';

/** The :id of a /regattas/:id/... route. Only call inside regatta routes. */
export function useRegattaId(): string {
  const { id } = useParams();
  if (!id) throw new Error('useRegattaId must be used inside a /regattas/:id route.');
  return id;
}

/** The :teamId of /regattas/:id/lineups/:teamId and the print lineup route. */
export function useTeamIdParam(): string | null {
  return useParams().teamId ?? null;
}

/** The :trailerId of /regattas/:id/trailer/:trailerId and the print load route. */
export function useTrailerIdParam(): string | null {
  return useParams().trailerId ?? null;
}
