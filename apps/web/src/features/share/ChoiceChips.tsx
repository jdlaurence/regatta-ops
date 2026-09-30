import type { ReactNode } from 'react';
import { ToggleGroup } from 'radix-ui';
import { cn } from '@/lib/cn';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
}

/**
 * A wrapping row of mutually exclusive choices (days, teams, grouping) sized for thumbs: 44 px
 * on touch screens. Arrow keys move between choices; the selected one is outlined in the accent
 * and filled with its tint. Screen readers get a radio group.
 */
export function ChoiceChips<T extends string>({
  label,
  value,
  onValueChange,
  choices,
  className,
}: {
  /** Accessible name of the group ("Day", "Team"). */
  label: string;
  value: T;
  onValueChange: (value: T) => void;
  choices: Choice<T>[];
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {choices.map((c) => (
        <ToggleGroup.Item
          key={c.value}
          value={c.value}
          aria-label={c.ariaLabel}
          className={cn(
            'inline-flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 text-base font-medium text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11 pointer-coarse:px-4',
            'data-[state=on]:border-accent data-[state=on]:bg-accent-tint data-[state=on]:text-ink',
          )}
        >
          {c.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
