// Loading, empty, and error states: every list has all three. Empty states say what to do;
// errors say what went wrong and offer a retry.

import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  /** What to do next: "Add one from an event on the schedule, or add an unscheduled entry." */
  description?: ReactNode;
  icon?: ReactNode;
  /** Buttons or links. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong/60 px-5 py-6',
        className,
      )}
    >
      {icon && <div className="text-ink-2 [&_svg]:size-6">{icon}</div>}
      <div className="flex max-w-prose flex-col gap-1">
        <h2 className="text-md font-medium text-ink">{title}</h2>
        {description && <p className="text-base leading-prose text-ink-2">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'This did not load.',
  error,
  onRetry,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const detail =
    error instanceof Error && error.message
      ? error.message
      : 'Check your connection, then try again.';
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-card border border-danger/40 bg-danger-tint px-5 py-4',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-md font-medium text-ink">{title}</h2>
        <p className="text-base leading-prose text-ink-2">{detail}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  // Static on purpose: motion only answers an action.
  return <div aria-hidden className={cn('rounded-control bg-surface-2', className)} />;
}

/** Placeholder rows for a table or list. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

/** Placeholder for a page: header line, then rows. */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <SkeletonRows rows={6} />
    </div>
  );
}
