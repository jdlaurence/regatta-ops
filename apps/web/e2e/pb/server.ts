// The web server for the `pocketbase` Playwright project (playwright.config.ts, PLAN.md §11.3):
// a real PocketBase on a temporary data folder, migrated and loaded with the full seed world,
// serving the production build from backend/pb_public/ (the webServer command builds it first).
// backend/pb_data is never touched, and the temporary folder is deleted on exit.
//
// Seeding runs on a throwaway server on a free port; the fixed port only answers once the data
// is in, so Playwright starts the tests on a complete world.
//
//   pnpm build && pnpm exec tsx e2e/pb/server.ts      (REGATTA_OPS_E2E_PB_PORT, default 4392)

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BACKEND_DIR,
  HOOKS_DIR,
  MIGRATIONS_DIR,
  PB_BIN,
  migrateUp,
  requireBinary,
  startPocketBase,
  upsertSuperuser,
} from '../../../../backend/scripts/pocketbase';
import { seedInto } from '../../../../backend/seed/seed';

const PORT = Number(process.env.REGATTA_OPS_E2E_PB_PORT ?? 4392);
const APP_URL = `http://127.0.0.1:${PORT}`;

/** Ignore the developer's own REGATTA_OPS_* settings (backend/.env is not loaded either). */
const ENV: NodeJS.ProcessEnv = {
  REGATTA_OPS_ALLOWED_DOMAIN: '',
  REGATTA_OPS_GOOGLE_CLIENT_ID: '',
  REGATTA_OPS_GOOGLE_CLIENT_SECRET: '',
  REGATTA_OPS_SMTP_HOST: '',
  REGATTA_OPS_MAIL_FROM: '',
  REGATTA_OPS_MAIL_FROM_NAME: '',
  // Emails (mentions, change notices) land in mail_outbox instead of the log.
  REGATTA_OPS_MAIL_CAPTURE: '1',
  REGATTA_OPS_APP_URL: APP_URL,
  REGATTA_OPS_DIGEST_HOUR: '',
};

function log(message: string) {
  process.stderr.write(`[pb-e2e] ${message}\n`);
}

async function main() {
  requireBinary();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'regatta-ops-e2e-pb-'));
  let server: ChildProcess | null = null;
  let stopping = false;

  const stop = async (code: number) => {
    if (stopping) return;
    stopping = true;
    if (server && server.exitCode === null) {
      const exited = new Promise((resolve) => server!.once('exit', resolve));
      server.kill('SIGTERM');
      const timer = setTimeout(() => server?.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
    }
    await rm(dataDir, { recursive: true, force: true });
    process.exit(code);
  };
  process.on('SIGTERM', () => void stop(0));
  process.on('SIGINT', () => void stop(0));

  log(`data in ${dataDir}`);
  await migrateUp(dataDir);
  await upsertSuperuser(dataDir);
  const seeding = await startPocketBase({ dataDir, env: ENV });
  try {
    const run = await seedInto(seeding.url);
    const counts = Object.entries(run.summary.counts)
      .filter(([, n]) => n > 0)
      .map(([name, n]) => `${name} ${n}`)
      .join(', ');
    log(`seeded: ${counts}`);
  } finally {
    await seeding.stop();
  }

  server = spawn(
    PB_BIN,
    [
      'serve',
      '--http',
      `127.0.0.1:${PORT}`,
      '--automigrate=false',
      '--hooksWatch=false',
      '--dir',
      dataDir,
      '--migrationsDir',
      MIGRATIONS_DIR,
      '--hooksDir',
      HOOKS_DIR,
      '--publicDir',
      path.join(BACKEND_DIR, 'pb_public'),
    ],
    { cwd: BACKEND_DIR, env: { ...process.env, ...ENV }, stdio: 'inherit' },
  );
  server.on('exit', (code) => {
    if (!stopping) {
      log(`PocketBase exited (${code ?? 'signal'})`);
      void stop(code ?? 1);
    }
  });
  log(`serving the app and API on ${APP_URL}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
