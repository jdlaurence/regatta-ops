// Placeholder from WP-D. WP-F replaces this file (PLAN.md §6.1). Keep the default export: the
// router lazy-loads it.

import { Plus } from 'lucide-react';
import { useCan } from '@/data';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';

export default function RegattasListPage() {
  const canEdit = useCan('regatta.edit');
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Regattas"
        actions={
          canEdit && (
            <Button variant="primary" disabled>
              <Plus aria-hidden />
              New regatta
            </Button>
          )
        }
      />
      <EmptyState
        title="The regattas list is not built yet"
        description="Upcoming regattas are in the navigation. This page will show each one with its dates, venue, teams, conflicts, and load plan status."
      />
    </div>
  );
}
