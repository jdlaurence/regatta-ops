// Every route in the app. Pages load lazily from their feature folders; each page file
// default-exports its component.

import type { ComponentType } from 'react';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  type RouteObject,
} from 'react-router';
import type { QueryClient } from '@tanstack/react-query';
import { prefetchRegattaWorkingSet, type DataStore } from '@/data';
import { PageSkeleton } from '@/components/states';
import { RequireAuth } from './auth/RequireAuth';
import { NotFoundPage, RouteError } from './pages';
import { AppShell } from './shell/AppShell';
import { RegattaLayout } from './shell/RegattaLayout';

type PageModule = { default: ComponentType };

/** A lazy route whose module default-exports the page. */
const page = (load: () => Promise<PageModule>) => async () => ({
  Component: (await load()).default,
});

export const DEV_ROUTES_ENABLED = import.meta.env.DEV || import.meta.env.MODE === 'demo';

export interface RouterDeps {
  queryClient: QueryClient;
  store: DataStore;
}

export function buildRoutes({ queryClient, store }: RouterDeps): RouteObject[] {
  const regattaChildren: RouteObject[] = [
    { index: true, lazy: page(() => import('@/features/regattas/RegattaOverviewPage')) },
    { path: 'schedule', lazy: page(() => import('@/features/schedule/SchedulePage')) },
    { path: 'lineups', lazy: page(() => import('@/features/lineups/LineupsRedirect')) },
    { path: 'lineups/:teamId', lazy: page(() => import('@/features/lineups/LineupsPage')) },
    // Availability lives on each team's page; old links land on the lineups.
    { path: 'availability', element: <Navigate to="../lineups" relative="path" replace /> },
    { path: 'trailer', lazy: page(() => import('@/features/trailer/TrailerPage')) },
    { path: 'trailer/:trailerId', lazy: page(() => import('@/features/trailer/TrailerPage')) },
    { path: 'load', lazy: page(() => import('@/features/load-list/LoadListPage')) },
    { path: '*', element: <NotFoundPage /> },
  ];

  const shellChildren: RouteObject[] = [
    { index: true, lazy: page(() => import('@/features/regattas/RegattasListPage')) },
    {
      path: 'regattas/:id',
      element: <RegattaLayout />,
      // Start loading the working set with the route (§10.1); pages render skeletons meanwhile.
      loader: ({ params }) => {
        if (params.id && store.auth.user) {
          prefetchRegattaWorkingSet(queryClient, store, params.id);
        }
        return null;
      },
      children: regattaChildren,
    },
    { path: 'fleet', element: <Navigate to="/fleet/shells" replace /> },
    { path: 'fleet/:tab', lazy: page(() => import('@/features/fleet/FleetPage')) },
    { path: 'trailers', lazy: page(() => import('@/features/trailers-admin/TrailersListPage')) },
    { path: 'trailers/:id', lazy: page(() => import('@/features/trailers-admin/TrailerEditPage')) },
    { path: 'teams', lazy: page(() => import('@/features/teams/TeamsListPage')) },
    { path: 'teams/:id', lazy: page(() => import('@/features/teams/TeamPage')) },
    { path: 'teams/:id/:tab', lazy: page(() => import('@/features/teams/TeamPage')) },
    { path: 'settings', lazy: page(() => import('@/features/settings/SettingsPage')) },
    ...(DEV_ROUTES_ENABLED
      ? [{ path: 'dev/components', lazy: page(() => import('./dev/ComponentGallery')) }]
      : []),
    { path: '*', element: <NotFoundPage /> },
  ];

  return [
    {
      id: 'root',
      element: <Outlet />,
      errorElement: <RouteError />,
      hydrateFallbackElement: (
        <div className="p-6">
          <PageSkeleton />
        </div>
      ),
      children: [
        { path: 'sign-in', lazy: page(() => import('./auth/SignInPage')) },
        { path: 'share/:token/*', lazy: page(() => import('@/features/share/SharePage')) },
        {
          element: <RequireAuth />,
          children: [
            { element: <AppShell />, children: shellChildren },
            {
              path: 'print/regattas/:id/lineups/:teamId',
              lazy: page(() => import('@/features/print/PrintLineupsPage')),
            },
            {
              path: 'print/regattas/:id/schedule',
              lazy: page(() => import('@/features/print/PrintSchedulePage')),
            },
            {
              path: 'print/regattas/:id/load/:trailerId',
              lazy: page(() => import('@/features/print/PrintLoadPage')),
            },
          ],
        },
      ],
    },
  ];
}

export function createAppRouter(deps: RouterDeps) {
  // The published demo lives under /<repository>/ on GitHub Pages (vite.config.ts `base`).
  const basename = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
  return createBrowserRouter(buildRoutes(deps), { basename });
}

/** For tests: the same routes in memory, starting at `initialPath`. */
export function createTestRouter(deps: RouterDeps, initialPath = '/') {
  return createMemoryRouter(buildRoutes(deps), { initialEntries: [initialPath] });
}
