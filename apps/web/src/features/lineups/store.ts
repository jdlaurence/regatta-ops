// UI state of the lineup builder: selection, the open seat picker, the athlete being carried
// (the keyboard and click equivalent of a drag), the seat that just settled, and screen reader
// announcements. One builder mounts at a time; the page resets this store on team change.
// Seats subscribe with narrow selectors, so opening one picker re-renders one seat.

import { create } from 'zustand';
import type { Id, Seat } from '@srt/domain';
import type { SeatRef } from './lib';

export interface PickerState extends SeatRef {
  /** Text typed on the seat before the picker opened. */
  query: string;
  /** Changes on every keyboard open so the picker remounts with the typed text. */
  nonce: number;
}

export interface Carrying {
  athleteId: Id;
  /** The seat the athlete was picked up from; null from the roster. */
  from: SeatRef | null;
}

export type LineupDialog =
  | { kind: 'add'; eventId?: Id | null; unscheduled?: boolean }
  | { kind: 'duplicate' | 'move' | 'delete'; entryId: Id }
  | { kind: 'copy-from' }
  | { kind: 'hot-seat'; findingId: string };

interface LineupUiState {
  selectedEntryId: Id | null;
  /** An entry briefly highlighted after arriving from a link (?entry=) or the matrix. */
  flashEntryId: Id | null;
  dialog: LineupDialog | null;
  picker: PickerState | null;
  carrying: Carrying | null;
  settling: SeatRef | null;
  /** Polite live-region text. */
  announcement: string;
  /** A final regatta asks once per visit before the first edit (PLAN.md §4.1). */
  finalConfirmed: boolean;
  pendingEdit: (() => void) | null;
  select: (id: Id | null) => void;
  /** Select an entry, scroll it into view, and highlight it for a moment. */
  reveal: (id: Id) => void;
  openDialog: (dialog: LineupDialog | null) => void;
  openPicker: (ref: SeatRef, query?: string) => void;
  closePicker: () => void;
  carry: (c: Carrying | null) => void;
  settle: (ref: SeatRef | null) => void;
  announce: (text: string) => void;
  requestEdit: (fn: () => void) => void;
  resolveEdit: (confirmed: boolean) => void;
  reset: () => void;
}

const initial = {
  selectedEntryId: null,
  flashEntryId: null,
  dialog: null,
  picker: null,
  carrying: null,
  settling: null,
  announcement: '',
  finalConfirmed: false,
  pendingEdit: null,
};

let nonce = 0;

export const useLineupUi = create<LineupUiState>((set, get) => ({
  ...initial,
  select: (id) => set({ selectedEntryId: id }),
  reveal: (id) => {
    set({ selectedEntryId: id, flashEntryId: id });
    // Wait a frame for the card to render (a view switch or a fresh load), then scroll to it.
    setTimeout(() => {
      document
        .querySelector(`[data-lineup-entry="${id}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    setTimeout(() => {
      if (get().flashEntryId === id) set({ flashEntryId: null });
    }, 1800);
  },
  openDialog: (dialog) => set({ dialog, picker: null }),
  openPicker: (ref, query = '') =>
    set({ picker: { ...ref, query, nonce: ++nonce }, carrying: null }),
  closePicker: () => set({ picker: null }),
  carry: (carrying) => set({ carrying, picker: null }),
  settle: (settling) => set({ settling }),
  announce: (text) =>
    // A repeated sentence still gets read: toggle a trailing space.
    set((s) => ({ announcement: s.announcement === text ? `${text} ` : text })),
  requestEdit: (fn) => {
    if (get().finalConfirmed) fn();
    else set({ pendingEdit: fn });
  },
  resolveEdit: (confirmed) => {
    const fn = get().pendingEdit;
    set({ pendingEdit: null, finalConfirmed: confirmed || get().finalConfirmed });
    if (confirmed) fn?.();
  },
  reset: () => set(initial),
}));

/** Whether this seat's picker is open (a narrow selector: one seat re-renders). */
export function usePickerOpen(entryId: Id, seat: Seat): PickerState | null {
  return useLineupUi((s) =>
    s.picker && s.picker.entryId === entryId && s.picker.seat === seat ? s.picker : null,
  );
}

export function useIsSettling(entryId: Id, seat: Seat): boolean {
  return useLineupUi((s) => s.settling?.entryId === entryId && s.settling.seat === seat);
}
