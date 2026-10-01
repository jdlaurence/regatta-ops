// Words for the trailer diagram and its screen reader labels (PLAN.md §3 glossary: level, rack,
// tier, shelf, lane). Tier labels read "Level 5" whatever the shelf labels say, so the drawing
// and the spoken labels agree.

import type { ShelfDef, TrailerDef } from '@regatta-ops/domain';

export type TierWord = 'level' | 'rack' | 'tier';

/** The word this trailer's shelf labels use for a tier; SRA's say "level". */
export function tierWordOf(trailer: Pick<TrailerDef, 'shelves'>): TierWord {
  for (const s of trailer.shelves) {
    const m = s.label.toLowerCase().match(/\b(level|rack|tier)\b/);
    if (m) return m[1] as TierWord;
  }
  return 'level';
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** "Level 5", "Rack 3". */
export function tierLabel(trailer: Pick<TrailerDef, 'shelves'>, tier: number): string {
  return `${capitalize(tierWordOf(trailer))} ${tier}`;
}

export interface SideNames {
  left: string;
  right: string;
}

/**
 * What coaches call the two columns: "narrow side" and "wide side" on an offset-post trailer
 * (whichever is narrower, by total shelf width), "left side" and "right side" otherwise.
 */
export function sideNamesOf(trailer: Pick<TrailerDef, 'style' | 'shelves'>): SideNames {
  if (trailer.style === 'offset_post') {
    const width = (key: 'left' | 'right') =>
      trailer.shelves.filter((s) => s.columnKey === key).reduce((t, s) => t + s.widthCm, 0);
    const l = width('left');
    const r = width('right');
    if (l < r) return { left: 'narrow side', right: 'wide side' };
    if (l > r) return { left: 'wide side', right: 'narrow side' };
  }
  return { left: 'left side', right: 'right side' };
}

/** The side a shelf is on, or null for a full-width shelf. */
export function sideOf(
  trailer: Pick<TrailerDef, 'style' | 'shelves'>,
  shelf: Pick<ShelfDef, 'columnKey'>,
): string | null {
  if (shelf.columnKey === 'full') return null;
  return sideNamesOf(trailer)[shelf.columnKey];
}

/**
 * A lane's name on its shelf, counting from the post: "inner lane" and "outer lane" on a
 * two-lane shelf, "lane 2" on wider ones, nothing on a one-lane shelf.
 */
export function laneLabel(lane: number, laneCount: number): string | null {
  if (laneCount <= 1) return null;
  if (laneCount === 2) return lane === 0 ? 'inner lane' : 'outer lane';
  return `lane ${lane + 1}`;
}

/** "Level 5, wide side, outer lane". */
export function cellLabel(
  trailer: Pick<TrailerDef, 'style' | 'shelves'>,
  shelf: Pick<ShelfDef, 'tier' | 'columnKey'>,
  lane: number,
  laneCount: number,
): string {
  return [tierLabel(trailer, shelf.tier), sideOf(trailer, shelf), laneLabel(lane, laneCount)]
    .filter(Boolean)
    .join(', ');
}

export const STYLE_LABELS: Record<TrailerDef['style'], string> = {
  offset_post: 'Offset post',
  center_post: 'Center post',
  goalpost: 'Goalpost',
};
