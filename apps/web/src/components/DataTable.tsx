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
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={table.getAllLeafColumns().length} className="px-3 py-8">
                {empty ?? <p className="text-center text-ink-2">Nothing to show.</p>}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
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
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
