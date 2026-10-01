// `pnpm pages:seal` (PLAN.md §14): the junior rosters for the published demo. Reads the roster
// workbooks in data/, keeps first names and the fewest last-name letters that tell athletes
// apart, encrypts them with the demo password, and writes data/reference/junior-rosters.sealed.json,
// which is committed and which `vite build --mode pages` puts in the site. Never prints a name.
//
// The password comes from REGATTA_OPS_DEMO_PASSWORD or, in a terminal, a prompt that does not echo.
// Run it again with a new password to change it; everyone then enters the new one.

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { REPO_DIR, readLocalRosters } from '@regatta-ops/seed/local-rosters';
import { sealRoster, shortenLastNames } from '../src/app/unlock/sealed-roster.js';
import { SEALED_ROSTER_FILE } from './pages.js';

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          finish();
          reject(new Error('Cancelled.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function password(): Promise<string> {
  const fromEnv = process.env.REGATTA_OPS_DEMO_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!stdin.isTTY) throw new Error('Set REGATTA_OPS_DEMO_PASSWORD, or run this in a terminal.');
  const first = await askHidden('Demo password: ');
  const again = await askHidden('Same password again: ');
  if (first !== again) throw new Error('The two passwords differ. Nothing was written.');
  return first;
}

const rosters = await readLocalRosters();
if (rosters.length === 0) {
  throw new Error(
    'No roster workbooks in data/ (or REGATTA_OPS_SEED_INVENTED is set). Nothing was written.',
  );
}
const secret = await password();
if (secret.length < 8) throw new Error('Use a password of at least 8 characters.');

const athletes = shortenLastNames(rosters.flatMap((r) => r.athletes));
const sealed = await sealRoster(athletes, secret);
await writeFile(join(REPO_DIR, SEALED_ROSTER_FILE), `${JSON.stringify(sealed, null, 2)}\n`);

const counts = rosters.map((r) => `${r.athletes.length} ${r.team}`).join(' and ');
console.log(`Sealed ${counts} into ${SEALED_ROSTER_FILE}. Commit it to publish them.`);
