// Phone and tablet widths: no page scrolls sideways at 390 px or 820 px, and on a touch screen
// every control on the first screens of a page is a 44 px target.
//
//   pnpm --filter @regatta-ops/web exec playwright test e2e/responsive.spec.ts

import { expect, test, type Page } from '@playwright/test';
import { PHONE, regattaUrl, SEED_TEAM_IDS } from './helpers';
import { NW_YOUTH, openPage, PAGES, settle, signInAs } from './quality';

/**
 * Null when the page fits `width`; otherwise its scroll width and the elements that stick out
 * past the edge without a scrolling box to hold them, for a readable failure.
 */
async function sidewaysScroll(page: Page, width: number) {
  return page.evaluate((width) => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= width) return null;
    /** Whether a box that scrolls or clips holds the element (absolute ones: from their containing block up). */
    const held = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      let box: Element | null =
        style.position === 'absolute'
          ? el.offsetParent
          : style.position === 'fixed'
            ? null
            : el.parentElement;
      while (box && box !== document.body) {
        if (getComputedStyle(box).overflowX !== 'visible') return true;
        box = box.parentElement;
      }
      return style.position === 'fixed';
    };
    const culprits: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > width + 1 && !held(el)) {
        culprits.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 80)}">`);
      }
    }
    return { scrollWidth: doc.scrollWidth, culprits: culprits.slice(0, 6) };
  }, width);
}

for (const width of [390, 820]) {
  test.describe(`${width} px, no sideways scrolling`, () => {
    test.use({ viewport: { width, height: 844 } });
    for (const c of PAGES) {
      test(c.name, async ({ page }) => {
        test.fixme(!!c.fixme, c.fixme);
        await openPage(page, c);
        expect(await sidewaysScroll(page, width)).toBeNull();
      });
    }
  });
}

/**
 * Controls whose touch target is smaller than 44 × 44 px. From each control's center, walks
 * outward until a tap would land on something else, so hit areas drawn with ::before or
 * ::after count and a neighbor on top does not. Inline links inside a sentence are exempt
 * (WCAG 2.5.5), as is anything marked data-touch-exempt.
 */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SELECTOR = [
      'a[href]',
      'button',
      'input:not([type=hidden])',
      'select',
      'textarea',
      '[role=button]',
      '[role=tab]',
      '[role=combobox]',
      '[role=switch]',
      '[role=checkbox]',
      '[role=radio]',
      '[role=menuitem]',
    ].join(',');
    const out: string[] = [];
    const hits = (el: Element, x: number, y: number) => {
      const at = document.elementFromPoint(x, y);
      return !!at && (at === el || el.contains(at));
    };
    /** How far a tap can move from (x, y) along (dx, dy) and still land on the control. */
    const reach = (el: Element, x: number, y: number, dx: number, dy: number) => {
      let d = 0;
      while (d < 30 && hits(el, x + dx * (d + 1), y + dy * (d + 1))) d += 1;
      return d;
    };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // What is on screen now, with room for a 44 px target clear of the phone's fixed bars.
      const cy = r.top + r.height / 2;
      if (cy < 56 + 22 || cy > innerHeight - 64 - 22 || r.left < 0 || r.right > innerWidth) {
        continue;
      }
      if (el.closest('[aria-hidden="true"], .sr-only, [data-touch-exempt]')) continue;
      if (el.tagName === 'A' && el.parentElement?.tagName === 'P') continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (!hits(el, x, y)) continue; // covered by something else (a sheet, a sticky header)
      // Whole-pixel steps from a fractional center find 43 of a 44 px target's pixels.
      const wide = r.width >= 44 || reach(el, x, y, -1, 0) + reach(el, x, y, 1, 0) + 1 >= 43;
      const tall = reach(el, x, y, 0, -1) + reach(el, x, y, 0, 1) + 1 >= 43;
      if (!wide || !tall) {
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40);
        out.push(
          `${Math.round(r.width)}×${Math.round(r.height)} <${el.tagName.toLowerCase()}> "${name}"`,
        );
      }
    }
    return out;
  });
}

test.describe('390 px touch targets', () => {
  test.use({ ...PHONE });

  const phonePages = PAGES.filter(
    (c) =>
      !c.fixme &&
      !c.name.startsWith('print') &&
      !['component gallery', 'trailers admin, edit', 'fleet, shell drawer'].includes(c.name),
  );
  for (const c of phonePages) {
    test(c.name, async ({ page }) => {
      await openPage(page, c);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
      // The first two screens of the page.
      const found = new Set(await smallTargets(page));
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(100);
      for (const s of await smallTargets(page)) found.add(s);
      expect([...found]).toEqual([]);
    });
  }

  test('seat sheet and navigation sheet', async ({ page }) => {
    await signInAs(page, 'coach');
    await page.goto(regattaUrl(NW_YOUTH, `lineups/${SEED_TEAM_IDS.boys}`));
    await settle(page);
    await page
      .getByRole('button', { name: /^Seat \d/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
    await page.keyboard.press('Escape');

    await page.goto('/teams');
    await settle(page);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });
});
