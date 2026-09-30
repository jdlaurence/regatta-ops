import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  createNetworkMonitor,
  isNetworkError,
  OFFLINE_EDIT_MESSAGE,
  OfflineError,
  settleWhenOffline,
  useOnline,
} from './online';
import { StoreError } from './store';

const offline = (target: EventTarget) => target.dispatchEvent(new Event('offline'));
const online = (target: EventTarget) => target.dispatchEvent(new Event('online'));
/** Let pending probe results land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('createNetworkMonitor', () => {
  it('follows the browser', () => {
    const target = new EventTarget();
    const monitor = createNetworkMonitor({ target });
    const changed = vi.fn();
    monitor.subscribe(changed);
    expect(monitor.isOnline()).toBe(true);
    offline(target);
    expect(monitor.isOnline()).toBe(false);
    online(target);
    expect(monitor.isOnline()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('starts offline when the browser does', () => {
    const monitor = createNetworkMonitor({ target: new EventTarget(), initialOnline: false });
    expect(monitor.isOnline()).toBe(false);
  });

  it('checks the server as soon as it has a probe', async () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    const probe = vi.fn().mockResolvedValue(false);
    monitor.setProbe(probe);
    expect(probe).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(monitor.isOnline()).toBe(false));
  });

  it('does not probe while the browser is offline', () => {
    const monitor = createNetworkMonitor({ target: new EventTarget(), initialOnline: false });
    const probe = vi.fn().mockResolvedValue(true);
    monitor.setProbe(probe);
    monitor.reportFailure();
    expect(probe).not.toHaveBeenCalled();
  });

  it('goes offline after a failed request only when the probe confirms it', async () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    const probe = vi.fn().mockResolvedValue(true);
    monitor.setProbe(probe);
    await settle();

    // One dropped request on a weak signal: the server still answers.
    monitor.reportFailure();
    expect(probe).toHaveBeenCalledTimes(2);
    await settle();
    expect(monitor.isOnline()).toBe(true);

    probe.mockResolvedValue(false);
    monitor.reportFailure();
    await vi.waitFor(() => expect(monitor.isOnline()).toBe(false));
  });

  it('treats a probe that throws as no answer', async () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    monitor.setProbe(() => Promise.reject(new TypeError('Failed to fetch')));
    await vi.waitFor(() => expect(monitor.isOnline()).toBe(false));
  });

  it('ignores failed requests without a probe (demo mode trusts the browser)', () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    monitor.reportFailure();
    expect(monitor.isOnline()).toBe(true);
  });

  it('keeps checking while the server is unreachable, and comes back when it answers', async () => {
    vi.useFakeTimers();
    const monitor = createNetworkMonitor({ target: new EventTarget(), probeIntervalMs: 5_000 });
    const probe = vi.fn().mockResolvedValue(false);
    monitor.setProbe(probe);
    await vi.advanceTimersByTimeAsync(0);
    expect(monitor.isOnline()).toBe(false);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(monitor.isOnline()).toBe(false);

    probe.mockResolvedValue(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(monitor.isOnline()).toBe(true);

    // Reachable again: no more polling.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('does not poll while the browser is offline', async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const monitor = createNetworkMonitor({ target, probeIntervalMs: 5_000 });
    const probe = vi.fn().mockResolvedValue(false);
    monitor.setProbe(probe);
    await vi.advanceTimersByTimeAsync(0);
    offline(target);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(probe).toHaveBeenCalledTimes(1);

    // Back online: check right away rather than trusting the browser.
    probe.mockResolvedValue(true);
    online(target);
    await vi.advanceTimersByTimeAsync(0);
    expect(probe).toHaveBeenCalledTimes(2);
    expect(monitor.isOnline()).toBe(true);
  });

  it('comes back online when a request reaches the server', async () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    monitor.setProbe(() => Promise.resolve(false));
    await vi.waitFor(() => expect(monitor.isOnline()).toBe(false));
    monitor.reportSuccess();
    expect(monitor.isOnline()).toBe(true);
  });

  it('forgets an outage when the probe is removed', async () => {
    const monitor = createNetworkMonitor({ target: new EventTarget() });
    monitor.setProbe(() => Promise.resolve(false));
    await vi.waitFor(() => expect(monitor.isOnline()).toBe(false));
    monitor.setProbe(null);
    expect(monitor.isOnline()).toBe(true);
  });
});

describe('useOnline', () => {
  afterEach(() => {
    window.dispatchEvent(new Event('online'));
  });

  it('re-renders when the connection drops and returns', () => {
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => void window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);
    act(() => void window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });
});

describe('errors', () => {
  it('knows a network error from a refusal by the server', () => {
    expect(isNetworkError(new StoreError('network', 'Could not reach the server.'))).toBe(true);
    expect(isNetworkError(new StoreError('forbidden', 'No.', 403))).toBe(false);
    expect(isNetworkError(new Error('boom'))).toBe(false);
    const refusal = new OfflineError();
    expect(isNetworkError(refusal)).toBe(true);
    expect(refusal.message).toBe(OFFLINE_EDIT_MESSAGE);
  });
});

describe('settleWhenOffline', () => {
  it('turns a query paused with nothing cached into an error that says why', () => {
    const settled = settleWhenOffline({
      status: 'pending',
      isPending: true,
      isLoading: true,
      isError: false,
      fetchStatus: 'paused' as const,
      error: null as unknown,
    });
    expect(settled).toMatchObject({ status: 'error', isPending: false, isError: true });
    expect((settled.error as Error).message).toBe(
      "It isn't saved on this device yet. Reconnect to load it.",
    );
  });

  it('leaves loading, loaded, and paused-with-data queries alone', () => {
    const loading = { isPending: true, fetchStatus: 'fetching' as const };
    const loaded = { isPending: false, fetchStatus: 'paused' as const, data: [1] };
    expect(settleWhenOffline(loading)).toBe(loading);
    expect(settleWhenOffline(loaded)).toBe(loaded);
  });
});
