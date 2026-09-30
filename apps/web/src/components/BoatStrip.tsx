// The boat strip (PLAN.md §5.1, §5.4): an entry drawn as a hull seen from above. Bow is the
// pointed end on the left, seats run bow (1) to stroke, the stern is rounded and carries the
// cox as a small circle (or the bow does, for bow-loaded boats). Names sit inside seats; empty
// seats are dashed with their number; sweep seats carry a tick on their rigger side (port is
// the bottom edge, starboard the top, as seen from above with the bow to the left).
//
// Width: a strip is as wide as its seats want (so a single is short and an eight is long) and
// shrinks to fit its container; `stretch` fills the container instead.
//
// The same component serves the lineup builder (md), the schedule (sm), table cells (xs), and
// print. It knows nothing about drag and drop: pass onSeatClick / onSeatKeyDown for click and
// keyboard editing, or renderSeat to wrap each seat (dnd-kit's useDroppable, say):
//
//   <BoatStrip boatClass="4+" seats={...}
//     renderSeat={(seat, props) => <DroppableSeat key={seat.seat} seat={seat} {...props} />} />
//
//   function DroppableSeat({ seat, ...props }: BoatSeatProps) {
//     const { setNodeRef, isOver } = useDroppable({ id: seat.seat });
//     return <BoatSeat {...props} seat={seat} ref={setNodeRef} highlighted={isOver} />;
//   }

import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  Ref,
} from 'react';
import {
  isCoxed,
  seatSide,
  seatsFor,
  type BoatClass,
  type Seat,
  type Severity,
  type Side,
  type TeamColorKey,
} from '@srt/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { ConflictIcon, SEVERITY_LABELS } from './ConflictBadge';

export type BoatStripSize = 'xs' | 'sm' | 'md' | 'print';

export interface SeatOccupant {
  /** Athlete id; handed back to callbacks. */
  id?: string;
  /** Full name: "Lena Kim". */
  name: string;
  /** Tight form for xs and sm: "Lena K." Defaults to the name. */
  shortName?: string;
}

/** Everything known about one seat, passed to callbacks and renderSeat. */
export interface BoatStripSeat {
  seat: Seat;
  /** Position in drawing order: bow to stroke, cox last (or first when bow-loaded). */
  index: number;
  isCox: boolean;
  occupant: SeatOccupant | null;
  side: Side | null;
  conflict: Severity | null;
  /** "Seat 3, Lena Kim, starboard" / "Seat 3, empty" / "Cox, Ari Lee". */
  label: string;
}

const SEAT_CONFLICT_TEXT: Record<Severity, string> = {
  error: 'has an error',
  warning: 'has a warning',
  info: 'has a note',
};

export function seatLabel(
  seat: Seat,
  occupant: SeatOccupant | null | undefined,
  side: Side | null,
  conflict?: Severity | null,
): string {
  const parts = [seat === 'cox' ? 'Cox' : `Seat ${seat}`, occupant ? occupant.name : 'empty'];
  if (occupant && side) parts.push(side);
  if (conflict) parts.push(SEAT_CONFLICT_TEXT[conflict]);
  return parts.join(', ');
}

interface SizeSpec {
  heightPx: number;
  bowPx: number;
  sternPx: number;
  /** Natural width of one rowing seat; seats shrink below it when space is short. */
  seatPx: number;
  coxPx: number;
  iconPx: number;
  height: string;
  seatPad: string;
  text: string;
  number: string;
  tick: string;
  cox: string;
  coxCircle: string;
  icon: string;
}

const SIZES: Record<BoatStripSize, SizeSpec> = {
  xs: {
    heightPx: 24,
    bowPx: 16,
    sternPx: 12,
    seatPx: 80,
    coxPx: 72,
    iconPx: 12,
    height: 'h-6',
    seatPad: 'px-1.5',
    text: 'text-xs',
    number: 'text-[11px]',
    tick: 'w-2 h-[2px]',
    cox: 'gap-1 pl-1.5 pr-0.5',
    coxCircle: 'size-2.5',
    icon: 'size-3',
  },
  sm: {
    heightPx: 36,
    bowPx: 24,
    sternPx: 16,
    seatPx: 112,
    coxPx: 104,
    iconPx: 14,
    height: 'h-9',
    seatPad: 'px-2',
    text: 'text-sm',
    number: 'text-xs',
    tick: 'w-2.5 h-[3px]',
    cox: 'gap-1.5 pl-2 pr-1',
    coxCircle: 'size-3.5',
    icon: 'size-3.5',
  },
  md: {
    heightPx: 56,
    bowPx: 40,
    sternPx: 24,
    seatPx: 160,
    coxPx: 144,
    iconPx: 16,
    height: 'h-14',
    seatPad: 'px-2.5',
    text: 'text-base',
    number: 'text-sm',
    tick: 'w-3 h-[3px]',
    cox: 'gap-2 pl-2.5 pr-1',
    coxCircle: 'size-5',
    icon: 'size-4',
  },
  print: {
    heightPx: 40,
    bowPx: 28,
    sternPx: 16,
    seatPx: 128,
    coxPx: 136,
    iconPx: 14,
    height: 'h-10',
    seatPad: 'px-2',
    text: 'text-sm',
    number: 'text-xs',
    tick: 'w-2.5 h-[2px]',
    cox: 'gap-1.5 pl-2 pr-1',
    coxCircle: 'size-3.5',
    icon: 'size-3.5',
  },
};

type Tone = Severity | 'none';

const BORDER: Record<Tone, string> = {
  none: 'border-team',
  error: 'border-danger',
  warning: 'border-warn',
  info: 'border-info',
};

const SVG_STROKE: Record<Tone, string> = {
  none: 'stroke-team',
  error: 'stroke-danger',
  warning: 'stroke-warn',
  info: 'stroke-info',
};

// ---------------------------------------------------------------------------

export type BoatSeatProps = Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'onKeyDown'> & {
  ref?: Ref<HTMLElement>;
  seat: BoatStripSeat;
  size: BoatStripSize;
  /** Render as a button (focusable, clickable). */
  interactive: boolean;
  selected?: boolean;
  /** Drop-target hover state. */
  highlighted?: boolean;
  /** Play the 120 ms settle once (set it on the seat that just received an athlete). */
  settling?: boolean;
  /** md only: show the short name when the seat is too narrow for the full one (see BoatStrip). */
  fitNames?: boolean;
  onSeatClick?: (seat: BoatStripSeat, event: MouseEvent<HTMLElement>) => void;
  onSeatKeyDown?: (seat: BoatStripSeat, event: KeyboardEvent<HTMLElement>) => void;
};

/** One rowing seat or the cox. Exported so renderSeat can attach refs and state to it. */
export function BoatSeat({
  ref,
  seat,
  size,
  interactive,
  selected,
  highlighted,
  settling,
  fitNames,
  onSeatClick,
  onSeatKeyDown,
  className,
  ...rest
}: BoatSeatProps) {
  const s = SIZES[size];
  const occupant = seat.occupant;
  const full = size === 'md' || size === 'print';
  const fit =
    fitNames && size === 'md' && !!occupant?.shortName && occupant.shortName !== occupant.name;
  // A container query per seat picks the name that fits: full ("Lena Kim"), short ("Lena K."),
  // or, in the tightest seats, the first name the way a whiteboard lineup reads.
  const shown = fit ? (
    <>
      <span className="@max-[7.5rem]:hidden">{occupant!.name}</span>
      <span className="hidden @max-[7.5rem]:inline @max-[4.5rem]:hidden">
        {occupant!.shortName}
      </span>
      <span className="hidden text-sm @max-[4.5rem]:inline">
        {occupant!.shortName!.replace(/\s\S\.$/, '')}
      </span>
    </>
  ) : full ? (
    occupant?.name
  ) : (
    (occupant?.shortName ?? occupant?.name)
  );
  const Tag = interactive ? 'button' : 'div';
  const a11y = interactive
    ? {
        type: 'button' as const,
        'aria-label': seat.label,
        'aria-pressed': selected ? true : undefined,
        onClick: (e: MouseEvent<HTMLElement>) => onSeatClick?.(seat, e),
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => onSeatKeyDown?.(seat, e),
      }
    : {};
  const common = cn(
    'relative flex h-full items-center text-left',
    interactive && 'focus-visible:z-10 focus-visible:outline-offset-[-2px]',
    (selected || highlighted) && 'bg-accent-tint',
    fit && '@container',
  );

  if (seat.isCox) {
    return (
      <Tag
        ref={ref as Ref<HTMLButtonElement & HTMLDivElement>}
        data-seat="cox"
        data-empty={occupant ? undefined : ''}
        className={cn(common, 'w-full min-w-0', s.cox, className)}
        {...a11y}
        {...rest}
      >
        {!interactive && <span className="sr-only">{seat.label}</span>}
        <span
          aria-hidden
          className={cn(
            'shrink-0 rounded-full border-[1.5px]',
            s.coxCircle,
            occupant ? 'border-team bg-team' : 'border-dashed border-line-strong bg-surface-2',
            size === 'print' && 'bg-surface',
          )}
        />
        <span
          aria-hidden
          className={cn(
            'min-w-0 truncate',
            s.text,
            occupant ? 'font-medium text-ink' : 'text-ink-2',
            settling && 'animate-settle',
          )}
        >
          {occupant ? shown : size === 'xs' ? '' : 'Cox'}
        </span>
        {seat.conflict && <ConflictIcon severity={seat.conflict} className="size-2.5 shrink-0" />}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as Ref<HTMLButtonElement & HTMLDivElement>}
      data-seat={seat.seat}
      data-empty={occupant ? undefined : ''}
      className={cn(
        common,
        'min-w-0 flex-1 basis-0 border-l border-line first:border-l-0',
        s.seatPad,
        fit && 'px-2',
        className,
      )}
      title={fit ? occupant!.name : undefined}
      {...a11y}
      {...rest}
    >
      {!interactive && <span className="sr-only">{seat.label}</span>}
      {!occupant && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute rounded-control border border-dashed border-line-strong bg-surface-2',
            size === 'xs' ? 'inset-x-0.5 inset-y-[3px]' : 'inset-x-1 inset-y-1.5',
            highlighted && 'border-accent bg-accent-tint',
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          'relative flex min-w-0',
          size === 'md' ? 'flex-col gap-0.5' : 'items-baseline gap-1.5',
          !occupant && 'w-full items-center justify-center',
        )}
      >
        {(size !== 'xs' || !occupant) && (
          <span
            className={cn('shrink-0 font-display font-semibold text-ink-2 tabular-nums', s.number)}
          >
            {seat.seat}
          </span>
        )}
        {occupant && (
          <span
            className={cn(
              'min-w-0 truncate font-medium text-ink',
              s.text,
              settling && 'animate-settle',
            )}
          >
            {shown}
          </span>
        )}
      </span>
      {seat.side && (
        <span
          aria-hidden
          className={cn(
            'absolute left-1/2 -translate-x-1/2 bg-team',
            seat.side === 'port' ? 'bottom-0' : 'top-0',
            s.tick,
          )}
        />
      )}
      {seat.conflict && (
        <ConflictIcon
          severity={seat.conflict}
          className={cn(
            'absolute',
            size === 'xs' ? 'top-0.5 right-0.5 size-2' : 'top-1 right-1 size-2.5',
          )}
        />
      )}
    </Tag>
  );
}

// ---------------------------------------------------------------------------

export interface BoatStripProps {
  boatClass: BoatClass;
  /** Occupants by seat; missing seats are empty. */
  seats?: Partial<Record<Seat, SeatOccupant | null>>;
  /** Where the cox sits in a coxed boat (from the shell); default stern. */
  coxPosition?: 'stern' | 'bow' | null;
  /** Per-seat side overrides for non-standard rigs (entries.seatSides, or the shell's rig). */
  seatSides?: Partial<Record<Seat, Side>> | null;
  size?: BoatStripSize;
  teamColor?: TeamColorKey | null;
  /** Worst finding on the entry: colors the hull outline and adds the severity icon. */
  conflict?: Severity | null;
  /** Show the severity icon after the stern when `conflict` is set (default true). */
  showConflictIcon?: boolean;
  /** Findings that point at one seat (an unavailable athlete, a side mismatch). */
  seatConflicts?: Partial<Record<Seat, Severity>>;
  /** Accessible name for the boat, e.g. "Boys V8, Monahan". Default: the class. */
  label?: string;
  selectedSeat?: Seat | null;
  highlightedSeat?: Seat | null;
  settlingSeat?: Seat | null;
  onSeatClick?: (seat: BoatStripSeat, event: MouseEvent<HTMLElement>) => void;
  onSeatKeyDown?: (seat: BoatStripSeat, event: KeyboardEvent<HTMLElement>) => void;
  /** Make seats buttons even without click or key handlers (renderSeat handles input). */
  interactive?: boolean;
  /** Wrap or replace each seat; render <BoatSeat {...props} /> to keep the look. */
  renderSeat?: (seat: BoatStripSeat, props: BoatSeatProps) => ReactNode;
  /** Fill the container instead of stopping at the boat's natural length. */
  stretch?: boolean;
  /**
   * md only: when a seat is narrower than 120 px, show the occupant's short name ("Lena K.")
   * instead of truncating the full one. The accessible label keeps the full name.
   */
  fitNames?: boolean;
  className?: string;
}

/** The seats of a class in drawing order, with sides, labels, and occupants resolved. */
export function boatStripSeats(
  boatClass: BoatClass,
  seats: BoatStripProps['seats'] = {},
  opts: Pick<BoatStripProps, 'coxPosition' | 'seatSides' | 'seatConflicts'> = {},
): BoatStripSeat[] {
  const all = seatsFor(boatClass);
  const rowing = all.filter((s) => s !== 'cox');
  const coxed = isCoxed(boatClass);
  const order: Seat[] =
    coxed && opts.coxPosition === 'bow' ? ['cox', ...rowing] : coxed ? [...rowing, 'cox'] : rowing;
  return order.map((seat, index) => {
    const occupant = seats[seat] ?? null;
    const side = seatSide(boatClass, seat, opts.seatSides ?? undefined);
    const conflict = opts.seatConflicts?.[seat] ?? null;
    return {
      seat,
      index,
      isCox: seat === 'cox',
      occupant,
      side,
      conflict,
      label: seatLabel(seat, occupant, side, conflict),
    };
  });
}

function bowPath(w: number, h: number): string {
  // The hull's pointed end: two curves meeting at the bow ball.
  return `M ${w} 0.5 C ${w * 0.55} 0.5 ${w * 0.2} ${h * 0.28} 0.75 ${h / 2} C ${w * 0.2} ${h * 0.72} ${w * 0.55} ${h - 0.5} ${w} ${h - 0.5}`;
}

function BowCap({ spec, tone, filled }: { spec: SizeSpec; tone: Tone; filled: boolean }) {
  const d = bowPath(spec.bowPx, spec.heightPx);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${spec.bowPx} ${spec.heightPx}`}
      width={spec.bowPx}
      height={spec.heightPx}
      className="block shrink-0 overflow-visible"
    >
      <path d={`${d} Z`} className={filled ? 'fill-team' : 'fill-surface'} />
      <path d={d} fill="none" strokeWidth={1} className={SVG_STROKE[tone]} />
    </svg>
  );
}

export function BoatStrip({
  boatClass,
  seats,
  coxPosition,
  seatSides,
  size = 'md',
  teamColor,
  conflict = null,
  showConflictIcon = true,
  seatConflicts,
  label,
  selectedSeat,
  highlightedSeat,
  settlingSeat,
  onSeatClick,
  onSeatKeyDown,
  interactive,
  renderSeat,
  stretch = false,
  fitNames = false,
  className,
}: BoatStripProps) {
  const spec = SIZES[size];
  const tone: Tone = conflict ?? 'none';
  const resolved = boatStripSeats(boatClass, seats, { coxPosition, seatSides, seatConflicts });
  const isInteractive = interactive ?? !!(onSeatClick || onSeatKeyDown);
  const rowing = resolved.filter((s) => !s.isCox);
  const cox = resolved.find((s) => s.isCox) ?? null;
  const coxAtBow = resolved[0]?.isCox ?? false;
  const filled = resolved.filter((s) => s.occupant).length;
  const withIcon = !!conflict && showConflictIcon;

  const naturalWidth =
    spec.bowPx +
    spec.sternPx +
    rowing.length * spec.seatPx +
    (cox ? spec.coxPx : 0) +
    2 +
    (withIcon ? spec.iconPx + 6 : 0);

  // Print is black and white: the team hue becomes ink.
  const style: CSSProperties = {
    ...(size === 'print'
      ? ({ '--team': 'var(--ink)', '--team-tint': 'var(--surface)' } as CSSProperties)
      : teamStyle(teamColor)),
    ...(stretch ? {} : { maxWidth: naturalWidth }),
  };

  const rowingFlex: CSSProperties = { flex: `1 1 ${rowing.length * spec.seatPx}px` };
  // The cox gives up width more slowly than the rowing seats.
  const coxFlex: CSSProperties = { flex: `0 0.35 ${spec.coxPx}px` };

  const render = (seat: BoatStripSeat) => {
    const props: BoatSeatProps = {
      seat,
      size,
      interactive: isInteractive,
      selected: selectedSeat === seat.seat,
      highlighted: highlightedSeat === seat.seat,
      settling: settlingSeat === seat.seat,
      ...(fitNames ? { fitNames } : {}),
      onSeatClick,
      onSeatKeyDown,
    };
    return renderSeat ? renderSeat(seat, props) : <BoatSeat key={seat.seat} {...props} />;
  };

  const conflictText = conflict
    ? `, has ${conflict === 'info' ? 'notes' : SEVERITY_LABELS[conflict].many}`
    : '';

  return (
    <div
      role="group"
      aria-label={`${label ?? `${boatClass} boat`}, ${filled} of ${resolved.length} seats filled${conflictText}`}
      style={style}
      data-boat-class={boatClass}
      data-size={size}
      className={cn('flex w-full min-w-0 items-center gap-1.5', className)}
    >
      <div className={cn('flex min-w-0 flex-1 items-stretch', spec.height)}>
        <BowCap spec={spec} tone={tone} filled={size !== 'print'} />
        <div className={cn('flex min-w-0 flex-1 items-stretch border-y bg-surface', BORDER[tone])}>
          {/* Seats and cox shrink in proportion to their natural widths. */}
          {cox && coxAtBow && (
            <div className="flex min-w-0 items-stretch border-r border-line" style={coxFlex}>
              {render(cox)}
            </div>
          )}
          <div className="flex min-w-0 items-stretch" style={rowingFlex}>
            {rowing.map((s) => render(s))}
          </div>
          {cox && !coxAtBow && (
            <div className="flex min-w-0 items-stretch border-l border-line" style={coxFlex}>
              {render(cox)}
            </div>
          )}
        </div>
        {/* The rounded stern. */}
        <div
          aria-hidden
          style={{ width: spec.sternPx }}
          className={cn('shrink-0 rounded-r-boat border-y border-r bg-surface', BORDER[tone])}
        />
      </div>
      {withIcon && <ConflictIcon severity={conflict} className={cn('shrink-0', spec.icon)} />}
    </div>
  );
}

/** A hull-shaped placeholder while entries load. */
export function BoatStripSkeleton({
  size = 'md',
  seats = 8,
  className,
}: {
  size?: BoatStripSize;
  /** Rowing seats to size the placeholder for (default an eight). */
  seats?: number;
  className?: string;
}) {
  const spec = SIZES[size];
  const width = spec.bowPx + spec.sternPx + seats * spec.seatPx;
  return (
    <div
      aria-hidden
      style={{ maxWidth: width }}
      className={cn('flex w-full items-stretch', spec.height, className)}
    >
      <svg
        viewBox={`0 0 ${spec.bowPx} ${spec.heightPx}`}
        width={spec.bowPx}
        height={spec.heightPx}
        className="block shrink-0"
      >
        <path d={`${bowPath(spec.bowPx, spec.heightPx)} Z`} className="fill-surface-2" />
      </svg>
      <div className="min-w-0 flex-1 rounded-r-boat bg-surface-2" />
    </div>
  );
}
