import { useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type Row,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Checkbox } from '@/components/ui/controls';

export type { ColumnDef } from '@tanstack/react-table';

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  /** Stable row id (the record id). */
  getRowId: (row: T) => string;
  /** Free-text filter applied across all columns that allow it. */
  globalFilter?: string;
  /** Accessible table name. */
  label: string;
  initialSorting?: SortingState;
  onRowClick?: (row: T) => void;
  /** Highlight a row (the one open in the drawer). */
  activeRowId?: string | null;
  /** Show selection checkboxes and report the selected ids (bulk actions). */
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  /** Dim a row (inactive athletes, retired shells). */
  isMuted?: (row: T) => boolean;
  empty?: ReactNode;
  className?: string;
  /** Extra classes per row. */
  rowClassName?: (row: Row<T>) => string | undefined;
  /**
   * Split the rows into labelled groups (the roster by level). Sorting applies inside each
   * group; groups follow `groupOrder`, then first appearance.
   */
  groupBy?: (row: T) => string;
  groupOrder?: readonly string[];
  /** The heading row of a group: "Experienced · 18". */
  groupLabel?: (key: string, count: number) => ReactNode;
  /** Controlled selection (the ids of the selected rows); pair with onSelectionChange. */
  selectedIds?: readonly string[];
}

/**
 * A plain, dense table on TanStack Table: sortable headers, a global filter, optional row
 * selection, sticky header. Rows stretch full width (PLAN.md §5.3). Inline editing is done by
 * rendering inputs in cells.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  globalFilter,
  label,
  initialSorting = [],
  onRowClick,
  activeRowId,
  selectable,
  onSelectionChange,
  isMuted,
  empty,
  className,
  rowClassName,
  groupBy,
  groupOrder,
  groupLabel,
  selectedIds,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [ownSelection, setRowSelection] = useState<RowSelectionState>({});
  const rowSelection: RowSelectionState = selectedIds
    ? Object.fromEntries(selectedIds.map((id) => [id, true]))
    : ownSelection;

  const selectColumn: ColumnDef<T, unknown> = {
    id: '__select',
    enableSorting: false,
    enableGlobalFilter: false,
    size: 40,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows"
        checked={
          table.getIsAllRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(v) => table.toggleAllRowsSelected(v === true)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="Select row"
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(v === true)}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  };

  // TanStack Table returns unstable functions by design; the React Compiler skips this component.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: selectable ? [selectColumn, ...columns] : columns,
    getRowId,
    state: { sorting, globalFilter, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: (updater) => {
      if (selectedIds) {
        const next = typeof updater === 'function' ? updater(rowSelection) : updater;
        onSelectionChange?.(Object.keys(next).filter((k) => next[k]));
        return;
      }
      setRowSelection((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        onSelectionChange?.(Object.keys(next).filter((k) => next[k]));
        return next;
      });
    },
    enableRowSelection: !!selectable,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;

  const renderRow = (row: Row<T>) => (
    <tr
      key={row.id}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
      aria-selected={activeRowId === row.id || undefined}
      className={cn(
        'border-b border-line last:border-b-0 hover:bg-surface-2',
        onRowClick && 'cursor-pointer',
        activeRowId === row.id && 'bg-accent-tint hover:bg-accent-tint',
        isMuted?.(row.original) && 'text-ink-2',
        rowClassName?.(row),
      )}
    >
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="h-10 px-3 align-middle pointer-coarse:h-12">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );

  return (
    <div className={cn('overflow-x-auto rounded-card border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-base" aria-label={label}>
        <thead className="sticky top-0 z-10 bg-surface">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-line">
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const dir = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : undefined
                    }
                    className="h-9 px-3 text-left text-sm font-medium whitespace-nowrap text-ink-2"
                    style={header.column.columnDef.size ? { width: header.getSize() } : undefined}
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-mx-1 inline-flex items-center gap-1 rounded-control px-1 hover:text-ink"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {dir === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : dir === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        {rows.length === 0 ? (
          <tbody>
            <tr>
              <td colSpan={table.getAllLeafColumns().length} className="px-3 py-8">
                {empty ?? <p className="text-center text-ink-2">Nothing to show.</p>}
              </td>
            </tr>
          </tbody>
        ) : groupBy ? (
          groupRows(rows, groupBy, groupOrder).map((g) => (
            <tbody key={g.key}>
              <tr className="border-y border-line bg-bg">
                <th
                  scope="rowgroup"
                  colSpan={table.getAllLeafColumns().length}
                  className="h-8 px-3 text-left text-sm font-medium text-ink-2"
                >
                  {groupLabel ? groupLabel(g.key, g.rows.length) : g.key}
                </th>
              </tr>
              {g.rows.map(renderRow)}
            </tbody>
          ))
        ) : (
          <tbody>{rows.map(renderRow)}</tbody>
        )}
      </table>
    </div>
  );
}

/** Rows split by group key: listed groups first in order, then the rest as they appear. */
function groupRows<T>(
  rows: Row<T>[],
  groupBy: (row: T) => string,
  order: readonly string[] = [],
): { key: string; rows: Row<T>[] }[] {
  const map = new Map<string, Row<T>[]>();
  for (const key of order) map.set(key, []);
  for (const row of rows) {
    const key = groupBy(row.original);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return [...map].filter(([, list]) => list.length > 0).map(([key, list]) => ({ key, rows: list }));
}
