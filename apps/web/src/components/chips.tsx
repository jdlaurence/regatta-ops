// Small labels used across features: team chips, side and class badges, shell and oar chips. Only
// ShellChip is a pill, because a shell is a boat.

import type {
  AthleteSide,
  BoatClass,
  EquipmentStatus,
  OarSet,
  Shell,
  Team,
  TeamColorKey,
} from '@regatta-ops/domain';
import { oarSetLabel, shellLabel } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';

// TeamChip ------------------------------------------------------------------

export function TeamChip({
  team,
  short = false,
  size = 'md',
  className,
}: {
  team: Pick<Team, 'name' | 'shortName' | 'colorKey'>;
  /** Use the short name ("Boys") instead of the full name ("Junior boys"). */
  short?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const text = short ? team.shortName || team.name : team.name;
  return (
    <span
      style={teamStyle(team.colorKey)}
      title={short ? team.name : undefined}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-control border-l-[3px] border-team bg-team-tint font-medium text-ink',
        size === 'sm' ? 'h-5 pr-1.5 pl-1 text-xs' : 'h-6 pr-2 pl-1.5 text-sm',
        className,
      )}
    >
      <span className="truncate">{text}</span>
    </span>
  );
}

/** A team-colored dot, for dense lists and legends. */
export function TeamDot({ colorKey, className }: { colorKey: TeamColorKey; className?: string }) {
  return (
    <span
      aria-hidden
      style={teamStyle(colorKey)}
      className={cn('inline-block size-2.5 shrink-0 rounded-full bg-team', className)}
    />
  );
}

// SideBadge -----------------------------------------------------------------

const SIDE_TEXT: Record<AthleteSide, { short: string; long: string } | null> = {
  port: { short: 'P', long: 'Port' },
  starboard: { short: 'S', long: 'Starboard' },
  both: { short: 'P/S', long: 'Port or starboard' },
  none: null,
};

/** Crossed sculls: the badge for athletes who scull rather than sweep. */
function ScullIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-3.5', className)} aria-hidden>
      <path
        d="M3 13 13 3M3 3l10 10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M11.2 1.8 14.2 4.8 12.6 5.4 10.6 3.4ZM4.8 1.8 1.8 4.8 3.4 5.4 5.4 3.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SideBadge({
  side,
  canScull = false,
  className,
}: {
  side: AthleteSide;
  /** Show the scull icon when the athlete has no sweep side. */
  canScull?: boolean;
  className?: string;
}) {
  const t = SIDE_TEXT[side];
  const base =
    'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-control border border-line px-1 text-xs font-medium text-ink-2 tabular-nums';
  if (t) {
    return (
      <span className={cn(base, className)} title={t.long}>
        <span aria-hidden>{t.short}</span>
        <span className="sr-only">{t.long}</span>
      </span>
    );
  }
  if (canScull) {
    return (
      <span className={cn(base, className)} title="Sculler">
        <ScullIcon />
        <span className="sr-only">Sculler</span>
      </span>
    );
  }
  return null;
}

// ClassBadge ----------------------------------------------------------------

export function ClassBadge({ boatClass, className }: { boatClass: BoatClass; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-control bg-surface-2 px-1.5 font-display text-xs font-semibold text-ink tabular-nums',
        className,
      )}
    >
      {boatClass}
    </span>
  );
}

// Equipment status ----------------------------------------------------------

const STATUS: Record<EquipmentStatus, { label: string; tone: string } | null> = {
  in_service: null,
  limited: { label: 'Limited', tone: 'text-warn' },
  out_of_service: { label: 'Out of service', tone: 'text-danger' },
  retired: { label: 'Retired', tone: 'text-ink-2' },
};

function StatusNote({ status }: { status: EquipmentStatus }) {
  const s = STATUS[status];
  if (!s) return null;
  return <span className={cn('shrink-0 text-xs font-medium', s.tone)}>{s.label}</span>;
}

// ShellChip -----------------------------------------------------------------

/** A shell: nickname, class, home-team color. The one chip that is a pill (a boat). */
export function ShellChip({
  shell,
  teamColor,
  showClass = true,
  className,
}: {
  shell: Pick<Shell, 'name' | 'nickname' | 'boatClass' | 'status'>;
  /** Home team color; omitted for club boats. */
  teamColor?: TeamColorKey | null;
  showClass?: boolean;
  className?: string;
}) {
  return (
    <span
      style={teamStyle(teamColor ?? 'slate')}
      title={shell.nickname && shell.nickname !== shell.name ? shell.name : undefined}
      className={cn(
        'inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-boat border border-line bg-surface pr-2.5 pl-1.5 text-sm',
        className,
      )}
    >
      <span aria-hidden className="size-3.5 shrink-0 rounded-full bg-team" />
      <span className="truncate font-medium">{shellLabel(shell)}</span>
      {showClass && (
        <span className="shrink-0 font-display text-xs font-semibold text-ink-2 tabular-nums">
          {shell.boatClass}
        </span>
      )}
      <StatusNote status={shell.status} />
    </span>
  );
}

// OarChip -------------------------------------------------------------------

/** An oar set: name and the color code people look for at the trailer. */
export function OarChip({
  oarSet,
  className,
}: {
  oarSet: Pick<OarSet, 'name' | 'color' | 'type' | 'status'>;
  className?: string;
}) {
  return (
    <span
      title={oarSetLabel(oarSet)}
      className={cn(
        'inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-sm',
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ink-2" aria-hidden>
        <path d="M2 14 11 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M10 2.5 13.5 6 12 7.5 8.5 4Z" fill="currentColor" />
      </svg>
      <span className="truncate font-medium">{oarSet.name}</span>
      {oarSet.color && <span className="truncate text-ink-2">{oarSet.color}</span>}
      <span className="sr-only">{oarSet.type === 'scull' ? 'sculls' : 'sweep oars'}</span>
      <StatusNote status={oarSet.status} />
    </span>
  );
}
