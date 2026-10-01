// Side navigation (PLAN.md §5.3): regattas (upcoming first), then club sections. The current
// regatta expands to show its tabs. Desktop shows the full 232 px column; tablet an icon rail.

import { useMemo, useState } from 'react';
import { NavLink, useMatch, useResolvedPath } from 'react-router';
import { ChevronDown, Flag } from 'lucide-react';
import { useList } from '@/data';
import { cn } from '@/lib/cn';
import { formatDayRange, splitRegattas, todayIn } from '@/lib/dates';
import { Skeleton } from '@/components/states';
import { Tooltip } from '@/components/ui/menu';
import type { Regatta } from '@regatta-ops/domain';
import { CLUB_SECTIONS, REGATTA_TABS, regattaPath } from '../nav-items';
import { LogoMark, Wordmark } from './Logo';
import { UserMenu } from './UserMenu';

/** The regatta in the URL, if any. */
export function useCurrentRegattaId(): string | null {
  const match = useMatch('/regattas/:id/*');
  return match?.params.id ?? null;
}

export function useNavRegattas() {
  const q = useList('regattas', { sort: 'startDate' });
  const today = todayIn();
  const split = useMemo(() => splitRegattas(q.data ?? [], today), [q.data, today]);
  return { ...split, all: q.data, isPending: q.isPending, isError: q.isError, refetch: q.refetch };
}

const itemBase =
  'flex h-9 min-w-0 items-center gap-2.5 rounded-control px-2.5 text-base text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0';
const itemActive = 'bg-surface-2 font-medium text-ink [&_svg]:text-accent';

function RegattaItem({ regatta, current }: { regatta: Regatta; current: boolean }) {
  return (
    <li>
      <NavLink
        to={regattaPath(regatta.id)}
        end
        className={({ isActive }) =>
          cn(
            'flex min-w-0 flex-col justify-center rounded-control px-2.5 py-1.5 hover:bg-surface-2',
            current ? 'text-ink' : 'text-ink-2 hover:text-ink',
            isActive && 'bg-surface-2',
          )
        }
      >
        <span className={cn('truncate text-base', current && 'font-medium')}>{regatta.name}</span>
        <span className="truncate text-xs text-ink-2 tabular-nums">
          {formatDayRange(regatta.startDate, regatta.endDate)}
        </span>
      </NavLink>
      {current && (
        <ul className="mt-0.5 mb-1.5 ml-3 flex flex-col gap-px border-l border-line pl-2">
          {REGATTA_TABS.map((tab) => (
            <li key={tab.segment}>
              <NavLink
                to={regattaPath(regatta.id, tab.segment)}
                end={tab.segment === ''}
                className={({ isActive }) => cn(itemBase, 'h-8', isActive && itemActive)}
              >
                <tab.icon aria-hidden />
                <span className="truncate">{tab.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The full navigation: desktop column and the phone's menu sheet. */
export function SideNav() {
  const currentId = useCurrentRegattaId();
  const fleet = useMatch('/fleet/*');
  const { upcoming, past, isPending, isError, refetch } = useNavRegattas();
  const currentIsPast = past.some((r) => r.id === currentId);
  const [showPast, setShowPast] = useState(false);
  const pastOpen = showPast || currentIsPast;

  return (
    <nav aria-label="Main" className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <NavLink to="/" aria-label="Regatta Ops, all regattas" className="rounded-control">
          <Wordmark />
        </NavLink>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2.5 pb-4">
        <section aria-labelledby="nav-regattas" className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2.5">
            <h2 id="nav-regattas" className="text-sm font-medium text-ink-2">
              Regattas
            </h2>
            <NavLink to="/" end className="text-sm text-accent hover:underline">
              All
            </NavLink>
          </div>
          {isPending && (
            <div className="flex flex-col gap-2 px-2.5 py-1" role="status" aria-label="Loading">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          )}
          {isError && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="px-2.5 text-left text-sm text-danger hover:underline"
            >
              Regattas did not load. Try again.
            </button>
          )}
          {!isPending && !isError && upcoming.length === 0 && (
            <p className="px-2.5 text-sm leading-prose text-ink-2">
              No upcoming regattas. Create one from the regattas page.
            </p>
          )}
          <ul className="flex flex-col gap-px">
            {upcoming.map((r) => (
              <RegattaItem key={r.id} regatta={r} current={r.id === currentId} />
            ))}
          </ul>
          {past.length > 0 && (
            <div className="flex flex-col gap-px">
              <button
                type="button"
                aria-expanded={pastOpen}
                onClick={() => setShowPast((v) => !v)}
                className="flex h-8 items-center gap-1.5 rounded-control px-2.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11"
              >
                <ChevronDown
                  aria-hidden
                  className={cn('size-4 transition-transform', !pastOpen && '-rotate-90')}
                />
                Past regattas
                <span className="tabular-nums">({past.length})</span>
              </button>
              {pastOpen && (
                <ul className="flex flex-col gap-px">
                  {past.map((r) => (
                    <RegattaItem key={r.id} regatta={r} current={r.id === currentId} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
        <section aria-label="Club pages" className="flex flex-col gap-px border-t border-line pt-4">
          {CLUB_SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(itemBase, (isActive || (s.to.startsWith('/fleet') && !!fleet)) && itemActive)
              }
            >
              <s.icon aria-hidden />
              {s.label}
            </NavLink>
          ))}
        </section>
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <UserMenu />
      </div>
    </nav>
  );
}

function RailLink({
  to,
  label,
  icon: Icon,
  end,
  active,
}: {
  to: string;
  label: string;
  icon: typeof Flag;
  end?: boolean;
  active?: boolean;
}) {
  // Tooltip's Slot would stringify a className function, so work out "active" here.
  const resolved = useResolvedPath(to);
  const isActive = !!useMatch({ path: resolved.pathname, end: !!end });
  return (
    <Tooltip content={label} side="right">
      <NavLink
        to={to}
        end={end}
        aria-label={label}
        className={cn(
          'flex size-11 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink [&_svg]:size-5',
          (isActive || active) && 'bg-surface-2 text-accent',
        )}
      >
        <Icon aria-hidden />
      </NavLink>
    </Tooltip>
  );
}

/** Tablet: navigation as a column of icons. */
export function RailNav() {
  const currentId = useCurrentRegattaId();
  const fleet = useMatch('/fleet/*');
  return (
    <nav aria-label="Main" className="flex h-full flex-col items-center gap-1 py-3">
      <NavLink
        to="/"
        aria-label="Regatta Ops, all regattas"
        className="mb-3 flex h-8 items-center rounded-control"
      >
        <LogoMark />
      </NavLink>
      <RailLink to="/" end label="Regattas" icon={Flag} />
      {currentId && (
        <div className="my-1 flex flex-col items-center gap-1 border-y border-line py-2">
          {REGATTA_TABS.map((tab) => (
            <RailLink
              key={tab.segment}
              to={regattaPath(currentId, tab.segment)}
              end={tab.segment === ''}
              label={tab.label}
              icon={tab.icon}
            />
          ))}
        </div>
      )}
      {CLUB_SECTIONS.map((s) => (
        <RailLink
          key={s.to}
          to={s.to}
          label={s.label}
          icon={s.icon}
          active={s.to.startsWith('/fleet') && !!fleet}
        />
      ))}
      <div className="mt-auto">
        <UserMenu compact side="right" />
      </div>
    </nav>
  );
}
