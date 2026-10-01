// Fleet: shells, oar sets, and gear as three tabs, each its own route (/fleet/shells,
// /fleet/oars, /fleet/gear). The router lazy-loads this file's default export.

import { NavLink, useParams } from 'react-router';
import { cn } from '@/lib/cn';
import { NotFoundPage } from '@/app/pages';
import { GearTab } from './GearTab';
import { OarsTab } from './OarsTab';
import { ShellsTab } from './ShellsTab';

export const FLEET_TABS = [
  { tab: 'shells', label: 'Shells' },
  { tab: 'oars', label: 'Oars' },
  { tab: 'gear', label: 'Gear' },
] as const;

export type FleetTab = (typeof FLEET_TABS)[number]['tab'];

function FleetNav() {
  return (
    <nav aria-label="Fleet" className="flex gap-1 border-b border-line">
      {FLEET_TABS.map((t) => (
        <NavLink
          key={t.tab}
          to={`/fleet/${t.tab}`}
          className={({ isActive }) =>
            cn(
              '-mb-px flex h-10 items-center border-b-2 px-2.5 text-base font-medium pointer-coarse:h-11',
              isActive ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function FleetPage() {
  const { tab } = useParams();
  const nav = <FleetNav />;
  if (tab === 'shells') return <ShellsTab nav={nav} />;
  if (tab === 'oars') return <OarsTab nav={nav} />;
  if (tab === 'gear') return <GearTab nav={nav} />;
  return <NotFoundPage />;
}
