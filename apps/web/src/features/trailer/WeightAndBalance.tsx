// Under the drawing, folded under its "Weight and balance" heading and closed when the page
// opens: weight per side with the balance tolerance, overhang per level, the layout's warnings,
// and how many boats are still to load. The heading shows the warning count so a closed section
// still says there is something to read.

import { useId, useState } from 'react';
import { ChevronDown, Scale, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { overhangText, type MetricsSummary } from './lib';

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

export function WeightAndBalance({
  metrics,
  toLoad,
  placed,
}: {
  metrics: MetricsSummary;
  /** Boats on no trailer yet (all trailers). */
  toLoad: number;
  /** Boats on this trailer. */
  placed: number;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const m = metrics;
  const total = m.leftKg + m.rightKg;
  return (
    <section
      aria-labelledby={titleId}
      className="-mb-3 flex flex-col border-t border-line sm:-mb-4"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left"
        >
          <span id={titleId} className="font-display text-md font-semibold">
            Weight and balance
          </span>{' '}
          <span className="flex items-center gap-2 text-sm text-ink-2">
            {m.warnings.length > 0 && (
              <span className="flex items-center gap-1.5">
                <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
                {m.warnings.length} {m.warnings.length === 1 ? 'warning' : 'warnings'}
              </span>
            )}
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </span>
        </button>
      </h2>
      {open && (
        <div className="flex flex-col gap-3 pt-1 pb-3 sm:pb-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-base @lg:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-ink-2">{capitalize(m.leftName)}</dt>
              <dd className="font-display text-md font-semibold tabular-nums">
                {Math.round(m.leftKg)} kg
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-ink-2">{capitalize(m.rightName)}</dt>
              <dd className="font-display text-md font-semibold tabular-nums">
                {Math.round(m.rightKg)} kg
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-ink-2">Balance</dt>
              <dd
                className={cn(
                  'flex items-center gap-1.5 tabular-nums',
                  total > 0 && !m.withinTolerance ? 'text-warn' : 'text-ink',
                )}
              >
                <Scale aria-hidden className="size-4 shrink-0" />
                {total === 0
                  ? 'No boats yet'
                  : `${m.balancePct}% apart${m.tolerancePct !== null ? ` (tolerance ${m.tolerancePct}%)` : ''}`}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-ink-2">Boats</dt>
              <dd className="tabular-nums">
                {placed} on this trailer
                {toLoad > 0 && <span className="text-warn"> · {toLoad} to load</span>}
              </dd>
            </div>
          </dl>
          {m.tiers.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-ink-2">Overhang</h3>
              <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums">
                {m.tiers.map((t) => (
                  <li key={t.tier} className={cn(t.needsFlag ? 'text-warn' : 'text-ink')}>
                    <span className="font-medium">{t.label}</span>{' '}
                    <span className={t.needsFlag ? '' : 'text-ink-2'}>{overhangText(t)}</span>
                    {t.needsFlag && <span className="sr-only">, needs a flag</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {m.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-ink" aria-label="Warnings">
              {m.warnings.map((w) => (
                <li key={w} className="flex items-start gap-1.5">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
