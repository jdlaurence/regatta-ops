import { useEffect, useState } from 'react';

/**
 * The current time, re-read every `intervalMs` while mounted: for "just now" / "4 min ago" labels
 * and time windows (presence) that must move on without new data.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
