import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Presence } from '@regatta-ops/domain';
import { fixtureStore, flush, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { shortUserName } from './collab-format';
import { StoreProvider } from './context';
import type { MemoryStore } from './memory-store';
import { usePresence, useRegattaPresence } from './presence';
import {
  activeViewers,
  isFresh,
  PRESENCE_HEARTBEAT_MS,
  PresenceBeacon,
  presenceActivity,
  presencePageFromPath,
  type IdStorage,
} from './presence-beacon';

const NOW = Date.parse('2026-10-01T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function memoryStorage(): IdStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

async function presenceRows(store: MemoryStore) {
  return store.list('presence', { where: { regattaId: IDS.regatta } });
}

describe('presencePageFromPath', () => {
  it('names the page and the lineup team', () => {
    expect(presencePageFromPath(`/regattas/${IDS.regatta}`)).toEqual({
      regattaId: IDS.regatta,
      page: 'overview',
      teamId: null,
    });
    expect(presencePageFromPath(`/regattas/${IDS.regatta}/lineups/${IDS.girls}`)).toMatchObject({
      page: 'lineups',
      teamId: IDS.girls,
    });
    expect(presencePageFromPath(`/regattas/${IDS.regatta}/trailer/${IDS.trailer}`)).toMatchObject({
      page: 'trailer',
      teamId: null,
    });
    expect(presencePageFromPath(`/regattas/${IDS.regatta}/load`)!.page).toBe('load');
    expect(presencePageFromPath(`/regattas/${IDS.regatta}/nowhere`)!.page).toBe('overview');
    expect(presencePageFromPath('/fleet/shells')).toBeNull();
  });
});

describe('presence rows', () => {
  const users = new Map([
    [IDS.admin, { name: 'Alex Admin', role: 'admin' as const, defaultTeamId: IDS.boys }],
    [IDS.coach, { name: 'Casey Coach', role: 'coach' as const, defaultTeamId: IDS.girls }],
    [IDS.viewer, { name: 'Vic Viewer', role: 'viewer' as const, defaultTeamId: null }],
  ]);
  const teams = new Map([
    [IDS.boys, { id: IDS.boys, name: 'Junior boys', shortName: 'Boys', colorKey: 'navy' as const }],
    [
      IDS.girls,
      { id: IDS.girls, name: 'Junior girls', shortName: 'Girls', colorKey: 'raspberry' as const },
    ],
  ]);
  const row = (p: Partial<Presence>): Presence => ({
    id: `presence${Math.random().toString(36).slice(2, 9)}`,
    userId: IDS.admin,
    regattaId: IDS.regatta,
    page: 'overview',
    seenAt: ago(0),
    ...p,
  });

  it('expires after two minutes', () => {
    expect(isFresh(row({ seenAt: ago(119_000) }), NOW)).toBe(true);
    expect(isFresh(row({ seenAt: ago(121_000) }), NOW)).toBe(false);
    // A client clock a little ahead still counts.
    expect(isFresh(row({ seenAt: ago(-5_000) }), NOW)).toBe(true);
    expect(isFresh(row({ seenAt: '' }), NOW)).toBe(false);
  });

  it('lists everyone else once, freshest row first, in name order', () => {
    const viewers = activeViewers(
      [
        row({ userId: IDS.viewer, page: 'schedule', seenAt: ago(10_000) }),
        row({ userId: IDS.admin, page: 'schedule', seenAt: ago(90_000) }),
        // A second tab, more recent: this one wins.
        row({ userId: IDS.admin, page: 'lineups', teamId: IDS.girls, seenAt: ago(5_000) }),
        // Me, and a stale row: left out.
        row({ userId: IDS.coach, page: 'trailer' }),
        row({ userId: 'usergone0000001', seenAt: ago(300_000) }),
      ],
      { now: NOW, meId: IDS.coach, users, teams, shortName: shortUserName },
    );
    expect(viewers.map((v) => [v.shortName, v.activity, v.colorKey])).toEqual([
      ['Alex A.', 'editing Girls lineups', 'raspberry'],
      ['Vic V.', 'viewing the schedule', null],
    ]);
  });

  it('describes each page', () => {
    const girls = teams.get(IDS.girls)!;
    expect(presenceActivity('lineups', girls)).toBe('editing Girls lineups');
    expect(presenceActivity('lineups', null)).toBe('editing lineups');
    expect(presenceActivity('schedule', null)).toBe('editing the schedule');
    expect(presenceActivity('trailer', null, 'viewer')).toBe('viewing the trailer');
    expect(presenceActivity('load', null)).toBe('editing the load list');
    expect(presenceActivity('availability', null)).toBe('editing availability');
    expect(presenceActivity('overview', null)).toBe('viewing the overview');
  });
});

describe('PresenceBeacon', () => {
  it('creates one row per tab, refreshes it, and deletes it on leave', async () => {
    const store = fixtureStore();
    const storage = memoryStorage();
    const beacon = new PresenceBeacon(store, { storage, now: () => ago(0) });
    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'schedule' });
    const [first] = await presenceRows(store);
    expect(first).toMatchObject({ userId: IDS.coach, page: 'schedule', teamId: null });

    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'lineups', teamId: IDS.girls });
    const rows = await presenceRows(store);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: first!.id, page: 'lineups', teamId: IDS.girls });

    // A reload in the same tab finds its row again through sessionStorage.
    const reloaded = new PresenceBeacon(store, { storage });
    await reloaded.beat(IDS.coach, { regattaId: IDS.regatta, page: 'trailer' });
    expect(await presenceRows(store)).toHaveLength(1);
    expect(reloaded.rowId(IDS.regatta)).toBe(first!.id);

    await reloaded.leave(IDS.regatta);
    expect(await presenceRows(store)).toHaveLength(0);
    expect(storage.data.size).toBe(0);
  });

  it('starts a new row when the old one was pruned', async () => {
    const store = fixtureStore();
    const beacon = new PresenceBeacon(store);
    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'schedule' });
    const id = beacon.rowId(IDS.regatta)!;
    await store.delete('presence', id);
    await beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'schedule' });
    expect(beacon.rowId(IDS.regatta)).not.toBe(id);
    expect(await presenceRows(store)).toHaveLength(1);
  });

  it('runs in order, so a leave right after the first beat deletes that row', async () => {
    const store = fixtureStore();
    const beacon = new PresenceBeacon(store);
    void beacon.beat(IDS.coach, { regattaId: IDS.regatta, page: 'schedule' });
    await beacon.leave(IDS.regatta);
    expect(await presenceRows(store)).toHaveLength(0);
  });
});

describe('usePresence', () => {
  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'visibilityState', {
      value: hidden ? 'hidden' : 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('beats on mount, on page change, every 30 s while visible, and leaves on unmount', async () => {
    vi.useFakeTimers();
    const store = fixtureStore();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StoreProvider store={store}>{children}</StoreProvider>
    );
    const { rerender, unmount } = renderHook(
      (props: { page: string; teamId?: string | null }) =>
        usePresence({ regattaId: IDS.regatta, ...props }),
      { wrapper, initialProps: { page: 'schedule' } as { page: string; teamId?: string | null } },
    );
    await act(() => vi.advanceTimersByTimeAsync(10));
    let [row] = await presenceRows(store);
    expect(row).toMatchObject({ userId: IDS.coach, page: 'schedule' });
    const firstSeen = row!.seenAt;

    rerender({ page: 'lineups', teamId: IDS.girls });
    await act(() => vi.advanceTimersByTimeAsync(10));
    [row] = await presenceRows(store);
    expect(row).toMatchObject({ page: 'lineups', teamId: IDS.girls });

    await act(() => vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS));
    [row] = await presenceRows(store);
    expect(row!.seenAt > firstSeen).toBe(true);
    const beforeHidden = row!.seenAt;

    // Hidden: no heartbeats.
    act(() => setHidden(true));
    await act(() => vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS * 3));
    [row] = await presenceRows(store);
    expect(row!.seenAt).toBe(beforeHidden);

    // Visible again: a heartbeat at once.
    act(() => setHidden(false));
    await act(() => vi.advanceTimersByTimeAsync(10));
    [row] = await presenceRows(store);
    expect(row!.seenAt > beforeHidden).toBe(true);
    expect(await presenceRows(store)).toHaveLength(1);

    unmount();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(await presenceRows(store)).toHaveLength(0);
  });

  it('sends nothing without a regatta or a signed-in user', async () => {
    const store = fixtureStore({ signedIn: null });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StoreProvider store={store}>{children}</StoreProvider>
    );
    renderHook(() => usePresence({ regattaId: IDS.regatta, page: 'schedule' }), { wrapper });
    renderHook(() => usePresence({ regattaId: null, page: 'schedule' }), { wrapper });
    await act(flush);
    expect(await store.list('presence')).toEqual([]);
  });
});

describe('useRegattaPresence', () => {
  it('lists other people seen in the last two minutes, live', async () => {
    const store = fixtureStore();
    const now = new Date().toISOString();
    await store.create('presence', {
      userId: IDS.admin,
      regattaId: IDS.regatta,
      page: 'lineups',
      teamId: IDS.girls,
      seenAt: now,
    });
    await store.create('presence', {
      userId: IDS.viewer,
      regattaId: IDS.regatta,
      page: 'schedule',
      seenAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    // My own row, and someone on another regatta: not listed.
    await store.create('presence', {
      userId: IDS.coach,
      regattaId: IDS.regatta,
      page: 'trailer',
      seenAt: now,
    });
    await store.create('presence', {
      userId: IDS.viewer,
      regattaId: IDS.other,
      page: 'schedule',
      seenAt: now,
    });

    const { result } = renderHook(() => useRegattaPresence(IDS.regatta), {
      wrapper: dataWrapper(store),
    });
    await waitFor(() => expect(result.current.viewers).toHaveLength(1));
    expect(result.current.viewers[0]).toMatchObject({
      name: 'Alex Admin',
      shortName: 'Alex A.',
      activity: 'editing Girls lineups',
      colorKey: 'raspberry',
    });

    // The viewer arrives: a realtime push, no refetch needed.
    await act(async () => {
      await store.create('presence', {
        userId: IDS.viewer,
        regattaId: IDS.regatta,
        page: 'schedule',
        seenAt: new Date().toISOString(),
      });
    });
    await waitFor(() => expect(result.current.viewers).toHaveLength(2));
    expect(result.current.viewers[1]).toMatchObject({
      shortName: 'Vic V.',
      activity: 'viewing the schedule',
    });

    // The admin leaves.
    const adminRow = (await presenceRows(store)).find((r) => r.userId === IDS.admin)!;
    await act(() => store.delete('presence', adminRow.id));
    await waitFor(() => expect(result.current.viewers.map((v) => v.shortName)).toEqual(['Vic V.']));
  });
});
