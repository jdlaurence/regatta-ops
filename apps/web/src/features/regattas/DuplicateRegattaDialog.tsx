// "Duplicate" (PLAN.md §4.1): a new regatta with this one's settings, events (moved to the new
// dates), and participating teams. Entries, availability, and load plans stay behind.

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import {
  requiredText,
  type Regatta,
  type RegattaEvent,
  type RegattaTeam,
} from '@regatta-ops/domain';
import { newId, useBatch } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { formatDay, formatDayRange } from '@/lib/dates';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { dayDelta, duplicateBatches, planDuplicate, shiftDay, suggestDuplicate } from './duplicate';

const schema = z.object({
  name: requiredText('Enter a name for the new regatta'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a start date'),
});
type Values = z.infer<typeof schema>;

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

function DuplicateForm({
  regatta,
  events,
  regattaTeams,
  onDone,
}: {
  regatta: Regatta;
  events: readonly RegattaEvent[];
  regattaTeams: readonly RegattaTeam[];
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const batch = useBatch({ errorMessage: 'The regatta was not duplicated. Try again.' });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: suggestDuplicate(regatta),
  });
  const { errors } = form.formState;
  const startDate = useWatch({ control: form.control, name: 'startDate' });
  const length = dayDelta(regatta.startDate, regatta.endDate || regatta.startDate);
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '');
  const endDate = validStart ? shiftDay(startDate, length) : null;
  const races = events.filter((e) => e.kind === 'race').length;
  const logistics = events.length - races;

  const onSubmit = form.handleSubmit(async (values) => {
    const plan = planDuplicate(regatta, events, regattaTeams, {
      name: values.name,
      startDate: values.startDate,
      newId,
    });
    try {
      for (const ops of duplicateBatches(plan)) await batch.mutateAsync(ops);
      toast.success('Regatta duplicated');
      onDone();
      navigate(regattaPath(plan.regatta.id));
    } catch {
      // The mutation's toast explains; the dialog stays open.
    }
  });

  const copies = [
    'the settings',
    races > 0 && plural(races, 'race'),
    logistics > 0 && plural(logistics, 'logistics item'),
    regattaTeams.length > 0 && plural(regattaTeams.length, 'team'),
  ].filter(Boolean) as string[];
  const last = copies.pop();
  const copyText = copies.length > 0 ? `${copies.join(', ')}, and ${last}` : last;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <p className="text-base leading-prose text-ink-2">
        Copies {copyText}. Entries, availability, and load plans are not copied.
      </p>
      <Field id="duplicate-name" label="Name" error={errors.name?.message}>
        <Input
          id="duplicate-name"
          autoComplete="off"
          aria-invalid={!!errors.name || undefined}
          aria-describedby={errors.name ? 'duplicate-name-error' : undefined}
          {...form.register('name')}
        />
      </Field>
      <Field
        id="duplicate-start"
        label="Start date"
        error={errors.startDate?.message}
        hint={
          endDate
            ? length > 0
              ? `Runs ${formatDayRange(startDate, endDate)}. Events move with the dates and keep their times.`
              : `Events move to ${formatDay(startDate)} and keep their times.`
            : undefined
        }
      >
        <Input
          id="duplicate-start"
          type="date"
          aria-invalid={!!errors.startDate || undefined}
          aria-describedby={errors.startDate ? 'duplicate-start-error' : 'duplicate-start-hint'}
          {...form.register('startDate')}
        />
      </Field>
      <DialogFooter>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={batch.isPending}>
          Duplicate regatta
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DuplicateRegattaDialog({
  regatta,
  events,
  regattaTeams,
  open,
  onOpenChange,
}: {
  regatta: Regatta;
  events: readonly RegattaEvent[];
  regattaTeams: readonly RegattaTeam[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Duplicate ${regatta.name}`}>
        <DuplicateForm
          regatta={regatta}
          events={events}
          regattaTeams={regattaTeams}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
