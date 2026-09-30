import type { ComponentProps, ReactNode } from 'react';
import {
  Checkbox as CheckboxPrimitive,
  Separator as SeparatorPrimitive,
  Switch as SwitchPrimitive,
  ToggleGroup,
} from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        'bg-line',
        className,
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'group inline-flex size-5 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-ink disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
        <Check
          className="size-3.5 group-data-[state=indeterminate]:hidden"
          strokeWidth={3}
          aria-hidden
        />
        {/* Some rows selected ("select all" in a table). */}
        <Minus
          className="hidden size-3.5 group-data-[state=indeterminate]:block"
          strokeWidth={3}
          aria-hidden
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/** On/off toggle. The track is a control, not a boat, so it keeps the control radius. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-control border border-line-strong bg-surface-2 transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 translate-x-0.5 rounded-[4px] bg-ink-2 transition-transform data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-ink" />
    </SwitchPrimitive.Root>
  );
}

/** A row of mutually exclusive options ("List | Timeline", "Light | Dark | System"). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  size = 'md',
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  /** Accessible name for the group. */
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-control border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        // Nested radius: the control radius minus the 2 px inset.
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-[4px] px-2.5 font-medium text-ink-2 hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink [&_svg]:size-4',
            size === 'sm' ? 'h-7 text-sm pointer-coarse:h-10' : 'h-8 text-base pointer-coarse:h-10',
          )}
        >
          {o.icon}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
