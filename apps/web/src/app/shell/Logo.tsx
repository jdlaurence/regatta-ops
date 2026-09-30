import { cn } from '@/lib/cn';

/** The SRT mark: a hull from above, pointed bow left, seats, cox circle at the stern. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 14" className={cn('h-3.5 w-9 shrink-0', className)} aria-hidden>
      <path
        d="M0.6 7 C6 3 10 2 15 2 H30 a5 5 0 0 1 0 10 H15 C10 12 6 11 0.6 7 Z"
        className="fill-accent"
      />
      <path
        d="M17.5 3.5 V10.5 M21.5 3.5 V10.5 M25.5 3.5 V10.5"
        className="stroke-surface"
        strokeWidth="1"
      />
      <circle cx="30" cy="7" r="2" className="fill-surface" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-ink">SRT</span>
    </span>
  );
}
