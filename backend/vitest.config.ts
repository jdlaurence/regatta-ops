import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Says so when the suites that need backend/bin/pocketbase are skipped.
    globalSetup: ['test/global-setup.ts'],
    // Each rule suite starts its own PocketBase on a free port and a temp data dir.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
