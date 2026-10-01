// Playwright (PLAN.md §11.3, §13): the phase demos of §12.1 as flows, in two projects.
//
//   demo        e2e/*.spec.ts against a production build of demo mode (the app on the seed world
//               with MemoryStore, no backend), served by `vite preview`. The build includes the
//               service worker, so offline flows are real.
//   pocketbase  e2e/pb/*.spec.ts against a real PocketBase on a temporary data folder, migrated
//               and seeded, serving the production build (e2e/pb/server.ts). Needs
//               `pnpm pb:download` once.
//
//   pnpm test:e2e                          the demo project (from the repo root or apps/web)
//   pnpm test:e2e:pb                       the pocketbase project
//   pnpm test:e2e e2e/offline.spec.ts      one spec
//   PW_REUSE_SERVER=1 pnpm test:e2e        reuse a server already running on the port
//
// Only the servers of the projects asked for with --project=<name> start (both without it).
//
// Browser: Playwright's Chromium when installed (`pnpm exec playwright install chromium`, as CI
// does), otherwise the system Chrome. PW_CHANNEL overrides the choice.

import { existsSync } from 'node:fs';
import { chromium, defineConfig, devices } from '@playwright/test';

const DEMO_PORT = Number(process.env.REGATTA_OPS_E2E_PORT ?? 4391);
const PB_PORT = Number(process.env.REGATTA_OPS_E2E_PB_PORT ?? 4392);
const channel =
  process.env.PW_CHANNEL || (existsSync(chromium.executablePath()) ? undefined : 'chrome');
const browser = { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) };
const reuseExistingServer = process.env.PW_REUSE_SERVER === '1';

/** The projects named on the command line (`--project=demo`); empty means every project. */
function requestedProjects(argv: readonly string[]): RegExp[] {
  const names: string[] = [];
  argv.forEach((arg, i) => {
    if (arg.startsWith('--project=')) names.push(arg.slice('--project='.length));
    else if (arg === '--project' && argv[i + 1]) names.push(argv[i + 1]!);
  });
  // Playwright accepts * wildcards in project names.
  return names.map(
    (n) => new RegExp(`^${n.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i'),
  );
}
const requested = requestedProjects(process.argv);
const runs = (project: string) => requested.length === 0 || requested.some((r) => r.test(project));

export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'demo',
      testDir: 'e2e',
      testIgnore: ['pb/**'],
      use: { ...browser, baseURL: `http://localhost:${DEMO_PORT}` },
    },
    {
      name: 'pocketbase',
      testDir: 'e2e/pb',
      // One database for the whole run: its tests take turns.
      fullyParallel: false,
      workers: 1,
      use: { ...browser, baseURL: `http://127.0.0.1:${PB_PORT}` },
    },
  ],
  webServer: [
    ...(runs('demo')
      ? [
          {
            command: `pnpm build:demo && pnpm preview:demo --port ${DEMO_PORT} --strictPort`,
            // Invented athletes, so screenshots and traces never show the real rosters.
            env: { REGATTA_OPS_SEED_INVENTED: '1' },
            url: `http://localhost:${DEMO_PORT}`,
            reuseExistingServer,
            timeout: 240_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
          },
        ]
      : []),
    ...(runs('pocketbase')
      ? [
          {
            command: 'pnpm build && pnpm exec tsx e2e/pb/server.ts',
            env: { REGATTA_OPS_E2E_PB_PORT: String(PB_PORT) },
            // Answers only once the seed is in (server.ts seeds on a throwaway port first).
            url: `http://127.0.0.1:${PB_PORT}/api/health`,
            reuseExistingServer,
            timeout: 300_000,
            // server.ts reports on stderr (data folder, seed counts); build logs stay quiet.
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
            // Let server.ts stop PocketBase and delete its temporary data folder.
            gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 10_000 },
          },
        ]
      : []),
  ],
});
