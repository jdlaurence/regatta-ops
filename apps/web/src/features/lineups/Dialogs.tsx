// The builder's dialogs: add an entry, copy or move one to another event, delete one, confirm
// the first edit of a final regatta, and acknowledge a hot seat (WP-H's dialog).

import { useId, useMemo, useState } from 'react';
import { BOAT_CLASSES, seatsFor, type BoatClass, type Entry, type RegattaEvent } from '@srt/domain';
import { formatWeekday } from '@/lib/dates';
import { AcknowledgeHotSeatDialog } from '@/components/AcknowledgeHotSeatDialog';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useLineup } from './context';
import { autoLabel, entryName, eventTitleText } from './lib';
import { CopyFromDialog } from './CopyFromDialog';
import { useLineupUi } from './store';

const UNSCHEDULED = '__unscheduled';

/** Races of the regatta as picker options, grouped by day on multi-day regattas. */
function useEventOptions(exceptId?: string | null): ComboboxOption[] {
  const { ws, index } = useLineup();
  return useMemo(() => {
    const multiDay = index.days.length > 1;
    const races = ws.events.filter((e) => e.kind === 'race' && e.id !== exceptId);
    return [
      { value: UNSCHEDULED, label: 'Unscheduled', hint: 'No event yet; pick the class' },
      ...races.map((e) => ({
        value: e.id,
        label: eventTitleText(e, ws.regatta.timezone),
        keywords: [e.category ?? '', e.boatClass ?? ''],
        group: multiDay ? formatWeekday(e.day) : 'Events',
      })),
    ];
  }, [ws, index, exceptId]);
}

function focusEntry(id: string) {
  setTimeout(() => {
    const card = document.querySelector<HTMLElement>(`[data-lineup-entry="${id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.querySelector<HTMLElement>('[data-lineup-seat]')?.focus({ preventScroll: true });
  }, 60);
}

function AddEntryDialog({
  eventId,
  unscheduled,
}: {
  eventId?: string | null;
  unscheduled?: boolean;
}) {
  const { ws, index, team, actions } = useLineup();
  const ui = useLineupUi.getState;
  const options = useEventOptions();
  const [choice, setChoice] = useState<string | null>(
    unscheduled ? UNSCHEDULED : (eventId ?? null),
  );
  const event = choice && choice !== UNSCHEDULED ? (index.eventById.get(choice) ?? null) : null;
  const [cls, setCls] = useState<BoatClass>(event?.boatClass ?? '8+');
  const [label, setLabel] = useState('');
  const classId = useId();
  const labelId = useId();
  const effectiveClass = event?.boatClass ?? cls;
  const siblings = ws.entries
    .filter((e) => e.teamId === team.id && (e.eventId ?? null) === (event?.id ?? null))
    .map((e) => e.label);
  const auto = autoLabel(event, effectiveClass, siblings, team.program);
  const submit = () => {
    if (!choice) return;
    const id = actions.addEntry({ event, boatClass: effectiveClass, label });
    ui().openDialog(null);
    focusEntry(id);
  };
  return (
    <DialogContent
      title="Add entry"
      description="Pick the event this crew races. The boat class comes from the event."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Event</span>
          <Combobox
            label="Event"
            options={options}
            value={choice}
            onValueChange={(v) => v && setChoice(v)}
            placeholder="Pick an event, or Unscheduled…"
            searchPlaceholder="Event number, name, or class…"
            className="w-full"
            contentClassName="w-[min(440px,calc(100vw-48px))]"
          />
        </div>
        {choice && !event?.boatClass && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={classId}>Boat class</Label>
            <Select<BoatClass>
              id={classId}
              value={cls}
              onValueChange={setCls}
              options={BOAT_CLASSES.map((c) => ({ value: c, label: c }))}
            />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={labelId}>Label</Label>
          <Input
            id={labelId}
            value={label}
            placeholder={auto}
            onChange={(e) => setLabel(e.target.value)}
          />
          <p className="text-sm text-ink-2">Leave it empty to use {auto}.</p>
        </div>
        <DialogFooter>
          <Button onClick={() => ui().openDialog(null)}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!choice}>
            Add entry
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function droppedSeats(entry: Entry, cls: BoatClass, occupied: Set<string>): string[] {
  const template = seatsFor(cls);
  return seatsFor(entry.boatClass).filter((s) => !template.includes(s) && occupied.has(s));
}

function seatListText(seats: string[]): string {
  const words = seats.map((s) => (s === 'cox' ? 'the cox' : s));
  if (words.length === 1) return words[0] === 'the cox' ? 'The cox seat' : `Seat ${words[0]}`;
  const last = words.pop();
  return `Seats ${words.join(', ')} and ${last}`;
}

function EventChoiceDialog({ entry, mode }: { entry: Entry; mode: 'duplicate' | 'move' }) {
  const { index, actions } = useLineup();
  const ui = useLineupUi.getState;
  const options = useEventOptions(mode === 'move' ? entry.eventId : null);
  const [choice, setChoice] = useState<string | null>(null);
  const event: RegattaEvent | null =
    choice && choice !== UNSCHEDULED ? (index.eventById.get(choice) ?? null) : null;
  const cls = event?.boatClass ?? entry.boatClass;
  const occupied = new Set(
    [...(index.seatsByEntry.get(entry.id)?.values() ?? [])]
      .filter((s) => s.athleteId)
      .map((s) => s.seat as string),
  );
  const lost = choice ? droppedSeats(entry, cls, occupied) : [];
  const name = entryName(index, entry);
  const verb = mode === 'duplicate' ? 'Copy' : 'Move';
  const submit = () => {
    if (!choice) return;
    if (mode === 'duplicate') {
      const id = actions.duplicateEntry(entry, event);
      focusEntry(id);
    } else {
      actions.moveEntry(entry, event);
      focusEntry(entry.id);
    }
    ui().openDialog(null);
  };
  return (
    <DialogContent
      title={`${verb} ${name}`}
      description={
        mode === 'duplicate'
          ? 'The copy keeps the crew, shell, and oars, for a final after a heat.'
          : 'The entry keeps its crew, shell, and oars; its boat class follows the event.'
      }
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">To event</span>
        <Combobox
          label="To event"
          options={options}
          value={choice}
          onValueChange={setChoice}
          placeholder="Pick an event…"
          searchPlaceholder="Event number, name, or class…"
          className="w-full"
          contentClassName="w-[min(440px,calc(100vw-48px))]"
        />
      </div>
      {event && event.boatClass && event.boatClass !== entry.boatClass && (
        <p className="text-base leading-prose">
          That event races {event.boatClass}, not {entry.boatClass}.
          {lost.length > 0 &&
            ` ${seatListText(lost)} ${mode === 'duplicate' ? 'will not be copied' : 'will be emptied'}.`}
        </p>
      )}
      <DialogFooter>
        <Button onClick={() => ui().openDialog(null)}>Cancel</Button>
        <Button variant="primary" disabled={!choice} onClick={submit}>
          {verb} entry
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeleteDialog({ entry }: { entry: Entry }) {
  const { index, actions } = useLineup();
  const ui = useLineupUi.getState;
  const filled = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])].filter(
    (s) => s.athleteId,
  ).length;
  return (
    <DialogContent
      title={`Delete ${entryName(index, entry)}?`}
      description={
        filled > 0
          ? `Its ${filled} ${filled === 1 ? 'seat goes' : 'seats go'} with it. The activity log keeps a record.`
          : 'The activity log keeps a record.'
      }
    >
      <DialogFooter>
        <Button onClick={() => ui().openDialog(null)}>Cancel</Button>
        <Button
          variant="danger"
          onClick={() => {
            actions.deleteEntry(entry);
            ui().openDialog(null);
          }}
        >
          Delete entry
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Confirm once per visit before the first edit of a final regatta (PLAN.md §4.1). */
function FinalConfirmDialog() {
  const { ws } = useLineup();
  const pending = useLineupUi((s) => !!s.pendingEdit);
  const resolve = useLineupUi((s) => s.resolveEdit);
  return (
    <Dialog open={pending} onOpenChange={(open) => !open && resolve(false)}>
      <DialogContent
        title="Edit a final regatta?"
        description={`${ws.regatta.name} is marked final. Changes show for every coach right away.`}
      >
        <DialogFooter>
          <Button onClick={() => resolve(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => resolve(true)}>
            Edit this regatta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LineupDialogs() {
  const { index, ws, findings } = useLineup();
  const dialog = useLineupUi((s) => s.dialog);
  const openDialog = useLineupUi((s) => s.openDialog);
  const entry =
    dialog && 'entryId' in dialog ? (index.entryById.get(dialog.entryId) ?? null) : null;
  const finding =
    dialog?.kind === 'hot-seat' ? (findings.find((f) => f.id === dialog.findingId) ?? null) : null;
  const close = (open: boolean) => {
    if (!open) openDialog(null);
  };
  return (
    <>
      <Dialog open={dialog?.kind === 'add'} onOpenChange={close}>
        {dialog?.kind === 'add' && (
          <AddEntryDialog eventId={dialog.eventId} unscheduled={dialog.unscheduled} />
        )}
      </Dialog>
      <Dialog
        open={(dialog?.kind === 'duplicate' || dialog?.kind === 'move') && !!entry}
        onOpenChange={close}
      >
        {entry && (dialog?.kind === 'duplicate' || dialog?.kind === 'move') && (
          <EventChoiceDialog key={`${dialog.kind}-${entry.id}`} entry={entry} mode={dialog.kind} />
        )}
      </Dialog>
      <Dialog open={dialog?.kind === 'delete' && !!entry} onOpenChange={close}>
        {entry && dialog?.kind === 'delete' && <DeleteDialog entry={entry} />}
      </Dialog>
      <Dialog open={dialog?.kind === 'copy-from'} onOpenChange={close}>
        {dialog?.kind === 'copy-from' && <CopyFromDialog />}
      </Dialog>
      <AcknowledgeHotSeatDialog
        regattaId={ws.regatta.id}
        finding={finding}
        open={!!finding}
        onOpenChange={close}
      />
      <FinalConfirmDialog />
    </>
  );
}
