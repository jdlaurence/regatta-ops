// Regattas list (PLAN.md §6.1): upcoming regattas first as cards with dates, place, teams,
// conflicts, and load plan status; past ones collapsed; archived ones behind a toggle.
// "New regatta" opens a short form and lands on the new regatta's overview.

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Archive, ChevronDown, Lock, Plus } from 'lucide-react';
import type { Regatta } from '@regatta-ops/domain';
import { useCan, useFindings, useList } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { formatDayRange, splitRegattas, todayIn } from '@/lib/dates';
import { TeamChip } from '@/components/chips';
import { ConflictBadge } from '@/components/ConflictBadge';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, Skeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { dayDelta } from './duplicate';
import { NewRegattaDialog } from './NewRegattaDialog';
import { FORMAT_LABELS } from './regatta-form';
import { loadStatusText, regattaSummary } from './summary';

/** "Today", "Tomorrow", "In 19 days", "Racing now" for a regatta that has not ended. */
export function whenText(r: Pick<Regatta, 'startDate' | 'endDate'>, today: string): string {
  const start = dayDelta(today, r.startDate);
  if (start > 1) return `In ${start} days`;
  if (start === 1) return 'Tomorrow';
  if (start === 0) return 'Today';
  return 'Racing now';
}

function StatusTag({ status }: { status: Regatta['status'] }) {
  if (status === 'planning') return null;
  const Icon = status === 'final' ? Lock : Archive;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-control border border-line px-1.5 text-sm text-ink-2">
      <Icon aria-hidden className="size-3.5" />
      {status === 'final' ? 'Final' : 'Archived'}
    </span>
  );
}

function RegattaStats({ regattaId }: { regattaId: string }) {
  const { findings, workingSet, isLoading, isError, refetch } = useFindings(regattaId);
  if (isError) {
    return (
      <button
        type="button"
        onClick={refetch}
        className="relative z-10 self-start text-sm text-danger hover:underline pointer-coarse:min-h-11"
      >
        Counts did not load. Try again.
      </button>
    );
  }
  if (isLoading || !workingSet) {
    return (
      <div className="flex flex-col gap-2" role="status" aria-label="Loading counts">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-5 w-72" />
      </div>
    );
  }
  const s = regattaSummary(workingSet, findings);
  return (
    <div className="flex flex-col gap-2.5">
      {s.teams.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Teams">
          {s.teams.map((t) => (
            <li key={t.id}>
              <TeamChip team={t} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No teams yet</p>
      )}
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-2">
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">Conflicts</dt>
          <dd className="flex items-center gap-1">
            {findings.length === 0
              ? 'No conflicts'
              : (['error', 'warning', 'info'] as const).map((sev) =>
                  s.counts[sev] > 0 ? (
                    <ConflictBadge key={sev} severity={sev} count={s.counts[sev]} />
                  ) : null,
                )}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Entries</dt>
          <dd className="text-ink tabular-nums">{s.entries}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Load plan</dt>
          <dd className={cn('tabular-nums', s.load.state !== 'none' && 'text-ink')}>
            {s.load.state === 'none' ? 'None yet' : loadStatusText(s.load)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function RegattaCard({ regatta, today }: { regatta: Regatta; today: string }) {
  const place = [regatta.venue, regatta.city].filter(Boolean).join(', ');
  const upcoming = (regatta.endDate || regatta.startDate) >= today;
  return (
    // The title link covers the card (its ::after), so the whole card is one tap target.
    <li className="relative flex flex-col gap-3 rounded-card border border-line bg-surface p-4 hover:border-line-strong">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-lg font-semibold">
            <Link
              to={regattaPath(regatta.id)}
              className="rounded-control after:absolute after:inset-0 after:rounded-card hover:underline"
            >
              {regatta.name}
            </Link>
          </h3>
          <p className="text-base text-ink-2 tabular-nums">
            {formatDayRange(regatta.startDate, regatta.endDate)}
            {place && ` · ${place}`}
            {` · ${FORMAT_LABELS[regatta.format]}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {upcoming && regatta.status !== 'archived' && (
            <span className="text-sm text-ink-2 tabular-nums">{whenText(regatta, today)}</span>
          )}
          <StatusTag status={regatta.status} />
        </div>
      </div>
      <RegattaStats regattaId={regatta.id} />
    </li>
  );
}

function Disclosure({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-3">
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mx-2 flex h-9 items-center gap-1.5 rounded-control px-2 font-display text-lg font-semibold hover:bg-surface-2 pointer-coarse:h-11"
        >
          <ChevronDown
            aria-hidden
            className={cn('size-5 text-ink-2 transition-transform', !open && '-rotate-90')}
          />
          {label}
          <span className="font-sans text-base font-normal text-ink-2 tabular-nums">({count})</span>
        </button>
      </h2>
      {open && children}
    </section>
  );
}

export default function RegattasListPage() {
  const canEdit = useCan('regatta.edit');
  const regattas = useList('regattas', { sort: 'startDate' });
  const [creating, setCreating] = useState(false);
  const today = todayIn();
  const { upcoming, past } = useMemo(
    () => splitRegattas(regattas.data ?? [], today),
    [regattas.data, today],
  );
  const archived = useMemo(
    () =>
      (regattas.data ?? [])
        .filter((r) => r.status === 'archived')
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [regattas.data],
  );

  const newButton = canEdit && (
    <Button variant="primary" onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      New regatta
    </Button>
  );

  let body: React.ReactNode;
  if (regattas.isPending) {
    body = (
      <div className="flex flex-col gap-3" role="status" aria-label="Loading regattas">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4"
          >
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-80" />
            <Skeleton className="h-6 w-48" />
          </div>
        ))}
      </div>
    );
  } else if (regattas.isError) {
    body = (
      <ErrorState
        title="Regattas did not load."
        error={regattas.error}
        onRetry={() => void regattas.refetch()}
      />
    );
  } else if (regattas.data.length === 0) {
    body = (
      <EmptyState
        title="No regattas yet"
        description="Create one for the next race day, then add the teams that are going and paste its schedule."
        action={newButton || undefined}
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-8">
        <section aria-labelledby="regattas-upcoming" className="flex flex-col gap-3">
          <h2 id="regattas-upcoming" className="font-display text-lg font-semibold">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-base leading-prose text-ink-2">
              No upcoming regattas.{' '}
              {canEdit
                ? 'Create one for the next race day, or duplicate last year’s from its overview.'
                : 'A coach adds them here.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcoming.map((r) => (
                <RegattaCard key={r.id} regatta={r} today={today} />
              ))}
            </ul>
          )}
        </section>
        {past.length > 0 && (
          <Disclosure label="Past regattas" count={past.length}>
            <ul className="flex flex-col gap-3">
              {past.map((r) => (
                <RegattaCard key={r.id} regatta={r} today={today} />
              ))}
            </ul>
          </Disclosure>
        )}
        {archived.length > 0 && (
          <Disclosure label="Archived" count={archived.length}>
            <ul className="flex flex-col gap-3">
              {archived.map((r) => (
                <RegattaCard key={r.id} regatta={r} today={today} />
              ))}
            </ul>
          </Disclosure>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Regattas" actions={newButton} />
      {body}
      {canEdit && <NewRegattaDialog open={creating} onOpenChange={setCreating} />}
    </div>
  );
}
