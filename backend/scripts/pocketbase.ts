// Starting and driving the local PocketBase binary from Node: used by pb:reset, pb:seed,
// pb:types, and the rule tests.

import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PB_BIN = path.join(BACKEND_DIR, 'bin', 'pocketbase');
export const DATA_DIR = path.join(BACKEND_DIR, 'pb_data');
export const MIGRATIONS_DIR = path.join(BACKEND_DIR, 'pb_migrations');
export const HOOKS_DIR = path.join(BACKEND_DIR, 'pb_hooks');
export const DEFAULT_URL = process.env.SRT_PB_URL ?? 'http://127.0.0.1:8090';

/** Local development superuser (PocketBase dashboard at /_/). Never used in production. */
export const SUPERUSER = {
  email: process.env.SRT_PB_SUPERUSER_EMAIL ?? 'admin@srt.local',
  password: process.env.SRT_PB_SUPERUSER_PASSWORD ?? 'srt-local-dev',
};

export function hasBinary(): boolean {
  return existsSync(PB_BIN);
}

export function requireBinary(): void {
  if (!hasBinary()) {
    throw new Error('PocketBase is not downloaded yet. Run: pnpm pb:download');
  }
}

function dirArgs(dataDir: string): string[] {
  return ['--dir', dataDir, '--migrationsDir', MIGRATIONS_DIR, '--hooksDir', HOOKS_DIR];
}

/** Runs a one-shot PocketBase command and resolves with its output. */
export function runPocketBase(args: string[], env: NodeJS.ProcessEnv = {}): Promise<string> {
  requireBinary();
  return new Promise((resolve, reject) => {
    execFile(
      PB_BIN,
      args,
      { cwd: BACKEND_DIR, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`pocketbase ${args[0]} failed: ${stderr || error.message}`));
        else resolve(stdout + stderr);
      },
    );
  });
}

export function migrateUp(dataDir: string): Promise<string> {
  return runPocketBase(['migrate', 'up', ...dirArgs(dataDir)]);
}

export function upsertSuperuser(dataDir: string): Promise<string> {
  return runPocketBase([
    'superuser',
    'upsert',
    SUPERUSER.email,
    SUPERUSER.password,
    ...dirArgs(dataDir),
  ]);
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export async function isUp(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface RunningPocketBase {
  url: string;
  /** Everything the process printed so far (useful when a test fails). */
  output(): string;
  stop(): Promise<void>;
}

/**
 * Starts `pocketbase serve` on a free port (migrations apply on start). Automigrate and hook
 * reloading are off, so tests that change collections never write migration files.
 */
export async function startPocketBase(options: {
  dataDir: string;
  port?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<RunningPocketBase> {
  requireBinary();
  const port = options.port ?? (await freePort());
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    PB_BIN,
    [
      'serve',
      '--http',
      `127.0.0.1:${port}`,
      '--automigrate=false',
      '--hooksWatch=false',
      ...dirArgs(options.dataDir),
    ],
    { cwd: BACKEND_DIR, env: { ...process.env, ...options.env }, stdio: 'pipe' },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
  let exited = false;
  const exit = new Promise<void>((resolve) =>
    child.on('exit', () => {
      exited = true;
      resolve();
    }),
  );

  const deadline = Date.now() + 20_000;
  while (!(await isUp(url))) {
    if (exited || Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`PocketBase did not start on ${url}:\n${output}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    url,
    output: () => output,
    stop: async () => {
      if (exited) return;
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exit;
      clearTimeout(timer);
    },
  };
}
