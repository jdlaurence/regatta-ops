// Edits to a final regatta ask first (PLAN.md §4.1: "final" shows a banner and requires
// confirmation to edit; it does not lock). Any feature can adopt it:
//
//   const finalEdit = useConfirmFinalEdit(regatta);          // Pick<Regatta, 'id' | 'status'>
//   const onSave = () => finalEdit.guard(() => save.mutate(...), 'Save event');
//   // or: if (!(await finalEdit.confirm('Delete event'))) return;
//   return <>{...}{finalEdit.dialog}</>;
//
// On a planning or archived regatta confirm() resolves true at once. "Don't ask again" lasts
// until the page reloads and covers every feature for that regatta.

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import type { Regatta } from '@srt/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';

/** Regattas whose final-edit prompt was waived this session. */
const waived = new Set<string>();

/** For tests: ask again for every regatta. */
export function resetFinalEditConfirmations() {
  waived.clear();
}

export interface ConfirmFinalEdit {
  /** True when an edit would ask first. */
  needsConfirmation: boolean;
  /** Resolves true to go ahead. `actionLabel` names the confirm button ("Save event"). */
  confirm: (actionLabel?: string) => Promise<boolean>;
  /** Runs `fn` after confirming (at once when no confirmation is needed). */
  guard: (fn: () => unknown, actionLabel?: string) => Promise<boolean>;
  /** Render this once, anywhere in the component. */
  dialog: ReactNode;
}

export function useConfirmFinalEdit(
  regatta: Pick<Regatta, 'id' | 'status'> | null | undefined,
): ConfirmFinalEdit {
  const [pending, setPending] = useState<{ label: string } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const checkboxId = useId();
  const regattaId = regatta?.id ?? null;
  const needsConfirmation = regatta?.status === 'final' && !waived.has(regatta.id);

  const confirm = useCallback(
    (actionLabel = 'Make the change') => {
      if (!regattaId || !needsConfirmation || waived.has(regattaId)) return Promise.resolve(true);
      resolver.current?.(false);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setDontAsk(false);
        setPending({ label: actionLabel });
      });
    },
    [regattaId, needsConfirmation],
  );

  const guard = useCallback(
    async (fn: () => unknown, actionLabel?: string) => {
      const ok = await confirm(actionLabel);
      if (ok) await fn();
      return ok;
    },
    [confirm],
  );

  const settle = (ok: boolean) => {
    if (ok && dontAsk && regattaId) waived.add(regattaId);
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && settle(false)}>
      {pending && (
        <DialogContent
          title="This regatta is final"
          description="Lineups and the schedule may already be printed or shared. Make this change anyway?"
        >
          <div className="flex items-center gap-2.5">
            <Checkbox
              id={checkboxId}
              checked={dontAsk}
              onCheckedChange={(v) => setDontAsk(v === true)}
            />
            <Label htmlFor={checkboxId} className="font-normal">
              Don&rsquo;t ask again for this regatta until I reload
            </Label>
          </div>
          <DialogFooter>
            <Button onClick={() => settle(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => settle(true)} autoFocus>
              {pending.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );

  return { needsConfirmation, confirm, guard, dialog };
}
