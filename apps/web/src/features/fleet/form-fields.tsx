// Form controls for the fleet drawers, wired to react-hook-form: numbers that may be blank
// (blank means "use the class default" or "unknown"), selects with a "not set" choice, and a
// save-only-what-changed patch.

import type { ReactNode } from 'react';
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
  type PathValue,
} from 'react-hook-form';
import { cn } from '@/lib/cn';
import { Field, Input } from '@/components/ui/input';
import { Select, type SelectOption } from '@/components/ui/select';

const NOT_SET = '__none';

/** A number input whose empty state is null; `placeholder` shows the default it falls back to. */
export function NumberField<T extends FieldValues>({
  control,
  name,
  id,
  label,
  placeholder,
  hint,
  step = 'any',
  className,
  after,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  id: string;
  label: string;
  placeholder?: string;
  hint?: string;
  step?: string;
  className?: string;
  /** Rendered under the input (a "Reset" button). */
  after?: ReactNode;
}) {
  const {
    field: { value, onChange, onBlur, ref: inputRef },
    fieldState,
  } = useController({ control, name });
  const error = fieldState.error?.message;
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={step}
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? null : Number(raw));
        }}
        onBlur={onBlur}
        ref={inputRef}
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="tabular-nums"
      />
      {after}
    </Field>
  );
}

/** A select bound to a form field. With `notSet`, a first option stores null. */
export function SelectField<T extends FieldValues, V extends string>({
  control,
  name,
  id,
  label,
  options,
  notSet,
  hint,
  className,
  onValueChange,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  id: string;
  label: string;
  options: SelectOption<V>[];
  /** Label of the option that clears the field ("Not set", "No home team"). */
  notSet?: string;
  hint?: string;
  className?: string;
  /** Replaces the default field update (class changes that move other fields too). */
  onValueChange?: (value: V | null) => void;
}) {
  const { field, fieldState } = useController({ control, name });
  const error = fieldState.error?.message;
  const value = (field.value as V | null | undefined) ?? (notSet ? NOT_SET : '');
  return (
    <Field id={id} label={label} hint={hint} error={error} className={className}>
      <Select<V | typeof NOT_SET>
        id={id}
        value={value}
        onValueChange={(v) => {
          const next = v === NOT_SET ? null : (v as V);
          if (onValueChange) onValueChange(next);
          else field.onChange(next as PathValue<T, FieldPath<T>>);
        }}
        options={[
          ...(notSet ? [{ value: NOT_SET as typeof NOT_SET, label: notSet }] : []),
          ...options,
        ]}
        className={cn('w-full', error && 'border-danger')}
      />
    </Field>
  );
}

function same(a: unknown, b: unknown): boolean {
  const empty = (v: unknown) => v === null || v === undefined || v === '';
  if (empty(a) && empty(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/** Only the fields that differ from the saved record (so the activity log says what changed). */
export function changedFields<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (!same(before[k], after[k])) out[k] = after[k];
  }
  return out;
}
