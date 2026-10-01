// Comments on a race, from its row on the schedule: the count on the row opens the thread, and so
// does "Comments" in the row's menu (the way to start one).

import type { RegattaEvent } from '@regatta-ops/domain';
import { CommentCount, CommentsThread } from '@/components/CommentsThread';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { eventTitle } from './lib';

/** The row's comment count as a button; nothing when there are none yet. */
export function EventCommentsButton({
  event,
  count,
  onOpen,
}: {
  event: RegattaEvent;
  count: number;
  onOpen: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${count} ${count === 1 ? 'comment' : 'comments'} on ${eventTitle(event)}`}
      className="touch-hit relative rounded-control hover:bg-surface-2"
    >
      <CommentCount targetType="event" targetId={event.id} count={count} />
    </button>
  );
}

export function EventCommentsDialog({
  event,
  onOpenChange,
}: {
  event: RegattaEvent | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!event} onOpenChange={onOpenChange}>
      {event && (
        <DialogContent
          title={`Comments on ${eventTitle(event)}`}
          description="Everyone signed in sees these."
          className="max-w-xl"
        >
          <CommentsThread targetType="event" targetId={event.id} title={null} />
        </DialogContent>
      )}
    </Dialog>
  );
}
