// URLs of the print views (PLAN.md §6.12). Other pages link here through these helpers:
//
//   /print/regattas/:id/lineups/:teamId?day=&source=published|live&layout=sheet|grid&boats=strip|names
//       (:teamId may be "all" for every participating team)
//   /print/regattas/:id/schedule?day=&team=&view=day|master&source=published|live
//   /print/regattas/:id/load/:trailerId
//
// Omitted parameters take their defaults: every day, the published lineups (the live draft for
// a team that has not published), the lineup sheet with boat strips, the day schedule for
// every team.

export interface PrintLineupsOptions {
  day?: string | null;
  source?: 'published' | 'live';
  layout?: 'sheet' | 'grid';
  boats?: 'strip' | 'names';
}

export interface PrintScheduleOptions {
  day?: string | null;
  team?: string | null;
  view?: 'day' | 'master';
  source?: 'published' | 'live';
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
    view: options.view === 'master' ? 'master' : null,
    day: options.day,
    team: options.team,
    source: options.source === 'live' ? 'live' : null,
  })}`;
}

export function printLoadPath(regattaId: string, trailerId: string): string {
  return `/print/regattas/${regattaId}/load/${trailerId}`;
}
