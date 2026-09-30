// The page around every print view (PLAN.md §6.12): no app shell, an on-screen toolbar that
// does not print (back, the view's options, Print), and the sheets below it. On screen each
// sheet is a sheet of paper on the page background, in either theme; in print it is the page,
// black on white, with a page break after it (styles/print.css). "Save as PDF" comes from the
// browser's print dialog; there is no PDF library.

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/controls';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, PageSkeleton } from '@/components/states';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';

export interface PrintFrameState {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  notFound?: boolean;
}

export function PrintFrame({
  title,
  backTo,
  controls,
  status,
  actions,
  state,
  children,
}: {
  /** The page's h1 (on screen only; each sheet carries its own heading on paper). */
  title: string;
  /** Where "Back" goes (the page this sheet was printed from). */
  backTo: string;
  /** Options for this view: day, source, layout. */
  controls?: ReactNode;
  /** A short on-screen note next to the options ("1 change since publishing"). */
  status?: ReactNode;
  /** Buttons beside Print ("Export entries"). */
  actions?: ReactNode;
  state?: PrintFrameState;
  children?: ReactNode;
}) {
  let body = children;
  if (state?.notFound) {
    body = (
      <EmptyState
        className="w-full max-w-[210mm] bg-surface"
        title="This regatta does not exist"
        description="It may have been deleted. Go back and pick another."
      />
    );
  } else if (state?.isError) {
    body = (
      <ErrorState className="w-full max-w-[210mm]" error={state.error} onRetry={state.refetch} />
    );
  } else if (state?.isLoading) {
    body = (
      <div className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-8">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-ink print:min-h-0 print:bg-surface">
      <header
        data-print="hide"
        className="z-10 border-b border-line bg-surface sm:sticky sm:top-0 print:hidden"
      >
        <div className="flex items-center gap-3 px-4 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link to={backTo}>
              <ArrowLeft aria-hidden />
              Back
            </Link>
          </Button>
          <h1 className="min-w-0 flex-1 truncate font-display text-md font-semibold">{title}</h1>
          {actions}
          <Button variant="primary" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden />
            Print
          </Button>
        </div>
        {(controls || status) && (
          <div
            role="group"
            aria-label="Print options"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-2"
          >
            {controls}
            {status && <div className="text-sm text-ink-2">{status}</div>}
          </div>
        )}
      </header>
      <main className="flex flex-col items-center gap-6 px-4 py-6 print:block print:p-0">
        {body}
      </main>
    </div>
  );
}

/** One printed page (or run of pages): a page break follows it in print. */
export function PrintSheet({
  label,
  orientation = 'portrait',
  className,
  style,
  children,
}: {
  /** Accessible name of the sheet ("Junior boys lineups, Fri, May 16"). */
  label: string;
  orientation?: 'portrait' | 'landscape';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      data-orientation={orientation}
      style={style}
      className={cn(
        'print-sheet w-full min-w-0 rounded-card border border-line bg-surface p-5 text-ink sm:p-8',
        orientation === 'landscape' ? 'max-w-[297mm]' : 'max-w-[210mm]',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** The top of a sheet: title (with an optional team accent), what and when, and the source. */
export function SheetHeader({
  title,
  subtitle,
  meta,
  accent,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Right side: which version prints and when. */
  meta?: ReactNode;
  /** teamStyle(...) for a thin team-colored rule beside the title. */
  accent?: CSSProperties;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-1 border-b-2 border-ink pb-2">
      <div style={accent} className={cn('min-w-0', accent && 'border-l-4 border-team pl-3')}>
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-base text-ink-2">{subtitle}</p>}
      </div>
      {meta && <div className="text-sm text-ink-2 sm:text-right">{meta}</div>}
    </header>
  );
}

/** Lets a wide table scroll inside its sheet on a phone; on paper it is just the table. */
export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto print:overflow-visible">{children}</div>;
}

/** A labeled option in the toolbar. */
export function ToolbarField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-sm text-ink-2">
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * A search parameter limited to known values. The default value is left out of the URL.
 * Changes replace the history entry, so Back still returns to the page that opened the sheet.
 */
export function useChoiceParam<T extends string>(
  name: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(name);
  const value = raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === fallback) p.delete(name);
          else p.set(name, next);
          return p;
        },
        { replace: true },
      ),
    [name, fallback, setParams],
  );
  return [value, set];
}

/** Day picker: "All days" or one day of the regatta. */
export function DayField({
  days,
  value,
  onChange,
}: {
  days: string[];
  value: string | null;
  onChange: (day: string | null) => void;
}) {
  if (days.length <= 1) return null;
  return (
    <ToolbarField label="Day">
      <Select
        label="Day"
        value={value ?? 'all'}
        onValueChange={(v) => onChange(v === 'all' ? null : v)}
        options={[
          { value: 'all', label: 'All days' },
          ...days.map((d) => ({ value: d, label: formatWeekday(d) })),
        ]}
        className="h-8 min-w-36"
      />
    </ToolbarField>
  );
}

/** Published or live draft. */
export function SourceField({
  value,
  onChange,
}: {
  value: 'published' | 'live';
  onChange: (v: 'published' | 'live') => void;
}) {
  return (
    <ToolbarField label="Version">
      <SegmentedControl
        size="sm"
        label="Version"
        value={value}
        onValueChange={onChange}
        options={[
          { value: 'published', label: 'Published' },
          { value: 'live', label: 'Live draft' },
        ]}
      />
    </ToolbarField>
  );
}

/** The ?day= parameter, checked against the regatta's days. */
export function useDayParam(days: readonly string[]): [string | null, (d: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('day');
  const value = raw && days.includes(raw) ? raw : null;
  const set = useCallback(
    (next: string | null) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set('day', next);
          else p.delete('day');
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [value, set];
}
