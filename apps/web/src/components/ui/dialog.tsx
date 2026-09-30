import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type ContentProps = ComponentProps<typeof DialogPrimitive.Content>;

/**
 * Focus goes back where it came from when a dialog closes. Radix returns it to a
 * DialogTrigger, but most dialogs here open from state (a button, a menu item, a shortcut), so
 * without this, closing one dropped focus to the top of the page.
 */
function useReturnFocus(
  onOpenAutoFocus: ContentProps['onOpenAutoFocus'],
  onCloseAutoFocus: ContentProps['onCloseAutoFocus'],
): Pick<ContentProps, 'onOpenAutoFocus' | 'onCloseAutoFocus'> {
  const returnTo = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (event) => {
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus: (event) => {
      onCloseAutoFocus?.(event);
      const target = returnTo.current;
      if (event.defaultPrevented || !target?.isConnected) return;
      event.preventDefault();
      target.focus();
    },
  };
}

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
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ContentProps & { title: string; description?: ReactNode }) {
  const focus = useReturnFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
    <DialogPrimitive.Portal>
      <Overlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface p-5 shadow-popover',
          className,
        )}
        {...props}
        {...focus}
      >
        <div className="flex flex-col gap-1 pr-8">
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
        {children}
        {/* Last in the tab order, so opening a dialog puts focus on its first field. */}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-control text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:top-2.5 pointer-coarse:right-2.5 pointer-coarse:size-11"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
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
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ContentProps & {
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
  const focus = useReturnFocus(onOpenAutoFocus, onCloseAutoFocus);
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
        {...focus}
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
