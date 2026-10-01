// Phase 1 demo (PLAN.md §12.1): two coaches build boys' and girls' lineups for a seeded regatta,
// pick the same shell, see the hot seat, acknowledge it, and print both sheets. Also: the roster
// crosses athletes off as they are boated, and marking a seated athlete unavailable is an error.
//
// The scenario runs on Tail of the Lake (seeded with events and no entries), so every count
// starts from zero. Head race timing (PLAN.md §9.2): a boat is busy until 20 minutes of racing
// and 15 of return after its start, so a second crew 55 minutes later has 20 minutes between the
// boat landing and its race: a hot seat (at least 15, under the 40 minute launch lead). No seeded
// race is 50 to 75 minutes after a boys' eight, so the girls' coach adds one.
//
// Demo mode keeps data in the browser context, so both coaches work in one context, signing out
// and in, as two coaches on one laptop would.

import { expect, test, type Page } from '@playwright/test';
import {
  accountButton,
  athleteName,
  DESKTOP,
  exact,
  lineupsUrl,
  PHONE,
  pageHeading,
  regattaUrl,
  SEED_EMAILS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  seededUnboated,
  signInDemo,
  signOut,
  teamAthletes,
  userName,
  waitForDeviceCopy,
} from './helpers';
import {
  addEntry,
  dragAndDrop,
  entryCard,
  eventSection,
  expectBoated,
  expectSeat,
  pickEquipment,
  seat,
  typeIntoFocusedSeat,
} from './lineups';

const TOTL = SEED_REGATTA_IDS.tailOfTheLake2026;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const BOYS = SEED_TEAM_IDS.boys;
const GIRLS = SEED_TEAM_IDS.girls;

const PLAN = 'Girls cox meets Boys V8 at dock B with the slings';

/** Seats of an eight from stroke down, the order the keyboard fills them in. */
const STROKE_DOWN = ['8', '7', '6', '5'];

/** Four boys who row (not coxswains), and one more for the drag. */
function boysCrew() {
  const rowers = teamAthletes(BOYS).filter((a) => a.side !== 'none');
  const names = rowers.map(athleteName);
  return { keyboard: names.slice(0, 4), dragged: names[4]!, total: teamAthletes(BOYS).length };
}

/** The conflicts panel in the inspector column (desktop), for the whole regatta. */
function conflictsPanel(page: Page) {
  return page
    .getByRole('complementary', { name: 'Conflicts and activity' })
    .getByRole('region', { name: /^Conflicts/ });
}

async function addEvent(
  page: Page,
  e: { number: string; name: string; boatClass: string; category: string; time: string },
) {
  await page.getByRole('main').getByRole('button', { name: 'Add event', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add event' });
  await dialog.getByRole('textbox', { name: 'Event number' }).fill(e.number);
  await dialog.getByRole('textbox', { name: 'Name' }).fill(e.name);
  await dialog.getByRole('combobox', { name: 'Boat class' }).click();
  await page.getByRole('option', { name: e.boatClass, exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Category' }).fill(e.category);
  await dialog.getByRole('textbox', { name: 'Time' }).fill(e.time);
  await dialog.getByRole('button', { name: 'Add event', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test.describe('desktop', () => {
  // Wide enough for the roster column and two columns of boats beside the inspector.
  test.use({ viewport: { width: 1600, height: 1000 } });

  test('two coaches, one shell, a hot seat acknowledged and printed on both sheets', async ({
    page,
  }) => {
    const crew = boysCrew();
    let boysLabel = '';
    let girlsLabel = '';

    await test.step("the boys' coach builds an eight by keyboard and by drag", async () => {
      await signInDemo(page, SEED_EMAILS.coachBoys);
      await page.goto(lineupsUrl(TOTL, BOYS));
      await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
      await expectBoated(page, 0, crew.total);

      await addEntry(page, "Event 9 · Men's Youth 8+ · 10:30");
      const section = eventSection(page, "Men's Youth 8+");
      const card = section.getByRole('article');
      await expect(card).toHaveCount(1);
      boysLabel = (await card.getAttribute('aria-label')) ?? '';
      expect(boysLabel).toBe('V8');
      await expect(card.getByRole('group', { name: /0 of 9 seats filled/ })).toBeVisible();

      // Keyboard: the boat reads cox, stroke, ... bow from the top, and the new entry's top
      // seat (the cox) has focus. Down to stroke; type a name and press Enter, and the seat
      // below takes focus.
      await expect(seat(card, 'cox')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      for (const [i, name] of crew.keyboard.entries()) {
        const n = STROKE_DOWN[i]!;
        await expect(seat(card, n)).toBeFocused();
        await typeIntoFocusedSeat(page, `Seat ${n}`, name);
        await expectSeat(card, n, name);
      }
      await expect(seat(card, '4')).toBeFocused();
      await expectBoated(page, 4, crew.total);

      // The roster crosses boated athletes off.
      const roster = page.getByRole('complementary', { name: 'Roster' });
      await expect(
        roster.getByRole('button', {
          name: exact(`${crew.keyboard[0]}, in 1 entry`, { prefix: true }),
        }),
      ).toBeVisible();

      // Drag from the roster onto an empty seat.
      const source = roster.getByRole('button', {
        name: exact(`${crew.dragged}, not in a boat`, { prefix: true }),
      });
      await dragAndDrop(page, source, seat(card, '4'));
      await expectSeat(card, '4', crew.dragged);
      await expectBoated(page, 5, crew.total);
      await expect(
        roster.getByRole('button', {
          name: exact(`${crew.dragged}, in 1 entry`, { prefix: true }),
        }),
      ).toBeVisible();

      // Drag one seat onto another that is taken: the overlay says "Swap", and they swap.
      await dragAndDrop(page, seat(card, '8'), seat(card, '7'), async () => {
        await expect(page.getByText('Swap', { exact: true })).toBeVisible();
      });
      await expectSeat(card, '8', crew.keyboard[1]!);
      await expectSeat(card, '7', crew.keyboard[0]!);
      await expectBoated(page, 5, crew.total);

      // Pick the shell.
      const peggy = await pickEquipment(page, card, 'Shell', 'Peggy', /^Peggy 8\+/);
      await peggy.click();
      await expect(card.getByRole('button', { name: 'Shell: Peggy' })).toBeVisible();
    });

    await test.step('marking a seated athlete unavailable makes it an error', async () => {
      const name = crew.keyboard[2]!;
      const card = entryCard(eventSection(page, "Men's Youth 8+"), boysLabel);
      const roster = page.getByRole('complementary', { name: 'Roster' });
      await expect(card.getByRole('button', { name: /error/ })).toHaveCount(0);

      // The roster's one-click toggle, for the whole regatta.
      await roster.getByRole('button', { name: `Mark ${name} unavailable` }).click();
      await expect(seat(card, '6')).toHaveAccessibleName(
        new RegExp(`^Seat 6, ${name}.*, has an error$`),
      );
      await card.getByRole('button', { name: '1 error' }).click();
      await expect(
        page.getByRole('dialog').getByText(new RegExp(`${name}.*unavailable`)),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      // Unavailable athletes leave the roster count and sit in their own group.
      await expectBoated(page, 4, crew.total - 1);
      await expect(roster.getByRole('button', { name: /^Unavailable/ })).toBeVisible();

      // Back to available: the error goes.
      await roster.getByRole('button', { name: `Mark ${name} available` }).click();
      await expect(seat(card, '6')).not.toHaveAccessibleName(/has an error/);
      await expect(card.getByRole('button', { name: /error/ })).toHaveCount(0);
      await expectBoated(page, 5, crew.total);
    });

    await test.step("the girls' coach adds a race 55 minutes later and picks the same shell", async () => {
      await signOut(page);
      await signInDemo(page, SEED_EMAILS.coachGirls);
      await expect(accountButton(page)).toHaveAccessibleName(
        `Account: ${userName(SEED_EMAILS.coachGirls)}`,
      );
      // A laptop at 1280 px: the inspector starts closed so three boats fit beside the roster.
      await page.setViewportSize({ width: 1280, height: 900 });

      await page.goto(regattaUrl(TOTL, 'schedule'));
      await expect(pageHeading(page, 'Schedule')).toBeVisible();
      await addEvent(page, {
        number: '15',
        name: "Women's U17 8+",
        boatClass: '8+',
        category: "Women's U17",
        time: '11:25',
      });
      await expect(
        page.getByRole('button', { name: "11:25, change time of Event 15 · Women's U17 8+" }),
      ).toBeVisible();

      await page.goto(lineupsUrl(TOTL, GIRLS));
      await expect(pageHeading(page, 'Junior girls lineups')).toBeVisible();
      await addEntry(page, "Event 15 · Women's U17 8+ · 11:25");
      const card = eventSection(page, "Women's U17 8+").getByRole('article');
      await expect(card).toHaveCount(1);
      girlsLabel = (await card.getAttribute('aria-label')) ?? '';

      // The shell picker warns before the pick.
      const peggy = await pickEquipment(page, card, 'Shell', 'Peggy', /^Peggy 8\+/);
      await expect(peggy).toContainText(/hot seat/i);
      await expect(peggy).toContainText(/Boys V8/);
      await peggy.click();
      await expect(card.getByRole('button', { name: 'Shell: Peggy' })).toBeVisible();
    });

    const hotSeat = new RegExp(
      `^Peggy is used by Boys V8 at 10:30 and also by Girls ${girlsLabel || '.+'} at 11:25; 20 minutes between the boat landing and the next race, less than the 40 minute launch lead\\.$`,
    );

    await test.step('the hot seat shows on the entry and in the conflicts panel', async () => {
      const card = entryCard(eventSection(page, "Women's U17 8+"), girlsLabel);
      await card.getByRole('button', { name: /warnings?$/ }).click();
      await expect(page.getByRole('dialog').getByText(hotSeat)).toBeVisible();
      await page.keyboard.press('Escape');

      await page
        .getByRole('navigation', { name: 'Regatta sections' })
        .getByRole('link', { name: 'Schedule' })
        .click();
      await expect(pageHeading(page, 'Schedule')).toBeVisible();
      const panel = conflictsPanel(page);
      const finding = panel.getByRole('listitem').filter({ has: page.getByText(hotSeat) });
      await expect(finding).toHaveAttribute('data-severity', 'warning');
      await expect(finding.getByRole('img', { name: 'Warning' })).toBeVisible();
      await expect(finding.getByRole('link', { name: 'Boys V8 at 10:30' })).toBeVisible();
      await expect(
        finding.getByRole('link', { name: `Girls ${girlsLabel} at 11:25` }),
      ).toBeVisible();

      await finding.getByRole('button', { name: 'Acknowledge hot seat' }).click();
      const dialog = page.getByRole('dialog', { name: 'Acknowledge hot seat' });
      // A plan is required.
      await dialog.getByRole('button', { name: 'Acknowledge hot seat' }).click();
      await expect(
        dialog.getByText('Write a short plan: who meets the boat, and where.'),
      ).toBeVisible();
      await dialog.getByRole('textbox', { name: 'Plan' }).fill(PLAN);
      await dialog.getByRole('button', { name: 'Acknowledge hot seat' }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByText('Hot seat acknowledged')).toBeVisible();

      // Acknowledged: a calm note with the plan, and "Edit plan" instead of acknowledging.
      await expect(finding).toHaveAttribute('data-severity', 'info');
      await expect(finding.getByRole('img', { name: 'Note' })).toBeVisible();
      await expect(finding).toContainText(`Plan: ${PLAN}`);
      await expect(finding.getByRole('button', { name: 'Edit plan' })).toBeVisible();
      await expect(
        panel
          .getByRole('heading', { name: /^Warnings/ })
          .locator('..')
          .getByText(hotSeat),
      ).toHaveCount(0);
    });

    await test.step('both entries show the plan', async () => {
      for (const [team, label, event] of [
        [GIRLS, girlsLabel, "Women's U17 8+"],
        [BOYS, boysLabel, "Men's Youth 8+"],
      ] as const) {
        await page.goto(lineupsUrl(TOTL, team));
        const card = entryCard(eventSection(page, event), label);
        await expect(card.getByText(PLAN)).toBeVisible();
        await card.getByRole('button', { name: `${label}, show entry details` }).click();
        const details = page.getByRole('complementary', { name: 'Entry details' });
        await expect(details.getByText('Hot seat acknowledged')).toBeVisible();
        await expect(details.getByText(PLAN)).toBeVisible();
      }
    });

    await test.step("both teams' lineup sheets print the plan", async () => {
      await page.getByRole('main').getByRole('link', { name: 'Print' }).click();
      await expect(pageHeading(page, 'Junior boys lineups')).toBeVisible();
      const boysSheet = page.getByRole('main');
      await expect(boysSheet.getByText('Live draft, not published yet')).toBeVisible();
      const boysEntry = boysSheet.getByRole('article', {
        name: new RegExp(`^${boysLabel}, 10:30`),
      });
      await expect(boysEntry).toContainText(`Hot seat: ${PLAN}`);
      await expect(boysEntry).toContainText('Peggy');

      // Switch the sheet to the girls' team from the print options.
      await page.getByRole('combobox', { name: 'Team' }).click();
      await page.getByRole('option', { name: 'Junior girls' }).click();
      await expect(pageHeading(page, 'Junior girls lineups')).toBeVisible();
      const girlsEntry = page
        .getByRole('main')
        .getByRole('article', { name: new RegExp(`^${girlsLabel}, 11:25`) });
      await expect(girlsEntry).toContainText(`Hot seat: ${PLAN}`);
      await expect(girlsEntry).toContainText('Peggy');
      await expect(page).toHaveURL(new RegExp(`/print/regattas/${TOTL}/lineups/${GIRLS}`));
    });
  });
});

test.describe('reload', () => {
  test.use(DESKTOP);

  // Regression: the device copy of the query cache (saved at most once a second) was restored
  // as fresh, so reloading right after an edit showed the lineup from before it for a minute.
  test('a reload right after an edit shows the edit', async ({ page }) => {
    await signInDemo(page, SEED_EMAILS.coachBoys);
    await page.goto(lineupsUrl(HOTL, BOYS));
    const card = entryCard(eventSection(page, "Men's Youth 4x"), 'V4x');
    await expect(seat(card, '1')).not.toHaveAccessibleName(/empty/);
    await waitForDeviceCopy(page, 'entry_seats');

    await seat(card, '1').focus();
    await page.keyboard.press('Delete');
    await expectSeat(card, '1', null);
    await page.reload();
    await expect(card).toBeVisible();
    await expectSeat(card, '1', null);
  });
});

test.describe('phone', () => {
  test.use(PHONE);

  test('fill a seat from the sheet and acknowledge a seeded hot seat at 390 px', async ({
    page,
  }) => {
    await signInDemo(page, SEED_EMAILS.coachGirls);
    await page.goto(lineupsUrl(HOTL, GIRLS));
    await expect(pageHeading(page, 'Junior girls lineups')).toBeVisible();

    // Seats are rows on a phone; tapping one opens a sheet of athletes.
    const newcomer = athleteName(seededUnboated(HOTL, GIRLS)[0]!);
    const roster = page.getByRole('region', { name: 'Roster' });
    const notInABoat = roster.getByRole('listitem').filter({ hasText: newcomer });
    await expect(notInABoat).toBeVisible();

    const card = entryCard(eventSection(page, "Women's Youth 4x"), 'V4x');
    await seat(card, '1').click();
    const sheet = page.getByRole('dialog', { name: 'Choose seat 1' });
    await sheet.getByRole('searchbox', { name: 'Search athletes' }).fill(newcomer);
    await sheet.getByRole('button', { name: new RegExp(`^${newcomer}`) }).click();
    await expect(sheet).toHaveCount(0);
    await expectSeat(card, '1', newcomer);
    // Boated now: off the "not in a boat yet" list.
    await expect(notInABoat).toHaveCount(0);

    // The regatta's conflicts, from the phone's regatta menu.
    await page
      .getByRole('navigation', { name: 'Regatta' })
      .getByRole('link', { name: 'Schedule' })
      .click();
    await expect(pageHeading(page, 'Schedule')).toBeVisible();
    await expect(
      page.getByRole('list', { name: "Entries in Event 1 · Men's Masters 1x" }).getByRole('link'),
    ).toHaveText(['Evening M1x']);
    await page.getByRole('button', { name: 'More regatta pages' }).click();
    await page.getByRole('menuitem', { name: 'Conflicts and activity' }).click();
    // The inspector slides over the page on a phone.
    const panel = page.getByRole('complementary', { name: 'Conflicts and activity' });
    const hendo = panel.getByRole('listitem').filter({ hasText: /^Hendo is used by Girls V8 B/ });
    await expect(hendo).toHaveAttribute('data-severity', 'warning');
    await hendo.getByRole('button', { name: 'Acknowledge hot seat' }).click();
    const dialog = page.getByRole('dialog', { name: 'Acknowledge hot seat' });
    await dialog.getByRole('textbox', { name: 'Plan' }).fill('5am crew meets Hendo at the dock');
    await dialog.getByRole('button', { name: 'Acknowledge hot seat' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(hendo).toHaveAttribute('data-severity', 'info');
    await expect(hendo).toContainText('Plan: 5am crew meets Hendo at the dock');
  });
});
