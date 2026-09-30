// Draws the app icons into public/ (PLAN.md §7.1: installable PWA). Run after changing the
// mark or the accent token, and commit the output:
//
//   pnpm --filter @srt/web icons
//
// The mark is the Logo component's hull (app/shell/Logo.tsx): a shell seen from above, pointed
// bow left, seat lines, the cox circle at the stern, in white on lake teal. Colors come from
// tokens.css. The PNGs are rendered by the Playwright browser the e2e suite already uses, so
// no image library is needed.

import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';
import { tokenColor } from './tokens.js';

const PUBLIC = (file: string) => fileURLToPath(new URL(`../public/${file}`, import.meta.url));

const ACCENT = tokenColor('--accent');
const ON_ACCENT = tokenColor('--accent-ink');

// The Logo's hull in its 36 × 14 box; its outline spans x 0.6–35 and y 2–12.
const HULL = 'M0.6 7 C6 3 10 2 15 2 H30 a5 5 0 0 1 0 10 H15 C10 12 6 11 0.6 7 Z';
const SEATS = 'M17.5 3.5 V10.5 M21.5 3.5 V10.5 M25.5 3.5 V10.5';
const HULL_CENTER = { x: (0.6 + 35) / 2, y: 7 };
const HULL_WIDTH = 35 - 0.6;

interface IconSpec {
  /** Hull length as a share of the icon's width. */
  hull: number;
  /** Rounded tile (for "any" icons) or a full-bleed square (maskable, Apple touch). */
  tile: 'rounded' | 'square';
}

/** The icon on a 512 × 512 canvas. */
function iconSvg({ hull, tile }: IconSpec): string {
  const scale = (512 * hull) / HULL_WIDTH;
  const tx = 256 - HULL_CENTER.x * scale;
  const ty = 256 - HULL_CENTER.y * scale;
  const background =
    tile === 'rounded'
      ? `<rect width="512" height="512" rx="112" fill="${ACCENT}"/>`
      : `<rect width="512" height="512" fill="${ACCENT}"/>`;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    background,
    `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">`,
    `<path d="${HULL}" fill="${ON_ACCENT}"/>`,
    `<path d="${SEATS}" stroke="${ACCENT}" stroke-width="1" fill="none"/>`,
    `<circle cx="30" cy="7" r="2" fill="${ACCENT}"/>`,
    '</g>',
    '</svg>',
  ].join('');
}

// Maskable icons keep the mark inside the central 80% circle; the bow tip sits at 0.5 × hull
// from the center, so a hull of 0.64 leaves margin to spare.
const ANY: IconSpec = { hull: 0.78, tile: 'rounded' };
const FULL_BLEED: IconSpec = { hull: 0.64, tile: 'square' };

const PNGS: { file: string; size: number; spec: IconSpec }[] = [
  { file: 'pwa-192x192.png', size: 192, spec: ANY },
  { file: 'pwa-512x512.png', size: 512, spec: ANY },
  { file: 'pwa-maskable-512x512.png', size: 512, spec: FULL_BLEED },
  // iOS rounds the corners itself and shows transparency as black.
  { file: 'apple-touch-icon.png', size: 180, spec: { hull: 0.7, tile: 'square' } },
];

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Playwright's own Chromium is not installed: use the system Chrome.
    return chromium.launch({ channel: 'chrome' });
  }
}

async function main() {
  writeFileSync(PUBLIC('pwa-icon.svg'), `${iconSvg(ANY)}\n`);
  const browser = await launch();
  try {
    for (const { file, size, spec } of PNGS) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      const svg = iconSvg(spec).replace(
        '<svg ',
        `<svg width="${size}" height="${size}" style="display:block" `,
      );
      await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
      await page.screenshot({ path: PUBLIC(file), omitBackground: true });
      await page.close();
      console.log(`public/${file}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
