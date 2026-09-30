// Small pieces shared by the print views: the "which version prints" line, the printed-at stamp,
// and empty boxes to tick by hand.

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import type { TeamLineups } from './derive';
import { instantText, printedText } from './format';

/** Now, refreshed when the browser is about to print, so the stamp is the print time. */
export function usePrintedAt(): string {
  const [at, setAt] = useState(() => new Date().toISOString());
  useEffect(() => {
    const refresh = () => setAt(new Date().toISOString());
    window.addEventListener('beforeprint', refresh);
    return () => window.removeEventListener('beforeprint', refresh);
  }, []);
  return at;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** "Published lineups / Published Tue, May 13, 9:00 PM", or "Live draft / Printed ...". */
export function SourceMeta({
  lineups,
  timeZone,
  printedAt,
}: {
  lineups: Pick<TeamLineups, 'source' | 'requested' | 'publishedAt' | 'changes'>;
  timeZone: string;
  printedAt: string;
}) {
  if (lineups.source === 'published' && lineups.publishedAt) {
    return (
      <>
        <span className="block font-medium text-ink">Published lineups</span>
        <span className="block">Published {instantText(lineups.publishedAt, timeZone)}</span>
      </>
    );
  }
  const note = !lineups.publishedAt
    ? 'not published yet'
    : lineups.changes.length > 0
      ? `${plural(lineups.changes.length, 'change')} since publishing`
      : 'same as published';
  return (
    <>
      <span className="block font-medium text-ink">Live draft, {note}</span>
      <span className="block">Printed {printedText(printedAt, timeZone)}</span>
    </>
  );
}

/** An empty square to tick with a pen. */
export function TickBox({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 rounded-[3px] border-[1.5px] border-ink', className)}
    />
  );
}
