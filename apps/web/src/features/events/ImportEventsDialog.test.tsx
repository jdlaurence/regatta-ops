import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clockAt } from '@regatta-ops/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { NW_DAYS, REFERENCE_CSV, REGATTACENTRAL } from './__fixtures__/paste-samples';
import { ImportEventsDialog } from './ImportEventsDialog';

const TZ = 'America/Los_Angeles';

function renderImport(store = fixtureStore(), regattaId: string = IDS.other) {
  const onImported = vi.fn();
  const onOpenChange = vi.fn();
  const view = render(
    <ImportEventsDialog
      regattaId={regattaId}
      open
      onOpenChange={onOpenChange}
      onImported={onImported}
    />,
    { wrapper: dataWrapper(store) },
  );
  return { store, onImported, onOpenChange, ...view };
}

describe('ImportEventsDialog', () => {
  it('maps a RegattaCentral paste, lets the coach fix a column and skip a row, and imports', async () => {
    const user = userEvent.setup();
    const { store, onImported, onOpenChange } = renderImport();

    const box = await screen.findByRole('textbox', { name: 'Schedule' });
    await user.click(box);
    await user.paste(REGATTACENTRAL);
    await user.click(screen.getByRole('button', { name: 'Read schedule' }));

    expect(await screen.findByText(/Found 6 races and 1 logistics item/)).toBeInTheDocument();
    const preview = screen.getByRole('table', { name: 'Events to import' });
    expect(within(preview).getAllByRole('row')).toHaveLength(8);
    // Unrecognized cells are flagged.
    expect(
      within(preview).getByText('"9.40" is not a time. It imports as TBD.'),
    ).toBeInTheDocument();
    expect(within(preview).getAllByText('Heat')).toHaveLength(2);

    // The coach says the Round column is not the stage: the preview follows.
    await user.click(screen.getByRole('combobox', { name: 'Column 5, Round' }));
    await user.click(await screen.findByRole('option', { name: 'Ignore' }));
    expect(within(preview).queryByText('Heat')).toBeNull();

    await user.click(within(preview).getByRole('checkbox', { name: 'Import Lunch break' }));
    expect(screen.getByText('6 of 7 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import 6 events' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith(6));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const events = await store.list('events', {
      where: { regattaId: IDS.other },
      sort: 'sortOrder',
    });
    expect(events.map((e) => e.eventNumber)).toEqual(['1', '2', '14A', '31', '40', '41']);
    expect(events.every((e) => e.day === '2027-03-01' && e.source === 'paste')).toBe(true);
    expect(events.every((e) => e.stage === 'race')).toBe(true);
    expect(clockAt(events[3]!.scheduledAt!, TZ)).toBe('13:04');
    expect(events[4]!.scheduledAt).toBeNull();
    expect(events[5]).toMatchObject({ boatClass: null, scheduledAt: null });
  });

  it('reads the reference CSV from a file into a three-day regatta', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    const regatta = await store.create('regattas', {
      name: 'Youth Championships',
      venue: 'Vancouver Lake',
      city: 'Vancouver, WA',
      startDate: NW_DAYS[0]!,
      endDate: NW_DAYS[2]!,
      timezone: TZ,
      format: 'sprint',
      status: 'planning',
      settings: {},
    });
    const { container } = renderImport(store, regatta.id);
    await screen.findByRole('textbox', { name: 'Schedule' });
    const input = container.ownerDocument.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File([REFERENCE_CSV], 'schedule.csv', { type: 'text/csv' }));
    const found = await screen.findByText(/Found \d+ races and \d+ logistics items/);
    const [, races, logistics] = /Found (\d+) races and (\d+)/.exec(found.textContent!)!;
    const total = Number(races) + Number(logistics);
    // Every row has a day, so the fallback day only covers rows without a regatta day.
    expect(screen.getByText('Rows without a regatta day go on')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Import ${total} events` }));

    await waitFor(async () => {
      const events = await store.list('events', { where: { regattaId: regatta.id } });
      expect(events).toHaveLength(total);
    });
    const events = await store.list('events', { where: { regattaId: regatta.id } });
    expect(new Set(events.map((e) => e.day))).toEqual(new Set(NW_DAYS));
    expect(events.every((e) => e.source === 'schedule.csv')).toBe(true);
    const tt = events.find((e) => e.name === "2V Men's 8+" && e.day === NW_DAYS[0]);
    expect(clockAt(tt!.scheduledAt!, TZ)).toBe('8:16');
  });

  it('says so when nothing in the paste looks like a schedule', async () => {
    const user = userEvent.setup();
    renderImport();
    const box = await screen.findByRole('textbox', { name: 'Schedule' });
    await user.click(box);
    await user.paste(',,,\n,,,');
    await user.click(screen.getByRole('button', { name: 'Read schedule' }));
    expect(
      await screen.findByText(
        'No schedule lines found. Paste rows with a time, an event number, or a class.',
      ),
    ).toBeInTheDocument();
  });
});
