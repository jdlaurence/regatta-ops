// Publishing a team's lineups (PLAN.md §4.1): "Published 2 h ago · 3 changes since" (hover or
// tap lists the changes) or "Not published yet", and the "Publish lineups" button (coach and
// admin) with a confirmation that shows what changes. Publishing writes publishedAt and the
// snapshot to the team's regatta_teams record; entries stay live for coaches.
//
// Placed in the lineup page header: <PublishStatus regattaId={id} teamId={teamId} />.

import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Send } from 'lucide-react';
import {
  buildPublishedSnapshot,
  snapshotChanges,
  type Id,
  type PublishedSnapshot,
  type RegattaTeam,
  type SnapshotChange,
} from '@srt/domain';
import {
  useCan,
  useCurrentUser,
  useRegattaWorkingSet,
  useUpdate,
  type RegattaWorkingSet,
} from '@/data';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/relative-time';
import { toast } from './toast';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/menu';
import { Skeleton } from './states';

export interface PublishState {
  /** The team's record for this regatta; null when the team is not in it. */
  regattaTeam: RegattaTeam | null;
  published: PublishedSnapshot | null;
  /** The live draft as a snapshot (what "Publish lineups" would store). */
  live: PublishedSnapshot;
  /** What changed since the last publish; [] when never published. */
  changes: SnapshotChange[];
}

/** The published snapshot, the live draft, and the changes between them. Pure. */
export function publishState(
  ws: RegattaWorkingSet,
  teamId: Id,
  publishedAt = '',
  publishedBy: Id | null = null,
): PublishState {
  const regattaTeam = ws.regattaTeams.find((rt) => rt.teamId === teamId) ?? null;
  const published = regattaTeam?.publishedSnapshot ?? null;
  const live = buildPublishedSnapshot({
    teamId,
    entries: ws.entries,
    seats: ws.seats,
    events: ws.events,
    shells: ws.shells,
    oarSets: ws.oarSets,
    athletes: ws.athletes,
    publishedAt,
    publishedBy,
  });
  const changes = snapshotChanges(published, live, {
    timeZone: ws.regatta.timezone,
    scratchedEntryIds: ws.entries.filter((e) => e.status === 'scratched').map((e) => e.id),
  });
  return { regattaTeam, published, live, changes };
}

/** Re-render every minute so "2 h ago" stays true on a page left open. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function ChangeList({ changes, className }: { changes: SnapshotChange[]; className?: string }) {
  return (
    <ul className={cn('flex flex-col gap-1.5 text-base leading-prose', className)}>
      {changes.map((c, i) => (
        <li key={`${c.entryId}:${c.kind}:${i}`} className="flex gap-2">
          <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink-2" />
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "3 changes since": a mouse opens the list on hover (and it closes when the pointer leaves);
 * a tap, a click, or Enter toggles it. A click right after the hover opened it keeps it open.
 */
function ChangesSince({ changes }: { changes: SnapshotChange[] }) {
  const [open, setOpen] = useState(false);
  const hoverOpened = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  if (changes.length === 0) return <span className="text-ink-2">no changes since</span>;

  const hoverIn = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(closeTimer.current);
    if (!open) hoverOpened.current = true;
    setOpen(true);
  };
  const hoverOut = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !hoverOpened.current) return;
    closeTimer.current = setTimeout(() => {
      hoverOpened.current = false;
      setOpen(false);
    }, 200);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) hoverOpened.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger
        className="rounded-control font-medium text-accent underline-offset-4 hover:underline pointer-coarse:py-3"
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        onClick={(e) => {
          e.preventDefault();
          const keep = hoverOpened.current;
          hoverOpened.current = false;
          setOpen((o) => (keep ? true : !o));
        }}
      >
        {plural(changes.length, 'change')} since
      </PopoverTrigger>
      <PopoverContent
        className="max-h-80 w-80 overflow-y-auto"
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        // A hover only shows the list; focus stays where the pointer left it.
        onOpenAutoFocus={(e) => hoverOpened.current && e.preventDefault()}
        aria-label="Changes since the last publish"
      >
        <h3 className="mb-2 text-sm font-medium text-ink-2">Changes since the last publish</h3>
        <ChangeList changes={changes} />
      </PopoverContent>
    </Popover>
  );
}

export interface PublishStatusProps {
  regattaId: string;
  teamId: string;
  className?: string;
}

export function PublishStatus({ regattaId, teamId, className }: PublishStatusProps) {
  const ws = useRegattaWorkingSet(regattaId);
  const canPublish = useCan('regatta.edit');
  const user = useCurrentUser();
  const now = useNow();
  const [confirming, setConfirming] = useState(false);
  const update = useUpdate('regatta_teams', {
    errorMessage: 'The lineups were not published. Try again.',
  });

  const data = ws.data;
  const state = useMemo(() => (data ? publishState(data, teamId) : null), [data, teamId]);

  if (ws.isLoading) return <Skeleton className={cn('h-8 w-64', className)} />;
  if (!data || !state?.regattaTeam) return null;
  const rt = state.regattaTeam;
  const team = data.byId.teams.get(teamId);
  const publishedAt = rt.publishedAt ?? state.published?.publishedAt ?? null;
  const first = !state.published;

  const publish = () => {
    const at = new Date().toISOString();
    const snapshot = publishState(data, teamId, at, user?.id ?? null).live;
    update.mutate(
      { id: rt.id, patch: { publishedAt: at, publishedSnapshot: snapshot } },
      {
        onSuccess: () => {
          toast.success('Lineups published');
          setConfirming(false);
        },
      },
    );
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 text-base', className)}>
      <p className="flex flex-wrap items-center gap-x-1.5" aria-live="polite">
        {publishedAt ? (
          <>
            <span>
              Published{' '}
              <time dateTime={publishedAt} title={new Date(publishedAt).toLocaleString()}>
                {relativeTime(publishedAt, now)}
              </time>
            </span>
            <span aria-hidden className="text-ink-2">
              ·
            </span>
            <ChangesSince changes={state.changes} />
          </>
        ) : (
          <span className="text-ink-2">Not published yet</span>
        )}
      </p>
      {canPublish && (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <Button size="sm" onClick={() => setConfirming(true)}>
            <Send aria-hidden />
            Publish lineups
          </Button>
          <DialogContent
            title="Publish lineups"
            description="Athletes, parents, and printed sheets see the published version. Coaches keep editing the draft."
          >
            {first ? (
              <p className="text-base leading-prose">
                This publishes {state.live.entries.length}{' '}
                {state.live.entries.length === 1 ? 'entry' : 'entries'} for{' '}
                {team?.name ?? 'this team'}.
              </p>
            ) : state.changes.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-base font-medium">
                  {plural(state.changes.length, 'change')} since the last publish
                </p>
                <ChangeList
                  changes={state.changes}
                  className="max-h-64 overflow-y-auto rounded-control border border-line p-3"
                />
              </div>
            ) : (
              <p className="text-base leading-prose">
                Nothing changed since the last publish. Publishing again updates the time.
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button>Cancel</Button>
              </DialogClose>
              <Button variant="primary" onClick={publish} disabled={update.isPending}>
                <Send aria-hidden />
                Publish lineups
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
