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
const QUINN = 'athgirls0000001';

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

  it('imports the absence form: columns, answers, names, then only the checked changes', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    // Quinn already has an answer from a coach; the form agrees, so nothing changes for her.
    await store.create('availability', {
      regattaId: IDS.regatta,
      athleteId: QUINN,
      status: 'unavailable',
      reason: 'Told the coach',
    });
    renderPage(store);
    await screen.findByRole('region', { name: /Junior boys/ });
    await user.click(screen.getByRole('button', { name: 'Import from absence form' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from absence form' });

    await user.click(within(dialog).getByRole('textbox', { name: 'Form responses' }));
    await user.paste(
      [
        'Timestamp,Email Address,Athlete name,Tail of the Lake,Head of the Lake',
        '10/1/2026 18:02:11,rt@example.com,Rowan Test,Yes,"No, I can\'t attend"',
        '10/1/2026 19:00:00,es@example.com,Emery Samples,Yes,Not sure',
        '10/2/2026 8:00:00,qe@example.com,Quinn Example,,No',
        '10/2/2026 9:00:00,cn@example.com,Casey Nobody,Yes,No',
        '10/2/2026 9:30:00,jf@example.com,Jules Fixtur,Yes,No',
      ].join('\n'),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Match columns' }));

    // The regatta's column is found by its name, not by position.
    expect(
      within(dialog).getByRole('combobox', { name: 'Answers for Head of the Lake' }),
    ).toHaveTextContent('Head of the Lake');
    expect(within(dialog).getByText('Matched by the column name.')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Name' })).toHaveTextContent(
      'Athlete name',
    );
    const answers = within(dialog).getByRole('table', { name: 'Answers' });
    expect(
      within(answers).getByRole('combobox', { name: 'Meaning of "Not sure"' }),
    ).toHaveTextContent('Maybe');
    expect(
      within(answers).getByRole('combobox', { name: 'Meaning of "No, I can\'t attend"' }),
    ).toHaveTextContent('Unavailable');
    await user.click(within(dialog).getByRole('button', { name: 'Match athletes' }));

    // Every team in the regatta: Jules (masters) is not in it, so that row has no match.
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      '3 of 5 responses match an athlete. 2 without an athlete will be skipped.',
    );
    const close = within(dialog).getByRole('region', { name: 'Close spellings (1)' });
    expect(within(close).getByText('Emery Samples')).toBeInTheDocument();
    expect(
      within(close).getByRole('button', { name: /Athlete for Emery Samples, row 3/ }),
    ).toHaveTextContent('Emery Sample');
    const none = within(dialog).getByRole('region', { name: 'No match on the roster (2)' });
    expect(within(none).getByText('Casey Nobody')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Preview changes' }));

    const preview = within(dialog).getByRole('table', { name: 'Changes to import' });
    const rows = within(preview).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual([
      'Rowan TestBoysAvailableUnavailable',
      'Emery SampleBoysAvailableMaybe',
    ]);
    await user.click(
      within(preview).getByRole('checkbox', { name: 'Import the change for Emery Sample' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 change' }));

    await waitFor(async () =>
      expect(await record(store, ROWAN)).toMatchObject({
        status: 'unavailable',
        reason: 'From absence form',
      }),
    );
    expect(await record(store, EMERY)).toBeNull();
    expect(await record(store, QUINN)).toMatchObject({ reason: 'Told the coach' });
    expect(await screen.findByText('1 change imported from the absence form')).toBeInTheDocument();
  });

  it('takes a hand-picked athlete for an unmatched name and a changed meaning', async () => {
    const user = userEvent.setup();
    const store = renderPage();
    await screen.findByRole('region', { name: /Junior boys/ });
    await user.click(screen.getByRole('button', { name: 'Import from absence form' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import from absence form' });
    await user.click(within(dialog).getByRole('textbox', { name: 'Form responses' }));
    await user.paste('Name,HOTL\nQu Example,Out of town\nRowan Test,Yes');
    await user.click(within(dialog).getByRole('button', { name: 'Match columns' }));

    // "HOTL" is the regatta's initials.
    expect(
      within(dialog).getByRole('combobox', { name: 'Answers for Head of the Lake' }),
    ).toHaveTextContent('HOTL');
    await user.click(within(dialog).getByRole('combobox', { name: 'Meaning of "Out of town"' }));
    await user.click(await screen.findByRole('option', { name: 'Maybe' }));
    await user.click(within(dialog).getByRole('button', { name: 'Match athletes' }));

    expect(within(dialog).getByRole('status')).toHaveTextContent(
      '1 of 2 responses match an athlete.',
    );
    await user.click(within(dialog).getByRole('button', { name: /Athlete for Qu Example, row 2/ }));
    await user.click(await screen.findByRole('option', { name: /Quinn Example/ }));
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      '2 of 2 responses match an athlete.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Preview changes' }));
    const preview = within(dialog).getByRole('table', { name: 'Changes to import' });
    expect(
      within(preview)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual(['Quinn ExampleGirlsAvailableMaybe']);
    await user.click(within(dialog).getByRole('button', { name: 'Import 1 change' }));
    await waitFor(async () =>
      expect(await record(store, QUINN)).toMatchObject({
        status: 'maybe',
        reason: 'From absence form',
      }),
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
