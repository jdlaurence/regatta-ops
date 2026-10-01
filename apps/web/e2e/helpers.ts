// Shared helpers for the Playwright flows (playwright.config.ts). The `demo` project runs against
// the demo build: MemoryStore on the seed world, one fresh browser context (and so fresh local
// storage, IndexedDB, and service worker) per test. The `pocketbase` project (e2e/pb/) runs
// against a real PocketBase serving the production build.

import { expect, type Locator, type Page } from '@playwright/test';
import { athleteName, type Athlete, type World } from '@regatta-ops/domain';
import {
  buildSeedWorld,
  SEED_EMAILS,
  SEED_PASSWORD,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
} from '@regatta-ops/seed';

export { SEED_EMAILS, SEED_PASSWORD, SEED_REGATTA_IDS, SEED_TEAM_IDS, SEED_TRAILER_IDS };

/** A phone (PLAN.md §5.3: < 768 px gets the top bar and the bottom tab bar). */
export const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };
export const DESKTOP = { viewport: { width: 1280, height: 800 } };

/** `/regattas/:id` or `/regattas/:id/<segment>` (schedule, lineups, trailer, load, ...). */
export function regattaUrl(regattaId: string, segment = ''): string {
  return segment ? `/regattas/${regattaId}/${segment}` : `/regattas/${regattaId}`;
}

/** `/regattas/:id/lineups/:teamId`. */
export function lineupsUrl(regattaId: string, teamId: string): string {
  return regattaUrl(regattaId, `lineups/${teamId}`);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A regular expression matching `text` exactly, or at the start with `prefix: true`. */
export function exact(text: string, { prefix = false } = {}): RegExp {
  return new RegExp(`^${escapeRegExp(text)}${prefix ? '' : '$'}`);
}

// ---------------------------------------------------------------------------
// The seed world (the same one demo mode and `pnpm pb:seed` load), for names in assertions.

let world: World | null = null;

/** The seed world, built once per worker. Pure and deterministic (packages/seed). */
export function seedWorld(): World {
  world ??= buildSeedWorld().world;
  return world;
}

/** The seeded user's display name, e.g. for "Account: <name>". */
export function userName(email: string): string {
  const user = seedWorld().users.find((u) => u.email === email);
  if (!user) throw new Error(`No seeded user ${email}`);
  return user.name;
}

/** Active athletes on a team, sorted by last then first name (the roster's order). */
export function teamAthletes(teamId: string): Athlete[] {
  return seedWorld()
    .athletes.filter((a) => a.teamId === teamId && a.status === 'active')
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

/** A team's seeded athletes who are available for a regatta and in none of its seeded entries. */
export function seededUnboated(regattaId: string, teamId: string): Athlete[] {
  const w = seedWorld();
  const entries = new Set(
    w.entries.filter((e) => e.regattaId === regattaId && e.teamId === teamId).map((e) => e.id),
  );
  const seated = new Set(
    w.entry_seats.filter((s) => entries.has(s.entryId) && s.athleteId).map((s) => s.athleteId),
  );
  const out = new Set(
    w.availability
      .filter((a) => a.regattaId === regattaId && a.status === 'unavailable')
      .map((a) => a.athleteId),
  );
  return teamAthletes(teamId).filter((a) => !seated.has(a.id) && !out.has(a.id));
}

export { athleteName };

// ---------------------------------------------------------------------------
// Signing in and out

/**
 * Sign in on the demo build by picking a seeded account (demo mode lists them on /sign-in; no
 * password). Waits until the app has left the sign-in page. Default: the boys' coach.
 */
export async function signInDemo(page: Page, email: string = SEED_EMAILS.coachBoys) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: new RegExp(escapeRegExp(email)) }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/**
 * Sign in with email and password (the PocketBase build; the seed's local accounts). Starts at
 * `/sign-in?next=<path>` so the app lands on `next`.
 */
export async function signInWithPassword(
  page: Page,
  email: string = SEED_EMAILS.coachBoys,
  { password = SEED_PASSWORD, next = '/' }: { password?: string; next?: string } = {},
) {
  await page.goto(next === '/' ? '/sign-in' : `/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

/** The account menu's trigger (the side nav on desktop, the avatar in the phone's top bar). */
export function accountButton(page: Page): Locator {
  return page.getByRole('button', { name: /^Account: / });
}

/** Open the account menu (theme, demo reset, sign out). */
export async function openAccountMenu(page: Page): Promise<Locator> {
  await accountButton(page).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  return menu;
}

/** Sign out from the account menu and wait for the sign-in page. */
export async function signOut(page: Page) {
  const menu = await openAccountMenu(page);
  await menu.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/sign-in'));
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Pages

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

/** The query keys of the device copy of the query cache (data/persist.ts, IndexedDB). */
export async function savedQueryKeys(page: Page): Promise<unknown[][]> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('regatta-ops');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      if (!db.objectStoreNames.contains('offline')) return [];
      const saved = await new Promise<{ clientState: { queries: { queryKey: unknown[] }[] } }>(
        (resolve, reject) => {
          const req = db.transaction('offline').objectStore('offline').get('query-cache');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        },
      );
      return saved ? saved.clientState.queries.map((q) => q.queryKey) : [];
    } finally {
      db.close();
    }
  });
}

/** Wait until the device copy of the query cache holds a list of this collection. */
export async function waitForDeviceCopy(page: Page, collection: string) {
  await expect
    .poll(async () => (await savedQueryKeys(page)).some((k) => k[1] === collection), {
      message: `the device copy holds ${collection}`,
    })
    .toBe(true);
}

/** The top-level heading of the page, like "Schedule" or "Load list". */
export function pageHeading(page: Page, name: string | RegExp) {
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

/** The toast region (sonner). */
export function toasts(page: Page): Locator {
  return page.getByRole('region', { name: /^Notifications/ });
}
