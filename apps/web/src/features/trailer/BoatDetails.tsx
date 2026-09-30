// "Why here?" (PLAN.md §4.10): for a boat on the racks, the rules that put it there as
// sentences with Must/Prefer and scores, whether it is locked and by whom, and what to do with
// it; for a boat still to load, the best free spot on this trailer or the rule that rejected
// every spot. Shown in the inspector on desktop and in a bottom sheet on phones.

import type { ReactNode } from 'react';
import { Lock, LockOpen, PackagePlus, Undo2 } from 'lucide-react';
import type { PackBoat, Reason, Team } from '@srt/domain';
import { Button } from '@/components/ui/button';
import { TeamChip } from '@/components/chips';
import { BoatPill, ReasonList } from './parts';
import type { WhyHere } from './lib';

function Heading({ boat, team }: { boat: PackBoat; team: Team | undefined }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <BoatPill name={boat.name} cls={boat.cls} teamColor={team?.colorKey} />
      {team && <TeamChip team={team} short size="sm" />}
    </div>
  );
}

export function PlacedBoatDetails({
  boat,
  team,
  where,
  trailerName,
  why,
  canEdit,
  onLock,
  onUnlock,
  onRemove,
  children,
}: {
  boat: PackBoat;
  team: Team | undefined;
  /** "Level 5, wide side, outer lane". */
  where: string;
  trailerName: string;
  why: WhyHere;
  canEdit: boolean;
  onLock: () => void;
  onUnlock: () => void;
  onRemove: () => void;
  /** Extra actions (the phone's "Move to…" list). */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Heading boat={boat} team={team} />
        <p className="text-base text-ink">
          {trailerName}, {where[0]!.toLowerCase() + where.slice(1)}
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-control bg-surface-2 p-3">
        <p className="flex items-center gap-2 text-base text-ink">
          {why.lock ? (
            <Lock aria-hidden className="size-4 shrink-0 text-ink-2" />
          ) : (
            <LockOpen aria-hidden className="size-4 shrink-0 text-ink-2" />
          )}
          {why.lock
            ? `${why.lock}. Pack trailer keeps it here.`
            : 'Not locked. Pack trailer may move it.'}
        </p>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {why.lock ? (
              <Button size="sm" onClick={onUnlock}>
                <LockOpen aria-hidden />
                Unlock
              </Button>
            ) : (
              <Button size="sm" onClick={onLock}>
                <Lock aria-hidden />
                Lock here
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onRemove}>
              <Undo2 aria-hidden />
              Remove from trailer
            </Button>
          </div>
        )}
      </div>

      {why.broken.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium text-danger">This spot breaks a rule</h3>
          <ReasonList reasons={why.broken} broken />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium text-ink-2">The rules behind this spot</h3>
        {why.reasons.length === 0 ? (
          <p className="text-base text-ink-2">No rule scored this spot.</p>
        ) : (
          <ReasonList reasons={why.reasons} />
        )}
        {why.notes.map((n) => (
          <p key={n} className="text-sm text-ink-2">
            {n}.
          </p>
        ))}
      </div>
      {children}
    </div>
  );
}

export function UnplacedBoatDetails({
  boat,
  team,
  trailerName,
  elsewhere,
  spot,
  canEdit,
  onPlace,
  children,
}: {
  boat: PackBoat;
  team: Team | undefined;
  trailerName: string;
  /** The trailer the boat is on now, when it is on another one. */
  elsewhere: string | null;
  /** The best free spot on this trailer, or why no spot takes the boat. */
  spot: { ok: true; where: string; reasons: Reason[] } | { ok: false; reasons: Reason[] };
  canEdit: boolean;
  onPlace: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Heading boat={boat} team={team} />
        <p className="text-base text-ink-2">
          {elsewhere
            ? `On the ${elsewhere}. It can move to this trailer.`
            : 'Not on a trailer yet.'}
        </p>
      </div>
      {spot.ok ? (
        <div className="flex flex-col gap-2">
          <p className="text-base text-ink">
            Best free spot on the {trailerName}:{' '}
            {spot.where[0]!.toLowerCase() + spot.where.slice(1)}.
          </p>
          {canEdit && (
            <Button size="sm" variant="primary" className="self-start" onClick={onPlace}>
              <PackagePlus aria-hidden />
              Put it there
            </Button>
          )}
          <ReasonList reasons={spot.reasons} className="mt-1" />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium text-ink">No room on the {trailerName}</h3>
          <ReasonList reasons={spot.reasons} broken />
        </div>
      )}
      {children}
    </div>
  );
}
