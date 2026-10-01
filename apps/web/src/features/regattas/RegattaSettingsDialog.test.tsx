import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clockAt, DEFAULT_CLUB_SETTINGS, type ClubSettings } from '@regatta-ops/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { RegattaSettingsDialog } from './RegattaSettingsDialog';
import { clubDefaults, formToPatch, regattaFormSchema, regattaToForm } from './regatta-form';

const club: ClubSettings = { id: 'clubsettings001', ...DEFAULT_CLUB_SETTINGS };

async function setup(signedIn?: string) {
  const store = fixtureStore(signedIn ? { signedIn } : {});
  const regatta = (await store.get('regattas', IDS.regatta))!;
  const events = await store.list('events', { where: { regattaId: IDS.regatta } });
  const onOpenChange = vi.fn();
  render(
    <RegattaSettingsDialog
      regatta={regatta}
      clubSettings={club}
      events={events}
      open
      onOpenChange={onOpenChange}
    />,
    { wrapper: dataWrapper(store) },
  );
  return { store, onOpenChange, dialog: await screen.findByRole('dialog') };
}

describe('regatta form helpers', () => {
  it('shows club defaults by format and saves only the overrides', () => {
    expect(clubDefaults('head', club).raceDurationMin).toBe(20);
    expect(clubDefaults('sprint', club).raceDurationMin).toBe(10);
    const store = fixtureStore();
    return store.get('regattas', IDS.regatta).then((r) => {
      const values = regattaToForm(r!);
      expect(values.timing.launchLeadMin).toBe(45);
      expect(values.timing.returnMin).toBeNull();
      expect(
        formToPatch({ ...values, timing: { ...values.timing, rerigMin: 0 } }).settings,
      ).toEqual({ launchLeadMin: 45, rerigMin: 0 });
    });
  });

  it('rejects an end date before the start and a regatta longer than two weeks', () => {
    const base = {
      name: 'Test',
      venue: '',
      city: '',
      startDate: '2026-11-01',
      endDate: '2026-11-01',
      timezone: 'America/Los_Angeles',
      format: 'sprint' as const,
      status: 'planning' as const,
      notes: '',
      timing: regattaToForm({
        id: 'x',
        name: 'x',
        venue: '',
        city: '',
        startDate: '2026-11-01',
        endDate: '2026-11-01',
        timezone: 'America/Los_Angeles',
        format: 'sprint',
        status: 'planning',
        settings: {},
      }).timing,
    };
    expect(regattaFormSchema.safeParse(base).success).toBe(true);
    const early = regattaFormSchema.safeParse({ ...base, endDate: '2026-10-31' });
    expect(early.error?.issues[0]?.message).toBe('Choose an end date on or after the start date');
    const long = regattaFormSchema.safeParse({ ...base, endDate: '2026-11-20' });
    expect(long.error?.issues[0]?.message).toBe('A regatta can last up to 14 days');
    const blank = regattaFormSchema.safeParse({ ...base, name: ' ', startDate: '' });
    expect(blank.error?.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining(['Enter a regatta name', 'Choose a start date']),
    );
  });
});

describe('RegattaSettingsDialog', () => {
  it('shows the club default beside each override, resets one, and saves', async () => {
    const user = userEvent.setup();
    const { store, onOpenChange, dialog } = await setup();

    const launch = within(dialog).getByLabelText('Launch lead');
    expect(launch).toHaveValue(45);
    expect(within(dialog).getByText('Club default 40 min')).toBeInTheDocument();
    // Not overridden: empty, with the club default (20 for a head race) as the placeholder.
    const duration = within(dialog).getByLabelText('Race duration');
    expect(duration).toHaveValue(null);
    expect(duration).toHaveAttribute('placeholder', '20');
    expect(
      within(dialog).queryByRole('button', { name: 'Reset race duration to the club default' }),
    ).toBeDisabled();

    await user.click(
      within(dialog).getByRole('button', { name: 'Reset launch lead to the club default' }),
    );
    expect(launch).toHaveValue(null);
    await user.type(within(dialog).getByLabelText('Return time'), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const saved = await store.get('regattas', IDS.regatta);
    expect(saved!.settings).toEqual({ returnMin: 20 });
  });

  it('refuses a negative override', async () => {
    const user = userEvent.setup();
    const { store, dialog } = await setup();
    const input = within(dialog).getByLabelText('Hot seat minimum');
    await user.type(input, '-5');
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }));
    expect(await within(dialog).findByText('Enter zero or more')).toBeInTheDocument();
    expect((await store.get('regattas', IDS.regatta))!.settings).toEqual({ launchLeadMin: 45 });
  });

  it('changes the status and keeps race clock times when the timezone changes', async () => {
    const user = userEvent.setup();
    const { store, dialog } = await setup();
    await user.click(within(dialog).getByLabelText('Status'));
    // Coaches cannot archive.
    expect(await screen.findByRole('option', { name: 'Archived (admins only)' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(screen.getByRole('option', { name: 'Final' }));
    await user.click(within(dialog).getByLabelText('Timezone'));
    await user.click(await screen.findByRole('option', { name: 'Eastern time (New York)' }));
    expect(
      within(dialog).getByText('Race times keep their clock times in the new timezone.'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save settings' }));

    await waitFor(async () => {
      const r = await store.get('regattas', IDS.regatta);
      expect(r!.status).toBe('final');
      expect(r!.timezone).toBe('America/New_York');
    });
    const e = await store.get('events', IDS.event1);
    expect(clockAt(e!.scheduledAt!, 'America/New_York')).toBe('9:40');
  });
});
