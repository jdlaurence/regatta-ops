// Small pieces the trailer page's panels share: the boat pill (a boat, so a pill, §5.2) and the
// "Why here?" reason list.

import type { ComponentProps, Ref } from 'react';
import { CircleAlert } from 'lucide-react';
import type { BoatClass, Reason, TeamColorKey } from '@regatta-ops/domain';
import { RuleTag } from '@/components/trailer/RuleCard';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { formatScore } from './lib';

/** A boat as a pill: team-colored, nickname and class. Same look as the chips on the racks. */
export function BoatPill({
  name,
  cls,
  teamColor,
  className,
  ref,
  ...rest
}: {
  name: string;
  cls: BoatClass | string;
  teamColor?: TeamColorKey | null;
  ref?: Ref<HTMLSpanElement>;
} & Omit<ComponentProps<'span'>, 'ref'>) {
  return (
    <span
      ref={ref}
      style={teamStyle(teamColor)}
      className={cn(
        'inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-boat border-[1.5px] border-team bg-team-tint px-2.5 text-ink',
        className,
      )}
      {...rest}
    >
      <span className="min-w-0 truncate text-sm font-medium">{name}</span>
      <span className="shrink-0 font-display text-xs font-semibold text-ink-2 tabular-nums">
        {cls}
      </span>
    </span>
  );
}

/** Reasons as sentences with Must/Prefer and the score (§4.10 "Why here?"). */
export function ReasonList({
  reasons,
  broken = false,
  className,
}: {
  reasons: readonly Reason[];
  /** These are rules the spot breaks. */
  broken?: boolean;
  className?: string;
}) {
  if (reasons.length === 0) return null;
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {reasons.map((r, i) => (
        <li key={`${r.ruleId}:${i}`} className="flex items-start gap-2 text-base leading-prose">
          {broken ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          ) : (
            <RuleTag hard={r.hard} />
          )}
          <span className={cn('min-w-0 flex-1', broken ? 'text-danger' : 'text-ink')}>
            {broken && <span className="sr-only">Breaks: </span>}
            {r.text}
          </span>
          {r.score !== undefined && !broken && (
            <span
              className={cn(
                'shrink-0 font-display text-sm font-semibold tabular-nums',
                r.score < 0 ? 'text-ink-2' : 'text-ink',
              )}
            >
              {formatScore(r.score)}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
