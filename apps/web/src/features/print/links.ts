// URLs of the print views. Other pages link here through these helpers:
//
//   /print/regattas/:id/lineups/:teamId?day=&source=published|live&layout=sheet|grid&boats=strip|names
//       (:teamId may be "all" for every participating team)
//   /print/regattas/:id/schedule?day=&team=&view=list|day|master&source=published|live
//       (view=list also takes the schedule page's class=, shell=, and entries=hide)
//   /print/regattas/:id/load/:trailerId
//
// Omitted parameters take their defaults: every day, the published lineups (the live draft for
// a team that has not published), the lineup sheet with boat strips, the day schedule for
// every team, entries listed under their races.

export interface PrintLineupsOptions {
  day?: string | null;
  source?: 'published' | 'live';
  layout?: 'sheet' | 'grid';
  boats?: 'strip' | 'names';
}

export interface PrintScheduleOptions {
  day?: string | null;
  team?: string | null;
  view?: 'list' | 'day' | 'master';
  source?: 'published' | 'live';
  /** List view: the schedule page's class and shell filters. */
  boatClass?: string | null;
  shell?: string | null;
  /** List view: the "Show entries" switch (on when left out). */
  entries?: boolean;
}

function query(params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function printLineupsPath(
  regattaId: string,
  teamId: string | 'all',
  options: PrintLineupsOptions = {},
): string {
  return `/print/regattas/${regattaId}/lineups/${teamId}${query({
    day: options.day,
    source: options.source === 'live' ? 'live' : null,
    layout: options.layout === 'grid' ? 'grid' : null,
    boats: options.boats === 'names' ? 'names' : null,
  })}`;
}

export function printSchedulePath(regattaId: string, options: PrintScheduleOptions = {}): string {
  return `/print/regattas/${regattaId}/schedule${query({
    view: options.view === 'master' || options.view === 'list' ? options.view : null,
    day: options.day,
    team: options.team,
    class: options.boatClass,
    shell: options.shell,
    entries: options.entries === false ? 'hide' : null,
    source: options.source === 'live' ? 'live' : null,
  })}`;
}

export function printLoadPath(regattaId: string, trailerId: string): string {
  return `/print/regattas/${regattaId}/load/${trailerId}`;
}
