// Inputs for the trailer editor. Number inputs keep what was typed while it is not yet a number
// ("", "1.") and report null for blank and NaN for anything else, so the draft (and the live
// diagram) follows every keystroke and validation can say what is wrong.

import { useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Input } from '@/components/ui/input';
import type { NumberValue } from './draft';

export function parseNumber(text: string): NumberValue {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatNumber(v: NumberValue): string {
  return v === null || Number.isNaN(v) ? '' : String(v);
}

function sameNumber(a: NumberValue, b: NumberValue): boolean {
  if (a === null || b === null) return a === b;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

export function NumberInput({
  value,
  onValueChange,
  error,
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: NumberValue;
  onValueChange: (value: NumberValue) => void;
  /** Error message: marks the input invalid and becomes its title. */
  error?: string;
}) {
  const [text, setText] = useState(() => formatNumber(value));
  const [seen, setSeen] = useState<NumberValue>(value);
  // Follow outside changes (discard, reset) without clobbering what is being typed.
  if (!sameNumber(seen, value)) {
    setSeen(value);
    if (!sameNumber(parseNumber(text), value)) setText(formatNumber(value));
  }
  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={error ? true : undefined}
      title={error}
      onChange={(e) => {
        const next = parseNumber(e.target.value);
        setText(e.target.value);
        setSeen(next);
        onValueChange(next);
      }}
      className={cn('tabular-nums', className)}
      {...rest}
    />
  );
}

/** A value shown as text where an input would be, for people who cannot edit. */
export function ReadValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn('text-base text-ink tabular-nums', className)}>{children}</span>;
}
