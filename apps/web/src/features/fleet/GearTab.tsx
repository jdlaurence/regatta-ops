// Gear: cox boxes, slings, tents, and the rest. Default-load items go on every regatta's load
// list (PLAN.md §4.8). Edited inline on wider screens; phones edit through a dialog.

import { useId, useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  GEAR_CATEGORIES,
  gearItemSchema,
  BASE_KEYS,
  requiredText,
  type GearCategory,
  type GearItem,
} from '@regatta-ops/domain';
import { useCan, useCreate, useDelete, useList, useUpdate } from '@/data';
import { CsvImportDialog, downloadText } from '@/components/CsvImport';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input, Label, Textarea } from '@/components/ui/input';
import { checkGearRows, GEAR_CSV_FIELDS, gearToCsv, type GearInput } from './csv';
import { NumberField, SelectField } from './form-fields';
import { useClubToday, useWideLayout } from './hooks';
import { useImportRecords } from './import';
import { exportFileName, GEAR_CATEGORY_LABELS, matchesSearch } from './lib';
import { FilterSelect, InlineSelect, InlineText, SearchInput } from './parts';

const CATEGORY_OPTIONS = GEAR_CATEGORIES.map((c) => ({ value: c, label: GEAR_CATEGORY_LABELS[c] }));

function compareGear(a: GearItem, b: GearItem): number {
  return (
    GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export function GearTab({ nav }: { nav: ReactNode }) {
  const gear = useList('gear_items');
  const canEdit = useCan('fleet.edit');
  const wide = useWideLayout();
  const today = useClubToday();
  const update = useUpdate('gear_items');
  const create = useCreate('gear_items');
  const remove = useDelete('gear_items');
  const importRecords = useImportRecords('gear_items');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<GearCategory | 'all'>('all');
  const [dialog, setDialog] = useState<{ item: GearItem | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const all = useMemo(() => [...(gear.data ?? [])].sort(compareGear), [gear.data]);
  const rows = useMemo(
    () =>
      all.filter(
        (g) =>
          (category === 'all' || g.category === category) &&
          matchesSearch(search, [g.name, g.notes, GEAR_CATEGORY_LABELS[g.category]]),
      ),
    [all, category, search],
  );
  const defaultLoadCount = all.filter((g) => g.defaultLoad).length;

  const save = (g: GearItem, patch: Partial<GearItem>) => update.mutate({ id: g.id, patch });

  const deleteItem = (g: GearItem) =>
    remove.mutate(g.id, {
      onSuccess: () =>
        toast.success(`${g.name} deleted`, {
          action: {
            label: 'Undo',
            onClick: () => {
              const { id, created: _c, updated: _u, ...rest } = g;
              create.mutate({ ...rest, id });
            },
          },
        }),
    });

  const exportRows = () => {
    downloadText(exportFileName('gear', today), gearToCsv(rows));
    toast.success(`${rows.length} gear ${rows.length === 1 ? 'item' : 'items'} exported`);
  };

  const columns = useMemo<ColumnDef<GearItem, unknown>[]>(
    () => [
      {
        id: 'category',
        header: 'Category',
        accessorFn: (g) => GEAR_CATEGORIES.indexOf(g.category),
        meta: { className: 'min-w-36' },
        cell: ({ row }) =>
          canEdit ? (
            <InlineSelect
              value={row.original.category}
              options={CATEGORY_OPTIONS}
              label={`Category of ${row.original.name}`}
              onChange={(v) => save(row.original, { category: v })}
            />
          ) : (
            GEAR_CATEGORY_LABELS[row.original.category]
          ),
      },
      {
        id: 'name',
        header: 'Name',
        accessorFn: (g) => g.name,
        sortingFn: 'alphanumeric',
        meta: { className: 'min-w-60' },
        cell: ({ row }) =>
          canEdit ? (
            <InlineText
              value={row.original.name}
              label={`Name of ${row.original.name}`}
              onCommit={(v) =>
                v ? save(row.original, { name: v }) : toast.error('Enter a name for the item.')
              }
            />
          ) : (
            <span className="font-medium">{row.original.name}</span>
          ),
      },
      {
        id: 'quantity',
        header: 'Quantity',
        accessorFn: (g) => g.quantity,
        meta: { className: 'w-24 tabular-nums' },
        cell: ({ row }) =>
          canEdit ? (
            <InlineText
              value={String(row.original.quantity)}
              type="number"
              inputMode="numeric"
              label={`Quantity of ${row.original.name}`}
              className="w-20 tabular-nums"
              onCommit={(v) => {
                const n = Number(v);
                if (v === '' || !Number.isInteger(n) || n < 0) {
                  toast.error('Enter the quantity as a whole number, zero or more.');
                  return;
                }
                save(row.original, { quantity: n });
              }}
            />
          ) : (
            row.original.quantity
          ),
      },
      {
        id: 'defaultLoad',
        header: 'Default load',
        accessorFn: (g) => (g.defaultLoad ? 1 : 0),
        meta: { className: 'w-32' },
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={row.original.defaultLoad}
              disabled={!canEdit}
              aria-label={`${row.original.name} goes on every trailer by default`}
              onCheckedChange={(v) => save(row.original, { defaultLoad: v })}
            />
            <span className="text-sm text-ink-2">{row.original.defaultLoad ? 'Yes' : 'No'}</span>
          </span>
        ),
      },
      {
        id: 'notes',
        header: 'Notes',
        enableSorting: false,
        accessorFn: (g) => g.notes ?? '',
        meta: { className: 'w-full min-w-64' },
        cell: ({ row }) =>
          canEdit ? (
            <InlineText
              value={row.original.notes ?? ''}
              label={`Notes for ${row.original.name}`}
              onCommit={(v) => save(row.original, { notes: v })}
            />
          ) : (
            <span className="text-ink-2">{row.original.notes}</span>
          ),
      },
      ...(canEdit
        ? [
            {
              id: 'actions',
              header: () => <span className="sr-only">Actions</span>,
              enableSorting: false,
              meta: { className: 'w-12 text-right' },
              cell: ({ row }) => (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${row.original.name}`}
                  onClick={() => deleteItem(row.original)}
                >
                  <Trash2 aria-hidden />
                </Button>
              ),
            } satisfies ColumnDef<GearItem, unknown>,
          ]
        : []),
    ],
    // save and deleteItem close over stable mutation objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  );

  const actions = (
    <>
      <Button onClick={exportRows} disabled={!gear.data || rows.length === 0}>
        <Download aria-hidden />
        Export CSV
      </Button>
      {canEdit && (
        <>
          <Button onClick={() => setImportOpen(true)}>
            <Upload aria-hidden />
            Import CSV
          </Button>
          <Button variant="primary" onClick={() => setDialog({ item: null })}>
            <Plus aria-hidden />
            Add gear
          </Button>
        </>
      )}
    </>
  );

  let body: ReactNode;
  if (gear.isError) {
    body = (
      <ErrorState
        title="The gear list did not load."
        error={gear.error}
        onRetry={() => void gear.refetch()}
      />
    );
  } else if (gear.isPending) {
    body = <SkeletonRows rows={8} />;
  } else if (all.length === 0) {
    body = (
      <EmptyState
        title="No gear yet"
        description="Add cox boxes, slings, tool kits, and tents. Items marked default load go on every trailer's load list."
        action={canEdit ? actions : undefined}
      />
    );
  } else {
    const filteredEmpty = (
      <EmptyState
        title="No gear matches"
        description="Clear the search or pick another category."
        action={
          <Button
            onClick={() => {
              setSearch('');
              setCategory('all');
            }}
          >
            Clear filters
          </Button>
        }
        className="border-none"
      />
    );
    body = (
      <>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            label="Search gear"
            placeholder="Search name or notes"
          />
          <FilterSelect<GearCategory>
            label="Category"
            value={category}
            onChange={setCategory}
            allLabel="All categories"
            options={CATEGORY_OPTIONS}
            className="w-44"
          />
        </div>
        <p className="text-sm text-ink-2" aria-live="polite">
          {rows.length === all.length
            ? `${all.length} items`
            : `${rows.length} of ${all.length} items`}
          , {defaultLoadCount} on every trailer by default
        </p>
        {wide ? (
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(g) => g.id}
            label="Gear"
            empty={filteredEmpty}
          />
        ) : rows.length === 0 ? (
          filteredEmpty
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Gear">
            {rows.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">
                    {g.name} <span className="text-ink-2 tabular-nums">× {g.quantity}</span>
                  </span>
                  <span className="text-sm text-ink-2">
                    {[GEAR_CATEGORY_LABELS[g.category], g.notes].filter(Boolean).join(' · ')}
                  </span>
                  <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                    <Switch
                      checked={g.defaultLoad}
                      disabled={!canEdit}
                      onCheckedChange={(v) => save(g, { defaultLoad: v })}
                    />
                    Goes on every trailer
                  </label>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${g.name}`}
                    onClick={() => setDialog({ item: g })}
                  >
                    <Pencil aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Fleet"
        description="Shells, oar sets, and gear the club races and trailers."
        actions={all.length > 0 || !canEdit ? actions : undefined}
      >
        {nav}
      </PageHeader>
      {body}
      <GearDialog
        state={dialog}
        onClose={() => setDialog(null)}
        onDelete={(g) => {
          setDialog(null);
          deleteItem(g);
        }}
      />
      <CsvImportDialog<GearInput>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import gear"
        noun={['gear item', 'gear items']}
        fields={GEAR_CSV_FIELDS}
        previewFields={['category', 'name', 'quantity', 'defaultLoad']}
        check={(csvRows) =>
          checkGearRows(csvRows, { teams: [], existingNames: all.map((g) => g.name) })
        }
        onImport={importRecords}
        hint="Columns: category, name, quantity, default_load (yes or no), notes."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

const gearFormSchema = gearItemSchema.omit(BASE_KEYS).extend({
  name: requiredText('Enter a name'),
  quantity: z.number('Enter the quantity').int('Enter a whole number').min(0, 'Enter zero or more'),
});

type GearFormValues = z.infer<typeof gearFormSchema>;

/** Add a gear item, or edit one on a phone. */
function GearDialog({
  state,
  onClose,
  onDelete,
}: {
  state: { item: GearItem | null } | null;
  onClose: () => void;
  onDelete: (g: GearItem) => void;
}) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      {state && (
        <DialogContent title={state.item ? `Edit ${state.item.name}` : 'Add gear'}>
          <GearForm
            key={state.item?.id ?? 'new'}
            item={state.item}
            onDone={onClose}
            onDelete={onDelete}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function GearForm({
  item,
  onDone,
  onDelete,
}: {
  item: GearItem | null;
  onDone: () => void;
  onDelete: (g: GearItem) => void;
}) {
  const id = useId();
  const create = useCreate('gear_items');
  const update = useUpdate('gear_items');
  const form = useForm<GearFormValues>({
    resolver: zodResolver(gearFormSchema),
    defaultValues: item
      ? {
          category: item.category,
          name: item.name,
          quantity: item.quantity,
          defaultLoad: item.defaultLoad,
          notes: item.notes ?? '',
        }
      : { category: 'other', name: '', quantity: 1, defaultLoad: false, notes: '' },
  });
  const errors = form.formState.errors;
  const defaultLoad = useWatch({ control: form.control, name: 'defaultLoad' });

  const onSubmit = form.handleSubmit(async (v) => {
    const values = { ...v, name: v.name.trim(), notes: (v.notes ?? '').trim() };
    try {
      if (item) {
        await update.mutateAsync({ id: item.id, patch: values });
        toast.success('Changes saved');
      } else {
        await create.mutateAsync(values);
        toast.success(`${values.name} added`);
      }
      onDone();
    } catch {
      // The mutation's toast says what went wrong.
    }
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field
          id={`${id}-name`}
          label="Name"
          error={errors.name?.message}
          className="sm:col-span-2"
        >
          <Input
            id={`${id}-name`}
            autoFocus
            placeholder="Cox boxes"
            aria-invalid={!!errors.name || undefined}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            {...form.register('name')}
          />
        </Field>
        <SelectField
          control={form.control}
          name="category"
          id={`${id}-category`}
          label="Category"
          options={CATEGORY_OPTIONS}
        />
        <NumberField
          control={form.control}
          name="quantity"
          id={`${id}-quantity`}
          label="Quantity"
          step="1"
        />
        <div className="flex items-start gap-3 sm:col-span-2">
          <Switch
            id={`${id}-default`}
            checked={defaultLoad}
            onCheckedChange={(v) => form.setValue('defaultLoad', v, { shouldDirty: true })}
            aria-describedby={`${id}-default-hint`}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`${id}-default`}>Default load</Label>
            <p id={`${id}-default-hint`} className="text-sm text-ink-2">
              Goes on every trailer by default, so it is on each regatta&apos;s load list.
            </p>
          </div>
        </div>
        <Field id={`${id}-notes`} label="Notes" className="sm:col-span-2">
          <Textarea id={`${id}-notes`} rows={2} {...form.register('notes')} />
        </Field>
      </div>
      <DialogFooter className="justify-between">
        {item ? (
          <Button variant="ghost" className="text-danger" onClick={() => onDelete(item)}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={create.isPending || update.isPending}>
            {item ? 'Save changes' : 'Add gear'}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}
