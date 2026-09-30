import type { ComponentProps, ReactNode } from 'react';
import { Select as SelectPrimitive, Tabs as TabsPrimitive } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectOption<V extends string = string> {
  value: V;
  label: ReactNode;
  disabled?: boolean;
}

/**
 * A native-feeling single select for short, fixed lists (status, side, program, class).
 * For long or searchable lists use Combobox.
 */
export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  label,
  placeholder = 'Choose…',
  disabled,
  className,
  id,
}: {
  value: V | '' | null | undefined;
  onValueChange: (value: V) => void;
  options: SelectOption<V>[];
  /** Accessible name when there's no visible <Label htmlFor>. */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <SelectPrimitive.Root
      value={value || undefined}
      onValueChange={(v) => onValueChange(v as V)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={label}
        className={cn(
          'inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-control border border-line-strong bg-surface px-3 text-base text-ink hover:bg-surface-2 disabled:opacity-50 data-[placeholder]:text-ink-2 pointer-coarse:h-11',
          className,
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-ink-2" aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-line bg-surface text-ink shadow-popover"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default items-center rounded-control py-1.5 pr-2 pl-7 text-base outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent focus-visible:outline-solid data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 pointer-coarse:py-2.5"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex">
                  <Check className="size-4 text-accent" aria-hidden />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

// Tabs ------------------------------------------------------------------------

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-1 border-b border-line', className)}
      {...props}
    />
  );
}

/** An underlined tab. Sentence case labels. */
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex h-9 items-center gap-1.5 border-b-2 border-transparent px-3 text-base font-medium text-ink-2 hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink pointer-coarse:h-11 [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
