// Placeholder from WP-D (PLAN.md §6.11: club defaults, users and roles, activity log). Keep the
// default export: the router lazy-loads it.

import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <EmptyState
        title="Settings are not built yet"
        description="They will hold club defaults for regatta timing and units, users and roles, and the activity log."
      />
    </div>
  );
}
