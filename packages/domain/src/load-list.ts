// Load list derivation (PLAN.md §9.4). STUB: WP-A replaces the body; the signature is the contract.

import type { Entry, GearItem, LoadItemKind, OarSet, Shell } from './types';

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

export function deriveLoadList(_input: LoadListInput): DerivedLoadItem[] {
  return [];
}
