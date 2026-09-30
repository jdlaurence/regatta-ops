// The roster page through a MemoryStore: inline edits, permissions, bulk actions, and the CSV
// import. Every name is invented.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import type { MemoryStore } from '@/data/memory-store';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';

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

/** Desktop and tablet widths: the full roster table. */
function wideScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: /min-width: (768|1024)px/.test(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

const athlete = (store: MemoryStore, id: string) =>
  store.snapshot().athletes.find((a) => a.id === id);

beforeEach(() => {
  // Age groups count from the season year (§9.1); pin it to 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T18:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the teams list', () => {
  it('lists teams with their roster counts and lets admins add one', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp('/teams', fixtureStore({ signedIn: IDS.admin }));
    const table = await screen.findByRole('table', { name: 'Teams' });
    const boys = within(table).getByRole('row', { name: /Junior boys/ });
    expect(within(boys).getByText(/2 active/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add team' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add team' });
    await user.type(within(dialog).getByLabelText('Name'), 'Evening juniors');
    await user.type(within(dialog).getByLabelText('Short name'), 'EveJr');
    await user.click(within(dialog).getByRole('radio', { name: /Cyan/ }));
    // The preview follows the form.
    expect(within(dialog).getByRole('group', { name: 'Preview' })).toHaveTextContent('EveJr');
    await user.click(within(dialog).getByRole('button', { name: 'Add team' }));
    await waitFor(() =>
      expect(store.snapshot().teams.find((t) => t.name === 'Evening juniors')).toMatchObject({
        shortName: 'EveJr',
        colorKey: 'cyan',
        program: 'juniors',
        sortOrder: 4,
        archived: false,
      }),
    );
  });

  it('shows coaches the team settings read-only', async () => {
    const user = userEvent.setup();
    wideScreen();
    renderApp('/teams');
    await screen.findByRole('table', { name: 'Teams' });
    expect(screen.queryByRole('button', { name: 'Add team' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Junior boys team settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Team settings' });
    expect(within(dialog).getByLabelText('Name')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Save team' })).not.toBeInTheDocument();
  });
});

describe('the roster', () => {
  it('groups by level and shows weights in the club unit with age badges', async () => {
    wideScreen();
    renderApp(`/teams/${IDS.boys}`);
    const table = await screen.findByRole('table', { name: 'Roster' });
    expect(within(table).getByRole('rowheader', { name: /Experienced/ })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: /Weight \(lb\)/ })).toBeInTheDocument();
    // 70 kg is 154 lb; born 2009 is U19 in 2026.
    expect(within(table).getByRole('textbox', { name: 'Weight in lb for Rowan Test' })).toHaveValue(
      '154',
    );
    expect(within(table).getAllByText('U19')).toHaveLength(2);
    expect(screen.getByText(/Age groups for 2026/)).toBeInTheDocument();
  });

  it('saves an inline weight edit in kg', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    const weight = await screen.findByRole('textbox', { name: 'Weight in lb for Rowan Test' });
    await user.clear(weight);
    await user.type(weight, '165{Enter}');
    await waitFor(() => expect(athlete(store, 'athboys00000001')?.weightKg).toBeCloseTo(74.84, 2));
  });

  it('refuses a bad inline value and keeps the stored one', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    const born = await screen.findByRole('textbox', { name: 'Birth year for Emery Sample' });
    await user.clear(born);
    await user.type(born, '09{Enter}');
    expect(born).toHaveAttribute('aria-invalid', 'true');
    expect(athlete(store, 'athboys00000002')?.birthYear).toBe(2009);
    await user.click(born);
    await user.keyboard('{Escape}');
    expect(born).toHaveValue('2009');
  });

  it('marks selected athletes inactive and hides them', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    const table = await screen.findByRole('table', { name: 'Roster' });
    const row = within(table).getByRole('row', { name: /Emery Sample/ });
    await user.click(within(row).getByRole('checkbox', { name: 'Select row' }));
    const bar = screen.getByRole('region', { name: 'Selected athletes' });
    expect(bar).toHaveTextContent('1 selected');
    await user.click(within(bar).getByRole('button', { name: 'Mark inactive' }));
    await waitFor(() => expect(athlete(store, 'athboys00000002')?.status).toBe('inactive'));
    await waitFor(() =>
      expect(within(table).queryByRole('row', { name: /Emery Sample/ })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Show inactive \(1\)/ }));
    expect(within(table).getByRole('row', { name: /Emery Sample/ })).toHaveTextContent('Inactive');
  });

  it('filters and searches', async () => {
    const user = userEvent.setup();
    wideScreen();
    renderApp(`/teams/${IDS.boys}`);
    const table = await screen.findByRole('table', { name: 'Roster' });
    await user.type(screen.getByRole('searchbox', { name: 'Search the roster' }), 'emery');
    expect(within(table).queryByRole('row', { name: /Rowan Test/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Emery Sample/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Coxswains' }));
    expect(within(table).getByText('No athletes match these filters.')).toBeInTheDocument();
    await user.click(within(table).getByRole('button', { name: 'Clear filters' }));
    expect(within(table).getByRole('row', { name: /Rowan Test/ })).toBeInTheDocument();
  });

  it('is read-only for viewers', async () => {
    wideScreen();
    renderApp(`/teams/${IDS.boys}`, fixtureStore({ signedIn: IDS.viewer }));
    const table = await screen.findByRole('table', { name: 'Roster' });
    expect(within(table).queryByRole('textbox')).not.toBeInTheDocument();
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(within(table).getAllByText('154')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add athlete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  });

  it('opens the athlete drawer with their entries and saves edits', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    await user.click(await screen.findByRole('button', { name: 'Rowan Test' }));
    const drawer = await screen.findByRole('dialog', { name: 'Rowan Test' });
    // Seat 1 of the boys' V4+ at Head of the Lake.
    expect(await within(drawer).findByText('Head of the Lake')).toBeInTheDocument();
    expect(within(drawer).getByText('Seat 1')).toBeInTheDocument();
    expect(within(drawer).getByText('Event 12')).toBeInTheDocument();
    await user.type(within(drawer).getByLabelText('Preferred name'), 'Ro');
    await user.click(within(drawer).getByRole('button', { name: 'Save athlete' }));
    await waitFor(() => expect(athlete(store, 'athboys00000001')?.preferredName).toBe('Ro'));
    // Weight untouched keeps its stored kg exactly.
    expect(athlete(store, 'athboys00000001')?.weightKg).toBe(70);
  });

  it('adds an athlete by hand', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    await user.click(await screen.findByRole('button', { name: 'Add athlete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add athlete' });
    await user.type(within(dialog).getByLabelText('First name'), 'Tamsin');
    await user.type(within(dialog).getByLabelText('Last name'), 'Quill');
    await user.type(within(dialog).getByLabelText('Weight (lb)'), '150');
    await user.type(within(dialog).getByLabelText('Birth year'), '2011');
    expect(within(dialog).getByText('U16')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add athlete' }));
    await waitFor(() =>
      expect(store.snapshot().athletes.find((a) => a.firstName === 'Tamsin')).toMatchObject({
        teamId: IDS.boys,
        lastName: 'Quill',
        birthYear: 2011,
        level: 'novice',
        status: 'active',
      }),
    );
  });

  it('imports a pasted CSV after mapping and preview', async () => {
    const user = userEvent.setup();
    wideScreen();
    const { store } = renderApp(`/teams/${IDS.boys}`);
    await user.click(await screen.findByRole('button', { name: 'Import CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import roster' });
    const csv = [
      'First,Last,Side,Weight (kg),YOB,Level',
      'Wren,Castell,P,68,2010,Novice',
      'Juniper,Oakes,Cox,50,2011,',
      ',Nameless,S,70,2009,',
      'Rowan,Test,S,70,2009,',
    ].join('\n');
    const box = within(dialog).getByLabelText('Rows to import');
    await user.click(box);
    await user.paste(csv);
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(within(dialog).getByText('4 rows found.')).toBeInTheDocument();
    expect(within(dialog).getByText('From the column name.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Preview rows' }));
    expect(within(dialog).getByText('2 rows ready to add.')).toBeInTheDocument();
    expect(within(dialog).getByText('The name is blank')).toBeInTheDocument();
    expect(within(dialog).getByText('Already on this roster; skipped')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Add 2 athletes' }));
    expect(
      await within(dialog).findByText(
        'Added 2 athletes to Junior boys. Skipped 1 athlete already on the roster. Left out 1 row with problems.',
      ),
    ).toBeInTheDocument();
    const added = store
      .snapshot()
      .athletes.filter((a) => ['Wren', 'Juniper'].includes(a.firstName));
    expect(added).toHaveLength(2);
    expect(added.find((a) => a.firstName === 'Wren')).toMatchObject({
      teamId: IDS.boys,
      side: 'port',
      weightKg: 68,
      level: 'novice',
    });
    expect(added.find((a) => a.firstName === 'Juniper')).toMatchObject({ canCox: true });
  });
});
