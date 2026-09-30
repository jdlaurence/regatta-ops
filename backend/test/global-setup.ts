import { PB_BIN, hasBinary } from '../scripts/pocketbase';

export default function setup(): void {
  if (!hasBinary()) {
    process.stderr.write(
      `\nSkipping the PocketBase rule tests: ${PB_BIN} is missing.\n` +
        'Run pnpm pb:download, then test again.\n\n',
    );
  }
}
