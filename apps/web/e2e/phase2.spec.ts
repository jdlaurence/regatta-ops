// Phase 2 demo (PLAN.md §12.1): pack the trailer for the regatta, toggle a rule, drag a boat,
// read "Why here?", print the load sheet, open the load list on a phone in airplane mode.
//
// The 2025 Northwest Youth Championships has a seeded draft load plan for both trailers (the
// 2026 Regionals layout) and a seeded load list.
//
// The trailer page (§6.6) and the load list page (§6.7) are WP-M, still being built: on this
// branch they are placeholders, so the flows that drive them are test.fixme() below, written
// against §6.6, §6.7, §4.10, and §18 items 7 and 19. They get un-fixme'd (and adjusted to the
// real accessible names) when WP-M is merged. The load sheet (WP-K) is built and tested now.

import { expect, test } from '@playwright/test';
import {
  DESKTOP,
  expectNoEditControls,
  pageHeading,
  PHONE,
  regattaUrl,
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  signInDemo,
  waitForOfflineReady,
} from './helpers';

const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const WP_M = 'WP-M (trailer page and load list) is not merged into this branch yet';

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('print the load sheet', async ({ page }) => {
    await signInDemo(page);
    await page.goto(`/print/regattas/${NW_YOUTH}/load/${SEED_TRAILER_IDS.boys}`);
    await expect(pageHeading(page, 'Load sheet: Boys trailer')).toBeVisible();
    const sheet = page.getByRole('region', { name: 'Boys trailer load sheet' });
    await expect(sheet).toContainText('Load plan: draft, 12 boats');

    // Shelf by shelf, top level first: the 2026 Regionals layout.
    const shelves = sheet.getByRole('table', { name: 'Shelves' });
    await expect(
      shelves.getByRole('row', { name: /^5 \(top\) Narrow side 1 Peggy \(Peggy's Delight\) 8\+/ }),
    ).toBeVisible();
    await expect(
      shelves.getByRole('row', { name: /^5 \(top\) Wide side 1 \(inner\) LLL/ }),
    ).toBeVisible();
    await expect(shelves.getByRole('row', { name: '1 Narrow side Empty' })).toBeVisible();

    // The checklist, with shells that are not on a trailer flagged.
    const checklist = sheet.getByRole('region', { name: 'Checklist' });
    const shells = checklist.getByRole('table', { name: 'Shells' });
    await expect(
      shells.getByRole('row', { name: /^Live\.Laugh\.Love \(LLL\) 1 Top level/ }),
    ).toBeVisible();
    await expect(shells.getByRole('row', { name: /Not on a trailer yet$/ }).first()).toBeVisible();

    // The other trailer's sheet from the print options.
    await page.getByRole('combobox', { name: 'Trailer' }).click();
    await page.getByRole('option', { name: 'Girls trailer' }).click();
    await expect(pageHeading(page, 'Load sheet: Girls trailer')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/load/${SEED_TRAILER_IDS.girls}$`));
  });

  test('pack the trailer, toggle a rule, drag a boat, and read "Why here?"', async ({ page }) => {
    test.fixme(true, WP_M);
    await signInDemo(page);
    await page.goto(regattaUrl(NW_YOUTH, `trailer/${SEED_TRAILER_IDS.boys}`));
    await expect(pageHeading(page, /Boys trailer/)).toBeVisible();
    const main = page.getByRole('main');

    // Pack: every boat of the load list gets a place (§4.10), and the metrics footer reads the
    // side weights.
    await main.getByRole('button', { name: 'Pack trailer' }).click();
    await expect(main.getByText(/To load \(0 unplaced\)|Nothing left to load/)).toBeVisible();
    await expect(main.getByText(/Left .* · Right /)).toBeVisible();

    // Toggle a rule off and repack: the rules panel lists sentences with switches (§4.10).
    const rules = page.getByRole('region', { name: /Rules/ });
    const eightsOnTop = rules.getByRole('switch', { name: /eights/i }).first();
    await eightsOnTop.click();
    await expect(eightsOnTop).not.toBeChecked();
    await main.getByRole('button', { name: 'Pack trailer' }).click();

    // Drag a boat chip to another lane (§18 item 19: chips and drop lanes are HTML over the
    // SVG, so dnd-kit targets them).
    const chip = main.getByRole('button', { name: /^Peggy/ });
    const lane = main.getByRole('button', { name: /Level 1, narrow side/ });
    const from = (await chip.boundingBox())!;
    const to = (await lane.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, {
      steps: 4,
    });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();

    // Why here? Selecting a placed boat shows its reasons in the inspector (§4.10).
    await main.getByRole('button', { name: /^Peggy/ }).click();
    const why = page.getByRole('complementary').getByRole('region', { name: /Why here/ });
    await expect(why).toBeVisible();
    await expect(why.getByRole('listitem').first()).toBeVisible();

    // And the load sheet from the page's Print button.
    await main.getByRole('link', { name: 'Print' }).click();
    await expect(pageHeading(page, 'Load sheet: Boys trailer')).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use(PHONE);

  test('the load list on a phone in airplane mode', async ({ page, context }) => {
    test.fixme(true, WP_M);
    await signInDemo(page);
    await page.goto(regattaUrl(NW_YOUTH, 'load'));
    await expect(pageHeading(page, 'Load list')).toBeVisible();
    const main = page.getByRole('main');
    // Grouped by kind with Loaded and Returned for each line (§6.7).
    for (const group of ['Shells', 'Riggers', 'Oars', 'Gear']) {
      await expect(main.getByRole('region', { name: new RegExp(`^${group}`) })).toBeVisible();
    }
    await expect(main.getByRole('checkbox', { name: /^Loaded: / }).first()).toBeVisible();
    await waitForOfflineReady(page);

    await context.setOffline(true);
    await page.reload();
    await expect(pageHeading(page, 'Load list')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    for (const group of ['Shells', 'Riggers', 'Oars', 'Gear']) {
      await expect(main.getByRole('region', { name: new RegExp(`^${group}`) })).toBeVisible();
    }
    // Read-only offline: the boxes show their state but cannot change.
    await expect(main.getByRole('checkbox', { name: /^Loaded: / }).first()).toBeDisabled();
    await expectNoEditControls(page);
  });
});
