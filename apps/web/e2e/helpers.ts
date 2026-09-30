// Shared helpers for the Playwright flows (playwright.config.ts). Specs run against the demo
// build: MemoryStore on the seed world, one fresh browser context (and so fresh local storage,
// IndexedDB, and service worker) per test.

import { expect, type Page } from '@playwright/test';
import { SEED_EMAILS, SEED_REGATTA_IDS, SEED_TEAM_IDS, SEED_TRAILER_IDS } from '@srt/seed';

export { SEED_EMAILS, SEED_REGATTA_IDS, SEED_TEAM_IDS, SEED_TRAILER_IDS };

/** A phone (PLAN.md §5.3: < 768 px gets the top bar and the bottom tab bar). */
export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
export const DESKTOP = { viewport: { width: 1280, height: 800 } };

/** `/regattas/:id` or `/regattas/:id/<segment>` (schedule, lineups, trailer, load, ...). */
export function regattaUrl(regattaId: string, segment = ''): string {
  return segment ? `/regattas/${regattaId}/${segment}` : `/regattas/${regattaId}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sign in on the demo build by picking a seeded account (demo mode lists them on /sign-in; no
 * password). Waits until the app has left the sign-in page. Default: the boys' coach.
 */
export async function signInDemo(page: Page, email: string = SEED_EMAILS.coachBoys) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: new RegExp(escapeRegExp(email)) }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** Wait until the service worker has activated, which means the app shell is precached. */
export async function waitForOfflineReady(page: Page) {
  const state = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const worker = registration.active!;
    // `ready` resolves while the worker may still be activating.
    if (worker.state !== 'activated') {
      await new Promise<void>((resolve) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
        });
      });
    }
    return worker.state;
  });
  expect(state).toBe('activated');
}

/** The top-level heading of the page, like "Schedule" or "Load list". */
export function pageHeading(page: Page, name: string) {
  return page.getByRole('heading', { level: 1, name });
}

/** Buttons whose name starts with an editing verb (PLAN.md §5.5: buttons say what happens). */
const EDIT_VERBS =
  /^(add|new|create|edit|rename|delete|remove|move|copy|swap|pack|import|publish|mark|acknowledge|save|set|assign|clear|reset|shift)\b/i;

/** No enabled editing control in the page content (offline, and for viewers). */
export async function expectNoEditControls(page: Page) {
  await expect(
    page.getByRole('main').getByRole('button', { name: EDIT_VERBS, disabled: false }),
  ).toHaveCount(0);
}
