// Wording helpers for rule sentences and packer reasons (PLAN.md §9.3.3, §17.3). Pure.

import { BOAT_CLASS_SPECS } from '../boat-classes';
import type { BoatClass, Id } from '../types';
import type { ShelfDef, TrailerDef } from './types';

/** 1990 → "19.9". Meters with one decimal, as coaches read tape measures. */
export function meters(cm: number): string {
  return (Math.round(cm / 10) / 10).toFixed(1);
}

/** "a", "a and b", "a, b, and c". */
export function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toLowerCase() + s.slice(1);
}

/** "8+ and 4+", "certain boat classes" when empty. */
export function classList(classes: readonly BoatClass[]): string {
  return classes.length === 0 ? 'certain boat classes' : joinAnd(classes);
}

/**
 * The word coaches use for a group of classes: ['8+'] → "eights", the four variants → "fours",
 * ['4x', '4x+'] → "quads", ['2x'] → "doubles", ['1x'] → "singles"; mixed sizes join:
 * "eights and fours". Empty → "boats".
 */
export function classNoun(classes: readonly BoatClass[]): string {
  if (classes.length === 0) return 'boats';
  const bySize = new Map<number, BoatClass[]>();
  for (const c of classes) {
    const r = BOAT_CLASS_SPECS[c].rowers;
    bySize.set(r, [...(bySize.get(r) ?? []), c]);
  }
  const nouns: string[] = [];
  for (const size of [8, 4, 2, 1]) {
    const group = bySize.get(size);
    if (!group) continue;
    const sculls = group.every((c) => BOAT_CLASS_SPECS[c].rigging === 'scull');
    const sweeps = group.every((c) => BOAT_CLASS_SPECS[c].rigging === 'sweep');
    if (size === 8) nouns.push('eights');
    else if (size === 4) nouns.push(sculls ? 'quads' : 'fours');
    else if (size === 2) nouns.push(sculls ? 'doubles' : sweeps ? 'pairs' : 'pairs and doubles');
    else nouns.push('singles');
  }
  return joinAnd(nouns);
}

/** "boat" / "boats". */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Shelf and tier names, taken from the trailer's own labels.

type TierWord = 'level' | 'rack' | 'tier';

/** The word this trailer's labels use for a tier: "level" (SRA), "rack", or "tier". */
export function tierWord(trailer: TrailerDef): TierWord {
  for (const s of trailer.shelves) {
    const m = s.label.toLowerCase().match(/\b(level|rack|tier)\b/);
    if (m) return m[1] as TierWord;
  }
  return 'level';
}

function tierPrefix(label: string): string {
  const i = label.indexOf(',');
  return (i >= 0 ? label.slice(0, i) : label).trim();
}

/** "Top level", "Level 3", from the first shelf on that tier; "Level 3" when none. */
export function tierName(trailer: TrailerDef, tier: number): string {
  const shelf = trailer.shelves.find((s) => s.tier === tier);
  const prefix = shelf ? tierPrefix(shelf.label) : '';
  return prefix || capitalize(`${tierWord(trailer)} ${tier}`);
}

export function shelfById(trailer: TrailerDef, id: Id): ShelfDef | undefined {
  return trailer.shelves.find((s) => s.id === id);
}

/** Shown for a rule that names a shelf the trailer no longer has. */
export const REMOVED_SHELF = 'a removed shelf';

export function shelfName(trailer: TrailerDef, id: Id): string {
  const s = shelfById(trailer, id);
  return s ? s.label || s.id : REMOVED_SHELF;
}

/**
 * A name as it reads mid-sentence: "Level 3, wide side" → "level 3, wide side",
 * "Top level, wide side" → "the top level, wide side".
 */
export function midSentence(name: string): string {
  if (/^(level|rack|tier)\s+\d/i.test(name)) return lowerFirst(name);
  if (/^(the|a|an)\s/i.test(name)) return lowerFirst(name);
  return `the ${lowerFirst(name)}`;
}

/** Tiers as a phrase: "Top level" / "Levels 5 and 4" / "The middle and bottom racks". */
export function tiersPhrase(
  trailer: TrailerDef,
  tiers: readonly number[],
  position: 'start' | 'mid',
): { text: string; plural: boolean } {
  const word = tierWord(trailer);
  if (tiers.length === 0) {
    return { text: position === 'start' ? `Any ${word}` : `a ${word}`, plural: false };
  }
  if (tiers.length === 1) {
    const name = tierName(trailer, tiers[0]!);
    return { text: position === 'start' ? capitalize(name) : midSentence(name), plural: false };
  }
  const names = tiers.map((t) => tierName(trailer, t));
  const adjective = new RegExp(`^([a-z][a-z ]*?)\\s+${word}$`, 'i');
  const adjectives = names.map((n) => n.match(adjective)?.[1]);
  let text: string;
  if (adjectives.every((a): a is string => !!a && !/\d/.test(a))) {
    text = `the ${joinAnd(adjectives.map((a) => a.toLowerCase()))} ${word}s`;
  } else {
    text = `${word}s ${joinAnd(tiers.map(String))}`;
  }
  return { text: position === 'start' ? capitalize(text) : text, plural: true };
}

/**
 * Shelves as a phrase. Whole tiers read as the tier ("Top rack"); single shelves read as
 * their label ("Middle rack, driver side").
 */
export function shelvesPhrase(
  trailer: TrailerDef,
  shelfIds: readonly Id[],
  position: 'start' | 'mid',
): { text: string; plural: boolean } {
  if (shelfIds.length === 0) {
    return { text: position === 'start' ? 'A shelf' : 'a shelf', plural: false };
  }
  const wanted = new Set(shelfIds);
  const tiers: number[] = [];
  const singles: string[] = [];
  const seen = new Set<string>();
  for (const id of shelfIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = shelfById(trailer, id);
    if (!s) {
      if (!singles.includes(REMOVED_SHELF)) singles.push(REMOVED_SHELF);
      continue;
    }
    const onTier = trailer.shelves.filter((x) => x.tier === s.tier);
    if (onTier.length > 1 && onTier.every((x) => wanted.has(x.id))) {
      if (!tiers.includes(s.tier)) tiers.push(s.tier);
    } else {
      singles.push(s.label || s.id);
    }
  }
  if (singles.length === 0) return tiersPhrase(trailer, tiers, position);
  const parts: string[] = [];
  if (tiers.length > 0) parts.push(tiersPhrase(trailer, tiers, position).text);
  for (const name of singles) {
    parts.push(position === 'start' && parts.length === 0 ? capitalize(name) : midSentence(name));
  }
  return { text: joinAnd(parts), plural: parts.length > 1 || tiers.length > 1 };
}

/** "outside lane" / "inside lane" on a two-lane outer-first shelf, else "lane 2" (1-based). */
export function laneName(shelf: ShelfDef | undefined, lane: number, laneCount?: number): string {
  if (shelf?.laneAccess === 'outer_first' && (laneCount ?? 2) === 2 && lane <= 1) {
    return lane === 0 ? 'inside lane' : 'outside lane';
  }
  return `lane ${lane + 1}`;
}

/** "Junior boys'" / "Masters'" possessive for a team name. */
export function possessive(name: string): string {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}
