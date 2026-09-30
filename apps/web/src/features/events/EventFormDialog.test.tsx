import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { clockAt, regattaEventInputSchema, type RegattaEvent } from '@srt/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { EventFormDialog } from './EventFormDialog';
import {
  eventFormSchema,
  eventToForm,
  formToEventFields,
  newEventDefaults,
  nextSortOrder,
} from './event-form';

const TZ = 'America/Los_Angeles';
const DAY = '2026-11-01';

function renderForm(props: { event?: RegattaEvent; defaultKind?: RegattaEvent['kind'] } = {}) {
  const store = fixtureStore();
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <EventFormDialog
      regattaId={IDS.regatta}
      open
      onOpenChange={onOpenChange}
      onSaved={onSaved}
      {...props}
    />,
    { wrapper: dataWrapper(store) },
  );
  return { store, onSaved, onOpenChange };
}

describe('event form helpers', () => {
  const schema = eventFormSchema([DAY]);

  it('requires a name, a class for races, a regatta day, and a real time', () => {
    const empty = schema.safeParse(newEventDefaults({ day: '2026-11-02' }));
    expect(empty.error?.issues.map((i) => i.message).sort()).toEqual(
      ['Choose a boat class for a race', 'Choose one of the regatta days', 'Enter a name'].sort(),
    );
    const bad = schema.safeParse({
      ...newEventDefaults({ day: DAY }),
      name: 'Lunch',
      kind: 'logistics',
      time: '25:00',
    });
    expect(bad.error?.issues.map((i) => i.message)).toEqual(['Enter a time like 09:40']);
  });

  it('turns form values into a valid event and back', () => {
    const values = {
      ...newEventDefaults({ day: DAY }),
      eventNumber: '14A',
      name: "Men's Junior 4+",
      boatClass: '4+' as const,
      time: '09:40',
      stage: 'final' as const,
      teamFilter: ['ignoredforraces'],
    };
    const fields = formToEventFields(values, TZ);
    expect(fields).toMatchObject({ kind: 'race', boatClass: '4+', stage: 'final', teamFilter: [] });
    expect(clockAt(fields.scheduledAt!, TZ)).toBe('9:40');
    const record = { ...fields, regattaId: IDS.regatta, sortOrder: 3 };
    expect(regattaEventInputSchema.safeParse(record).success).toBe(true);
    expect(eventToForm({ ...record, id: 'x' }, TZ)).toEqual({ ...values, teamFilter: [] });

    const bus = formToEventFields(
      { ...newEventDefaults({ day: DAY, kind: 'logistics' }), name: 'Bus', teamFilter: ['t1'] },
      TZ,
    );
    expect(bus).toMatchObject({
      boatClass: null,
      stage: null,
      scheduledAt: null,
      teamFilter: ['t1'],
    });
    expect(nextSortOrder([{ sortOrder: 2 }, { sortOrder: 7 }])).toBe(8);
    expect(nextSortOrder([])).toBe(1);
  });
});

describe('EventFormDialog', () => {
  it('validates, then adds a race at the chosen time', async () => {
    const user = userEvent.setup();
    const { store, onSaved, onOpenChange } = renderForm();
    const dialog = await screen.findByRole('dialog', { name: 'Add event' });
    await user.click(await within(dialog).findByRole('button', { name: 'Add event' }));
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a boat class for a race')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Event number'), '15');
    await user.type(within(dialog).getByLabelText('Name'), "Women's Junior 4x");
    await user.click(within(dialog).getByLabelText('Boat class'));
    await user.click(await screen.findByRole('option', { name: '4x' }));
    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '11:05' } });
    await user.click(within(dialog).getByRole('button', { name: 'Add event' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const saved = onSaved.mock.calls[0]![0] as RegattaEvent;
    const stored = (await store.get('events', saved.id))!;
    expect(stored).toMatchObject({
      regattaId: IDS.regatta,
      kind: 'race',
      eventNumber: '15',
      name: "Women's Junior 4x",
      boatClass: '4x',
      day: DAY,
      stage: 'race',
      sortOrder: 3,
    });
    expect(clockAt(stored.scheduledAt!, TZ)).toBe('11:05');
  });

  it('adds a logistics line for one team', async () => {
    const user = userEvent.setup();
    const { store, onSaved } = renderForm({ defaultKind: 'logistics' });
    const dialog = await screen.findByRole('dialog', { name: 'Add logistics item' });
    await user.type(await within(dialog).findByLabelText('What happens'), 'Bus departs hotel');
    await user.click(within(dialog).getByLabelText('Junior girls'));
    await user.click(within(dialog).getByRole('button', { name: 'Add logistics item' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const stored = (await store.get('events', (onSaved.mock.calls[0]![0] as RegattaEvent).id))!;
    expect(stored).toMatchObject({
      kind: 'logistics',
      name: 'Bus departs hotel',
      boatClass: null,
      stage: null,
      scheduledAt: null,
      teamFilter: [IDS.girls],
    });
  });

  it('edits an event, and its entries follow a class change', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    const event = (await store.get('events', IDS.event1))!;
    const onSaved = vi.fn();
    render(
      <EventFormDialog
        regattaId={IDS.regatta}
        open
        onOpenChange={() => {}}
        event={event}
        onSaved={onSaved}
      />,
      { wrapper: dataWrapper(store) },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    expect(await within(dialog).findByLabelText('Time')).toHaveValue('09:40');
    await user.click(within(dialog).getByLabelText('Boat class'));
    await user.click(await screen.findByRole('option', { name: '4-' }));
    expect(within(dialog).getByText(/1 entry on this event change to 4- too/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Time'), { target: { value: '' } });
    await user.click(within(dialog).getByRole('button', { name: 'Save event' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(await store.get('events', IDS.event1)).toMatchObject({
      boatClass: '4-',
      scheduledAt: null,
    });
    expect((await store.get('entries', IDS.entry1))!.boatClass).toBe('4-');
  });

  it('deletes an event after confirming; its entries become unscheduled', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    const event = (await store.get('events', IDS.event1))!;
    const onOpenChange = vi.fn();
    render(
      <EventFormDialog regattaId={IDS.regatta} open onOpenChange={onOpenChange} event={event} />,
      { wrapper: dataWrapper(store) },
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit event' });
    await user.click(await within(dialog).findByRole('button', { name: 'Delete event' }));
    const confirm = await screen.findByRole('dialog', {
      name: "Delete Event 12, Men's Junior 4+?",
    });
    expect(
      within(confirm).getByText('1 entry on it becomes unscheduled. Lineups stay as they are.'),
    ).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Delete event' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(await store.get('events', IDS.event1)).toBeNull();
    const entry = (await store.get('entries', IDS.entry1))!;
    expect(entry.eventId ?? null).toBeNull();
    expect(await store.list('entry_seats', { where: { entryId: IDS.entry1 } })).toHaveLength(2);
  });
});
