import type { Finding, Severity } from '@srt/domain';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';

// Severity is always shape plus color, never color alone (PLAN.md §5.4): a filled circle for
// errors, a triangle for warnings, a circle with an i for information.

const TEXT: Record<Severity, string> = {
  error: 'text-danger',
  warning: 'text-warn',
  info: 'text-info',
};

const TINT: Record<Severity, string> = {
  error: 'bg-danger-tint',
  warning: 'bg-warn-tint',
  info: 'bg-info-tint',
};

export const SEVERITY_LABELS: Record<Severity, { one: string; many: string }> = {
  error: { one: 'error', many: 'errors' },
  warning: { one: 'warning', many: 'warnings' },
  info: { one: 'note', many: 'notes' },
};

export function severityText(severity: Severity, count: number): string {
  const l = SEVERITY_LABELS[severity];
  return `${count} ${count === 1 ? l.one : l.many}`;
}

/** The severity glyph alone. Decorative unless given a `title`. */
export function ConflictIcon({
  severity,
  className,
  title,
}: {
  severity: Severity;
  className?: string;
  title?: string;
}) {
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true };
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-3.5 shrink-0', TEXT[severity], className)}
      {...a11y}
    >
      {severity === 'error' && <circle cx="8" cy="8" r="6" fill="currentColor" />}
      {severity === 'warning' && (
        <path
          d="M8 1.8 15 14.2H1Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {severity === 'info' && (
        <>
          <circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <rect x="7.2" y="7" width="1.6" height="4.6" rx="0.4" fill="currentColor" />
          <circle cx="8" cy="4.9" r="1" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export interface ConflictBadgeProps {
  severity: Severity;
  /** Shown next to the icon; omit for a single finding. */
  count?: number;
  /** Visible text instead of a count, e.g. "Hot seat". */
  label?: string;
  /** When given, the badge opens a popover listing their messages (hover or tap for details). */
  findings?: Finding[];
  className?: string;
}

/**
 * A small badge with a severity icon and a count or label. Radius is the control radius:
 * pills mean boats (PLAN.md §5.2).
 */
export function ConflictBadge({ severity, count, label, findings, className }: ConflictBadgeProps) {
  const n = count ?? findings?.length ?? 1;
  const srText = label ? `${label}, ${SEVERITY_LABELS[severity].one}` : severityText(severity, n);
  const body = (
    <>
      <ConflictIcon severity={severity} className="size-3" />
      <span aria-hidden className="tabular-nums">
        {label ?? (count !== undefined || findings ? n : null)}
      </span>
      <span className="sr-only">{srText}</span>
    </>
  );
  const classes = cn(
    'inline-flex h-5 shrink-0 items-center gap-1 rounded-control px-1.5 text-xs font-medium',
    TEXT[severity],
    TINT[severity],
    className,
  );
  if (!findings || findings.length === 0) return <span className={classes}>{body}</span>;
  return (
    <Popover>
      <PopoverTrigger className={cn(classes, 'pointer-coarse:h-8 hover:brightness-95')}>
        {body}
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <ul className="flex flex-col gap-2">
          {findings.map((f) => (
            <li key={f.id} className="flex gap-2 text-base leading-prose">
              <ConflictIcon severity={f.severity} className="mt-1" />
              <span>{f.message}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** One badge per severity present, most severe first. Renders nothing when there are none. */
export function ConflictBadges({
  findings,
  className,
}: {
  findings: Finding[];
  className?: string;
}) {
  const groups = (['error', 'warning', 'info'] as const)
    .map((s) => ({ s, list: findings.filter((f) => f.severity === s) }))
    .filter((g) => g.list.length > 0);
  if (groups.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {groups.map((g) => (
        <ConflictBadge key={g.s} severity={g.s} findings={g.list} />
      ))}
    </span>
  );
}
