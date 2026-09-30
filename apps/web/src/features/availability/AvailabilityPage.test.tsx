import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { fixtureStore, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { resetFinalEditConfirmations } from '@/features/regattas/useConfirmFinalEdit';

const ROWAN = 'athboys00000001';
const EMERY = 'athboys00000002';

function renderPage(store: MemoryStore = fixtureStore()) {
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, `/regattas/${IDS.regatta}/availability`);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return store;
}

const record = async (store: MemoryStore, athleteId: string) =>
  (await store.list('availability', { where: { regattaId: IDS.regatta, athleteId } }))[0] ?? null;

afterEach(() => resetFinalEditConfirmations());

describe('AvailabilityPage', () => {
  it('toggles an athlete through the store, creating a record only while needed', async () => {
    const user = userEvent.setup();
    const store = renderPage();
    const boys = await screen.findByRole('region', { name: /Junior boys/ });
    expect(within(boys).getByText('2 of 2 available')).toBeInTheDocument();
    expect(await record(store, ROWAN)).toBeNull();

    const rowan = within(boys).getByRole('radiogroup', { name: 'Availability for Rowan Test' });
    await user.click(within(rowan).getByRole('radio', { name: 'Unavailable' }));
    await waitFor(async () =>
      expect(await record(store, ROWAN)).toMatchObject({ status: 'unavailable', days: null }),
    );
    expect(await within(boys).findByText('1 of 2 available')).toBeInTheDocument();

    // Rowan is seated in the boys' four: that is an error, with a way to the lineup.
    const link = await within(boys).findByRole('link', { name: 'Boys V4+ (Event 12)' });
    expect(link).toHaveAttribute('href', `/regattas/${IDS.regatta}/lineups/${IDS.boys}`);

    const reason = within(boys).getByRole('textbox', { name: 'Reason for Rowan Test' });
    await user.type(reason, 'Sprained wrist{Enter}');
    await waitFor(async () =>
      expect(await record(store, ROWAN)).toMatchObject({ reason: 'Sprained wrist' }),
    );

    // Back to available: the reason keeps the record until it is cleared too.
    await user.click(within(rowan).getByRole('radio', { name: 'Available' }));
    await waitFor(async () =>
      expect(await record(store, ROWAN)).toMatchObject({ status: 'available' }),
    );
    await user.clear(within(boys).getByRole('textbox', { name: 'Reason for Rowan Test' }));
    await user.tab();
    await waitFor(async () => expect(await record(store, ROWAN)).toBeNull());
    expect(within(boys).queryByText(/Unavailable but seated/)).toBeNull();
  });

  it('sets single days on a multi-day regatta', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.update('regattas', IDS.regatta, { endDate: '2026-11-02' });
    renderPage(store);
    const boys = await screen.findByRole('region', { name: /Junior boys/ });
    const days = within(boys).getByRole('group', { name: 'Days for Emery Sample' });
    await user.click(within(days).getByRole('button', { name: 'Mon, Nov 2: available' }));
    await waitFor(async () =>
      expect(await record(store, EMERY)).toMatchObject({
        status: 'available',
        days: { '2026-11-02': 'unavailable' },
      }),
    );
    // Still coming on Sunday.
    expect(within(boys).getByText('2 of 2 available')).toBeInTheDocument();
    await user.click(within(days).getByRole('button', { name: 'Sun, Nov 1: available' }));
    await waitFor(async () =>
      expect(await record(store, EMERY)).toMatchObject({ status: 'unavailable', days: null }),
    );
    expect(await within(boys).findByText('1 of 2 available')).toBeInTheDocument();
  });

  it('filters by team and search, and shows only athletes who are not available', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.create('availability', {
      regattaId: IDS.regatta,
      athleteId: EMERY,
      status: 'maybe',
      reason: 'Exam week',
    });
    renderPage(store);
    await screen.findByRole('region', { name: /Junior boys/ });
    expect(screen.getByRole('region', { name: /Junior girls/ })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Not available (1)' }));
    expect(screen.queryByRole('region', { name: /Junior girls/ })).toBeNull();
    expect(screen.getByText('Emery Sample')).toBeInTheDocument();
    expect(screen.queryByText('Rowan Test')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Everyone' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search athletes' }), 'quinn');
    expect(screen.getByText('Quinn Example')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Junior boys/ })).toBeNull();
  });

  it('marks everyone available and copies from another regatta', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.create('availability', {
      regattaId: IDS.regatta,
      athleteId: ROWAN,
      status: 'unavailable',
    });
    await store.create('availability', {
      regattaId: IDS.other,
      athleteId: EMERY,
      status: 'unavailable',
      reason: 'Away',
    });
    renderPage(store);
    await screen.findByRole('region', { name: /Junior boys/ });

    await user.click(screen.getByRole('button', { name: 'Mark all available' }));
    const clear = await screen.findByRole('dialog', { name: 'Mark all available' });
    await user.click(within(clear).getByRole('button', { name: 'Mark all available' }));
    await waitFor(async () => expect(await record(store, ROWAN)).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Copy from previous regatta' }));
    const copy = await screen.findByRole('dialog', { name: 'Copy from previous regatta' });
    expect(await within(copy).findByText(/Changes 1 athlete on every team/)).toBeInTheDocument();
    await user.click(within(copy).getByRole('button', { name: 'Copy availability' }));
    await waitFor(async () =>
      expect(await record(store, EMERY)).toMatchObject({ status: 'unavailable', reason: 'Away' }),
    );
  });

  it('asks first on a final regatta', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    await store.update('regattas', IDS.regatta, { status: 'final' });
    renderPage(store);
    const boys = await screen.findByRole('region', { name: /Junior boys/ });
    const emery = within(boys).getByRole('radiogroup', { name: 'Availability for Emery Sample' });
    await user.click(within(emery).getByRole('radio', { name: 'Maybe' }));
    const confirm = await screen.findByRole('dialog', { name: 'This regatta is final' });
    await user.click(within(confirm).getByRole('checkbox'));
    await user.click(within(confirm).getByRole('button', { name: 'Change availability' }));
    await waitFor(async () =>
      expect(await record(store, EMERY)).toMatchObject({ status: 'maybe' }),
    );
    // "Don't ask again" holds for the rest of the session.
    await user.click(within(emery).getByRole('radio', { name: 'Unavailable' }));
    await waitFor(async () =>
      expect(await record(store, EMERY)).toMatchObject({ status: 'unavailable' }),
    );
    expect(screen.queryByRole('dialog', { name: 'This regatta is final' })).toBeNull();
  });

  it('shows statuses without controls to viewers', async () => {
    renderPage(fixtureStore({ signedIn: IDS.viewer }));
    const boys = await screen.findByRole('region', { name: /Junior boys/ });
    expect(within(boys).queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark all available' })).toBeNull();
  });
});
