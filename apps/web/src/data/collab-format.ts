// Small formatting helpers shared by the collaboration pieces (PLAN.md §4.6, §10): change
// toasts, presence avatars, and the activity feed. Pure; no React.

import { COLLECTION_NAMES, type CollectionName } from '@regatta-ops/domain';

/** "Sarah Williams" → "Sarah W.", "Morgan" → "Morgan". */
export function shortUserName(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Someone';
  if (parts.length === 1) return parts[0]!;
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

/** "Sarah Williams" → "SW", "Morgan" → "M". */
export function initialsOf(name: string | null | undefined): string {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Activity summaries start lowercase ("moved entry ..."); a toast line starts with a capital. */
export function capitalize(sentence: string): string {
  return sentence ? sentence[0]!.toUpperCase() + sentence.slice(1) : sentence;
}

// Older demo data wrote singular target types ('entry'); the server and seed write collection
// names ('entries'). Read both.
const SINGULAR: Record<string, CollectionName> = {
  entry: 'entries',
  entry_seat: 'entry_seats',
  event: 'events',
  load_placement: 'load_placements',
  load_item: 'load_items',
  shell: 'shells',
  oar_set: 'oar_sets',
  regatta: 'regattas',
  regatta_team: 'regatta_teams',
};

/** The collection an activity_log row's `targetType` names, or null when unknown. */
export function targetCollection(targetType: string | null | undefined): CollectionName | null {
  if (!targetType) return null;
  if ((COLLECTION_NAMES as readonly string[]).includes(targetType)) {
    return targetType as CollectionName;
  }
  return SINGULAR[targetType] ?? null;
}
