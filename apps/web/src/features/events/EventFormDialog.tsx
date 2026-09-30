// STUB owned by WP-F (regattas, events, availability): replace the body, keep the props.
// Used by the schedule page (WP-H) for "Add event" and inline "Edit event".
import type { RegattaEvent } from '@srt/domain';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface EventFormDialogProps {
  regattaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this event; omit to add a new one. */
  event?: RegattaEvent | null;
  /** Day to preselect for a new event ('YYYY-MM-DD'). */
  defaultDay?: string;
  /** 'race' (default) or 'logistics' for a new line. */
  defaultKind?: RegattaEvent['kind'];
  /** Called with the saved event. */
  onSaved?: (event: RegattaEvent) => void;
}

export function EventFormDialog({ open, onOpenChange, event }: EventFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={event ? 'Edit event' : 'Add event'}>
        <p className="text-ink-2">Event editing arrives with the events work package.</p>
      </DialogContent>
    </Dialog>
  );
}
