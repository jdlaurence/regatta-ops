// Offline checklist edits (PLAN.md §10.4). A tick that cannot reach the server waits
// in a queue saved on the device (localStorage, one queue per share link) and is sent again, in
// order, when the connection comes back. Each entry is the state wanted, not a toggle ("Cox
// boxes: loaded = true"), and the server keeps the first time and name when a line is already
// ticked, so sending an entry twice does no harm.

export type TickField = 'loaded' | 'returned';

export interface QueuedTick {
  /** Queue entry id. */
  id: string;
  itemId: string;
  field: TickField;
  /** The state wanted. */
  value: boolean;
  /** The name typed on the page when the tick was made. */
  by: string;
  /** When the tick was made (ISO). */
  at: string;
}

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ReplayResult {
  sent: QueuedTick[];
  /** Ticks the server refused for good (403, 404, 400); they are dropped. */
  dropped: { tick: QueuedTick; error: unknown }[];
  /** Ticks still waiting (the connection failed again part way). */
  remaining: number;
}

export const QUEUE_PREFIX = 'regatta-ops-share-queue:';

let seq = 0;
const nextId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isTick(v: unknown): v is QueuedTick {
  const t = v as QueuedTick;
  return (
    !!t &&
    typeof t.id === 'string' &&
    typeof t.itemId === 'string' &&
    (t.field === 'loaded' || t.field === 'returned') &&
    typeof t.value === 'boolean'
  );
}

/**
 * The ticks waiting for one share link. Works without storage too (private windows): the queue
 * then lasts as long as the page.
 */
export class TickQueue {
  private readonly key: string;
  private readonly storage: KeyValueStorage | null;
  private ticks: QueuedTick[];
  private listeners = new Set<() => void>();
  private replaying: Promise<ReplayResult> | null = null;

  constructor(token: string, storage: KeyValueStorage | null = defaultStorage()) {
    this.key = QUEUE_PREFIX + token;
    this.storage = storage;
    this.ticks = this.read();
  }

  /** The waiting ticks, oldest first. The same array until the queue changes. */
  list(): readonly QueuedTick[] {
    return this.ticks;
  }

  get size(): number {
    return this.ticks.length;
  }

  /**
   * Queue a tick. A later tick of the same line and box replaces an earlier one (only the last
   * wanted state matters) and moves to the end.
   */
  add(tick: Omit<QueuedTick, 'id'>): QueuedTick {
    const entry: QueuedTick = { ...tick, id: nextId() };
    this.write([
      ...this.ticks.filter((t) => !(t.itemId === tick.itemId && t.field === tick.field)),
      entry,
    ]);
    return entry;
  }

  remove(id: string) {
    if (this.ticks.some((t) => t.id === id)) this.write(this.ticks.filter((t) => t.id !== id));
  }

  clear() {
    this.write([]);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Pick up changes another tab made to the same queue. */
  reload() {
    const next = this.read();
    if (JSON.stringify(next) !== JSON.stringify(this.ticks)) {
      this.ticks = next;
      this.emit();
    }
  }

  get storageKey(): string {
    return this.key;
  }

  /**
   * Send every waiting tick, oldest first. A tick leaves the queue once the server has it, or
   * when the server refuses it for good. The first failure that `isTransient` says may pass
   * (no connection) stops the run and leaves the rest queued. Only one run at a time: calling
   * again while a run is going returns that run.
   */
  replay(
    send: (tick: QueuedTick) => Promise<void>,
    isTransient: (error: unknown) => boolean,
  ): Promise<ReplayResult> {
    if (this.replaying) return this.replaying;
    const run = async (): Promise<ReplayResult> => {
      const result: ReplayResult = { sent: [], dropped: [], remaining: 0 };
      // Ticks queued during the run are picked up by the loop, since it reads the live list.
      for (let tick = this.ticks[0]; tick; tick = this.ticks[0]) {
        try {
          await send(tick);
          result.sent.push(tick);
        } catch (error) {
          if (isTransient(error)) break;
          result.dropped.push({ tick, error });
        }
        // A newer tick of the same box replaced this one meanwhile: that one stays queued.
        this.remove(tick.id);
      }
      result.remaining = this.ticks.length;
      return result;
    };
    this.replaying = run().finally(() => {
      this.replaying = null;
    });
    return this.replaying;
  }

  private read(): QueuedTick[] {
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isTick) : [];
    } catch {
      return [];
    }
  }

  private write(next: QueuedTick[]) {
    this.ticks = next;
    try {
      if (next.length) this.storage?.setItem(this.key, JSON.stringify(next));
      else this.storage?.removeItem(this.key);
    } catch {
      // Storage full or blocked: the queue still holds the ticks while the page is open.
    }
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}
