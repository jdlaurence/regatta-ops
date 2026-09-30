// The day timeline (PLAN.md §4.5, §6.3, §5.4 "Timeline bar"): hand-written SVG, no chart
// library. A time axis with 15-minute gridlines; rows grouped by shell, team, or oar set; each
// entry a rounded bar spanning its busy window with the race as a darker segment in the team
// color. Conflicts are a hatched intersection across both bars; hot seats are a link from the
// earlier boat landing to the next race start (amber, dashed blue once acknowledged). A
// now-line shows on race day.
//
// Two modes:
// - full (the schedule page): chips as row labels, labels on bars, a legend, horizontal scroll
//   inside its own box on narrow screens. Bars are one tab stop; arrow keys move between them.
// - mini (the regatta overview's "Day at a glance", §6.2): thin bars that fit the width, hour
//   labels only, no scroll.
//
//   const { input, findings } = useFindings(regattaId);
//   {input && <DayTimeline input={input} findings={findings} day="2026-11-01" mini
//     onBarClick={(entryId, bar) => navigate(lineupEntryPath(regattaId, bar.teamId, entryId))} />}
//
// Layout math lives in timeline-lib.ts (pure, tested).

import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { clockAt, type ConflictInput, type Entry, type Finding } from '@srt/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { OarChip, ShellChip, TeamChip } from './chips';
import {
  axisMinutes,
  buildTimeline,
  fitText,
  nowOnAxis,
  timeToX,
  type TimelineBar,
  type TimelineGroupBy,
  type TimelineMark,
  type TimelineModel,
  type TimelineRow,
} from './timeline-lib';

export interface DayTimelineProps {
  /** The conflict engine's input (useFindings(regattaId).input). */
  input: ConflictInput;
  /** Findings for the same input (useFindings(regattaId).findings): conflicts and hot seats. */
  findings: readonly Finding[];
  /** 'YYYY-MM-DD' in the regatta's zone. */
  day: string;
  /** Rows by shell (default), team, or oar set. */
  groupBy?: TimelineGroupBy;
  /** Keep only some entries. Memoize it; a new function recomputes the layout. */
  includeEntry?: (entry: Entry) => boolean;
  /** The current time; draws the now-line when it falls on `day`. Omit for no line. */
  now?: number | string | Date | null;
  /** Compact overview mode: thin bars, fits its container, no row labels or legend. */
  mini?: boolean;
  /** Called when a bar is clicked or activated with Enter or Space. */
  onBarClick?: (entryId: string, bar: TimelineBar) => void;
  /** Outline one entry's bar. */
  selectedEntryId?: string | null;
  /** Accessible name of the timeline. Default "Timeline for <day>". */
  label?: string;
  /** Shown instead of the plot when the day has no scheduled entries. */
  emptyText?: ReactNode;
  /** Smallest horizontal scale in px per minute (full mode). Default 2.5 (an hour is 150 px). */
  minPxPerMin?: number;
  className?: string;
}

// Geometry (px). Lanes are taller on touch screens so each bar is a 44 px target.
const AXIS_H = 28;
const ROW_PAD = 4;
const PAD_LEFT = 16;
const PAD_RIGHT = 24;
const FINE = { pitch: 30, bar: 22 };
const COARSE = { pitch: 44, bar: 30 };
const MINI = { pitch: 7, bar: 5, rowPad: 1 };

const GROUP_HEADING: Record<TimelineGroupBy, string> = {
  shell: 'Shell',
  team: 'Team',
  oar_set: 'Oar set',
};

function toMs(now: DayTimelineProps['now']): number | null {
  if (now == null) return null;
  if (typeof now === 'number') return now;
  const ms = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function subscribeCoarse(cb: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia('(pointer: coarse)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function isCoarse(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

/** True on touch screens (44 px targets). */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
}

/** Width of the element's box, kept current with a ResizeObserver (0 until measured). */
function useWidth<T extends HTMLElement>(): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w));
    });
    ro.observe(el);
    observer.current = ro;
  }, []);
  return [ref, width];
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/** What each bar's accessible name adds about its marks: "hot seat with Boys N8 A, 71 minutes". */
function markTexts(model: TimelineModel): Map<string, string[]> {
  const labelOf = new Map(model.bars.map((b) => [b.entryId, b.description.split(', ')[0]!]));
  const out = new Map<string, string[]>();
  const add = (id: string, text: string) => out.set(id, [...(out.get(id) ?? []), text]);
  for (const m of model.marks) {
    for (const [self, other] of [
      [m.fromEntryId, m.toEntryId],
      [m.toEntryId, m.fromEntryId],
    ] as const) {
      const who = labelOf.get(other) ?? 'another entry';
      if (m.kind === 'conflict') add(self, `conflict with ${who}`);
      else {
        const gap = m.gapMin !== undefined ? `, ${m.gapMin} minutes` : '';
        add(self, `hot seat with ${who}${gap}${m.acknowledged ? ', acknowledged' : ''}`);
      }
    }
  }
  return out;
}

/** Reading order for keyboard movement: row by row, left to right. */
function readingOrder(model: TimelineModel): TimelineBar[] {
  const rowIndex = new Map(model.rows.map((r, i) => [r.id, i]));
  return [...model.bars].sort(
    (a, b) =>
      (rowIndex.get(a.rowId) ?? 0) - (rowIndex.get(b.rowId) ?? 0) ||
      a.busyStart - b.busyStart ||
      a.lane - b.lane,
  );
}

function RowLabel({ row }: { row: TimelineRow }) {
  if (row.shell) {
    // Phones drop the class so the name fits the narrow label column.
    return (
      <>
        <ShellChip
          shell={row.shell}
          teamColor={row.teamColor}
          showClass={false}
          className="max-w-full sm:hidden"
        />
        <ShellChip
          shell={row.shell}
          teamColor={row.teamColor}
          className="hidden max-w-full sm:inline-flex"
        />
      </>
    );
  }
  if (row.team) return <TeamChip team={row.team} short size="sm" className="max-w-full" />;
  if (row.oarSet) return <OarChip oarSet={row.oarSet} className="max-w-full" />;
  return <span className="truncate text-sm text-ink-2">{row.label}</span>;
}

// ---------------------------------------------------------------------------

export function DayTimeline({
  input,
  findings,
  day,
  groupBy = 'shell',
  includeEntry,
  now,
  mini = false,
  onBarClick,
  selectedEntryId = null,
  label,
  emptyText = 'No scheduled races on this day.',
  minPxPerMin = 2.5,
  className,
}: DayTimelineProps) {
  const model = useMemo(
    () => buildTimeline(input, findings, { day, groupBy, includeEntry }),
    [input, findings, day, groupBy, includeEntry],
  );
  const nowMs = toMs(now);
  const name = label ?? `Timeline for ${day}`;

  if (!model.axis) {
    return (
      <div
        role="group"
        aria-label={name}
        className={cn(
          'rounded-card border border-line bg-surface px-4 py-6 text-base text-ink-2',
          mini && 'px-3 py-4',
          className,
        )}
      >
        {emptyText}
      </div>
    );
  }

  return mini ? (
    <MiniTimeline
      model={model}
      nowMs={nowMs}
      onBarClick={onBarClick}
      selectedEntryId={selectedEntryId}
      label={name}
      className={className}
    />
  ) : (
    <FullTimeline
      model={model}
      nowMs={nowMs}
      onBarClick={onBarClick}
      selectedEntryId={selectedEntryId}
      label={name}
      minPxPerMin={minPxPerMin}
      className={className}
    />
  );
}

interface ModeProps {
  model: TimelineModel;
  nowMs: number | null;
  onBarClick?: DayTimelineProps['onBarClick'];
  selectedEntryId: string | null;
  label: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Full mode

interface RowGeom {
  row: TimelineRow;
  top: number;
  height: number;
}

function FullTimeline({
  model,
  nowMs,
  onBarClick,
  selectedEntryId,
  label,
  minPxPerMin,
  className,
}: ModeProps & { minPxPerMin: number }) {
  const axis = model.axis!;
  const coarse = useCoarsePointer();
  const lane = coarse ? COARSE : FINE;
  const [scrollRef, scrollWidth] = useWidth<HTMLDivElement>();
  const [labelRef, labelWidth] = useWidth<HTMLDivElement>();
  const uid = safeId(useId());
  const hatchId = `hatch-${uid}`;
  const descId = `desc-${uid}`;

  // Fill the box when the day is short; scroll inside the box when it is long.
  const minutes = axisMinutes(axis);
  const available = scrollWidth - labelWidth - PAD_LEFT - PAD_RIGHT;
  const pxPerMin = Math.min(8, Math.max(minPxPerMin, available > 0 ? available / minutes : 0));
  const plotWidth = PAD_LEFT + minutes * pxPerMin + PAD_RIGHT;
  const x = (t: number) => PAD_LEFT + timeToX(t, axis, pxPerMin);

  const geoms: RowGeom[] = [];
  let top = AXIS_H;
  for (const row of model.rows) {
    const height = row.lanes * lane.pitch + ROW_PAD * 2;
    geoms.push({ row, top, height });
    top += height;
  }
  const height = top;
  const rowTop = new Map(geoms.map((g) => [g.row.id, g.top]));
  const barTop = (b: Pick<TimelineBar, 'rowId' | 'lane'>) =>
    (rowTop.get(b.rowId) ?? AXIS_H) + ROW_PAD + b.lane * lane.pitch + (lane.pitch - lane.bar) / 2;

  const texts = useMemo(() => markTexts(model), [model]);
  const order = useMemo(() => readingOrder(model), [model]);
  const barById = useMemo(() => new Map(model.bars.map((b) => [b.entryId, b])), [model]);

  // Roving tab stop: one bar is tabbable; arrows move focus.
  const [activeId, setActiveId] = useState<string | null>(null);
  const tabStop =
    activeId && barById.has(activeId)
      ? activeId
      : selectedEntryId && barById.has(selectedEntryId)
        ? selectedEntryId
        : (order[0]?.entryId ?? null);
  const barRefs = useRef(new Map<string, SVGGElement>());

  const focusBar = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    barRefs.current.get(id)?.focus();
  };

  const onKeyDown = (bar: TimelineBar, e: KeyboardEvent<SVGGElement>) => {
    const i = order.findIndex((b) => b.entryId === bar.entryId);
    const rowIdx = model.rows.findIndex((r) => r.id === bar.rowId);
    const nearestIn = (ri: number) => {
      const rowId = model.rows[ri]?.id;
      const candidates = order.filter((b) => b.rowId === rowId);
      return candidates.reduce<TimelineBar | undefined>(
        (best, b) =>
          !best || Math.abs(b.busyStart - bar.busyStart) < Math.abs(best.busyStart - bar.busyStart)
            ? b
            : best,
        undefined,
      );
    };
    let handled = true;
    switch (e.key) {
      case 'ArrowRight':
        focusBar(order[i + 1]?.entryId);
        break;
      case 'ArrowLeft':
        focusBar(order[i - 1]?.entryId);
        break;
      case 'ArrowDown':
        focusBar(nearestIn(rowIdx + 1)?.entryId);
        break;
      case 'ArrowUp':
        focusBar(nearestIn(rowIdx - 1)?.entryId);
        break;
      case 'Home':
        focusBar(order[0]?.entryId);
        break;
      case 'End':
        focusBar(order[order.length - 1]?.entryId);
        break;
      case 'Enter':
      case ' ':
        onBarClick?.(bar.entryId, bar);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  const showNow = nowOnAxis(nowMs, axis, model.day, model.timezone);

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        ref={scrollRef}
        role="group"
        aria-label={label}
        aria-describedby={descId}
        className="overflow-x-auto overscroll-x-contain rounded-card border border-line bg-surface"
      >
        <p id={descId} className="sr-only">
          {model.bars.length} {model.bars.length === 1 ? 'entry' : 'entries'} in {model.rows.length}{' '}
          {model.rows.length === 1 ? 'row' : 'rows'}. Arrow keys move between bars; Enter opens the
          entry.
        </p>
        <div className="flex w-max min-w-full">
          {/* Row labels stay put while the plot scrolls sideways. */}
          <div
            ref={labelRef}
            className="sticky left-0 z-10 w-28 shrink-0 border-r border-line bg-surface sm:w-44"
          >
            <div
              style={{ height: AXIS_H }}
              className="flex items-center border-b border-line px-2 text-xs text-ink-2"
            >
              {GROUP_HEADING[model.groupBy]}
            </div>
            {geoms.map((g) => (
              <div
                key={g.row.id}
                style={{ height: g.height }}
                className="flex items-center border-b border-line px-2 last:border-b-0"
              >
                <RowLabel row={g.row} />
              </div>
            ))}
          </div>
          <svg width={plotWidth} height={height} className="block shrink-0 grow select-none">
            <defs>
              <pattern
                id={hatchId}
                patternUnits="userSpaceOnUse"
                width={6}
                height={6}
                patternTransform="rotate(45)"
              >
                <line x1={0} y1={0} x2={0} y2={6} strokeWidth={2.5} className="stroke-danger" />
              </pattern>
            </defs>

            {/* Axis and gridlines */}
            <g aria-hidden>
              <line
                x1={0}
                x2={plotWidth}
                y1={AXIS_H - 0.5}
                y2={AXIS_H - 0.5}
                className="stroke-line"
              />
              {axis.ticks.map((tick) => (
                <g key={tick.t}>
                  <line
                    x1={x(tick.t)}
                    x2={x(tick.t)}
                    y1={tick.hour ? AXIS_H - 6 : AXIS_H}
                    y2={height}
                    strokeWidth={1}
                    strokeDasharray={tick.hour ? undefined : '2 4'}
                    className="stroke-line"
                  />
                  {tick.label && (
                    <text
                      x={x(tick.t)}
                      y={AXIS_H - 11}
                      textAnchor="middle"
                      className="fill-ink-2 text-xs tabular-nums"
                    >
                      {tick.label}
                    </text>
                  )}
                </g>
              ))}
              {geoms.slice(0, -1).map((g) => (
                <line
                  key={g.row.id}
                  x1={0}
                  x2={plotWidth}
                  y1={g.top + g.height - 0.5}
                  y2={g.top + g.height - 0.5}
                  className="stroke-line"
                />
              ))}
            </g>

            {/* Bars */}
            {model.bars.map((bar) => {
              const y = barTop(bar);
              const x0 = x(bar.busyStart);
              const x1 = x(bar.busyEnd);
              const rx0 = x(bar.raceStart);
              const rx1 = x(bar.raceEnd);
              const extra = texts.get(bar.entryId) ?? [];
              const aria = [bar.description, ...extra].join(', ');
              const selected = bar.entryId === selectedEntryId;
              return (
                <g
                  key={bar.entryId}
                  ref={(el) => {
                    if (el) barRefs.current.set(bar.entryId, el);
                    else barRefs.current.delete(bar.entryId);
                  }}
                  role="button"
                  tabIndex={bar.entryId === tabStop ? 0 : -1}
                  aria-label={aria}
                  aria-current={selected ? 'true' : undefined}
                  data-entry-id={bar.entryId}
                  style={teamStyle(bar.teamColor)}
                  className="group cursor-pointer outline-none"
                  onClick={() => {
                    setActiveId(bar.entryId);
                    onBarClick?.(bar.entryId, bar);
                  }}
                  onFocus={() => setActiveId(bar.entryId)}
                  onKeyDown={(e) => onKeyDown(bar, e)}
                >
                  <title>{aria}</title>
                  {/* The whole lane is the hit area. */}
                  <rect
                    x={x0}
                    y={y - (lane.pitch - lane.bar) / 2}
                    width={Math.max(1, x1 - x0)}
                    height={lane.pitch}
                    fill="transparent"
                  />
                  <rect
                    x={x0 + 0.5}
                    y={y + 0.5}
                    width={Math.max(1, x1 - x0 - 1)}
                    height={lane.bar - 1}
                    rx={4}
                    strokeWidth={1}
                    className="fill-team-tint stroke-team group-hover:stroke-ink"
                  />
                  <rect
                    x={rx0}
                    y={y + 0.5}
                    width={Math.max(2, rx1 - rx0)}
                    height={lane.bar - 1}
                    className="fill-team"
                  />
                  {selected && (
                    <rect
                      x={x0 - 2}
                      y={y - 2}
                      width={x1 - x0 + 4}
                      height={lane.bar + 4}
                      rx={6}
                      fill="none"
                      strokeWidth={2}
                      className="stroke-accent"
                    />
                  )}
                  {/* Focus ring: 2 px accent, 2 px offset (§5.6). */}
                  <rect
                    x={x0 - 3}
                    y={y - 3}
                    width={x1 - x0 + 6}
                    height={lane.bar + 6}
                    rx={7}
                    fill="none"
                    strokeWidth={2}
                    className="hidden stroke-accent group-focus-visible:block"
                  />
                </g>
              );
            })}

            {/* Conflicts and hot seats, over the bars */}
            <g aria-hidden className="pointer-events-none">
              {model.marks.map((m) => (
                <Mark
                  key={m.id}
                  mark={m}
                  barById={barById}
                  x={x}
                  barTop={barTop}
                  lane={lane}
                  hatchId={hatchId}
                />
              ))}
            </g>

            {/* Bar labels above the marks, with a halo in the bar's tint so a hatch never
                hides them. Visual only: each bar's accessible name carries the text. */}
            <g aria-hidden className="pointer-events-none">
              {model.bars.map((bar) => {
                const text = fitText(bar.label, x(bar.raceStart) - x(bar.busyStart) - 10);
                if (!text) return null;
                return (
                  <text
                    key={bar.entryId}
                    x={x(bar.busyStart) + 6}
                    y={barTop(bar) + lane.bar / 2}
                    dominantBaseline="central"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    style={teamStyle(bar.teamColor)}
                    className="fill-ink stroke-team-tint text-xs font-medium [paint-order:stroke]"
                  >
                    {text}
                  </text>
                );
              })}
            </g>

            {showNow && (
              <g aria-hidden className="pointer-events-none">
                <line
                  x1={x(nowMs!)}
                  x2={x(nowMs!)}
                  y1={AXIS_H - 6}
                  y2={height}
                  strokeWidth={2}
                  className="stroke-accent"
                />
                <path
                  d={`M ${x(nowMs!) - 5} ${AXIS_H - 8} h 10 l -5 6 Z`}
                  className="fill-accent"
                />
              </g>
            )}
          </svg>
        </div>
      </div>
      {showNow && (
        <p className="sr-only">Now: {clockAt(new Date(nowMs!).toISOString(), model.timezone)}.</p>
      )}
      <Legend />
    </div>
  );
}

function Mark({
  mark,
  barById,
  x,
  barTop,
  lane,
  hatchId,
}: {
  mark: TimelineMark;
  barById: Map<string, TimelineBar>;
  x: (t: number) => number;
  barTop: (b: TimelineBar) => number;
  lane: { pitch: number; bar: number };
  hatchId: string;
}) {
  const a = barById.get(mark.fromEntryId);
  const b = barById.get(mark.toEntryId);
  if (!a || !b) return null;
  const ya = barTop(a);
  const yb = barTop(b);
  if (mark.kind === 'conflict') {
    const y0 = Math.min(ya, yb) - 1;
    const y1 = Math.max(ya, yb) + lane.bar + 1;
    return (
      <g>
        <title>{mark.message}</title>
        <rect
          x={x(mark.start)}
          y={y0}
          width={Math.max(3, x(mark.end) - x(mark.start))}
          height={y1 - y0}
          rx={3}
          fill={`url(#${hatchId})`}
          strokeWidth={1.5}
          className="stroke-danger"
        />
      </g>
    );
  }
  // Hot seat: down (or up) from the earlier bar where its boat lands, along the gutter next to
  // the later bar, to that bar's race start.
  const gap = lane.pitch - lane.bar;
  const x0 = x(mark.start);
  const x1 = x(mark.end);
  const below = yb >= ya;
  const startY = below ? ya + lane.bar : ya;
  const gutterY = below ? yb - gap / 2 : yb + lane.bar + gap / 2;
  const endY = below ? yb : yb + lane.bar;
  const tone = mark.acknowledged ? 'stroke-info' : 'stroke-warn';
  const dot = mark.acknowledged ? 'fill-info' : 'fill-warn';
  return (
    <g>
      <title>{mark.message}</title>
      <path
        d={`M ${x0} ${startY} V ${gutterY} H ${x1} V ${endY}`}
        fill="none"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeDasharray={mark.acknowledged ? '5 3' : undefined}
        className={tone}
      />
      <circle cx={x0} cy={startY} r={3.5} className={dot} />
      <circle cx={x1} cy={endY} r={3.5} className={dot} />
    </g>
  );
}

function Swatch({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden width={28} height={14} viewBox="0 0 28 14" className="shrink-0">
      {children}
    </svg>
  );
}

function Legend() {
  const hatch = useId();
  const id = `legend-${safeId(hatch)}`;
  return (
    <ul
      aria-label="Timeline key"
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-2"
      style={teamStyle('slate')}
    >
      <li className="flex items-center gap-1.5">
        <Swatch>
          <rect
            x={0.5}
            y={2.5}
            width={27}
            height={9}
            rx={3}
            className="fill-team-tint stroke-team"
          />
          <rect x={16} y={3} width={6} height={8} className="fill-team" />
        </Swatch>
        Busy from launch to return, race darker
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch>
          <defs>
            <pattern
              id={id}
              patternUnits="userSpaceOnUse"
              width={5}
              height={5}
              patternTransform="rotate(45)"
            >
              <line x1={0} y1={0} x2={0} y2={5} strokeWidth={2} className="stroke-danger" />
            </pattern>
          </defs>
          <rect
            x={1}
            y={1}
            width={26}
            height={12}
            rx={2}
            fill={`url(#${id})`}
            strokeWidth={1.5}
            className="stroke-danger"
          />
        </Swatch>
        Conflict
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch>
          <path d="M 3 2 V 7 H 25 V 12" fill="none" strokeWidth={2.5} className="stroke-warn" />
        </Swatch>
        Hot seat
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch>
          <path
            d="M 3 2 V 7 H 25 V 12"
            fill="none"
            strokeWidth={2.5}
            strokeDasharray="5 3"
            className="stroke-info"
          />
        </Swatch>
        Hot seat, acknowledged
      </li>
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Mini mode: scales to its container with a viewBox in minutes, so it never scrolls.

function MiniTimeline({ model, nowMs, onBarClick, selectedEntryId, label, className }: ModeProps) {
  const axis = model.axis!;
  const minutes = axisMinutes(axis);
  const geoms: RowGeom[] = [];
  let top = 0;
  for (const row of model.rows) {
    const height = row.lanes * MINI.pitch + MINI.rowPad * 2;
    geoms.push({ row, top, height });
    top += height;
  }
  const height = top;
  const rowTop = new Map(geoms.map((g) => [g.row.id, g.top]));
  const barTop = (b: TimelineBar) =>
    (rowTop.get(b.rowId) ?? 0) + MINI.rowPad + b.lane * MINI.pitch + (MINI.pitch - MINI.bar) / 2;
  const x = (t: number) => timeToX(t, axis, 1);
  const pct = (t: number) => `${(timeToX(t, axis, 1) / minutes) * 100}%`;
  const barById = new Map(model.bars.map((b) => [b.entryId, b]));
  const showNow = nowOnAxis(nowMs, axis, model.day, model.timezone);
  const hours = axis.ticks.filter((t) => t.hour);
  // Every other hour label when the day is long, so labels never collide at narrow widths.
  const step = hours.length > 8 ? 2 : 1;

  // One tab stop for the whole miniature; the arrow keys walk the bars in time order.
  const order = readingOrder(model);
  const [activeId, setActiveId] = useState<string | null>(null);
  const tabStop =
    activeId && barById.has(activeId)
      ? activeId
      : selectedEntryId && barById.has(selectedEntryId)
        ? selectedEntryId
        : (order[0]?.entryId ?? null);
  const barRefs = useRef(new Map<string, SVGGElement>());
  const focusBar = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    barRefs.current.get(id)?.focus();
  };
  const onKeyDown = (bar: TimelineBar, e: KeyboardEvent<SVGGElement>) => {
    const i = order.findIndex((b) => b.entryId === bar.entryId);
    let handled = true;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        focusBar(order[i + 1]?.entryId);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        focusBar(order[i - 1]?.entryId);
        break;
      case 'Home':
        focusBar(order[0]?.entryId);
        break;
      case 'End':
        focusBar(order[order.length - 1]?.entryId);
        break;
      case 'Enter':
      case ' ':
        onBarClick?.(bar.entryId, bar);
        break;
      default:
        handled = false;
    }
    if (handled) e.preventDefault();
  };

  return (
    // The miniature is a glance: on a phone its bars are too thin to tap, and the schedule
    // (linked under it) is the way in, so the touch-target check skips it.
    <div
      role="group"
      aria-label={label}
      data-touch-exempt
      className={cn('flex flex-col gap-1', className)}
    >
      <div aria-hidden className="relative h-4 text-xs text-ink-2 tabular-nums">
        {hours.map((t, i) =>
          i % step === 0 ? (
            <span
              key={t.t}
              style={{ left: pct(t.t) }}
              className={cn(
                'absolute top-0 -translate-x-1/2',
                i === 0 && 'translate-x-0',
                i === hours.length - 1 && '-translate-x-full',
              )}
            >
              {t.label}
            </span>
          ) : null,
        )}
      </div>
      <svg
        viewBox={`0 0 ${minutes} ${height}`}
        preserveAspectRatio="none"
        width="100%"
        height={height}
        className="block overflow-visible"
      >
        <g aria-hidden>
          {hours.map((t) => (
            <line
              key={t.t}
              x1={x(t.t)}
              x2={x(t.t)}
              y1={0}
              y2={height}
              vectorEffect="non-scaling-stroke"
              className="stroke-line"
            />
          ))}
        </g>
        {model.bars.map((bar) => {
          const y = barTop(bar);
          const selected = bar.entryId === selectedEntryId;
          const open = onBarClick;
          return (
            <g
              key={bar.entryId}
              style={teamStyle(bar.teamColor)}
              className={cn('group outline-none', open && 'cursor-pointer')}
              {...(open
                ? {
                    ref: (el: SVGGElement | null) => {
                      if (el) barRefs.current.set(bar.entryId, el);
                      else barRefs.current.delete(bar.entryId);
                    },
                    role: 'button',
                    tabIndex: bar.entryId === tabStop ? 0 : -1,
                    'aria-label': bar.description,
                    onClick: () => {
                      setActiveId(bar.entryId);
                      open(bar.entryId, bar);
                    },
                    onFocus: () => setActiveId(bar.entryId),
                    onKeyDown: (e: KeyboardEvent<SVGGElement>) => onKeyDown(bar, e),
                  }
                : { 'aria-hidden': true })}
            >
              <title>{bar.description}</title>
              <rect
                x={x(bar.busyStart)}
                y={y}
                width={Math.max(1, x(bar.busyEnd) - x(bar.busyStart))}
                height={MINI.bar}
                className="fill-team-tint"
              />
              <rect
                x={x(bar.raceStart)}
                y={y}
                width={Math.max(1, x(bar.raceEnd) - x(bar.raceStart))}
                height={MINI.bar}
                className="fill-team"
              />
              <rect
                x={x(bar.busyStart)}
                y={y - 1}
                width={Math.max(1, x(bar.busyEnd) - x(bar.busyStart))}
                height={MINI.bar + 2}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={2}
                className={cn(
                  'stroke-accent',
                  selected ? 'block' : 'hidden group-focus-visible:block',
                )}
              />
            </g>
          );
        })}
        <g aria-hidden className="pointer-events-none">
          {model.marks.map((m) => {
            const a = barById.get(m.fromEntryId);
            const b = barById.get(m.toEntryId);
            if (!a || !b) return null;
            const ya = barTop(a);
            const yb = barTop(b);
            if (m.kind === 'conflict') {
              return (
                <rect
                  key={m.id}
                  x={x(m.start)}
                  y={Math.min(ya, yb) - 1}
                  width={Math.max(1, x(m.end) - x(m.start))}
                  height={Math.abs(yb - ya) + MINI.bar + 2}
                  className="fill-danger"
                />
              );
            }
            const mid = (Math.min(ya, yb) + Math.max(ya, yb) + MINI.bar) / 2;
            return (
              <path
                key={m.id}
                d={`M ${x(m.start)} ${mid} H ${x(m.end)}`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                strokeWidth={2}
                strokeDasharray={m.acknowledged ? '4 2' : undefined}
                className={m.acknowledged ? 'stroke-info' : 'stroke-warn'}
              />
            );
          })}
          {showNow && (
            <line
              x1={x(nowMs!)}
              x2={x(nowMs!)}
              y1={0}
              y2={height}
              vectorEffect="non-scaling-stroke"
              strokeWidth={2}
              className="stroke-accent"
            />
          )}
        </g>
      </svg>
    </div>
  );
}
