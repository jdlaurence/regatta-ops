import type { ComponentProps, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

function Overlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-scrim', className)} {...props} />
  );
}

/** A centered dialog for short forms and confirmations. */
export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { title: string; description?: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-popover',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <DialogPrimitive.Title className="font-display text-lg font-semibold">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-base leading-prose text-ink-2">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="-m-1 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:size-11"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap justify-end gap-2', className)} {...props} />;
}

/**
 * A panel that slides in from an edge: the right on tablet and desktop, the bottom on phones
 * (the phone lineup builder's tap-to-edit seat sheet, §5.3).
 */
export function SheetContent({
  side = 'right',
  className,
  children,
  title,
  description,
  hideHeader = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  side?: 'right' | 'bottom' | 'left';
  title: string;
  description?: ReactNode;
  /** Keep the title for screen readers only (content brings its own header). */
  hideHeader?: boolean;
}) {
  const position = {
    right: 'inset-y-0 right-0 h-dvh w-[min(100vw,360px)] border-l',
    left: 'inset-y-0 left-0 h-dvh w-[min(100vw,300px)] border-r',
    bottom: 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-card border-t',
  }[side];
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col overflow-y-auto border-line bg-surface shadow-popover',
          position,
          className,
        )}
        {...props}
      >
        {hideHeader ? (
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        ) : (
          <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
            <DialogPrimitive.Title className="font-display text-md font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-9 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:size-11"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>
        )}
        <DialogPrimitive.Description className={description ? 'px-4 pt-3 text-ink-2' : 'sr-only'}>
          {description ?? title}
        </DialogPrimitive.Description>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
