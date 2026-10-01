import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { localRosters } from './scripts/local-rosters.js';
import { pagesBase, pagesSite } from './scripts/pages.js';
import { tokenColor } from './scripts/tokens.js';

// PocketBase listens on 127.0.0.1:8090 in development (`pnpm pb:serve`). The dev server proxies
// its API and admin UI so the app and PocketBase share one origin, as in production, where
// PocketBase serves the built app from backend/pb_public/.
const POCKETBASE = 'http://127.0.0.1:8090';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const pkg = JSON.parse(readFileSync(here('./package.json'), 'utf8')) as { version: string };

// The offline copy of the query cache is thrown away when the shape of saved records may have
// changed (data/persist.ts): a new app version, or any change to these files.
const SCHEMA_FILES = [
  './src/data/pb-types.ts',
  './src/data/schema.ts',
  './src/data/pb-mapper.ts',
  '../../packages/domain/src/types.ts',
];
const schemaHash = SCHEMA_FILES.reduce(
  (h, file) => h.update(readFileSync(here(file))),
  createHash('sha256'),
)
  .digest('hex')
  .slice(0, 12);

export default defineConfig(({ mode }) => {
  // '/' everywhere but the published demo, which GitHub Pages serves from /<repository>/.
  const base = pagesBase(mode);
  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      localRosters(mode),
      pagesSite(mode),
      // PWA: installable, and the app shell opens with no connection. The service worker
      // precaches the build and never caches API responses; data offline comes from the query
      // cache saved in IndexedDB. Off in `vite dev` unless REGATTA_OPS_PWA_DEV=1.
      VitePWA({
        registerType: 'prompt',
        // src/pwa/UpdatePrompt.tsx registers it and offers updates with a toast.
        injectRegister: false,
        // The icons are in public/, which globPatterns already precaches.
        includeManifestIcons: false,
        manifest: {
          id: base,
          name: 'Regatta Ops',
          short_name: 'Regatta Ops',
          description:
            'Regatta lineups and trailer loading for Sammamish Rowing Association coaches.',
          lang: 'en',
          start_url: base,
          scope: base,
          display: 'standalone',
          // Hex from tokens.css (a manifest cannot use CSS variables): lake teal and the page.
          theme_color: tokenColor('--accent'),
          background_color: tokenColor('--bg'),
          icons: [
            { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
            { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png' },
            {
              src: `${base}pwa-maskable-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            { src: `${base}pwa-icon.svg`, sizes: 'any', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
          // Every route is the SPA, except PocketBase's API and its dashboard.
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/_\//],
          cleanupOutdatedCaches: true,
          // Headroom over the 2 MiB default: a chunk over the limit is left out of the precache
          // with only a build warning, and the app would then fail to open offline.
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'regatta-ops-font-styles' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'regatta-ops-fonts',
                expiration: { maxEntries: 16, maxAgeSeconds: 365 * 24 * 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          enabled: process.env.REGATTA_OPS_PWA_DEV === '1',
          type: 'module',
          navigateFallback: 'index.html',
        },
      }),
    ],
    define: {
      'import.meta.env.VITE_CACHE_BUSTER': JSON.stringify(`${pkg.version}+${schemaHash}`),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': { target: POCKETBASE, changeOrigin: true },
        '/_': { target: POCKETBASE, changeOrigin: true },
      },
    },
    build: {
      outDir: '../../backend/pb_public',
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
