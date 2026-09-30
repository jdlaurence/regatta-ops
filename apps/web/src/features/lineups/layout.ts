// Layout of the builder (PLAN.md §6.4): entries are cards in a grid of equal columns, each card
// a boat stood on end, so a coach sees several crews side by side like the club's printed grid.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/** Narrowest card column: an eight's names still read in full at 1280 px, three across. */
export const CARD_MIN = 224;
/** Gap between card columns (gap-x-4). */
export const CARD_GAP = 16;
/** The roster column beside the entries, and the gap after it (gap-6). */
export const ROSTER_COLUMN = 240;
export const ROSTER_GAP = 24;
/** The roster sits beside the entries when two columns of boats still fit next to it. */
export const WIDE_MIN = ROSTER_COLUMN + ROSTER_GAP + 2 * CARD_MIN + CARD_GAP;

/** How many card columns fit in a width (one until measured). */
export function cardColumns(width: number): number {
  if (width <= 0) return 1;
  return Math.max(1, Math.floor((width + CARD_GAP) / (CARD_MIN + CARD_GAP)));
}

/** Part of an event's cards on one row of the grid. */
export interface GridRun {
  row: number;
  /** First column, from 0. */
  col: number;
  /** Cards in this run (the columns the event's heading spans). */
  count: number;
  /** Index of the run's first card among the event's cards. */
  offset: number;
}

/**
 * Place events' cards on a grid of `columns`, in order, filling each row before the next: an
 * event that does not fit the rest of a row starts there anyway and continues on the next row,
 * so the grid has no holes. Returns each event's runs (one per row it touches).
 */
export function packRuns(counts: readonly number[], columns: number): GridRun[][] {
  const cols = Math.max(1, columns);
  let row = 0;
  let col = 0;
  return counts.map((n) => {
    const runs: GridRun[] = [];
    let offset = 0;
    let left = Math.max(1, n);
    while (left > 0) {
      const count = Math.min(left, cols - col);
      runs.push({ row, col, count, offset });
      offset += count;
      left -= count;
      col += count;
      if (col === cols) {
        row += 1;
        col = 0;
      }
    }
    return runs;
  });
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/**
 * Width of an element: measured before the first paint, then kept up to date by a
 * ResizeObserver; 0 until the element mounts (and in tests, where nothing is laid out).
 */
export function useWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  // A ref callback runs while React commits, so the first measurement lands before the paint.
  const ref = useCallback((node: HTMLElement | null) => {
    setEl(node);
    if (node) setWidth(Math.round(node.getBoundingClientRect().width));
  }, []);
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w != null) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [ref, width];
}
