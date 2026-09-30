// Schedule page state and writes: view and filters in the URL (so a view can be shared and the
// back button works), the clock for the now-line, and event edits with the "final" guard.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { zonedToInstant, type Regatta, type RegattaEvent } from '@srt/domain';
import { useBatch, useUpdate, batchOp } from '@/data';
import type { TimelineGroupBy } from '@/components/timeline-lib';
import { toast } from '@/components/toast';
import { scrollBehavior } from '@/lib/motion';
import { parseBoatClass, type ScheduleFilters, type ShiftChange } from './lib';

export type ScheduleView = 'list' | 'timeline';

const GROUP_PARAM: Record<string, TimelineGroupBy> = {
  shell: 'shell',
  team: 'team',
  oars: 'oar_set',
};

export function groupParam(g: TimelineGroupBy): string {
  return g === 'oar_set' ? 'oars' : g;
}

/**
 * `?day=2025-05-17&view=timeline&group=oars&team=<id>&class=8%2B&shell=<id>&tab=conflicts`, and
 * `?event=<id>` to open the list on one event.
 * Changes replace the history entry, so filters do not pile up behind the back button.
 */
const LINEUPS_KEY = 'srt-schedule-lineups';

/** The viewer's last "Show lineups" choice (a per-device convenience; storage may be blocked). */
function storedShowLineups(): boolean {
  try {
    return localStorage.getItem(LINEUPS_KEY) !== 'hide';
  } catch {
    return true;
  }
}

export function rememberShowLineups(show: boolean) {
  try {
    if (show) localStorage.removeItem(LINEUPS_KEY);
    else localStorage.setItem(LINEUPS_KEY, 'hide');
  } catch {
    // Private windows and blocked storage: the URL still carries the choice.
  }
}

export function useScheduleParams() {
  const [params, setParams] = useSearchParams();
  const view: ScheduleView = params.get('view') === 'timeline' ? 'timeline' : 'list';
  const groupBy: TimelineGroupBy = GROUP_PARAM[params.get('group') ?? ''] ?? 'shell';
  const teamId = params.get('team');
  const boatClass = parseBoatClass(params.get('class'));
  const shellId = params.get('shell');
  const filters = useMemo<ScheduleFilters>(
    () => ({ teamId, boatClass, shellId }),
    [teamId, boatClass, shellId],
  );
  const set = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const lineups = params.get('lineups');
  // The URL wins (links and the back button); otherwise the viewer's last choice.
  const showLineups = lineups === 'show' ? true : lineups === 'hide' ? false : storedShowLineups();
  return {
    view,
    groupBy,
    filters,
    /** List view: draw each entry's lineup as a boat strip, or keep the schedule clean. */
    showLineups,
    day: params.get('day'),
    /** A link to one event (activity feed, mention emails): show and highlight it once. */
    event: params.get('event'),
    tab: params.get('tab') === 'conflicts' ? ('conflicts' as const) : ('schedule' as const),
    set,
  };
}

/** The current time in epoch ms, updated every `intervalMs` (the timeline's now-line). */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * `?event=<id>` (links from the activity feed and mention emails): once the schedule has
 * rendered, scroll the event's row into view, highlight it briefly, and replace the parameter
 * with the event's day so a refresh or the back button does not repeat it.
 */
export function useEventLink(
  eventId: string | null,
  event: RegattaEvent | undefined,
  ready: boolean,
  set: (patch: Record<string, string | null>) => void,
) {
  useEffect(() => {
    if (!eventId || !ready) return;
    if (!event) {
      set({ event: null });
      return;
    }
    const row = document.querySelector<HTMLElement>(`[data-event-id="${event.id}"]`);
    row?.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() });
    row?.focus({ preventScroll: true });
    if (row) row.dataset.highlight = 'true';
    set({
      event: null,
      day: event.day,
      view: null,
      tab: null,
      team: null,
      class: null,
      shell: null,
    });
    // Not cleared on cleanup: consuming the parameter re-runs this effect, and the glow should
    // still fade. Removing an attribute from a row that is gone is harmless.
    window.setTimeout(() => {
      if (row) delete row.dataset.highlight;
    }, 2400);
  }, [eventId, event, ready, set]);
}

export type ConfirmFn = (opts: {
  title: string;
  description: string;
  action: string;
}) => Promise<boolean>;

/**
 * Edits to events from the schedule: time and name inline, and the bulk shift. Optimistic, so
 * conflicts recompute at once. On a final regatta each edit asks first (§4.1).
 */
export function useEventEdits(regatta: Regatta | undefined, confirm: ConfirmFn) {
  const update = useUpdate('events', { errorMessage: 'The event was not saved. Try again.' });
  const batch = useBatch({ errorMessage: 'The times were not shifted. Try again.' });
  const isFinal = regatta?.status === 'final';

  const guard = useCallback(
    async (what: string) =>
      !isFinal ||
      confirm({
        title: 'This regatta is final',
        description: `${what} Everyone sees the change right away.`,
        action: 'Save change',
      }),
    [isFinal, confirm],
  );

  const saveTime = useCallback(
    async (event: RegattaEvent, hhmm: string) => {
      if (!regatta) return;
      const scheduledAt = hhmm ? zonedToInstant(event.day, hhmm, regatta.timezone) : null;
      const label = event.eventNumber ? `Event ${event.eventNumber}` : event.name;
      const ok = await guard(
        hhmm ? `Change the time of ${label} to ${hhmm}?` : `Clear the time of ${label}?`,
      );
      if (!ok) return;
      update.mutate({ id: event.id, patch: { scheduledAt }, expectedUpdated: event.updated });
    },
    [regatta, guard, update],
  );

  const saveName = useCallback(
    async (event: RegattaEvent, name: string) => {
      const ok = await guard(`Rename "${event.name}" to "${name}"?`);
      if (!ok) return;
      update.mutate({ id: event.id, patch: { name }, expectedUpdated: event.updated });
    },
    [guard, update],
  );

  const applyShift = useCallback(
    (changes: ShiftChange[], onDone?: () => void) => {
      if (changes.length === 0) return;
      // Optimistic: the list and timeline move at once; the toast waits for the save.
      batch.mutate(
        changes.map((c) => batchOp.update('events', c.event.id, { scheduledAt: c.after })),
        {
          onSuccess: () =>
            toast.success(
              changes.length === 1 ? '1 event shifted' : `${changes.length} events shifted`,
            ),
        },
      );
      onDone?.();
    },
    [batch],
  );

  return { saveTime, saveName, applyShift, isFinal };
}
