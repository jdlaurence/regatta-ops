import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import type { Id, World } from '@srt/domain';
import {
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  SEED_USER_IDS,
  buildSeedWorld,
  seedShellId,
} from '@srt/seed';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { MemoryStore } from '@/data/memory-store';
import { testQueryClient } from '@/test/render';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const SLOW = { timeout: 8000 };

let seed: World;
beforeAll(() => {
  seed = buildSeedWorld().world;
});

function renderLoadList(userId: Id = SEED_USER_IDS.coachBoys, edit?: (w: World) => void) {
  const world = structuredClone(seed);
  edit?.(world);
  const store = new MemoryStore({ world, userId });
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, `/regattas/${NW}/load`);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { store };
}

const itemsFor = (store: MemoryStore, refId: string) =>
  store.list('load_items', { where: { regattaId: NW, refId } });

describe('Load list page', () => {
  it('groups the checklist by kind with counts and flags', async () => {
    renderLoadList();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Load list' }, SLOW),
    ).toBeInTheDocument();
    for (const name of ['Shells', 'Riggers', 'Oars', 'Gear', 'Extras']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByText(/^\d+ of \d+$/).parentElement).toHaveTextContent(
      /loaded · 2 returned$/,
    );
    expect(screen.getByText('2 shells are not on a trailer yet.')).toBeInTheDocument();
    const shells = screen.getByRole('region', { name: 'Shells' });
    expect(within(shells).getAllByText('Not on a trailer')).toHaveLength(2);
    expect(within(shells).getAllByText('Spare').length).toBeGreaterThan(0);
    // A tick from the seed reads who and when.
    expect(
      within(shells).getByRole('checkbox', { name: "Loaded: Peggy's Delight (Peggy)" }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('saves a line on its first tick with who ticked it', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList();
    const box = await screen.findByRole('checkbox', { name: 'Loaded: Alma Marie (Alma)' }, SLOW);
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(await itemsFor(store, seedShellId('Alma Marie'))).toHaveLength(0);
    await user.click(box);
    await waitFor(async () =>
      expect(await itemsFor(store, seedShellId('Alma Marie'))).toHaveLength(1),
    );
    const [item] = await itemsFor(store, seedShellId('Alma Marie'));
    expect(item).toMatchObject({ kind: 'shell', loadedBy: SEED_USER_IDS.coachBoys });
    expect(item!.loadedAt).toBeTruthy();
    await waitFor(() => expect(box).toHaveAttribute('aria-checked', 'true'));

    // Unticking updates the same record.
    await user.click(box);
    await waitFor(async () => {
      const [again] = await itemsFor(store, seedShellId('Alma Marie'));
      expect(again).toMatchObject({ id: item!.id, loadedAt: null, loadedBy: null });
    });
  });

  it('adds an extra and filters to what is not loaded', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList();
    await user.click(await screen.findByRole('button', { name: 'Add item' }, SLOW));
    const dialog = screen.getByRole('dialog', { name: 'Add item' });
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));
    expect(within(dialog).getByText('Say what the item is.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Tool kit' }));
    await user.clear(within(dialog).getByRole('textbox', { name: 'Quantity' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Quantity' }), '2');
    await user.type(
      within(dialog).getByRole('combobox', { name: 'Where it rides' }),
      'Truck 1 bed',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Add item' }));
    await waitFor(async () => {
      const extras = await store.list('load_items', { where: { regattaId: NW, kind: 'extra' } });
      expect(extras.find((x) => x.label === 'Tool kit')).toMatchObject({
        quantity: 2,
        container: 'Truck 1 bed',
        loadPlanId: null,
      });
    });
    const extras = screen.getByRole('region', { name: 'Extras' });
    expect(await within(extras).findByText('Tool kit')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /^Not loaded/ }));
    expect(screen.queryByRole('checkbox', { name: "Loaded: Peggy's Delight (Peggy)" })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Loaded: Alma Marie (Alma)' })).toBeInTheDocument();
  }, 15_000);

  it('removes a stored line nothing needs any more', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList(SEED_USER_IDS.coachBoys, (w) => {
      w.load_items.push({
        id: 'orphanitem00001',
        regattaId: NW,
        kind: 'oar_set',
        refId: 'gonegonegone001',
        label: 'An old oar set',
        quantity: 8,
        container: '',
      });
    });
    const oars = await screen.findByRole('region', { name: 'Oars' }, SLOW);
    expect(within(oars).getByText('No longer needed')).toBeInTheDocument();
    await user.click(within(oars).getByRole('button', { name: 'Remove' }));
    await waitFor(async () => expect(await store.get('load_items', 'orphanitem00001')).toBeNull());
  });

  it('saves every line at once for the loading crew', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList();
    await user.click(await screen.findByRole('button', { name: 'Save list' }, SLOW));
    expect(await screen.findByText('Load list saved', {}, SLOW)).toBeInTheDocument();
    const items = await store.list('load_items', { where: { regattaId: NW } });
    const shells = new Set(items.filter((i) => i.kind === 'shell').map((i) => i.refId));
    expect(shells.has(seedShellId('Alma Marie'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Save list' })).toBeNull();
  });

  it('sets where a line rides from the quick picks', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList();
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Where Alma Marie (Alma) rides: Boys trailer' },
        SLOW,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Truck 2 bed' }));
    await waitFor(async () => {
      const [item] = await itemsFor(store, seedShellId('Alma Marie'));
      expect(item).toMatchObject({ container: 'Truck 2 bed', loadPlanId: null });
    });
  });

  it('puts riggers at the back of the bed and offers every bed zone', async () => {
    const user = userEvent.setup();
    const { store } = renderLoadList();
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Where Riggers for Alma rides: Boys trailer · Riggers (back of bed)' },
        SLOW,
      ),
    );
    const popover = screen.getByRole('dialog');
    expect(
      within(popover).getByText(
        'Shown as Boys trailer · Riggers (back of bed) because the shell is on that trailer.',
      ),
    ).toBeInTheDocument();
    for (const pick of ['Boys trailer · Slings', 'Boys trailer · Oars', 'Girls trailer · Oars']) {
      expect(within(popover).getByRole('button', { name: pick })).toBeInTheDocument();
    }
    await user.click(
      within(popover).getByRole('button', { name: 'Girls trailer · Riggers (back of bed)' }),
    );
    const girlsPlan = (await store.list('load_plans', { where: { regattaId: NW } })).find(
      (p) => p.trailerId === SEED_TRAILER_IDS.girls,
    )!;
    await waitFor(async () => {
      const items = await store.list('load_items', {
        where: { regattaId: NW, kind: 'riggers', refId: seedShellId('Alma Marie') },
      });
      expect(items[0]).toMatchObject({
        container: 'Girls trailer · Riggers (back of bed)',
        loadPlanId: girlsPlan.id,
      });
    });
  }, 15_000);

  it('is read-only for a viewer', async () => {
    renderLoadList(SEED_USER_IDS.viewer);
    const box = await screen.findByRole('checkbox', { name: 'Loaded: Alma Marie (Alma)' }, SLOW);
    expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save list' })).toBeNull();
  });
});
