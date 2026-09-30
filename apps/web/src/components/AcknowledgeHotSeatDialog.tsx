// STUB owned by WP-H (schedule, timeline, conflicts panel): replace the body, keep the props.
// Used by the conflicts panel (WP-H) and the lineup builder (WP-G), PLAN.md §4.4 hot seats.
import type { Finding } from '@srt/domain';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export interface AcknowledgeHotSeatDialogProps {
  regattaId: string;
  /** A SHELL_HOT_SEAT or OARS_HOT_SEAT finding; null closes the dialog. */
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AcknowledgeHotSeatDialog({ open, onOpenChange }: AcknowledgeHotSeatDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Acknowledge hot seat">
        <p className="text-ink-2">
          Hot seat acknowledgment arrives with the schedule work package.
        </p>
      </DialogContent>
    </Dialog>
  );
}
