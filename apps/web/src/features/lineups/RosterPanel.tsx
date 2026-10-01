// The roster panel (PLAN.md §4.4, §5.4 Roster row): every available athlete of the team, grouped
// by level, crossed off in the team color once they are in a boat, then a collapsed Borrowed
// group, then the unavailable athletes at the bottom, dimmed. Rows drag onto seats on desktop;
// clicking a row (or Space/Enter) picks the athlete up so the next seat clicked takes them, the
// click equivalent of a drag. Dropping a seat on the panel empties it. Coaches mark an athlete
// unavailable (or available again) for this regatta with the button at the end of the row; days,
// maybes, and reasons live on the team's availability sheet.

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, Search, UserCheck, UserX, X } from 'lucide-react';
import { athleteName, type Athlete } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { TeamChip } from '@/components/chips';
import { Tooltip } from '@/components/ui/menu';
import { prefersReducedMotion } from '@/lib/motion';
import { formatWeekday } from '@/lib/dates';
import { useLineup } from './context';
import {
  EMPTY_FILTERS,
  filtersActive,
  matchesFilters,
  regattaSeasonYear,
  rosterView,
  type RosterAthlete,
  type RosterFilters,
} from './lib';
import { AthleteBadges } from './Seats';
import { useLineupUi } from './store';

export interface RosterDragData {
  kind: 'athlete';
  athleteId: string;
}

/** The strike through a boated name: drawn left to right in 180 ms when it appears. */
function Strike({ on }: { on: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(on);
  useEffect(() => {
    const el = ref.current;
    if (on && !was.current && el && typeof el.animate === 'function' && !prefersReducedMotion()) {
      el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        duration: 180,
        easing: 'ease-out',
      });
    }
    was.current = on;
  }, [on]);
  if (!on) return null;
  return (
    <span
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1/2 h-[2px] origin-left -translate-y-1/2 bg-team"
    />
  );
}

function RosterRow({
  row,
  dragPrefix,
  homeTeam,
}: {
  row: RosterAthlete;
  dragPrefix: string;
  homeTeam?: ReactNode;
}) {
  const { canEdit, isPhone } = useLineup();
  const a = row.athlete;
  const boated = row.entryCount > 0;
  const dnd = canEdit && !isPhone;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${dragPrefix}:${a.id}`,
    data: { kind: 'athlete', athleteId: a.id } satisfies RosterDragData,
    disabled: !dnd,
  });
  const carrying = useLineupUi((s) => s.carrying?.athleteId === a.id && !s.carrying.from);
  const name = athleteName(a);
  const status = boated
    ? `in ${row.entryCount} ${row.entryCount === 1 ? 'entry' : 'entries'}`
    : 'not in a boat';
  const note = row.available
    ? row.comingDays &&
      `${row.comingDays.map((d) => formatWeekday(d).split(',')[0]).join(', ')} only`
    : row.reason;
  const body = (
    <>
      <span className="relative min-w-0 truncate">
        {/* Dimmed with the secondary ink, not opacity, so the name keeps 4.5:1 (PLAN.md §5.6). */}
        <span className={cn((boated || !row.available) && 'text-ink-2')}>{name}</span>
        <Strike on={boated && row.available} />
      </span>
      {note && <span className="min-w-0 shrink truncate text-sm text-ink-2">{note}</span>}
      {homeTeam}
      <span className="ml-auto flex shrink-0 items-center gap-2">
        <AthleteBadges athlete={a} />
        <span
          aria-hidden
          className={cn(
            'w-4 text-right font-display text-sm font-semibold tabular-nums',
            boated || !row.available ? 'text-ink-2' : 'text-ink',
          )}
        >
          {row.entryCount}
        </span>
      </span>
    </>
  );
  const rowClass =
    'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-control px-2 text-left text-base pointer-coarse:min-h-11';
  const spoken = `${name}, ${status}${row.available ? '' : ', unavailable'}${note ? `, ${note}` : ''}`;
  // Borrowed athletes' availability belongs to their home team's coach.
  const toggle = canEdit && !homeTeam && <AvailabilityToggle row={row} />;
  if (!canEdit || isPhone) {
    return (
      <li className="group flex items-center gap-1">
        <div className={rowClass}>
          {body}
          <span className="sr-only">, {spoken}</span>
        </div>
        {toggle}
      </li>
    );
  }
  const pickUp = () => {
    const ui = useLineupUi.getState();
    if (carrying) {
      ui.carry(null);
      ui.announce('Move cancelled.');
      return;
    }
    ui.carry({ athleteId: a.id, from: null });
    ui.announce(
      `Picked up ${name}. Choose a seat and press Enter or Space to put them there, or Escape to cancel.`,
    );
  };
  return (
    <li className="group flex items-center gap-1">
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        onClick={pickUp}
        aria-pressed={carrying}
        aria-label={`${spoken}. Pick up to seat.`}
        title={row.reason ? `${row.available ? '' : 'Unavailable: '}${row.reason}` : undefined}
        className={cn(
          rowClass,
          'cursor-grab touch-manipulation select-none hover:bg-surface-2 active:cursor-grabbing',
          carrying && 'bg-accent-tint',
          isDragging && 'opacity-40',
        )}
      >
        {body}
      </button>
      {toggle}
    </li>
  );
}

/** Mark unavailable for this regatta, or available again: one click, the whole regatta. */
function AvailabilityToggle({ row }: { row: RosterAthlete }) {
  const { actions } = useLineup();
  const name = athleteName(row.athlete);
  const label = row.available ? `Mark ${name} unavailable` : `Mark ${name} available`;
  const tip = row.available
    ? 'Mark unavailable for this regatta'
    : 'Mark available for this regatta';
  const Icon = row.available ? UserX : UserCheck;
  return (
    <Tooltip content={tip} side="left">
      <button
        type="button"
        aria-label={label}
        onClick={() => actions.toggleAvailability(row.athlete.id)}
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:size-11',
          // Quiet until wanted on desktop; always there on touch and for unavailable rows.
          row.available &&
            'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
        )}
      >
        <Icon aria-hidden className="size-4" />
      </button>
    </Tooltip>
  );
}

function Group({
  title,
  count,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  count: number;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = (
    <span className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
      {collapsible && (
        <ChevronRight
          aria-hidden
          className={cn('size-4 transition-transform', open && 'rotate-90')}
        />
      )}
      {title}
      <span className="tabular-nums">{count}</span>
    </span>
  );
  return (
    <section className="flex flex-col gap-0.5">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-8 items-center rounded-control px-1 hover:bg-surface-2 pointer-coarse:h-11"
        >
          {heading}
        </button>
      ) : (
        <h3 className="flex h-8 items-center px-2">{heading}</h3>
      )}
      {open && <ul className="flex flex-col">{children}</ul>}
    </section>
  );
}

function FilterToggle({
  pressed,
  onChange,
  children,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'onChange'> & {
  pressed: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  // Extra props (and the ref) come from a Tooltip trigger wrapping the button.
  return (
    <button
      type="button"
      {...props}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        'inline-flex h-7 items-center rounded-control border px-2 text-sm font-medium pointer-coarse:h-11',
        pressed
          ? 'border-accent bg-accent-tint text-ink'
          : 'border-line-strong/60 text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BoatedCount({ boated, total }: { boated: number; total: number }) {
  return (
    <p className="flex items-baseline gap-1.5 text-sm text-ink-2" aria-live="polite">
      <span className="font-display text-2xl font-semibold text-ink tabular-nums">{boated}</span>
      <span>
        of <span className="font-display font-semibold text-ink tabular-nums">{total}</span> boated
      </span>
    </p>
  );
}

function Filters({
  filters,
  onChange,
}: {
  filters: RosterFilters;
  onChange: (f: RosterFilters) => void;
}) {
  const { index, team } = useLineup();
  const set = (patch: Partial<RosterFilters>) => onChange({ ...filters, ...patch });
  const seasonYear = regattaSeasonYear(index);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-2"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search roster…"
          aria-label="Search roster"
          className="h-9 w-full rounded-control border border-line-strong bg-surface pr-8 pl-8 text-base placeholder:text-ink-2 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
        />
        {filters.query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => set({ query: '' })}
            className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter roster">
        <FilterToggle
          pressed={filters.side === 'port'}
          onChange={(v) => set({ side: v ? 'port' : null })}
        >
          Port
        </FilterToggle>
        <FilterToggle
          pressed={filters.side === 'starboard'}
          onChange={(v) => set({ side: v ? 'starboard' : null })}
        >
          Starboard
        </FilterToggle>
        <FilterToggle pressed={filters.scullers} onChange={(v) => set({ scullers: v })}>
          Scullers
        </FilterToggle>
        <FilterToggle pressed={filters.coxswains} onChange={(v) => set({ coxswains: v })}>
          Coxswains
        </FilterToggle>
        <FilterToggle pressed={filters.unboated} onChange={(v) => set({ unboated: v })}>
          Unboated
        </FilterToggle>
        {team.program === 'juniors' && (
          // Age groups follow the regatta's year: a fall regatta and the next spring's differ.
          <Tooltip content={`U17 and younger: born ${seasonYear - 16} or later`}>
            <FilterToggle pressed={filters.u17} onChange={(v) => set({ u17: v })}>
              U17
            </FilterToggle>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/** Groups and rows; shared by the side column and the phone's collapsible panel. */
function RosterBody({ filters, prefix }: { filters: RosterFilters; prefix: string }) {
  const { index, team } = useLineup();
  const view = rosterView(index, team.id);
  const active = filtersActive(filters);
  const seasonYear = regattaSeasonYear(index);
  const keep = (rows: RosterAthlete[]) =>
    rows.filter((r) => matchesFilters(r, filters, seasonYear));
  const levels = view.levels.map((l) => ({ ...l, athletes: keep(l.athletes) }));
  const unavailable = keep(view.unavailable);
  const borrowed = keep(view.borrowed);
  const shown =
    levels.reduce((n, l) => n + l.athletes.length, 0) + unavailable.length + borrowed.length;
  if (view.total === 0 && view.unavailable.length === 0 && view.borrowed.length === 0) {
    return (
      <p className="px-2 text-base leading-prose text-ink-2">
        No athletes on this team yet. Add them on the team’s roster page.
      </p>
    );
  }
  if (active && shown === 0) {
    return (
      <p className="px-2 text-base leading-prose text-ink-2">No athletes match these filters.</p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {levels.map(
        (l) =>
          l.athletes.length > 0 && (
            <Group key={l.level} title={l.label} count={l.athletes.length}>
              {l.athletes.map((r) => (
                <RosterRow key={r.athlete.id} row={r} dragPrefix={prefix} />
              ))}
            </Group>
          ),
      )}
      {borrowed.length > 0 && (
        <Group title="Borrowed" count={borrowed.length} collapsible defaultOpen={active}>
          {borrowed.map((r) => (
            <RosterRow
              key={r.athlete.id}
              row={r}
              dragPrefix={prefix}
              homeTeam={<HomeTeam athlete={r.athlete} />}
            />
          ))}
        </Group>
      )}
      {unavailable.length > 0 && (
        <Group title="Unavailable" count={unavailable.length} collapsible>
          {unavailable.map((r) => (
            <RosterRow key={r.athlete.id} row={r} dragPrefix={prefix} />
          ))}
        </Group>
      )}
      <SheetLink />
    </div>
  );
}

/** Where the rest of availability lives: per-day choices, maybes, reasons, the whole season. */
function SheetLink() {
  const { team } = useLineup();
  return (
    <p className="px-2 text-sm leading-prose text-ink-2">
      Days, maybes, and reasons are on the{' '}
      <Link
        to={`/teams/${team.id}/availability`}
        className="text-accent underline-offset-4 hover:underline"
      >
        {team.name} availability sheet
      </Link>
      .
    </p>
  );
}

function HomeTeam({ athlete }: { athlete: Athlete }) {
  const { index } = useLineup();
  const t = index.teamById.get(athlete.teamId);
  return t ? <TeamChip team={t} short size="sm" /> : null;
}

function useRosterDrop() {
  const { canEdit, isPhone } = useLineup();
  return useDroppable({ id: 'roster', data: { kind: 'roster' }, disabled: !canEdit || isPhone });
}

/** The sticky left column on wide layouts. */
export function RosterColumn() {
  const { index, team } = useLineup();
  const [filters, setFilters] = useState<RosterFilters>(EMPTY_FILTERS);
  const view = rosterView(index, team.id);
  const { setNodeRef, isOver } = useRosterDrop();
  return (
    <aside
      ref={setNodeRef}
      aria-label="Roster"
      style={teamStyle(team.colorKey)}
      className={cn(
        'sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col gap-3 self-start overflow-hidden rounded-card border bg-surface',
        isOver ? 'border-accent bg-accent-tint' : 'border-line',
      )}
    >
      <div className="flex flex-col gap-3 px-3 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-md font-medium">Roster</h2>
          <BoatedCount boated={view.boated} total={view.total} />
        </div>
        <Filters filters={filters} onChange={setFilters} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        <RosterBody filters={filters} prefix="roster" />
      </div>
      {isOver && (
        <p className="border-t border-line px-3 py-2 text-sm text-ink">Drop to clear the seat</p>
      )}
    </aside>
  );
}

/** The collapsible panel above the entries on narrow layouts and phones. */
export function RosterDrawer() {
  const { index, team, canEdit, isPhone } = useLineup();
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<RosterFilters>(EMPTY_FILTERS);
  const view = rosterView(index, team.id);
  const { setNodeRef, isOver } = useRosterDrop();
  const unboated = view.levels.flatMap((l) => l.athletes).filter((r) => r.entryCount === 0);
  return (
    <section
      ref={setNodeRef}
      aria-label="Roster"
      style={teamStyle(team.colorKey)}
      className={cn(
        'z-20 flex flex-col gap-3 rounded-card border bg-surface p-3',
        !isPhone && 'sticky top-2',
        isOver ? 'border-accent bg-accent-tint' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-md font-medium">Roster</h2>
          <BoatedCount boated={view.boated} total={view.total} />
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-sm font-medium text-accent hover:bg-surface-2 pointer-coarse:h-11"
        >
          {open ? 'Hide roster' : 'Show roster'}
          <ChevronRight
            aria-hidden
            className={cn('size-4 transition-transform', open && 'rotate-90')}
          />
        </button>
      </div>
      {!open && unboated.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-ink-2">Not in a boat yet</p>
          <ul className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
            {unboated.map((r) => (
              <UnboatedChip key={r.athlete.id} row={r} draggable={canEdit && !isPhone} />
            ))}
          </ul>
        </div>
      )}
      {open && (
        <>
          <Filters filters={filters} onChange={setFilters} />
          <div className="max-h-[45dvh] overflow-y-auto">
            <RosterBody filters={filters} prefix="drawer" />
          </div>
        </>
      )}
    </section>
  );
}

function UnboatedChip({ row, draggable }: { row: RosterAthlete; draggable: boolean }) {
  const a = row.athlete;
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `chip:${a.id}`,
    data: { kind: 'athlete', athleteId: a.id } satisfies RosterDragData,
    disabled: !draggable,
  });
  const carrying = useLineupUi((s) => s.carrying?.athleteId === a.id && !s.carrying.from);
  const name = athleteName(a);
  const cls =
    'inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-surface px-2 text-sm pointer-coarse:h-11';
  if (!draggable) {
    return (
      <li className={cls}>
        {name}
        <AthleteBadges athlete={a} />
      </li>
    );
  }
  return (
    <li>
      <button
        ref={setNodeRef}
        type="button"
        {...listeners}
        aria-pressed={carrying}
        aria-label={`${name}, not in a boat. Pick up to seat.`}
        onClick={() => {
          const ui = useLineupUi.getState();
          if (carrying) ui.carry(null);
          else {
            ui.carry({ athleteId: a.id, from: null });
            ui.announce(
              `Picked up ${name}. Choose a seat and press Enter or Space to put them there.`,
            );
          }
        }}
        className={cn(
          cls,
          'cursor-grab touch-manipulation select-none hover:bg-surface-2',
          carrying && 'border-accent bg-accent-tint',
          isDragging && 'opacity-40',
        )}
      >
        {name}
        <AthleteBadges athlete={a} />
      </button>
    </li>
  );
}
