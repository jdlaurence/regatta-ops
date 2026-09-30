// The offline banner (PLAN.md §10.4, principle 5). While the app cannot reach the server,
// every page in the shell says so: it is showing the copy saved on this device, from when, and
// editing is off (useCan answers false and writes refuse). Reconnecting says so once.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { CloudOff } from 'lucide-react';
import { useOnline } from '@/data';
import { OFFLINE_TOAST_ID } from '@/data/online';
import { toast } from '@/components/toast';

/**
 * When the data on screen last came from the server: the oldest query in use (the most
 * conservative answer), else the newest saved one. Null when nothing is cached.
 */
export function savedAt(qc: QueryClient): number | null {
  let oldestInUse = Infinity;
  let newest = 0;
  for (const q of qc.getQueryCache().getAll()) {
    const t = q.state.dataUpdatedAt;
    if (q.state.data === undefined || !t) continue;
    newest = Math.max(newest, t);
    if (q.getObserversCount() > 0) oldestInUse = Math.min(oldestInUse, t);
  }
  if (oldestInUse !== Infinity) return oldestInUse;
  return newest || null;
}

const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "at 9:42 AM", "yesterday at 9:42 AM", "on Sep 27 at 9:42 AM", in this device's time. */
export function formatSavedAt(time: number, now: Date = new Date()): string {
  const then = new Date(time);
  const clock = TIME.format(then);
  if (sameDay(then, now)) return `at ${clock}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(then, yesterday)) return `yesterday at ${clock}`;
  return `on ${DAY.format(then)} at ${clock}`;
}

export function offlineMessage(saved: number | null, now?: Date): string {
  const version =
    saved === null ? '' : ` Showing the version saved on this device ${formatSavedAt(saved, now)}.`;
  return `You're offline.${version} Editing is off until you reconnect.`;
}

const noSubscription = () => () => {};

function useSavedAt(enabled: boolean): number | null {
  const qc = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => qc.getQueryCache().subscribe(onChange),
    [qc],
  );
  return useSyncExternalStore(
    enabled ? subscribe : noSubscription,
    () => (enabled ? savedAt(qc) : null),
    () => null,
  );
}

/** Says "Back online" once when the connection returns after being lost on this visit. */
function useBackOnlineToast(online: boolean) {
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    toast.dismiss(OFFLINE_TOAST_ID);
    toast.success('Back online. Editing is on.', { id: 'srt-back-online' });
  }, [online]);
}

export function OfflineBanner({ className }: { className?: string }) {
  const online = useOnline();
  const saved = useSavedAt(!online);
  useBackOnlineToast(online);
  // The live region stays mounted so screen readers announce the banner when it appears.
  return (
    <div role="status" data-print="hide" className={className}>
      {!online && (
        <div
          data-testid="offline-banner"
          className="flex items-start gap-2.5 border-b border-warn/40 bg-warn-tint px-4 py-2.5 text-base leading-prose text-ink md:px-6 lg:px-8"
        >
          <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
          <p className="min-w-0">{offlineMessage(saved)}</p>
        </div>
      )}
    </div>
  );
}
