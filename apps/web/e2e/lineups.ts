// Page helpers for the lineup builder (features/lineups), shared by the demo and PocketBase flows.

import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegExp, exact } from './helpers';

/** The roster's "N of M boated" count, as numbers. */
export async function boatedCount(page: Page): Promise<{ boated: number; total: number }> {
  const text = await page
    .getByRole('main')
    .getByRole('paragraph')
    .filter({ hasText: /^\d+\s*of\s*\d+\s*boated$/ })
    .first()
    .textContent();
  const m = /(\d+)\s*of\s*(\d+)/.exec(text ?? '');
  if (!m) throw new Error(`No boated count in "${text}"`);
  return { boated: Number(m[1]), total: Number(m[2]) };
}

/** Expect the roster to read "N of M boated". */
export async function expectBoated(page: Page, boated: number, total: number) {
  await expect
    .poll(async () => boatedCount(page), { message: `roster reads ${boated} of ${total} boated` })
    .toEqual({ boated, total });
}

/** The section for one event, named after the race ("Men's Youth 8+"). */
export function eventSection(page: Page, eventName: string): Locator {
  return page.getByRole('main').getByRole('region', { name: eventName, exact: true });
}

/** An entry's card, by its label ("V8", "U17 8"). */
export function entryCard(scope: Page | Locator, label: string): Locator {
  return scope.getByRole('article', { name: label, exact: true });
}

/** A seat in an entry, by seat ("1".."8", "cox"). Its name reads "Seat 3, Name, port, ...". */
export function seat(card: Locator, which: string): Locator {
  const prefix = which === 'cox' ? 'Cox' : `Seat ${which}`;
  return card.getByRole('button', { name: new RegExp(`^${prefix},`) });
}

/** Expect a seat to hold this athlete (or to be empty with `null`). */
export async function expectSeat(card: Locator, which: string, name: string | null) {
  const prefix = which === 'cox' ? 'Cox' : `Seat ${which}`;
  await expect(seat(card, which)).toHaveAccessibleName(
    new RegExp(`^${escapeRegExp(prefix)}, ${name ? escapeRegExp(name) : 'empty'}(,|$)`),
  );
}

/**
 * Fill the focused seat from the keyboard: type the first letter on the seat (it opens the
 * seat's athlete list with that letter searched), finish the name, press Enter. The builder
 * then focuses the next seat.
 */
export async function typeIntoFocusedSeat(page: Page, seatLabel: string, name: string) {
  await page.keyboard.press(name[0]!);
  const search = page.getByRole('combobox', { name: `Search ${seatLabel.toLowerCase()}` });
  await expect(search).toBeFocused();
  await expect(search).toHaveValue(name[0]!);
  await search.pressSequentially(name.slice(1));
  const list = page.getByRole('listbox', { name: seatLabel });
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option').first()).toContainText(name);
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
}

/**
 * Drag with the mouse the way dnd-kit expects: press, move past its activation distance (5 or
 * 6 px), then glide to the target in steps and release. The target is measured again once the
 * drag has started, because dnd-kit scrolls the page when the pointer starts near an edge.
 * `during` runs while hovering over the target.
 */
export async function dragAndDrop(
  page: Page,
  source: Locator,
  target: Locator,
  during?: () => Promise<void>,
) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error('Drag source is not visible');
  const fx = from.x + from.width / 2;
  const fy = from.y + from.height / 2;
  await page.mouse.move(fx, fy);
  await page.mouse.down();
  await page.mouse.move(fx + 12, fy + 6, { steps: 4 });
  let to = await target.boundingBox();
  for (let pass = 0; pass < 3 && to; pass++) {
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    const again = await target.boundingBox();
    if (again && Math.abs(again.x - to.x) < 2 && Math.abs(again.y - to.y) < 2) break;
    to = again;
  }
  if (!to) throw new Error('Drag target is not visible');
  await during?.();
  await page.mouse.up();
}

/** Pick equipment in an entry's shell or oar picker by searching for it. */
export async function pickEquipment(
  page: Page,
  card: Locator,
  kind: 'Shell' | 'Oars',
  search: string,
  optionName: RegExp,
): Promise<Locator> {
  await card.getByRole('button', { name: new RegExp(`^${kind}: `) }).click();
  const list = page.getByRole('listbox', { name: kind });
  await page.getByRole('combobox', { name: `Search ${kind.toLowerCase()}` }).fill(search);
  const option = list.getByRole('option', { name: optionName });
  await expect(option).toBeVisible();
  return option;
}

/** "Add entry" at the top of the builder, for an event picked in the dialog. */
export async function addEntry(page: Page, eventOption: string | RegExp) {
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Add entry', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Add entry' });
  await dialog.getByRole('button', { name: /^Event: / }).click();
  await page
    .getByRole('listbox', { name: 'Event' })
    .getByRole('option', {
      name: typeof eventOption === 'string' ? exact(eventOption) : eventOption,
    })
    .click();
  await dialog.getByRole('button', { name: 'Add entry', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
