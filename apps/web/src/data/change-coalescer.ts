// "Updated by Sarah W. just now": which realtime changes are announced, and how a burst of them
// becomes one toast. Pure (no React, no toast library) so the unit tests and the real-backend
// test drive it directly; data/change-toasts.ts wires it to realtime and sonner.
//
// The source is the activity log, not the changed records: every logged write (entries, seats,
// events, availability, placements, load items) produces one activity_log row carrying the
// actor and the regatta, while most of those records have no updatedBy field of their own.

import type { ActivityEntry, CollectionName } from '@regatta-ops/domain';
import { capitalize, shortUserName, targetCollection } from './collab-format';
import type { ChangeEvent } from './store';

/** The regatta working-set collections whose changes by other people are announced. */
export const ANNOUNCED_COLLECTIONS = [
  'entries',
  'entry_seats',
  'events',
  'availability',
  'load_placements',
  'load_items',
] as const satisfies readonly CollectionName[];

/** Changes this close together (ms, each to the previous one) share one toast. */
export const CHANGE_BURST_MS = 2000;
/** Wait this long after the first change before showing, so a batch lands as one line. */
export const CHANGE_SETTLE_MS = 300;

export interface RemoteChange {
  actorId: string;
  /** Short form: "Sarah W.". */
  actorName: string;
  /** The activity sentence without the actor: "moved entry Girls V4+ to Event 14". */
  summary: string;
}

export interface ChangeNotice {
  /** Stable for the burst: showing a notice with the same id replaces the toast in place. */
  id: string;
  title: string;
  description?: string;
  count: number;
}

export interface RemoteChangeContext {
  /** The open regatta; changes elsewhere are not announced. */
  regattaId: string | null;
  /** The signed-in user: their own writes are never announced. */
  meId: string | null | undefined;
  /** User names by id. */
  names: ReadonlyMap<string, string>;
}

/** The announcement for a realtime event, or null when it should stay quiet. */
export function remoteChange(event: ChangeEvent, ctx: RemoteChangeContext): RemoteChange | null {
  if (event.collection !== 'activity_log' || event.action !== 'create') return null;
  const row = event.record as ActivityEntry;
  if (!ctx.regattaId || row.regattaId !== ctx.regattaId) return null;
  if (!row.actorId || row.actorId === ctx.meId) return null;
  const target = targetCollection(row.targetType);
  if (!target || !(ANNOUNCED_COLLECTIONS as readonly string[]).includes(target)) return null;
  return {
    actorId: row.actorId,
    actorName: shortUserName(ctx.names.get(row.actorId)),
    summary: row.summary,
  };
}

/** The toast text for a burst of changes (oldest first). */
export function describeChanges(changes: readonly RemoteChange[]): {
  title: string;
  description?: string;
} {
  const latest = changes[changes.length - 1];
  if (!latest) return { title: '' };
  const description = latest.summary ? capitalize(latest.summary) : undefined;
  if (changes.length === 1) {
    return { title: `Updated by ${latest.actorName} just now`, description };
  }
  const actors: string[] = [];
  for (const c of changes) if (!actors.includes(c.actorName)) actors.push(c.actorName);
  const who =
    actors.length === 1
      ? actors[0]!
      : actors.length === 2
        ? `${actors[0]} and ${actors[1]}`
        : `${actors[0]} and ${actors.length - 1} others`;
  return { title: `${who} made ${changes.length} changes`, description };
}

export interface ChangeCoalescerOptions {
  burstMs?: number;
  settleMs?: number;
  now?: () => number;
}

let burstSeq = 0;

/**
 * Collects announced changes into bursts. The first change of a burst shows after `settleMs`;
 * later changes within `burstMs` of the previous one update the same notice (same id).
 */
export class ChangeCoalescer {
  private burst: { id: string; changes: RemoteChange[]; lastAt: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly show: (notice: ChangeNotice) => void;
  private readonly burstMs: number;
  private readonly settleMs: number;
  private readonly now: () => number;

  constructor(show: (notice: ChangeNotice) => void, options: ChangeCoalescerOptions = {}) {
    this.show = show;
    this.burstMs = options.burstMs ?? CHANGE_BURST_MS;
    this.settleMs = options.settleMs ?? CHANGE_SETTLE_MS;
    this.now = options.now ?? (() => Date.now());
  }

  push(change: RemoteChange) {
    const at = this.now();
    if (!this.burst || at - this.burst.lastAt > this.burstMs) {
      burstSeq += 1;
      this.burst = { id: `regatta-ops-changes-${burstSeq}`, changes: [], lastAt: at };
    }
    this.burst.changes.push(change);
    this.burst.lastAt = at;
    this.timer ??= setTimeout(() => this.render(), this.settleMs);
  }

  /** Drop a pending render (unmount). The coalescer stays usable. */
  dispose() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private render() {
    this.timer = null;
    const burst = this.burst;
    if (!burst || burst.changes.length === 0) return;
    this.show({ id: burst.id, count: burst.changes.length, ...describeChanges(burst.changes) });
  }
}
