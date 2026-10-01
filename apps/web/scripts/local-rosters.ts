// `virtual:srt-local-rosters` (PLAN.md §18): in demo mode, the real junior rosters from the
// ignored workbooks in data/, so `pnpm demo` shows the club's athletes; in every other mode, and
// when the workbooks are missing or SRT_SEED_INVENTED is set, an empty list and the invented
// athletes. The names end up only in the local demo build (dist/demo, ignored by git).

import { join } from 'node:path';
import { REPO_DIR, readLocalRosters } from '@srt/seed/local-rosters';
import type { Plugin } from 'vite';

const ID = 'virtual:srt-local-rosters';
const RESOLVED = `\0${ID}`;

export function localRosters(mode: string): Plugin {
  return {
    name: 'srt-local-rosters',
    resolveId: (source) => (source === ID ? RESOLVED : undefined),
    async load(id) {
      if (id !== RESOLVED) return undefined;
      const rosters = mode === 'demo' ? await readLocalRosters() : [];
      // Edits to a workbook reload the demo.
      for (const r of rosters) this.addWatchFile(join(REPO_DIR, r.file));
      return `export default ${JSON.stringify(rosters.flatMap((r) => r.athletes))};`;
    },
  };
}
