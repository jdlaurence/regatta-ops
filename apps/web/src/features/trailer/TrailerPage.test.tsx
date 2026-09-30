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
import { useRulesDirty } from './hooks';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const BOYS = SEED_TRAILER_IDS.boys;
const HANS = seedShellId('Hans Struzyna');
const FOWLER = seedShellId('Fowler');
const PEGGY = seedShellId("Peggy's Delight");
const SLOW = { timeout: 8000 };

let seed: World;
beforeAll(() => {
  seed = buildSeedWorld().world;
});

function renderTrailer(path: string, userId: Id = SEED_USER_IDS.coachBoys) {
  useRulesDirty.setState({ plans: {} });
  const world = structuredClone(seed);
  const store = new MemoryStore({ world, userId });
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, path);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { store, router };
}

async function boysPlan(store: MemoryStore) {
  const plans = await store.list('load_plans', { where: { regattaId: NW, trailerId: BOYS } });
  return plans[0]!;
}

async function placementOf(store: MemoryStore, shellId: Id) {
  const all = await store.list('load_placements', { where: { shellId } });
  return all[0] ?? null;
}

const endView = () =>
  screen.findByRole('group', { name: 'Boys trailer, end view, seen from the back' }, SLOW);

describe('Trailer page', () => {
  it('shows the end view, the boats to load, and the rules', async () => {
    renderTrailer(`/regattas/${NW}/trailer`);
    const view = await endView();
    expect(screen.getByRole('heading', { level: 1, name: 'Trailer' })).toBeInTheDocument();
    expect(
      within(view).getByRole('button', { name: /^Level 5, narrow side: Peggy, 8\+/ }),
    ).toBeInTheDocument();
    const toLoad = screen.getByRole('region', { name: 'To load' });
    expect(within(toLoad).getByRole('button', { name: /^Hans, 8\+, Boys/ })).toBeInTheDocument();
    expect(within(toLoad).getByRole('button', { name: /^Fowler, 4\+, Boys/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loading rules' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Girls trailer/ })).toHaveAttribute(
      'href',
      `/regattas/${NW}/trailer/${SEED_TRAILER_IDS.girls}`,
    );
    expect(screen.getByRole('link', { name: 'Print load sheet' })).toHaveAttribute(
      'href',
      `/print/regattas/${NW}/load/${BOYS}`,
    );
  });

  it('moves a boat from "To load" to a lane with a click, locked by the coach', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    await user.click(screen.getByRole('button', { name: /^Fowler, 4\+, Boys/ }));
    expect(screen.getByText('Choose a lane for Fowler, or press Escape.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Move Fowler to Level 1, narrow side' }));
    await waitFor(async () => expect(await placementOf(store, FOWLER)).not.toBeNull());
    const p = (await placementOf(store, FOWLER))!;
    expect(p).toMatchObject({ loadPlanId: (await boysPlan(store)).id, lane: 0, locked: true });
    expect(p.reasons[0]!.text).toMatch(/^Locked by /);
    expect(
      await screen.findByRole('button', { name: /^Level 1, narrow side: Fowler, 4\+, locked/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Choose a lane for Fowler, or press Escape.')).toBeNull();
  });

  it('refuses a drop that breaks a hard rule, and places it flagged with Alt', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    await user.click(screen.getByRole('button', { name: /^Hans, 8\+, Boys/ }));
    const lane = screen.getByRole('button', {
      name: /^Move Hans to Level 1, narrow side\. Doesn't fit: 19\.9 m/,
    });
    await user.hover(lane);
    expect(
      await screen.findAllByText(/Doesn't fit: 19\.9 m is longer than the 17\.7 m/),
    ).not.toHaveLength(0);
    await user.click(lane);
    expect(await screen.findByText(/^Hans stayed where it was\. Doesn't fit/)).toBeInTheDocument();
    expect(await placementOf(store, HANS)).toBeNull();

    await user.keyboard('{Alt>}');
    await user.click(lane);
    await user.keyboard('{/Alt}');
    await waitFor(async () => expect(await placementOf(store, HANS)).not.toBeNull());
    expect((await placementOf(store, HANS))!.locked).toBe(true);
    expect(
      await screen.findByRole('button', {
        name: /^Level 1, narrow side: Hans, 8\+, locked, breaks a rule/,
      }),
    ).toBeInTheDocument();
  });

  it('packs the trailer, keeps locked boats, and says so', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    const peggy = (await placementOf(store, PEGGY))!;
    await store.update('load_placements', peggy.id, { locked: true });
    await user.click(
      await screen.findByRole('button', { name: /^Level 5, narrow side: Peggy, 8\+, locked/ }),
    );
    await user.click(screen.getByRole('button', { name: 'Pack trailer' }));
    expect(await screen.findByText('Trailer packed', {}, SLOW)).toBeInTheDocument();
    const plan = await boysPlan(store);
    expect(plan.packedAt).toBeTruthy();
    const after = (await placementOf(store, PEGGY))!;
    expect({ shelfId: after.shelfId, lane: after.lane, locked: after.locked }).toEqual({
      shelfId: peggy.shelfId,
      lane: peggy.lane,
      locked: true,
    });
    expect(await placementOf(store, HANS)).not.toBeNull();
    expect(await placementOf(store, FOWLER)).not.toBeNull();
    const onPlan = await store.list('load_placements', { where: { loadPlanId: plan.id } });
    expect(onPlan).toHaveLength(14);
    expect(screen.getByRole('region', { name: 'To load' })).toHaveTextContent('All on a trailer');
  });

  it('saves a rule change as this regatta override without repacking', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    const before = await store.list('load_placements', {});
    await user.click(screen.getByRole('switch', { name: 'Use this rule: Keep heavier boats low' }));
    await waitFor(async () => {
      const rule = (await boysPlan(store)).rules.find((r) => r.type === 'heavy-low');
      expect(rule).toMatchObject({ enabled: false, origin: 'regatta' });
    });
    expect(await screen.findAllByText('Rules changed · Pack trailer to apply')).not.toHaveLength(0);
    expect(screen.getByText('This regatta')).toBeInTheDocument();
    expect(await store.list('load_placements', {})).toEqual(before);
  });

  it('explains a placed boat in the inspector', async () => {
    const user = userEvent.setup();
    renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    await user.click(screen.getByRole('button', { name: /^Level 5, narrow side: Peggy, 8\+/ }));
    const panel = await screen.findByRole('complementary', { name: 'Why here?' });
    expect(within(panel).getByText('Boys trailer, level 5, narrow side')).toBeInTheDocument();
    expect(within(panel).getByText('Not locked. Pack trailer may move it.')).toBeInTheDocument();
    const reasons = within(panel).getByRole('heading', {
      name: 'The rules behind this spot',
    }).parentElement!;
    expect(within(reasons).getByText('Prefer eights on levels 5 and 4')).toBeInTheDocument();
    expect(within(reasons).getByText('+30')).toBeInTheDocument();
    expect(within(reasons).getByText(/^Fits: 19\.9 m in 12\.2 m/)).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Lock here' }));
    expect(
      await within(panel).findByText(/^Locked by .+\. Pack trailer keeps it here\.$/),
    ).toBeInTheDocument();

    // A boat still to load names the rule that rejected every spot.
    await user.click(screen.getByRole('button', { name: /^Hans, 8\+, Boys/ }));
    const toLoad = await screen.findByRole('complementary', { name: 'Boat to load' });
    expect(within(toLoad).getByText('No room on the Boys trailer')).toBeInTheDocument();
    expect(within(toLoad).getByText(/^Every active shelf rejected this boat/)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(
      await screen.findByRole('complementary', { name: 'Conflicts and activity' }),
    ).toBeInTheDocument();
  });

  it('takes a boat off the trailer and back onto the list to load', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${NW}/trailer`);
    await endView();
    await user.click(screen.getByRole('button', { name: /^Level 5, narrow side: Peggy, 8\+/ }));
    const panel = await screen.findByRole('complementary', { name: 'Why here?' });
    await user.click(within(panel).getByRole('button', { name: 'Remove from trailer' }));
    await waitFor(async () => expect(await placementOf(store, PEGGY)).toBeNull());
    const toLoad = screen.getByRole('region', { name: 'To load' });
    expect(await within(toLoad).findByRole('button', { name: /^Peggy, 8\+/ })).toBeInTheDocument();
  });

  it('offers to start a load plan per trailer when there is none', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${HOTL}/trailer`);
    expect(await screen.findByText('No load plans yet', {}, SLOW)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Start a load plan for the Boys trailer' }),
    );
    await waitFor(async () =>
      expect(await store.list('load_plans', { where: { regattaId: HOTL } })).toHaveLength(1),
    );
    const [plan] = await store.list('load_plans', { where: { regattaId: HOTL } });
    const trailer = await store.get('trailers', BOYS);
    expect(plan).toMatchObject({ trailerId: BOYS, status: 'draft' });
    expect(plan!.rules).toEqual(trailer!.defaultRules);
  });

  it('packs both trailers for a regatta with no plans yet', async () => {
    const user = userEvent.setup();
    const { store } = renderTrailer(`/regattas/${HOTL}/trailer`);
    await screen.findByText('No load plans yet', {}, SLOW);
    await user.click(screen.getByRole('button', { name: 'Pack both trailers' }));
    expect(await screen.findByText('Trailers packed', {}, SLOW)).toBeInTheDocument();
    const plans = await store.list('load_plans', { where: { regattaId: HOTL } });
    expect(plans).toHaveLength(2);
    const placements = await store.list('load_placements', {
      in: { loadPlanId: plans.map((p) => p.id) },
    });
    const entries = await store.list('entries', { where: { regattaId: HOTL } });
    const shells = new Set(
      entries.filter((e) => e.status !== 'scratched' && e.shellId).map((e) => e.shellId),
    );
    expect(placements).toHaveLength(shells.size);
  });

  it('is read-only for a viewer', async () => {
    renderTrailer(`/regattas/${NW}/trailer`, SEED_USER_IDS.viewer);
    await endView();
    expect(screen.getByRole('button', { name: 'Pack trailer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pack both trailers' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Add rule/ })).toBeNull();
  });
});
