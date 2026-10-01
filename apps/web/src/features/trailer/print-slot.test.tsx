// The load sheet's trailer diagram (features/print/PrintLoadPage.tsx TrailerDiagramSlot), filled
// by WP-M with the end view of the regatta's load plan.

import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router/dom';
import {
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  SEED_USER_IDS,
  buildSeedWorld,
} from '@regatta-ops/seed';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import { MemoryStore } from '@/data/memory-store';
import { printLoadPath } from '@/features/print/links';
import { testQueryClient } from '@/test/render';

function renderPrint(regattaId: string) {
  const { world } = buildSeedWorld();
  const store = new MemoryStore({ world, userId: SEED_USER_IDS.coachBoys });
  const queryClient = testQueryClient();
  const router = createTestRouter(
    { store, queryClient },
    printLoadPath(regattaId, SEED_TRAILER_IDS.boys),
  );
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('Load sheet trailer diagram', () => {
  it('draws the plan’s boats on the racks at print size', async () => {
    renderPrint(SEED_REGATTA_IDS.nwYouth2025);
    const sheet = await screen.findByRole(
      'region',
      { name: 'Boys trailer load sheet' },
      { timeout: 8000 },
    );
    const slot = sheet.querySelector<HTMLElement>('[data-slot="trailer-end-view"]')!;
    expect(slot).not.toBeNull();
    const view = within(slot).getByRole('group', {
      name: 'Boys trailer, end view, seen from the back',
    });
    expect(view).toHaveStyle({ width: '680px' });
    // The screen-reader table lists every lane with its boats.
    const rows = within(view).getAllByRole('row');
    expect(rows.some((r) => /Peggy, 8\+/.test(r.textContent ?? ''))).toBe(true);
    expect(rows.some((r) => /Spencer, 4\+/.test(r.textContent ?? ''))).toBe(true);
  });

  it('leaves the diagram out when the trailer has no load plan', async () => {
    renderPrint(SEED_REGATTA_IDS.headOfTheLake2026);
    const sheet = await screen.findByRole(
      'region',
      { name: 'Boys trailer load sheet' },
      { timeout: 8000 },
    );
    expect(sheet.querySelector('[data-slot="trailer-end-view"]')).toBeNull();
    expect(within(sheet).getByText(/No boats are placed on this trailer/)).toBeInTheDocument();
  });
});
