import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import type { LoadPlacement, LoadPlan } from '@srt/domain';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { loadStatus, loadStatusText } from './summary';
import { resetFinalEditConfirmations } from './useConfirmFinalEdit';

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

async function teamRow(name: string) {
  const table = await screen.findByRole('table', { name: 'Teams in this regatta' });
  const row = within(table)
    .getAllByRole('row')
    .find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

afterEach(() => resetFinalEditConfirmations());

describe('loadStatus', () => {
  const plans: Pick<LoadPlan, 'id' | 'status'>[] = [
    { id: 'plana', status: 'draft' },
    { id: 'planb', status: 'final' },
  ];
  const placements: Pick<LoadPlacement, 'loadPlanId' | 'shellId'>[] = [
    { loadPlanId: 'plana', shellId: 's1' },
    { loadPlanId: 'planb', shellId: 's2' },
    { loadPlanId: 'other', shellId: 's3' },
  ];

  it('counts distinct shells of live entries placed on any of the regatta plans', () => {
    const entries = [
      { shellId: 's1', status: 'planned' as const },
      { shellId: 's1', status: 'draft' as const },
      { shellId: 's2', status: 'planned' as const },
      { shellId: 's3', status: 'planned' as const },
      { shellId: 's4', status: 'scratched' as const },
      { shellId: null, status: 'planned' as const },
    ];
    const s = loadStatus(entries, plans, placements);
    expect(s).toEqual({ state: 'draft', placed: 2, needed: 3 });
    expect(loadStatusText(s)).toBe('Draft · 2 of 3 placed');
    expect(loadStatusText(loadStatus(entries, [], []))).toBe('No load plan');
    expect(
      loadStatusText(loadStatus(entries, [{ id: 'planb', status: 'final' }], placements)),
    ).toBe('Final · 1 of 3 placed');
  });
});

describe('RegattaOverviewPage', () => {
  it('shows each team with entries, boated counts, conflicts, and load plan status', async () => {
    renderApp(`/regattas/${IDS.regatta}`);
    const boys = await teamRow('Junior boys');
    const cells = within(boys).getAllByRole('cell');
    // One entry; Rowan is seated, Emery is not (the seated masters athlete is borrowed).
    expect(cells[1]).toHaveTextContent('1');
    expect(within(boys).getByText('1 of 2 athletes boated')).toBeInTheDocument();
    expect(within(boys).getByText('1 unboated')).toBeInTheDocument();
    // Two empty seats (a warning) and notes, among them the borrowed athlete.
    expect(within(boys).getByText('1 warning')).toBeInTheDocument();
    expect(within(boys).getByText(/^\d+ notes?$/)).toBeInTheDocument();
    expect(within(boys).getByText('No load plan')).toBeInTheDocument();
    // A team with entries cannot be removed.
    expect(within(boys).queryByRole('button', { name: /remove/i })).toBeNull();

    const girls = await teamRow('Junior girls');
    expect(within(girls).getByText('0 of 1 athletes boated')).toBeInTheDocument();
    expect(within(girls).getByText('No conflicts')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Day at a glance' })).toBeInTheDocument();
    expect(screen.getByText(/2 races, 9:40 AM to 10:20 AM/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument();
  });

  it('adds a team and removes a team that has no entries', async () => {
    const user = userEvent.setup();
    const { store } = renderApp(`/regattas/${IDS.regatta}`);
    await teamRow('Junior girls');

    await user.click(screen.getByRole('button', { name: 'Add team' }));
    await user.click(await screen.findByRole('menuitem', { name: '5am masters' }));
    await waitFor(async () => {
      const rts = await store.list('regatta_teams', { where: { regattaId: IDS.regatta } });
      expect(rts.map((rt) => rt.teamId)).toContain(IDS.masters);
    });

    const girls = await teamRow('Junior girls');
    await user.click(
      within(girls).getByRole('button', { name: 'Remove Junior girls from this regatta' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Remove Junior girls?' });
    await user.click(within(dialog).getByRole('button', { name: 'Remove team' }));
    await waitFor(async () => {
      const rts = await store.list('regatta_teams', { where: { regattaId: IDS.regatta } });
      expect(rts.map((rt) => rt.teamId)).not.toContain(IDS.girls);
    });
  });

  it('asks before changing a final regatta', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.update('regattas', IDS.regatta, { status: 'final' });
    renderApp(`/regattas/${IDS.regatta}`, store);
    expect(
      await screen.findByText('This regatta is final. Changes need confirmation.'),
    ).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Add team' }));
    await user.click(await screen.findByRole('menuitem', { name: '5am masters' }));
    const confirm = await screen.findByRole('dialog', { name: 'This regatta is final' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    let rts = await store.list('regatta_teams', { where: { regattaId: IDS.regatta } });
    expect(rts.map((rt) => rt.teamId)).not.toContain(IDS.masters);

    await user.click(screen.getByRole('button', { name: 'Add team' }));
    await user.click(await screen.findByRole('menuitem', { name: '5am masters' }));
    const again = await screen.findByRole('dialog', { name: 'This regatta is final' });
    await user.click(within(again).getByRole('button', { name: 'Add team' }));
    await waitFor(async () => {
      rts = await store.list('regatta_teams', { where: { regattaId: IDS.regatta } });
      expect(rts.map((rt) => rt.teamId)).toContain(IDS.masters);
    });
  });

  it('offers import and add when the regatta has no events', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    renderApp(`/regattas/${IDS.other}`, store);
    expect(await screen.findByText('No events yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import events' }));
    expect(await screen.findByRole('dialog', { name: 'Import events' })).toBeInTheDocument();
  });

  it('hides editing from viewers', async () => {
    renderApp(`/regattas/${IDS.regatta}`, fixtureStore({ signedIn: IDS.viewer }));
    await teamRow('Junior boys');
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Duplicate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add team' })).toBeNull();
  });
});
