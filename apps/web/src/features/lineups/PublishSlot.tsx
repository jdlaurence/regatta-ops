// The "Publish lineups" slot in the lineup page header: the publish button and the "Published 2 h
// ago · 3 changes since" line (components/PublishStatus.tsx).

import { PublishStatus } from '@/components/PublishStatus';

export interface PublishSlotProps {
  regattaId: string;
  teamId: string;
}

export function PublishSlot({ regattaId, teamId }: PublishSlotProps) {
  return <PublishStatus regattaId={regattaId} teamId={teamId} />;
}
