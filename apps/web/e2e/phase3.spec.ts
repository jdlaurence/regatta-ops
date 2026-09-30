// Phase 3 demo (PLAN.md §12.1): "Parents open a share link on race day; the loading crew ticks
// the checklist on phones." A coach makes a share link on the regatta overview; a phone with
// nobody signed in opens it and sees the published lineups; the checklist link ticks items,
// keeps ticking with no connection ("changes waiting to sync"), and syncs when it comes back.
//
// The 2025 Northwest Youth Championships has published boys' lineups (girls' unpublished) and
// a seeded load list. Demo mode has no server: a link lives in the browser that made it, so the
// phone's fresh context starts from the coach's demo data (local storage) without the session.
// The PocketBase suite (e2e/pb) opens a link in a truly separate browser.

import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  accountButton,
  athleteName,
  DESKTOP,
  lineupsUrl,
  pageHeading,
  PHONE,
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  seedWorld,
  signInDemo,
} from './helpers';
import { entryCard, eventSection, expectSeat, seat } from './lineups';

const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const GIRLS = SEED_TEAM_IDS.girls;
const NW_NAME = '2025 USRowing Northwest Youth Championships';
const DEMO_DATA_KEY = 'srt-demo-v1';

test.use(DESKTOP);

/**
 * Make a share link on a regatta's overview (Share dialog); returns its path (/share/<token>).
 * `team` is the team's name for a team-only link; leave it out for the whole regatta.
 */
async function createShareLink(
  page: Page,
  {
    regattaId = NW_YOUTH,
    team,
    canCheckLoad,
  }: { regattaId?: string; team?: string; canCheckLoad: boolean },
) {
  await page.goto(regattaUrl(regattaId));
  await expect(pageHeading(page, 'Overview')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Share' }).click();
  const dialog = page.getByRole('dialog', { name: 'Share links' });
  await expect(dialog.getByRole('heading', { name: 'No share links yet' })).toBeVisible();
  const scope = dialog.getByRole('combobox', { name: 'Shows' });
  await expect(scope).toHaveText('Whole regatta, every team');
  if (team) {
    await scope.click();
    await page.getByRole('option', { name: `${team} only` }).click();
    await expect(scope).toHaveText(`${team} only`);
  }
  if (canCheckLoad) await dialog.getByLabel('Loading crew can tick the load list').check();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(page.getByText('Link created')).toBeVisible();

  const links = dialog
    .getByRole('region', { name: 'Links for this regatta' })
    .getByRole('listitem');
  await expect(links).toHaveCount(1);
  await expect(links.first()).toContainText(team ?? 'Whole regatta');
  if (canCheckLoad) await expect(links.first()).toContainText('Can tick the load list');
  else await expect(links.first()).not.toContainText('Can tick the load list');
  const address = await links.first().getByRole('textbox', { name: 'Link address' }).inputValue();
  const url = new URL(address);
  expect(url.pathname).toMatch(/^\/share\/[A-Za-z0-9]{40}$/);
  await expect(links.first().getByRole('link', { name: 'Open' })).toHaveAttribute(
    'href',
    url.pathname,
  );
  await page.keyboard.press('Escape');
  return url.pathname;
}

/**
 * A phone nobody is signed in on, holding the coach's demo data (see the header comment): the
 * demo world from local storage, and not the session. Waits for the demo store's save (it is
 * debounced) to include the link.
 */
async function phoneWithDemoData(browser: Browser, coach: Page, path: string) {
  const token = path.split('/').pop()!;
  await expect
    .poll(() => coach.evaluate((key) => localStorage.getItem(key) ?? '', DEMO_DATA_KEY))
    .toContain(token);
  const state = await coach.context().storageState();
  const origins = state.origins.map((o) => ({
    ...o,
    localStorage: o.localStorage.filter((e) => e.name === DEMO_DATA_KEY),
  }));
  return browser.newContext({ ...PHONE, storageState: { cookies: [], origins } });
}

test('parents open a share link on a phone and the loading crew ticks the checklist offline', async ({
  page,
  browser,
}) => {
  await signInDemo(page, SEED_EMAILS.coachBoys);
  const path = await createShareLink(page, { canCheckLoad: true });

  const phoneContext = await phoneWithDemoData(browser, page, path);
  const phone = await phoneContext.newPage();

  await test.step('the share page shows the published lineups without signing in', async () => {
    await phone.goto(path);
    await expect(phone.getByRole('heading', { level: 1, name: NW_NAME })).toBeVisible();
    await expect(phone).toHaveURL(new RegExp(`${path}$`));
    await expect(accountButton(phone)).toHaveCount(0);
    const published = phone.getByRole('list', { name: 'Published lineups' });
    await expect(published.getByRole('listitem').filter({ hasText: 'Junior boys' })).toContainText(
      'Published',
    );
    await expect(published.getByRole('listitem').filter({ hasText: 'Junior girls' })).toContainText(
      'Lineups not published yet',
    );
    // A published crew, cox then stroke down to bow, as the club's sheets read.
    const crew = phone.getByRole('list', { name: 'V8 crew' }).first();
    await expect(crew.getByRole('listitem')).toHaveCount(9);
    await expect(crew.getByRole('listitem').first()).toContainText(/^Cox\s*[A-Z]/);
    await expect(crew.getByRole('listitem').nth(1)).toContainText(/^Stroke\s*[A-Z]/);
    await expect(crew.getByRole('listitem').last()).toContainText(/^Bow\s*[A-Z]/);
    // Other days are a tap away.
    await phone.getByRole('radio', { name: 'Sat, May 17' }).click();
    await expect(phone.getByRole('heading', { level: 3, name: 'Sat, May 17' })).toBeVisible();
  });

  const list = phone.getByRole('region', { name: 'Load list' });
  const box = (field: 'Loaded' | 'Returned', item: string) =>
    list.getByRole('checkbox', { name: `${field}: ${item}` });
  const status = list.getByRole('status');

  await test.step('the loading crew ticks items', async () => {
    await phone
      .getByRole('navigation', { name: 'Share page' })
      .getByRole('link', { name: 'Load list' })
      .click();
    await expect(list.getByRole('heading', { name: 'Load list' })).toBeVisible();
    await expect(list).toContainText('6 of 8 loaded · 2 returned');
    await list.getByRole('textbox', { name: 'Your name' }).fill('Sam');

    await expect(box('Loaded', 'Cox boxes')).not.toBeChecked();
    await box('Loaded', 'Cox boxes').click();
    await expect(box('Loaded', 'Cox boxes')).toBeChecked();
    await expect(box('Loaded', 'Cox boxes')).toContainText('Sam');
    await expect(list).toContainText('7 of 8 loaded · 2 returned');
    await expect(status).toHaveText('');
  });

  await test.step('with no connection, ticks wait on the phone', async () => {
    await phoneContext.setOffline(true);
    await expect(status).toContainText(
      'Offline. Ticks stay on this device and sync when the connection is back.',
    );
    await box('Returned', 'Cox boxes').click();
    await box('Returned', 'Live.Laugh.Love (LLL)').click();
    await expect(box('Returned', 'Cox boxes')).toBeChecked();
    await expect(box('Returned', 'Live.Laugh.Love (LLL)')).toBeChecked();
    await expect(status).toContainText('Offline. 2 changes waiting to sync.');
    await expect(list.getByText('Waiting to sync', { exact: true })).toHaveCount(2);
    await expect(list).toContainText('7 of 8 loaded · 4 returned');
  });

  await test.step('back online, the ticks sync', async () => {
    await phoneContext.setOffline(false);
    await expect(status).toHaveText('', { timeout: 10_000 });
    await expect(list.getByText('Waiting to sync', { exact: true })).toHaveCount(0);
    await expect(box('Returned', 'Cox boxes')).toBeChecked();
    await expect(box('Returned', 'Cox boxes')).toContainText('Sam');
    await expect(box('Returned', 'Live.Laugh.Love (LLL)')).toBeChecked();

    // They are saved, not just on screen.
    await phone.reload();
    await expect(list).toContainText('7 of 8 loaded · 4 returned');
    await expect(box('Returned', 'Live.Laugh.Love (LLL)')).toContainText('Sam');
  });

  await phoneContext.close();
});

test("a team's link shows what was published, not the draft, and no load list", async ({
  page,
  browser,
}) => {
  const w = seedWorld();
  const v1x = w.entries.find(
    (e) => e.regattaId === HOTL && e.teamId === GIRLS && e.label === 'V1x',
  )!;
  const sculler = w.athletes.find(
    (a) => a.id === w.entry_seats.find((s) => s.entryId === v1x.id && s.seat === '1')!.athleteId,
  )!;
  const name = athleteName(sculler);

  await signInDemo(page, SEED_EMAILS.coachGirls);
  await page.goto(lineupsUrl(HOTL, GIRLS));
  await expect(pageHeading(page, 'Junior girls lineups')).toBeVisible();
  const header = page.getByRole('main');
  await expect(header.getByText('Not published yet')).toBeVisible();
  await header.getByRole('button', { name: 'Publish lineups' }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish lineups' });
  await expect(dialog).toContainText('This publishes 8 entries for Junior girls.');
  await dialog.getByRole('button', { name: 'Publish lineups' }).click();
  await expect(page.getByText('Lineups published')).toBeVisible();
  await expect(header.getByText(/^Published/)).toBeVisible();

  // Keep editing the draft: empty the single's seat. The published copy keeps the sculler.
  const card = entryCard(eventSection(page, "Women's Youth 1x"), 'V1x');
  await expectSeat(card, '1', name);
  await seat(card, '1').focus();
  await page.keyboard.press('Delete');
  await expectSeat(card, '1', null);
  await expect(header.getByText('1 change since')).toBeVisible();

  const path = await createShareLink(page, {
    regattaId: HOTL,
    team: 'Junior girls',
    canCheckLoad: false,
  });
  const phoneContext = await phoneWithDemoData(browser, page, path);
  const phone = await phoneContext.newPage();
  await phone.goto(path);
  await expect(phone.getByRole('heading', { level: 1, name: 'Head of the Lake' })).toBeVisible();
  const published = phone.getByRole('list', { name: 'Published lineups' });
  await expect(published.getByRole('listitem')).toHaveCount(1);
  await expect(published.getByRole('listitem')).toContainText(/^Junior girls\s*Published/);
  await expect(phone.getByRole('list', { name: 'V1x crew' })).toContainText(name);
  // Other teams' entries and the load list stay off a girls-only link without the checklist.
  await expect(phone.getByText(/^Boys /)).toHaveCount(0);
  await expect(phone.getByRole('link', { name: 'Load list' })).toHaveCount(0);
  await expect(phone.getByRole('checkbox')).toHaveCount(0);
  await phoneContext.close();
});
