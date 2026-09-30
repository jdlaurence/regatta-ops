import type { ComponentProps } from 'react';
import {
  DropdownMenu as Menu,
  Popover as PopoverPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import { cn } from '@/lib/cn';

// Dropdown menu -------------------------------------------------------------

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuRadioGroup = Menu.RadioGroup;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 overflow-hidden rounded-card border border-line bg-surface p-1 text-ink shadow-popover',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

// Keyboard focus draws the app's 2 px accent ring, inset so the menu's edge does not clip it;
// the pointer only tints the row.
const itemClass =
  'relative flex h-9 cursor-pointer items-center gap-2 rounded-control px-2 text-base outline-none select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent focus-visible:outline-solid data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 pointer-coarse:h-11 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2';

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, 'pl-7', className)} {...props}>
      <Menu.ItemIndicator className="absolute left-2 inline-flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-accent" />
      </Menu.ItemIndicator>
      {children}
    </Menu.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('px-2 py-1.5 text-sm text-ink-2', className)} {...props} />;
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />;
}

// Popover ---------------------------------------------------------------------

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 w-72 rounded-card border border-line bg-surface p-3 text-ink shadow-popover',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// Tooltip ---------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider;

/** A short label on hover or focus. Not for anything a touch user must read. */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-control bg-ink px-2 py-1 text-sm text-bg"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
