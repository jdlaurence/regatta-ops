// The load list as the page shows it (PLAN.md §4.8, §6.7, §9.4): what the regatta's entries
// call for (`deriveLoadList`), merged with the stored checklist rows (`mergeLoadItems`) so
// Loaded and Returned survive, plus the flags that keep anything from falling through: a shell
// with no spot on a trailer, a spare on a trailer that no entry uses, and stored rows nothing
// needs any more. Pure.
//
// Stored rows are created lazily: the first tick, container, or note on a line writes its
// load_items record (with the tick). "Save list" writes every line that has none yet, so the
// loading crew sees the whole list through a share link, which reads stored rows only.

import {
  LOAD_ITEM_KINDS,
  defaultRiggerCount,
  deriveLoadList,
  instantToZoned,
  clockAt,
  mergeLoadItems,
  shellFullLabel,
  shellLabel,
  type DerivedLoadItem,
  type Id,
  type LoadItem,
  type LoadItemKind,
  type LoadPlan,
  type Trailer,
  type User,
} from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';

export const KIND_TITLES: Record<LoadItemKind, string> = {
  shell: 'Shells',
  riggers: 'Riggers',
  oar_set: 'Oars',
  gear: 'Gear',
  extra: 'Extras',
};

export interface LoadRow {
  key: string;
  kind: LoadItemKind;
  refId: string;
  label: string;
  quantity: number;
  /** The stored load_items record, once the line has one. */
  stored: LoadItem | null;
  /** A shell a lineup uses that has no spot on any trailer. */
  notOnTrailer: boolean;
  /** A shell on a trailer that no entry uses (allowed, but visible). */
  spare: boolean;
  /** A stored row nothing calls for any more. */
  orphaned: boolean;
  /** Where it rides as typed on the list ("Truck 1 bed"). */
  container: string;
  /** Where it rides when nothing is typed: the trailer a shell (and its riggers) is on. */
  suggestedContainer: string | null;
  /** The load plan to attach a new stored row to (a shell's trailer). */
  loadPlanId: Id | null;
  /** The plan the shell (or the shell these riggers belong to) is placed on, if any. */
  placementPlanId: Id | null;
  loaded: boolean;
  returned: boolean;
}

export interface LoadGroup {
  kind: LoadItemKind;
  title: string;
  rows: LoadRow[];
}

type LoadListSource = Pick<
  RegattaWorkingSet,
  'entries' | 'shells' | 'oarSets' | 'gear' | 'loadItems' | 'loadPlans' | 'placements' | 'trailers'
>;

/** Shell → the plan it is placed on. */
function placementPlans(ws: Pick<LoadListSource, 'placements' | 'loadPlans'>): Map<Id, LoadPlan> {
  const plans = new Map(ws.loadPlans.map((p) => [p.id, p]));
  const out = new Map<Id, LoadPlan>();
  for (const p of ws.placements) {
    const plan = plans.get(p.loadPlanId);
    if (plan && !out.has(p.shellId)) out.set(p.shellId, plan);
  }
  return out;
}

/**
 * Every line of the regatta's load list, in derived order (shells, riggers, oars, gear), then
 * extras and rows no longer needed. Spares on a trailer are listed with their riggers.
 */
export function buildLoadRows(ws: LoadListSource): LoadRow[] {
  const derived = deriveLoadList({
    entries: ws.entries,
    shells: ws.shells,
    oarSets: ws.oarSets,
    gear: ws.gear,
  });
  const onPlan = placementPlans(ws);
  const used = new Set(
    ws.entries.filter((e) => e.status !== 'scratched' && e.shellId).map((e) => e.shellId!),
  );
  const shellById = new Map(ws.shells.map((s) => [s.id, s]));
  const spareIds = new Set([...onPlan.keys()].filter((id) => !used.has(id) && shellById.has(id)));

  // Spares ride too: list them (and their riggers) so they are ticked like everything else.
  const spareShells: DerivedLoadItem[] = [];
  const spareRiggers: DerivedLoadItem[] = [];
  for (const id of spareIds) {
    const shell = shellById.get(id)!;
    spareShells.push({ kind: 'shell', refId: id, label: shellFullLabel(shell), quantity: 1 });
    const riggers =
      shell.riggerType === 'none'
        ? 0
        : (shell.riggerCount ?? defaultRiggerCount(shell.boatClass, shell.riggerType));
    if (riggers > 0) {
      spareRiggers.push({
        kind: 'riggers',
        refId: id,
        label: `Riggers for ${shellLabel(shell)}`,
        quantity: riggers,
      });
    }
  }
  const byLabel = (a: DerivedLoadItem, b: DerivedLoadItem) => a.label.localeCompare(b.label, 'en');
  spareShells.sort(byLabel);
  spareRiggers.sort(byLabel);
  const kindOf = (k: LoadItemKind) => (d: DerivedLoadItem) => d.kind === k;
  const all = [
    ...derived.filter(kindOf('shell')),
    ...spareShells,
    ...derived.filter(kindOf('riggers')),
    ...spareRiggers,
    ...derived.filter((d) => d.kind !== 'shell' && d.kind !== 'riggers'),
  ];

  const trailerName = new Map(ws.trailers.map((t) => [t.id, t.name]));
  const merged = mergeLoadItems(all, ws.loadItems);
  return merged.rows.map((row): LoadRow => {
    const boat = row.kind === 'shell' || row.kind === 'riggers';
    const plan = boat ? onPlan.get(row.refId) : undefined;
    const name = plan ? trailerName.get(plan.trailerId) : undefined;
    const stored = row.stored ?? null;
    return {
      key: row.key,
      kind: row.kind,
      refId: row.refId,
      label: row.label,
      quantity: row.quantity,
      stored,
      notOnTrailer: row.kind === 'shell' && !row.orphaned && !plan,
      spare: boat && spareIds.has(row.refId),
      orphaned: row.orphaned,
      container: stored?.container ?? '',
      suggestedContainer: name ? (row.kind === 'riggers' ? `${name} bed` : name) : null,
      loadPlanId: stored ? (stored.loadPlanId ?? null) : (plan?.id ?? null),
      placementPlanId: plan?.id ?? null,
      loaded: !!stored?.loadedAt,
      returned: !!stored?.returnedAt,
    };
  });
}

export function groupRows(rows: readonly LoadRow[]): LoadGroup[] {
  return LOAD_ITEM_KINDS.map((kind) => ({
    kind,
    title: KIND_TITLES[kind],
    rows: rows.filter((r) => r.kind === kind),
  })).filter((g) => g.rows.length > 0);
}

export type LoadFilter = 'all' | 'not-loaded' | 'not-returned';

export function filterRows(rows: readonly LoadRow[], filter: LoadFilter): LoadRow[] {
  if (filter === 'not-loaded') return rows.filter((r) => !r.loaded);
  if (filter === 'not-returned') return rows.filter((r) => !r.returned);
  return [...rows];
}

export interface LoadCounts {
  total: number;
  loaded: number;
  returned: number;
  /** Lines with no stored row yet (what "Save list" writes). */
  unsaved: number;
  notOnTrailer: number;
}

/** "18 of 22 loaded": rows no longer needed are not counted. */
export function countRows(rows: readonly LoadRow[]): LoadCounts {
  const live = rows.filter((r) => !r.orphaned);
  return {
    total: live.length,
    loaded: live.filter((r) => r.loaded).length,
    returned: live.filter((r) => r.returned).length,
    unsaved: live.filter((r) => !r.stored).length,
    notOnTrailer: live.filter((r) => r.notOnTrailer).length,
  };
}

// ---------------------------------------------------------------------------
// Writes

export type TickField = 'loaded' | 'returned';

export type LoadItemData = Omit<LoadItem, 'id' | 'created' | 'updated'>;
export type LoadItemPatch = Partial<LoadItemData>;

export type RowWrite =
  { op: 'create'; data: LoadItemData } | { op: 'update'; id: Id; patch: LoadItemPatch };

/** The stored record for a line that has none yet. */
export function newItemData(row: LoadRow, regattaId: Id): LoadItemData {
  return {
    regattaId,
    loadPlanId: row.loadPlanId,
    kind: row.kind,
    refId: row.refId,
    label: row.label,
    quantity: row.quantity,
    container: row.container,
    loadedAt: null,
    loadedBy: null,
    returnedAt: null,
    returnedBy: null,
    loadedByName: '',
    returnedByName: '',
    notes: '',
  };
}

/** The write for a line: an update when it has a stored row, else the row created with it. */
export function rowWrite(row: LoadRow, regattaId: Id, patch: LoadItemPatch): RowWrite {
  if (row.stored) return { op: 'update', id: row.stored.id, patch };
  return { op: 'create', data: { ...newItemData(row, regattaId), ...patch } };
}

/** Tick or untick Loaded or Returned, recording who and when. */
export function tickPatch(
  field: TickField,
  value: boolean,
  userId: Id | null,
  now: string,
): LoadItemPatch {
  if (field === 'loaded') {
    return value
      ? { loadedAt: now, loadedBy: userId, loadedByName: '' }
      : { loadedAt: null, loadedBy: null, loadedByName: '' };
  }
  return value
    ? { returnedAt: now, returnedBy: userId, returnedByName: '' }
    : { returnedAt: null, returnedBy: null, returnedByName: '' };
}

/** Where-it-rides choices: each trailer and its bed, then the trucks (§4.8 free text). */
export function containerPicks(trailers: readonly Pick<Trailer, 'name'>[]): string[] {
  return [...trailers.flatMap((t) => [t.name, `${t.name} bed`]), 'Truck 1 bed', 'Truck 2 bed'];
}

/**
 * The load plan a typed container belongs to: "Boys trailer bed" rides with the Boys trailer's
 * plan (so the load sheet lists it); a truck bed with none.
 */
export function planForContainer(
  container: string,
  trailers: readonly Pick<Trailer, 'id' | 'name'>[],
  plans: readonly Pick<LoadPlan, 'id' | 'trailerId'>[],
): Id | null {
  const text = container.trim().toLowerCase();
  if (!text) return null;
  const trailer = [...trailers]
    .sort((a, b) => b.name.length - a.name.length)
    .find((t) => text.startsWith(t.name.trim().toLowerCase()));
  if (!trailer) return null;
  return plans.find((p) => p.trailerId === trailer.id)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Who and when

/** "Sam" from "Sam Whitaker". */
export function firstName(name: string | null | undefined): string {
  return (
    String(name ?? '')
      .trim()
      .split(/\s+/)[0] || 'Someone'
  );
}

const MONTH_DAY_TIME = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** "6:42 AM" today in the regatta's time zone, else "May 15, 4:10 PM". */
export function tickTime(iso: string, timeZone: string, now: Date = new Date()): string {
  const day = instantToZoned(iso, timeZone).day;
  const today = instantToZoned(now.toISOString(), timeZone).day;
  if (day === today) return clockAt(iso, timeZone, true);
  return MONTH_DAY_TIME(timeZone).format(new Date(iso));
}

/** "Sam · 6:42 AM" for a tick, or null when not ticked. */
export function tickedBy(
  item: LoadItem | null,
  field: TickField,
  users: ReadonlyMap<Id, Pick<User, 'name'>>,
  timeZone: string,
  now?: Date,
): string | null {
  if (!item) return null;
  const at = field === 'loaded' ? item.loadedAt : item.returnedAt;
  if (!at) return null;
  const by = field === 'loaded' ? item.loadedBy : item.returnedBy;
  const typed = field === 'loaded' ? item.loadedByName : item.returnedByName;
  const who = by ? firstName(users.get(by)?.name) : typed?.trim() || null;
  return [who, tickTime(at, timeZone, now)].filter(Boolean).join(' · ');
}
