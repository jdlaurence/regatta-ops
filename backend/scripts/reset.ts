// pnpm pb:reset — wipe backend/pb_data, apply migrations, create the local superuser, and seed.

import { rm } from 'node:fs/promises';
import { printSummary, seedInto } from '../seed/seed';
import {
  DATA_DIR,
  DEFAULT_URL,
  isUp,
  migrateUp,
  requireBinary,
  startPocketBase,
  upsertSuperuser,
} from './pocketbase';

async function main(): Promise<void> {
  requireBinary();
  if (await isUp(DEFAULT_URL)) {
    throw new Error(
      `PocketBase is running at ${DEFAULT_URL}. Stop it (pnpm dev) before resetting its data.`,
    );
  }
  await rm(DATA_DIR, { recursive: true, force: true });
  console.log(await migrateUp(DATA_DIR));
  await upsertSuperuser(DATA_DIR);
  const server = await startPocketBase({ dataDir: DATA_DIR });
  try {
    printSummary(await seedInto(server.url), DEFAULT_URL);
  } finally {
    await server.stop();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
