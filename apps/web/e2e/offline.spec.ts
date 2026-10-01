// "Works at the trailer" (the Phase 2 demo in PLAN.md §12.1): open the
// schedule and the load list on a phone, lose the connection, reload, and the pages still
// render from the device, with the offline banner and no editing controls.

import { expect, test } from '@playwright/test';
import {
  expectNoEditControls,
  pageHeading,
  PHONE,
  regattaUrl,
  savedQueryKeys,
  SEED_REGATTA_IDS,
  signInDemo,
  waitForOfflineReady,
} from './helpers';

test.use(PHONE);

const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;

test('the schedule and load list open offline at 390 px, read-only', async ({ page, context }) => {
  await signInDemo(page);
  await expect(pageHeading(page, 'Regattas')).toBeVisible();
  // Online, a coach gets the editing controls.
  await expect(page.getByRole('button', { name: 'New regatta' })).toBeVisible();

  await page.goto(regattaUrl(NW_YOUTH, 'schedule'));
  await expect(pageHeading(page, 'Schedule')).toBeVisible();
  await expect(page.getByRole('link', { name: /Northwest Youth/ }).first()).toBeVisible();
  await waitForOfflineReady(page);
  await expect(page.getByTestId('offline-banner')).toHaveCount(0);

  await context.setOffline(true);
  // The banner appears as soon as the connection drops.
  await expect(page.getByTestId('offline-banner')).toBeVisible();

  // Reload with no network: the service worker serves the app, the device serves the data.
  await page.reload();
  await expect(pageHeading(page, 'Schedule')).toBeVisible();
  await expect(page.getByRole('link', { name: /Northwest Youth/ }).first()).toBeVisible();
  const banner = page.getByTestId('offline-banner');
  await expect(banner).toContainText("You're offline.");
  await expect(banner).toContainText('Showing the version saved on this device at');
  await expect(banner).toContainText('Editing is off until you reconnect.');
  await expectNoEditControls(page);

  // The load list, from the tab bar and by address.
  await page
    .getByRole('navigation', { name: 'Regatta' })
    .getByRole('link', { name: 'Load list' })
    .click();
  await expect(pageHeading(page, 'Load list')).toBeVisible();
  await page.goto(regattaUrl(NW_YOUTH, 'load'));
  await expect(pageHeading(page, 'Load list')).toBeVisible();
  await expect(banner).toBeVisible();
  await expectNoEditControls(page);

  // Role-gated controls are gone everywhere, not only on these pages.
  await page.goto('/');
  await expect(pageHeading(page, 'Regattas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New regatta' })).toHaveCount(0);

  // Reconnecting brings editing back without a reload. After an emulated-offline reload,
  // Chromium sends no 'online' event (and navigator.onLine was already true, as on wifi with no
  // internet), so the app notices on its next check of the server, within 5 s.
  await context.setOffline(false);
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByText('Back online. Editing is on.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New regatta' })).toBeVisible();
});

test("saves the regatta's working set on the device", async ({ page }) => {
  await signInDemo(page);
  await page.goto(regattaUrl(NW_YOUTH, 'schedule'));
  await expect(pageHeading(page, 'Schedule')).toBeVisible();

  const forRegatta = (collection: string) => (keys: unknown[][]) =>
    keys.some(
      (k) =>
        k[0] === 'regatta-ops' &&
        k[1] === collection &&
        k[2] === 'list' &&
        (k[3] as { where?: { regattaId?: string } } | undefined)?.where?.regattaId === NW_YOUTH,
    );
  await expect.poll(async () => forRegatta('events')(await savedQueryKeys(page))).toBe(true);
  const keys = await savedQueryKeys(page);
  expect(forRegatta('entries')(keys)).toBe(true);
  expect(forRegatta('load_plans')(keys)).toBe(true);
  expect(keys.some((k) => k[1] === 'entry_seats')).toBe(true);
  expect(keys.some((k) => k[1] === 'regattas' && k[2] === 'record' && k[3] === NW_YOUTH)).toBe(
    true,
  );
});
