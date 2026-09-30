// One entry as a card in the builder's grid: label and the ⋯ menu, status and conflict badges,
// the shell and oars, then the boat stood on end (cox on top, stroke down to bow), and a line of
// facts. Everything above the boat has a fixed height, so boats side by side start level and
// their seat rows line up. Clicking the card selects it; the label opens the entry's details in
// the inspector.

import { useRef, type MouseEvent } from 'react';
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
import { entryStats, type Entry, type EntryStatus, type Finding } from '@srt/domain';
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
import { hotSeatPlans, rerigNote, seatConflicts } from './lib';
import { EntryStrip } from './Seats';
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

function EntryMenu({ entry }: { entry: Entry }) {
  const { actions, canEdit } = useLineup();
  const ui = useLineupUi.getState;
  const { openAndFocus } = useInspector();
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="icon-sm" aria-label={`More for ${entry.label}`}>
          <Ellipsis aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => {
            ui().select(entry.id);
            openAndFocus(trigger.current);
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
  const { index, ws, seasonYear, team } = useLineup();
  const seats = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])];
  const stats = entryStats(entry, seats, ws.athletes, seasonYear);
  const shell = entry.shellId ? index.shellById.get(entry.shellId) : null;
  const rerig = rerigNote(shell, entry.boatClass);
  const plans = hotSeatPlans(findings, index.entryById);
  const parts: string[] = [];
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
  const { index, findingsByEntry, isPhone } = useLineup();
  const selected = useLineupUi((s) => s.selectedEntryId === entry.id);
  const flashing = useLineupUi((s) => s.flashEntryId === entry.id);
  const { openAndFocus } = useInspector();
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
        'flex min-w-0 scroll-mt-24 flex-col rounded-card border bg-surface p-3 transition-shadow duration-300',
        selected ? 'border-accent' : 'border-line',
        flashing && 'ring-4 ring-accent/35',
      )}
    >
      <div className="flex h-8 min-w-0 items-center gap-2 pointer-coarse:h-11">
        <button
          type="button"
          onClick={(e) => {
            useLineupUi.getState().select(entry.id);
            // Keyboard users land in the details and come back here with Escape.
            openAndFocus(e.currentTarget);
          }}
          className={cn(
            'min-w-0 truncate text-left text-md font-medium text-ink hover:underline pointer-coarse:min-h-11 pointer-coarse:min-w-11',
            scratched && 'line-through',
          )}
          aria-label={`${entry.label}, show entry details`}
        >
          {entry.label || entry.boatClass}
        </button>
        {showClass && <ClassBadge boatClass={entry.boatClass} />}
        <div className="-mr-1 ml-auto shrink-0">
          <EntryMenu entry={entry} />
        </div>
      </div>
      <div className="flex h-6 min-w-0 items-center gap-2">
        <StatusText status={entry.status} />
        <ConflictBadges findings={findings} className="ml-auto flex-nowrap" />
      </div>
      {/* Shell above oars, one per line whatever their names, so boats side by side stay level.
          A phone shows one card per row and lets them share a line. */}
      <div className={cn('mt-1.5 flex min-w-0', isPhone ? 'flex-wrap gap-x-2' : 'flex-col')}>
        <div className="flex h-8 min-w-0 items-center pointer-coarse:h-11">
          <ShellPicker entry={entry} />
        </div>
        <div className="flex h-8 min-w-0 items-center pointer-coarse:h-11">
          <OarPicker entry={entry} />
        </div>
      </div>
      {/* Scratched boats lose their color, not their contrast. */}
      <div className={cn('mt-2.5', scratched && 'grayscale')}>
        <EntryStrip
          entry={entry}
          seatConflicts={conflicts}
          conflict={worst === 'info' ? null : worst}
        />
      </div>
      <div className="mt-2 empty:hidden">
        <Facts entry={entry} findings={findings} />
      </div>
    </article>
  );
}
