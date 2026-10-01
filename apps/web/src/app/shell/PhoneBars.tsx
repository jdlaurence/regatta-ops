// Phone chrome (< 768 px, PLAN.md §5.3): a top bar with the regatta name and a back button, and
// inside a regatta a bottom tab bar (Schedule, Lineups, Trailer, Load list). Outside a regatta
// the top bar opens the full navigation in a sheet.

import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { ArrowLeft, Ellipsis, Menu, PanelRight } from 'lucide-react';
import { useRecord } from '@/data';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useInspector } from '@/components/Inspector';
import { REGATTA_TABS, regattaPath } from '../nav-items';
import { Wordmark } from './Logo';
import { SideNav } from './Nav';
import { UserMenu } from './UserMenu';

function NavSheet() {
  // Open for the page it was opened on: following a link closes it.
  const { pathname } = useLocation();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden />
      </Button>
      <SheetContent side="left" title="Navigation" hideHeader>
        <SideNav />
      </SheetContent>
    </Sheet>
  );
}

function RegattaMenu({ regattaId }: { regattaId: string }) {
  const { setOpen } = useInspector();
  const others = REGATTA_TABS.filter((t) => !t.phone);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More regatta pages">
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom">
        {others.map((t) => (
          <DropdownMenuItem key={t.segment} asChild>
            <Link to={regattaPath(regattaId, t.segment)}>
              <t.icon aria-hidden />
              {t.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setOpen(true)}>
          <PanelRight aria-hidden />
          Conflicts and activity
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PhoneTopBar({ regattaId }: { regattaId: string | null }) {
  const regatta = useRecord('regattas', regattaId);
  return (
    <header
      data-print="hide"
      className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-line bg-surface px-1.5 md:hidden"
    >
      {regattaId ? (
        <Button asChild variant="ghost" size="icon">
          <Link to="/" aria-label="Back to regattas">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
      ) : (
        <NavSheet />
      )}
      <div className="min-w-0 flex-1 px-1">
        {regattaId ? (
          <Link
            to={regattaPath(regattaId)}
            className="flex h-11 min-w-0 items-center font-display text-md font-semibold"
          >
            <span className="truncate">{regatta.data?.name ?? ' '}</span>
          </Link>
        ) : (
          <Link
            to="/"
            aria-label="Regatta Ops, all regattas"
            className="inline-flex h-11 items-center"
          >
            <Wordmark />
          </Link>
        )}
      </div>
      {regattaId && <RegattaMenu regattaId={regattaId} />}
      <UserMenu compact side="bottom" />
    </header>
  );
}

export function PhoneTabBar({ regattaId }: { regattaId: string }) {
  return (
    <nav
      aria-label="Regatta"
      data-print="hide"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {REGATTA_TABS.filter((t) => t.phone).map((t) => (
        <NavLink
          key={t.segment}
          to={regattaPath(regattaId, t.segment)}
          className={({ isActive }) =>
            cn(
              'flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium [&_svg]:size-5',
              isActive ? 'text-accent' : 'text-ink-2',
            )
          }
        >
          <t.icon aria-hidden />
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
