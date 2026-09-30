// The empty World and small helpers shared by the builders.

import type { World } from '@srt/domain';

export function emptyWorld(): World {
  return {
    users: [],
    teams: [],
    athletes: [],
    regattas: [],
    regatta_teams: [],
    availability: [],
    events: [],
    entries: [],
    entry_seats: [],
    shells: [],
    oar_sets: [],
    gear_items: [],
    trailers: [],
    trailer_shelves: [],
    trailer_compartments: [],
    load_plans: [],
    load_placements: [],
    load_items: [],
    comments: [],
    activity_log: [],
    presence: [],
    share_links: [],
    club_settings: [],
  };
}

/** Deep copy of plain JSON data, so seeded records never share objects with domain constants. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Round to one decimal place (weights in kg). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** The time zone of every seeded regatta and of the club. */
export const TZ = 'America/Los_Angeles';
