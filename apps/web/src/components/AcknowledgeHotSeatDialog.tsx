// Acknowledge a hot seat with a short plan (PLAN.md §4.4, §9.2). Shared by the conflicts panel
// (schedule, inspector) and the lineup builder.
//
// The acknowledgment lives on the later entry of the pair: hotSeatAckBy (who), hotSeatPlan (the
// plan, printed on both teams' lineup sheets), and hotSeatFingerprint (what must stay unchanged:
// the shell or oar set and both race times). The domain's hotSeatAckPatch computes the
// fingerprint, so a later change to either race time or the shell re-opens the warning.

import { useState, type FormEvent } from 'react';
import { hotSeatAckPatch, type Entry, type Finding } from '@regatta-ops/domain';
import { useCan, useCurrentUser, useFindings, useUpdate, type UpdateVars } from '@/data';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Textarea } from '@/components/ui/input';
import { toast } from '@/components/toast';
import { ConflictIcon } from './ConflictBadge';

export interface AcknowledgeHotSeatDialogProps {
  regattaId: string;
  /** A SHELL_HOT_SEAT or OARS_HOT_SEAT finding; null closes the dialog. */
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PLAN_MAX = 200;

export function AcknowledgeHotSeatDialog({
  regattaId,
  finding,
  open,
  onOpenChange,
}: AcknowledgeHotSeatDialogProps) {
  const { findings, input, workingSet } = useFindings(regattaId);
  // The latest version of the finding (its id is stable across acknowledgment).
  const current = finding ? (findings.find((f) => f.id === finding.id) ?? finding) : null;
  const laterId = current?.entryIds[1] ?? null;
  const later = laterId ? (workingSet?.byId.entries.get(laterId) ?? null) : null;
  const ackBy = current?.acknowledged && later?.hotSeatAckBy ? later.hotSeatAckBy : null;
  const ackByName = ackBy ? (workingSet?.byId.users.get(ackBy)?.name ?? null) : null;
  // The write lives here, not in the form, so its toast still shows after the dialog closes.
  const update = useUpdate('entries', {
    errorMessage: 'The acknowledgment was not saved. Try again.',
  });
  const save = (vars: UpdateVars<'entries'>, done: string) =>
    update.mutate(vars, { onSuccess: () => toast.success(done) });

  return (
    <Dialog open={open && !!current} onOpenChange={onOpenChange}>
      {current && (
        <DialogContent
          title={current.acknowledged ? 'Hot seat plan' : 'Acknowledge hot seat'}
          description="Say how the boat changes hands. The plan prints on both teams' lineup sheets."
        >
          {/* Keyed by entry so the draft starts from the saved plan each time it opens. */}
          <AckForm
            key={`${current.id}:${later?.hotSeatPlan ?? ''}:${String(current.acknowledged)}`}
            finding={current}
            later={later}
            ackByName={ackByName}
            canAck={!!input && !!later}
            save={save}
            onDone={() => onOpenChange(false)}
            ackPatch={(remove) => (input ? hotSeatAckPatch(current, input, { remove }) : null)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function AckForm({
  finding,
  later,
  ackByName,
  canAck,
  ackPatch,
  save,
  onDone,
}: {
  finding: Finding;
  later: Entry | null;
  ackByName: string | null;
  canAck: boolean;
  ackPatch: (remove: boolean) => ReturnType<typeof hotSeatAckPatch>;
  save: (vars: UpdateVars<'entries'>, done: string) => void;
  onDone: () => void;
}) {
  const user = useCurrentUser();
  const canEdit = useCan('regatta.edit');
  const acknowledged = !!finding.acknowledged;
  const [plan, setPlan] = useState(acknowledged ? (later?.hotSeatPlan ?? '') : '');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = plan.trim();
    if (!text) {
      setError('Write a short plan: who meets the boat, and where.');
      return;
    }
    const patch = ackPatch(false);
    if (!patch || !user) {
      setError('This hot seat changed. Close this and try again from the conflicts list.');
      return;
    }
    // Optimistic: the finding turns blue at once; the toast waits for the save.
    save(
      {
        id: patch.entryId,
        patch: {
          hotSeatFingerprint: patch.hotSeatFingerprint,
          hotSeatAckBy: user.id,
          hotSeatPlan: text,
        },
      },
      acknowledged ? 'Plan saved' : 'Hot seat acknowledged',
    );
    onDone();
  };

  const remove = () => {
    const patch = ackPatch(true);
    if (!patch) return;
    const cleared = patch.hotSeatFingerprint === '';
    save(
      {
        id: patch.entryId,
        patch: cleared
          ? { hotSeatFingerprint: '', hotSeatAckBy: null, hotSeatPlan: '' }
          : { hotSeatFingerprint: patch.hotSeatFingerprint },
      },
      'Acknowledgment removed',
    );
    onDone();
  };

  const id = `hot-seat-plan-${finding.id}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="flex gap-2 rounded-control border border-line bg-surface-2 px-3 py-2.5 text-base leading-prose">
        <ConflictIcon severity={finding.severity} className="mt-0.5" />
        <span>{finding.message}</span>
      </p>
      {canEdit ? (
        <Field
          id={id}
          label="Plan"
          hint={
            ackByName
              ? `Acknowledged by ${ackByName}. Changing either race time or the shell re-opens the warning.`
              : 'Changing either race time or the shell re-opens the warning.'
          }
          error={error ?? undefined}
        >
          <Textarea
            id={id}
            value={plan}
            maxLength={PLAN_MAX}
            rows={3}
            autoFocus
            placeholder="Girls cox meets Boys 2V at dock B"
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            onChange={(e) => {
              setPlan(e.target.value);
              if (error) setError(null);
            }}
          />
        </Field>
      ) : (
        <p className="text-base leading-prose">
          {later?.hotSeatPlan ? `Plan: ${later.hotSeatPlan}` : 'No plan yet.'}
          {ackByName && <span className="text-ink-2"> Acknowledged by {ackByName}.</span>}
        </p>
      )}
      <DialogFooter className="items-center">
        {canEdit && acknowledged && (
          <Button variant="ghost" className="mr-auto text-danger" onClick={remove}>
            Remove acknowledgment
          </Button>
        )}
        <Button onClick={onDone}>{canEdit ? 'Cancel' : 'Close'}</Button>
        {canEdit && (
          <Button type="submit" variant="primary" disabled={!canAck}>
            {acknowledged ? 'Save plan' : 'Acknowledge hot seat'}
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}
