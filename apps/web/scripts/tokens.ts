// Read color values from src/styles/tokens.css for the places CSS variables cannot reach: the
// web app manifest (vite.config.ts) and the app icons (generate-icons.ts). tokens.css stays
// the only place colors are written.

import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const TOKENS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));

/** A token's hex value in the light theme (the first `:root` block). */
export function tokenColor(name: string): string {
  const css = readFileSync(TOKENS, 'utf8');
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})\\b`));
  if (!match) throw new Error(`tokens.css has no value for ${name}.`);
  return match[1];
}
