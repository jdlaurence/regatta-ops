// Small roster labels: the derived age badge (U17, masters C) and the inactive tag.
// Control radius, not pills: pills mean boats (PLAN.md §5.2).

import { cn } from '@/lib/cn';
import type { AgeBadge } from './lib';

export function AgeBadgeView({ badge, className }: { badge: AgeBadge; className?: string }) {
  return (
    <span
      title={badge.title}
      className={cn(
        'inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-control bg-surface-2 px-1.5 font-display text-xs font-semibold text-ink tabular-nums',
        className,
      )}
    >
      {badge.kind === 'masters' ? (
        <>
          <span aria-hidden>{badge.label}</span>
          <span className="sr-only">Masters {badge.label}</span>
        </>
      ) : (
        badge.label
      )}
    </span>
  );
}

export function InactiveTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-control border border-line px-1.5 text-xs font-medium text-ink-2',
        className,
      )}
    >
      Inactive
    </span>
  );
}
