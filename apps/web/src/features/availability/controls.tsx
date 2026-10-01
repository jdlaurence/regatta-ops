// The detailed availability controls for one athlete at one regatta: status (available, maybe,
// unavailable), per-day toggles for a multi-day regatta, and a reason. The athlete's season
// sheet stacks one set per regatta.

import { useState } from 'react';
import { X } from 'lucide-react';
import type { AvailabilityStatus } from '@srt/domain';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';
import { SegmentedControl } from '@/components/ui/controls';
import { Input } from '@/components/ui/input';
import { statusOn, toggleDay, withStatus, type AvailabilityDraft } from './availability-model';

export const STATUS_OPTIONS: { value: AvailabilityStatus; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'unavailable', label: 'Unavailable' },
];

export const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: 'Available',
  maybe: 'Maybe',
  unavailable: 'Unavailable',
};

/** "Sat" for a regatta day. */
export function shortWeekday(day: string): string {
  return formatWeekday(day).split(',')[0]!;
}

function ReasonInput({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (reason: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [base, setBase] = useState(value);
  // Follow changes made elsewhere (another coach, a bulk action) while not being edited.
  if (value !== base) {
    setBase(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft.trim() !== value.trim()) onSave(draft.trim());
  };
  return (
    <Input
      value={draft}
      placeholder="Reason (optional)"
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          setDraft(value);
        }
      }}
      className="h-8 text-sm pointer-coarse:h-11"
    />
  );
}

function DayToggles({
  label,
  draft,
  days,
  canEdit,
  onToggle,
}: {
  label: string;
  draft: AvailabilityDraft;
  days: readonly string[];
  canEdit: boolean;
  onToggle: (day: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
      {days.map((day) => {
        const s = statusOn(draft, day);
        const off = s === 'unavailable';
        const text = `${formatWeekday(day)}: ${STATUS_TEXT[s].toLowerCase()}`;
        return (
          <button
            key={day}
            type="button"
            disabled={!canEdit}
            aria-pressed={!off}
            aria-label={text}
            title={text}
            onClick={() => onToggle(day)}
            className={cn(
              'inline-flex h-8 min-w-11 items-center justify-center gap-1 rounded-control border px-1.5 text-sm font-medium tabular-nums disabled:cursor-default pointer-coarse:h-11',
              off
                ? 'border-danger/50 bg-danger-tint text-danger line-through'
                : s === 'maybe'
                  ? 'border-warn/50 bg-warn-tint text-warn'
                  : 'border-line-strong bg-surface text-ink hover:bg-surface-2',
            )}
          >
            {off && <X aria-hidden className="size-3.5" />}
            {shortWeekday(day)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Status, days, and reason for one athlete at one regatta. `subject` names them both for
 * screen readers ("Ava Chen at Head of the Lake").
 */
export function AvailabilityControls({
  subject,
  draft,
  days,
  canEdit,
  onChange,
}: {
  subject: string;
  draft: AvailabilityDraft;
  days: readonly string[];
  canEdit: boolean;
  onChange: (next: AvailabilityDraft) => void;
}) {
  const showReason =
    !!draft.reason || draft.status !== 'available' || Object.keys(draft.days).length > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <SegmentedControl
            size="sm"
            label={`Availability for ${subject}`}
            value={draft.status}
            onValueChange={(status) => onChange(withStatus(draft, status, days))}
            options={STATUS_OPTIONS}
          />
        ) : (
          <span className={cn('text-base', draft.status === 'unavailable' && 'text-danger')}>
            {STATUS_TEXT[draft.status]}
          </span>
        )}
        {days.length > 1 && (
          <DayToggles
            label={`Days for ${subject}`}
            draft={draft}
            days={days}
            canEdit={canEdit}
            onToggle={(day) => onChange(toggleDay(draft, day, days))}
          />
        )}
      </div>
      {showReason &&
        (canEdit ? (
          <ReasonInput
            label={`Reason for ${subject}`}
            value={draft.reason}
            onSave={(reason) => onChange({ ...draft, reason })}
          />
        ) : (
          draft.reason && <p className="text-sm text-ink-2">{draft.reason}</p>
        ))}
    </div>
  );
}
