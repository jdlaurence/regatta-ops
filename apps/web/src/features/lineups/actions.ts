// Writes of the lineup builder, built on the data hooks (PLAN.md §10.2): every change is one
// optimistic batch, so the strip updates before the server answers and rolls back together if
// it refuses. On a final regatta each edit goes through the confirm-once guard.

import { useMemo } from 'react';
import {
  athleteName,
  seatsFor,
  type BoatClass,
  type Entry,
  type EntryStatus,
  type Id,
  type RegattaEvent,
  type Seat,
  type Team,
} from '@srt/domain';
import { batchOp, newId, useBatch, type BatchOp, type Patch } from '@/data';
import { toast } from '@/components/toast';
import {
  autoLabel,
  clearAllOps,
  clearOps,
  entryName,
  eventTitleText,
  placementOps,
  type CopyRow,
  type LineupIndex,
  type SeatRef,
} from './lib';
import { useLineupUi } from './store';
import { planWrite, toggledDraft } from '@/features/availability/availability-model';

/** PocketBase takes up to 200 operations per batch. */
const BATCH_LIMIT = 200;

export interface LineupActions {
  /** Put an athlete in a seat (from the roster or picker, or `from` another seat). */
  place: (target: SeatRef, athleteId: Id, from?: SeatRef | null) => void;
  clear: (ref: SeatRef) => void;
  clearAll: (entryId: Id) => void;
  /** Add an entry to an event (or unscheduled with a class); returns the new id. */
  addEntry: (args: { event: RegattaEvent | null; boatClass: BoatClass; label?: string }) => Id;
  updateEntry: (id: Id, patch: Patch<Entry>) => void;
  setStatus: (entry: Entry, status: EntryStatus) => void;
  deleteEntry: (entry: Entry) => void;
  /** Copy an entry with its crew, shell, and oars into another event (heats → finals). */
  duplicateEntry: (entry: Entry, event: RegattaEvent | null) => Id;
  /** Move an entry to another event; its class follows the event. */
  moveEntry: (entry: Entry, event: RegattaEvent | null) => void;
  copyRows: (rows: CopyRow[]) => Promise<number>;
  /**
   * Mark an athlete out for the whole regatta, or back to plainly coming (from out, out some
   * days, or maybe): the roster's one-click availability toggle (PLAN.md §4.4).
   */
  toggleAvailability: (athleteId: Id) => void;
}

interface Args {
  index: LineupIndex;
  regattaId: Id;
  team: Team;
  isFinal: boolean;
  canEdit: boolean;
}

function siblingsOf(index: LineupIndex, teamId: Id, eventId: Id | null, except?: Id): string[] {
  return index.data.entries
    .filter((e) => e.teamId === teamId && (e.eventId ?? null) === eventId && e.id !== except)
    .map((e) => e.label);
}

/** Seat records to copy into a class: seats both templates share. */
function seatCopies(index: LineupIndex, from: Entry, toId: Id, cls: BoatClass): BatchOp[] {
  const template = seatsFor(cls);
  const ops: BatchOp[] = [];
  for (const rec of index.seatsByEntry.get(from.id)?.values() ?? []) {
    if (!rec.athleteId || !template.includes(rec.seat)) continue;
    ops.push(
      batchOp.create('entry_seats', { entryId: toId, seat: rec.seat, athleteId: rec.athleteId }),
    );
  }
  return ops;
}

export function useLineupActions({
  index,
  regattaId,
  team,
  isFinal,
  canEdit,
}: Args): LineupActions {
  const batch = useBatch();
  const { mutate, mutateAsync } = batch;

  return useMemo(() => {
    const ui = () => useLineupUi.getState();
    const guard = (fn: () => void) => {
      if (!canEdit) return;
      if (isFinal) ui().requestEdit(fn);
      else fn();
    };
    const nameOf = (id: Id) => {
      const a = index.athleteById.get(id);
      return a ? athleteName(a) : 'The athlete';
    };
    const seatText = (ref: SeatRef) => {
      const entry = index.entryById.get(ref.entryId);
      const where = entry ? entryName(index, entry) : 'the entry';
      return ref.seat === 'cox' ? `cox of ${where}` : `seat ${ref.seat} of ${where}`;
    };
    const settle = (ref: SeatRef) => {
      ui().settle(ref);
      setTimeout(() => {
        const s = ui().settling;
        if (s && s.entryId === ref.entryId && s.seat === ref.seat) ui().settle(null);
      }, 400);
    };

    const place: LineupActions['place'] = (target, athleteId, from) =>
      guard(() => {
        const r = placementOps(index, target, athleteId, from);
        if (r.ops.length === 0) return;
        mutate(r.ops);
        settle(target);
        const parts = [`${nameOf(athleteId)} is in ${seatText(target)}.`];
        if (r.swappedIn && from) parts.push(`${nameOf(r.swappedIn)} moved to ${seatText(from)}.`);
        else if (r.displaced) parts.push(`${nameOf(r.displaced)} left the seat.`);
        ui().announce(parts.join(' '));
      });

    const clear: LineupActions['clear'] = (ref) =>
      guard(() => {
        const ops = clearOps(index, ref);
        if (ops.length === 0) return;
        mutate(ops);
        ui().announce(`Cleared ${seatText(ref)}.`);
      });

    const clearAll: LineupActions['clearAll'] = (entryId) =>
      guard(() => {
        const ops = clearAllOps(index, entryId);
        if (ops.length > 0) mutate(ops);
      });

    const addEntry: LineupActions['addEntry'] = ({ event, boatClass, label }) => {
      const id = newId();
      const cls = event?.boatClass ?? boatClass;
      guard(() => {
        mutate([
          batchOp.create('entries', {
            id,
            regattaId,
            teamId: team.id,
            eventId: event?.id ?? null,
            boatClass: cls,
            label:
              label?.trim() ||
              autoLabel(event, cls, siblingsOf(index, team.id, event?.id ?? null), team.program),
            shellId: null,
            oarSetId: null,
            status: 'draft',
          }),
        ]);
        ui().select(id);
        ui().announce(
          `Entry added${event ? ` to ${eventTitleText(event, index.data.regatta.timezone)}` : ''}.`,
        );
      });
      return id;
    };

    const updateEntry: LineupActions['updateEntry'] = (id, patch) =>
      guard(() => mutate([batchOp.update('entries', id, patch)]));

    const setStatus: LineupActions['setStatus'] = (entry, status) =>
      guard(() => mutate([batchOp.update('entries', entry.id, { status })]));

    const deleteEntry: LineupActions['deleteEntry'] = (entry) =>
      guard(() => {
        // Seats go with the entry (cascade); deleting them first keeps the optimistic view tidy.
        const seatOps = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])].map((s) =>
          batchOp.delete('entry_seats', s.id),
        );
        mutate([...seatOps, batchOp.delete('entries', entry.id)], {
          onSuccess: () => toast.success(`${entryName(index, entry)} deleted`),
        });
        if (ui().selectedEntryId === entry.id) ui().select(null);
      });

    const duplicateEntry: LineupActions['duplicateEntry'] = (entry, event) => {
      const id = newId();
      const cls = event?.boatClass ?? entry.boatClass;
      guard(() => {
        const label =
          cls === entry.boatClass &&
          !siblingsOf(index, entry.teamId, event?.id ?? null).includes(entry.label)
            ? entry.label
            : autoLabel(
                event,
                cls,
                siblingsOf(index, entry.teamId, event?.id ?? null),
                team.program,
              );
        mutate(
          [
            batchOp.create('entries', {
              id,
              regattaId,
              teamId: entry.teamId,
              eventId: event?.id ?? null,
              boatClass: cls,
              label,
              shellId: entry.shellId ?? null,
              oarSetId: entry.oarSetId ?? null,
              status: 'draft',
              coachId: entry.coachId ?? null,
              notes: entry.notes ?? '',
              seatSides: cls === entry.boatClass ? (entry.seatSides ?? null) : null,
            }),
            ...seatCopies(index, entry, id, cls),
          ],
          {
            onSuccess: () =>
              toast.success(
                `${entryName(index, entry)} copied to ${
                  event ? eventTitleText(event, index.data.regatta.timezone) : 'unscheduled'
                }`,
              ),
          },
        );
        ui().select(id);
      });
      return id;
    };

    const moveEntry: LineupActions['moveEntry'] = (entry, event) =>
      guard(() => {
        const cls = event?.boatClass ?? entry.boatClass;
        const oldEvent = entry.eventId ? index.eventById.get(entry.eventId) : null;
        // A label the builder made follows the move; a label the coach typed stays.
        const wasAuto =
          entry.label ===
          autoLabel(
            oldEvent ?? null,
            entry.boatClass,
            siblingsOf(index, entry.teamId, entry.eventId ?? null, entry.id),
            team.program,
          );
        const patch: Patch<Entry> = { eventId: event?.id ?? null, boatClass: cls };
        if (wasAuto) {
          patch.label = autoLabel(
            event,
            cls,
            siblingsOf(index, entry.teamId, event?.id ?? null, entry.id),
            team.program,
          );
        }
        if (cls !== entry.boatClass) patch.seatSides = null;
        // Seats the new class does not have are removed with the move.
        const template = seatsFor(cls);
        const dropped = [...(index.seatsByEntry.get(entry.id)?.values() ?? [])]
          .filter((s) => !template.includes(s.seat))
          .map((s) => batchOp.delete('entry_seats', s.id));
        mutate([batchOp.update('entries', entry.id, patch), ...dropped], {
          onSuccess: () =>
            toast.success(
              `${entryName(index, entry)} moved to ${
                event ? eventTitleText(event, index.data.regatta.timezone) : 'unscheduled'
              }`,
            ),
        });
      });

    const copyRows: LineupActions['copyRows'] = (rows) =>
      new Promise<number>((resolve, reject) => {
        const run = async () => {
          const labels = new Map<string, string[]>();
          const groups: BatchOp[][] = [];
          for (const row of rows) {
            const id = newId();
            const eventId = row.target?.id ?? null;
            const key = eventId ?? '';
            const taken = labels.get(key) ?? siblingsOf(index, team.id, eventId);
            const label = taken.includes(row.source.label)
              ? autoLabel(row.target, row.source.boatClass, taken, team.program)
              : row.source.label;
            labels.set(key, [...taken, label]);
            groups.push([
              batchOp.create('entries', {
                id,
                regattaId,
                teamId: team.id,
                eventId,
                boatClass: row.target?.boatClass ?? row.source.boatClass,
                label,
                shellId: row.source.shellId ?? null,
                oarSetId: row.source.oarSetId ?? null,
                status: 'draft',
                notes: row.source.notes ?? '',
                seatSides: row.source.seatSides ?? null,
              }),
              ...row.seats.map((s) =>
                batchOp.create('entry_seats', {
                  entryId: id,
                  seat: s.seat as Seat,
                  athleteId: s.athleteId,
                }),
              ),
            ]);
          }
          // Whole entries per batch, at most BATCH_LIMIT operations each.
          let chunk: BatchOp[] = [];
          const chunks: BatchOp[][] = [];
          for (const g of groups) {
            if (chunk.length + g.length > BATCH_LIMIT && chunk.length > 0) {
              chunks.push(chunk);
              chunk = [];
            }
            chunk.push(...g);
          }
          if (chunk.length > 0) chunks.push(chunk);
          for (const c of chunks) await mutateAsync(c);
          toast.success(`${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} copied`);
          return rows.length;
        };
        guard(() => {
          run().then(resolve, reject);
        });
      });

    const toggleAvailability = (athleteId: Id) =>
      guard(() => {
        const existing = index.availabilityByAthlete.get(athleteId);
        const next = toggledDraft(existing, index.days);
        const op = planWrite(existing, next, { regattaId, athleteId, regattaDays: index.days });
        if (!op) return;
        const name = nameOf(athleteId);
        const out = next.status === 'unavailable';
        const seated = new Set(
          (index.seatsByAthlete.get(athleteId) ?? [])
            .filter((s) => s.entry.status !== 'scratched')
            .map((s) => s.entry.id),
        ).size;
        mutate([op], {
          onSuccess: () => {
            const text = out ? `${name} marked unavailable` : `${name} marked available`;
            ui().announce(`${text}.`);
            if (out && seated > 0) {
              toast.warning(text, {
                description: `Still seated in ${seated === 1 ? '1 entry' : `${seated} entries`}, which now ${seated === 1 ? 'shows' : 'show'} an error.`,
              });
            } else {
              toast.success(text);
            }
          },
        });
      });

    return {
      place,
      clear,
      clearAll,
      addEntry,
      updateEntry,
      setStatus,
      deleteEntry,
      duplicateEntry,
      moveEntry,
      copyRows,
      toggleAvailability,
    };
  }, [index, regattaId, team, isFinal, canEdit, mutate, mutateAsync]);
}
