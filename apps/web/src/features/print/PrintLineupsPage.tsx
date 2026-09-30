// Placeholder from WP-D. WP-K replaces this file (PLAN.md §4.11, §6.12): the lineup sheet for
// /print/regattas/:id/lineups/:teamId?day=. Keep the default export.

import { useSearchParams } from 'react-router';
import { useRecord } from '@/data';
import { useRegattaId, useTeamIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { EmptyState } from '@/components/states';
import { PrintFrame } from './PrintFrame';

export default function PrintLineupsPage() {
  const regattaId = useRegattaId();
  const teamId = useTeamIdParam();
  const [params] = useSearchParams();
  const team = useRecord('teams', teamId);
  const day = params.get('day');
  return (
    <PrintFrame
      title={`${team.data?.name ?? 'Team'} lineups${day ? `, ${day}` : ''}`}
      backTo={regattaPath(regattaId, `lineups/${teamId ?? ''}`)}
    >
      <EmptyState
        title="The lineup sheet is not built yet"
        description="It will print one page per team with entries in time order, compact boat strips, hot seat plans, and who is unboated."
      />
    </PrintFrame>
  );
}
