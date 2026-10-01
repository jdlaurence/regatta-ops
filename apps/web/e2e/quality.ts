// Helpers for the quality specs (a11y, responsive, keyboard). Kept apart from helpers.ts so the
// phase-demo flows and the quality pass can change independently.

import { expect, type Page } from '@playwright/test';
import { seedShellId } from '@regatta-ops/seed';
import {
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  signInDemo,
} from './helpers';

/**
 * Wait until the page has finished loading: a top-level heading, no loading skeletons
 * (role="status" named "Loading..."), fonts loaded, and a frame drawn after the data arrived.
 * `skeletons: true` skips the skeleton check (the component gallery shows them on purpose).
 */
export async function settle(page: Page, { skeletons = false } = {}) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 });
  if (!skeletons) {
    await expect(page.locator('[role="status"][aria-label^="Loading"]')).toHaveCount(0, {
      timeout: 15_000,
    });
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

/** Who a page is checked as: the boys' coach by default, the admin for club settings. */
export type Who = 'coach' | 'admin' | 'signed out';

export async function signInAs(page: Page, who: Who) {
  if (who === 'signed out') return;
  await signInDemo(page, who === 'admin' ? SEED_EMAILS.admin : SEED_EMAILS.coachBoys);
}

/** The theme the page is actually showing. */
export async function shownTheme(page: Page): Promise<'light' | 'dark'> {
  const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  return scheme.includes('dark') ? 'dark' : 'light';
}

// Every main page, for the a11y and responsive specs ----------------------------------------

export const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
export const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const BOYS = SEED_TEAM_IDS.boys;

export interface PageCase {
  name: string;
  path: string;
  who?: Who;
  /** Extra steps after the page settles: open a drawer, switch a tab. */
  prepare?: (page: Page) => Promise<void>;
  /** The page shows loading skeletons on purpose (the component gallery). */
  skeletons?: boolean;
}

export const PAGES: PageCase[] = [
  { name: 'regattas list', path: '/' },
  { name: 'regatta overview', path: regattaUrl(HOTL) },
  { name: 'schedule, list', path: regattaUrl(NW_YOUTH, 'schedule') },
  { name: 'schedule, timeline', path: regattaUrl(NW_YOUTH, 'schedule?view=timeline') },
  { name: 'lineups, by event', path: regattaUrl(NW_YOUTH, `lineups/${BOYS}`) },
  { name: 'lineups, by athlete', path: regattaUrl(NW_YOUTH, `lineups/${BOYS}?view=athlete`) },
  { name: 'availability', path: regattaUrl(HOTL, 'availability') },
  { name: 'fleet, shells', path: '/fleet/shells', who: 'admin' },
  { name: 'fleet, oars', path: '/fleet/oars', who: 'admin' },
  { name: 'fleet, gear', path: '/fleet/gear', who: 'admin' },
  {
    name: 'fleet, shell drawer',
    path: `/fleet/shells?shell=${seedShellId('Live.Laugh.Love')}`,
    who: 'admin',
    prepare: async (page) => {
      await expect(page.getByRole('dialog')).toBeVisible();
      await settle(page);
    },
  },
  { name: 'trailers admin, list', path: '/trailers', who: 'admin' },
  { name: 'trailers admin, edit', path: `/trailers/${SEED_TRAILER_IDS.boys}`, who: 'admin' },
  { name: 'trailers admin, read-only', path: `/trailers/${SEED_TRAILER_IDS.girls}` },
  { name: 'teams list', path: '/teams', who: 'admin' },
  { name: 'team page', path: `/teams/${BOYS}`, who: 'admin' },
  { name: 'settings, club defaults', path: '/settings', who: 'admin' },
  { name: 'settings, users', path: '/settings?tab=users', who: 'admin' },
  { name: 'settings, preferences', path: '/settings?tab=preferences' },
  { name: 'settings, activity log', path: '/settings?tab=activity', who: 'admin' },
  { name: 'print, lineups', path: `/print/regattas/${NW_YOUTH}/lineups/${BOYS}` },
  {
    name: 'print, lineup grid',
    path: `/print/regattas/${NW_YOUTH}/lineups/${BOYS}?layout=grid`,
  },
  { name: 'print, schedule', path: `/print/regattas/${NW_YOUTH}/schedule` },
  {
    name: 'print, schedule list',
    path: `/print/regattas/${NW_YOUTH}/schedule?view=list&day=2025-05-16&team=${BOYS}`,
  },
  {
    name: 'print, load sheet',
    path: `/print/regattas/${NW_YOUTH}/load/${SEED_TRAILER_IDS.boys}`,
  },
  { name: 'component gallery', path: '/dev/components', skeletons: true },
  { name: 'sign in', path: '/sign-in', who: 'signed out' },
  { name: 'trailer', path: regattaUrl(HOTL, 'trailer') },
  { name: 'trailer, girls trailer', path: regattaUrl(HOTL, `trailer/${SEED_TRAILER_IDS.girls}`) },
  { name: 'trailer, 2025 plan', path: regattaUrl(NW_YOUTH, 'trailer') },
  {
    name: 'trailer, plan view of the bed',
    path: regattaUrl(NW_YOUTH, 'trailer?view=plan'),
    prepare: async (page) => {
      await page.getByRole('radio', { name: 'Bed' }).click();
      await expect(page.getByRole('group', { name: 'Bed from above' })).toBeVisible();
    },
  },
  { name: 'load list', path: regattaUrl(HOTL, 'load') },
  { name: 'load list, 2025', path: regattaUrl(NW_YOUTH, 'load') },
];

/** Sign in as the case says, open the page, wait for it, and run its extra steps. */
export async function openPage(page: Page, c: PageCase) {
  await signInAs(page, c.who ?? 'coach');
  await page.goto(c.path);
  await settle(page, { skeletons: c.skeletons });
  await c.prepare?.(page);
}

/**
 * Make a whole-regatta share link through the overview's dialog and return its path
 * (`/share/<token>`). Needs a signed-in coach.
 */
export async function createSharePath(page: Page, regattaId: string = HOTL): Promise<string> {
  await page.goto(regattaUrl(regattaId));
  await settle(page);
  await page.getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const address = dialog.getByRole('textbox', { name: 'Link address' }).first();
  await expect(address).toHaveValue(/\/share\//);
  const url = new URL(await address.inputValue());
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return url.pathname;
}
