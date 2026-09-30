// Scratch script (not committed): screenshots of key pages in the demo build.
import { chromium } from '@playwright/test';
const OUT = process.argv[2];
const BASE = 'http://localhost:4455';
const pages = JSON.parse(process.argv[3]);
const browser = await chromium.launch({ channel: 'chrome' });
for (const theme of ['light', 'dark']) {
  for (const [w, h, tag] of [[1280, 860, 'desk'], [390, 844, 'phone']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
    const page = await ctx.newPage();
    await page.goto(BASE + '/sign-in');
    await page.getByRole('button', { name: /coach\.boys@srt\.local/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'));
    for (const [name, path] of pages) {
      await page.goto(BASE + path);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}-${tag}-${theme}.png`, fullPage: false });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('done');
