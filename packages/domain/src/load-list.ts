// Load list derivation (PLAN.md §4.8, §9.4). Pure: the UI merges the result with stored
// load_items by (kind, refId) so Loaded / Returned checkboxes survive re-derivation.

import { defaultRiggerCount } from './boat-classes';
import { oarSetLabel, shellFullLabel, shellLabel } from './format';
import type { Entry, GearItem, LoadItem, LoadItemKind, OarSet, Shell } from './types';

/** A derived load-list line. The UI merges these with stored load_items by (kind, refId). */
export interface DerivedLoadItem {
  kind: LoadItemKind;
  refId: string;
  label: string;
  quantity: number;
}

export interface LoadListInput {
  entries: Entry[];
  shells: Shell[];
  oarSets: OarSet[];
  gear: GearItem[];
  extras?: { label: string; quantity?: number; refId?: string }[];
}

export const LOAD_ITEM_KINDS = [
  'shell',
  'riggers',
  'oar_set',
  'gear',
  'extra',
] as const satisfies readonly LoadItemKind[];

function byLabelThenId<T extends { label: string; refId: string }>(a: T, b: T): number {
  return (
    a.label.localeCompare(b.label, 'en') || (a.refId < b.refId ? -1 : a.refId > b.refId ? 1 : 0)
  );
}

/**
 * Everything that has to travel for a regatta, in this order: shells used by non-scratched
 * entries (deduplicated, by label), one riggers line per shell (same order; skipped when the
 * shell's rigger type is 'none'), oar sets used (deduplicated, by label), gear flagged
 * default-load (by category, then name), then extras in the order given.
 *
 * Quantities: shells 1; riggers `riggerCount ?? defaultRiggerCount(class, riggerType)`; oar
 * sets the number of oars in the set; gear its quantity; extras their quantity or 1.
 */
export function deriveLoadList(input: LoadListInput): DerivedLoadItem[] {
  const live = input.entries.filter((e) => e.status !== 'scratched');
  const shellById = new Map(input.shells.map((s) => [s.id, s]));
  const oarById = new Map(input.oarSets.map((o) => [o.id, o]));

  const shells: Shell[] = [];
  const oars: OarSet[] = [];
  for (const e of live) {
    const s = e.shellId ? shellById.get(e.shellId) : undefined;
    if (s && !shells.includes(s)) shells.push(s);
    const o = e.oarSetId ? oarById.get(e.oarSetId) : undefined;
    if (o && !oars.includes(o)) oars.push(o);
  }

  const shellItems = shells
    .map((s) => ({
      shell: s,
      item: { kind: 'shell' as const, refId: s.id, label: shellFullLabel(s), quantity: 1 },
    }))
    .sort((a, b) => byLabelThenId(a.item, b.item));

  const riggerItems: DerivedLoadItem[] = [];
  for (const { shell } of shellItems) {
    if (shell.riggerType === 'none') continue;
    const quantity = shell.riggerCount ?? defaultRiggerCount(shell.boatClass, shell.riggerType);
    if (quantity <= 0) continue;
    riggerItems.push({
      kind: 'riggers',
      refId: shell.id,
      label: `Riggers for ${shellLabel(shell)}`,
      quantity,
    });
  }

  const oarItems: DerivedLoadItem[] = oars
    .map((o) => ({
      kind: 'oar_set' as const,
      refId: o.id,
      label: oarSetLabel(o),
      quantity: o.count,
    }))
    .sort(byLabelThenId);

  const gearItems: DerivedLoadItem[] = input.gear
    .filter((g) => g.defaultLoad)
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category, 'en') ||
        a.name.localeCompare(b.name, 'en') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((g) => ({ kind: 'gear' as const, refId: g.id, label: g.name, quantity: g.quantity }));

  const extraItems: DerivedLoadItem[] = (input.extras ?? []).map((x) => ({
    kind: 'extra',
    refId: x.refId ?? '',
    label: x.label,
    quantity: x.quantity ?? 1,
  }));

  return [
    ...shellItems.map((s) => s.item),
    ...riggerItems,
    ...oarItems,
    ...gearItems,
    ...extraItems,
  ];
}

/**
 * The merge key: (kind, refId). Extras without a refId match by label, since a coach's
 * free-text extra ("Spare tool kit") has nothing else to match on.
 */
export function loadItemKey(item: { kind: LoadItemKind; refId?: string; label: string }): string {
  const ref = item.refId ? item.refId : `label:${item.label.trim().toLowerCase()}`;
  return `${item.kind}:${ref}`;
}

export interface MergedLoadRow extends DerivedLoadItem {
  key: string;
  /** The stored load_items record, when there is one: it carries Loaded / Returned state. */
  stored?: LoadItem;
  /** True when the current lineups still call for this line (or it is a coach's extra). */
  derived: boolean;
  /** Stored, but nothing uses it any more (a shell dropped from every entry). Flag it. */
  orphaned: boolean;
}

export interface MergedLoadList {
  /** Derived order first, then stored-only rows (extras, then orphans) in kind order and label. */
  rows: MergedLoadRow[];
  /** Derived lines with no stored record: the UI creates load_items for these. */
  added: DerivedLoadItem[];
  /** Stored records no longer derived (never kind 'extra'): the UI flags or deletes these. */
  orphaned: LoadItem[];
}

/**
 * Merge a freshly derived list with the stored load_items (PLAN.md §9.4). Matching is by
 * (kind, refId); label and quantity come from the derived line so renamed shells show their
 * new name, and everything else (loaded/returned stamps, container, notes) from the stored row.
 * Stored extras are coach additions and are never orphaned.
 */
export function mergeLoadItems(derived: DerivedLoadItem[], stored: LoadItem[]): MergedLoadList {
  const storedByKey = new Map<string, LoadItem>();
  const duplicates: LoadItem[] = [];
  for (const s of stored) {
    const k = loadItemKey(s);
    if (storedByKey.has(k)) duplicates.push(s);
    else storedByKey.set(k, s);
  }

  const rows: MergedLoadRow[] = [];
  const added: DerivedLoadItem[] = [];
  const used = new Set<string>();
  for (const d of derived) {
    const key = loadItemKey(d);
    if (used.has(key)) continue;
    used.add(key);
    const match = storedByKey.get(key);
    if (match) rows.push({ ...d, key, stored: match, derived: true, orphaned: false });
    else {
      rows.push({ ...d, key, derived: true, orphaned: false });
      added.push(d);
    }
  }

  const kindRank = (k: LoadItemKind) => LOAD_ITEM_KINDS.indexOf(k);
  const leftovers = [...storedByKey.entries()]
    .filter(([key]) => !used.has(key))
    .map(([, s]) => s)
    .concat(duplicates)
    .sort(
      (a, b) =>
        kindRank(a.kind) - kindRank(b.kind) ||
        a.label.localeCompare(b.label, 'en') ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );

  const orphaned: LoadItem[] = [];
  const extras: MergedLoadRow[] = [];
  const orphanRows: MergedLoadRow[] = [];
  for (const s of leftovers) {
    const base = {
      kind: s.kind,
      refId: s.refId ?? '',
      label: s.label,
      quantity: s.quantity,
      key: loadItemKey(s),
      stored: s,
    };
    if (s.kind === 'extra') extras.push({ ...base, derived: true, orphaned: false });
    else {
      orphanRows.push({ ...base, derived: false, orphaned: true });
      orphaned.push(s);
    }
  }
  return { rows: [...rows, ...extras, ...orphanRows], added, orphaned };
}
