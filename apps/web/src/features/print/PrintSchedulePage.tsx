// Placeholder from WP-D. WP-K replaces this file (PLAN.md §4.11, §6.12): the master schedule
// for /print/regattas/:id/schedule. Keep the default export.

import { useRecord } from '@/data';
import { useRegattaId } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { EmptyState } from '@/components/states';
import { PrintFrame } from './PrintFrame';

export default function PrintSchedulePage() {
  const regattaId = useRegattaId();
  const regatta = useRecord('regattas', regattaId);
  return (
    <PrintFrame
      title={`${regatta.data?.name ?? 'Regatta'} schedule`}
      backTo={regattaPath(regattaId, 'schedule')}
    >
      <EmptyState
        title="The master schedule is not built yet"
        description="It will print every team's races in time order with shells and oars, for taping to the trailer."
      />
    </PrintFrame>
  );
}
