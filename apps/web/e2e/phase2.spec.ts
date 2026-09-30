// Phase 2 demo (PLAN.md §12.1): pack the trailer for the regatta, toggle a rule, drag a boat,
// read "Why here?", print the load sheet, open the load list on a phone in airplane mode.
//
// The trailer flow runs on Head of the Lake 2026 (planning, 24 entries, no load plan yet), so it
// starts from an empty trailer. The 2025 Northwest Youth Championships (final) has seeded draft
// plans for both trailers (the 2026 Regionals layout) and a seeded load list.

import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  DESKTOP,
  expectNoEditControls,
  pageHeading,
  PHONE,
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  signInDemo,
  userName,
  waitForOfflineReady,
} from './helpers';
import { dragAndDrop } from './lineups';

const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const EIGHTS_ON_TOP = 'Prefer eights on levels 5 and 4';

/** A boat chip on the end view; its name reads "Level 4, narrow side: LLL, 8+". */
function chip(page: Page, shell: string): Locator {
  return page
    .getByRole('group', { name: /end view/ })
    .getByRole('button', { name: new RegExp(`^Level \\d, [^:]+: ${shell}, `) });
}

async function levelOf(page: Page, shell: string): Promise<number> {
  const name = (await chip(page, shell).getAttribute('aria-label')) ?? '';
  return Number(/^Level (\d)/.exec(name)?.[1]);
}

/** Select a chip (clicking toggles, so only when not selected) and read "Why here?". */
async function whyHere(page: Page, shell: string): Promise<Locator> {
  const boat = chip(page, shell);
  if ((await boat.getAttribute('aria-pressed')) !== 'true') await boat.click();
  await expect(boat).toHaveAttribute('aria-pressed', 'true');
  const panel = page.getByRole('complementary', { name: 'Why here?' });
  await expect(panel).toBeVisible();
  return panel;
}

async function packTrailer(page: Page) {
  await page.getByRole('main').getByRole('button', { name: 'Pack trailer', exact: true }).click();
  await expect(page.getByText('Trailer packed').first()).toBeVisible();
}

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('pack the trailer, toggle a rule, drag a boat, read "Why here?", print', async ({
    page,
  }) => {
    const eights = ['Peggy', 'LLL', 'Waltar'];
    await signInDemo(page, SEED_EMAILS.coachBoys);
    await page.goto(regattaUrl(HOTL, 'trailer'));
    await expect(pageHeading(page, 'Trailer')).toBeVisible();
    const main = page.getByRole('main');
    const toLoad = main.getByRole('region', { name: 'To load' });

    await test.step('start a load plan and pack it', async () => {
      await expect(main.getByRole('heading', { name: 'No load plans yet' })).toBeVisible();
      await main.getByRole('button', { name: 'Start a load plan for the Boys trailer' }).click();
      await expect(main.getByText('Boys trailer · 0 boats · Not packed yet')).toBeVisible();
      await expect(toLoad.getByRole('heading', { name: 'For this trailer 11' })).toBeVisible();

      await packTrailer(page);
      await expect(main.getByText(/^Boys trailer · 11 boats · Packed /)).toBeVisible();
      await expect(toLoad.getByRole('heading', { name: /^For this trailer/ })).toHaveCount(0);
      // The three eights go up top, as the default rule prefers.
      for (const shell of eights) expect(await levelOf(page, shell)).toBeGreaterThanOrEqual(4);
      const metrics = main.getByRole('region', { name: 'Weight, overhang, and warnings' });
      await expect(metrics).toContainText('11 on this trailer');
    });

    await test.step('"Why here?" lists the rules behind a spot', async () => {
      const panel = await whyHere(page, 'LLL');
      await expect(panel).toContainText(/Boys trailer, level \d, /);
      const reasons = panel.getByRole('list');
      await expect(reasons.getByRole('listitem').first()).toContainText(/^Must\s*Fits:/);
      await expect(reasons.getByRole('listitem').filter({ hasText: EIGHTS_ON_TOP })).toContainText(
        /^Prefer\s*Prefer eights on levels 5 and 4\s*\+30$/,
      );
      await expect(panel).toContainText('Not locked. Pack trailer may move it.');
    });

    await test.step('turn a rule off and pack again', async () => {
      const rules = main.getByRole('region', { name: 'Loading rules' }).first();
      const toggle = rules.getByRole('switch', { name: `Use this rule: ${EIGHTS_ON_TOP}` });
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await expect(
        main
          .getByRole('region', { name: 'Boys trailer load plan' })
          .getByRole('status')
          .filter({ hasText: 'Rules changed' }),
      ).toHaveText('Rules changed · Pack trailer to apply');
      await expect(rules.getByRole('button', { name: 'Reset to defaults' })).toBeEnabled();

      await packTrailer(page);
      // Without the preference, heavier-low and balance bring eights down a level.
      const levels = await Promise.all(eights.map((s) => levelOf(page, s)));
      expect(Math.min(...levels)).toBeLessThan(4);
      const panel = await whyHere(page, 'LLL');
      await expect(panel.getByRole('list')).not.toContainText(EIGHTS_ON_TOP);
    });

    await test.step('drag a boat to the top rack; the move locks it', async () => {
      // LLL is still selected from "Why here?": every lane shows as a target, with the reason
      // where it won't fit.
      await expect(chip(page, 'LLL')).toHaveAttribute('aria-pressed', 'true');
      const target = main.getByRole('button', { name: 'Move LLL to Level 5, narrow side' });
      await expect(target).toBeVisible();
      await expect(
        main.getByRole('button', { name: /^Move LLL to Level 1, narrow side\. Doesn't fit/ }),
      ).toBeVisible();

      await dragAndDrop(page, chip(page, 'LLL'), target);
      await expect(chip(page, 'LLL')).toHaveAccessibleName('Level 5, narrow side: LLL, 8+, locked');
      const panel = await whyHere(page, 'LLL');
      // A hand move locks the boat, with who did it ("Sam W."), in one sentence.
      const [first, ...rest] = userName(SEED_EMAILS.coachBoys).split(' ');
      await expect(panel).toContainText(
        `Locked by ${first} ${rest.at(-1)![0]}. Pack trailer keeps it here.`,
      );

      // Packing again keeps a locked boat where it is.
      await packTrailer(page);
      await expect(chip(page, 'LLL')).toHaveAccessibleName('Level 5, narrow side: LLL, 8+, locked');
    });

    await test.step('print the load sheet with the end view', async () => {
      await main.getByRole('link', { name: 'Print load sheet' }).click();
      await expect(pageHeading(page, 'Load sheet: Boys trailer')).toBeVisible();
      const sheet = page.getByRole('region', { name: 'Boys trailer load sheet' });
      await expect(sheet).toContainText('Load plan: draft, 11 boats');
      await expect(
        sheet
          .getByRole('group', { name: 'Boys trailer, end view, seen from the back' })
          .getByRole('row', { name: 'Level 5 narrow side One lane LLL, 8+' }),
      ).toBeAttached();
      await expect(
        sheet
          .getByRole('table', { name: 'Shelves' })
          .getByRole('row', { name: /^5 \(top\) Narrow side 1 LLL \(Live\.Laugh\.Love\) 8\+/ }),
      ).toBeVisible();
    });
  });

  test('print the seeded load sheet and switch trailers', async ({ page }) => {
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

    // The bed front to back, riggers filling the back of it (PLAN.md §4.9).
    const bed = sheet.getByRole('table', { name: 'Bed, front to back' });
    await expect(bed.getByRole('rowheader')).toHaveText([
      'Slings',
      'Oars',
      'Riggers (back of bed)',
    ]);
    await expect(
      bed.getByRole('row', {
        name: /^Riggers \(back of bed\) From 7\.0 m to the back .*Riggers for LLL/,
      }),
    ).toBeVisible();

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

  test('a final regatta asks before the trailer is repacked', async ({ page }) => {
    // PLAN.md §4.1 and §18: changes to a final regatta's load plans ask first; load list ticks
    // (what happened at the trailer) don't.
    await signInDemo(page);
    await page.goto(regattaUrl(NW_YOUTH, 'trailer'));
    await expect(page.getByText('This regatta is final. Changes need confirmation.')).toBeVisible();
    await page.getByRole('main').getByRole('button', { name: 'Pack trailer', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'This regatta is final' })).toBeVisible();
  });
});

test.describe('phone', () => {
  test.use(PHONE);

  test('the load list on a phone in airplane mode', async ({ page, context }) => {
    await signInDemo(page);
    await page.goto(regattaUrl(NW_YOUTH, 'load'));
    await expect(pageHeading(page, 'Load list')).toBeVisible();
    const main = page.getByRole('main');
    const groups = ['Shells', 'Riggers', 'Oars', 'Gear'];
    // Grouped by kind, with Loaded and Returned for each line (§6.7), and flags.
    await expect(main.getByText('6 of 69 loaded · 2 returned')).toBeVisible();
    for (const group of groups) {
      await expect(main.getByRole('region', { name: group, exact: true })).toBeVisible();
    }
    const shells = main.getByRole('region', { name: 'Shells', exact: true });
    await expect(
      shells.getByRole('checkbox', { name: 'Loaded: Live.Laugh.Love (LLL)' }),
    ).toBeChecked();
    await expect(shells.getByRole('checkbox', { name: 'Loaded: Alma Marie (Alma)' })).toBeEnabled();
    await expect(main.getByText('2 shells are not on a trailer yet.')).toBeVisible();
    await waitForOfflineReady(page);

    // Airplane mode, and the page reopened: it renders from the device, read-only.
    await context.setOffline(true);
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await page.reload();
    await expect(pageHeading(page, 'Load list')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toContainText("You're offline.");
    await expect(main.getByText('6 of 69 loaded · 2 returned')).toBeVisible();
    for (const group of groups) {
      await expect(main.getByRole('region', { name: group, exact: true })).toBeVisible();
    }
    await expect(
      shells.getByRole('checkbox', { name: 'Loaded: Live.Laugh.Love (LLL)' }),
    ).toBeChecked();
    await expect(
      shells.getByRole('checkbox', { name: 'Loaded: Alma Marie (Alma)' }),
    ).toBeDisabled();
    await expectNoEditControls(page);

    // The trailer page is readable offline too.
    await page
      .getByRole('navigation', { name: 'Regatta' })
      .getByRole('link', { name: 'Trailer' })
      .click();
    await expect(pageHeading(page, 'Trailer')).toBeVisible();
    await expect(chip(page, 'Peggy')).toBeVisible();
    await expectNoEditControls(page);
  });
});
