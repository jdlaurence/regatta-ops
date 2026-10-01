// "Add athlete": the athlete form in a dialog, with "Save and add another" for typing in a
// roster by hand.

import { useId, useState } from 'react';
import { athleteName, type Team } from '@regatta-ops/domain';
import { useCreate } from '@/data';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { AthleteForm, formValuesFrom, inputFromForm } from './AthleteForm';

export function AddAthleteDialog({
  open,
  onOpenChange,
  team,
  seasonYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team;
  seasonYear: number;
}) {
  const formId = useId();
  const create = useCreate('athletes');
  // A new key clears the form for the next athlete.
  const [round, setRound] = useState(0);
  const defaults = formValuesFrom({
    teamId: team.id,
    level: team.program === 'juniors' ? 'novice' : 'experienced',
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add athlete"
        description={`Adds to the ${team.name} roster.`}
        className="max-w-xl"
      >
        {open && (
          <AthleteForm
            key={round}
            id={formId}
            defaultValues={defaults}
            seasonYear={seasonYear}
            program={team.program}
            autoFocus
            onSubmit={async (values, tag) => {
              const input = inputFromForm(values);
              await create.mutateAsync(input);
              toast.success(`${athleteName(input)} added`);
              if (tag === 'again') setRound((r) => r + 1);
              else onOpenChange(false);
            }}
          >
            {({ isSubmitting, submitWith }) => (
              <DialogFooter>
                <Button onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button disabled={isSubmitting} onClick={() => submitWith('again')}>
                  Save and add another
                </Button>
                <Button type="submit" variant="primary" disabled={isSubmitting}>
                  Add athlete
                </Button>
              </DialogFooter>
            )}
          </AthleteForm>
        )}
      </DialogContent>
    </Dialog>
  );
}
