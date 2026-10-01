// Role checks (PLAN.md §2, §8.2). The server enforces the same rules; these only decide what
// the UI offers. Viewers read everything and comment. Offline, every action is off (§10.4).

import type { Role } from '@regatta-ops/domain';

export const ACTIONS = {
  /** Regattas, events, entries, seats, publishing (coach and admin). */
  'regatta.edit': ['admin', 'coach'],
  /** Availability for a regatta. */
  'availability.edit': ['admin', 'coach'],
  /** Athletes on a roster. */
  'roster.edit': ['admin', 'coach'],
  /** Shells, oar sets, gear. */
  'fleet.edit': ['admin', 'coach'],
  /** Load plans, placements, the load list, regatta rule overrides. */
  'load.edit': ['admin', 'coach'],
  /** Archive a regatta. */
  'regatta.archive': ['admin'],
  /** Teams: create, rename, color, archive. */
  'team.manage': ['admin'],
  /** Trailers, shelves, compartments, default rules. */
  'trailer.manage': ['admin'],
  /** Users and roles. */
  'users.manage': ['admin'],
  /** Club defaults. */
  'settings.manage': ['admin'],
  comment: ['admin', 'coach', 'viewer'],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof ACTIONS;

export interface CanOptions {
  /**
   * Offline, every action is off (PLAN.md §10.4): each one writes, and writes need the server.
   * Default true.
   */
  online?: boolean;
}

export function can(
  role: Role | null | undefined,
  action: Action,
  { online = true }: CanOptions = {},
): boolean {
  if (!role || !online) return false;
  return (ACTIONS[action] as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  coach: 'Coach',
  viewer: 'Viewer',
};
