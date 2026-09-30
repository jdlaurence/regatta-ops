// One line of the phone load checklist (PLAN.md §4.8, §6.7): the item, where it rides, and two
// big boxes, Loaded and Returned, each saying who ticked it and when.

import { useId } from 'react';
import { Check, CloudUpload } from 'lucide-react';
import type { ShareLoadItem } from '@/data';
import { cn } from '@/lib/cn';
import type { TickField } from './offline-queue';
import { shortInstant } from './share-view';

export interface ChecklistRowProps {
  line: ShareLoadItem & { pending?: TickField[] };
  /** The second line: where it rides ("Truck 1 bed"), or its kind when grouped by container. */
  detail?: string;
  /** The regatta's time zone, for "4:10 PM". */
  timeZone: string;
  onTick: (field: TickField, value: boolean) => void;
  disabled?: boolean;
  /** Clock for "today" (tests). */
  now?: Date;
  className?: string;
}

const FIELD_LABELS: Record<TickField, string> = { loaded: 'Loaded', returned: 'Returned' };

function TickBox({
  field,
  line,
  timeZone,
  onTick,
  disabled,
  now,
}: Pick<ChecklistRowProps, 'line' | 'timeZone' | 'onTick' | 'disabled' | 'now'> & {
  field: TickField;
}) {
  const metaId = useId();
  const checked = field === 'loaded' ? line.loaded : line.returned;
  const at = field === 'loaded' ? line.loadedAt : line.returnedAt;
  const by = field === 'loaded' ? line.loadedBy : line.returnedBy;
  // The load list belongs to one regatta: the year only adds length.
  const when = at ? shortInstant(at, timeZone, now, { year: false }) : '';
  const meta = checked ? [by, when].filter(Boolean).join(' · ') : 'Not yet';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${FIELD_LABELS[field]}: ${line.label}`}
      aria-describedby={metaId}
      disabled={disabled}
      onClick={() => onTick(field, !checked)}
      className={cn(
        'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control border px-3 py-1.5 text-left transition-colors disabled:opacity-50 pointer-coarse:min-h-14',
        checked
          ? 'border-accent bg-accent-tint'
          : 'border-line-strong bg-surface hover:bg-surface-2',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-control border-2',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
        )}
      >
        {checked && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-base font-medium text-ink">{FIELD_LABELS[field]}</span>
        <span id={metaId} className="text-sm break-words text-ink-2 tabular-nums">
          {meta}
        </span>
      </span>
    </button>
  );
}

export function ChecklistRow({
  line,
  detail,
  timeZone,
  onTick,
  disabled,
  now,
  className,
}: ChecklistRowProps) {
  const waiting = (line.pending?.length ?? 0) > 0;
  return (
    <li
      className={cn(
        'flex flex-col gap-2.5 rounded-card border border-line bg-surface p-3',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-md font-medium break-words text-ink">{line.label}</span>
          {detail && <span className="text-sm text-ink-2">{detail}</span>}
        </div>
        {line.quantity > 1 && (
          <span className="shrink-0 font-display text-md font-semibold text-ink-2 tabular-nums">
            <span aria-hidden>× {line.quantity}</span>
            <span className="sr-only">Quantity {line.quantity}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['loaded', 'returned'] as const).map((field) => (
          <TickBox
            key={field}
            field={field}
            line={line}
            timeZone={timeZone}
            onTick={onTick}
            disabled={disabled}
            now={now}
          />
        ))}
      </div>
      {waiting && (
        <span className="flex items-center gap-1.5 text-sm text-ink-2">
          <CloudUpload className="size-4 shrink-0" aria-hidden />
          Waiting to sync
        </span>
      )}
    </li>
  );
}
