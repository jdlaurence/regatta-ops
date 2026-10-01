// pnpm pb:seed — writes the seed World (@regatta-ops/seed, PLAN.md §14) into PocketBase.
//
// Seeds the server at REGATTA_OPS_PB_URL (default http://127.0.0.1:8090) when one is running, otherwise
// starts a temporary server on backend/pb_data. Upserts by id, so it is safe to run again;
// pnpm pb:reset wipes the data first for a clean slate. Both seed the real junior rosters in data/
// when they are there (@regatta-ops/seed/local-rosters); REGATTA_OPS_SEED_INVENTED=1 keeps the invented athletes.

import { pathToFileURL } from 'node:url';
import type { SeedAccount, World } from '@regatta-ops/domain';
import { buildSeedWorld, type SeedOptions } from '@regatta-ops/seed';
import { readLocalRosters } from '@regatta-ops/seed/local-rosters';
import PocketBase from 'pocketbase';
import {
  DATA_DIR,
  DEFAULT_URL,
  SUPERUSER,
  isUp,
  migrateUp,
  startPocketBase,
  upsertSuperuser,
} from '../scripts/pocketbase';
import { loadWorld, type LoadSummary } from './load';

export interface SeedRun {
  summary: LoadSummary;
  world: World;
  accounts: SeedAccount[];
}

export async function superuserClient(url: string): Promise<PocketBase> {
  const pb = new PocketBase(url);
  pb.autoCancellation(false);
  try {
    await pb.collection('_superusers').authWithPassword(SUPERUSER.email, SUPERUSER.password);
  } catch (err) {
    throw new Error(
      `Could not sign in to ${url} as the local superuser ${SUPERUSER.email}. ` +
        'Run pnpm pb:reset, or set REGATTA_OPS_PB_SUPERUSER_EMAIL and REGATTA_OPS_PB_SUPERUSER_PASSWORD.',
      { cause: err },
    );
  }
  return pb;
}

export async function seedInto(url: string, options: SeedOptions = {}): Promise<SeedRun> {
  const pb = await superuserClient(url);
  const { world, accounts } = buildSeedWorld(options);
  const summary = await loadWorld(pb, world, accounts);
  return { summary, world, accounts };
}

export function printSummary(run: SeedRun, url: string): void {
  const lines = Object.entries(run.summary.counts)
    .filter(([, n]) => n > 0)
    .map(([name, n]) => `  ${name.padEnd(22)} ${n}`);
  console.log(`Seeded ${url}\n${lines.join('\n')}`);
  for (const [name, keys] of Object.entries(run.summary.unknown)) {
    console.warn(`  warning: ${name} fields with no PocketBase column: ${keys.join(', ')}`);
  }
  const roles = new Map(run.world.users.map((u) => [u.id, u.role]));
  console.log('\nSign in with:');
  for (const a of run.accounts) {
    console.log(`  ${(roles.get(a.userId) ?? '').padEnd(7)} ${a.email.padEnd(28)} ${a.password}`);
  }
  console.log(`\nPocketBase dashboard: ${url}/_/  (${SUPERUSER.email} / ${SUPERUSER.password})`);
}

/** The real junior rosters in data/, reported by count (names stay out of the terminal). */
export async function localSeedOptions(): Promise<SeedOptions> {
  const rosters = await readLocalRosters();
  for (const r of rosters) {
    console.log(`Junior ${r.team}: ${r.athletes.length} athletes from ${r.file}`);
  }
  const have = new Set(rosters.map((r) => r.team));
  const invented = (['boys', 'girls'] as const).filter((t) => !have.has(t));
  if (invented.length) console.log(`Junior ${invented.join(' and ')}: invented athletes`);
  return { juniorRosters: rosters.flatMap((r) => r.athletes) };
}

async function main(): Promise<void> {
  const options = await localSeedOptions();
  if (await isUp(DEFAULT_URL)) {
    printSummary(await seedInto(DEFAULT_URL, options), DEFAULT_URL);
    return;
  }
  await migrateUp(DATA_DIR);
  await upsertSuperuser(DATA_DIR);
  const server = await startPocketBase({ dataDir: DATA_DIR });
  try {
    const run = await seedInto(server.url, options);
    printSummary(run, DEFAULT_URL);
  } finally {
    await server.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
