// The app shell (PLAN.md §5.3). Desktop (≥ 1024 px): 232 px navigation, content, and an
// optional 336 px inspector. Tablet: an icon rail and the inspector as a slide-over. Phone: a
// top bar, a bottom tab bar inside a regatta, 16 px gutters, no horizontal scroll.

import { Suspense } from 'react';
import { Outlet } from 'react-router';
import { cn } from '@/lib/cn';
import { PageSkeleton } from '@/components/states';
import { useInspectorClaimed } from '@/components/Inspector';
import { OfflineBanner } from '@/pwa/OfflineBanner';
import { InspectorPanel, useDesktopSync, useInspectorShortcut } from './InspectorPanel';
import { RailNav, SideNav, useCurrentRegattaId } from './Nav';
import { PhoneTabBar, PhoneTopBar } from './PhoneBars';

export function AppShell() {
  const regattaId = useCurrentRegattaId();
  const claimed = useInspectorClaimed();
  const inspectorAvailable = !!regattaId || claimed;
  useDesktopSync();
  useInspectorShortcut(inspectorAvailable);

  return (
    <div className="flex min-h-dvh w-full bg-bg text-ink">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <aside
        data-print="hide"
        className="sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface md:block md:w-16 lg:w-[232px]"
      >
        <div className="h-full lg:hidden">
          <RailNav />
        </div>
        <div className="hidden h-full lg:block">
          <SideNav />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <PhoneTopBar regattaId={regattaId} />
        <OfflineBanner />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 px-4 py-5 outline-none md:px-6 md:py-6 lg:px-8',
            regattaId && 'pb-24 md:pb-6',
          )}
        >
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <InspectorPanel regattaId={regattaId} available={inspectorAvailable} />
      {regattaId && <PhoneTabBar regattaId={regattaId} />}
    </div>
  );
}
