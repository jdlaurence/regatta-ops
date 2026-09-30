// One entry: label, status, shell and oars, conflict badges, the ⋯ menu, the boat strip (or
// seat rows on a phone), and a line of facts. Clicking the card selects it; the label opens
// the entry's details in the inspector.

import type { MouseEvent } from 'react';
import {
  ArrowRightLeft,
  Check,
  Copy,
  Ellipsis,
  Eraser,
  PanelRight,
  RefreshCcw,
  Trash2,
} from 'lucide-react';
import {
  entryStats,
  formatWeight,
  isHotSeat,
  type Entry,
  type EntryStatus,
  type Finding,
} from '@srt/domain';
import { cn } from '@/lib/cn';
import { worstSeverity } from '@/data';
import { ClassBadge } from '@/components/chips';
import { ConflictBadges, ConflictIcon } from '@/components/ConflictBadge';
import { useInspector } from '@/components/Inspector';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { useLineup } from './context';
import { OarPicker, ShellPicker } from './EquipmentPickers';
import { rerigNote, seatConflicts, stripFits } from './lib';
import { EntrySeatList, EntryStrip } from './Seats';
import { useLineupUi } from './store';

export const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  confirmed: 'Confirmed',
  scratched: 'Scratched',
};

export function StatusText({ status }: { status: EntryStatus }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-sm',
        status === 'confirmed' ? 'font-medium text-ok' : 'text-ink-2',
        status === 'scratched' && 'font-medium text-danger',
      )}
    >
      {status === 'confirmed' && <Check aria-hidden className="size-3.5" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

/** The plan text of an acknowledged hot seat involving this entry (stored on the later entry). */
export function hotSeatPlans(findings: Finding[], entryById: Map<string, Entry>): string[] {
  const plans = new Set<string>();
  for (const f of findings) {
    if (!isHotSeat(f) || !f.acknowledged) continue;
    const later = entryById.get(f.entryIds[1] ?? '');
    if (later?.hotSeatPlan?.trim()) plans.add(later.hotSeatPlan.trim());
  }
  return [...plans];
}

function EntryMenu({ entry }: { entry: Entry }) {
  const { actions, canEdit } = useLineup();
  const ui = useLineupUi.getState;
  const { setOpen } = useInspector();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${entry.label}`}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            ui().select(entry.id);
            setOpen(true);
          }}
        >
          <PanelRight aria-hidden />
          Entry details
        </DropdownMenuItem>
        {canEdit && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={entry.status}
              onValueChange={(v) => actions.setStatus(entry, v as EntryStatus)}
            >
              {(Object.keys(STATUS_LABELS) as EntryStatus[]).map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => ui().openDialog({ kind: 'duplicate', entryId: entry.id })}
            >
              <Copy aria-hidden />
              Copy to another event…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ui().openDialog({ kind: 'move', entryId: entry.id })}>
              <ArrowRightLeft aria-hidden />
              Move to another event…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.clearAll(entry.id)}>
              <Eraser aria-hidden />
              Clear seats
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-danger [&_svg]:text-danger"
              onSelect={() => ui().openDialog({ kind: 'delete', entryId: entry.id })}
            >
              <Trash2 aria-hidden />
              Delete entry…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Facts({ entry, findings }: { entry: Entry; findings: Finding[] }) {
  const { index, ws, weightUnit, seasonYear, team } = useLineup();
  const seats = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])];
  const stats = entryStats(entry, seats, ws.athletes, seasonYear);
  const shell = entry.shellId ? index.shellById.get(entry.shellId) : null;
  const rerig = rerigNote(shell, entry.boatClass);
  const plans = hotSeatPlans(findings, index.entryById);
  const parts: string[] = [];
  if (stats.avgWeightKg != null) parts.push(`avg ${formatWeight(stats.avgWeightKg, weightUnit)}`);
  if (team.program === 'masters' && stats.avgAge != null) {
    parts.push(
      `avg age ${Math.floor(stats.avgAge)}${stats.mastersCategory ? ` (${stats.mastersCategory})` : ''}`,
    );
  } else if (stats.ageGroup && stats.ageGroup !== 'open') parts.push(stats.ageGroup);
  const notes = entry.notes?.trim();
  if (parts.length === 0 && !rerig && plans.length === 0 && !notes) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
      {parts.length > 0 && <span className="tabular-nums">{parts.join(' · ')}</span>}
      {rerig && (
        <span className="inline-flex items-center gap-1">
          <RefreshCcw aria-hidden className="size-3.5" />
          {rerig}
        </span>
      )}
      {plans.map((p) => (
        <span key={p} className="inline-flex min-w-0 items-center gap-1 text-ink">
          <ConflictIcon severity="info" className="size-3.5" />
          <span className="sr-only">Hot seat plan: </span>
          <span className="min-w-0 truncate">{p}</span>
        </span>
      ))}
      {notes && <span className="min-w-0 max-w-full truncate">Notes: {notes}</span>}
    </div>
  );
}

export function EntryCard({ entry, showClass }: { entry: Entry; showClass?: boolean }) {
  const { index, findingsByEntry, entriesWidth } = useLineup();
  const asList = !stripFits(entry.boatClass, entriesWidth);
  const selected = useLineupUi((s) => s.selectedEntryId === entry.id);
  const flashing = useLineupUi((s) => s.flashEntryId === entry.id);
  const { setOpen } = useInspector();
  const findings = findingsByEntry.get(entry.id) ?? [];
  const conflicts = seatConflicts(findings, index, entry.id);
  const worst = worstSeverity(findings);
  const scratched = entry.status === 'scratched';

  const onCardClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, [role="option"], [role="menuitem"]')) return;
    useLineupUi.getState().select(entry.id);
  };

  return (
    <article
      data-lineup-entry={entry.id}
      aria-label={`${entry.label}${scratched ? ', scratched' : ''}`}
      onClick={onCardClick}
      data-flash={flashing || undefined}
      className={cn(
        '@container flex scroll-mt-24 flex-col gap-3 rounded-card border bg-surface p-3 transition-shadow duration-300',
        selected ? 'border-accent' : 'border-line',
        flashing && 'ring-4 ring-accent/35',
      )}
    >
      {/* Narrow cards put the pickers on a second line, under label, status, and badges. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={() => {
            useLineupUi.getState().select(entry.id);
            setOpen(true);
          }}
          className={cn(
            'min-w-0 truncate text-md font-medium text-ink hover:underline',
            scratched && 'line-through',
          )}
          aria-label={`${entry.label}, show entry details`}
        >
          {entry.label || entry.boatClass}
        </button>
        {showClass && <ClassBadge boatClass={entry.boatClass} />}
        <StatusText status={entry.status} />
        <div className="order-last flex w-full min-w-0 flex-wrap items-center gap-1 @[36rem]:order-none @[36rem]:w-auto">
          <ShellPicker entry={entry} />
          <OarPicker entry={entry} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <ConflictBadges findings={findings} />
          <EntryMenu entry={entry} />
        </div>
      </div>
      <div className={cn(scratched && 'opacity-60')}>
        {asList ? (
          <EntrySeatList entry={entry} seatConflicts={conflicts} />
        ) : (
          <EntryStrip
            entry={entry}
            seatConflicts={conflicts}
            conflict={worst === 'info' ? null : worst}
          />
        )}
      </div>
      <Facts entry={entry} findings={findings} />
    </article>
  );
}
