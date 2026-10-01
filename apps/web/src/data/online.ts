// Network status. The app is offline when
// the browser says so, or when a check of the server fails: once on load, after any request
// that could not reach it, and every few seconds until it answers again. navigator.onLine alone
// is not enough; it stays true on boathouse wifi with no internet behind it. Offline, pages
// show the copy of the data saved on this device and editing is off: useCan answers false and
// mutations refuse with a toast (hooks.ts).
//
// TanStack Query reads the same status (bridgeQueryOnlineManager), so queries pause instead of
// failing while offline and refetch when the connection comes back.

import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { StoreError } from './store';

export const OFFLINE_EDIT_MESSAGE = "You're offline. Editing is off until you reconnect.";

/** Toast id for the offline refusal, so repeated attempts replace one toast. */
export const OFFLINE_TOAST_ID = 'regatta-ops-offline-refusal';

/** A write attempted while offline. Nothing was sent and nothing changed on screen. */
export class OfflineError extends StoreError {
  constructor() {
    super('network', OFFLINE_EDIT_MESSAGE, 0);
    this.name = 'OfflineError';
  }
}

/** The request never reached the server (as opposed to the server saying no). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof StoreError && err.code === 'network';
}

/** Resolves true when the server answers. Should not throw; a throw counts as false. */
export type Probe = () => Promise<boolean>;

export interface NetworkMonitor {
  isOnline(): boolean;
  subscribe(listener: () => void): () => void;
  /** A request failed without reaching the server: check, and go offline if it is down. */
  reportFailure(): void;
  /** A request reached the server: it is reachable again. */
  reportSuccess(): void;
  /**
   * How to check the server; checks once right away. Without one, only the browser's own
   * status counts.
   */
  setProbe(probe: Probe | null): void;
}

type EventSource = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface NetworkMonitorOptions {
  /** Where 'online', 'offline', 'focus', and 'visibilitychange' arrive (window). */
  target?: EventSource | null;
  initialOnline?: boolean;
  /** While the server is unreachable, check it this often. */
  probeIntervalMs?: number;
}

export function createNetworkMonitor({
  target = null,
  initialOnline = true,
  probeIntervalMs = 5_000,
}: NetworkMonitorOptions = {}): NetworkMonitor {
  let browserOnline = initialOnline;
  let serverReachable = true;
  let probe: Probe | null = null;
  let inflight: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<() => void>();

  const isOnline = () => browserOnline && serverReachable;

  const update = (fn: () => void) => {
    const before = isOnline();
    fn();
    if (serverReachable || !browserOnline || !probe) stopPolling();
    else startPolling();
    if (isOnline() !== before) for (const l of [...listeners]) l();
  };

  const check = (): Promise<boolean> => {
    if (!probe) return Promise.resolve(true);
    inflight ??= probe()
      .catch(() => false)
      .then((ok) => {
        inflight = null;
        update(() => {
          // A check that finishes after its probe was removed proves nothing.
          serverReachable = probe ? ok : true;
        });
        return ok;
      });
    return inflight;
  };

  function startPolling() {
    timer ??= setInterval(() => void check(), probeIntervalMs);
  }
  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  const recheck = () => {
    if (browserOnline && !serverReachable) void check();
  };

  target?.addEventListener('online', () => {
    update(() => {
      browserOnline = true;
      // Without a probe there is nothing better to go on than the browser.
      if (!probe) serverReachable = true;
    });
    recheck();
  });
  target?.addEventListener('offline', () => update(() => (browserOnline = false)));
  target?.addEventListener('focus', recheck);
  target?.addEventListener('visibilitychange', recheck);

  return {
    isOnline,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reportFailure() {
      // Only a confirmed outage counts: one dropped request on a weak signal is not "offline".
      if (!probe || !browserOnline || !serverReachable) return;
      void check();
    },
    reportSuccess() {
      if (!serverReachable) update(() => (serverReachable = true));
    },
    setProbe(next) {
      probe = next;
      update(() => {
        if (!probe) serverReachable = true;
      });
      if (probe && browserOnline) void check();
    },
  };
}

/** The app's one monitor, watching this window. */
export const networkMonitor: NetworkMonitor = createNetworkMonitor({
  target: typeof window === 'undefined' ? null : window,
  initialOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
});

/** Whether the app can reach the server. Re-renders when it changes. */
export function useOnline(): boolean {
  return useSyncExternalStore(networkMonitor.subscribe, networkMonitor.isOnline, () => true);
}

/** Make TanStack Query pause and resume with the monitor instead of the bare browser events. */
export function bridgeQueryOnlineManager(monitor: NetworkMonitor = networkMonitor): void {
  onlineManager.setEventListener((setOnline) => {
    setOnline(monitor.isOnline());
    return monitor.subscribe(() => setOnline(monitor.isOnline()));
  });
}

/**
 * Reachable when the URL answers at all: an error status still means the network works. The
 * URL must not be one the service worker answers from its cache.
 */
export function httpProbe(url: () => string): Probe {
  return async () => {
    await fetch(url(), { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    return true;
  };
}

/** PocketBase's health endpoint (same origin unless VITE_PB_URL says otherwise). */
export function pocketBaseHealthUrl(baseUrl = import.meta.env.VITE_PB_URL || '/'): string {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`, window.location.href);
  return new URL('api/health', base).href;
}

/**
 * The server that serves the app, for demo mode (no API). The query string keeps the service
 * worker's precache from answering, so the request reaches the network.
 */
export function appServerUrl(): string {
  const icon = `${import.meta.env.BASE_URL}favicon.svg?online=${Date.now()}`;
  return new URL(icon, window.location.href).href;
}

// ---------------------------------------------------------------------------
// Queries that cannot load offline

const NOT_SAVED = new StoreError(
  'network',
  "It isn't saved on this device yet. Reconnect to load it.",
  0,
);

interface PausableResult {
  isPending: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
}

/**
 * A query with nothing cached pauses while offline and would show its skeleton forever.
 * Report it as an error instead, so the page shows its error state with the reason; it loads
 * on its own when the connection comes back.
 */
export function settleWhenOffline<R extends PausableResult>(result: R): R {
  if (!(result.isPending && result.fetchStatus === 'paused')) return result;
  return {
    ...result,
    status: 'error',
    isPending: false,
    isLoading: false,
    isError: true,
    isLoadingError: true,
    error: NOT_SAVED,
  };
}
