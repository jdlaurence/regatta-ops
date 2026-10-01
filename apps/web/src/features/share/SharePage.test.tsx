import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { memoryShareApi, shareQueryKey, ShareApiProvider, StoreError, type ShareApi } from '@/data';
import type { MemoryStore } from '@/data/memory-store';
import { formatWeekday } from '@/lib/dates';
import { testQueryClient } from '@/test/render';
import { NAME_STORAGE_KEY, resetQueues } from './useLoadChecklist';
import { SHARE_IDS, TOKENS, shareStore } from '@/test/share-fixtures';

function renderShare(path: string, opts: { store?: MemoryStore; api?: ShareApi } = {}) {
  const store = opts.store ?? shareStore();
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, path);
  const routerEl = <RouterProvider router={router} />;
  render(
    <AppProviders store={store} queryClient={queryClient}>
      {opts.api ? <ShareApiProvider api={opts.api}>{routerEl}</ShareApiProvider> : routerEl}
    </AppProviders>,
  );
  return { store, router, queryClient };
}

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

beforeEach(() => resetQueues());
afterEach(() => vi.restoreAllMocks());

describe('the public share page', () => {
  it('shows published lineups, race times, and logistics without signing in', async () => {
    const { router } = renderShare(`/share/${TOKENS.wide}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Head of the Lake' }),
    ).toBeInTheDocument();
    // Public: no redirect to sign-in, no app navigation.
    expect(router.state.location.pathname).toBe(`/share/${TOKENS.wide}`);
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.getByText('Sammamish Rowing Association')).toBeInTheDocument();

    const published = screen.getByRole('list', { name: 'Published lineups' });
    expect(within(published).getByText(/^Published Oct 29, (2026, )?9:00 PM$/)).toBeInTheDocument();
    expect(within(published).getByText('Lineups not published yet')).toBeInTheDocument();

    const day = screen.getByRole('list', { name: 'Races and schedule' });
    expect(within(day).getByText("Event 12 · Men's Junior 4+")).toBeInTheDocument();
    expect(within(day).getByText('9:40')).toBeInTheDocument();
    // The boat strip (wide screens) and the name list (phones) both carry the crew.
    expect(within(day).getAllByText('Rowan Test').length).toBeGreaterThan(0);
    expect(
      within(day).getByRole('group', { name: /^Boys V4\+, 2 of 5 seats filled/ }),
    ).toBeVisible();
    const names = within(day).getByRole('list', { name: 'V4+ crew' });
    expect(
      within(names)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['CoxNot set', 'StrokeNot set', '3Not set', '2Emery Sample', 'BowRowan Test']);
    expect(within(day).getByText('Meet at dock B')).toBeInTheDocument();
    expect(within(day).getByText('Lunch at the tent')).toBeInTheDocument();
    expect(within(day).getByText('Girls cox meeting')).toBeInTheDocument();

    // Drafts and races without a published crew stay off the page.
    expect(screen.queryByText('Girls draft crew')).not.toBeInTheDocument();
    expect(screen.queryByText("Event 14 · Men's Junior 8+")).not.toBeInTheDocument();
    expect(screen.queryByText(/Jules/)).not.toBeInTheDocument();
    // No load list on this link.
    expect(screen.queryByRole('link', { name: 'Load list' })).not.toBeInTheDocument();
  });

  it('switches days and filters by team', async () => {
    const user = userEvent.setup();
    const { router } = renderShare(`/share/${TOKENS.wide}`);
    await screen.findByRole('heading', { level: 1, name: 'Head of the Lake' });

    await user.click(screen.getByRole('radio', { name: formatWeekday('2026-11-02') }));
    const day = screen.getByRole('list', { name: 'Races and schedule' });
    expect(within(day).getByText("Event 20 · Men's Junior 8+")).toBeInTheDocument();
    expect(within(day).getByText('Final · 8+')).toBeInTheDocument();
    expect(within(day).queryByText('Lunch at the tent')).not.toBeInTheDocument();
    expect(router.state.location.search).toBe('?day=2026-11-02');

    await user.click(screen.getByRole('radio', { name: formatWeekday('2026-11-01') }));
    await user.click(screen.getByRole('radio', { name: 'Junior girls' }));
    expect(screen.getByText('No lineups published yet')).toBeInTheDocument();
    const girlsDay = screen.getByRole('list', { name: 'Races and schedule' });
    expect(within(girlsDay).getByText('Girls cox meeting')).toBeInTheDocument();
    expect(within(girlsDay).queryByText(/Men's Junior/)).not.toBeInTheDocument();
  });

  it('shows one team for a team link, without the team filter', async () => {
    renderShare(`/share/${TOKENS.boys}`);
    expect(await screen.findByText('Lineups for Junior boys')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Team' })).not.toBeInTheDocument();
    expect(screen.queryByText('Girls cox meeting')).not.toBeInTheDocument();
    expect(screen.getByText('Lunch at the tent')).toBeInTheDocument();
  });

  it('says so when a link is revoked or unknown', async () => {
    renderShare(`/share/${TOKENS.revoked}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This link is no longer active' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ask your coach for a new one.')).toBeInTheDocument();
    expect(screen.queryByText('Head of the Lake')).not.toBeInTheDocument();
  });

  it('says so when a link is revoked while the page is open', async () => {
    const store = shareStore();
    const { queryClient } = renderShare(`/share/${TOKENS.wide}`, { store });
    await screen.findByRole('heading', { level: 1, name: 'Head of the Lake' });
    await store.update('share_links', SHARE_IDS.wideLink, { revokedAt: 'now' });
    // The next refetch (the minute poll, focus, reconnect) finds the link gone.
    await act(() => queryClient.invalidateQueries({ queryKey: shareQueryKey(TOKENS.wide) }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This link is no longer active' }),
    ).toBeInTheDocument();
  });
});

describe('the phone load checklist', () => {
  it('ticks lines with the name typed on the page', async () => {
    const user = userEvent.setup();
    const { store } = renderShare(`/share/${TOKENS.load}/load`);
    expect(await screen.findByRole('heading', { name: 'Load list' })).toBeInTheDocument();
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Shells' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Gear' })).toBeInTheDocument();
    const spencer = screen.getByRole('checkbox', { name: 'Loaded: Spencer' });
    expect(spencer).toHaveAttribute('aria-checked', 'true');
    expect(spencer).toHaveAccessibleDescription(/^Casey Coach · /);

    await user.type(screen.getByLabelText('Your name'), 'Sam');
    expect(localStorage.getItem(NAME_STORAGE_KEY)).toBe('Sam');

    const cox = screen.getByRole('checkbox', { name: 'Loaded: Cox boxes' });
    await user.click(cox);
    expect(cox).toHaveAttribute('aria-checked', 'true');
    expect(cox).toHaveAccessibleDescription(/^Sam · /);
    await waitFor(async () =>
      expect(await store.get('load_items', SHARE_IDS.coxBoxes)).toMatchObject({
        loadedByName: 'Sam',
      }),
    );
    expect(screen.getByText('2 of 3')).toBeInTheDocument();

    // Untick.
    await user.click(cox);
    await waitFor(async () =>
      expect(await store.get('load_items', SHARE_IDS.coxBoxes)).toMatchObject({ loadedAt: null }),
    );
    expect(cox).toHaveAttribute('aria-checked', 'false');
  });

  it('groups by container', async () => {
    const user = userEvent.setup();
    renderShare(`/share/${TOKENS.load}/load`);
    await screen.findByRole('heading', { name: 'Load list' });
    await user.click(screen.getByRole('radio', { name: 'Container' }));
    expect(screen.getByRole('region', { name: 'Truck 1 bed' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Boys trailer bed' })).toBeInTheDocument();
    // Spencer has no container of its own: it rides on its trailer.
    expect(screen.getByRole('region', { name: 'Boys trailer' })).toBeInTheDocument();
  });

  it('queues ticks made offline and syncs them in order when the connection is back', async () => {
    const user = userEvent.setup();
    const { store } = renderShare(`/share/${TOKENS.load}/load`);
    await screen.findByRole('heading', { name: 'Load list' });
    await user.type(screen.getByLabelText('Your name'), 'Sam');

    setOnline(false);
    expect(await screen.findByText(/^Offline\. Ticks stay on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Loaded: Cox boxes' }));
    await user.click(screen.getByRole('checkbox', { name: 'Returned: Slings' }));
    await user.click(screen.getByRole('checkbox', { name: 'Loaded: Slings' }));
    expect(screen.getByText('Offline. 3 changes waiting to sync.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Loaded: Cox boxes' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getAllByText('Waiting to sync')).toHaveLength(2);
    // Nothing reached the store yet, and the queue is on the device.
    expect((await store.get('load_items', SHARE_IDS.coxBoxes))!.loadedAt ?? null).toBeNull();
    expect(localStorage.getItem(`regatta-ops-share-queue:${TOKENS.load}`)).toContain(
      SHARE_IDS.slings,
    );

    setOnline(true);
    await waitFor(() => expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument());
    expect(await store.get('load_items', SHARE_IDS.coxBoxes)).toMatchObject({
      loadedByName: 'Sam',
    });
    expect(await store.get('load_items', SHARE_IDS.slings)).toMatchObject({
      loadedByName: 'Sam',
      returnedByName: 'Sam',
    });
    expect(localStorage.getItem(`regatta-ops-share-queue:${TOKENS.load}`)).toBeNull();
    const log = await store.list('activity_log', { where: { targetId: SHARE_IDS.slings } });
    expect(log.map((l) => l.summary)).toHaveLength(2);
  });

  it('queues a tick whose request fails for lack of a connection, and retries on request', async () => {
    const user = userEvent.setup();
    const store = shareStore();
    const real = memoryShareApi(store);
    let failing = true;
    const api: ShareApi = {
      getShare: (t) => real.getShare(t),
      tickLoadItem: async (...args) => {
        if (failing) throw new StoreError('network', 'Could not reach the server.', 0);
        return real.tickLoadItem(...args);
      },
    };
    renderShare(`/share/${TOKENS.load}/load`, { store, api });
    await screen.findByRole('heading', { name: 'Load list' });
    const cox = screen.getByRole('checkbox', { name: 'Loaded: Cox boxes' });
    await user.click(cox);
    expect(await screen.findByText('1 change waiting to sync.')).toBeInTheDocument();
    expect(cox).toHaveAttribute('aria-checked', 'true');

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    await waitFor(() => expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument());
    expect((await store.get('load_items', SHARE_IDS.coxBoxes))!.loadedAt).toBeTruthy();
  });

  it('restores a line and says why when the server refuses the tick', async () => {
    const user = userEvent.setup();
    const store = shareStore();
    const real = memoryShareApi(store);
    const api: ShareApi = {
      getShare: (t) => real.getShare(t),
      tickLoadItem: async () => {
        throw new StoreError('forbidden', 'This link cannot check off the load list.', 403);
      },
    };
    renderShare(`/share/${TOKENS.load}/load`, { store, api });
    await screen.findByRole('heading', { name: 'Load list' });
    const cox = screen.getByRole('checkbox', { name: 'Loaded: Cox boxes' });
    await user.click(cox);
    expect(
      await screen.findByText('This link cannot check off the load list.'),
    ).toBeInTheDocument();
    expect(cox).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/waiting to sync/)).not.toBeInTheDocument();
  });

  it('offers the load list only on links that allow it', async () => {
    renderShare(`/share/${TOKENS.wide}/load`);
    expect(await screen.findByText('This link does not include the load list')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows tabs for schedule and load list', async () => {
    const user = userEvent.setup();
    const { router } = renderShare(`/share/${TOKENS.load}`);
    await screen.findByRole('heading', { level: 1, name: 'Head of the Lake' });
    await user.click(screen.getByRole('link', { name: 'Load list' }));
    expect(await screen.findByRole('heading', { name: 'Load list' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/share/${TOKENS.load}/load`);
  });
});
