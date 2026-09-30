// A box that scrolls its content (a wide table on a phone, a long preview in a dialog). While
// the content overflows, the box is a labelled, focusable group so keyboard users can scroll it
// with the arrow keys (PLAN.md §5.6; WCAG 2.1.1). When everything fits it is a plain div with no
// extra tab stop. A group rather than a region: the section around it usually is the landmark.

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { cn } from '@/lib/cn';

function overflows(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

/** Whether the element's content is larger than its box, kept current as either resizes. */
export function useOverflowing<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflowing(overflows(el));
    check();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, []);
  return [ref, overflowing] as const;
}

export function ScrollRegion({
  label,
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  /** What the region holds, read when it takes focus: "Shelves", "Lineup grid". */
  label: string;
}) {
  const [ref, overflowing] = useOverflowing<HTMLDivElement>();
  return (
    <div
      ref={ref}
      {...(overflowing ? { tabIndex: 0, role: 'group', 'aria-label': label } : {})}
      {...props}
      // Positioned, so screen-reader-only text (absolute) inside a wide table is clipped with
      // it instead of stretching the page sideways.
      className={cn('relative', className)}
    >
      {children}
    </div>
  );
}
