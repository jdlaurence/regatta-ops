// What the inspector shows when no page has claimed it (PLAN.md §5.3): the regatta's
// conflicts (components/ConflictsPanel: navigation, team filter, hot-seat acknowledgment),
// then its recent activity (components/ActivityFeed: links to what changed).

import { ActivityFeed } from '@/components/ActivityFeed';
import { ConflictsPanel } from '@/components/ConflictsPanel';

export function DefaultInspector({ regattaId }: { regattaId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <ConflictsPanel regattaId={regattaId} />
      <ActivityFeed regattaId={regattaId} />
    </div>
  );
}
