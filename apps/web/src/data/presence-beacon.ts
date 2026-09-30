// Presence rows (PLAN.md §4.6, §8.1 presence, §10.3): one row per open tab per regatta, kept
// fresh by a heartbeat every 30 s and ignored after 2 minutes (the server prunes them). This file
// is the store-facing part without React or the DOM, so the real-backend test drives it too;
// data/presence.ts adds the hooks.

import type { Presence, TeamColorKey, User } from '@srt/domain';
import type { DataStore } from './store';

export const PRESENCE_HEARTBEAT_MS = 30_000;
/** Rows older than this are ignored (and pruned by housekeeping.pb.js). */
export const PRESENCE_TTL_MS = 2 * 60_000;

/** The regatta pages presence knows how to describe. */
export type PresencePage =
  'overview' | 'schedule' | 'lineups' | 'availability' | 'trailer' | 'load';

export interface PresenceTarget {
  regattaId: string;
  page: string;
  teamId?: string | null;
}

/** Just enough of Web Storage (sessionStorage in the app) to remember a tab's row id. */
export interface IdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storageKey = (regattaId: string) => `srt-presence:${regattaId}`;

/**
 * One tab's presence. `beat` creates or refreshes this tab's row for a regatta; `leave` deletes
 * it. Calls run one at a time in order, so a leave queued behind a create deletes that row.
 * The row id survives a reload through `storage` (sessionStorage is per tab), so reloading
 * refreshes the same row instead of leaving an orphan. Errors are swallowed: presence is a
 * courtesy, never a reason to bother the coach.
 */
export class PresenceBeacon {
  private readonly store: DataStore;
  private readonly storage: IdStorage | null;
  private readonly now: () => string;
  private ids = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(store: DataStore, options: { storage?: IdStorage | null; now?: () => string } = {}) {
    this.store = store;
    this.storage = options.storage ?? null;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** The row id this tab holds for a regatta, if any (tests). */
  rowId(regattaId: string): string | null {
    return this.ids.get(regattaId) ?? null;
  }

  beat(userId: string, target: PresenceTarget): Promise<void> {
    return this.enqueue(() => this.doBeat(userId, target));
  }

  leave(regattaId: string): Promise<void> {
    return this.enqueue(() => this.doLeave(regattaId));
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.queue.then(fn).catch(() => undefined);
    this.queue = run;
    return run;
  }

  private async doBeat(userId: string, { regattaId, page, teamId }: PresenceTarget) {
    const seenAt = this.now();
    const fields = { page, teamId: teamId ?? null, seenAt };
    const id = this.ids.get(regattaId) ?? this.read(regattaId);
    if (id) {
      try {
        const row = await this.store.update('presence', id, fields);
        if (row.userId === userId && row.regattaId === regattaId) {
          this.remember(regattaId, id);
          return;
        }
      } catch {
        // Pruned while the tab was hidden, or someone else's id: start a new row.
      }
      this.forget(regattaId);
    }
    const row = await this.store.create('presence', { userId, regattaId, ...fields });
    this.remember(regattaId, row.id);
  }

  private async doLeave(regattaId: string) {
    const id = this.ids.get(regattaId) ?? this.read(regattaId);
    this.forget(regattaId);
    if (!id) return;
    try {
      await this.store.delete('presence', id);
    } catch {
      // Already pruned; nothing to do.
    }
  }

  private read(regattaId: string): string | null {
    try {
      return this.storage?.getItem(storageKey(regattaId)) ?? null;
    } catch {
      return null;
    }
  }

  private remember(regattaId: string, id: string) {
    this.ids.set(regattaId, id);
    try {
      this.storage?.setItem(storageKey(regattaId), id);
    } catch {
      // Storage can be unavailable (private windows); the row still works for this page load.
    }
  }

  private forget(regattaId: string) {
    this.ids.delete(regattaId);
    try {
      this.storage?.removeItem(storageKey(regattaId));
    } catch {
      // See remember().
    }
  }
}

/** Whether a presence row was seen within the TTL of `now`. */
export function isFresh(row: Pick<Presence, 'seenAt' | 'updated'>, now: number): boolean {
  const seen = Date.parse(row.seenAt || row.updated || '');
  if (Number.isNaN(seen)) return false;
  return now - seen <= PRESENCE_TTL_MS;
}

export interface PresenceViewer {
  userId: string;
  /** Full name. */
  name: string;
  /** "Sarah W." */
  shortName: string;
  page: string;
  teamId: string | null;
  /** Team color for the avatar ring: the page's team, else the user's default team. */
  colorKey: TeamColorKey | null;
  /** ISO instant of the latest heartbeat. */
  seenAt: string;
  /** "editing Girls lineups" */
  activity: string;
}

type TeamInfo = { id: string; name: string; shortName?: string; colorKey: TeamColorKey };

/** "editing Girls lineups", "viewing the schedule" (viewers never edit). */
export function presenceActivity(
  page: string,
  team: Pick<TeamInfo, 'name' | 'shortName'> | null | undefined,
  role?: User['role'],
): string {
  const verb = role === 'viewer' ? 'viewing' : 'editing';
  const teamName = team ? team.shortName || team.name : '';
  switch (page as PresencePage) {
    case 'lineups':
      return teamName ? `${verb} ${teamName} lineups` : `${verb} lineups`;
    case 'schedule':
      return `${verb} the schedule`;
    case 'availability':
      return `${verb} availability`;
    case 'trailer':
      return `${verb} the trailer`;
    case 'load':
      return `${verb} the load list`;
    case 'overview':
      return 'viewing the overview';
    default:
      return 'viewing this regatta';
  }
}

/**
 * The other people on a regatta right now: fresh rows only, the signed-in user left out, one
 * entry per person (their latest row), in name order so avatars do not shuffle on heartbeats.
 */
export function activeViewers(
  rows: readonly Presence[],
  context: {
    now: number;
    meId: string | null | undefined;
    users: ReadonlyMap<string, Pick<User, 'name' | 'role' | 'defaultTeamId'>>;
    teams: ReadonlyMap<string, TeamInfo>;
    shortName: (name: string) => string;
  },
): PresenceViewer[] {
  const latest = new Map<string, Presence>();
  for (const row of rows) {
    if (!row.userId || row.userId === context.meId) continue;
    if (!isFresh(row, context.now)) continue;
    const prev = latest.get(row.userId);
    if (!prev || (row.seenAt || '') > (prev.seenAt || '')) latest.set(row.userId, row);
  }
  const viewers: PresenceViewer[] = [];
  for (const row of latest.values()) {
    const user = context.users.get(row.userId);
    if (!user) continue;
    const team = row.teamId ? context.teams.get(row.teamId) : undefined;
    const home = user.defaultTeamId ? context.teams.get(user.defaultTeamId) : undefined;
    viewers.push({
      userId: row.userId,
      name: user.name,
      shortName: context.shortName(user.name),
      page: row.page,
      teamId: row.teamId ?? null,
      colorKey: (team ?? home)?.colorKey ?? null,
      seenAt: row.seenAt || row.updated || '',
      activity: presenceActivity(row.page, team, user.role),
    });
  }
  return viewers.sort((a, b) => a.name.localeCompare(b.name));
}

/** The presence page and team for a path under /regattas/:id, or null outside a regatta. */
export function presencePageFromPath(
  pathname: string,
): { regattaId: string; page: PresencePage; teamId: string | null } | null {
  const m = /^\/regattas\/([^/]+)(?:\/([^/?#]+))?(?:\/([^/?#]+))?/.exec(pathname);
  if (!m) return null;
  const regattaId = decodeURIComponent(m[1]!);
  const segment = m[2] ?? '';
  const pages: Record<string, PresencePage> = {
    '': 'overview',
    schedule: 'schedule',
    lineups: 'lineups',
    availability: 'availability',
    trailer: 'trailer',
    load: 'load',
  };
  const page = pages[segment] ?? 'overview';
  const teamId = page === 'lineups' && m[3] ? decodeURIComponent(m[3]) : null;
  return { regattaId, page, teamId };
}
