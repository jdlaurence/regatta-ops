import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface ComboboxOption<V extends string = string> {
  value: V;
  /** Text used for filtering and for the accessible name. */
  label: string;
  /** Extra words that match the search (full name, nickname, color code). */
  keywords?: string[];
  /** Optional group heading ("Compatible", "Other shells"). Options keep their given order. */
  group?: string;
  disabled?: boolean;
  /** Rich row content; defaults to the label. */
  render?: ReactNode;
  /** A second line under the label (conflict hint, weight class). */
  hint?: ReactNode;
}

export interface ComboboxProps<V extends string = string> {
  options: ComboboxOption<V>[];
  value: V | null;
  onValueChange: (value: V | null) => void;
  /** Accessible name for the trigger ("Shell", "Seat 3"). */
  label: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Adds a "None" row that clears the value. */
  clearable?: boolean | string;
  /** Rendered below the list, e.g. a "Show all shells" toggle. */
  footer?: ReactNode;
  /** Custom trigger content; defaults to the selected option's label. */
  renderValue?: (option: ComboboxOption<V> | null) => ReactNode;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  /** Controlled open state (the lineup builder opens a seat picker from the keyboard). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-fill the search box when opening (typing a name on a focused seat). */
  initialQuery?: string;
  /** Render the trigger yourself (a seat, a chip); Radix merges the trigger props into it. */
  trigger?: ReactNode;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function filterOptions<V extends string>(
  options: ComboboxOption<V>[],
  query: string,
): ComboboxOption<V>[] {
  const q = normalize(query.trim());
  if (!q) return options;
  const words = q.split(/\s+/);
  return options.filter((o) => {
    const hay = normalize([o.label, ...(o.keywords ?? [])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/**
 * A searchable single-select: a button that opens a popover with a search box and a listbox.
 * Keyboard: type to filter, arrows to move, Enter to pick, Escape to close.
 */
export function Combobox<V extends string = string>({
  options,
  value,
  onValueChange,
  label,
  placeholder = 'Choose…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  clearable,
  footer,
  renderValue,
  disabled,
  className,
  contentClassName,
  open: openProp,
  onOpenChange,
  initialQuery = '',
  trigger,
}: ComboboxProps<V>) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const setOpen = (next: boolean) => {
    if (next) {
      setQuery(initialQuery);
      setActive(0);
    }
    setOpenState(next);
    onOpenChange?.(next);
  };

  const selected = options.find((o) => o.value === value) ?? null;
  const clearLabel = typeof clearable === 'string' ? clearable : 'None';

  const rows = useMemo(() => {
    const filtered = filterOptions(options, query);
    const list: (ComboboxOption<V> | { value: null; label: string; clear: true })[] = [];
    if (clearable && !query) list.push({ value: null, label: clearLabel, clear: true });
    list.push(...filtered);
    return list;
  }, [options, query, clearable, clearLabel]);

  const selectable = rows.filter((r) => !('disabled' in r && r.disabled));

  const choose = (v: V | null) => {
    onValueChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, selectable.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = selectable[active];
      if (row) choose(row.value as V | null);
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(Math.max(selectable.length - 1, 0));
    }
  };

  const activeRow = selectable[active];
  const optionId = (i: number) => `${listId}-opt-${i}`;
  let lastGroup: string | undefined;

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            aria-label={`${label}: ${selected?.label ?? placeholder}`}
            className={cn(
              'inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 text-left text-base text-ink hover:bg-surface-2 disabled:opacity-50 pointer-coarse:h-11',
              className,
            )}
          >
            <span className={cn('min-w-0 truncate', !selected && 'text-ink-2')}>
              {renderValue ? renderValue(selected) : (selected?.label ?? placeholder)}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-ink-2" aria-hidden />
          </button>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'z-50 flex max-h-[min(420px,var(--radix-popover-content-available-height))] w-[max(280px,var(--radix-popover-trigger-width))] flex-col overflow-hidden rounded-card border border-line bg-surface text-ink shadow-popover',
            contentClassName,
          )}
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 shrink-0 text-ink-2" aria-hidden />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeRow ? optionId(active) : undefined}
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              className="h-10 w-full bg-transparent text-base outline-none placeholder:text-ink-2"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            className="min-h-0 flex-1 overflow-y-auto p-1"
          >
            {selectable.length === 0 && rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-2">{emptyText}</p>
            ) : (
              rows.map((row) => {
                const isClear = 'clear' in row;
                const opt = isClear ? null : (row as ComboboxOption<V>);
                const index = selectable.indexOf(row);
                const isActive = index === active && index >= 0;
                const isSelected = isClear ? value === null : opt!.value === value;
                const heading = opt?.group && opt.group !== lastGroup ? opt.group : undefined;
                if (opt?.group) lastGroup = opt.group;
                return (
                  <div key={isClear ? '__clear' : opt!.value}>
                    {heading && (
                      <div className="px-2 pt-2 pb-1 text-xs font-medium text-ink-2">{heading}</div>
                    )}
                    <div
                      id={index >= 0 ? optionId(index) : undefined}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt?.disabled || undefined}
                      onMouseMove={() => index >= 0 && setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => !opt?.disabled && choose(isClear ? null : opt!.value)}
                      className={cn(
                        'flex cursor-default items-start gap-2 rounded-control px-2 py-1.5 text-base pointer-coarse:py-2.5',
                        isActive && 'bg-surface-2',
                        opt?.disabled && 'opacity-50',
                        isClear && 'text-ink-2',
                      )}
                    >
                      <Check
                        className={cn(
                          'mt-0.5 size-4 shrink-0 text-accent',
                          !isSelected && 'invisible',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{opt?.render ?? row.label}</div>
                        {opt?.hint && <div className="mt-0.5 text-sm text-ink-2">{opt.hint}</div>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {rows.length > 0 && selectable.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-ink-2">{emptyText}</p>
            )}
          </div>
          {footer && <div className="border-t border-line p-2">{footer}</div>}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
