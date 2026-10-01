// Edits to a final regatta ask first (PLAN.md §4.1: "final" shows a banner and requires
// confirmation to edit; it does not lock). Any feature can adopt it:
//
//   const finalEdit = useConfirmFinalEdit(regatta);          // Pick<Regatta, 'id' | 'status'>
//   const onSave = () => finalEdit.guard(() => save.mutate(...), 'Save event');
//   // or: if (!(await finalEdit.confirm('Delete event'))) return;
//   return <>{...}{finalEdit.dialog}</>;
//
// A page that spans regattas (a team's availability sheet) passes `null` and names the regatta
// on each call: `finalEdit.guard(fn, 'Change availability', regatta)`.
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
  /**
   * Resolves true to go ahead. `actionLabel` names the confirm button ("Save event"); `target`
   * overrides the hook's regatta for this one edit.
   */
  confirm: (actionLabel?: string, target?: FinalEditTarget) => Promise<boolean>;
  /** Runs `fn` after confirming (at once when no confirmation is needed). */
  guard: (fn: () => unknown, actionLabel?: string, target?: FinalEditTarget) => Promise<boolean>;
  /** Render this once, anywhere in the component. */
  dialog: ReactNode;
}

/** The regatta an edit touches; with a name, the prompt says which regatta is final. */
export type FinalEditTarget = Pick<Regatta, 'id' | 'status'> & { name?: string };

function asks(target: FinalEditTarget | null | undefined): target is FinalEditTarget {
  return target?.status === 'final' && !waived.has(target.id);
}

export function useConfirmFinalEdit(regatta: FinalEditTarget | null | undefined): ConfirmFinalEdit {
  const [pending, setPending] = useState<{
    label: string;
    regattaId: string;
    name?: string;
  } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const checkboxId = useId();
  const regattaId = regatta?.id ?? null;
  const regattaStatus = regatta?.status ?? null;
  const needsConfirmation = asks(regatta);

  const confirm = useCallback(
    (actionLabel = 'Make the change', target?: FinalEditTarget) => {
      const t =
        target ?? (regattaId && regattaStatus ? { id: regattaId, status: regattaStatus } : null);
      if (!asks(t)) return Promise.resolve(true);
      resolver.current?.(false);
      return new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setDontAsk(false);
        setPending({ label: actionLabel, regattaId: t.id, name: target?.name });
      });
    },
    [regattaId, regattaStatus],
  );

  const guard = useCallback(
    async (fn: () => unknown, actionLabel?: string, target?: FinalEditTarget) => {
      const ok = await confirm(actionLabel, target);
      if (ok) await fn();
      return ok;
    },
    [confirm],
  );

  const settle = (ok: boolean) => {
    if (ok && dontAsk && pending) waived.add(pending.regattaId);
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  };

  const dialog = (
    <Dialog open={!!pending} onOpenChange={(open) => !open && settle(false)}>
      {pending && (
        <DialogContent
          title={pending.name ? `${pending.name} is final` : 'This regatta is final'}
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
