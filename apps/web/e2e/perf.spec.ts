// Performance budget checks (PLAN.md §13): the biggest lineup page in the seed world, the 2025
// Northwest Youth Championships' junior boys (44 entries over three days, with the girls' entries
// and every conflict computed for the whole regatta), must load and respond. §13's budgets are
// for a mid-range phone over 4G against the server (working set under 1.5 s, findings under
// 50 ms); in demo mode there is no network, so these checks time the browser's share and assert
// generous bounds that only a real regression would cross. Timings are logged and attached to
// the report as annotations.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
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

const NW_YOUTH = SEED_REGATTA_IDS.nwYouth2025;
const BOYS = SEED_TEAM_IDS.boys;

/** Bounds, in ms; generous on purpose (CI machines vary). */
const BUDGET = {
  desktop: { firstEntry: 6_000, allEntries: 8_000, seatEdit: 1_500, pack: 4_000 },
  // A phone with the CPU slowed four times, like a mid-range phone.
  phone: { firstEntry: 15_000, allEntries: 20_000 },
};

function record(info: TestInfo, name: string, ms: number) {
  const value = `${Math.round(ms)} ms`;
  info.annotations.push({ type: `timing: ${name}`, description: value });
  console.log(`[perf] ${info.project.name} ${info.title}: ${name} ${value}`);
}

/** ms since the page's navigation started, when `selector` has at least `count` matches. */
async function timeUntil(page: Page, selector: string, count: number): Promise<number> {
  await page.waitForFunction(
    ([sel, n]) => document.querySelectorAll(sel as string).length >= (n as number),
    [selector, count] as const,
    { timeout: 30_000, polling: 'raf' },
  );
  return page.evaluate(() => performance.now());
}

const ENTRY = '[data-lineup-entry]';

function boysEntryCount(): number {
  return seedWorld().entries.filter((e) => e.regattaId === NW_YOUTH && e.teamId === BOYS).length;
}

test.describe('desktop', () => {
  test.use(DESKTOP);

  test('the Northwest Youth boys lineup page loads, edits, and packs within budget', async ({
    page,
  }, info) => {
    const entries = boysEntryCount();
    expect(entries).toBe(44);
    await signInDemo(page, SEED_EMAILS.coachBoys);

    await page.goto(lineupsUrl(NW_YOUTH, BOYS));
    const first = await timeUntil(page, ENTRY, 1);
    const all = await timeUntil(page, ENTRY, entries);
    record(info, 'first entry', first);
    record(info, `all ${entries} entries`, all);
    await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
    await expect(page.getByRole('main').getByRole('article')).toHaveCount(entries);
    expect(first).toBeLessThan(BUDGET.desktop.firstEntry);
    expect(all).toBeLessThan(BUDGET.desktop.allEntries);

    // An edit on a final regatta asks once; then time a seat cleared to the seat shown empty,
    // which includes recomputing every finding of the regatta.
    const seat = page
      .getByRole('main')
      .getByRole('button', { name: /^Seat 1, (?!empty)/ })
      .first();
    await seat.focus();
    await page.keyboard.press('Delete');
    const confirm = page.getByRole('dialog', { name: 'Edit a final regatta?' });
    await confirm.getByRole('button', { name: 'Edit this regatta' }).click();
    const seat2 = page
      .getByRole('main')
      .getByRole('button', { name: /^Seat 2, (?!empty)/ })
      .first();
    const label = (await seat2.getAttribute('aria-label')) ?? '';
    const entryId = await seat2.evaluate(
      (el) => el.closest('[data-lineup-entry]')?.getAttribute('data-lineup-entry') ?? '',
    );
    await seat2.focus();
    const t0 = await page.evaluate(() => performance.now());
    await page.keyboard.press('Delete');
    await page.waitForFunction(
      ([id]) =>
        document
          .querySelector(`[data-lineup-entry="${id}"] [data-lineup-seat$=":2"]`)
          ?.getAttribute('aria-label')
          ?.startsWith('Seat 2, empty') ?? false,
      [entryId] as const,
      { polling: 'raf' },
    );
    const edit = (await page.evaluate(() => performance.now())) - t0;
    record(info, 'seat edit to screen', edit);
    expect(label).not.toMatch(/empty/);
    expect(edit).toBeLessThan(BUDGET.desktop.seatEdit);

    // Pack both trailers (the regatta's shells, about 25 boats), to the "Trailer packed" toast.
    await page.goto(regattaUrl(NW_YOUTH, 'trailer'));
    await expect(pageHeading(page, 'Trailer')).toBeVisible();
    const pack = page.getByRole('main').getByRole('button', { name: 'Pack both trailers' });
    await expect(pack).toBeEnabled();
    const p0 = Date.now();
    await pack.click();
    await expect(
      page
        .getByText('Trailer packed')
        .or(page.getByText(/Trailers packed/))
        .first(),
    ).toBeVisible();
    const packed = Date.now() - p0;
    record(info, 'pack both trailers', packed);
    expect(packed).toBeLessThan(BUDGET.desktop.pack);
  });
});

test.describe('phone', () => {
  test.use(PHONE);

  test('the Northwest Youth boys lineup page on a slowed phone', async ({ page }, info) => {
    const entries = boysEntryCount();
    await signInDemo(page, SEED_EMAILS.coachBoys);
    // Chromium only: slow the CPU four times, as Lighthouse does for a mid-range phone.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    await page.goto(lineupsUrl(NW_YOUTH, BOYS));
    const first = await timeUntil(page, ENTRY, 1);
    const all = await timeUntil(page, ENTRY, entries);
    record(info, 'first entry (4x CPU)', first);
    record(info, `all ${entries} entries (4x CPU)`, all);
    await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
    expect(first).toBeLessThan(BUDGET.phone.firstEntry);
    expect(all).toBeLessThan(BUDGET.phone.allEntries);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  });
});
