import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ActivityEntry } from '@srt/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import {
  ChangeCoalescer,
  describeChanges,
  remoteChange,
  type ChangeNotice,
  type RemoteChange,
} from './change-coalescer';
import { useChangeToasts } from './change-toasts';
import { shortUserName } from './collab-format';
import type { ChangeEvent } from './store';
import { useRegattaWorkingSet } from './working-set';

const names = new Map([
  [IDS.admin, 'Alex Admin'],
  [IDS.coach, 'Casey Coach'],
  [IDS.viewer, 'Vic Viewer'],
]);

function logEvent(row: Partial<ActivityEntry>): ChangeEvent {
  return {
    action: 'create',
    collection: 'activity_log',
    record: {
      id: 'activity0000001',
      regattaId: IDS.regatta,
      actorId: IDS.admin,
      action: 'update',
      targetType: 'entries',
      targetId: IDS.entry1,
      summary: 'moved entry Boys V4+ to Event 14',
      ...row,
    } as ActivityEntry,
  };
}

const ctx = { regattaId: IDS.regatta, meId: IDS.coach, names };

describe('remoteChange', () => {
  it("announces another user's change to the open regatta's working set", () => {
    expect(remoteChange(logEvent({}), ctx)).toEqual({
      actorId: IDS.admin,
      actorName: 'Alex A.',
      summary: 'moved entry Boys V4+ to Event 14',
    });
    for (const targetType of [
      'entry_seats',
      'events',
      'availability',
      'load_placements',
      'load_items',
      'entry', // older demo data
    ]) {
      expect(remoteChange(logEvent({ targetType }), ctx), targetType).not.toBeNull();
    }
  });

  it('stays quiet about my own writes, other regattas, and other collections', () => {
    expect(remoteChange(logEvent({ actorId: IDS.coach }), ctx)).toBeNull();
    expect(remoteChange(logEvent({ actorId: null }), ctx)).toBeNull();
    expect(remoteChange(logEvent({ regattaId: IDS.other }), ctx)).toBeNull();
    expect(remoteChange(logEvent({}), { ...ctx, regattaId: null })).toBeNull();
    expect(remoteChange(logEvent({ targetType: 'shells', regattaId: '' }), ctx)).toBeNull();
    expect(remoteChange(logEvent({ targetType: 'regatta_teams' }), ctx)).toBeNull();
    const entryEvent: ChangeEvent = {
      action: 'update',
      collection: 'entries',
      record: { id: IDS.entry1 } as never,
    };
    expect(remoteChange(entryEvent, ctx)).toBeNull();
    expect(remoteChange({ ...logEvent({}), action: 'delete' }, ctx)).toBeNull();
  });

  it('names an unknown user "Someone"', () => {
    expect(remoteChange(logEvent({ actorId: 'usernew00000001' }), ctx)!.actorName).toBe('Someone');
  });
});

describe('describeChanges', () => {
  const c = (actorName: string, summary = 'set seat 3 of Girls V8 to Ava Test'): RemoteChange => ({
    actorId: actorName,
    actorName,
    summary,
  });

  it('says who and what for one change', () => {
    expect(describeChanges([c('Sarah W.', 'moved entry Girls V4+ to Event 14')])).toEqual({
      title: 'Updated by Sarah W. just now',
      description: 'Moved entry Girls V4+ to Event 14',
    });
  });

  it('counts a burst, naming one, two, or several people', () => {
    expect(
      describeChanges([c('Sarah W.'), c('Sarah W.'), c('Sarah W.', 'cleared seat 4')]),
    ).toEqual({ title: 'Sarah W. made 3 changes', description: 'Cleared seat 4' });
    expect(describeChanges([c('Sarah W.'), c('Tom K.')]).title).toBe(
      'Sarah W. and Tom K. made 2 changes',
    );
    expect(describeChanges([c('Sarah W.'), c('Tom K.'), c('Dana R.'), c('Tom K.')]).title).toBe(
      'Sarah W. and 2 others made 4 changes',
    );
  });

  it('shortens names to first name and initial', () => {
    expect(shortUserName('Sarah Williams')).toBe('Sarah W.');
    expect(shortUserName('Mary Ann de la Cruz')).toBe('Mary C.');
    expect(shortUserName('Morgan')).toBe('Morgan');
    expect(shortUserName('  ')).toBe('Someone');
  });
});

describe('ChangeCoalescer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const change = (actorName: string): RemoteChange => ({
    actorId: actorName,
    actorName,
    summary: 'moved entry Girls V4+ to Event 14',
  });

  it('shows one toast per burst and updates it in place', () => {
    vi.useFakeTimers();
    const shown: ChangeNotice[] = [];
    const co = new ChangeCoalescer((n) => shown.push(n));
    co.push(change('Sarah W.'));
    vi.advanceTimersByTime(100);
    co.push(change('Sarah W.'));
    co.push(change('Sarah W.'));
    expect(shown).toHaveLength(0);
    vi.advanceTimersByTime(300);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ count: 3, title: 'Sarah W. made 3 changes' });

    // Still the same burst (within 2 s of the last change): same id, new count.
    vi.advanceTimersByTime(1500);
    co.push(change('Tom K.'));
    vi.advanceTimersByTime(300);
    expect(shown).toHaveLength(2);
    expect(shown[1]!.id).toBe(shown[0]!.id);
    expect(shown[1]).toMatchObject({ count: 4, title: 'Sarah W. and Tom K. made 4 changes' });

    // A quiet gap longer than the window starts a new toast.
    vi.advanceTimersByTime(2500);
    co.push(change('Tom K.'));
    vi.advanceTimersByTime(300);
    expect(shown).toHaveLength(3);
    expect(shown[2]!.id).not.toBe(shown[0]!.id);
    expect(shown[2]).toMatchObject({ count: 1, title: 'Updated by Tom K. just now' });
  });

  it('drops a pending toast on dispose and keeps working after', () => {
    vi.useFakeTimers();
    const show = vi.fn();
    const co = new ChangeCoalescer(show);
    co.push(change('Sarah W.'));
    co.dispose();
    vi.advanceTimersByTime(1000);
    expect(show).not.toHaveBeenCalled();
    co.push(change('Sarah W.'));
    vi.advanceTimersByTime(300);
    expect(show).toHaveBeenCalledTimes(1);
  });
});

describe('useChangeToasts', () => {
  it("toasts other people's changes once per burst, never my own, and the data refetches", async () => {
    const store = fixtureStore();
    const show = vi.fn();
    const { result } = renderHook(
      () => {
        useChangeToasts(IDS.regatta, show);
        return useRegattaWorkingSet(IDS.regatta);
      },
      { wrapper: dataWrapper(store) },
    );
    await waitFor(() => expect(result.current.data).toBeDefined());

    // My own write: the working set follows it, and no toast.
    await act(() => store.update('entries', IDS.entry1, { label: '2V4+' }));
    await waitFor(() =>
      expect(result.current.data!.byId.entries.get(IDS.entry1)!.label).toBe('2V4+'),
    );
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(show).not.toHaveBeenCalled();

    // Someone else's writes arrive as activity lines (the server's activity hook).
    const line = (summary: string) =>
      store.create('activity_log', {
        regattaId: IDS.regatta,
        actorId: IDS.admin,
        action: 'update',
        targetType: 'entry_seats',
        targetId: 'seatentry1s0001',
        summary,
      });
    await act(async () => {
      await line('cleared seat 1 of Boys V4+');
      await line('set seat 1 of Boys V4+ to Emery Sample');
    });
    await waitFor(() => expect(show).toHaveBeenCalledTimes(1));
    expect(show.mock.calls[0]![0]).toMatchObject({
      count: 2,
      title: 'Alex A. made 2 changes',
      description: 'Set seat 1 of Boys V4+ to Emery Sample',
    });

    // Another regatta's changes stay quiet.
    await act(async () => {
      await store.create('activity_log', {
        regattaId: IDS.other,
        actorId: IDS.admin,
        action: 'create',
        targetType: 'events',
        targetId: 'eventtail000001',
        summary: 'added Event 1',
      });
    });
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(show).toHaveBeenCalledTimes(1);
  });
});
