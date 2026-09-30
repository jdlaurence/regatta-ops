import { describe, expect, it, vi } from 'vitest';
import { StoreError } from '@/data';
import { isTransientShareError } from '@/data/share';
import { QUEUE_PREFIX, TickQueue, type KeyValueStorage, type QueuedTick } from './offline-queue';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const tick = (itemId: string, field: 'loaded' | 'returned', value = true, by = 'Sam') => ({
  itemId,
  field,
  value,
  by,
  at: '2026-11-01T16:00:00.000Z',
});

const offline = () => new StoreError('network', 'Could not reach the server.', 0);

describe('TickQueue', () => {
  it('keeps ticks in order and saves them on the device', () => {
    const storage = memoryStorage();
    const q = new TickQueue('tok', storage);
    q.add(tick('a', 'loaded'));
    q.add(tick('b', 'loaded'));
    q.add(tick('a', 'returned'));
    expect(q.list().map((t) => `${t.itemId}.${t.field}`)).toEqual([
      'a.loaded',
      'b.loaded',
      'a.returned',
    ]);
    // A new page (or a reload) sees the same queue.
    const reloaded = new TickQueue('tok', storage);
    expect(reloaded.list()).toEqual(q.list());
    expect(storage.data.has(`${QUEUE_PREFIX}tok`)).toBe(true);
    // Queues are per link.
    expect(new TickQueue('other', storage).size).toBe(0);
  });

  it('keeps only the last wanted state of a box', () => {
    const q = new TickQueue('tok', memoryStorage());
    q.add(tick('a', 'loaded', true));
    q.add(tick('b', 'loaded', true));
    q.add(tick('a', 'loaded', false));
    expect(q.list().map((t) => [t.itemId, t.value])).toEqual([
      ['b', true],
      ['a', false],
    ]);
  });

  it('replays in order and empties the queue and its storage', async () => {
    const storage = memoryStorage();
    const q = new TickQueue('tok', storage);
    q.add(tick('a', 'loaded'));
    q.add(tick('b', 'returned', false));
    const sent: string[] = [];
    const result = await q.replay(async (t) => {
      sent.push(`${t.itemId}.${t.field}=${t.value}`);
    }, isTransientShareError);
    expect(sent).toEqual(['a.loaded=true', 'b.returned=false']);
    expect(result.sent).toHaveLength(2);
    expect(result.remaining).toBe(0);
    expect(q.size).toBe(0);
    expect(storage.data.size).toBe(0);
  });

  it('stops at the first connection failure and keeps the rest', async () => {
    const q = new TickQueue('tok', memoryStorage());
    q.add(tick('a', 'loaded'));
    q.add(tick('b', 'loaded'));
    q.add(tick('c', 'loaded'));
    const send = vi
      .fn<(t: QueuedTick) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(offline());
    const result = await q.replay(send, isTransientShareError);
    expect(send).toHaveBeenCalledTimes(2);
    expect(result.remaining).toBe(2);
    expect(q.list().map((t) => t.itemId)).toEqual(['b', 'c']);

    // Back online: the rest goes through, in order.
    const later: string[] = [];
    await q.replay(async (t) => void later.push(t.itemId), isTransientShareError);
    expect(later).toEqual(['b', 'c']);
    expect(q.size).toBe(0);
  });

  it('drops ticks the server refuses for good and carries on', async () => {
    const q = new TickQueue('tok', memoryStorage());
    q.add(tick('gone', 'loaded'));
    q.add(tick('b', 'loaded'));
    const notFound = new StoreError('not_found', 'This regatta has no such load list item.', 404);
    const sent: string[] = [];
    const result = await q.replay(async (t) => {
      if (t.itemId === 'gone') throw notFound;
      sent.push(t.itemId);
    }, isTransientShareError);
    expect(result.dropped).toEqual([
      { tick: expect.objectContaining({ itemId: 'gone' }), error: notFound },
    ]);
    expect(sent).toEqual(['b']);
    expect(q.size).toBe(0);
  });

  it('treats a rate limit and a server error as passing, and runs one replay at a time', async () => {
    expect(isTransientShareError(new StoreError('unknown', 'Too many requests.', 429))).toBe(true);
    expect(isTransientShareError(new StoreError('unknown', 'Bad gateway.', 502))).toBe(true);
    expect(isTransientShareError(new StoreError('forbidden', 'No.', 403))).toBe(false);

    const q = new TickQueue('tok', memoryStorage());
    q.add(tick('a', 'loaded'));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = vi.fn(() => gate);
    const first = q.replay(send, isTransientShareError);
    const second = q.replay(send, isTransientShareError);
    expect(second).toBe(first);
    release();
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('picks up ticks queued while a replay runs, and a newer state of the box being sent', async () => {
    const q = new TickQueue('tok', memoryStorage());
    q.add(tick('a', 'loaded', true));
    const sent: string[] = [];
    await q.replay(async (t) => {
      sent.push(`${t.itemId}=${t.value}`);
      if (sent.length === 1) {
        q.add(tick('a', 'loaded', false));
        q.add(tick('b', 'loaded', true));
      }
    }, isTransientShareError);
    expect(sent).toEqual(['a=true', 'a=false', 'b=true']);
    expect(q.size).toBe(0);
  });

  it('works without storage and ignores corrupt saved data', () => {
    const q = new TickQueue('tok', null);
    q.add(tick('a', 'loaded'));
    expect(q.size).toBe(1);
    const storage = memoryStorage();
    storage.setItem(`${QUEUE_PREFIX}bad`, '{not json');
    expect(new TickQueue('bad', storage).size).toBe(0);
    storage.setItem(`${QUEUE_PREFIX}odd`, JSON.stringify([{ nope: 1 }, tick('a', 'loaded')]));
    expect(new TickQueue('odd', storage).size).toBe(0);
  });

  it('notifies subscribers on every change', () => {
    const q = new TickQueue('tok', memoryStorage());
    const listener = vi.fn();
    const off = q.subscribe(listener);
    const t = q.add(tick('a', 'loaded'));
    q.remove(t.id);
    off();
    q.add(tick('b', 'loaded'));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
