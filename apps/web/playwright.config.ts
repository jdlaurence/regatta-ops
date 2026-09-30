// Playwright (PLAN.md §13): end-to-end flows against a production build of demo mode (the app on
// the seed world with MemoryStore, no backend), served by `vite preview` on a fixed port. The
// build includes the service worker, so offline flows are real.
//
//   pnpm test:e2e                          build, serve, and run every spec in e2e/
//   pnpm test:e2e e2e/offline.spec.ts      one spec
//   PW_REUSE_SERVER=1 pnpm test:e2e        reuse a preview already running on the port
//
// Browser: Playwright's Chromium when installed (`pnpm exec playwright install chromium`, as CI
// does), otherwise the system Chrome. PW_CHANNEL overrides the choice.

import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.SRT_E2E_PORT ?? 4391);
const channel =
  process.env.PW_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : 'chrome');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) },
    },
  ],
  webServer: {
    command: `pnpm build:demo && pnpm preview:demo --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
