// Who else is on this regatta right now (PLAN.md §4.6, §10.3): initials avatars ringed in team
// color, at most `max` of them and then "+2". Hover an avatar for "Sarah W. · editing Girls
// lineups · just now"; the stack is also a button that opens the full list, which is how touch
// and keyboard users read it. `compact` (phones) shows only a count. Renders nothing when the
// coach is alone, which in demo mode is always.

import { Users } from 'lucide-react';
import { initialsOf, useRegattaPresence, type PresenceViewer } from '@/data';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/relative-time';
import { teamStyle } from '@/lib/team-colors';
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from './ui/menu';

function describe(v: PresenceViewer, now: Date): string {
  return `${v.shortName} · ${v.activity} · ${relativeTime(v.seenAt, now)}`;
}

function PresenceAvatar({ viewer, className }: { viewer: PresenceViewer; className?: string }) {
  return (
    <span
      aria-hidden
      style={teamStyle(viewer.colorKey)}
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-team bg-team-tint font-display text-xs font-semibold text-ink',
        className,
      )}
    >
      {initialsOf(viewer.name)}
    </span>
  );
}

function PresenceList({ viewers, now }: { viewers: PresenceViewer[]; now: Date }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-medium">On this regatta now</h2>
      <ul className="flex flex-col gap-2.5">
        {viewers.map((v) => (
          <li key={v.userId} className="flex items-center gap-2.5">
            <PresenceAvatar viewer={v} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-base font-medium">{v.name}</span>
              <span className="truncate text-sm text-ink-2">
                {v.activity} · {relativeTime(v.seenAt, now)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PresenceAvatarsProps {
  regattaId: string;
  /** Phones: a count instead of avatars. */
  compact?: boolean;
  /** Avatars shown before "+N" (default 4). */
  max?: number;
  className?: string;
}

export function PresenceAvatars({
  regattaId,
  compact = false,
  max = 4,
  className,
}: PresenceAvatarsProps) {
  const { viewers, now } = useRegattaPresence(regattaId);
  if (viewers.length === 0) return null;

  const n = viewers.length;
  const label = `${n} other ${n === 1 ? 'person' : 'people'} on this regatta: ${viewers
    .map((v) => `${v.shortName}, ${v.activity}`)
    .join('; ')}`;
  const shown = viewers.slice(0, max);
  const rest = viewers.slice(max);

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'inline-flex shrink-0 items-center rounded-control hover:bg-surface-2',
          compact
            ? 'h-11 min-w-11 justify-center gap-1.5 px-2 text-base font-medium text-ink-2 tabular-nums [&_svg]:size-4'
            : 'h-9 px-1 pointer-coarse:h-11',
          className,
        )}
      >
        {compact ? (
          <>
            <Users aria-hidden />
            {n}
          </>
        ) : (
          <span className="flex -space-x-1.5">
            {shown.map((v) => (
              <Tooltip key={v.userId} content={describe(v, now)} side="bottom">
                <span className="rounded-full ring-2 ring-bg">
                  <PresenceAvatar viewer={v} />
                </span>
              </Tooltip>
            ))}
            {rest.length > 0 && (
              <Tooltip
                side="bottom"
                content={
                  <span className="flex flex-col gap-0.5">
                    {rest.map((v) => (
                      <span key={v.userId}>{describe(v, now)}</span>
                    ))}
                  </span>
                }
              >
                <span
                  aria-hidden
                  className="inline-flex size-8 items-center justify-center rounded-full border border-line-strong bg-surface-2 text-xs font-medium text-ink-2 tabular-nums ring-2 ring-bg"
                >
                  +{rest.length}
                </span>
              </Tooltip>
            )}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-80 max-w-[calc(100vw-32px)]">
        <PresenceList viewers={viewers} now={now} />
      </PopoverContent>
    </Popover>
  );
}
