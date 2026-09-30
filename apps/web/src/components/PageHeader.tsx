import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The top of every page: a title in the display face, an optional line of context, and the
 * page's actions on the right (they wrap below the title on a phone).
 */
export function PageHeader({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  /** A short line under the title: dates, venue, counts. */
  description?: ReactNode;
  /** Buttons that say what they do: "Add entry", "Pack trailer". */
  actions?: ReactNode;
  /** Extra rows under the header (filters, toolbars). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
          {description && <p className="text-base text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
