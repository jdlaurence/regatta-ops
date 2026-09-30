// /share/:token and /share/:token/load (PLAN.md §2 share links, §4.8, §4.11; Phase 3). The page
// athletes and parents open without signing in: a regatta's published lineups and day schedule,
// and for links that allow it, the load list the loading crew ticks on their phones. Outside the
// app shell and the sign-in wall; everything comes from useShare(token), never from collections.

import { useEffect, type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router';
import { isShareGone, useShare, type ShareView } from '@/data';
import { LogoMark } from '@/app/shell/Logo';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/states';
import { formatDayRange } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { LoadChecklist } from './LoadChecklist';
import { ShareSchedule } from './ShareSchedule';
import { shortInstant } from './share-view';

function Frame({ clubName, children }: { clubName?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <LogoMark />
          <span className="min-w-0 truncate text-base font-medium text-ink">
            {clubName || 'Regatta lineups'}
          </span>
        </div>
      </header>
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-5 md:px-6 md:py-8"
      >
        {children}
      </main>
    </div>
  );
}

/** Keeps the page out of search results and names the tab after the regatta. */
function useShareDocument(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = previous;
      meta.remove();
    };
  }, [title]);
}

function Heading({ view }: { view: ShareView }) {
  const { regatta } = view;
  const place = [regatta.venue, regatta.city].filter(Boolean).join(', ');
  const scoped = view.link.scope === 'team' ? view.teams[0] : undefined;
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-display text-xl font-semibold md:text-2xl">{regatta.name}</h1>
      <p className="text-base text-ink-2">
        {[formatDayRange(regatta.startDate, regatta.endDate), place].filter(Boolean).join(' · ')}
      </p>
      {scoped && <p className="text-base text-ink-2">Lineups for {scoped.name}</p>}
    </div>
  );
}

function Tabs({ token, tab }: { token: string; tab: 'schedule' | 'load' }) {
  const base = `/share/${encodeURIComponent(token)}`;
  const link = (active: boolean) =>
    cn(
      '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-base font-medium pointer-coarse:h-11',
      active ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink',
    );
  return (
    <nav aria-label="Share page" className="flex gap-1 border-b border-line">
      <NavLink to={base} end replace className={() => link(tab === 'schedule')}>
        Schedule
      </NavLink>
      <NavLink to={`${base}/load`} replace className={() => link(tab === 'load')}>
        Load list
      </NavLink>
    </nav>
  );
}

function Gone() {
  return (
    <Frame>
      <div className="flex max-w-prose flex-col gap-2 rounded-card border border-dashed border-line-strong/60 px-5 py-6">
        <h1 className="font-display text-xl font-semibold">This link is no longer active</h1>
        <p className="text-md leading-prose text-ink-2">Ask your coach for a new one.</p>
      </div>
    </Frame>
  );
}

function Loading() {
  return (
    <Frame>
      <div className="flex flex-col gap-2" role="status" aria-label="Loading">
        <Skeleton className="h-8 w-3/4 max-w-md" />
        <Skeleton className="h-5 w-1/2 max-w-xs" />
      </div>
      <SkeletonRows rows={6} className="[&>*]:h-24" />
    </Frame>
  );
}

export default function SharePage() {
  const params = useParams();
  const token = params.token ?? '';
  const tab = (params['*'] ?? '').replace(/\/+$/, '') === 'load' ? 'load' : 'schedule';
  const share = useShare(token);
  const data = share.data;
  const gone = isShareGone(share.error);
  useShareDocument(
    gone ? 'Link no longer active' : data ? data.view.regatta.name : 'Regatta lineups',
  );

  if (gone) return <Gone />;
  if (!data) {
    if (share.isPending) return <Loading />;
    return (
      <Frame>
        <ErrorState
          title="This page did not load."
          error={share.error}
          onRetry={() => void share.refetch()}
        />
      </Frame>
    );
  }

  const { view, fromDevice } = data;
  return (
    <Frame clubName={view.clubName}>
      <Heading view={view} />
      {fromDevice && (
        <p
          role="status"
          className="rounded-card border border-line bg-surface-2 px-4 py-3 text-base text-ink"
        >
          Offline. Showing the copy saved on this device at{' '}
          {shortInstant(view.generatedAt, view.regatta.timezone)}.
        </p>
      )}
      {view.link.canCheckLoad && <Tabs token={token} tab={tab} />}
      {tab === 'load' ? (
        view.link.canCheckLoad ? (
          <LoadChecklist token={token} view={view} />
        ) : (
          <div className="flex max-w-prose flex-col gap-2 rounded-card border border-dashed border-line-strong/60 px-5 py-6">
            <h2 className="text-md font-medium">This link does not include the load list</h2>
            <p className="text-base leading-prose text-ink-2">
              Ask a coach for a link that can check off the load list.{' '}
              <NavLink to={`/share/${encodeURIComponent(token)}`} className="text-accent underline">
                See the schedule
              </NavLink>
            </p>
          </div>
        )
      ) : (
        <ShareSchedule view={view} />
      )}
    </Frame>
  );
}
