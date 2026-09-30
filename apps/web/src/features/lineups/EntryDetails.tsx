// Entry details in the inspector (PLAN.md §4.4 Entry details): label, status, coach, notes,
// shell and oars, the re-rig flag, computed facts, and the entry's findings with hot-seat
// acknowledgment. Text fields save when they lose focus (or on Enter for the label).

import { useId, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Copy, RefreshCcw, Trash2 } from 'lucide-react';
import {
  entryStats,
  isHotSeat,
  isSculling,
  type Entry,
  type EntryStatus,
  type Finding,
} from '@srt/domain';
import { relativeTime } from '@/lib/relative-time';
import { CommentsThread } from '@/components/CommentsThread';
import { ConflictIcon } from '@/components/ConflictBadge';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useLineup } from './context';
import { OarPicker, ShellPicker } from './EquipmentPickers';
import { STATUS_LABELS } from './EntryCard';
import { autoLabel, eventTitleText, rerigNote } from './lib';
import { useLineupUi } from './store';

const NO_COACH = '__none';

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-ink-2">{term}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function LabelField({ entry }: { entry: Entry }) {
  const { actions, canEdit, index, team } = useLineup();
  const id = useId();
  const [value, setValue] = useState(entry.label);
  const event = entry.eventId ? (index.eventById.get(entry.eventId) ?? null) : null;
  const siblings = index.data.entries
    .filter(
      (e) =>
        e.teamId === entry.teamId &&
        (e.eventId ?? null) === (entry.eventId ?? null) &&
        e.id !== entry.id,
    )
    .map((e) => e.label);
  const auto = autoLabel(event, entry.boatClass, siblings, team.program);
  const save = () => {
    const next = value.trim() || auto;
    if (next !== entry.label) actions.updateEntry(entry.id, { label: next });
    setValue(next);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Label</Label>
      <Input
        id={id}
        value={value}
        disabled={!canEdit}
        placeholder={auto}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setValue(entry.label);
        }}
      />
      {canEdit && value.trim() !== auto && (
        <button
          type="button"
          className="self-start text-sm text-accent hover:underline"
          onClick={() => {
            setValue(auto);
            actions.updateEntry(entry.id, { label: auto });
          }}
        >
          Use {auto}
        </button>
      )}
    </div>
  );
}

function NotesField({ entry }: { entry: Entry }) {
  const { actions, canEdit } = useLineup();
  const id = useId();
  const [value, setValue] = useState(entry.notes ?? '');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Notes</Label>
      <Textarea
        id={id}
        value={value}
        disabled={!canEdit}
        placeholder="Bow loader, rigging changes, who brings the cox box"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value !== (entry.notes ?? '')) actions.updateEntry(entry.id, { notes: value });
        }}
      />
    </div>
  );
}

function FindingsList({ findings }: { findings: Finding[] }) {
  const { canEdit, index } = useLineup();
  if (findings.length === 0) {
    return <p className="text-base leading-prose text-ink-2">No conflicts for this entry.</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {findings.map((f) => {
        const hot = isHotSeat(f);
        const later = hot ? index.entryById.get(f.entryIds[1] ?? '') : undefined;
        return (
          <li
            key={f.id}
            className="flex flex-col gap-2 rounded-control border border-line px-2.5 py-2 text-base leading-prose"
          >
            <div className="flex gap-2">
              <ConflictIcon severity={f.severity} className="mt-0.5" />
              <span className="min-w-0">{f.message}</span>
            </div>
            {hot && f.acknowledged && (
              <p className="flex flex-col gap-0.5 pl-6 text-sm">
                <span className="font-medium text-info">Hot seat acknowledged</span>
                {later?.hotSeatPlan?.trim() && <span>{later.hotSeatPlan.trim()}</span>}
              </p>
            )}
            {hot && !f.acknowledged && canEdit && (
              <Button
                size="sm"
                className="ml-6 self-start"
                onClick={() =>
                  useLineupUi.getState().openDialog({ kind: 'hot-seat', findingId: f.id })
                }
              >
                Acknowledge hot seat
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** What a viewer sees: the same facts as text, nothing that looks editable. */
function ReadOnlySummary({ entry, rerig }: { entry: Entry; rerig: string | null }) {
  const { ws } = useLineup();
  const coach = entry.coachId ? ws.users.find((u) => u.id === entry.coachId) : null;
  return (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-line text-base">
        <Fact term="Status">{STATUS_LABELS[entry.status]}</Fact>
        <Fact term="Coach">{coach?.name ?? '—'}</Fact>
      </dl>
      <div className="flex flex-wrap items-center gap-1">
        <ShellPicker entry={entry} />
        <OarPicker entry={entry} />
      </div>
      {rerig && (
        <p className="inline-flex items-center gap-1.5 text-sm">
          <RefreshCcw aria-hidden className="size-3.5 text-ink-2" />
          {rerig}
        </p>
      )}
      {entry.notes?.trim() && (
        <p className="text-base leading-prose whitespace-pre-line">{entry.notes.trim()}</p>
      )}
    </div>
  );
}

export function EntryDetails({ entry }: { entry: Entry }) {
  const { index, ws, canEdit, actions, findingsByEntry, seasonYear, team } = useLineup();
  const statusId = useId();
  const coachId = useId();
  const findings = findingsByEntry.get(entry.id) ?? [];
  const event = entry.eventId ? index.eventById.get(entry.eventId) : null;
  const shell = entry.shellId ? index.shellById.get(entry.shellId) : null;
  const seats = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])];
  const stats = entryStats(entry, seats, ws.athletes, seasonYear);
  const rerig = rerigNote(shell, entry.boatClass);
  const either = seats.filter(
    (s) => s.seat !== 'cox' && s.athleteId && index.athleteById.get(s.athleteId)?.side === 'both',
  ).length;
  const coaches = ws.users.filter((u) => u.role !== 'viewer');
  const editor = entry.updatedBy ? ws.users.find((u) => u.id === entry.updatedBy) : null;
  const ui = useLineupUi.getState;

  return (
    <div className="flex flex-col gap-5" key={entry.id}>
      <div className="flex flex-col gap-1">
        <p className="font-display text-lg font-semibold">
          {team.shortName || team.name} {entry.label}
        </p>
        <p className="text-sm text-ink-2">
          {event ? eventTitleText(event, ws.regatta.timezone) : `Unscheduled · ${entry.boatClass}`}
        </p>
      </div>

      {canEdit ? (
        <>
          <LabelField key={`label-${entry.id}-${entry.label}`} entry={entry} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={statusId}>Status</Label>
              <Select<EntryStatus>
                id={statusId}
                value={entry.status}
                disabled={!canEdit}
                onValueChange={(v) => actions.setStatus(entry, v)}
                options={(Object.keys(STATUS_LABELS) as EntryStatus[]).map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={coachId}>Coach</Label>
              <Select
                id={coachId}
                value={entry.coachId ?? NO_COACH}
                disabled={!canEdit}
                onValueChange={(v) =>
                  actions.updateEntry(entry.id, { coachId: v === NO_COACH ? null : v })
                }
                options={[
                  { value: NO_COACH, label: 'No coach' },
                  ...coaches.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Shell and oars</span>
            <div className="flex flex-wrap items-center gap-1">
              <ShellPicker entry={entry} />
              <OarPicker entry={entry} />
            </div>
            {rerig && (
              <p className="inline-flex items-center gap-1.5 text-sm">
                <RefreshCcw aria-hidden className="size-3.5 text-ink-2" />
                {rerig}
              </p>
            )}
          </div>

          <NotesField key={`notes-${entry.id}-${entry.notes ?? ''}`} entry={entry} />
        </>
      ) : (
        <ReadOnlySummary entry={entry} rerig={rerig} />
      )}

      <section aria-labelledby="entry-facts" className="flex flex-col gap-1">
        <h3 id="entry-facts" className="text-md font-medium">
          Crew
        </h3>
        <dl className="flex flex-col divide-y divide-line text-base">
          <Fact term="Average age">
            {stats.avgAge != null
              ? `${stats.avgAge.toFixed(1)}${
                  team.program === 'masters' && stats.mastersCategory
                    ? ` · masters ${stats.mastersCategory}`
                    : ''
                }`
              : '—'}
          </Fact>
          {team.program === 'juniors' && (
            <Fact term="Age group">
              {stats.ageGroup
                ? stats.ageGroup === 'open'
                  ? 'Past junior age'
                  : stats.ageGroup
                : '—'}
            </Fact>
          )}
          {!isSculling(entry.boatClass) && (
            <Fact term="Sides">
              {stats.portCount} port · {stats.starboardCount} starboard
              {either > 0 ? ` · ${either} either` : ''}
            </Fact>
          )}
        </dl>
      </section>

      <section aria-labelledby="entry-findings" className="flex flex-col gap-2">
        <h3 id="entry-findings" className="text-md font-medium">
          Conflicts
        </h3>
        <FindingsList findings={findings} />
      </section>

      <CommentsThread targetType="entry" targetId={entry.id} />

      {editor && entry.updated && (
        <p className="text-sm text-ink-2">
          Last changed by {editor.name}, {relativeTime(entry.updated)}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button
            size="sm"
            onClick={() => ui().openDialog({ kind: 'duplicate', entryId: entry.id })}
          >
            <Copy aria-hidden />
            Copy to another event
          </Button>
          <Button size="sm" onClick={() => ui().openDialog({ kind: 'move', entryId: entry.id })}>
            <ArrowRightLeft aria-hidden />
            Move to another event
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            onClick={() => ui().openDialog({ kind: 'delete', entryId: entry.id })}
          >
            <Trash2 aria-hidden />
            Delete entry
          </Button>
        </div>
      )}
    </div>
  );
}
