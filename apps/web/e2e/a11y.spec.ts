// Automated accessibility (PLAN.md §5.6, §13): axe with the WCAG 2.1 A and AA rules on every
// main page, in the light and the dark theme, plus the landmark and heading rules from axe's
// best practices. A violation fails the test with the rule, the elements, and what to fix.
//
//   pnpm --filter @srt/web exec playwright test e2e/a11y.spec.ts

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { DESKTOP, PHONE, regattaUrl, SEED_TEAM_IDS } from './helpers';
import {
  createSharePath,
  HOTL,
  NW_YOUTH,
  openPage,
  PAGES,
  settle,
  shownTheme,
  signInAs,
} from './quality';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** Structure rules outside WCAG's tags that keep the page navigable by landmark and heading. */
const STRUCTURE_RULES = [
  'landmark-unique',
  'landmark-no-duplicate-main',
  'landmark-main-is-top-level',
  'heading-order',
  'page-has-heading-one',
  'duplicate-id-aria',
];

/** Run axe on the page as it is now and fail with a readable list of violations. */
async function expectNoViolations(page: Page) {
  const wcag = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const structure = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze();
  const report = [...wcag.violations, ...structure.violations].map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 8).map((n) => ({
      target: n.target.join(' '),
      summary: n.failureSummary?.split('\n').slice(0, 3).join(' '),
    })),
    more: Math.max(0, v.nodes.length - 8),
  }));
  expect(report, JSON.stringify(report, null, 2)).toEqual([]);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ ...DESKTOP, colorScheme });

    for (const c of PAGES) {
      test(c.name, async ({ page }) => {
        test.fixme(!!c.fixme, c.fixme);
        await openPage(page, c);
        expect(await shownTheme(page)).toBe(colorScheme);
        await expectNoViolations(page);
      });
    }

    test('share page', async ({ page }) => {
      // Demo mode keeps its data in this browser, so the link opens in the same one.
      await signInAs(page, 'coach');
      const path = await createSharePath(page);
      await page.goto(path);
      await settle(page);
      await expectNoViolations(page);
    });

    test('dialogs: new regatta, share links, shift times', async ({ page }) => {
      await signInAs(page, 'coach');
      await page.goto('/');
      await settle(page);
      await page.getByRole('button', { name: 'New regatta' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page);
      await page.keyboard.press('Escape');

      await page.goto(regattaUrl(HOTL));
      await settle(page);
      await page.getByRole('button', { name: 'Share' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await settle(page);
      await expectNoViolations(page);
      await page.keyboard.press('Escape');

      await page.goto(regattaUrl(NW_YOUTH, 'schedule'));
      await settle(page);
      await page.getByRole('button', { name: /Shift times/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expectNoViolations(page);
    });

    test('lineups: entry details in the inspector and an open picker', async ({ page }) => {
      await signInAs(page, 'coach');
      await page.goto(regattaUrl(NW_YOUTH, `lineups/${SEED_TEAM_IDS.boys}`));
      await settle(page);
      await page
        .getByRole('button', { name: /show entry details/ })
        .first()
        .click();
      await expect(page.getByRole('complementary', { name: 'Entry details' })).toBeVisible();
      await expectNoViolations(page);
      await page
        .getByRole('button', { name: /^Shell: / })
        .first()
        .click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await expectNoViolations(page);
    });

    test('schedule conflicts tab (tablet)', async ({ page }) => {
      await page.setViewportSize({ width: 820, height: 1180 });
      await signInAs(page, 'coach');
      await page.goto(regattaUrl(NW_YOUTH, 'schedule?tab=conflicts'));
      await settle(page);
      await expectNoViolations(page);
    });
  });
}

test.describe('phone', () => {
  test.use({ ...PHONE });

  const phonePages = PAGES.filter((c) =>
    [
      'regattas list',
      'regatta overview',
      'schedule, list',
      'lineups, by event',
      'availability',
      'fleet, shells',
      'team page',
      'print, lineup grid',
      'print, schedule',
      'print, load sheet',
      'trailers admin, read-only',
      'trailer, 2025 plan',
      'load list, 2025',
    ].includes(c.name),
  );
  for (const c of phonePages) {
    test(c.name, async ({ page }) => {
      await openPage(page, c);
      await expectNoViolations(page);
    });
  }

  test('navigation sheet and seat sheet', async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto('/teams');
    await settle(page);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    await expectNoViolations(page);
    await page.keyboard.press('Escape');

    await page.goto(regattaUrl(NW_YOUTH, `lineups/${SEED_TEAM_IDS.boys}`));
    await settle(page);
    await page
      .getByRole('button', { name: /^Seat \d/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoViolations(page);
  });
});
