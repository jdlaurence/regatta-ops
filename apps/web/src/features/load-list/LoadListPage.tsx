// /regattas/:id/load: the load list as a checklist, phone first. Grouped by Shells, Riggers,
// Oars, Gear, Extras; each line has where it rides and two big boxes, Loaded and Returned, that
// record who ticked them and when. Flags keep anything from falling through: a shell with no spot
// on a trailer, a spare on a trailer, a line nothing needs any more. Offline it reads from the
// device and every control is off.
//
// Stored rows are made lazily (see lib.ts): ticking a line, or saying where it rides, saves it;
// "Save list" saves every line at once so a share link shows the whole list.

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Check,
  CircleAlert,
  ClipboardCheck,
  MapPin,
  Plus,
  Printer,
  Save,
  Trash2,
  Truck,
} from 'lucide-react';
import type { Id, LoadItem } from '@regatta-ops/domain';
import {
  batchOp,
  useBatch,
  useCan,
  useCreate,
  useCurrentUser,
  useDelete,
  useRegattaWorkingSet,
  useUpdate,
  type BatchOp,
  type RegattaWorkingSet,
} from '@/data';
import { useRegattaId } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/menu';
import { ChoiceChips } from '@/features/share/ChoiceChips';
import { printLoadPath } from '@/features/print/links';
import { cn } from '@/lib/cn';
import {
  buildLoadRows,
  containerPicks,
  countRows,
  filterRows,
  groupRows,
  newItemData,
  planForContainer,
  rowWrite,
  tickPatch,
  tickedBy,
  type LoadFilter,
  type LoadItemData,
  type LoadItemPatch,
  type LoadRow,
  type RowWrite,
  type TickField,
} from './lib';

const BATCH_LIMIT = 200;

// ---------------------------------------------------------------------------
// Writes

function useLoadListWrites(regattaId: Id) {
  const create = useCreate('load_items', { errorMessage: 'The line was not saved. Try again.' });
  const update = useUpdate('load_items', { errorMessage: 'The line was not saved. Try again.' });
  const remove = useDelete('load_items', { errorMessage: 'The line was not removed. Try again.' });
  const batch = useBatch({ errorMessage: 'The list was not saved. Try again.' });
  const write = (w: RowWrite) => {
    if (w.op === 'create') create.mutate(w.data);
    else update.mutate({ id: w.id, patch: w.patch });
  };
  return {
    write,
    patchRow: (row: LoadRow, patch: LoadItemPatch) => write(rowWrite(row, regattaId, patch)),
    add: (data: LoadItemData) => create.mutate(data),
    remove: (id: Id) => remove.mutate(id),
    saveAll: (rows: LoadRow[]) => {
      const ops: BatchOp[] = rows
        .filter((r) => !r.stored && !r.orphaned)
        .map((r) => batchOp.create('load_items', newItemData(r, regattaId)));
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const last = i + BATCH_LIMIT >= ops.length;
        batch.mutate(ops.slice(i, i + BATCH_LIMIT), {
          onSuccess: last ? () => toast.success('Load list saved') : undefined,
        });
      }
    },
    saving: batch.isPending,
  };
}

// ---------------------------------------------------------------------------
// Pieces

function TickButton({
  field,
  row,
  meta,
  disabled,
  onTick,
}: {
  field: TickField;
  row: LoadRow;
  meta: string | null;
  disabled: boolean;
  onTick: (field: TickField, value: boolean) => void;
}) {
  const metaId = useId();
  const checked = field === 'loaded' ? row.loaded : row.returned;
  const word = field === 'loaded' ? 'Loaded' : 'Returned';
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${word}: ${row.label}`}
      aria-describedby={metaId}
      disabled={disabled}
      onClick={() => onTick(field, !checked)}
      className={cn(
        'flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-control border px-2.5 py-1 text-left transition-colors disabled:cursor-not-allowed pointer-coarse:min-h-12',
        checked
          ? 'border-accent bg-accent-tint'
          : 'border-line-strong bg-surface enabled:hover:bg-surface-2',
        disabled && !checked && 'bg-surface-2/60',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-control border-2',
          checked ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong bg-surface',
        )}
      >
        {checked && <Check className="size-3.5" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-ink">{word}</span>
        <span id={metaId} className="truncate text-xs text-ink-2 tabular-nums">
          {meta ?? 'Not yet'}
        </span>
      </span>
    </button>
  );
}

function WhereEditor({
  row,
  picks,
  disabled,
  onSave,
}: {
  row: LoadRow;
  picks: string[];
  disabled: boolean;
  onSave: (container: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(row.container);
  const inputId = useId();
  const shown = row.container || row.suggestedContainer;
  const save = (value: string) => {
    onSave(value.trim());
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setText(row.container);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Where ${row.label} rides: ${shown || 'not set'}`}
          className={cn(
            'inline-flex min-h-8 max-w-full min-w-0 items-center gap-1.5 rounded-control px-1.5 text-left text-sm enabled:hover:bg-surface-2 disabled:cursor-default pointer-coarse:min-h-11',
            shown ? 'text-ink' : 'text-ink-2',
          )}
        >
          <MapPin aria-hidden className="size-3.5 shrink-0 text-ink-2" />
          <span className="truncate">{shown || (disabled ? 'Not set' : 'Set where it rides')}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-32px)] flex-col gap-3">
        <p className="text-sm font-medium text-ink">Where {row.label} rides</p>
        <div className="flex flex-wrap gap-1.5">
          {picks.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => save(p)}
              className={cn(
                'inline-flex min-h-8 items-center rounded-control border px-2.5 text-sm pointer-coarse:min-h-11',
                row.container === p
                  ? 'border-accent bg-accent-tint text-ink'
                  : 'border-line-strong text-ink hover:bg-surface-2',
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save(text);
          }}
        >
          <Field id={inputId} label="Somewhere else">
            <Input
              id={inputId}
              value={text}
              maxLength={80}
              placeholder="Coach's car, Truck 3 bed"
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {row.container && (
              <Button size="sm" variant="ghost" onClick={() => save('')}>
                Clear
              </Button>
            )}
            <Button size="sm" variant="primary" type="submit">
              Save
            </Button>
          </div>
        </form>
        {row.suggestedContainer && !row.container && (
          <p className="text-xs text-ink-2">
            Shown as {row.suggestedContainer} because {row.suggestedWhy ?? 'it rides there'}.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Flag({ tone, children }: { tone: 'warn' | 'info' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-control px-1.5 text-xs font-medium',
        tone === 'warn' && 'bg-warn-tint text-warn',
        tone === 'info' && 'bg-info-tint text-info',
        tone === 'muted' && 'bg-surface-2 text-ink-2',
      )}
    >
      {children}
    </span>
  );
}

function LoadRowItem({
  row,
  ws,
  picks,
  canEdit,
  onTick,
  onWhere,
  onRemove,
}: {
  row: LoadRow;
  ws: RegattaWorkingSet;
  picks: string[];
  canEdit: boolean;
  onTick: (row: LoadRow, field: TickField, value: boolean) => void;
  onWhere: (row: LoadRow, container: string) => void;
  onRemove: (item: LoadItem) => void;
}) {
  const tz = ws.regatta.timezone;
  const users = ws.byId.users;
  const removable = !!row.stored && (row.orphaned || row.kind === 'extra');
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-card border border-line bg-surface p-3',
        'md:grid md:grid-cols-[minmax(0,1fr)_11rem_11rem] md:items-center md:gap-3 md:rounded-none md:border-0 md:border-b md:bg-transparent md:px-1 md:py-2',
        row.orphaned && 'md:opacity-100',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn('text-md font-medium break-words text-ink', row.orphaned && 'text-ink-2')}
          >
            {row.label}
          </span>
          {row.quantity > 1 && (
            <span className="font-display text-sm font-semibold text-ink-2 tabular-nums">
              <span aria-hidden>× {row.quantity}</span>
              <span className="sr-only">Quantity {row.quantity}</span>
            </span>
          )}
          {row.notOnTrailer && (
            <Flag tone="warn">
              <CircleAlert aria-hidden className="size-3" />
              Not on a trailer
            </Flag>
          )}
          {row.spare && row.kind === 'shell' && <Flag tone="info">Spare</Flag>}
          {row.orphaned && <Flag tone="muted">No longer needed</Flag>}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <WhereEditor
            row={row}
            picks={picks}
            disabled={!canEdit}
            onSave={(c) => onWhere(row, c)}
          />
          {row.notOnTrailer && (
            <Link
              to={regattaPath(ws.regatta.id, 'trailer')}
              className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-accent hover:underline pointer-coarse:min-h-11"
            >
              <Truck aria-hidden className="size-3.5" />
              Place it
            </Link>
          )}
          {removable && canEdit && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto md:ml-0"
              onClick={() => onRemove(row.stored!)}
            >
              <Trash2 aria-hidden />
              Remove
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:contents">
        {(['loaded', 'returned'] as const).map((field) => (
          <TickButton
            key={field}
            field={field}
            row={row}
            meta={tickedBy(row.stored, field, users, tz)}
            disabled={!canEdit}
            onTick={(f, v) => onTick(row, f, v)}
          />
        ))}
      </div>
    </li>
  );
}

const SUGGESTIONS = ['Spare single', 'Extra oar set', 'Tool kit'];

function AddItemDialog({
  open,
  onOpenChange,
  picks,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  picks: string[];
  onAdd: (item: { label: string; quantity: number; container: string }) => void;
}) {
  const [label, setLabel] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [container, setContainer] = useState('');
  const [tried, setTried] = useState(false);
  const qty = Number(quantity);
  const labelError = tried && !label.trim() ? 'Say what the item is.' : undefined;
  const qtyError =
    tried && (!Number.isInteger(qty) || qty < 1) ? 'Use a whole number, 1 or more.' : undefined;
  const reset = () => {
    setLabel('');
    setQuantity('1');
    setContainer('');
    setTried(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent
        title="Add item"
        description="Anything the lineups don't bring on their own: a spare single, an extra oar set, a tool."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (!label.trim() || !Number.isInteger(qty) || qty < 1) return;
            onAdd({ label: label.trim(), quantity: qty, container: container.trim() });
            onOpenChange(false);
            reset();
          }}
        >
          <Field id="load-item-label" label="Item" error={labelError}>
            <Input
              id="load-item-label"
              value={label}
              maxLength={80}
              aria-invalid={!!labelError}
              aria-describedby={labelError ? 'load-item-label-error' : undefined}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <div className="-mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setLabel(s)}
                className="inline-flex min-h-8 items-center rounded-control border border-line-strong px-2.5 text-sm text-ink hover:bg-surface-2 pointer-coarse:min-h-11"
              >
                {s}
              </button>
            ))}
          </div>
          <Field id="load-item-qty" label="Quantity" error={qtyError}>
            <Input
              id="load-item-qty"
              inputMode="numeric"
              value={quantity}
              aria-invalid={!!qtyError}
              aria-describedby={qtyError ? 'load-item-qty-error' : undefined}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-24"
            />
          </Field>
          <Field id="load-item-where" label="Where it rides" hint="Optional">
            <Input
              id="load-item-where"
              value={container}
              maxLength={80}
              list="load-item-where-picks"
              aria-describedby="load-item-where-hint"
              onChange={(e) => setContainer(e.target.value)}
            />
            <datalist id="load-item-where-picks">
              {picks.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary">
              <Plus aria-hidden />
              Add item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// The page

function LoadListSkeleton() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading the load list">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-10 w-72 max-w-full" />
      <SkeletonRows rows={8} />
    </div>
  );
}

export default function LoadListPage() {
  const regattaId = useRegattaId();
  const ws = useRegattaWorkingSet(regattaId);
  if (!ws.data && ws.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Load list" />
        <ErrorState title="The load list did not load." error={ws.error} onRetry={ws.refetch} />
      </div>
    );
  }
  if (!ws.data) return <LoadListSkeleton />;
  return <LoadList ws={ws.data} />;
}

const FILTERS: { value: LoadFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'not-loaded', label: 'Not loaded' },
  { value: 'not-returned', label: 'Not returned' },
];

function LoadList({ ws }: { ws: RegattaWorkingSet }) {
  const regattaId = ws.regatta.id;
  const canEdit = useCan('load.edit');
  const me = useCurrentUser();
  const writes = useLoadListWrites(regattaId);
  const [filter, setFilter] = useState<LoadFilter>('all');
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => buildLoadRows(ws), [ws]);
  const counts = countRows(rows);
  const groups = groupRows(filterRows(rows, filter));
  const picks = useMemo(
    () => containerPicks(ws.trailers, ws.compartments),
    [ws.trailers, ws.compartments],
  );
  const firstTrailer = ws.loadPlans[0]?.trailerId ?? ws.trailers[0]?.id;

  const onTick = (row: LoadRow, field: TickField, value: boolean) =>
    writes.patchRow(row, tickPatch(field, value, me?.id ?? null, new Date().toISOString()));

  const onWhere = (row: LoadRow, container: string) => {
    const plan = planForContainer(container, ws.trailers, ws.loadPlans);
    writes.patchRow(row, { container, loadPlanId: container ? plan : row.placementPlanId });
  };

  const description =
    counts.total === 0 ? (
      'Nothing on the list yet'
    ) : (
      <span className="tabular-nums">
        <span className="font-medium text-ink">
          {counts.loaded} of {counts.total}
        </span>{' '}
        loaded · {counts.returned} returned
      </span>
    );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Load list"
        description={description}
        actions={
          <>
            <Button variant="primary" disabled={!canEdit} onClick={() => setAdding(true)}>
              <Plus aria-hidden />
              Add item
            </Button>
            {firstTrailer && (
              <Button asChild variant="ghost">
                <Link to={printLoadPath(regattaId, firstTrailer)}>
                  <Printer aria-hidden />
                  Print load sheet
                </Link>
              </Button>
            )}
          </>
        }
      />

      {counts.notOnTrailer > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-warn/40 bg-warn-tint px-4 py-3 text-base text-ink">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          {counts.notOnTrailer === 1
            ? '1 shell is not on a trailer yet.'
            : `${counts.notOnTrailer} shells are not on a trailer yet.`}
          <Link
            to={regattaPath(regattaId, 'trailer')}
            className="font-medium text-accent hover:underline"
          >
            Place them on the trailer
          </Link>
        </p>
      )}

      {canEdit && counts.unsaved > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-2 px-4 py-3">
          <p className="max-w-prose text-base leading-prose text-ink">
            {counts.unsaved === 1 ? '1 line is' : `${counts.unsaved} lines are`} not saved yet.
            Ticking a line saves it. Save the list so the loading crew sees every line through a
            share link.
          </p>
          <Button disabled={writes.saving} onClick={() => writes.saveAll(rows)}>
            <Save aria-hidden />
            Save list
          </Button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck />}
          title="Nothing to load yet"
          description="Shells, riggers, and oars come from the lineups once entries have them. Add gear or anything else with Add item."
        />
      ) : (
        <>
          <ChoiceChips
            label="Show"
            value={filter}
            onValueChange={setFilter}
            choices={FILTERS.map((f) => ({
              value: f.value,
              label:
                f.value === 'all'
                  ? `All ${counts.total}`
                  : f.value === 'not-loaded'
                    ? `Not loaded ${counts.total - counts.loaded}`
                    : `Not returned ${counts.total - counts.returned}`,
            }))}
          />
          {groups.length === 0 ? (
            <EmptyState
              title={filter === 'not-loaded' ? 'Everything is loaded' : 'Everything is back'}
              description="Show all lines to see what was ticked and by whom."
              action={<Button onClick={() => setFilter('all')}>Show all</Button>}
            />
          ) : (
            groups.map((g) => {
              const done = g.rows.filter((r) => r.loaded).length;
              return (
                <section
                  key={g.kind}
                  aria-labelledby={`load-group-${g.kind}`}
                  className="flex flex-col gap-2 md:rounded-card md:border md:border-line md:bg-surface md:px-3 md:pt-2 md:pb-1"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2
                      id={`load-group-${g.kind}`}
                      className="font-display text-lg font-semibold text-ink"
                    >
                      {g.title}
                    </h2>
                    <span className="text-sm text-ink-2 tabular-nums">
                      {done} of {g.rows.length} loaded
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2 md:gap-0">
                    {g.rows.map((row) => (
                      <LoadRowItem
                        key={row.key}
                        row={row}
                        ws={ws}
                        picks={picks}
                        canEdit={canEdit}
                        onTick={onTick}
                        onWhere={onWhere}
                        onRemove={(item) => writes.remove(item.id)}
                      />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </>
      )}

      <AddItemDialog
        open={adding}
        onOpenChange={setAdding}
        picks={picks}
        onAdd={(item) =>
          writes.add({
            regattaId,
            loadPlanId: planForContainer(item.container, ws.trailers, ws.loadPlans),
            kind: 'extra',
            refId: '',
            label: item.label,
            quantity: item.quantity,
            container: item.container,
            loadedAt: null,
            loadedBy: null,
            returnedAt: null,
            returnedBy: null,
            loadedByName: '',
            returnedByName: '',
            notes: '',
          })
        }
      />
    </div>
  );
}
