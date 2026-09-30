import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { clockAt } from '@srt/domain';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { whenText } from './RegattasListPage';

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

const base = {
  venue: 'Lake Union',
  city: 'Seattle, WA',
  timezone: 'America/Los_Angeles',
  format: 'head' as const,
  settings: {},
};

beforeEach(() => {
  // Only the clock: timers stay real so queries and user events run normally.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('whenText', () => {
  it('counts down to the start', () => {
    expect(whenText({ startDate: '2026-10-18', endDate: '2026-10-18' }, '2026-09-29')).toBe(
      'In 19 days',
    );
    expect(whenText({ startDate: '2026-09-30', endDate: '2026-09-30' }, '2026-09-29')).toBe(
      'Tomorrow',
    );
    expect(whenText({ startDate: '2026-09-28', endDate: '2026-09-30' }, '2026-09-29')).toBe(
      'Racing now',
    );
  });
});

describe('RegattasListPage', () => {
  it('lists upcoming regattas first, past ones collapsed, archived ones behind a toggle', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.create('regattas', {
      ...base,
      name: 'Spring Sprints',
      startDate: '2026-04-11',
      endDate: '2026-04-11',
      status: 'final',
    });
    await store.create('regattas', {
      ...base,
      name: 'Old Head Race',
      startDate: '2024-11-02',
      endDate: '2024-11-02',
      status: 'archived',
    });
    renderApp('/', store);

    const upcoming = await screen.findByRole('region', { name: 'Upcoming' });
    const cards = within(upcoming).getAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(['Head of the Lake', 'Tail of the Lake']);
    const hotl = cards[0]!.closest('li')!;
    expect(within(hotl).getByText(/Nov 1, 2026 · Lake Washington, Seattle, WA · Head race/));
    expect(within(hotl).getByText('In 33 days')).toBeInTheDocument();
    expect(await within(hotl).findByText('Junior boys')).toBeInTheDocument();
    expect(within(hotl).getByText('Junior girls')).toBeInTheDocument();
    expect(within(hotl).getByText('None yet')).toBeInTheDocument();
    expect(within(hotl).getByText('1 warning')).toBeInTheDocument();

    const main = within(screen.getByRole('main'));
    expect(main.queryByText('Spring Sprints')).toBeNull();
    await user.click(main.getByRole('button', { name: /Past regattas/ }));
    expect(main.getByRole('heading', { name: 'Spring Sprints' })).toBeInTheDocument();
    expect(main.queryByRole('heading', { name: 'Old Head Race' })).toBeNull();
    await user.click(main.getByRole('button', { name: /Archived/ }));
    expect(main.getByRole('heading', { name: 'Old Head Race' })).toBeInTheDocument();
  });

  it('creates a regatta and lands on its overview', async () => {
    const user = userEvent.setup();
    const { store, router } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'New regatta' }));
    const dialog = await screen.findByRole('dialog', { name: 'New regatta' });
    await user.click(within(dialog).getByRole('button', { name: 'Create regatta' }));
    expect(await within(dialog).findByText('Enter a regatta name')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a start date')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name'), 'Fall Classic');
    await user.type(within(dialog).getByLabelText('Start date'), '2026-10-10');
    // The end date follows the start date.
    expect(within(dialog).getByLabelText('End date')).toHaveValue('2026-10-10');
    await user.click(within(dialog).getByRole('radio', { name: 'Head race' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create regatta' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/regattas\/\w{15}$/));
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    const id = router.state.location.pathname.split('/')[2]!;
    expect(await store.get('regattas', id)).toMatchObject({
      name: 'Fall Classic',
      startDate: '2026-10-10',
      endDate: '2026-10-10',
      timezone: 'America/Los_Angeles',
      format: 'head',
      status: 'planning',
      settings: {},
      createdBy: IDS.coach,
    });
    expect(await screen.findByText('No teams yet')).toBeInTheDocument();
  });

  it('duplicates a regatta with its events and teams, not its entries', async () => {
    const user = userEvent.setup();
    const { store, router } = renderApp(`/regattas/${IDS.regatta}`);
    await user.click(await screen.findByRole('button', { name: 'Duplicate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate Head of the Lake' });
    expect(
      within(dialog).getByText(/Copies the settings, 2 races, and 2 teams/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('2027-10-31');
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Head of the Lake 2027');
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate regatta' }));

    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe(`/regattas/${IDS.regatta}`),
    );
    const id = router.state.location.pathname.split('/')[2]!;
    expect(await store.get('regattas', id)).toMatchObject({
      name: 'Head of the Lake 2027',
      startDate: '2027-10-31',
      status: 'planning',
      settings: { launchLeadMin: 45 },
    });
    const events = await store.list('events', { where: { regattaId: id }, sort: 'sortOrder' });
    expect(events.map((e) => [e.eventNumber, e.day])).toEqual([
      ['12', '2027-10-31'],
      ['14', '2027-10-31'],
    ]);
    expect(clockAt(events[0]!.scheduledAt!, 'America/Los_Angeles')).toBe('9:40');
    expect(await store.list('regatta_teams', { where: { regattaId: id } })).toHaveLength(2);
    expect(await store.list('entries', { where: { regattaId: id } })).toHaveLength(0);
  });
});
