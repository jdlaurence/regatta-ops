// The small "‹ Teams" link above a detail page's header, back to its list. One look on every
// detail page; a 44 px target on touch screens.

import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

export function BackLink({
  to,
  label,
  className,
}: {
  to: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        '-ml-1 inline-flex w-fit items-center gap-1 rounded-control px-1 text-sm text-ink-2 hover:text-ink pointer-coarse:min-h-11',
        className,
      )}
    >
      <ChevronLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}
