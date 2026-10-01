// /regattas/:id/trailer and /regattas/:id/trailer/:trailerId (PLAN.md §4.9, §4.10, §6.6): the
// regatta's load plan on each trailer. Left, the boats still to load; center, the end view (or
// the plan view) with drag and drop, the metrics under it; right, the loading rules. "Auto
// pack trailer" runs the packer and the chips glide to their new spots, the app's one
// orchestrated motion (§5.2). Selecting a boat shows "Why here?" in the inspector (a bottom
// sheet on phones). There is no step to start a load plan: the first change to a trailer (a
// pack, a boat placed, a rule, the status) creates its plan.
//
// A manual move locks the boat ("Locked by Sam"); a drop that breaks a hard rule is refused
// unless Alt (Option) is held, and then it is kept, locked, and flagged. "Auto pack both
// trailers" packs each trailer with its boats plus the boats headed for it (team to trailer by
// name, others where there is room), then fits overflow onto the other.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Boxes, Check, CircleAlert, PackageCheck, Printer, Truck } from 'lucide-react';
import {
  effectiveShelvesFor,
  type Id,
  type LoadPlacement,
  type PackBoat,
  type TeamColorKey,
} from '@regatta-ops/domain';
import { newId, useCan, useRegattaWorkingSet, type RegattaWorkingSet } from '@/data';
import { useRegattaId, useTrailerIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/states';
import { Inspector } from '@/components/Inspector';
import { CommentCount, CommentsThread } from '@/components/CommentsThread';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/controls';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  Sheet,
  SheetContent,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import {
  laneKey,
  PlanView,
  toEndViewBoats,
  TrailerIsometric,
  type PlanLevel,
} from '@/components/trailer';
import type { EndViewCell } from '@/components/trailer/geometry';
import { printLoadPath } from '@/features/print/links';
import { cn } from '@/lib/cn';
import { PlacedBoatDetails, UnplacedBoatDetails } from './BoatDetails';
import { EndViewBoard, type LaneChoice } from './EndViewBoard';
import {
  useFinalGuardedWrites,
  useFlip,
  useIsPhone,
  useMyShortName,
  useRulesDirty,
  useTrailerWrites,
} from './hooks';
import { useConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import {
  bestSpot,
  boatsForPack,
  buildTrailerPageModel,
  checkDrop,
  dropWrites,
  flaggedPlacements,
  lockPlacement,
  metricsSummary,
  newPlanData,
  packAll,
  packOne,
  packOps,
  placementWhere,
  unlockPlacement,
  whyHere,
  type DropCheck,
  type PlanRef,
  type TrailerModel,
} from './lib';
import { MetricsFooter } from './MetricsFooter';
import { BoatPill } from './parts';
import { RulesPanel } from './RulesPanel';
import { ToLoadPanel } from './ToLoadPanel';

// ---------------------------------------------------------------------------
// Loading states

function TrailerSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the trailer">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-80 max-w-full" />
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <Skeleton className="h-72" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default function TrailerPage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  if (!ws.data && ws.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Trailer" />
        <ErrorState title="The trailer did not load." error={ws.error} onRetry={ws.refetch} />
      </div>
    );
  }
  if (!ws.data) return <TrailerSkeleton />;
  return <TrailerWorkspace ws={ws.data} />;
}

// ---------------------------------------------------------------------------
// Trailer switcher (a drop target too: hold a boat over a tab to switch)

function TrailerTab({
  tm,
  regattaId,
  active,
  dropEnabled,
  dragging,
}: {
  tm: TrailerModel;
  regattaId: Id;
  active: boolean;
  dropEnabled: boolean;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `tab:${tm.trailer.id}`,
    data: { type: 'tab', trailerId: tm.trailer.id },
    disabled: !dropEnabled,
  });
  const n = tm.records.length;
  return (
    <Link
      ref={setNodeRef}
      to={regattaPath(regattaId, `trailer/${tm.trailer.id}`)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 min-w-0 items-center gap-1.5 rounded-control border px-3 py-1.5 text-base font-medium sm:gap-2 md:min-h-10',
        active
          ? 'border-accent bg-accent-tint text-ink'
          : 'border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink',
        dragging && !active && 'border-dashed border-line-strong',
        isOver && 'border-accent bg-accent-tint text-ink',
      )}
    >
      <Truck aria-hidden className="hidden size-4 shrink-0 sm:block" />
      <span className="min-w-0 truncate">{tm.trailer.name}</span>
      <span className="shrink-0 text-sm font-normal text-ink-2 tabular-nums">
        {n} {n === 1 ? 'boat' : 'boats'}
      </span>
    </Link>
  );
}

/**
 * Keyboard focus follows a boat after it moves (its chip is drawn anew in the new lane) or is
 * let go, so it never falls back to the top of the page. On a final regatta the move waits for
 * a yes in a dialog; focus follows once the dialog has closed.
 */
function focusBoat(shellId: Id, tries = 100) {
  setTimeout(() => {
    if (document.querySelector('[role="dialog"]')) {
      if (tries > 0) focusBoat(shellId, tries - 1);
      return;
    }
    // Only when focus has nowhere better to be: it fell to the page, or is on a lane button
    // that is going away.
    const active = document.activeElement;
    if (active && active !== document.body && !active.closest('[data-lane-target]')) return;
    document.querySelector<HTMLElement>(`button[data-flip="${CSS.escape(shellId)}"]`)?.focus();
  }, 50);
}

// ---------------------------------------------------------------------------
// Phone: "Move to…" choices

function MoveChoices({
  tm,
  boat,
  otherTrailers,
  laneChoices,
  lanes,
  onMove,
  onOther,
}: {
  tm: TrailerModel;
  boat: PackBoat;
  otherTrailers: TrailerModel[];
  laneChoices: ReadonlyMap<string, LaneChoice>;
  lanes: { cell: EndViewCell; label: string }[];
  onMove: (cell: EndViewCell) => void;
  onOther: (tm: TrailerModel) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink-2">Move to…</h3>
      <ul className="flex flex-col gap-1">
        {lanes.map(({ cell, label }) => {
          const choice = laneChoices.get(laneKey(cell));
          const here = tm.placements.some(
            (p) => p.shellId === boat.shellId && p.shelfId === cell.shelfId && p.lane === cell.lane,
          );
          return (
            <li key={laneKey(cell)}>
              <button
                type="button"
                disabled={here || choice?.ok === false}
                onClick={() => onMove(cell)}
                className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-control border border-line px-3 py-1.5 text-left text-base enabled:hover:bg-surface-2 disabled:cursor-not-allowed disabled:bg-surface-2/60"
              >
                <span
                  className={cn(
                    'font-medium',
                    here || choice?.ok === false ? 'text-ink-2' : 'text-ink',
                  )}
                >
                  {label}
                </span>
                {here ? (
                  <span className="text-sm text-ink-2">Here now</span>
                ) : choice?.ok === false ? (
                  <span className="flex items-start gap-1.5 text-sm text-ink-2">
                    <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-danger" />
                    {choice.reason}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
        {otherTrailers.map((o) => (
          <li key={o.trailer.id}>
            <button
              type="button"
              onClick={() => onOther(o)}
              className="flex min-h-11 w-full items-center rounded-control border border-line px-3 py-1.5 text-left text-base font-medium text-ink hover:bg-surface-2"
            >
              {o.trailer.name}: best free spot
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The workspace

type View = 'end' | 'plan' | 'iso';

interface DragState {
  shellId: Id;
  from: 'to-load' | 'trailer';
}

/** Whether Alt (Option) is held while a boat is being dragged: a flagged drop. */
function useAltKey(active: boolean): [React.RefObject<boolean>, boolean] {
  const ref = useRef(false);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active) return;
    ref.current = false;
    const update = (e: KeyboardEvent | PointerEvent) => {
      if (ref.current !== e.altKey) {
        ref.current = e.altKey;
        setHeld(e.altKey);
      }
    };
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    window.addEventListener('pointermove', update);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
      window.removeEventListener('pointermove', update);
    };
  }, [active]);
  return [ref, active && held];
}

const ALT_HINT = 'Hold Alt (Option on a Mac) as you drop to place it anyway, flagged.';

function TrailerWorkspace({ ws }: { ws: RegattaWorkingSet }) {
  const regattaId = ws.regatta.id;
  const navigate = useNavigate();
  const param = useTrailerIdParam();
  const [search, setSearch] = useSearchParams();
  const viewParam = search.get('view');
  const view: View = viewParam === 'plan' || viewParam === 'iso' ? viewParam : 'end';
  const setView = (v: View) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p);
        if (v === 'end') next.delete('view');
        else next.set('view', v);
        return next;
      },
      { replace: true },
    );

  const model = useMemo(() => buildTrailerPageModel(ws), [ws]);
  const canEdit = useCan('load.edit');
  const isPhone = useIsPhone();
  const dragEnabled = canEdit && !isPhone;
  const me = useMyShortName();
  // A final regatta asks before the first change to its load plans (PLAN.md §4.1); after a yes,
  // the rest of the visit goes through. Load list ticks are exempt (they record what happened).
  const finalEdit = useConfirmFinalEdit(ws.regatta);
  const writes = useFinalGuardedWrites(useTrailerWrites(), finalEdit);
  const dirtyPlans = useRulesDirty((s) => s.plans);

  // The trailer on screen: the URL's, else the first with a plan, else the first. While a boat
  // is held over another trailer's tab, that trailer shows until the drop.
  const [springTrailerId, setSpringTrailerId] = useState<Id | null>(null);
  const defaultId =
    model.trailers.find((t) => t.plan)?.trailer.id ?? model.trailers[0]?.trailer.id ?? null;
  const known = param ? model.trailers.some((t) => t.trailer.id === param) : true;
  const trailerId = springTrailerId ?? (param && known ? param : defaultId);
  const tm = model.trailers.find((t) => t.trailer.id === trailerId) ?? null;

  const [picked, setSelectedId] = useState<Id | null>(null);
  // A boat that left the regatta (its entry scratched) is no longer selected.
  const selectedId = picked && model.boatById.has(picked) ? picked : null;
  const selectedBoat = selectedId ? (model.boatById.get(selectedId) ?? null) : null;

  const [drag, setDrag] = useState<DragState | null>(null);
  const [over, setOver] = useState<{ cell: EndViewCell; check: DropCheck } | null>(null);
  const [preview, setPreview] = useState<EndViewCell | null>(null);
  const [settleId, setSettleId] = useState<Id | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [altRef, altHeld] = useAltKey(!!drag);
  const springTimer = useRef<number | null>(null);
  const [planLevel, setPlanLevel] = useState<PlanLevel>(() =>
    Math.max(1, ...(tm?.def.shelves.map((s) => s.tier) ?? [1])),
  );
  const [confirmPack, setConfirmPack] = useState<'one' | 'all' | null>(null);
  // Auto pack with nothing to pack: no boats at the regatta, or none for this trailer. The
  // reason outlives `open` so the dialog does not change while it closes.
  const [nothingToPack, setNothingToPack] = useState<{
    open: boolean;
    reason: 'no-boats' | 'elsewhere';
  }>({ open: false, reason: 'no-boats' });
  const [commentsOpen, setCommentsOpen] = useState(false);

  const pageRef = useRef<HTMLDivElement>(null);
  const capture = useFlip(pageRef, tm?.placements);

  const viewBoats = useMemo(() => toEndViewBoats(model.boats, ws.teams), [model.boats, ws.teams]);
  const teamColors = useMemo(
    () => new Map<Id, TeamColorKey>(ws.teams.map((t) => [t.id, t.colorKey])),
    [ws.teams],
  );
  const flagged = useMemo(() => (tm ? flaggedPlacements(tm) : {}), [tm]);
  const metrics = useMemo(() => (tm ? metricsSummary(tm) : null), [tm]);

  // Lanes of the trailer on screen, as the end view draws them.
  const lanes = useMemo(() => {
    if (!tm) return [];
    const out: { cell: EndViewCell; label: string }[] = [];
    for (const s of effectiveShelvesFor(tm.def, tm.rules)) {
      const used = tm.placements.filter((p) => p.shelfId === s.def.id).map((p) => p.lane);
      const count = Math.max(1, s.laneSlots, ...used.map((l) => l + 1));
      for (let lane = 0; lane < count; lane++) {
        const cell = { shelfId: s.def.id, lane };
        out.push({ cell, label: placementWhere(tm, cell) });
      }
    }
    return out.sort((a, b) => {
      const ta = tm.def.shelves.find((s) => s.id === a.cell.shelfId)?.tier ?? 0;
      const tb = tm.def.shelves.find((s) => s.id === b.cell.shelfId)?.tier ?? 0;
      return tb - ta;
    });
  }, [tm]);

  // Whether each lane takes the selected boat (click, keyboard, and phone moves).
  const laneChoices = useMemo(() => {
    const map = new Map<string, LaneChoice>();
    if (!tm || !selectedBoat || !canEdit) return map;
    for (const { cell } of lanes) {
      const c = checkDrop(tm, selectedBoat, cell);
      map.set(laneKey(cell), { ok: c.ok, reason: c.reason });
    }
    return map;
  }, [tm, selectedBoat, lanes, canEdit]);

  const recordOf = useCallback(
    (shellId: Id): LoadPlacement | null => {
      for (const t of model.trailers) {
        const r = t.records.find((x) => x.shellId === shellId);
        if (r) return r;
      }
      return null;
    },
    [model],
  );

  const planRef = (t: TrailerModel): PlanRef =>
    t.plan ? { id: t.plan.id } : { id: newId(), create: newPlanData(regattaId, t.trailer) };

  const announce = (text: string) => setAnnouncement(text);

  const settle = (shellId: Id) => {
    setSettleId(shellId);
    window.setTimeout(() => setSettleId((id) => (id === shellId ? null : id)), 400);
  };

  /** Put a boat in a lane of trailer `t`, by drag, click, keyboard, or the phone's sheet. */
  const moveTo = (t: TrailerModel, shellId: Id, cell: EndViewCell, force: boolean): boolean => {
    const boat = model.boatById.get(shellId);
    if (!boat || !canEdit) return false;
    const check = checkDrop(t, boat, cell);
    if (!check.ok && !force) {
      const text = `${check.reason ?? 'Not allowed here.'} ${isPhone ? '' : ALT_HINT}`.trim();
      toast.error(check.reason ?? 'That spot is not allowed.');
      announce(`${boat.name} stayed where it was. ${text}`);
      return false;
    }
    const w = dropWrites({
      result: check.result,
      target: planRef(t),
      targetRecords: t.records,
      from: recordOf(shellId),
      userName: me,
    });
    writes.apply(w);
    settle(shellId);
    const where = placementWhere(t, cell);
    announce(
      check.ok
        ? `${boat.name} moved to ${t.trailer.name}, ${where.toLowerCase()}.`
        : `${boat.name} placed on ${t.trailer.name}, ${where.toLowerCase()}, flagged: ${check.reason}`,
    );
    if (!check.ok) toast.warning(`Placed anyway and flagged. ${check.reason}`);
    return true;
  };

  /** The best free spot on trailer `t` (drop on a tab, "Put it there"). */
  const placeBest = (t: TrailerModel, shellId: Id) => {
    const boat = model.boatById.get(shellId);
    if (!boat || !canEdit) return;
    const spot = bestSpot(t, boat);
    if (!spot.ok) {
      toast.error(`No room on the ${t.trailer.name}. ${spot.reasons[0]?.text ?? ''}`.trim());
      return;
    }
    moveTo(t, shellId, { shelfId: spot.placement.shelfId, lane: spot.placement.lane }, false);
  };

  const removeFromTrailer = (shellId: Id) => {
    const rec = recordOf(shellId);
    const boat = model.boatById.get(shellId);
    if (!rec || !canEdit) return;
    writes.remove(rec.id);
    announce(`${boat?.name ?? 'The boat'} is back on the list to load.`);
  };

  const setLock = (shellId: Id, locked: boolean) => {
    const rec = recordOf(shellId);
    if (!rec) return;
    const next = locked
      ? lockPlacement({ locked: rec.locked, reasons: rec.reasons ?? [] }, me)
      : unlockPlacement({ locked: rec.locked, reasons: rec.reasons ?? [] });
    writes.update({ id: rec.id, patch: next });
  };

  // Pack ---------------------------------------------------------------------

  const runPack = (which: 'one' | 'all') => {
    if (!tm) return;
    const packedAt = new Date().toISOString();
    capture();
    if (which === 'one') {
      const result = packOne(model, tm);
      const plan = planRef(tm);
      writes.pack(packOps({ plan, records: tm.records, result, packedAt }), [plan.id]);
      announce(
        `${tm.trailer.name} packed: ${result.placements.length} ${result.placements.length === 1 ? 'boat' : 'boats'} on the racks${result.unplaced.length ? `, ${result.unplaced.length} did not fit` : ''}.`,
      );
    } else {
      const results = packAll(model);
      const ops = [];
      const ids: Id[] = [];
      for (const t of model.trailers) {
        const result = results.get(t.trailer.id);
        if (!result) continue;
        const plan = planRef(t);
        ids.push(plan.id);
        ops.push(...packOps({ plan, records: t.records, result, packedAt }));
      }
      writes.pack(ops, ids, 'Trailers packed');
      announce('Both trailers packed.');
    }
    setSelectedId(null);
  };

  const askPack = (which: 'one' | 'all') => {
    if (!tm) return;
    if (model.boats.length === 0) {
      setNothingToPack({ open: true, reason: 'no-boats' });
      return;
    }
    if (which === 'one' && boatsForPack(model, tm).length === 0) {
      setNothingToPack({ open: true, reason: 'elsewhere' });
      return;
    }
    const plans = which === 'one' ? [tm.plan] : model.trailers.map((t) => t.plan);
    if (plans.some((p) => p?.status === 'final')) setConfirmPack(which);
    else runPack(which);
  };

  // Keyboard: Escape lets go of the selected boat, and focus goes back to it (the lane
  // buttons it may have been on go away).
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const id = selectedId;
      setSelectedId(null);
      setPreview(null);
      announce('Selection cleared.');
      focusBoat(id);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Drag and drop --------------------------------------------------------------

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const clearSpring = () => {
    if (springTimer.current) window.clearTimeout(springTimer.current);
    springTimer.current = null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as DragState | undefined;
    if (!data) return;
    setDrag({ shellId: data.shellId, from: data.from });
    setPreview(null);
  };

  const onDragOver = (e: DragOverEvent) => {
    clearSpring();
    const data = e.over?.data.current as
      | { type: 'lane'; cell: EndViewCell }
      | { type: 'tab'; trailerId: Id }
      | { type: 'to-load' }
      | undefined;
    const boat = drag ? model.boatById.get(drag.shellId) : undefined;
    if (!data || !boat || !tm) {
      setOver(null);
      return;
    }
    if (data.type === 'lane') {
      setOver({ cell: data.cell, check: checkDrop(tm, boat, data.cell) });
      return;
    }
    setOver(null);
    if (data.type === 'tab' && data.trailerId !== tm.trailer.id) {
      springTimer.current = window.setTimeout(() => setSpringTrailerId(data.trailerId), 550);
    }
  };

  const endDrag = () => {
    clearSpring();
    setDrag(null);
    setOver(null);
    if (springTrailerId) {
      if (springTrailerId !== param) navigate(regattaPath(regattaId, `trailer/${springTrailerId}`));
      setSpringTrailerId(null);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    const data = e.over?.data.current as
      | { type: 'lane'; cell: EndViewCell }
      | { type: 'tab'; trailerId: Id }
      | { type: 'to-load' }
      | undefined;
    const current = drag;
    const force = altRef.current;
    endDrag();
    if (!current || !data || !tm) return;
    if (data.type === 'lane') moveTo(tm, current.shellId, data.cell, force);
    else if (data.type === 'tab') {
      const target = model.trailers.find((t) => t.trailer.id === data.trailerId);
      if (target && target.trailer.id !== recordTrailer(current.shellId)) {
        placeBest(target, current.shellId);
      }
    } else if (data.type === 'to-load' && current.from === 'trailer') {
      removeFromTrailer(current.shellId);
    }
  };

  const recordTrailer = (shellId: Id) => model.placedOn.get(shellId) ?? null;

  // Click and keyboard moves ---------------------------------------------------

  const onChipClick = (shellId: Id) => {
    setSelectedId((id) => (id === shellId ? null : shellId));
    setPreview(null);
  };

  const onLaneActivate = (cell: EndViewCell, event: ReactMouseEvent<HTMLElement>) => {
    if (!tm || !selectedId) return;
    if (moveTo(tm, selectedId, cell, event.altKey)) {
      setPreview(null);
      setSelectedId(null);
      focusBoat(selectedId);
    }
  };

  // Feedback on the drawing: the lane under the dragged boat, else the lane a selected boat
  // would go to (hover or focus on a lane button).
  const previewCheck = useMemo(() => {
    if (!preview || !selectedBoat || !tm) return null;
    return { cell: preview, check: checkDrop(tm, selectedBoat, preview) };
  }, [preview, selectedBoat, tm]);
  const feedback = over ?? previewCheck;
  const highlightCell = feedback?.check.ok ? feedback.cell : null;
  const invalidCell =
    feedback && !feedback.check.ok
      ? {
          ...feedback.cell,
          reason: `${feedback.check.reason}${drag ? (altHeld ? ' Drop to place it anyway, flagged.' : ` ${ALT_HINT}`) : ' Alt-click to place it anyway, flagged.'}`,
        }
      : null;

  // ---------------------------------------------------------------------------

  if (model.trailers.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Trailer" />
        <EmptyState
          icon={<Truck />}
          title="No trailers yet"
          description="An admin adds the club's trailers, with their racks and loading rules, on the Trailers page."
          action={
            <Button asChild>
              <Link to="/trailers">Go to trailers</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (!tm) return null;
  if (!known) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Trailer" />
        <EmptyState
          title="Trailer not found"
          description="It may have been removed, or the link is wrong. Pick a trailer below."
          action={model.trailers.map((t) => (
            <Button key={t.trailer.id} asChild>
              <Link to={regattaPath(regattaId, `trailer/${t.trailer.id}`)}>{t.trailer.name}</Link>
            </Button>
          ))}
        />
      </div>
    );
  }

  const plan = tm.plan;
  const placed = tm.records.length;
  const packedText = plan?.packedAt
    ? `Packed ${new Intl.DateTimeFormat('en-US', {
        timeZone: ws.regatta.timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(plan.packedAt))}`
    : 'Not packed yet';
  const otherTrailers = model.trailers.filter((t) => t !== tm);
  const dragBoat = drag ? model.boatById.get(drag.shellId) : undefined;
  const dragView = dragBoat ? viewBoats.find((b) => b.shellId === dragBoat.shellId) : undefined;
  const dirty = !!plan && !!dirtyPlans[plan.id];
  const movingName = selectedBoat && canEdit && !isPhone ? selectedBoat.name : null;

  const selectedDetails = (() => {
    if (!selectedBoat) return null;
    const team = ws.byId.teams.get(selectedBoat.teamId);
    const onThis = tm.placements.find((p) => p.shellId === selectedBoat.shellId);
    const phoneMoves = isPhone && canEdit && (
      <MoveChoices
        tm={tm}
        boat={selectedBoat}
        otherTrailers={otherTrailers}
        laneChoices={laneChoices}
        lanes={lanes}
        onMove={(cell) => {
          if (moveTo(tm, selectedBoat.shellId, cell, false)) {
            setSelectedId(null);
            focusBoat(selectedBoat.shellId);
          }
        }}
        onOther={(t) => {
          placeBest(t, selectedBoat.shellId);
          setSelectedId(null);
        }}
      />
    );
    if (onThis) {
      const why = whyHere(tm, selectedBoat.shellId);
      if (!why) return null;
      return {
        title: 'Why here?',
        body: (
          <PlacedBoatDetails
            boat={selectedBoat}
            team={team}
            where={placementWhere(tm, onThis)}
            trailerName={tm.trailer.name}
            why={why}
            canEdit={canEdit}
            onLock={() => setLock(selectedBoat.shellId, true)}
            onUnlock={() => setLock(selectedBoat.shellId, false)}
            onRemove={() => {
              removeFromTrailer(selectedBoat.shellId);
              setSelectedId(null);
            }}
          >
            {phoneMoves}
          </PlacedBoatDetails>
        ),
      };
    }
    const elsewhere = model.trailers.find(
      (t) => t !== tm && t.records.some((r) => r.shellId === selectedBoat.shellId),
    );
    const spot = bestSpot(tm, selectedBoat);
    return {
      title: elsewhere ? `On the ${elsewhere.trailer.name}` : 'Boat to load',
      body: (
        <UnplacedBoatDetails
          boat={selectedBoat}
          team={team}
          trailerName={tm.trailer.name}
          elsewhere={elsewhere?.trailer.name ?? null}
          spot={
            spot.ok
              ? {
                  ok: true,
                  where: placementWhere(tm, spot.placement),
                  reasons: spot.placement.reasons.filter((r) => !r.hard || r.score !== undefined),
                }
              : { ok: false, reasons: spot.reasons }
          }
          canEdit={canEdit}
          onPlace={() => {
            placeBest(tm, selectedBoat.shellId);
            setSelectedId(null);
          }}
        >
          {phoneMoves}
        </UnplacedBoatDetails>
      ),
    };
  })();

  return (
    <DndContext
      sensors={sensors}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Drag with a mouse, pen, or finger. With the keyboard, press Enter to select the boat, then choose a lane.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up ${model.boatById.get((active.data.current as DragState).shellId)?.name ?? 'a boat'}.`,
          onDragOver: () => undefined,
          onDragEnd: () => undefined,
          onDragCancel: ({ active }) =>
            `${model.boatById.get((active.data.current as DragState).shellId)?.name ?? 'The boat'} stayed where it was.`,
        },
      }}
    >
      <div ref={pageRef} className="flex flex-col gap-5">
        <PageHeader
          title="Trailer"
          description={
            <>
              {tm.trailer.name} · {placed} {placed === 1 ? 'boat' : 'boats'} · {packedText}
            </>
          }
          actions={
            <>
              <Button
                variant="primary"
                disabled={!canEdit || writes.packing}
                onClick={() => askPack('one')}
              >
                <PackageCheck aria-hidden />
                Auto pack trailer
              </Button>
              {model.trailers.length > 1 && (
                <Button disabled={!canEdit || writes.packing} onClick={() => askPack('all')}>
                  <Boxes aria-hidden />
                  Auto pack both trailers
                </Button>
              )}
              <Button asChild variant="ghost">
                <Link to={printLoadPath(regattaId, tm.trailer.id)}>
                  <Printer aria-hidden />
                  Print load sheet
                </Link>
              </Button>
            </>
          }
        />

        {model.trailers.length > 1 && (
          <nav aria-label="Trailers" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {model.trailers.map((t) => (
              <TrailerTab
                key={t.trailer.id}
                tm={t}
                regattaId={regattaId}
                active={t === tm}
                dropEnabled={dragEnabled}
                dragging={!!drag}
              />
            ))}
          </nav>
        )}

        <div className="@container">
          <div className="grid grid-cols-1 gap-5 @4xl:grid-cols-[16.5rem_minmax(0,1fr)] @7xl:grid-cols-[16.5rem_minmax(0,1fr)_21rem]">
            <ToLoadPanel
              model={model}
              ws={ws}
              trailerId={tm.trailer.id}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId((cur) => (cur === id ? null : id));
                setPreview(null);
              }}
              dragEnabled={dragEnabled}
              dragFromTrailer={drag?.from === 'trailer'}
              className="self-start @4xl:row-span-2 @7xl:row-span-1"
            />

            <section
              aria-label={`${tm.trailer.name} load plan`}
              className="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-3 @container sm:p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <SegmentedControl
                  label="View"
                  value={view}
                  onValueChange={setView}
                  size="sm"
                  options={[
                    { value: 'end', label: 'End view' },
                    { value: 'plan', label: 'Plan view' },
                    { value: 'iso', label: 'Isometric' },
                  ]}
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-2" id="plan-status-label">
                    Load plan
                  </span>
                  <Select
                    label="Load plan status"
                    value={plan?.status ?? 'draft'}
                    disabled={!canEdit}
                    onValueChange={(v) => writes.setStatus(planRef(tm), v)}
                    options={[
                      { value: 'draft', label: 'Draft' },
                      { value: 'final', label: 'Final' },
                    ]}
                    className="h-8 min-w-24"
                  />
                </div>
              </div>

              {dirty && view === 'end' && (
                <p className="text-sm font-medium text-accent" role="status">
                  Rules changed · Auto pack to apply
                </p>
              )}

              {view === 'end' ? (
                <>
                  <EndViewBoard
                    trailer={tm.def}
                    rules={tm.rules}
                    placements={tm.placements}
                    boats={viewBoats}
                    selectedShellId={selectedId}
                    movingName={movingName}
                    laneChoices={laneChoices}
                    highlightCell={highlightCell}
                    invalidCell={invalidCell}
                    flagged={flagged}
                    dragEnabled={dragEnabled}
                    dropEnabled={dragEnabled}
                    settleShellId={settleId}
                    onChipClick={onChipClick}
                    onLaneActivate={onLaneActivate}
                    onPreview={setPreview}
                  />
                  {movingName && !drag && (
                    <p className="text-sm text-ink-2">
                      Choose a lane for {movingName}, or press Escape.
                    </p>
                  )}
                </>
              ) : view === 'iso' ? (
                <TrailerIsometric
                  trailer={tm.def}
                  rules={tm.rules}
                  placements={tm.placements}
                  boats={viewBoats}
                  selectedShellId={selectedId}
                />
              ) : (
                <PlanView
                  trailer={tm.def}
                  rules={tm.rules}
                  placements={tm.placements}
                  boatById={model.boatById}
                  teamColors={teamColors}
                  selectedShellId={selectedId}
                  onSelect={onChipClick}
                  level={planLevel}
                  onLevelChange={setPlanLevel}
                />
              )}

              {metrics && (
                <MetricsFooter metrics={metrics} toLoad={model.toLoad.length} placed={placed} />
              )}
            </section>

            <RulesPanel
              tm={tm}
              boats={model.boats}
              teams={ws.teams}
              canEdit={canEdit}
              dirty={dirty}
              onChange={(rules) => writes.setRules(planRef(tm), rules)}
              className="self-start @4xl:col-start-2 @7xl:col-start-3 @7xl:row-start-1"
            />
          </div>
        </div>

        {plan && (
          <section className="rounded-card border border-line bg-surface">
            <h2>
              <button
                type="button"
                aria-expanded={commentsOpen}
                onClick={() => setCommentsOpen((o) => !o)}
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
              >
                <span className="font-display text-lg font-semibold">Comments</span>
                <CommentCount targetType="load_plan" targetId={plan.id} />
                <span className="ml-auto text-sm text-ink-2">{commentsOpen ? 'Hide' : 'Show'}</span>
              </button>
            </h2>
            {commentsOpen && (
              <div className="border-t border-line p-3">
                <CommentsThread targetType="load_plan" targetId={plan.id} title={null} />
              </div>
            )}
          </section>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragBoat ? (
          <BoatPill
            name={dragBoat.name}
            cls={dragBoat.cls}
            teamColor={dragView?.teamColor}
            className={cn(
              'cursor-grabbing shadow-popover',
              over && !over.check.ok && !altHeld && 'border-dashed border-danger',
            )}
          />
        ) : null}
      </DragOverlay>

      {selectedDetails && !isPhone && (
        <Inspector title={selectedDetails.title} openOnMount>
          {selectedDetails.body}
        </Inspector>
      )}
      {isPhone && (
        <Sheet open={!!selectedDetails} onOpenChange={(open) => !open && setSelectedId(null)}>
          {selectedDetails && (
            <SheetContent side="bottom" title={selectedDetails.title}>
              <div className="p-4 pb-8">{selectedDetails.body}</div>
            </SheetContent>
          )}
        </Sheet>
      )}

      <Dialog open={confirmPack !== null} onOpenChange={(o) => !o && setConfirmPack(null)}>
        <DialogContent
          title="Auto pack a final load plan?"
          description="This load plan is marked final. Packing again moves every boat that is not locked."
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button>Keep the plan</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                const which = confirmPack;
                setConfirmPack(null);
                if (which) runPack(which);
              }}
            >
              <Check aria-hidden />
              {confirmPack === 'all' ? 'Auto pack both trailers' : 'Auto pack trailer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={nothingToPack.open}
        onOpenChange={(open) => setNothingToPack((n) => ({ ...n, open }))}
      >
        {nothingToPack.reason === 'no-boats' ? (
          <DialogContent
            title="No boats to pack yet"
            description="Boats come from the lineups, and no entry at this regatta has a shell yet. Pick a shell for each entry on its team’s lineups page, then auto pack the trailer."
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
              <Button asChild variant="primary">
                <Link to={regattaPath(regattaId, 'lineups')}>Go to lineups</Link>
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent
            title={`No boats for the ${tm.trailer.name}`}
            description={`Every boat at this regatta is on, or headed for, ${otherTrailers.length === 1 ? `the ${otherTrailers[0]!.trailer.name}` : 'another trailer'}. To load one here instead, move it onto these racks from To load or from the other trailer.`}
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
      {finalEdit.dialog}
    </DndContext>
  );
}
