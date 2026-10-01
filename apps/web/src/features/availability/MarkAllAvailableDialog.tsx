// "Mark all available": clears every availability record for the athletes in view, reasons
// included, since no record means available.

import type { Athlete, Availability } from '@regatta-ops/domain';
import { batchOp, type BatchOp } from '@/data';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';

export function clearOps(
  athletes: readonly Pick<Athlete, 'id'>[],
  byAthlete: ReadonlyMap<string, Availability>,
): BatchOp[] {
  return athletes.flatMap((a) => {
    const rec = byAthlete.get(a.id);
    return rec ? [batchOp.delete('availability', rec.id)] : [];
  });
}

export function MarkAllAvailableDialog({
  open,
  onOpenChange,
  athletes,
  byAthlete,
  scopeLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athletes: Athlete[];
  byAthlete: ReadonlyMap<string, Availability>;
  /** "every team" or the team's name. */
  scopeLabel: string;
  onConfirm: (ops: BatchOp[]) => Promise<boolean>;
}) {
  const ops = clearOps(athletes, byAthlete);
  const n = ops.length;
  const run = async () => {
    onOpenChange(false);
    try {
      if (await onConfirm(ops)) toast.success('Everyone marked available');
    } catch {
      // The mutation's toast explains.
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Mark all available"
        description={
          n === 0
            ? `Everyone on ${scopeLabel} is already available.`
            : `Clears ${n === 1 ? '1 athlete’s status' : `${n} athletes’ statuses`} on ${scopeLabel}, reasons and per-day choices included.`
        }
      >
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{n === 0 ? 'Close' : 'Cancel'}</Button>
          {n > 0 && (
            <Button variant="primary" onClick={() => void run()}>
              Mark all available
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
