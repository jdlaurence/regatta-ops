import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { clockAt, zonedToInstant, type World } from '@srt/domain';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';

const TZ = 'America/Los_Angeles';
const EVENT3 = 'event3000000001';
const ENTRY2 = 'entry2000000001';

/** The fixture regatta plus a girls' four on Spencer at 10:55: a hot seat with the 9:40 boys. */
function world(edit?: (w: World) => void): World {
  const w = fixtureWorld();
  w.events.push({
    id: EVENT3,
    regattaId: IDS.regatta,
    kind: 'race',
    eventNumber: '15',
    name: "Women's Junior 4+",
    boatClass: '4+',
    day: '2026-11-01',
    scheduledAt: zonedToInstant('2026-11-01', '10:55', TZ),
    stage: 'race',
    sortOrder: 3,
  });
  w.events.push({
    id: 'eventlunch00001',
    regattaId: IDS.regatta,
    kind: 'logistics',
    name: 'Lunch at the tent',
    day: '2026-11-01',
    scheduledAt: null,
    sortOrder: 2,
  });
  w.entries.push({
    id: ENTRY2,
    regattaId: IDS.regatta,
    eventId: EVENT3,
    teamId: IDS.girls,
    label: 'V4+',
    boatClass: '4+',
    shellId: IDS.shell,
    oarSetId: null,
    status: 'planned',
  });
  edit?.(w);
  return w;
}

function renderSchedule(w: World = world(), search = '') {
  const store = new MemoryStore({ world: w, userId: IDS.coach });
  const queryClient = testQueryClient();
  const router = createTestRouter(
    { store, queryClient },
    `/regattas/${IDS.regatta}/schedule${search}`,
  );
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { store, router };
}

const races = () => screen.getByRole('list', { name: 'Races and logistics' });
const eventRow = (id: string) => races().querySelector(`[data-event-id="${id}"]`) as HTMLElement;
const entryRow = (id: string) => document.querySelector(`li[data-entry-id="${id}"]`) as HTMLElement;
const timeOf = async (store: MemoryStore, id: string) =>
  clockAt((await store.get('events', id))!.scheduledAt!, TZ);

describe('SchedulePage list', () => {
  it('shows races in time order with logistics lines and entries nested', async () => {
    renderSchedule();
    await screen.findByRole('list', { name: 'Races and logistics' });
    const rows = within(races())
      .getAllByRole('listitem')
      .filter((li) => li.dataset.eventId);
    expect(rows.map((r) => r.dataset.eventId)).toEqual([
      IDS.event1,
      IDS.event2,
      'eventlunch00001',
      EVENT3,
    ]);
    expect(within(eventRow(IDS.event1)).getByText('Event 12')).toBeInTheDocument();
    // Each entry links to its team's lineups with the entry selected.
    const link = within(entryRow(IDS.entry1)).getByRole('link');
    expect(link).toHaveAttribute(
      'href',
      `/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry1}`,
    );
    expect(within(entryRow(IDS.entry1)).getByText('Spencer')).toBeInTheDocument();
    expect(within(entryRow(ENTRY2)).getByText('Hot seat')).toBeInTheDocument();
  });

  it('edits an event time inline, and conflicts follow at once', async () => {
    const user = userEvent.setup();
    const { store } = renderSchedule();
    await screen.findByRole('list', { name: 'Races and logistics' });
    await user.click(
      within(eventRow(IDS.event1)).getByRole('button', { name: /^9:40, change time of/ }),
    );
    const input = within(eventRow(IDS.event1)).getByLabelText(/^Time of Event 12/);
    fireEvent.change(input, { target: { value: '09:00' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Optimistic: the hot seat is gone before the save lands.
    await waitFor(() => expect(within(entryRow(ENTRY2)).queryByText('Hot seat')).toBeNull());
    await waitFor(async () => expect(await timeOf(store, IDS.event1)).toBe('9:00'));
  });

  it('renames an event inline and cancels with Escape', async () => {
    const user = userEvent.setup();
    const { store } = renderSchedule();
    await screen.findByRole('list', { name: 'Races and logistics' });
    const row = eventRow(IDS.event2);
    await user.click(within(row).getByRole('button', { name: /^Men's Junior 8\+, change name/ }));
    await user.keyboard('{Escape}');
    expect(within(row).getByRole('button', { name: /change name/ })).toHaveFocus();
    await user.click(within(row).getByRole('button', { name: /change name/ }));
    const input = within(row).getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Junior 8+ final{Enter}');
    await waitFor(async () =>
      expect((await store.get('events', IDS.event2))!.name).toBe('Junior 8+ final'),
    );
  });

  it('asks before editing a final regatta', async () => {
    const user = userEvent.setup();
    const { store } = renderSchedule(
      world((w) => {
        w.regattas[0]!.status = 'final';
      }),
    );
    await screen.findByRole('list', { name: 'Races and logistics' });
    await user.click(
      within(eventRow(IDS.event1)).getByRole('button', { name: /^9:40, change time of/ }),
    );
    const input = within(eventRow(IDS.event1)).getByLabelText(/^Time of Event 12/);
    fireEvent.change(input, { target: { value: '09:50' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    const dialog = await screen.findByRole('dialog', { name: 'This regatta is final' });
    await user.click(within(dialog).getByRole('button', { name: 'Save change' }));
    await waitFor(async () => expect(await timeOf(store, IDS.event1)).toBe('9:50'));
  });

  it('shifts every time after a start time as one batch', async () => {
    const user = userEvent.setup();
    const { store } = renderSchedule();
    await screen.findByRole('list', { name: 'Races and logistics' });
    await user.click(screen.getByRole('button', { name: 'Shift times' }));
    const dialog = await screen.findByRole('dialog', { name: 'Shift times' });
    fireEvent.change(within(dialog).getByLabelText('Events at or after'), {
      target: { value: '10:00' },
    });
    expect(within(dialog).getByRole('heading', { name: '2 events move' })).toBeInTheDocument();
    expect(within(dialog).getByText('10:40')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Shift 2 events' }));
    await waitFor(async () => expect(await timeOf(store, EVENT3)).toBe('11:15'));
    expect(await timeOf(store, IDS.event2)).toBe('10:40');
    expect(await timeOf(store, IDS.event1)).toBe('9:40');
  });

  it('filters by team and clears the filters', async () => {
    const user = userEvent.setup();
    renderSchedule(world(), `?team=${IDS.girls}`);
    await screen.findByRole('list', { name: 'Races and logistics' });
    expect(entryRow(IDS.entry1)).toBeNull();
    expect(entryRow(ENTRY2)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(entryRow(IDS.entry1)).not.toBeNull());
  });
});

describe('SchedulePage links to an event', () => {
  it('opens the list on the event, unfiltered, highlights it, and drops the parameter', async () => {
    const { router } = renderSchedule(world(), `?event=${EVENT3}&view=timeline&team=${IDS.boys}`);
    await screen.findByRole('list', { name: 'Races and logistics' });
    const row = eventRow(EVENT3);
    await waitFor(() => expect(row).toHaveAttribute('data-highlight', 'true'));
    expect(row).toHaveFocus();
    await waitFor(() => expect(router.state.location.search).toBe('?day=2026-11-01'));
    // The girls' entry shows although the link arrived with a boys-only filter.
    expect(entryRow(ENTRY2)).not.toBeNull();
  });

  it('ignores a link to an event that is gone', async () => {
    const { router } = renderSchedule(world(), '?event=missing00000000');
    await screen.findByRole('list', { name: 'Races and logistics' });
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});

describe('SchedulePage timeline', () => {
  it('switches to the timeline, and a bar opens the entry on the lineups page', async () => {
    const user = userEvent.setup();
    const { router } = renderSchedule();
    await screen.findByRole('list', { name: 'Races and logistics' });
    await user.click(screen.getByRole('radio', { name: 'Timeline' }));
    const bar = await screen.findByRole('button', { name: /^Girls V4\+, .*Spencer/ });
    expect(bar).toHaveAccessibleName(/hot seat with Boys V4\+, 40 minutes/);
    expect(router.state.location.search).toContain('view=timeline');
    await user.click(screen.getByRole('radio', { name: 'Team' }));
    expect(router.state.location.search).toContain('group=team');
    await user.click(screen.getByRole('button', { name: /^Girls V4\+, .*at 10:55/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/regattas/${IDS.regatta}/lineups/${IDS.girls}`),
    );
    expect(router.state.location.search).toBe(`?entry=${ENTRY2}`);
  });

  it('shows an empty regatta with what to do', async () => {
    renderSchedule(
      world((w) => {
        w.events = [];
        w.entries = [];
        w.entry_seats = [];
      }),
    );
    expect(await screen.findByRole('heading', { name: 'No events yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Import events' }).length).toBeGreaterThan(0);
  });
});
