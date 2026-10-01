// pnpm pb:types — regenerate apps/web/src/data/pb-types.ts from the migrations.
// Migrates a throwaway data dir, serves it on a free port, and points pocketbase-typegen at it,
// so the output depends only on pb_migrations (not on local data or a running server).

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BACKEND_DIR,
  SUPERUSER,
  migrateUp,
  requireBinary,
  startPocketBase,
  upsertSuperuser,
} from './pocketbase';

const OUT = path.resolve(BACKEND_DIR, '..', 'apps', 'web', 'src', 'data', 'pb-types.ts');
const TYPEGEN = path.join(BACKEND_DIR, 'node_modules', '.bin', 'pocketbase-typegen');

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: BACKEND_DIR }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(file)} failed: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

async function main(): Promise<void> {
  requireBinary();
  const dataDir = await mkdtemp(path.join(tmpdir(), 'regatta-ops-typegen-'));
  try {
    await migrateUp(dataDir);
    await upsertSuperuser(dataDir);
    const server = await startPocketBase({ dataDir });
    try {
      await mkdir(path.dirname(OUT), { recursive: true });
      await run(TYPEGEN, [
        '--url',
        server.url,
        '--email',
        SUPERUSER.email,
        '--password',
        SUPERUSER.password,
        '--out',
        OUT,
      ]);
    } finally {
      await server.stop();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
  console.log(`Wrote ${path.relative(path.resolve(BACKEND_DIR, '..'), OUT)}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
