// Placeholder from WP-D. WP-I replaces this file (PLAN.md §6.8). Keep the default export: the
// router lazy-loads it for /fleet/:tab, where tab is shells, oars, or gear.

import { NavLink, useParams } from 'react-router';
import { cn } from '@/lib/cn';
import { NotFoundPage } from '@/app/pages';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states';

export const FLEET_TABS = [
  { tab: 'shells', label: 'Shells' },
  { tab: 'oars', label: 'Oars' },
  { tab: 'gear', label: 'Gear' },
] as const;

export type FleetTab = (typeof FLEET_TABS)[number]['tab'];

export default function FleetPage() {
  const { tab } = useParams();
  const current = FLEET_TABS.find((t) => t.tab === tab);
  if (!current) return <NotFoundPage />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Fleet">
        <nav aria-label="Fleet" className="flex gap-1 border-b border-line">
          {FLEET_TABS.map((t) => (
            <NavLink
              key={t.tab}
              to={`/fleet/${t.tab}`}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex h-10 items-center border-b-2 px-2.5 text-base font-medium',
                  isActive
                    ? 'border-accent text-ink'
                    : 'border-transparent text-ink-2 hover:text-ink',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </PageHeader>
      <EmptyState
        title={`The ${current.label.toLowerCase()} table is not built yet`}
        description="It will be an editable table with filters, CSV import and export, and a detail drawer showing upcoming use."
      />
    </div>
  );
}
