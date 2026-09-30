import type { CSSProperties } from 'react';
import type { TeamColorKey } from '@srt/domain';

/**
 * CSS variables that point `bg-team`, `text-team`, `border-team`, `bg-team-tint` (and SVG
 * `fill-team`) at one of the eight team hues. Spread on any element:
 * `<div style={teamStyle(team.colorKey)} className="border-l-4 border-team" />`.
 * Values are token references, never hex, so both themes follow automatically.
 */
export function teamStyle(colorKey: TeamColorKey | null | undefined): CSSProperties {
  const key = colorKey ?? 'slate';
  return {
    '--team': `var(--team-${key})`,
    '--team-tint': `var(--team-${key}-tint)`,
  } as CSSProperties;
}

export const TEAM_COLOR_LABELS: Record<TeamColorKey, string> = {
  navy: 'Navy',
  raspberry: 'Raspberry',
  ochre: 'Ochre',
  green: 'Green',
  violet: 'Violet',
  cyan: 'Cyan',
  bronze: 'Bronze',
  slate: 'Slate',
};
