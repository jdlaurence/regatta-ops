// Presence hooks (PLAN.md §4.6, §10.3). usePresence keeps the signed-in user's row for the open
// regatta fresh; useRegattaPresence lists everyone else seen there in the last 2 minutes.
// Heartbeats do not go through TanStack mutations (no toasts, no optimistic state), and pushes
// patch the cached presence list in place rather than refetching it on every heartbeat.

import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Presence, TeamColorKey } from '@srt/domain';
import { shortUserName } from './collab-format';
import { useStore } from './context';
import { useCurrentUser, useList } from './hooks';
import { applyChange } from './optimistic';
import {
  activeViewers,
  PRESENCE_HEARTBEAT_MS,
  PresenceBeacon,
  type IdStorage,
  type PresenceViewer,
} from './presence-beacon';
import { useNow } from './use-now';

function sessionStore(): IdStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

export interface UsePresenceOptions {
  /** The open regatta; null sends nothing (and leaves any regatta this tab was on). */
  regattaId: string | null | undefined;
  /** 'overview' | 'schedule' | 'lineups' | 'availability' | 'trailer' | 'load' */
  page: string;
  /** The team on a lineups page. */
  teamId?: string | null;
}

/**
 * Announce the signed-in user on a regatta: a heartbeat now, on every page change, and every
 * 30 s while the tab is visible. Paused while hidden (the row then expires on its own); the
 * row is deleted on unmount and on pagehide, best effort.
 */
export function usePresence({ regattaId, page, teamId = null }: UsePresenceOptions) {
  const store = useStore();
  const user = useCurrentUser();
  const userId = user?.id ?? null;
  const beacon = useMemo(() => new PresenceBeacon(store, { storage: sessionStore() }), [store]);
  const where = useRef({ page, teamId });

  useEffect(() => {
    where.current = { page, teamId };
  });

  // Right away, and again whenever the page or team changes.
  useEffect(() => {
    if (!regattaId || !userId || isHidden()) return;
    void beacon.beat(userId, { regattaId, page, teamId });
  }, [beacon, regattaId, userId, page, teamId]);

  // The heartbeat, visibility, and leaving.
  useEffect(() => {
    if (!regattaId || !userId) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = () => void beacon.beat(userId, { regattaId, ...where.current });
    const start = () => {
      timer ??= setInterval(beat, PRESENCE_HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (isHidden()) stop();
      else {
        beat();
        start();
      }
    };
    const onPageHide = () => {
      stop();
      void beacon.leave(regattaId);
    };
    if (!isHidden()) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void beacon.leave(regattaId);
    };
  }, [beacon, regattaId, userId]);
}

export interface RegattaPresence {
  /** Everyone else on the regatta in the last 2 minutes, by name. */
  viewers: PresenceViewer[];
  /** The clock the list was computed with (ticks every 15 s), for "just now" labels. */
  now: Date;
  isPending: boolean;
}

/** The other people on a regatta right now, kept live by realtime and a 15 s clock. */
export function useRegattaPresence(regattaId: string | null | undefined): RegattaPresence {
  const store = useStore();
  const qc = useQueryClient();
  const me = useCurrentUser();
  const meId = me?.id ?? null;
  const enabled = !!regattaId && !!meId;
  const rows = useList('presence', { where: { regattaId: regattaId ?? '' } }, { enabled });
  // Same keys as the working set, so these are cache hits on regatta pages.
  const users = useList('users', { sort: 'name' }, { enabled });
  const teams = useList('teams', { sort: ['sortOrder', 'name'] }, { enabled });
  const now = useNow(15_000);

  useEffect(() => {
    if (!enabled) return;
    return store.subscribe('presence', (event) => {
      if (event.action === 'delete') {
        applyChange(qc, { type: 'delete', collection: 'presence', id: event.record.id });
      } else {
        // A create change upserts into every cached presence list it matches.
        applyChange(qc, { type: 'create', collection: 'presence', record: event.record });
      }
    });
  }, [store, qc, enabled]);

  const viewers = useMemo(() => {
    const userMap = new Map((users.data ?? []).map((u) => [u.id, u]));
    const teamMap = new Map(
      (teams.data ?? []).map((t) => [
        t.id,
        { id: t.id, name: t.name, shortName: t.shortName, colorKey: t.colorKey as TeamColorKey },
      ]),
    );
    return activeViewers((rows.data ?? []) as Presence[], {
      now: now.getTime(),
      meId,
      users: userMap,
      teams: teamMap,
      shortName: shortUserName,
    });
  }, [rows.data, users.data, teams.data, now, meId]);

  return { viewers, now, isPending: enabled && (rows.isPending || users.isPending) };
}
