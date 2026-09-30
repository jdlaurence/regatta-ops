// Trailer page hooks: writes through the data hooks (PLAN.md §11.2), the page's own small store,
// and the pack animation (§5.2: the app's one orchestrated motion, 400 ms, FLIP).

import { useCallback, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { create } from 'zustand';
import type { Id, LoadPlan, Rule } from '@srt/domain';
import {
  shortUserName,
  useBatch,
  useCreate,
  useCurrentUser,
  useDelete,
  useGuardedUpdate,
  useUpdate,
  type BatchOp,
} from '@/data';
import { toast } from '@/components/toast';
import type { ConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import type { GuardedWrite, Writes } from './lib';

// ---------------------------------------------------------------------------
// Media

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', onChange);
      return () => mq.removeEventListener?.('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Phones get tap-and-choose instead of drag and drop (PLAN.md §5.3, §6.6). */
export function useIsPhone(): boolean {
  return useMediaQuery('(max-width: 767px)');
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ---------------------------------------------------------------------------
// Rules edited since the last pack (this session)

interface RulesDirtyState {
  plans: Record<Id, true>;
  mark: (planId: Id) => void;
  clear: (planIds: Id[]) => void;
}

/**
 * Plans whose rules were edited here since their last pack: "Rules changed · Pack trailer to
 * apply". Session state; editing rules never repacks by itself (§4.10).
 */
export const useRulesDirty = create<RulesDirtyState>((set) => ({
  plans: {},
  mark: (planId) => set((s) => ({ plans: { ...s.plans, [planId]: true } })),
  clear: (planIds) =>
    set((s) => {
      const plans = { ...s.plans };
      for (const id of planIds) delete plans[id];
      return { plans };
    }),
}));

// ---------------------------------------------------------------------------
// Writes

/** The signed-in coach's short name, for "Locked by Sam". */
export function useMyShortName(): string {
  const me = useCurrentUser();
  return shortUserName(me?.name);
}

export function useTrailerWrites() {
  const guarded = useGuardedUpdate('load_placements');
  const batch = useBatch();
  const packBatch = useBatch({ errorMessage: 'The trailer was not packed. Try again.' });
  const createPlan = useCreate('load_plans', {
    errorMessage: 'The load plan was not started. Try again.',
  });
  const updatePlan = useUpdate('load_plans');
  const removePlacement = useDelete('load_placements', {
    errorMessage: 'The boat was not taken off the trailer. Try again.',
  });
  const markDirty = useRulesDirty((s) => s.mark);
  const clearDirty = useRulesDirty((s) => s.clear);

  const apply = useCallback(
    (writes: Writes, onDone?: () => void) => {
      for (const g of writes.guarded) guarded.mutate(g);
      if (writes.batch.length > 0) batch.mutate(writes.batch, { onSuccess: () => onDone?.() });
      else onDone?.();
    },
    [guarded, batch],
  );

  return {
    /** A drop, move, or placement: guarded single updates, then one batch. */
    apply,
    update: (w: GuardedWrite) => guarded.mutate(w),
    remove: (placementId: Id) => removePlacement.mutate(placementId),
    pack: (ops: BatchOp[], planIds: Id[], message = 'Trailer packed') => {
      clearDirty(planIds);
      packBatch.mutate(ops, { onSuccess: () => toast.success(message) });
    },
    packing: packBatch.isPending,
    startPlan: (data: Omit<LoadPlan, 'id'> & { id: Id }) => createPlan.mutate(data),
    starting: createPlan.isPending,
    setRules: (planId: Id, rules: Rule[]) => {
      markDirty(planId);
      updatePlan.mutate({ id: planId, patch: { rules } });
    },
    setStatus: (planId: Id, status: LoadPlan['status']) =>
      updatePlan.mutate({ id: planId, patch: { status } }),
  };
}

type TrailerWrites = ReturnType<typeof useTrailerWrites>;

/**
 * The trailer page's writes, each asking first on a final regatta (PLAN.md §4.1). The first
 * yes covers the rest of the visit, as on the lineup page.
 */
export function useFinalGuardedWrites(
  writes: TrailerWrites,
  finalEdit: Pick<ConfirmFinalEdit, 'needsConfirmation' | 'confirm'>,
): TrailerWrites {
  const approved = useRef(false);
  if (!finalEdit.needsConfirmation) return writes;
  const guard =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      if (approved.current) return fn(...args);
      void finalEdit.confirm('Change the load plan').then((ok) => {
        if (!ok) return;
        approved.current = true;
        fn(...args);
      });
    };
  return {
    ...writes,
    apply: guard(writes.apply),
    update: guard(writes.update),
    remove: guard(writes.remove),
    pack: guard(writes.pack),
    startPlan: guard(writes.startPlan),
    setRules: guard(writes.setRules),
    setStatus: guard(writes.setStatus),
  };
}

// ---------------------------------------------------------------------------
// Pack animation: FLIP from where each boat was (on a rack or in "To load") to its new spot

const PACK_MS = 400;
const EASE = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * `capture()` right before a pack's write; when the chips next change, each one glides from
 * its old spot (its old rack, or its row in "To load") to the new one over 400 ms. Boats that
 * appear from nowhere fade in. Off under prefers-reduced-motion.
 */
export function useFlip(scope: RefObject<HTMLElement | null>, trigger: unknown) {
  const before = useRef<Map<string, DOMRect> | null>(null);
  const timer = useRef<number | null>(null);

  const capture = () => {
    const root = scope.current;
    if (!root || prefersReducedMotion()) return;
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip;
      if (id && !rects.has(id)) rects.set(id, el.getBoundingClientRect());
    });
    before.current = rects;
    if (timer.current) window.clearTimeout(timer.current);
    // Nothing changed on screen (a pack that moved nothing): forget the snapshot.
    timer.current = window.setTimeout(() => (before.current = null), 2000);
  };

  useLayoutEffect(() => {
    const old = before.current;
    const root = scope.current;
    if (!old || !root) return;
    before.current = null;
    root.querySelectorAll<HTMLElement>('[data-flip-target]').forEach((el) => {
      if (typeof el.animate !== 'function') return;
      const id = el.dataset.flipTarget!;
      const now = el.getBoundingClientRect();
      const was = old.get(id);
      if (!was) {
        el.animate(
          [
            { opacity: 0, transform: 'scale(0.9)' },
            { opacity: 1, transform: 'none' },
          ],
          {
            duration: PACK_MS,
            easing: EASE,
          },
        );
        return;
      }
      const dx = was.left + was.width / 2 - (now.left + now.width / 2);
      const dy = was.top + was.height / 2 - (now.top + now.height / 2);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
        duration: PACK_MS,
        easing: EASE,
      });
    });
  }, [scope, trigger]);

  return capture;
}
