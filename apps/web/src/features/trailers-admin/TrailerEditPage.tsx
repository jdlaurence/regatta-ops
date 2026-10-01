// Trailers admin, one trailer (PLAN.md §6.9): the frame, shelves, and compartments on the left,
// the live end view on the right (drawn from the unsaved draft, with a test pack), and the
// default loading rules. Admins edit; everyone else reads. Save writes the trailer, its
// shelves, and its compartments in one batch.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { meters, shellLabel } from '@regatta-ops/domain';
import { newId, useCan, useList } from '@/data';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states';
import { toast } from '@/components/toast';
import { STYLE_LABELS } from '@/components/trailer/labels';
import { RulesEditor } from '@/components/trailer/RulesEditor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { BackLink } from '@/components/BackLink';
import { CompartmentsTable } from './CompartmentsTable';
import {
  addLevel,
  addShelf,
  defFromDraft,
  defaultUnit,
  draftFromRecords,
  draftWarnings,
  duplicateShelf,
  removeShelf,
  removedShelfIds,
  sameDraft,
  updateCompartment,
  updateShelf,
  validateDraft,
  type SavedTrailer,
  type TrailerDraft,
} from './draft';
import { FrameForm } from './FrameForm';
import {
  useDeleteTrailer,
  usePlacementsOnShelves,
  useSaveTrailer,
  useSavedTrailer,
  useTrailerLoadPlans,
} from './hooks';
import { defaultRulesFor } from './presets';
import { ShelvesTable } from './ShelvesTable';
import { TrailerPreview } from './TrailerPreview';

export default function TrailerEditPage() {
  const { id } = useParams();
  const saved = useSavedTrailer(id);
  if (saved.isError) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/trailers" label="Trailers" />
        <ErrorState
          title="This trailer did not load."
          error={saved.error}
          onRetry={saved.refetch}
        />
      </div>
    );
  }
  if (saved.data === undefined) return <PageSkeleton />;
  if (saved.data === null) {
    return (
      <div className="flex flex-col gap-6">
        <BackLink to="/trailers" label="Trailers" />
        <PageHeader title="Trailer not found" />
        <EmptyState
          title="There is no trailer at this address"
          description="It may have been deleted. Pick one from the trailers list."
          action={
            <Button asChild variant="primary">
              <Link to="/trailers">Go to trailers</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <TrailerEditor key={saved.data.trailer.id} saved={saved.data} />;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function TrailerEditor({ saved }: { saved: SavedTrailer }) {
  const canEdit = useCan('trailer.manage');
  const readOnly = !canEdit;
  const navigate = useNavigate();
  const baseline = useMemo(() => draftFromRecords(saved), [saved]);
  const [edits, setEdits] = useState<TrailerDraft | null>(null);
  const draft = edits ?? baseline;
  const dirty = edits !== null && !sameDraft(edits, baseline);
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const warnings = useMemo(() => draftWarnings(draft), [draft]);
  const def = useMemo(() => defFromDraft(draft), [draft]);
  const update = (fn: (d: TrailerDraft) => TrailerDraft) =>
    setEdits((prev) => fn(prev ?? baseline));

  const saveTrailer = useSaveTrailer();
  const deleteTrailer = useDeleteTrailer();
  const plans = useTrailerLoadPlans(saved.trailer.id);
  const removed = useMemo(() => removedShelfIds(saved, draft), [saved, draft]);
  const placementsLost = usePlacementsOnShelves(removed);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const shells = useList('shells', { sort: 'name' });
  const teams = useList('teams', { sort: 'sortOrder' });
  const shellOptions = useMemo(
    () =>
      (shells.data ?? [])
        .filter((s) => s.status !== 'retired')
        .map((s) => ({ id: s.id, name: shellLabel(s), cls: s.boatClass })),
    [shells.data],
  );
  const teamOptions = useMemo(
    () => (teams.data ?? []).filter((t) => !t.archived).map((t) => ({ id: t.id, name: t.name })),
    [teams.data],
  );
  const tiers = useMemo(() => def.shelves.map((s) => s.tier), [def]);
  const ruleDefaults = useMemo(() => defaultRulesFor(tiers), [tiers]);

  // Leaving with unsaved changes asks first (in the app and when closing the tab).
  const leaving = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const doSave = async () => {
    setConfirmSave(false);
    try {
      await saveTrailer.save(saved, draft);
      setEdits(null);
      toast.success('Trailer saved');
    } catch {
      // The batch hook shows the error toast and rolls the cache back; the draft stays.
    }
  };

  const onSave = () => {
    if (errorCount > 0) return;
    if (placementsLost > 0) setConfirmSave(true);
    else void doSave();
  };

  const status = readOnly
    ? 'Only admins change trailers.'
    : dirty && errorCount > 0
      ? `Fix ${plural(errorCount, 'field')} to save.`
      : dirty
        ? 'Unsaved changes.'
        : null;

  const frame = draft.frameLengthCm;
  return (
    <div className="flex flex-col gap-4">
      <BackLink to="/trailers" label="Trailers" />
      <PageHeader
        title={draft.name.trim() || 'Untitled trailer'}
        description={[
          STYLE_LABELS[draft.style],
          frame !== null && Number.isFinite(frame) && frame > 0 ? `${meters(frame)} m frame` : null,
          plans.data && plans.data.length > 0
            ? `used by ${plural(plans.data.length, 'load plan')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          canEdit ? (
            <>
              {status && (
                <span
                  role="status"
                  className={errorCount > 0 && dirty ? 'text-sm text-danger' : 'text-sm text-ink-2'}
                >
                  {status}
                </span>
              )}
              {dirty && (
                <Button onClick={() => setEdits(null)} disabled={saveTrailer.isPending}>
                  Discard changes
                </Button>
              )}
              <Button
                variant="primary"
                onClick={onSave}
                disabled={!dirty || errorCount > 0 || saveTrailer.isPending}
              >
                {saveTrailer.isPending ? 'Saving…' : 'Save trailer'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More trailer actions">
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden />
                    Delete trailer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <span className="text-sm text-ink-2">{status}</span>
          )
        }
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_480px]">
        <TrailerPreview
          trailer={def}
          rules={draft.defaultRules}
          savedTrailerId={saved.trailer.id}
          className="min-w-0 xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1 xl:max-h-[calc(100dvh-48px)] xl:self-start xl:overflow-y-auto"
        />
        <div className="flex min-w-0 flex-col gap-8 xl:col-start-1 xl:row-start-1">
          <FrameForm
            draft={draft}
            errors={errors}
            readOnly={readOnly}
            onChange={(patch) => update((d) => ({ ...d, ...patch }))}
          />
          <ShelvesTable
            shelves={draft.shelves}
            errors={errors}
            readOnly={readOnly}
            onChange={(id, patch) => update((d) => updateShelf(d, id, patch))}
            onDuplicate={(id) => update((d) => duplicateShelf(d, id, newId))}
            onRemove={(id) => update((d) => removeShelf(d, id))}
            onAddShelf={() => update((d) => addShelf(d, newId))}
            onAddLevel={() => update((d) => addLevel(d, newId))}
          />
          <CompartmentsTable
            compartments={draft.compartments}
            frameLengthCm={draft.frameLengthCm}
            errors={errors}
            warnings={warnings}
            readOnly={readOnly}
            onChange={(id, patch) => update((d) => updateCompartment(d, id, patch))}
            onAdd={() =>
              update((d) => ({
                ...d,
                compartments: [
                  ...d.compartments,
                  {
                    id: newId(),
                    kind: 'storage',
                    label: '',
                    capacity: 1,
                    capacityUnit: defaultUnit('storage'),
                    startCm: null,
                    endCm: null,
                  },
                ],
              }))
            }
            onRemove={(id) =>
              update((d) => ({ ...d, compartments: d.compartments.filter((c) => c.id !== id) }))
            }
          />
          <RulesEditor
            title="Default loading rules"
            rules={draft.defaultRules}
            onChange={(defaultRules) => update((d) => ({ ...d, defaultRules }))}
            trailer={def}
            mode="trailer"
            defaults={ruleDefaults}
            shells={shellOptions}
            teams={teamOptions}
            readOnly={readOnly}
          />
        </div>
      </div>

      <Dialog open={confirmSave} onOpenChange={setConfirmSave}>
        <DialogContent
          title="Remove shelves that hold boats?"
          description={`${plural(placementsLost, 'boat')} placed on the shelves you removed ${placementsLost === 1 ? 'comes' : 'come'} off ${placementsLost === 1 ? 'its load plan' : 'their load plans'} when you save. Coaches will need to place ${placementsLost === 1 ? 'it' : 'them'} again.`}
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button>Keep editing</Button>
            </DialogClose>
            <Button variant="primary" onClick={() => void doSave()}>
              Save trailer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Delete ${saved.trailer.name}?`}
          description={
            plans.data && plans.data.length > 0
              ? `Its shelves and compartments go with it, and so ${plans.data.length === 1 ? 'does the load plan' : `do the ${plans.data.length} load plans`} that ${plans.data.length === 1 ? 'uses' : 'use'} it. This cannot be undone.`
              : 'Its shelves and compartments go with it. This cannot be undone.'
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button>Keep trailer</Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={deleteTrailer.isPending}
              onClick={() => {
                // Leave first: the page has nothing to show once the trailer is gone.
                leaving.current = true;
                const trailerId = saved.trailer.id;
                void navigate('/trailers');
                deleteTrailer.mutate(trailerId);
              }}
            >
              Delete trailer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
      >
        <DialogContent
          title="Leave without saving?"
          description="Your changes to this trailer are not saved yet."
        >
          <DialogFooter>
            <Button onClick={() => blocker.reset?.()}>Stay</Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Leave without saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
