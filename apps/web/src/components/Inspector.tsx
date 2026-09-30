// The inspector slot (PLAN.md §5.3): the right-hand panel any page can fill. By default the
// shell shows conflicts and activity for the current regatta; a page replaces that by
// rendering <Inspector> anywhere in its tree. The content is portaled into the panel, so it
// keeps the page's React context (queries, feature stores).
//
//   function LineupsPage() {
//     const selected = useLineupStore((s) => s.selectedEntry);
//     return (
//       <>
//         ...
//         {selected && (
//           <Inspector title="Entry details" openOnMount>
//             <EntryDetails entryId={selected} />
//           </Inspector>
//         )}
//       </>
//     );
//   }
//
// While more than one <Inspector> is mounted, the last one mounted shows. `]` toggles the panel
// on desktop; on tablet and phone it is a slide-over opened with the panel button.

import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';

interface InspectorState {
  /** Desktop: whether the inspector column shows (remembered across visits). */
  columnOpen: boolean;
  /** Tablet and phone: whether the slide-over is open (starts closed). */
  sheetOpen: boolean;
  /** Set by the shell from a media query (≥ 1024 px). */
  isDesktop: boolean;
  /** The panel element content is portaled into (set by the shell). */
  slot: HTMLElement | null;
  /** Mounted <Inspector> ids, most recent last. */
  stack: string[];
  titles: Record<string, string>;
  /**
   * Show or hide the panel. Desktop remembers the choice across visits unless `remember` is
   * false (a page that closes the column for its own layout, then restores it on the way out).
   */
  setOpen: (open: boolean, opts?: { remember?: boolean }) => void;
  toggle: () => void;
  /** Desktop: go back to the remembered column state (after a page closed it for itself). */
  restoreOpen: () => void;
  setDesktop: (isDesktop: boolean) => void;
  setSlot: (el: HTMLElement | null) => void;
  push: (id: string, title: string) => void;
  pop: (id: string) => void;
}

const OPEN_KEY = 'srt-inspector-open';

function initialOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, String(open));
  } catch {
    // Not critical.
  }
}

export const useInspectorStore = create<InspectorState>((set, get) => ({
  columnOpen: initialOpen(),
  sheetOpen: false,
  isDesktop: true,
  slot: null,
  stack: [],
  titles: {},
  setOpen: (open, { remember = true } = {}) => {
    if (get().isDesktop) {
      if (remember) saveOpen(open);
      set({ columnOpen: open });
    } else set({ sheetOpen: open });
  },
  toggle: () => get().setOpen(!selectOpen(get())),
  restoreOpen: () => set({ columnOpen: initialOpen() }),
  setDesktop: (isDesktop) => set({ isDesktop, sheetOpen: false }),
  setSlot: (slot) => set({ slot }),
  push: (id, title) =>
    set((s) => ({
      stack: [...s.stack.filter((x) => x !== id), id],
      titles: { ...s.titles, [id]: title },
    })),
  pop: (id) =>
    set((s) => {
      const titles = { ...s.titles };
      delete titles[id];
      return { stack: s.stack.filter((x) => x !== id), titles };
    }),
}));

function selectOpen(s: InspectorState): boolean {
  return s.isDesktop ? s.columnOpen : s.sheetOpen;
}

/** Open, close, or toggle the inspector from anywhere (column on desktop, slide-over below). */
export function useInspector() {
  const open = useInspectorStore(selectOpen);
  const setOpen = useInspectorStore((s) => s.setOpen);
  const toggle = useInspectorStore((s) => s.toggle);
  return { open, setOpen, toggle };
}

/** True while a page has put its own content in the inspector. */
export function useInspectorClaimed(): boolean {
  return useInspectorStore((s) => s.stack.length > 0);
}

/** The title of the page content showing in the inspector, if any. */
export function useInspectorTitle(): string | null {
  return useInspectorStore((s) => {
    const top = s.stack[s.stack.length - 1];
    return top ? (s.titles[top] ?? null) : null;
  });
}

export function Inspector({
  title,
  children,
  openOnMount = false,
}: {
  /** Heading shown at the top of the panel ("Entry details", "Why here?"). */
  title: string;
  children: ReactNode;
  /** Open the panel when this content appears (selecting an entry, say). */
  openOnMount?: boolean;
}) {
  const id = useId();
  const slot = useInspectorStore((s) => s.slot);
  const isTop = useInspectorStore((s) => s.stack[s.stack.length - 1] === id);
  const push = useInspectorStore((s) => s.push);
  const pop = useInspectorStore((s) => s.pop);
  const setOpen = useInspectorStore((s) => s.setOpen);

  useEffect(() => {
    push(id, title);
    return () => pop(id);
  }, [id, title, push, pop]);

  useEffect(() => {
    if (openOnMount) setOpen(true);
  }, [openOnMount, setOpen]);

  if (!slot || !isTop) return null;
  return createPortal(children, slot);
}
