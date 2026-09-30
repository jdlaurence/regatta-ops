import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { AppProviders } from './providers';
import { createTestRouter } from './router';

function renderApp(path: string, store: MemoryStore = fixtureStore()) {
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, path);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, store };
}

describe('the app in demo mode', () => {
  it('renders the shell and a placeholder page', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Regattas' })).toBeInTheDocument();
    await screen.findAllByText('Head of the Lake');
    const navs = screen.getAllByRole('navigation', { name: 'Main' });
    const side = navs.find((n) => within(n).queryByText('Head of the Lake'))!;
    expect(side).toBeDefined();
    // Upcoming regattas soonest first, then the club sections.
    const links = within(side)
      .getAllByRole('link')
      .map((a) => a.textContent);
    expect(links.indexOf('Head of the LakeNov 1, 2026')).toBeLessThan(
      links.indexOf('Tail of the LakeMar 1, 2027'),
    );
    expect(links).toEqual(expect.arrayContaining(['Fleet', 'Trailers', 'Teams', 'Settings']));
  });

  it('shows a regatta with its tabs, and the inspector with conflicts and activity', async () => {
    renderApp(`/regattas/${IDS.regatta}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Regatta sections' });
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Overview', 'Schedule', 'Lineups', 'Availability', 'Trailer', 'Load list']);
    const inspector = screen.getByRole('complementary', { name: 'Conflicts and activity' });
    expect(
      await within(inspector).findByRole('heading', { name: /^Conflicts \d+$/ }),
    ).toBeInTheDocument();
    expect(within(inspector).getByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    expect(await screen.findByText('Junior boys')).toBeInTheDocument();
  });

  it('toggles the inspector with ]', async () => {
    const user = userEvent.setup();
    renderApp(`/regattas/${IDS.regatta}/schedule`);
    await screen.findByRole('heading', { level: 1, name: 'Schedule' });
    const inspector = screen.getByRole('complementary', { name: 'Conflicts and activity' });
    expect(inspector).toHaveAttribute('data-state', 'open');
    await user.keyboard(']');
    expect(inspector).toHaveAttribute('data-state', 'closed');
    await user.keyboard(']');
    expect(inspector).toHaveAttribute('data-state', 'open');
  });

  it("sends /lineups to the coach's default team", async () => {
    const { router } = renderApp(`/regattas/${IDS.regatta}/lineups`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Junior girls lineups' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/regattas/${IDS.regatta}/lineups/${IDS.girls}`);
  });

  it('renders print routes without the shell', async () => {
    renderApp(`/print/regattas/${IDS.regatta}/schedule`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Head of the Lake schedule' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('shows not found for unknown pages and regattas', async () => {
    renderApp('/nowhere');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('asks for sign-in, then returns to the page', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/teams', fixtureStore({ signedIn: null }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Fteams');
    await user.click(await screen.findByRole('button', { name: /Vic Viewer/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Teams' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/teams');
  });
});
