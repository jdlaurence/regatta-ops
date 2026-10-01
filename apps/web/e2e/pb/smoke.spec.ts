// The PocketBase smoke suite (PLAN.md §13): the production build served by a real PocketBase with
// the seed world (e2e/pb/server.ts). Email and password sign-in, the schedule and its conflicts
// from the server, a seat edit that persists and reaches another coach live, a viewer who cannot
// edit, and a public share link opened in a separate browser, ticked offline and synced. One
// database for the run: the tests take turns and touch different records.

import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import {
  accountButton,
  athleteName,
  DESKTOP,
  expectNoEditControls,
  lineupsUrl,
  pageHeading,
  PHONE,
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  seedWorld,
  signInWithPassword,
  userName,
} from '../helpers';
import { entryCard, eventSection, expectSeat, seat, typeIntoFocusedSeat } from '../lineups';

const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const BOYS = SEED_TEAM_IDS.boys;
/** A seeded load list line on the Northwest Youth Championships, not ticked in the seed. */
const ITEM = 'Aluminum boat rack';

/** "7 of 8 loaded" on the share page's checklist, as a number. */
async function loadedCount(list: Locator): Promise<number> {
  const text = (await list.textContent()) ?? '';
  const m = /(\d+) of \d+ loaded/.exec(text);
  if (!m) throw new Error(`No loaded count in "${text.slice(0, 80)}"`);
  return Number(m[1]);
}

test.use(DESKTOP);

/** A signed-in page in its own browser context (its own session and device copy). */
async function coachPage(browser: Browser, email: string, next = '/'): Promise<Page> {
  const context = await browser.newContext(DESKTOP);
  const page = await context.newPage();
  await signInWithPassword(page, email, { next });
  return page;
}

test('sign in with email and password; a wrong password is refused', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/sign-in');
  await expect(pageHeading(page, 'Sign in')).toBeVisible();
  // The server build has no demo account list, and offers Google.
  await expect(page.getByRole('region', { name: 'Demo accounts' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();

  await page.getByLabel('Email').fill(SEED_EMAILS.coachBoys);
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);

  await signInWithPassword(page, SEED_EMAILS.coachBoys);
  await expect(pageHeading(page, 'Regattas')).toBeVisible();
  await expect(accountButton(page)).toHaveAccessibleName(
    `Account: ${userName(SEED_EMAILS.coachBoys)}`,
  );
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: /^Tail of the Lake/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^Head of the Lake/ })).toBeVisible();

  // The session survives a reload (PocketBase's token in local storage).
  await page.reload();
  await expect(pageHeading(page, 'Regattas')).toBeVisible();
});

test('the schedule and its conflicts load from the server', async ({ page }) => {
  await signInWithPassword(page, SEED_EMAILS.coachGirls, { next: regattaUrl(HOTL, 'schedule') });
  await expect(pageHeading(page, 'Schedule')).toBeVisible();
  await expect(page.getByRole('main').getByText('22 races · 24 entries')).toBeVisible();
  await expect(
    page.getByRole('list', { name: "Entries in Event 1 · Men's Masters 1x" }).getByRole('link'),
  ).toHaveText(['Evening M1x']);

  // The conflict engine runs in the browser on the server's data (the seeded findings).
  const panel = page
    .getByRole('complementary', { name: 'Conflicts and activity' })
    .getByRole('region', { name: /^Conflicts/ });
  await expect(
    panel.getByRole('listitem').filter({ has: page.getByText(/^Kokanee is used by Boys V4\+/) }),
  ).toHaveAttribute('data-severity', 'error');
  await expect(
    panel.getByRole('listitem').filter({ has: page.getByText(/^Hendo is used by Girls V8 B/) }),
  ).toHaveAttribute('data-severity', 'warning');
});

test('a seat edit persists after a reload and reaches another coach live', async ({
  page,
  browser,
}) => {
  const w = seedWorld();
  const v4x = w.entries.find(
    (e) => e.regattaId === HOTL && e.teamId === BOYS && e.label === 'V4x',
  )!;
  const sculler = w.athletes.find(
    (a) => a.id === w.entry_seats.find((s) => s.entryId === v4x.id && s.seat === '2')!.athleteId,
  )!;
  const name = athleteName(sculler);

  await signInWithPassword(page, SEED_EMAILS.coachBoys, { next: lineupsUrl(HOTL, BOYS) });
  await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
  const card = entryCard(eventSection(page, "Men's Youth 4x"), 'V4x');
  await expectSeat(card, '2', name);

  // A second coach has the same page open.
  const other = await coachPage(browser, SEED_EMAILS.admin, lineupsUrl(HOTL, BOYS));
  const otherCard = entryCard(eventSection(other, "Men's Youth 4x"), 'V4x');
  await expectSeat(otherCard, '2', name);

  // Clear the seat: it stays cleared after a reload, and the other coach sees it change.
  await seat(card, '2').focus();
  await page.keyboard.press('Delete');
  await expectSeat(card, '2', null);
  await expectSeat(otherCard, '2', null);
  await page.reload();
  await expectSeat(card, '2', null);

  // Put the sculler back from the keyboard; the same again.
  await seat(card, '2').focus();
  await typeIntoFocusedSeat(page, 'Seat 2', name);
  await expectSeat(card, '2', name);
  await expectSeat(otherCard, '2', name);
  await page.reload();
  await expectSeat(card, '2', name);

  // The server logged who did it.
  await page.goto(regattaUrl(HOTL));
  await expect(
    page
      .getByRole('main')
      .getByText(new RegExp(`${userName(SEED_EMAILS.coachBoys)}.*seat 2 of Boys V4x`))
      .first(),
  ).toBeVisible();
  await other.context().close();
});

test('a viewer reads everything and edits nothing', async ({ page }) => {
  await signInWithPassword(page, SEED_EMAILS.viewer, { next: lineupsUrl(HOTL, BOYS) });
  await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
  const card = entryCard(eventSection(page, "Men's Youth 4x"), 'V4x');
  await expect(card).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Add entry' })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Shell: / })).toHaveCount(0);
  await expect(card.getByRole('button', { name: /^Seat \d/ })).toHaveCount(0);
  await expectNoEditControls(page);

  await page.goto(regattaUrl(HOTL, 'schedule'));
  await expect(pageHeading(page, 'Schedule')).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('list', { name: 'Races and logistics' }),
  ).toBeVisible();
  await expectNoEditControls(page);

  // No share links, duplicating, or settings on the overview either.
  await page.goto(regattaUrl(HOTL));
  await expect(pageHeading(page, 'Overview')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'Share' })).toHaveCount(0);
  await expectNoEditControls(page);
});

test('a packed trailer is saved on the server', async ({ page }) => {
  await signInWithPassword(page, SEED_EMAILS.coachGirls, {
    next: regattaUrl(HOTL, `trailer/${SEED_TRAILER_IDS.girls}`),
  });
  await expect(pageHeading(page, 'Trailer')).toBeVisible();
  const main = page.getByRole('main');
  // Packing starts the load plan (a reused server may already have it from an earlier run).
  await main.getByRole('button', { name: 'Auto pack trailer', exact: true }).click();
  await expect(page.getByText('Trailer packed').first()).toBeVisible();
  const summary = main.getByText(/^Girls trailer · \d+ boats · Packed /);
  await expect(summary).toBeVisible();
  const text = await summary.textContent();
  const boats = page
    .getByRole('group', { name: /end view/ })
    .getByRole('button', { name: /^Level \d/ });
  const count = await boats.count();
  expect(count).toBeGreaterThan(0);

  await page.reload();
  await expect(main.getByText(text!)).toBeVisible();
  await expect(boats).toHaveCount(count);
});

test('a share link opens in a separate browser, and its checklist syncs after going offline', async ({
  page,
  browser,
}) => {
  await signInWithPassword(page, SEED_EMAILS.coachBoys, { next: regattaUrl(NW_YOUTH) });
  await expect(pageHeading(page, 'Overview')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await dialog.getByLabel('Loading crew can tick the load list').check();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Link created')).toBeVisible();
  const address = await dialog
    .getByRole('region', { name: 'Links for this regatta' })
    .getByRole('textbox', { name: 'Link address' })
    .first()
    .inputValue();
  const path = new URL(address).pathname;
  expect(path).toMatch(/^\/share\/[A-Za-z0-9]{40}$/);

  // A phone that has never seen Regatta Ops: no session, no data on the device.
  const phoneContext = await browser.newContext(PHONE);
  const phone = await phoneContext.newPage();
  await phone.goto(path);
  await expect(
    phone.getByRole('heading', { level: 1, name: '2025 USRowing Northwest Youth Championships' }),
  ).toBeVisible();
  await expect(accountButton(phone)).toHaveCount(0);
  const published = phone.getByRole('list', { name: 'Published lineups' });
  await expect(published.getByRole('listitem').filter({ hasText: 'Junior boys' })).toContainText(
    'Published',
  );
  await expect(
    phone.getByRole('list', { name: 'V8 crew' }).first().getByRole('listitem'),
  ).toHaveCount(9);

  await phone
    .getByRole('navigation', { name: 'Share page' })
    .getByRole('link', { name: 'Load list' })
    .click();
  const list = phone.getByRole('region', { name: 'Load list' });
  const box = (field: 'Loaded' | 'Returned') =>
    list.getByRole('checkbox', { name: `${field}: ${ITEM}` });
  await expect(list).toContainText(/\d+ of 8 loaded/);
  // Start with both boxes empty, so a rerun against a reused server does the same.
  for (const field of ['Loaded', 'Returned'] as const) {
    if (await box(field).isChecked()) {
      await box(field).click();
      await expect(box(field)).not.toBeChecked();
    }
  }
  const before = await loadedCount(list);

  await list.getByRole('textbox', { name: 'Your name' }).fill('Sam');
  await box('Loaded').click();
  await expect(box('Loaded')).toBeChecked();
  await expect(box('Loaded')).toContainText('Sam');
  await expect.poll(() => loadedCount(list)).toBe(before + 1);

  await phoneContext.setOffline(true);
  await box('Returned').click();
  await expect(box('Returned')).toBeChecked();
  await expect(list.getByRole('status')).toContainText('Offline. 1 change waiting to sync.');
  await expect(list.getByText('Waiting to sync', { exact: true })).toHaveCount(1);
  await phoneContext.setOffline(false);
  await expect(list.getByRole('status')).toHaveText('', { timeout: 15_000 });
  await expect(list.getByText('Waiting to sync', { exact: true })).toHaveCount(0);

  // Another fresh browser reads both ticks from the server.
  const checkContext = await browser.newContext(PHONE);
  const check = await checkContext.newPage();
  await check.goto(`${path}/load`);
  const checkList = check.getByRole('region', { name: 'Load list' });
  const checkBox = (field: 'Loaded' | 'Returned') =>
    checkList.getByRole('checkbox', { name: `${field}: ${ITEM}` });
  await expect(checkBox('Loaded')).toBeChecked();
  await expect(checkBox('Loaded')).toContainText('Sam');
  await expect(checkBox('Returned')).toBeChecked();
  await expect(checkBox('Returned')).toContainText('Sam');
  expect(await loadedCount(checkList)).toBe(before + 1);

  // Revoking the link (the coach's dialog is still open) shuts it for everyone.
  await dialog.getByRole('button', { name: 'Revoke' }).first().click();
  await dialog
    .getByRole('group', { name: 'Revoke link' })
    .getByRole('button', { name: 'Revoke link' })
    .click();
  await expect(page.getByText('Link revoked')).toBeVisible();
  await check.reload();
  await expect(check.getByRole('heading', { name: 'This link is no longer active' })).toBeVisible();

  await phoneContext.close();
  await checkContext.close();
});
