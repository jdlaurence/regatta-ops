// Settings through a MemoryStore: club defaults, role changes and who may make them, personal
// preferences, and the activity log's filters and paging.

import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { MemoryStore } from '@/data/memory-store';
import { fixtureStore, fixtureWorld, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import { ACTIVITY_PAGE_SIZE } from './ActivityLogSection';

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

async function pick(trigger: HTMLElement, option: string) {
  const user = userEvent.setup();
  await user.click(trigger);
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('club defaults', () => {
  it('saves changes made by an admin', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/settings', fixtureStore({ signedIn: IDS.admin }));
    const lead = await screen.findByLabelText('Launch lead');
    expect(lead).toHaveValue(40);
    const save = screen.getByRole('button', { name: 'Save club defaults' });
    expect(save).toBeDisabled();
    await user.clear(lead);
    await user.type(lead, '55');
    await user.clear(screen.getByLabelText('Race duration, head races'));
    await user.type(screen.getByLabelText('Race duration, head races'), '25');
    await user.click(screen.getByRole('radio', { name: 'Kilograms' }));
    await user.click(screen.getByRole('radio', { name: 'Monday' }));
    await user.click(save);
    await waitFor(() =>
      expect(store.snapshot().club_settings[0]).toMatchObject({
        weightUnit: 'kg',
        weekStartsOn: 1,
        headRaceDurationMin: 25,
        timingDefaults: expect.objectContaining({ launchLeadMin: 55, returnMin: 15 }),
      }),
    );
  });

  it('explains what is wrong with a timing value', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/settings', fixtureStore({ signedIn: IDS.admin }));
    const lead = await screen.findByLabelText('Launch lead');
    await user.clear(lead);
    await user.click(screen.getByRole('button', { name: 'Save club defaults' }));
    expect(await screen.findByText('Enter minutes as a whole number')).toBeInTheDocument();
    expect(store.snapshot().club_settings[0]!.timingDefaults.launchLeadMin).toBe(40);
  });

  it('is read-only for coaches', async () => {
    renderApp('/settings');
    expect(await screen.findByText('Only admins can change club defaults.')).toBeInTheDocument();
    expect(screen.getByLabelText('Club name')).toBeDisabled();
    expect(screen.getByLabelText('Launch lead')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save club defaults' })).not.toBeInTheDocument();
  });
});

describe('users and roles', () => {
  it('lets an admin change a role and a default team', async () => {
    const { store } = renderApp('/settings?tab=users', fixtureStore({ signedIn: IDS.admin }));
    await pick(await screen.findByRole('combobox', { name: 'Role for Casey Coach' }), 'Viewer');
    await waitFor(() =>
      expect(store.snapshot().users.find((u) => u.id === IDS.coach)?.role).toBe('viewer'),
    );
    expect(await screen.findByText('Casey Coach is now a viewer')).toBeInTheDocument();
    await pick(
      screen.getByRole('combobox', { name: 'Default team for Vic Viewer' }),
      'Junior boys',
    );
    await waitFor(() =>
      expect(store.snapshot().users.find((u) => u.id === IDS.viewer)?.defaultTeamId).toBe(IDS.boys),
    );
  });

  it('keeps at least one admin', async () => {
    const { store } = renderApp('/settings?tab=users', fixtureStore({ signedIn: IDS.admin }));
    await pick(await screen.findByRole('combobox', { name: 'Role for Alex Admin' }), 'Coach');
    expect(
      await screen.findByText(
        'Regatta Ops needs at least one admin. Make someone else an admin first.',
      ),
    ).toBeInTheDocument();
    expect(store.snapshot().users.find((u) => u.id === IDS.admin)?.role).toBe('admin');
  });

  it('asks before an admin demotes themselves', async () => {
    const user = userEvent.setup();
    const world = fixtureWorld();
    world.users.find((u) => u.id === IDS.coach)!.role = 'admin';
    const store = new MemoryStore({ world, userId: IDS.admin });
    renderApp('/settings?tab=users', store);
    await pick(await screen.findByRole('combobox', { name: 'Role for Alex Admin' }), 'Coach');
    const dialog = await screen.findByRole('dialog', { name: 'Make yourself a coach?' });
    await user.click(within(dialog).getByRole('button', { name: 'Change my role' }));
    await waitFor(() =>
      expect(store.snapshot().users.find((u) => u.id === IDS.admin)?.role).toBe('coach'),
    );
  });

  it('shows roles without controls to coaches and viewers', async () => {
    renderApp('/settings?tab=users', fixtureStore({ signedIn: IDS.viewer }));
    const list = await screen.findByRole('list', { name: 'Users' });
    expect(within(list).getByText('Alex Admin')).toBeInTheDocument();
    expect(within(list).queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/Admins change roles here/)).toBeInTheDocument();
  });
});

describe('my preferences', () => {
  it('saves a weight unit and a default team for any user', async () => {
    const user = userEvent.setup();
    const { store } = renderApp(
      '/settings?tab=preferences',
      fixtureStore({ signedIn: IDS.viewer }),
    );
    await user.click(await screen.findByRole('radio', { name: 'Kilograms' }));
    await waitFor(() =>
      expect(store.snapshot().users.find((u) => u.id === IDS.viewer)?.preferences).toEqual({
        weightUnit: 'kg',
      }),
    );
    await pick(screen.getByRole('combobox', { name: 'Default team' }), '5am masters');
    await waitFor(() =>
      expect(store.snapshot().users.find((u) => u.id === IDS.viewer)?.defaultTeamId).toBe(
        IDS.masters,
      ),
    );
    await user.click(screen.getByRole('radio', { name: 'Club default' }));
    await waitFor(() =>
      expect(
        store.snapshot().users.find((u) => u.id === IDS.viewer)?.preferences.weightUnit,
      ).toBeUndefined(),
    );
  });
});

describe('activity log', () => {
  function storeWithActivity(count: number) {
    const world = fixtureWorld();
    for (let i = 0; i < count; i++) {
      const minute = String(i % 60).padStart(2, '0');
      const hour = String(10 + Math.floor(i / 60)).padStart(2, '0');
      world.activity_log.push({
        id: `activity${String(i).padStart(7, '0')}`,
        created: `2026-09-20T${hour}:${minute}:00.000Z`,
        regattaId: i % 2 === 0 ? IDS.regatta : null,
        actorId: i % 3 === 0 ? IDS.admin : IDS.coach,
        action: 'update',
        targetType: i % 2 === 0 ? 'entries' : 'shell',
        targetId: 'x',
        summary: `made change number ${i}`,
      });
    }
    return new MemoryStore({ world, userId: IDS.coach });
  }

  it('shows the newest first, a page at a time', async () => {
    const user = userEvent.setup();
    renderApp('/settings?tab=activity', storeWithActivity(70));
    const list = await screen.findByRole('list', { name: 'Activity' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(items[0]).toHaveTextContent('made change number 69');
    expect(screen.getByText('Showing 50 of 70 changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show 20 more' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(70);
  });

  it('filters by person, regatta, kind, and text', async () => {
    const user = userEvent.setup();
    renderApp('/settings?tab=activity', storeWithActivity(12));
    await screen.findByRole('list', { name: 'Activity' });
    await pick(screen.getByRole('combobox', { name: 'Person' }), 'Alex Admin');
    // i = 0, 3, 6, 9
    expect(screen.getByText('4 changes')).toBeInTheDocument();
    await pick(screen.getByRole('combobox', { name: 'Kind' }), 'Shells');
    // odd i among those: 3, 9
    expect(screen.getByText('2 changes')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox', { name: 'Search the activity log' }), 'number 9');
    expect(screen.getByText('1 change')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('12 changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Regatta: All regattas/ }));
    await user.click(await screen.findByRole('option', { name: 'Club-wide only' }));
    expect(screen.getByText('6 changes')).toBeInTheDocument();
  });
});
