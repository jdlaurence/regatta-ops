// STUB owned by WP-F (regattas, events, availability): replace the body, keep the props.
// Used by the schedule page (WP-H) for "Import events" (paste import, PLAN.md §4.3, §9.5).
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface ImportEventsDialogProps {
  regattaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the number of events created. */
  onImported?: (count: number) => void;
}

export function ImportEventsDialog({ open, onOpenChange }: ImportEventsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Import events">
        <p className="text-ink-2">Paste import arrives with the events work package.</p>
      </DialogContent>
    </Dialog>
  );
}
