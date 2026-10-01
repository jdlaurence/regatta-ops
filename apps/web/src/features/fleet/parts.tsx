// Small pieces shared by the three fleet tabs: equipment status with an icon, inline cell
// editors, filter selects, the upcoming-use list, and a delete confirmation.

import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  Archive,
  ArrowRight,
  Ban,
  CircleCheck,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from 'lucide-react';
import type { EquipmentStatus, Team } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { formatDayRange, formatWeekday } from '@/lib/dates';
import { TeamChip } from '@/components/chips';
import { ErrorState, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';
import { EQUIPMENT_STATUSES, eventText, STATUS_LABELS } from './lib';
import type { UsageResult } from './hooks';

// Status ----------------------------------------------------------------------

const STATUS_ICON: Record<EquipmentStatus, { icon: typeof Ban; tone: string }> = {
  in_service: { icon: CircleCheck, tone: 'text-ok' },
  limited: { icon: TriangleAlert, tone: 'text-warn' },
  out_of_service: { icon: Ban, tone: 'text-danger' },
  retired: { icon: Archive, tone: 'text-ink-2' },
};

/** Icon and words, never color alone (PLAN.md §5.4). */
export function StatusLabel({
  status,
  className,
}: {
  status: EquipmentStatus;
  className?: string;
}) {
  const { icon: Icon, tone } = STATUS_ICON[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <Icon className={cn('size-4 shrink-0', tone)} aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

export const STATUS_OPTIONS: SelectOption<EquipmentStatus>[] = EQUIPMENT_STATUSES.map((s) => ({
  value: s,
  label: <StatusLabel status={s} />,
}));

// Inline editors ------------------------------------------------------------------

/** Quiet select for a table cell: reads as text until hovered or focused. */
export function InlineSelect<V extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  /** Accessible name: "Status of Monahan". */
  label: string;
  className?: string;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Select
        value={value}
        options={options}
        onValueChange={(v) => v !== value && onChange(v)}
        label={label}
        className={cn(
          '-ml-2 h-8 border-transparent bg-transparent px-2 hover:border-line-strong hover:bg-surface pointer-coarse:h-11',
          className,
        )}
      />
    </div>
  );
}

/** Quiet text input for a table cell. Saves on Enter or blur; Escape puts the old value back. */
export function InlineText({
  value,
  onCommit,
  label,
  listId,
  className,
  type = 'text',
  inputMode,
}: {
  value: string;
  onCommit: (value: string) => void;
  label: string;
  /** A <datalist> id for suggestions (boathouse locations). */
  listId?: string;
  className?: string;
  type?: 'text' | 'number';
  inputMode?: 'numeric' | 'text';
}) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  // Follow the record when someone else changes it and this cell is not being edited.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!editing) setDraft(value);
  }
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      type={type}
      inputMode={inputMode}
      list={listId}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className={cn(
        '-ml-2 h-8 w-full min-w-0 rounded-control border border-transparent bg-transparent px-2 text-base text-ink placeholder:text-ink-2 hover:border-line-strong hover:bg-surface focus:border-line-strong focus:bg-surface pointer-coarse:h-11',
        className,
      )}
    />
  );
}

// Filters ---------------------------------------------------------------------

/** A labelled filter select whose first option is "All …" (value 'all'). */
export function FilterSelect<V extends string>({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  label: string;
  value: V | 'all';
  onChange: (value: V | 'all') => void;
  options: SelectOption<V>[];
  allLabel: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id} className="text-sm font-normal text-ink-2">
        {label}
      </Label>
      <Select<V | 'all'>
        id={id}
        value={value}
        onValueChange={onChange}
        options={[{ value: 'all', label: allLabel }, ...options]}
        className={cn('w-full', value !== 'all' && 'border-accent')}
      />
    </div>
  );
}

// Upcoming use ------------------------------------------------------------------

function lineupPath(regattaId: string, teamId: string, entryId: string) {
  return `/regattas/${regattaId}/lineups/${teamId}?entry=${entryId}`;
}

/** Entries across upcoming regattas that use this shell or oar set (§4.5). */
export function UpcomingUse({
  usage,
  teamsById,
  noun,
}: {
  usage: UsageResult;
  teamsById: Map<string, Team>;
  /** "shell" or "oar set", for the empty state. */
  noun: string;
}) {
  if (usage.isError) {
    return (
      <ErrorState title="Upcoming use did not load." error={usage.error} onRetry={usage.refetch} />
    );
  }
  if (usage.isPending) return <SkeletonRows rows={2} />;
  if (usage.groups.length === 0) {
    return (
      <p className="text-base leading-prose text-ink-2">
        No upcoming regatta uses this {noun}. Pick it for an entry on a team&apos;s lineups page and
        it shows here.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {usage.groups.map(({ regatta, rows }) => {
        const multiDay = regatta.endDate && regatta.endDate !== regatta.startDate;
        return (
          <section key={regatta.id} className="flex flex-col gap-1.5">
            <h4 className="flex flex-wrap items-baseline gap-x-2 text-base font-medium">
              <Link
                to={`/regattas/${regatta.id}`}
                className="text-ink underline-offset-4 hover:underline"
              >
                {regatta.name}
              </Link>
              <span className="text-sm font-normal text-ink-2">
                {formatDayRange(regatta.startDate, regatta.endDate)}
              </span>
            </h4>
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
              {rows.map(({ entry, event, day, time }) => {
                const team = teamsById.get(entry.teamId);
                return (
                  <li key={entry.id} className="flex items-start gap-3 px-3 py-2">
                    <span className="w-16 shrink-0 pt-0.5 text-sm text-ink-2 tabular-nums">
                      {multiDay && <span className="block">{formatWeekday(day)}</span>}
                      {time ?? (event ? 'TBD' : '—')}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-base">{eventText(event)}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        {team && <TeamChip team={team} short size="sm" />}
                        <span className="text-sm text-ink-2">{entry.label}</span>
                      </span>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="shrink-0">
                      <Link
                        to={lineupPath(regatta.id, entry.teamId, entry.id)}
                        aria-label={`Open ${team?.name ?? ''} lineups for ${entry.label}`.replace(
                          /\s+/g,
                          ' ',
                        )}
                      >
                        Lineup
                        <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Confirm ---------------------------------------------------------------------

/** A destructive confirmation: says what happens, one danger button. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Toolbar -----------------------------------------------------------------------

/** Search box for a fleet table. */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** "Search shells" */
  label: string;
  placeholder: string;
}) {
  return (
    <div className="relative w-full md:w-72">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-2"
        aria-hidden
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

/**
 * Filter selects: in a wrapping row from 768 px up; behind a "Filters" button on phones so the
 * list stays in view.
 */
export function FilterPanel({
  wide,
  activeCount,
  onClear,
  children,
}: {
  wide: boolean;
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const clear =
    activeCount > 0 ? (
      <Button variant="ghost" size="sm" onClick={onClear} className="self-end">
        <X aria-hidden />
        Clear filters
      </Button>
    ) : null;
  if (wide) {
    return (
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 [&>div]:w-36">
        {children}
        {clear}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal aria-hidden />
          {activeCount > 0 ? `Filters (${activeCount})` : 'Filters'}
        </Button>
        {clear}
      </div>
      {open && <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>}
    </div>
  );
}
