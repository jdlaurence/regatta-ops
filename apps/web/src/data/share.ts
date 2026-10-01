// Share links, the public side. A share link's page is read without signing in, so it does not
// use collections: the server answers two public routes (backend/README.md "Share links"). This
// module is the only place the app knows those URLs.
//
//   GET  /api/regatta-ops/share/{token}                   → ShareView
//   POST /api/regatta-ops/share/{token}/load-items/{id}   { loaded?, returned?, by? } → { item }
//
// Two implementations of ShareApi, picked from the DataStore: PocketBase calls the routes with
// fetch (no session: the token is the credential); demo mode (MemoryStore) builds the same
// projection from its world, field by field, so it never carries emails, notes, availability,
// rosters, or unpublished drafts either.
//
// Hooks: useShare(token) reads a link's page (polled, and kept on the device for offline
// reloads); useTickShareItem(token) ticks a load-list line with an optimistic update.

import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  BoatClass,
  CollectionName,
  EntryStatus,
  EventKind,
  EventStage,
  LoadItem,
  LoadItemKind,
  LoadPlan,
  PublishedEntry,
  Regatta,
  RegattaEvent,
  RegattaFormat,
  RegattaStatus,
  RegattaTeam,
  Seat,
  ShareLink,
  Team,
  TeamColorKey,
  Trailer,
  User,
} from '@regatta-ops/domain';
import { useStore } from './context';
import type { MemoryStore } from './memory-store';
import type { PocketBaseStore } from './pocketbase-store';
import { useRealtimeEvents } from './realtime';
import { StoreError, type DataStore, type Patch } from './store';

// ---------------------------------------------------------------------------
// The public JSON (backend/README.md, "GET /api/regatta-ops/share/{token}")

export interface ShareLinkInfo {
  scope: 'team' | 'regatta';
  /** The team a team-scoped link shows; null for the whole regatta. */
  teamId: string | null;
  canCheckLoad: boolean;
}

export interface ShareRegatta {
  id: string;
  name: string;
  venue: string;
  city: string;
  startDate: string;
  endDate: string;
  timezone: string;
  format: RegattaFormat;
  status: RegattaStatus;
}

export interface ShareSeat {
  seat: Seat;
  athleteId: string | null;
  athleteName: string;
}

/** A published entry: PublishedEntry with every optional text as '' and ids as null. */
export interface ShareEntry {
  entryId: string;
  label: string;
  boatClass: BoatClass;
  status: EntryStatus;
  eventId: string | null;
  eventName: string;
  eventNumber: string;
  day: string;
  scheduledAt: string | null;
  stage: EventStage | null;
  shellId: string | null;
  shellName: string;
  oarSetId: string | null;
  oarSetName: string;
  hotSeatPlan: string;
  seats: ShareSeat[];
}

export interface ShareTeam {
  id: string;
  name: string;
  shortName: string;
  colorKey: TeamColorKey;
  /** False when the team never published; `entries` is then empty. */
  published: boolean;
  publishedAt: string | null;
  entries: ShareEntry[];
}

/** One line of the live schedule. Entries' own times are as published; join on eventId. */
export interface ShareScheduleItem {
  id: string;
  kind: EventKind;
  eventNumber: string;
  name: string;
  boatClass: BoatClass | null;
  category: string;
  day: string;
  scheduledAt: string | null;
  stage: EventStage | null;
  progressionGroup: string;
  /** Logistics only: the teams the line is for, among those shown (empty = everyone). */
  teamIds: string[];
}

export interface ShareLoadItem {
  id: string;
  kind: LoadItemKind;
  label: string;
  quantity: number;
  container: string;
  trailerName: string | null;
  loaded: boolean;
  loadedAt: string | null;
  /** The user's name, else the name typed on a share link; null when not loaded. */
  loadedBy: string | null;
  returned: boolean;
  returnedAt: string | null;
  returnedBy: string | null;
}

export interface ShareView {
  generatedAt: string;
  clubName: string;
  link: ShareLinkInfo;
  regatta: ShareRegatta;
  /** Team-scoped: that team only; regatta-wide: every participating team, by sort order. */
  teams: ShareTeam[];
  /** By day, then time (unscheduled last), then sort order. */
  schedule: ShareScheduleItem[];
  /** Only when the link can check off the load list. By kind, then label. */
  loadItems?: ShareLoadItem[];
}

export interface ShareTickInput {
  loaded?: boolean;
  returned?: boolean;
  /** The name typed on the page ("Sam"); trimmed to 60 characters. */
  by?: string;
}

export interface ShareApi {
  /** The link's page. Unknown, malformed, and revoked tokens reject with code 'not_found'. */
  getShare(token: string): Promise<ShareView>;
  /**
   * Tick or untick one load-list line. Send the state you want, not a toggle: ticking a line
   * that is already ticked keeps the first time and name, so replaying is safe.
   */
  tickLoadItem(token: string, itemId: string, input: ShareTickInput): Promise<ShareLoadItem>;
}

export const SHARE_LINK_GONE = 'This link is no longer active. Ask your coach for a new one.';
const NO_SUCH_ITEM = 'This regatta has no such load list item.';
const CANNOT_CHECK = 'This link cannot check off the load list.';
const BAD_TICK = 'Send loaded or returned as true or false.';

const TOKEN_RE = /^[A-Za-z0-9_-]{16,100}$/;
const REQUEST_TIMEOUT_MS = 15_000;
const NAME_MAX = 60;
const KIND_ORDER: LoadItemKind[] = ['shell', 'riggers', 'oar_set', 'gear', 'extra'];

/** The share page's path for a token: `/share/<token>`. */
export function sharePath(token: string): string {
  return `/share/${encodeURIComponent(token)}`;
}

/** Whether an error means the link itself is gone (revoked, unknown, or malformed). */
export function isShareGone(err: unknown): boolean {
  return err instanceof StoreError && err.code === 'not_found';
}

/**
 * Whether a failure is worth retrying later: no connection, the server busy or down, or the
 * per-network rate limit. Anything else (403, 404, 400) will fail the same way again.
 */
export function isTransientShareError(err: unknown): boolean {
  if (err instanceof StoreError) {
    if (err.code === 'network') return true;
    const status = err.status ?? 0;
    return status === 429 || status >= 500;
  }
  return err instanceof TypeError;
}

/** Same cleanup as the server: control characters to spaces, runs collapsed, 60 characters. */
export function cleanShareName(v: unknown): string {
  if (typeof v !== 'string') return '';
  return (
    v
      // eslint-disable-next-line no-control-regex -- stripping control characters is the point
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NAME_MAX)
  );
}

/**
 * The line as it looks after a tick, the way the server applies it: ticking sets the time and
 * name only if the line was not ticked yet; unticking clears both.
 */
export function applyTick(
  item: ShareLoadItem,
  input: ShareTickInput,
  at: string = new Date().toISOString(),
): ShareLoadItem {
  const by = cleanShareName(input.by) || null;
  const next = { ...item };
  if (typeof input.loaded === 'boolean') {
    if (input.loaded && !item.loaded) {
      Object.assign(next, { loaded: true, loadedAt: at, loadedBy: by });
    }
    if (!input.loaded && item.loaded) {
      Object.assign(next, { loaded: false, loadedAt: null, loadedBy: null });
    }
  }
  if (typeof input.returned === 'boolean') {
    if (input.returned && !item.returned) {
      Object.assign(next, { returned: true, returnedAt: at, returnedBy: by });
    }
    if (!input.returned && item.returned) {
      Object.assign(next, { returned: false, returnedAt: null, returnedBy: null });
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Projection (demo mode). Mirrors backend/pb_hooks/regatta-ops/share.js field by field.

/** Everything the projection reads, as plain records. */
export interface ShareSource {
  link: ShareLink;
  regatta: Regatta;
  regattaTeams: RegattaTeam[];
  teams: Team[];
  events: RegattaEvent[];
  clubName: string;
  /** Only read when the link can check off the load list. */
  loadItems: LoadItem[];
  loadPlans: LoadPlan[];
  trailers: Trailer[];
  users: Pick<User, 'id' | 'name'>[];
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

function projectEntry(e: PublishedEntry): ShareEntry {
  const seats = Array.isArray(e.seats) ? e.seats : [];
  return {
    entryId: str(e.entryId),
    label: str(e.label),
    boatClass: str(e.boatClass) as BoatClass,
    status: str(e.status) as EntryStatus,
    eventId: strOrNull(e.eventId),
    eventName: str(e.eventName),
    eventNumber: str(e.eventNumber),
    day: str(e.day),
    scheduledAt: strOrNull(e.scheduledAt),
    stage: strOrNull(e.stage) as EventStage | null,
    shellId: strOrNull(e.shellId),
    shellName: str(e.shellName),
    oarSetId: strOrNull(e.oarSetId),
    oarSetName: str(e.oarSetName),
    hotSeatPlan: str(e.hotSeatPlan),
    seats: seats
      .filter((s) => s && typeof s === 'object')
      .map((s) => ({
        seat: str(s.seat) as Seat,
        athleteId: strOrNull(s.athleteId),
        athleteName: str(s.athleteName),
      })),
  };
}

function projectTeam(team: Team, rt: RegattaTeam | undefined): ShareTeam {
  const snapshot = rt?.publishedSnapshot ?? null;
  const entries =
    snapshot && Array.isArray(snapshot.entries)
      ? snapshot.entries.filter((x) => x && typeof x === 'object').map(projectEntry)
      : [];
  const publishedAt = strOrNull(rt?.publishedAt) ?? strOrNull(snapshot?.publishedAt);
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    colorKey: team.colorKey,
    published: !!snapshot && publishedAt !== null,
    publishedAt,
    entries,
  };
}

function projectEvent(ev: RegattaEvent, shownTeamIds: string[]): ShareScheduleItem {
  const logistics = ev.kind === 'logistics';
  return {
    id: ev.id,
    kind: ev.kind,
    eventNumber: str(ev.eventNumber),
    name: str(ev.name),
    boatClass: (strOrNull(ev.boatClass) as BoatClass | null) ?? null,
    category: str(ev.category),
    day: str(ev.day),
    scheduledAt: strOrNull(ev.scheduledAt),
    stage: (strOrNull(ev.stage) as EventStage | null) ?? null,
    progressionGroup: str(ev.progressionGroup),
    teamIds: logistics ? (ev.teamFilter ?? []).filter((t) => shownTeamIds.includes(t)) : [],
  };
}

function loadItemProjector(source: Pick<ShareSource, 'loadPlans' | 'trailers' | 'users'>) {
  const names = new Map(source.users.map((u) => [u.id, u.name]));
  const plans = new Map(source.loadPlans.map((p) => [p.id, p]));
  const trailers = new Map(source.trailers.map((t) => [t.id, t.name]));
  const trailerName = (planId: string | null | undefined): string | null => {
    const plan = planId ? plans.get(planId) : undefined;
    return (plan && trailers.get(plan.trailerId)) ?? null;
  };
  return (item: LoadItem): ShareLoadItem => {
    const loadedAt = strOrNull(item.loadedAt);
    const returnedAt = strOrNull(item.returnedAt);
    const who = (userId: string | null | undefined, typed: string | undefined) =>
      (userId && names.get(userId)) || typed || null;
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      quantity: item.quantity ?? 0,
      container: str(item.container),
      trailerName: trailerName(item.loadPlanId),
      loaded: loadedAt !== null,
      loadedAt,
      loadedBy: loadedAt ? who(item.loadedBy, item.loadedByName) : null,
      returned: returnedAt !== null,
      returnedAt,
      returnedBy: returnedAt ? who(item.returnedBy, item.returnedByName) : null,
    };
  };
}

function kindRank(kind: string): number {
  const i = KIND_ORDER.indexOf(kind as LoadItemKind);
  return i === -1 ? KIND_ORDER.length : i;
}

/** The read-only page for a link, built like the server's GET route. */
export function projectShare(source: ShareSource, generatedAt: string): ShareView {
  const { link, regatta } = source;
  const scopedTeam = link.teamId || null;
  const teamIds = scopedTeam ? [scopedTeam] : source.regattaTeams.map((rt) => rt.teamId);
  const teamsById = new Map(source.teams.map((t) => [t.id, t]));
  const teams = teamIds
    .map((id) => teamsById.get(id))
    .filter((t): t is Team => !!t)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((team) =>
      projectTeam(
        team,
        source.regattaTeams.find((rt) => rt.teamId === team.id),
      ),
    );
  const shownTeamIds = teams.map((t) => t.id);

  const schedule = source.events
    .filter((ev) => {
      if (!scopedTeam || ev.kind !== 'logistics') return true;
      const only = ev.teamFilter ?? [];
      return only.length === 0 || only.includes(scopedTeam);
    })
    .sort((a, b) => {
      const day = a.day.localeCompare(b.day);
      if (day) return day;
      const at = a.scheduledAt ?? '';
      const bt = b.scheduledAt ?? '';
      if (at !== bt) {
        if (!at) return 1;
        if (!bt) return -1;
        return at < bt ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    })
    .map((ev) => projectEvent(ev, shownTeamIds));

  const view: ShareView = {
    generatedAt,
    clubName: source.clubName,
    link: {
      scope: scopedTeam ? 'team' : 'regatta',
      teamId: scopedTeam,
      canCheckLoad: link.canCheckLoad,
    },
    regatta: {
      id: regatta.id,
      name: regatta.name,
      venue: str(regatta.venue),
      city: str(regatta.city),
      startDate: regatta.startDate,
      endDate: str(regatta.endDate),
      timezone: regatta.timezone,
      format: regatta.format,
      status: regatta.status,
    },
    teams,
    schedule,
  };
  if (link.canCheckLoad) {
    const project = loadItemProjector(source);
    view.loadItems = source.loadItems
      .filter((i) => i.regattaId === regatta.id)
      .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.label.localeCompare(b.label))
      .map(project);
  }
  return view;
}

// ---------------------------------------------------------------------------
// Demo mode: the projection over MemoryStore.

export function memoryShareApi(
  store: MemoryStore,
  now: () => string = () => new Date().toISOString(),
): ShareApi {
  const findLink = async (token: string): Promise<ShareLink> => {
    const [link] = TOKEN_RE.test(token)
      ? await store.list('share_links', { where: { token } })
      : [];
    if (!link || link.revokedAt) throw new StoreError('not_found', SHARE_LINK_GONE, 404);
    return link;
  };
  const source = async (link: ShareLink): Promise<ShareSource> => {
    const regatta = await store.get('regattas', link.regattaId);
    if (!regatta) throw new StoreError('not_found', SHARE_LINK_GONE, 404);
    const where = { regattaId: regatta.id };
    const [regattaTeams, teams, events, club] = await Promise.all([
      store.list('regatta_teams', { where }),
      store.list('teams'),
      store.list('events', { where }),
      store.list('club_settings'),
    ]);
    const withLoad = link.canCheckLoad;
    const [loadItems, loadPlans, trailers, users] = withLoad
      ? await Promise.all([
          store.list('load_items', { where }),
          store.list('load_plans', { where }),
          store.list('trailers'),
          store.list('users'),
        ])
      : [[], [], [], []];
    return {
      link,
      regatta,
      regattaTeams,
      teams,
      events,
      clubName: club[0]?.clubName ?? '',
      loadItems,
      loadPlans,
      trailers,
      users,
    };
  };

  return {
    async getShare(token) {
      return projectShare(await source(await findLink(token)), now());
    },
    async tickLoadItem(token, itemId, input) {
      const link = await findLink(token);
      if (!link.canCheckLoad) throw new StoreError('forbidden', CANNOT_CHECK, 403);
      const item = /^[a-z0-9]{15}$/.test(itemId) ? await store.get('load_items', itemId) : null;
      if (!item || item.regattaId !== link.regattaId) {
        throw new StoreError('not_found', NO_SUCH_ITEM, 404);
      }
      const valid = (v: unknown) => v === undefined || v === null || typeof v === 'boolean';
      const { loaded, returned } = input;
      if (
        !valid(loaded) ||
        !valid(returned) ||
        (typeof loaded !== 'boolean' && typeof returned !== 'boolean')
      ) {
        throw new StoreError('validation', BAD_TICK, 400);
      }
      const by = cleanShareName(input.by);
      const at = now();
      const patch: Patch<LoadItem> = {};
      const apply = (flag: boolean | undefined, prefix: 'loaded' | 'returned') => {
        if (typeof flag !== 'boolean') return;
        const current = item[`${prefix}At`];
        if (flag && !current) {
          Object.assign(patch, {
            [`${prefix}At`]: at,
            [`${prefix}By`]: null,
            [`${prefix}ByName`]: by,
          });
        } else if (!flag && current) {
          Object.assign(patch, {
            [`${prefix}At`]: null,
            [`${prefix}By`]: null,
            [`${prefix}ByName`]: '',
          });
        }
      };
      apply(loaded ?? undefined, 'loaded');
      apply(returned ?? undefined, 'returned');
      const saved =
        Object.keys(patch).length > 0
          ? await store.updateViaShareLink('load_items', item.id, patch, by)
          : item;
      const [loadPlans, trailers, users] = await Promise.all([
        store.list('load_plans', { where: { regattaId: link.regattaId } }),
        store.list('trailers'),
        store.list('users'),
      ]);
      return loadItemProjector({ loadPlans, trailers, users })(saved);
    },
  };
}

// ---------------------------------------------------------------------------
// PocketBase: the public routes, with fetch and no session.

async function readError(res: Response): Promise<StoreError> {
  let message = '';
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body?.message === 'string') message = body.message;
  } catch {
    // Not JSON (a proxy error page, say).
  }
  switch (res.status) {
    case 404:
      return new StoreError('not_found', message || SHARE_LINK_GONE, 404);
    case 403:
      return new StoreError('forbidden', message || CANNOT_CHECK, 403);
    case 400:
      return new StoreError('validation', message || BAD_TICK, 400);
    case 429:
      return new StoreError(
        'unknown',
        message || 'Too many requests from this network. Try again in a minute.',
        429,
      );
    default:
      return new StoreError(
        'unknown',
        message || 'The server had a problem. Try again in a minute.',
        res.status,
      );
  }
}

/** ShareApi over the public routes. `url(path)` makes an absolute or same-origin URL. */
export function httpShareApi(url: (path: string) => string): ShareApi {
  const call = async <T>(path: string, init?: RequestInit): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(url(path), {
        ...init,
        // A trailer with one bar of signal can hang a request; give up and let the tick queue.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new StoreError('network', 'Could not reach the server. Check your connection.', 0);
    }
    if (!res.ok) throw await readError(res);
    return (await res.json()) as T;
  };
  const base = (token: string) => `/api/regatta-ops/share/${encodeURIComponent(token)}`;
  return {
    getShare: (token) => call<ShareView>(base(token)),
    tickLoadItem: async (token, itemId, input) => {
      const body: ShareTickInput = {};
      if (typeof input.loaded === 'boolean') body.loaded = input.loaded;
      if (typeof input.returned === 'boolean') body.returned = input.returned;
      if (input.by) body.by = input.by;
      const res = await call<{ item: ShareLoadItem }>(
        `${base(token)}/load-items/${encodeURIComponent(itemId)}`,
        { method: 'POST', body: JSON.stringify(body) },
      );
      return res.item;
    },
  };
}

const apis = new WeakMap<DataStore, ShareApi>();

/** The ShareApi that goes with a store. */
export function shareApiFor(store: DataStore): ShareApi {
  let api = apis.get(store);
  if (!api) {
    if (store.mode === 'memory') api = memoryShareApi(store as MemoryStore);
    else {
      const pb = (store as PocketBaseStore).pb;
      api = httpShareApi((path) => pb.buildURL(path));
    }
    apis.set(store, api);
  }
  return api;
}

const ShareApiContext = createContext<ShareApi | null>(null);

/** Replace the store's ShareApi (tests, the component gallery). */
export function ShareApiProvider({ api, children }: { api: ShareApi; children: ReactNode }) {
  return createElement(ShareApiContext.Provider, { value: api }, children);
}

export function useShareApi(): ShareApi {
  const override = useContext(ShareApiContext);
  const store = useStore();
  return useMemo(() => override ?? shareApiFor(store), [override, store]);
}

// ---------------------------------------------------------------------------
// The copy kept on the device, so a reload with no signal still shows the page.

const COPY_PREFIX = 'regatta-ops-share-copy:';

function readCopy(token: string): ShareView | null {
  try {
    const raw = localStorage.getItem(COPY_PREFIX + token);
    const parsed = raw ? (JSON.parse(raw) as ShareView) : null;
    return parsed && parsed.regatta && Array.isArray(parsed.schedule) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCopy(token: string, view: ShareView | null) {
  try {
    if (view) localStorage.setItem(COPY_PREFIX + token, JSON.stringify(view));
    else localStorage.removeItem(COPY_PREFIX + token);
  } catch {
    // Storage full or blocked: the page still works while it is open.
  }
}

// ---------------------------------------------------------------------------
// Hooks

export interface ShareData {
  view: ShareView;
  /** True when the server could not be reached and this is the copy saved on the device. */
  fromDevice: boolean;
}

export const shareQueryKey = (token: string) => ['regatta-ops', 'share', token] as const;

/** Collections whose changes can show on a share page (for signed-in viewers' realtime). */
const SHARE_SOURCES = new Set<CollectionName>([
  'regattas',
  'regatta_teams',
  'teams',
  'events',
  'load_items',
  'load_plans',
  'share_links',
  'club_settings',
]);

/** Update the cached page (and the device copy) in place. */
export function updateShareData(
  qc: QueryClient,
  token: string,
  update: (view: ShareView) => ShareView,
) {
  const next = qc.setQueryData<ShareData>(shareQueryKey(token), (d) =>
    d ? { ...d, view: update(d.view) } : d,
  );
  if (next) writeCopy(token, next.view);
}

/** Replace one load-list line in the cached page. */
export function setShareItem(qc: QueryClient, token: string, item: ShareLoadItem) {
  updateShareData(qc, token, (view) => ({
    ...view,
    loadItems: view.loadItems?.map((i) => (i.id === item.id ? item : i)),
  }));
}

/**
 * A share link's page. Refetches every minute (race-day times change) and on focus and
 * reconnect; signed-in viewers also refetch on realtime changes. When the server cannot be
 * reached, `data.view` is the last copy saved on this device and `data.fromDevice` is true.
 * A revoked or unknown link fails with isShareGone(error).
 */
export function useShare(token: string): UseQueryResult<ShareData> {
  const api = useShareApi();
  const qc = useQueryClient();
  const query = useQuery<ShareData>({
    queryKey: shareQueryKey(token),
    queryFn: async () => {
      try {
        const view = await api.getShare(token);
        writeCopy(token, view);
        return { view, fromDevice: false };
      } catch (err) {
        if (isTransientShareError(err)) {
          const copy = readCopy(token);
          if (copy) return { view: copy, fromDevice: true };
        }
        if (isShareGone(err)) writeCopy(token, null);
        throw err;
      }
    },
    enabled: !!token,
    // Offline, run anyway: the query falls back to the device copy instead of pausing.
    networkMode: 'always',
    retry: false,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
  useRealtimeEvents((event) => {
    if (SHARE_SOURCES.has(event.collection)) {
      void qc.invalidateQueries({ queryKey: shareQueryKey(token) });
    }
  });
  return query;
}

export interface ShareTickVars extends ShareTickInput {
  itemId: string;
}

export interface UseTickShareItemOptions {
  /**
   * Return true to keep the optimistic tick after a failure (the caller queued it for later).
   * Otherwise the line is restored and a toast says why.
   */
  keepOnError?: (error: unknown, vars: ShareTickVars) => boolean;
  onSuccess?: (item: ShareLoadItem, vars: ShareTickVars) => void;
}

/** Tick or untick a load-list line through a share link, shown at once, restored on failure. */
export function useTickShareItem(token: string, options: UseTickShareItemOptions = {}) {
  const api = useShareApi();
  const qc = useQueryClient();
  const key = shareQueryKey(token);
  return useMutation<ShareLoadItem, unknown, ShareTickVars, { before?: ShareLoadItem }>({
    mutationFn: ({ itemId, ...input }) => api.tickLoadItem(token, itemId, input),
    // Fail fast offline so the caller can queue the tick (TanStack would pause it in memory).
    networkMode: 'always',
    // One tick at a time, in the order they were made, so "tick, untick" never lands reversed.
    scope: { id: `share-tick:${token}` },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const before = qc
        .getQueryData<ShareData>(key)
        ?.view.loadItems?.find((i) => i.id === vars.itemId);
      if (before) setShareItem(qc, token, applyTick(before, vars));
      return { before };
    },
    onError: (err, vars, ctx) => {
      if (options.keepOnError?.(err, vars)) return;
      if (ctx?.before) setShareItem(qc, token, ctx.before);
      if (isShareGone(err)) void qc.invalidateQueries({ queryKey: key });
      toast.error(err instanceof StoreError ? err.message : 'The tick was not saved. Try again.');
    },
    onSuccess: (item, vars) => {
      setShareItem(qc, token, item);
      options.onSuccess?.(item, vars);
    },
  });
}
