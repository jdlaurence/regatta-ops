// Spreadsheet-style cells for the roster table: quiet until hovered or focused, saved on
// Enter or when focus leaves, Escape puts the old value back. Give each one a `key` built from
// the stored value so a change from elsewhere (realtime, the drawer) replaces the draft.

import { useState, type KeyboardEvent } from 'react';
import { toast } from '@/components/toast';
import { Checkbox } from '@/components/ui/controls';
import { Select, type SelectOption } from '@/components/ui/select';
import { cn } from '@/lib/cn';

const ghost =
  'h-8 w-full min-w-0 rounded-control border border-transparent bg-transparent px-2 text-base hover:border-line-strong focus:border-accent focus:bg-surface pointer-coarse:h-11';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function InlineInput<T>({
  value,
  label,
  parse,
  onCommit,
  inputMode,
  maxLength,
  placeholder,
  className,
}: {
  /** The value as shown. */
  value: string;
  /** Accessible name: "Weight for Ava Chen". */
  label: string;
  /** Turn the typed text into the value to save, or explain what is wrong. */
  parse: (text: string) => ParseResult<T>;
  onCommit: (value: T) => void;
  inputMode?: 'numeric' | 'decimal' | 'text';
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (draft.trim() === value.trim()) {
      setError(null);
      return;
    }
    const result = parse(draft);
    if (!result.ok) {
      setError(result.error);
      toast.error(`${result.error}.`);
      return;
    }
    setError(null);
    onCommit(result.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setDraft(value);
      setError(null);
    }
  };

  return (
    <input
      type="text"
      aria-label={label}
      value={draft}
      inputMode={inputMode}
      maxLength={maxLength}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      aria-invalid={error ? true : undefined}
      title={error ?? undefined}
      className={cn(
        ghost,
        'placeholder:text-ink-2/70 aria-invalid:border-danger aria-invalid:bg-danger-tint',
        className,
      )}
    />
  );
}

export function InlineSelect<V extends string>({
  value,
  label,
  options,
  onChange,
  className,
}: {
  value: V;
  label: string;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      label={label}
      options={options}
      onValueChange={(v) => v !== value && onChange(v)}
      className={cn(
        ghost,
        'justify-between gap-1 hover:bg-transparent [&_svg]:opacity-60',
        className,
      )}
    />
  );
}

export function InlineCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  // The 20 px box sits in a 36 px (44 px on touch) target.
  return (
    <label className="-m-2 inline-flex size-9 cursor-pointer items-center justify-center pointer-coarse:size-11">
      <Checkbox
        checked={checked}
        aria-label={label}
        onCheckedChange={(v) => onChange(v === true)}
      />
    </label>
  );
}
