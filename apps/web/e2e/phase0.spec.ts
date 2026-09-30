// Phase 0 demo (PLAN.md §12.1): sign in with a seeded account, see the navigation with the seeded
// regattas, switch themes (the choice sticks after a reload), and sign out. Desktop and phone.

import { expect, test, type Page } from '@playwright/test';
import {
  accountButton,
  DESKTOP,
  exact,
  openAccountMenu,
  pageHeading,
  PHONE,
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  signOut,
  userName,
} from './helpers';

/** The page background, which the theme tokens set (styles/tokens.css --bg). */
function pageBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function themeAttribute(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

async function pickTheme(page: Page, name: 'Light' | 'Dark' | 'Match system') {
  const menu = await openAccountMenu(page);
  await menu.getByRole('menuitemradio', { name }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

/**
 * Light, dark, and system: each choice applies at once and survives a reload. "Match system"
 * follows the operating system's setting (emulated here).
 */
async function checkThemes(page: Page, heading: string) {
  await page.emulateMedia({ colorScheme: 'light' });

  await pickTheme(page, 'Dark');
  await expect.poll(() => themeAttribute(page)).toBe('dark');
  const dark = await pageBackground(page);
  await page.reload();
  await expect(pageHeading(page, heading)).toBeVisible();
  expect(await themeAttribute(page)).toBe('dark');
  expect(await pageBackground(page)).toBe(dark);
  const menu = await openAccountMenu(page);
  await expect(menu.getByRole('menuitemradio', { name: 'Dark' })).toBeChecked();
  await page.keyboard.press('Escape');

  await pickTheme(page, 'Light');
  await expect.poll(() => themeAttribute(page)).toBe('light');
  const light = await pageBackground(page);
  expect(light).not.toBe(dark);
  await page.reload();
  await expect(pageHeading(page, heading)).toBeVisible();
  expect(await themeAttribute(page)).toBe('light');
  expect(await pageBackground(page)).toBe(light);

  // Match system: no forced theme; the page follows prefers-color-scheme, live and after reload.
  await pickTheme(page, 'Match system');
  await expect.poll(() => themeAttribute(page)).toBeNull();
  expect(await pageBackground(page)).toBe(light);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => pageBackground(page)).toBe(dark);
  await page.reload();
  await expect(pageHeading(page, heading)).toBeVisible();
  expect(await themeAttribute(page)).toBeNull();
  expect(await pageBackground(page)).toBe(dark);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => pageBackground(page)).toBe(light);
}

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('sign in, the seeded regattas in the navigation, themes, sign out', async ({ page }) => {
    // Signed out, every page goes to sign-in, which lists the seeded accounts in demo mode.
    await page.goto('/');
    await page.waitForURL('**/sign-in');
    await expect(pageHeading(page, 'Sign in')).toBeVisible();
    const accounts = page.getByRole('region', { name: 'Demo accounts' });
    await expect(accounts.getByRole('button')).toHaveCount(6);

    await accounts.getByRole('button', { name: new RegExp(SEED_EMAILS.coachBoys) }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(pageHeading(page, 'Regattas')).toBeVisible();
    await expect(accountButton(page)).toHaveAccessibleName(
      `Account: ${userName(SEED_EMAILS.coachBoys)}`,
    );

    // The navigation: upcoming regattas first, past ones behind a toggle.
    const nav = page.getByRole('navigation', { name: 'Main' });
    const regattas = nav.getByRole('region', { name: 'Regattas' });
    await expect(
      regattas.getByRole('link', { name: /^Tail of the Lake Oct 18, 2026/ }),
    ).toBeVisible();
    await expect(
      regattas.getByRole('link', { name: /^Head of the Lake Nov 1, 2026/ }),
    ).toBeVisible();
    await expect(regattas.getByRole('link', { name: /Northwest Youth/ })).toHaveCount(0);
    await regattas.getByRole('button', { name: /^Past regattas/ }).click();
    await expect(
      regattas.getByRole('link', { name: /Northwest Youth Championships/ }),
    ).toBeVisible();
    for (const section of ['Fleet', 'Trailers', 'Teams', 'Settings']) {
      await expect(nav.getByRole('link', { name: section, exact: true })).toBeVisible();
    }

    // Opening a regatta expands its sections in the navigation.
    await regattas.getByRole('link', { name: /^Head of the Lake/ }).click();
    await page.waitForURL(`**${regattaUrl(SEED_REGATTA_IDS.headOfTheLake2026)}`);
    await expect(pageHeading(page, 'Overview')).toBeVisible();
    for (const tab of ['Schedule', 'Lineups', 'Availability', 'Trailer', 'Load list']) {
      await expect(regattas.getByRole('link', { name: tab, exact: true })).toBeVisible();
    }
    await regattas.getByRole('link', { name: 'Schedule', exact: true }).click();
    await expect(pageHeading(page, 'Schedule')).toBeVisible();

    await checkThemes(page, 'Schedule');

    await signOut(page);
    // Signed out for real: a regatta page sends you back to sign-in, and returns you after.
    await page.goto(regattaUrl(SEED_REGATTA_IDS.headOfTheLake2026, 'schedule'));
    await page.waitForURL(/\/sign-in\?next=/);
    await page.getByRole('button', { name: new RegExp(SEED_EMAILS.viewer) }).click();
    await page.waitForURL(`**${regattaUrl(SEED_REGATTA_IDS.headOfTheLake2026, 'schedule')}`);
    await expect(pageHeading(page, 'Schedule')).toBeVisible();
    await expect(accountButton(page)).toHaveAccessibleName(
      `Account: ${userName(SEED_EMAILS.viewer)}`,
    );
  });
});

test.describe('phone', () => {
  test.use(PHONE);

  test('sign in, the navigation sheet, themes, sign out at 390 px', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: new RegExp(SEED_EMAILS.coachGirls) }).click();
    await page.waitForURL((url) => url.pathname === '/');
    await expect(pageHeading(page, 'Regattas')).toBeVisible();

    // No side column on a phone: the menu button opens the navigation in a sheet.
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const sheet = page.getByRole('dialog', { name: 'Navigation' });
    const nav = sheet.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: /^Tail of the Lake/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /^Head of the Lake/ })).toBeVisible();
    await nav.getByRole('link', { name: /^Tail of the Lake/ }).click();
    await expect(sheet).toHaveCount(0);
    await expect(pageHeading(page, 'Overview')).toBeVisible();

    // Inside a regatta: the top bar names it, and the tab bar holds the phone's four sections.
    await expect(
      page.getByRole('banner').getByRole('link', { name: exact('Tail of the Lake') }),
    ).toBeVisible();
    const tabs = page.getByRole('navigation', { name: 'Regatta' });
    for (const tab of ['Schedule', 'Lineups', 'Trailer', 'Load list']) {
      await expect(tabs.getByRole('link', { name: tab })).toBeVisible();
    }
    await tabs.getByRole('link', { name: 'Schedule' }).click();
    await expect(pageHeading(page, 'Schedule')).toBeVisible();

    await checkThemes(page, 'Schedule');

    await signOut(page);
    await page.goto('/');
    await page.waitForURL('**/sign-in');
  });
});
