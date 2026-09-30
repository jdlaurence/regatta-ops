// Keyboard walkthrough (PLAN.md §1.3 "keyboard-first", §5.6, §13): the lineup builder's core
// path without a mouse, plus the dialogs, menus, pickers, inline edits, and the trailer's
// select-then-place path. Every step presses keys; nothing is clicked.
//
//   pnpm --filter @srt/web exec playwright test e2e/keyboard.spec.ts

import { expect, test, type Locator, type Page } from '@playwright/test';
import { DESKTOP, regattaUrl, SEED_TEAM_IDS } from './helpers';
import { HOTL, NW_YOUTH, settle, signInAs } from './quality';

test.use({ ...DESKTOP });

/** The element that has keyboard focus. */
function focused(page: Page): Locator {
  return page.locator(':focus');
}

/** Whether keyboard focus is inside the element matched by `selector`. */
function focusWithin(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => !!document.activeElement?.closest(sel), selector);
}

/** Focus a control the way a keyboard user would land on it, then check it took focus. */
async function focusOn(target: Locator) {
  await target.focus();
  await expect(target).toBeFocused();
}

/** The seat buttons of one entry card, bow to stroke (and the cox). */
function seat(card: Locator, n: number | 'cox') {
  return card.getByRole('button', { name: new RegExp(`^${n === 'cox' ? 'Cox' : `Seat ${n}`},`) });
}

test.describe('lineup builder', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto(regattaUrl(HOTL, `lineups/${SEED_TEAM_IDS.boys}`));
    await settle(page);
  });

  test('fill, swap, and clear seats, and use the pickers, from the keyboard', async ({ page }) => {
    // Add a double for a race: the dialog's picker, then Enter in the label submits.
    await focusOn(page.getByRole('button', { name: 'Add entry' }).first());
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add entry' });
    await expect(dialog).toBeVisible();
    await expect(focused(page)).toHaveAccessibleName(/^Event:/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Event' })).toBeVisible();
    await page.keyboard.type("Men's Youth 2x");
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('button', { name: /^Event: .*2x/ })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(focused(page)).toHaveAccessibleName('Label');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();

    // Focus lands on the new entry's first seat.
    await expect(focused(page)).toHaveAccessibleName('Seat 1, empty');
    const card = page.locator('article', { has: focused(page) });

    // Type to search, Enter to seat; focus moves on to the next seat.
    await page.keyboard.type('a');
    const picker = page.getByRole('combobox', { name: 'Search seat 1' });
    await expect(picker).toBeFocused();
    await expect(picker).toHaveValue('a');
    await page.keyboard.press('Enter');
    await expect(seat(card, 1)).not.toHaveAccessibleName('Seat 1, empty');
    await expect(seat(card, 2)).toBeFocused();
    const first = (await seat(card, 1).getAttribute('aria-label'))!.split(', ')[1]!;

    // Enter opens the list; arrows pick someone else; Enter seats them.
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Seat 2' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(seat(card, 2)).not.toHaveAccessibleName('Seat 2, empty');
    await expect(seat(card, 2)).toBeFocused();
    const second = (await seat(card, 2).getAttribute('aria-label'))!.split(', ')[1]!;
    expect(second).not.toBe(first);

    // Arrow keys move between seats.
    await page.keyboard.press('ArrowLeft');
    await expect(seat(card, 1)).toBeFocused();

    // Space picks up, Escape cancels.
    await page.keyboard.press(' ');
    await expect(page.getByText(`Moving ${first}.`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(`Moving ${first}.`)).toBeHidden();
    await expect(seat(card, 1)).toHaveAccessibleName(new RegExp(`^Seat 1, ${first}`));

    // Space, arrow, Space swaps the two.
    await page.keyboard.press(' ');
    await page.keyboard.press('ArrowRight');
    await expect(seat(card, 2)).toBeFocused();
    await page.keyboard.press(' ');
    await expect(seat(card, 1)).toHaveAccessibleName(new RegExp(`^Seat 1, ${second}`));
    await expect(seat(card, 2)).toHaveAccessibleName(new RegExp(`^Seat 2, ${first}`));

    // Delete clears.
    await focusOn(seat(card, 2));
    await page.keyboard.press('Delete');
    await expect(seat(card, 2)).toHaveAccessibleName('Seat 2, empty');

    // The shell picker: Enter opens, Escape closes, focus stays on the picker's button.
    const shell = card.getByRole('button', { name: /^Shell: / });
    await focusOn(shell);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Shell' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Shell' })).toBeHidden();
    await expect(shell).toBeFocused();
  });

  test('] toggles the inspector; entry details take focus and Escape brings it back', async ({
    page,
  }) => {
    const conflicts = page.getByRole('complementary', { name: 'Conflicts and activity' });
    // At 1280 px the builder needs the room, so the page starts with the column closed.
    await expect(conflicts).toBeHidden();
    await page.keyboard.press(']');
    await expect(conflicts).toBeVisible();
    await page.keyboard.press(']');
    await expect(conflicts).toBeHidden();

    const details = page.getByRole('button', { name: /, show entry details$/ }).first();
    await focusOn(details);
    await page.keyboard.press('Enter');
    const panel = page.getByRole('complementary', { name: 'Entry details' });
    await expect(panel).toBeVisible();
    await expect(panel).toBeFocused();
    await page.keyboard.press('Tab');
    expect(await focusWithin(page, 'aside')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(details).toBeFocused();
  });

  test('the entry menu opens, walks, and closes from the keyboard', async ({ page }) => {
    const more = page.getByRole('button', { name: /^More for / }).first();
    await focusOn(more);
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Entry details' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    expect(await focusWithin(page, '[role="menu"]')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();
  });
});

test.describe('dialogs', () => {
  test('keep focus inside, close with Escape, and hand focus back', async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto('/');
    await settle(page);
    const open = page.getByRole('button', { name: 'New regatta' });
    await focusOn(open);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'New regatta' });
    await expect(dialog).toBeVisible();
    // Focus starts on the first field, and thirty tabs go round the form without leaving it.
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeFocused();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      expect(await focusWithin(page, '[role="dialog"]')).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();
  });
});

test.describe('schedule', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto(regattaUrl(HOTL, 'schedule'));
    await settle(page);
  });

  test('edit a race time inline', async ({ page }) => {
    const time = page.getByRole('button', { name: /, change time of / }).first();
    const name = (await time.getAttribute('aria-label'))!.replace(/^.*, change time of /, '');
    await focusOn(time);
    await page.keyboard.press('Enter');
    await expect(page.locator(`input[aria-label="Time of ${name}"]`)).toBeFocused();
    // Escape leaves it as it was, focus back on the time.
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: `${await time.innerText()}, change time of ${name}` }),
    ).toBeFocused();

    await page.keyboard.press('Enter');
    await page.keyboard.type('0712A');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: `7:12, change time of ${name}` })).toBeFocused();
  });

  test('shift times from the dialog', async ({ page }) => {
    const shift = page.getByRole('button', { name: 'Shift times' });
    await focusOn(shift);
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Shift times' });
    await expect(dialog).toBeVisible();
    await focusOn(dialog.getByRole('spinbutton', { name: 'Minutes' }));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('20');
    const submit = dialog.getByRole('button', { name: /^Shift \d+ events?$/ });
    await expect(submit).toBeEnabled();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(shift).toBeFocused();
  });
});

test.describe('trailer', () => {
  test('select a boat, place it in a lane, and let go with Escape', async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto(regattaUrl(NW_YOUTH, 'trailer'));
    await settle(page);

    // A boat on the list to load: select it, then the lanes become buttons.
    const boat = page.getByRole('button', { name: /^Fowler, 4\+/ });
    await focusOn(boat);
    await page.keyboard.press('Enter');
    await expect(boat).toHaveAttribute('aria-pressed', 'true');
    const lanes = page.getByRole('button', { name: /^Move Fowler to / });
    await expect(lanes.first()).toBeVisible();

    // Escape lets go and focus stays on the boat.
    await page.keyboard.press('Escape');
    await expect(lanes).toHaveCount(0);
    await expect(boat).toBeFocused();

    // Select again and place it in a free lane that takes it.
    await page.keyboard.press('Enter');
    // A lane that takes it reads "Move Fowler to Level 1, ..." with no reason after it.
    const free = page.getByRole('button', { name: /^Move Fowler to Level 1[^.]*$/ }).first();
    await focusOn(free);
    await page.keyboard.press('Enter');
    // A final regatta asks once before the first edit.
    const confirm = page.getByRole('dialog');
    if (await confirm.isVisible()) {
      await page.keyboard.press('Enter');
      await expect(confirm).toBeHidden();
    }
    const placed = page.getByRole('button', { name: /^Level 1, .*Fowler, 4\+/ });
    await expect(placed).toBeVisible();
    await expect(placed).toBeFocused();
  });
});
