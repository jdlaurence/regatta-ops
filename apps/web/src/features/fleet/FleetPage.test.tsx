import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import FleetPage from './FleetPage';

const NOW = '2026-09-29T17:00:00.000Z';

/** 1 × 1 PNG. */
const PNG_BYTES = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

function storeWith(userId: string = IDS.coach) {
  const world = fixtureWorld();
  world.shells.push({
    id: 'shelloldblue001',
    name: 'Old Blue',
    boatClass: '8+',
    compatibleClasses: [],
    rigging: 'sweep',
    riggerType: 'side',
    genderAffinity: 'any',
    status: 'retired',
    isPrivate: false,
    serial: 'OB-1971',
  });
  world.shells[0]!.serial = 'SPN-2019';
  world.shells[0]!.location = 'A4';
  return new MemoryStore({ world, userId, now: () => NOW });
}

function renderFleet(store: MemoryStore, path = '/fleet/shells') {
  const Wrapper = dataWrapper(store);
  return render(
    <Wrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/fleet/:tab" element={<FleetPage />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(NOW), toFake: ['Date'] });
  // Wide layout: the table, not the phone cards.
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('min-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
});

describe('Shells tab', () => {
  it('hides retired shells until asked and searches serial numbers', async () => {
    const user = userEvent.setup();
    renderFleet(storeWith());
    const table = await screen.findByRole('table', { name: 'Shells' });
    expect(within(table).getByRole('button', { name: 'Open Spencer' })).toBeInTheDocument();
    expect(within(table).getByRole('button', { name: 'Open Monahan' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Open Old Blue' })).toBeNull();
    expect(screen.getByText('2 shells, 1 retired hidden')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Show retired (1)' }));
    expect(within(table).getByRole('button', { name: 'Open Old Blue' })).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search shells' }), 'spn');
    expect(within(table).getByRole('button', { name: 'Open Spencer' })).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: 'Open Monahan' })).toBeNull();
    expect(screen.getByText('1 of 3 shells')).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search shells' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search shells' }), 'no such boat');
    expect(screen.getByText('No shells match these filters')).toBeInTheDocument();
  });

  it("groups by gender affinity and class, like the club's list", async () => {
    const user = userEvent.setup();
    renderFleet(storeWith());
    const table = await screen.findByRole('table', { name: 'Shells' });
    await user.click(screen.getByRole('radio', { name: 'Grouped' }));
    const headings = within(table)
      .getAllByRole('columnheader')
      .filter((h) => h.getAttribute('scope') === 'colgroup')
      .map((h) => h.textContent);
    expect(headings).toEqual(["Men's 8+", "Men's 4+"]);
  });

  it('saves an inline location edit', async () => {
    const user = userEvent.setup();
    const store = storeWith();
    renderFleet(store);
    const input = await screen.findByRole('combobox', { name: 'Location of Monahan' });
    await user.type(input, 'Meadow{Enter}');
    await waitFor(async () =>
      expect((await store.get('shells', IDS.shell2))?.location).toBe('Meadow'),
    );
  });

  it("opens a shell's drawer with its upcoming use and saves only what changed", async () => {
    const user = userEvent.setup();
    const store = storeWith();
    renderFleet(store);
    await user.click(await screen.findByRole('button', { name: 'Open Spencer' }));

    const drawer = await screen.findByRole('dialog', { name: 'Spencer' });
    expect(await within(drawer).findByText("Event 12 · Men's Junior 4+")).toBeInTheDocument();
    expect(within(drawer).getByText('9:40')).toBeInTheDocument();
    expect(within(drawer).getByText('Head of the Lake')).toBeInTheDocument();
    expect(
      within(drawer).getByRole('link', { name: /open junior boys lineups for v4\+/i }),
    ).toHaveAttribute('href', `/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry1}`);

    const save = within(drawer).getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    const weight = within(drawer).getByRole('textbox', { name: 'Weight class' });
    await user.type(weight, '165-200');
    expect(within(drawer).getByText('Crew 165–200 lb')).toBeInTheDocument();
    const location = within(drawer).getByRole('combobox', { name: 'Location' });
    await user.clear(location);
    await user.type(location, 'B3');
    await user.click(save);

    await waitFor(async () => {
      const saved = await store.get('shells', IDS.shell);
      expect(saved).toMatchObject({ location: 'B3', weightClassLabel: '165-200' });
      expect(saved!.crewWeightMinKg).toBeCloseTo(74.8, 1);
    });
    const [edit] = await store.list('activity_log', { where: { targetId: IDS.shell } });
    expect(edit!.summary).toBe('edited shell Spencer');
    expect(Object.keys(edit!.diff ?? {}).sort()).toEqual([
      'crewWeightMaxKg',
      'crewWeightMinKg',
      'location',
      'weightClassLabel',
    ]);
  });

  it('adds a photo in the drawer, shows it in the table, and removes it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const store = storeWith();
    renderFleet(store);
    const table = await screen.findByRole('table', { name: 'Shells' });
    // No photo column until a shell has a photo.
    expect(within(table).queryByRole('columnheader', { name: 'Photo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open Spencer' }));
    const drawer = await screen.findByRole('dialog', { name: 'Spencer' });
    expect(within(drawer).getByRole('button', { name: 'Choose a photo' })).toBeInTheDocument();

    const input = within(drawer).getByLabelText('Photo of Spencer');
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    expect(within(drawer).getByRole('alert')).toHaveTextContent(
      'Pick a photo: a JPEG, PNG, or WebP file.',
    );

    await user.upload(input, new File([PNG_BYTES], 'spencer.png', { type: 'image/png' }));
    const photo = await within(drawer).findByRole('img', { name: 'Photo of Spencer' });
    expect(photo.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(within(drawer).queryByRole('alert')).toBeNull();
    expect((await store.get('shells', IDS.shell))?.photoUrl).toMatch(/^data:image\/png/);
    // The table behind the drawer gets a photo column with a thumbnail. Adding the column
    // re-renders the table, so look it up again rather than holding the first element.
    await waitFor(() => {
      const current = screen.getByRole('table', { name: 'Shells', hidden: true });
      expect(
        within(current).getByRole('img', { name: 'Photo of Spencer', hidden: true }),
      ).toBeInTheDocument();
      expect(
        within(current).getByRole('columnheader', { name: 'Photo', hidden: true }),
      ).toBeInTheDocument();
    });
    const [log] = await store.list('activity_log', { where: { targetId: IDS.shell } });
    expect(log!.summary).toBe('edited shell Spencer (photo)');

    // Saving the form afterwards leaves the photo alone.
    const location = within(drawer).getByRole('combobox', { name: 'Location' });
    await user.clear(location);
    await user.type(location, 'B3');
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }));
    await waitFor(async () =>
      expect(await store.get('shells', IDS.shell)).toMatchObject({
        location: 'B3',
        photoUrl: expect.stringMatching(/^data:image\/png/),
      }),
    );

    await user.click(within(drawer).getByRole('button', { name: 'Remove photo' }));
    const confirm = await screen.findByRole('dialog', { name: 'Remove the photo of Spencer?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove photo' }));
    await waitFor(async () => expect((await store.get('shells', IDS.shell))?.photoUrl).toBeNull());
    expect(within(drawer).queryByRole('img', { name: 'Photo of Spencer' })).toBeNull();
    expect(within(drawer).getByRole('button', { name: 'Choose a photo' })).toBeInTheDocument();
  });

  it('adds a shell with the class defaults', async () => {
    const user = userEvent.setup();
    const store = storeWith();
    renderFleet(store);
    await user.click(await screen.findByRole('button', { name: 'Add shell' }));
    const drawer = await screen.findByRole('dialog', { name: 'New shell' });
    await user.click(within(drawer).getByRole('button', { name: /coxed quad/i }));
    expect(within(drawer).getByRole('spinbutton', { name: 'Length (cm)' })).toHaveValue(1340);
    expect(within(drawer).getByRole('spinbutton', { name: 'Rigger count' })).toHaveValue(8);

    await user.click(within(drawer).getByRole('button', { name: 'Add shell' }));
    expect(await within(drawer).findByText('Enter the shell name')).toBeInTheDocument();

    await user.type(within(drawer).getByRole('textbox', { name: 'Name' }), 'Test Quad');
    await user.click(within(drawer).getByRole('checkbox', { name: '4+' }));
    await user.click(within(drawer).getByRole('button', { name: 'Add shell' }));

    await waitFor(async () => {
      const shells = await store.list('shells');
      expect(shells.find((s) => s.name === 'Test Quad')).toMatchObject({
        boatClass: '4x+',
        compatibleClasses: ['4x+', '4+'],
        rigging: 'convertible',
        coxPosition: 'stern',
        lengthCm: 1340,
        beamCm: 52,
        weightKg: 53,
        riggerType: 'side',
        riggerCount: 8,
        status: 'in_service',
      });
    });
  });

  it('shows viewers the table without edit controls', async () => {
    const user = userEvent.setup();
    renderFleet(storeWith(IDS.viewer));
    await screen.findByRole('table', { name: 'Shells' });
    expect(screen.queryByRole('button', { name: 'Add shell' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import CSV' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /location of/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open Spencer' }));
    const drawer = await screen.findByRole('dialog', { name: 'Spencer' });
    expect(within(drawer).getByRole('textbox', { name: 'Name' })).toBeDisabled();
    expect(within(drawer).queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(within(drawer).queryByRole('button', { name: 'Choose a photo' })).toBeNull();
  });
});

describe('Oars and gear tabs', () => {
  it('lists oar sets with their color code and count', async () => {
    renderFleet(storeWith(), '/fleet/oars');
    const table = await screen.findByRole('table', { name: 'Oar sets' });
    expect(within(table).getByText('yellow-white')).toBeInTheDocument();
    expect(within(table).getByText('8 oars')).toBeInTheDocument();
  });

  it('imports gear from pasted rows', async () => {
    const user = userEvent.setup();
    const store = storeWith();
    renderFleet(store, '/fleet/gear');
    await user.click(await screen.findByRole('button', { name: 'Import CSV' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import gear' });
    await user.click(within(dialog).getByRole('textbox', { name: 'Rows to import' }));
    await user.paste('Item\tQty\tLoad by default\nCox boxes\t6\tyes\nTents\t3\tno\n\t2\t');
    await user.click(within(dialog).getByRole('button', { name: 'Match columns' }));
    expect(within(dialog).getByText('First value: Cox boxes')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Preview rows' }));
    expect(within(dialog).getByText('Name is missing.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Import 2 gear items' }));
    await waitFor(async () => {
      const gear = await store.list('gear_items', { sort: 'name' });
      expect(gear.map((g) => [g.name, g.quantity, g.defaultLoad])).toEqual([
        ['Cox boxes', 6, true],
        ['Tents', 3, false],
      ]);
    });
  });

  it('toggles default load on a gear item', async () => {
    const user = userEvent.setup();
    const world = fixtureWorld();
    world.gear_items.push({
      id: 'gearcoxboxes001',
      category: 'cox_box',
      name: 'Cox boxes',
      quantity: 6,
      defaultLoad: false,
    });
    const store = new MemoryStore({ world, userId: IDS.coach, now: () => NOW });
    renderFleet(store, '/fleet/gear');
    await user.click(
      await screen.findByRole('switch', { name: 'Cox boxes goes on every trailer by default' }),
    );
    await waitFor(async () =>
      expect((await store.get('gear_items', 'gearcoxboxes001'))?.defaultLoad).toBe(true),
    );
  });
});
