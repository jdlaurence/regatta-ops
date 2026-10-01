// The published demo on GitHub Pages (`vite build --mode pages`, PLAN.md §7.1). In that mode:
// `virtual:regatta-ops-sealed-roster` is the encrypted junior rosters from `pnpm pages:seal` (and the
// build stops without them, so the site never goes up without its password); search engines are
// asked not to index the site; and 404.html is a copy of the app, so GitHub Pages answers deep
// links with the SPA. In every other mode the sealed roster is null and nothing else changes.

import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REPO_DIR } from '@regatta-ops/seed/local-rosters';
import type { Plugin } from 'vite';

export const SEALED_ROSTER_FILE = 'data/reference/junior-rosters.sealed.json';

const ID = 'virtual:regatta-ops-sealed-roster';
const RESOLVED = `\0${ID}`;

/** The site's path on GitHub Pages: /<repository>/ unless REGATTA_OPS_PAGES_BASE says otherwise. */
export function pagesBase(mode: string): string {
  if (mode !== 'pages') return '/';
  const base = process.env.REGATTA_OPS_PAGES_BASE ?? '/regatta-ops/';
  return base.endsWith('/') ? base : `${base}/`;
}

export function pagesSite(mode: string): Plugin {
  const pages = mode === 'pages';
  let outDir = '';
  return {
    name: 'regatta-ops-pages-site',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    resolveId: (source) => (source === ID ? RESOLVED : undefined),
    async load(id) {
      if (id !== RESOLVED) return undefined;
      if (!pages) return 'export default null;';
      const file = join(REPO_DIR, SEALED_ROSTER_FILE);
      this.addWatchFile(file);
      try {
        return `export default ${await readFile(file, 'utf8')};`;
      } catch {
        throw new Error(`No ${SEALED_ROSTER_FILE}. Run \`pnpm pages:seal\` first.`);
      }
    },
    transformIndexHtml: () =>
      pages
        ? [
            {
              tag: 'meta',
              attrs: { name: 'robots', content: 'noindex, nofollow' },
              injectTo: 'head',
            },
          ]
        : [],
    async closeBundle() {
      if (pages) await copyFile(join(outDir, 'index.html'), join(outDir, '404.html'));
    },
  };
}
