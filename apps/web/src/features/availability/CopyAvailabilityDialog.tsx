// "Copy from previous regatta" (PLAN.md §6.5): make this regatta's availability match another
// regatta's for the athletes in view. Per-day choices carry over by position (day 1 to day 1).

import { useMemo, useState } from 'react';
import type { Athlete, Availability, Regatta } from '@srt/domain';
import { useList, type BatchOp } from '@/data';
import { formatDayRange } from '@/lib/dates';
import { ErrorState, Skeleton } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { regattaDays } from '@/features/regattas/duplicate';
import { copyOps } from './availability-model';

/** Other regattas, the most recent one before this regatta first. */
export function copySources(regattas: readonly Regatta[], current: Regatta): Regatta[] {
  const others = regattas.filter((r) => r.id !== current.id);
  const before = others
    .filter((r) => r.startDate <= current.startDate)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const after = others
    .filter((r) => r.startDate > current.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return [...before, ...after];
}

function CopyForm({
  regatta,
  athletes,
  byAthlete,
  scopeLabel,
  onConfirm,
  onDone,
}: {
  regatta: Regatta;
  athletes: Athlete[];
  byAthlete: ReadonlyMap<string, Availability>;
  scopeLabel: string;
  onConfirm: (ops: BatchOp[]) => Promise<boolean>;
  onDone: () => void;
}) {
  const regattas = useList('regattas', { sort: 'startDate' });
  const sources = useMemo(
    () => (regattas.data ? copySources(regattas.data, regatta) : []),
    [regattas.data, regatta],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const sourceId = picked ?? sources[0]?.id ?? null;
  const source = sources.find((r) => r.id === sourceId) ?? null;
  const sourceAvailability = useList(
    'availability',
    { where: { regattaId: sourceId ?? '' } },
    { enabled: !!sourceId },
  );

  const ops = useMemo(() => {
    if (!source || !sourceAvailability.data) return null;
    return copyOps(
      athletes,
      byAthlete,
      new Map(sourceAvailability.data.map((a) => [a.athleteId, a])),
      {
        regattaId: regatta.id,
        sourceDays: regattaDays(source),
        targetDays: regattaDays(regatta),
      },
    );
  }, [source, sourceAvailability.data, athletes, byAthlete, regatta]);

  if (regattas.isPending) return <Skeleton className="h-20" />;
  if (regattas.isError) {
    return (
      <ErrorState
        title="Regattas did not load."
        error={regattas.error}
        onRetry={() => void regattas.refetch()}
      />
    );
  }
  if (sources.length === 0) {
    return (
      <>
        <p className="text-base leading-prose text-ink-2">
          There is no other regatta to copy from yet.
        </p>
        <DialogFooter>
          <Button onClick={onDone}>Close</Button>
        </DialogFooter>
      </>
    );
  }

  const run = async () => {
    if (!ops) return;
    onDone();
    try {
      if (await onConfirm(ops)) toast.success('Availability copied');
    } catch {
      // The mutation's toast explains.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Field id="copy-source" label="Copy from">
        <Select
          id="copy-source"
          value={sourceId}
          onValueChange={setPicked}
          options={sources.map((r) => ({
            value: r.id,
            label: `${r.name} · ${formatDayRange(r.startDate, r.endDate)}`,
          }))}
        />
      </Field>
      {sourceAvailability.isError ? (
        <ErrorState
          title="That regatta's availability did not load."
          error={sourceAvailability.error}
          onRetry={() => void sourceAvailability.refetch()}
        />
      ) : ops === null ? (
        <Skeleton className="h-10" />
      ) : (
        <p role="status" className="text-base leading-prose text-ink-2">
          {ops.length === 0
            ? `Availability on ${scopeLabel} already matches.`
            : `Changes ${ops.length === 1 ? '1 athlete' : `${ops.length} athletes`} on ${scopeLabel}. Athletes with nothing set there become available here.`}
        </p>
      )}
      <DialogFooter>
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!ops || ops.length === 0} onClick={() => void run()}>
          Copy availability
        </Button>
      </DialogFooter>
    </div>
  );
}

export function CopyAvailabilityDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regatta: Regatta;
  athletes: Athlete[];
  byAthlete: ReadonlyMap<string, Availability>;
  scopeLabel: string;
  onConfirm: (ops: BatchOp[]) => Promise<boolean>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Copy from previous regatta"
        description="Statuses, reasons, and per-day choices. Athletes with nothing set there become available here."
      >
        <CopyForm {...props} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
