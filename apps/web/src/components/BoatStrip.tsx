// The boat strip: an entry drawn as a hull seen from above. Seats read the way the club's sheets
// do: the cox first, then stroke down to bow. The stern is rounded and carries the cox as a small
// circle; the bow is the pointed end. Names sit inside seats; empty seats are dashed with their
// number; sweep seats carry a tick on their rigger side.
//
// Two orientations:
//   horizontal (default)  stern and cox on the left, bow on the right. Port is the top edge,
//                         starboard the bottom, as seen from above with the bow to the right.
//                         As wide as its seats want (a single is short, an eight long), shrinking
//                         to fit its container; `stretch` fills the container instead.
//   vertical              the hull stood on end, as coaches write lineups: stern and cox at the
//                         top, stroke down to bow, the bow pointing down. Fills its container's
//                         width, one seat per row, so names read across. Port is the right edge,
//                         starboard the left.
//
// It knows nothing about drag and drop: pass onSeatClick / onSeatKeyDown for click and keyboard
// editing, or renderSeat to wrap each seat (features/lineups/Seats.tsx).

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
} from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { ConflictIcon, SEVERITY_LABELS } from './ConflictBadge';

export type BoatStripSize = 'xs' | 'sm' | 'md' | 'print';
export type BoatStripOrientation = 'horizontal' | 'vertical';

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
  /** Position in drawing order: the cox first, then stroke down to bow. */
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
    cox: 'gap-1 pl-0.5 pr-1.5',
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
    cox: 'gap-1.5 pl-1 pr-2',
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
    cox: 'gap-2 pl-1 pr-2.5',
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
    cox: 'gap-1.5 pl-1 pr-2',
    coxCircle: 'size-3.5',
    icon: 'size-3.5',
  },
};

/** The vertical hull: one row per seat, the stern dome above, the bow point below. */
interface VerticalSpec {
  rowPx: number;
  sternPx: number;
  bowPx: number;
  /** Row height; md rows grow to 44 px on touch screens (PLAN.md §5.6). */
  row: string;
  pad: string;
  /** The number column (the cox's circle sits in it too). */
  numberCol: string;
  text: string;
  number: string;
  tick: string;
  coxCircle: string;
  seatIcon: string;
  iconPx: number;
  icon: string;
}

const VERTICAL: Record<BoatStripSize, VerticalSpec> = {
  xs: {
    rowPx: 20,
    sternPx: 6,
    bowPx: 12,
    row: 'h-5 gap-1.5 pl-1 pr-1.5',
    pad: 'inset-x-0.5 inset-y-[2px]',
    numberCol: 'w-3',
    text: 'text-xs',
    number: 'text-[11px]',
    tick: 'h-2 w-[2px]',
    coxCircle: 'size-2.5',
    seatIcon: 'size-2.5',
    iconPx: 12,
    icon: 'size-3',
  },
  sm: {
    rowPx: 28,
    sternPx: 10,
    bowPx: 18,
    row: 'h-7 gap-2 pl-1.5 pr-2',
    pad: 'inset-x-1 inset-y-[3px]',
    numberCol: 'w-4',
    text: 'text-sm',
    number: 'text-xs',
    tick: 'h-2.5 w-[3px]',
    coxCircle: 'size-3',
    seatIcon: 'size-3',
    iconPx: 14,
    icon: 'size-3.5',
  },
  md: {
    rowPx: 36,
    sternPx: 14,
    bowPx: 44,
    row: 'h-9 gap-2 pl-2 pr-2 pointer-coarse:h-11',
    pad: 'inset-x-1 inset-y-1',
    numberCol: 'w-4',
    text: 'text-md',
    number: 'text-sm',
    tick: 'h-3 w-[3px]',
    coxCircle: 'size-4',
    seatIcon: 'size-3.5',
    iconPx: 16,
    icon: 'size-4',
  },
  print: {
    rowPx: 24,
    sternPx: 10,
    bowPx: 18,
    row: 'h-6 gap-2 pl-1.5 pr-2',
    pad: 'inset-x-1 inset-y-[3px]',
    numberCol: 'w-4',
    text: 'text-sm',
    number: 'text-xs',
    tick: 'h-2.5 w-[2px]',
    coxCircle: 'size-3',
    seatIcon: 'size-3',
    iconPx: 14,
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
  /** Set by BoatStrip; a seat is a segment across the strip or a row down the hull. */
  orientation?: BoatStripOrientation;
  /** Render as a button (focusable, clickable). */
  interactive: boolean;
  selected?: boolean;
  /** Drop-target hover state. */
  highlighted?: boolean;
  /** Play the 120 ms settle once (set it on the seat that just received an athlete). */
  settling?: boolean;
  /** Horizontal md only: show the short name when the seat is too narrow (see BoatStrip). */
  fitNames?: boolean;
  onSeatClick?: (seat: BoatStripSeat, event: MouseEvent<HTMLElement>) => void;
  onSeatKeyDown?: (seat: BoatStripSeat, event: KeyboardEvent<HTMLElement>) => void;
};

/** One rowing seat or the cox. Exported so renderSeat can attach refs and state to it. */
export function BoatSeat({
  ref,
  seat,
  size,
  orientation = 'horizontal',
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
  const tagRef = ref as Ref<HTMLButtonElement & HTMLDivElement>;
  const occupant = seat.occupant;
  const full = size === 'md' || size === 'print';

  if (orientation === 'vertical') {
    const v = VERTICAL[size];
    const name = full ? occupant?.name : (occupant?.shortName ?? occupant?.name);
    return (
      <Tag
        ref={tagRef}
        data-seat={seat.seat}
        data-empty={occupant ? undefined : ''}
        title={occupant && full ? occupant.name : undefined}
        className={cn(
          'relative flex w-full min-w-0 items-center text-left',
          v.row,
          interactive && 'focus-visible:z-10 focus-visible:outline-offset-[-2px]',
          (selected || highlighted) && 'bg-accent-tint',
          className,
        )}
        {...a11y}
        {...rest}
      >
        {!interactive && <span className="sr-only">{seat.label}</span>}
        {!occupant && !seat.isCox && (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute rounded-control border border-dashed border-line-strong bg-surface-2',
              v.pad,
              highlighted && 'border-accent bg-accent-tint',
            )}
          />
        )}
        <span aria-hidden className={cn('relative flex shrink-0 justify-center', v.numberCol)}>
          {seat.isCox ? (
            <span
              className={cn(
                'shrink-0 rounded-full border-[1.5px]',
                v.coxCircle,
                occupant ? 'border-team bg-team' : 'border-dashed border-line-strong bg-surface-2',
                size === 'print' && 'bg-surface',
              )}
            />
          ) : (
            <span className={cn('font-display font-semibold text-ink-2 tabular-nums', v.number)}>
              {seat.seat}
            </span>
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            'relative min-w-0 flex-1 truncate',
            v.text,
            occupant ? 'font-medium text-ink' : 'text-ink-2',
            settling && 'animate-settle',
          )}
        >
          {occupant ? name : seat.isCox && size !== 'xs' ? 'Cox' : ''}
        </span>
        {seat.conflict && (
          <ConflictIcon severity={seat.conflict} className={cn('relative shrink-0', v.seatIcon)} />
        )}
        {seat.side && (
          <span
            aria-hidden
            className={cn(
              'absolute top-1/2 -translate-y-1/2 bg-team',
              seat.side === 'port' ? 'right-0' : 'left-0',
              v.tick,
            )}
          />
        )}
      </Tag>
    );
  }

  const s = SIZES[size];
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
  const common = cn(
    'relative flex h-full items-center text-left',
    interactive && 'focus-visible:z-10 focus-visible:outline-offset-[-2px]',
    (selected || highlighted) && 'bg-accent-tint',
    fit && '@container',
  );

  if (seat.isCox) {
    return (
      <Tag
        ref={tagRef}
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
      ref={tagRef}
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
            seat.side === 'port' ? 'top-0' : 'bottom-0',
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
  /**
   * The shell's cox position. Accepted so callers can pass the shell's value; every strip draws
   * the cox first, at the stern end, as the club's lineup sheets list it (PLAN.md §4.4).
   */
  coxPosition?: 'stern' | 'bow' | null;
  /** Per-seat side overrides for non-standard rigs (entries.seatSides, or the shell's rig). */
  seatSides?: Partial<Record<Seat, Side>> | null;
  size?: BoatStripSize;
  /** Horizontal (default: schedule, tables, share page) or vertical (the lineup builder). */
  orientation?: BoatStripOrientation;
  teamColor?: TeamColorKey | null;
  /** Worst finding on the entry: colors the hull outline and adds the severity icon. */
  conflict?: Severity | null;
  /** Show the severity icon (after the bow, or in the stern of a vertical hull) with `conflict`. */
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
  /** Horizontal: fill the container instead of stopping at the boat's natural length. */
  stretch?: boolean;
  /**
   * Horizontal md only: when a seat is narrower than 120 px, show the occupant's short name
   * ("Lena K.") instead of truncating the full one. The accessible label keeps the full name.
   */
  fitNames?: boolean;
  className?: string;
}

/** A class's seats in drawing and reading order: the cox first, then stroke down to bow. */
export function stripSeatOrder(boatClass: BoatClass): Seat[] {
  const all = seatsFor(boatClass);
  const rowing = all.filter((s) => s !== 'cox').reverse();
  return isCoxed(boatClass) ? ['cox', ...rowing] : rowing;
}

/** The seats of a class in drawing order, with sides, labels, and occupants resolved. */
export function boatStripSeats(
  boatClass: BoatClass,
  seats: BoatStripProps['seats'] = {},
  opts: Pick<BoatStripProps, 'seatSides' | 'seatConflicts'> = {},
): BoatStripSeat[] {
  return stripSeatOrder(boatClass).map((seat, index) => {
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
  // The hull's pointed end, to the right: two curves meeting at the bow ball.
  return `M 0 0.5 C ${w * 0.45} 0.5 ${w * 0.8} ${h * 0.28} ${w - 0.75} ${h / 2} C ${w * 0.8} ${h * 0.72} ${w * 0.45} ${h - 0.5} 0 ${h - 0.5}`;
}

/**
 * The bow pointing down, in a 100-unit-wide box stretched to the hull's width: the sides carry
 * straight on for a moment, then sweep in to the bow ball.
 */
function bowPathDown(h: number): string {
  return `M 0 0 C 0 ${h * 0.3} 36 ${h * 0.78} 50 ${h - 0.75} C 64 ${h * 0.78} 100 ${h * 0.3} 100 0`;
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

/**
 * The bow of a vertical hull. The box is inset half a pixel on each side so the stroke, which
 * keeps 1 px however far the box stretches, lines up with the hull's side borders.
 */
function BowPoint({
  heightPx,
  tone,
  fill,
}: {
  heightPx: number;
  tone: Tone | null;
  fill: 'team' | 'surface' | 'skeleton';
}) {
  const d = bowPathDown(heightPx);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 100 ${heightPx}`}
      preserveAspectRatio="none"
      height={heightPx}
      style={{ width: 'calc(100% - 1px)', marginLeft: '0.5px' }}
      className="block shrink-0 overflow-visible"
    >
      <path
        d={`${d} Z`}
        className={
          fill === 'team' ? 'fill-team' : fill === 'surface' ? 'fill-surface' : 'fill-surface-2'
        }
      />
      {tone && (
        <path
          d={d}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className={SVG_STROKE[tone]}
        />
      )}
    </svg>
  );
}

export function BoatStrip({
  boatClass,
  seats,
  seatSides,
  size = 'md',
  orientation = 'horizontal',
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
  const resolved = boatStripSeats(boatClass, seats, { seatSides, seatConflicts });
  const isInteractive = interactive ?? !!(onSeatClick || onSeatKeyDown);
  const rowing = resolved.filter((s) => !s.isCox);
  const cox = resolved.find((s) => s.isCox) ?? null;
  const filled = resolved.filter((s) => s.occupant).length;
  const withIcon = !!conflict && showConflictIcon;
  const vertical = orientation === 'vertical';

  const render = (seat: BoatStripSeat) => {
    const props: BoatSeatProps = {
      seat,
      size,
      orientation,
      interactive: isInteractive,
      selected: selectedSeat === seat.seat,
      highlighted: highlightedSeat === seat.seat,
      settling: settlingSeat === seat.seat,
      ...(fitNames && !vertical ? { fitNames } : {}),
      onSeatClick,
      onSeatKeyDown,
    };
    return renderSeat ? renderSeat(seat, props) : <BoatSeat key={seat.seat} {...props} />;
  };

  const conflictText = conflict
    ? `, has ${conflict === 'info' ? 'notes' : SEVERITY_LABELS[conflict].many}`
    : '';
  const groupProps = {
    role: 'group',
    'aria-label': `${label ?? `${boatClass} boat`}, ${filled} of ${resolved.length} seats filled${conflictText}`,
    'data-boat-class': boatClass,
    'data-size': size,
    'data-orientation': orientation,
  };
  // Print is black and white: the team hue becomes ink.
  const colors: CSSProperties =
    size === 'print'
      ? ({ '--team': 'var(--ink)', '--team-tint': 'var(--surface)' } as CSSProperties)
      : teamStyle(teamColor);

  if (vertical) {
    const v = VERTICAL[size];
    return (
      <div
        {...groupProps}
        style={colors}
        className={cn('relative flex w-full min-w-0 flex-col', className)}
      >
        {/* The rounded stern; deeper when it carries the conflict icon. */}
        <div
          aria-hidden
          style={{ height: withIcon ? Math.max(v.sternPx, v.iconPx + 6) : v.sternPx }}
          className={cn(
            'relative flex justify-center rounded-t-[50%_100%] border-x border-t bg-surface',
            BORDER[tone],
          )}
        >
          {withIcon && <ConflictIcon severity={conflict} className={cn('mt-[3px]', v.icon)} />}
        </div>
        <div className={cn('flex flex-col divide-y divide-line border-x bg-surface', BORDER[tone])}>
          {resolved.map((s) => render(s))}
        </div>
        <BowPoint heightPx={v.bowPx} tone={tone} fill={size === 'print' ? 'surface' : 'team'} />
      </div>
    );
  }

  const naturalWidth =
    spec.bowPx +
    spec.sternPx +
    rowing.length * spec.seatPx +
    (cox ? spec.coxPx : 0) +
    2 +
    (withIcon ? spec.iconPx + 6 : 0);
  const style: CSSProperties = { ...colors, ...(stretch ? {} : { maxWidth: naturalWidth }) };
  const rowingFlex: CSSProperties = { flex: `1 1 ${rowing.length * spec.seatPx}px` };
  // The cox gives up width more slowly than the rowing seats.
  const coxFlex: CSSProperties = { flex: `0 0.35 ${spec.coxPx}px` };

  return (
    <div
      {...groupProps}
      style={style}
      className={cn('flex w-full min-w-0 items-center gap-1.5', className)}
    >
      <div className={cn('flex min-w-0 flex-1 items-stretch', spec.height)}>
        {/* The rounded stern. */}
        <div
          aria-hidden
          style={{ width: spec.sternPx }}
          className={cn('shrink-0 rounded-l-boat border-y border-l bg-surface', BORDER[tone])}
        />
        <div className={cn('flex min-w-0 flex-1 items-stretch border-y bg-surface', BORDER[tone])}>
          {/* Seats and cox shrink in proportion to their natural widths. */}
          {cox && (
            <div className="flex min-w-0 items-stretch border-r border-line" style={coxFlex}>
              {render(cox)}
            </div>
          )}
          <div className="flex min-w-0 items-stretch" style={rowingFlex}>
            {rowing.map((s) => render(s))}
          </div>
        </div>
        <BowCap spec={spec} tone={tone} filled={size !== 'print'} />
      </div>
      {withIcon && <ConflictIcon severity={conflict} className={cn('shrink-0', spec.icon)} />}
    </div>
  );
}

/** A hull-shaped placeholder while entries load. */
export function BoatStripSkeleton({
  size = 'md',
  seats = 8,
  orientation = 'horizontal',
  className,
}: {
  size?: BoatStripSize;
  /** Rows (vertical) or rowing seats (horizontal) to size the placeholder for (default 8). */
  seats?: number;
  orientation?: BoatStripOrientation;
  className?: string;
}) {
  if (orientation === 'vertical') {
    const v = VERTICAL[size];
    return (
      <div aria-hidden className={cn('flex w-full flex-col', className)}>
        <div style={{ height: v.sternPx }} className="rounded-t-[50%_100%] bg-surface-2" />
        <div style={{ height: seats * v.rowPx }} className="bg-surface-2" />
        <BowPoint heightPx={v.bowPx} tone={null} fill="skeleton" />
      </div>
    );
  }
  const spec = SIZES[size];
  const width = spec.bowPx + spec.sternPx + seats * spec.seatPx;
  return (
    <div
      aria-hidden
      style={{ maxWidth: width }}
      className={cn('flex w-full items-stretch', spec.height, className)}
    >
      <div className="min-w-0 flex-1 rounded-l-boat bg-surface-2" />
      <svg
        viewBox={`0 0 ${spec.bowPx} ${spec.heightPx}`}
        width={spec.bowPx}
        height={spec.heightPx}
        className="block shrink-0"
      >
        <path d={`${bowPath(spec.bowPx, spec.heightPx)} Z`} className="fill-surface-2" />
      </svg>
    </div>
  );
}
