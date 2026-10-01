// "New regatta": a short form, then the new regatta's overview.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { useCreate, useList } from '@/data';
import { regattaPath } from '@/app/nav-items';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { RegattaFields } from './RegattaFields';
import {
  formToCreate,
  newRegattaDefaults,
  regattaFormSchema,
  type RegattaFormValues,
} from './regatta-form';

function NewRegattaForm({ onDone }: { onDone: () => void }) {
  const club = useList('club_settings');
  const navigate = useNavigate();
  const create = useCreate('regattas', { errorMessage: 'The regatta was not created. Try again.' });
  const form = useForm<RegattaFormValues>({
    resolver: zodResolver(regattaFormSchema),
    defaultValues: newRegattaDefaults(club.data?.[0]?.timezone),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await create.mutateAsync(formToCreate(values));
      toast.success('Regatta created');
      onDone();
      navigate(regattaPath(saved.id));
    } catch {
      // The mutation's toast says what went wrong; the form stays open.
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <RegattaFields form={form} idPrefix="new-regatta" />
      <DialogFooter>
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          Create regatta
        </Button>
      </DialogFooter>
    </form>
  );
}

export function NewRegattaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New regatta"
        description="Add teams and paste the schedule once it exists."
        className="max-w-xl"
      >
        <NewRegattaForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
