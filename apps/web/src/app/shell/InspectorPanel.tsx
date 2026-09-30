import { useEffect } from 'react';
import { PanelRight, PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  useInspector,
  useInspectorClaimed,
  useInspectorStore,
  useInspectorTitle,
} from '@/components/Inspector';
import { DefaultInspector } from './DefaultInspector';

const DEFAULT_TITLE = 'Conflicts and activity';

/** Keep the inspector store's idea of "desktop" in step with the viewport (≥ 1024 px). */
export function useDesktopSync() {
  const setDesktop = useInspectorStore((s) => s.setDesktop);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [setDesktop]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.getAttribute('role') === 'combobox'
  );
}

/** `]` toggles the inspector (PLAN.md §5.3); Escape closes the slide-over. */
export function useInspectorShortcut(available: boolean) {
  const { open, toggle, setOpen } = useInspector();
  const isDesktop = useInspectorStore((s) => s.isDesktop);
  useEffect(() => {
    if (!available) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ']' && !isTyping(e.target)) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && open && !isDesktop) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [available, open, isDesktop, toggle, setOpen]);
}

/** The button that shows and hides the inspector. */
export function InspectorToggle({ className }: { className?: string }) {
  const { open, toggle } = useInspector();
  const isDesktop = useInspectorStore((s) => s.isDesktop);
  const title = useInspectorTitle() ?? DEFAULT_TITLE;
  const label = `${open ? 'Hide' : 'Show'} ${title.toLowerCase()}`;
  // With the column open on desktop, its own header carries the hide button.
  if (open && isDesktop) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={open}
      aria-keyshortcuts="]"
      aria-label={label}
      title={`${label} (])`}
      className={className}
    >
      {open ? <PanelRightClose aria-hidden /> : <PanelRight aria-hidden />}
    </Button>
  );
}

/**
 * The right-hand panel: a 336 px column on desktop, a slide-over below 1024 px. Its slot is
 * always in the DOM so <Inspector> portals keep their content while it is hidden.
 */
export function InspectorPanel({
  regattaId,
  available,
}: {
  regattaId: string | null;
  available: boolean;
}) {
  const { open, setOpen } = useInspector();
  const isDesktop = useInspectorStore((s) => s.isDesktop);
  const setSlot = useInspectorStore((s) => s.setSlot);
  const claimed = useInspectorClaimed();
  const title = useInspectorTitle() ?? DEFAULT_TITLE;
  const visible = available && open;

  return (
    <>
      {visible && !isDesktop && (
        <button
          type="button"
          aria-label="Close panel"
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 cursor-default bg-scrim lg:hidden"
        />
      )}
      <aside
        aria-label={title}
        data-state={visible ? 'open' : 'closed'}
        className={cn(
          visible ? 'flex' : 'hidden',
          'fixed inset-y-0 right-0 z-40 w-[min(100vw,360px)] flex-col border-l border-line bg-surface shadow-popover',
          'lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-[336px] lg:shrink-0 lg:shadow-none',
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line pr-2 pl-4">
          <h2 className="truncate text-md font-medium">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label={`Hide ${title.toLowerCase()}`}
            title="Hide (])"
          >
            <PanelRightClose aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div ref={setSlot} className="contents" />
          {!claimed && regattaId && <DefaultInspector regattaId={regattaId} />}
        </div>
      </aside>
    </>
  );
}
