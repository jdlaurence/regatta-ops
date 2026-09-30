// The athlete drawer (PLAN.md §6.10): every field, and the regattas and entries the athlete is
// in, upcoming first. Coaches edit and delete; viewers read.

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Trash2 } from 'lucide-react';
import {
  athleteName,
  clockAt,
  type Athlete,
  type Entry,
  type Regatta,
  type RegattaEvent,
  type Team,
} from '@srt/domain';
import { useDelete, useList, useUpdate } from '@/data';
import { SideBadge, TeamChip } from '@/components/chips';
import { ErrorState, Skeleton } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, Sheet, SheetContent } from '@/components/ui/dialog';
import { formatDayRange, formatWeekday, todayIn } from '@/lib/dates';
import { AthleteForm, formValuesFrom, inputFromForm } from './AthleteForm';
import { AgeBadgeView, InactiveTag } from './RosterBadges';
import { ageBadge, LEVEL_LABELS } from './lib';

export interface AthleteSheetProps {
  athlete: Athlete | null;
  team: Team;
  teams: readonly Team[];
  canEdit: boolean;
  seasonYear: number;
  onOpenChange: (open: boolean) => void;
}

export function AthleteSheet({
  athlete,
  team,
  teams,
  canEdit,
  seasonYear,
  onOpenChange,
}: AthleteSheetProps) {
  return (
    <Sheet open={!!athlete} onOpenChange={onOpenChange}>
      {athlete && (
        <SheetContent side="right" title={athleteName(athlete)} className="w-[min(100vw,440px)]">
          <AthleteDetails
            key={`${athlete.id}:${athlete.updated ?? ''}`}
            athlete={athlete}
            team={team}
            teams={teams}
            canEdit={canEdit}
            seasonYear={seasonYear}
            onClose={() => onOpenChange(false)}
          />
        </SheetContent>
      )}
    </Sheet>
  );
}

function AthleteDetails({
  athlete,
  team,
  teams,
  canEdit,
  seasonYear,
  onClose,
}: Omit<AthleteSheetProps, 'athlete' | 'onOpenChange'> & {
  athlete: Athlete;
  onClose: () => void;
}) {
  const formId = useId();
  const update = useUpdate('athletes');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const badge = ageBadge(athlete.birthYear, team.program, seasonYear);
  const legal = `${athlete.firstName} ${athlete.lastName}`.trim();

  return (
    <div className="flex flex-col gap-6 px-4 pt-2 pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <SideBadge side={athlete.side} canScull={athlete.canScull} />
        {badge && <AgeBadgeView badge={badge} />}
        <span className="text-sm text-ink-2">{LEVEL_LABELS[athlete.level]}</span>
        {athlete.canCox && <span className="text-sm text-ink-2">Coxswain</span>}
        {athlete.status === 'inactive' && <InactiveTag />}
        {athlete.preferredName?.trim() && (
          <span className="text-sm text-ink-2">Full name: {legal}</span>
        )}
      </div>

      <AthleteForm
        id={formId}
        defaultValues={formValuesFrom(athlete)}
        seasonYear={seasonYear}
        program={team.program}
        teams={teams}
        readOnly={!canEdit}
        onSubmit={async (values) => {
          const input = inputFromForm(values);
          await update.mutateAsync({ id: athlete.id, patch: input });
          const moved = input.teamId !== athlete.teamId;
          const to = teams.find((t) => t.id === input.teamId);
          toast.success(
            moved && to
              ? `${athleteName(input)} moved to ${to.name}`
              : `${athleteName(input)} saved`,
          );
          if (moved) onClose();
        }}
      >
        {({ isSubmitting, isDirty }) =>
          canEdit && (
            <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-line bg-surface px-4 py-3">
              <Button onClick={onClose}>Close</Button>
              <Button type="submit" variant="primary" disabled={!isDirty || isSubmitting}>
                Save athlete
              </Button>
            </div>
          )
        }
      </AthleteForm>

      <AthleteEntries athleteId={athlete.id} homeTeamId={athlete.teamId} />

      {canEdit && (
        <div className="flex flex-col items-start gap-2 border-t border-line pt-4">
          <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden />
            Delete athlete
          </Button>
        </div>
      )}

      <DeleteAthleteDialog
        athlete={athlete}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={onClose}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entries

const SEAT_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', 'cox'];

interface EntryLine {
  entry: Entry;
  seat: string;
  event: RegattaEvent | null;
}

interface RegattaGroup {
  regatta: Regatta;
  past: boolean;
  lines: EntryLine[];
}

function AthleteEntries({ athleteId, homeTeamId }: { athleteId: string; homeTeamId: string }) {
  const seats = useList('entry_seats', { where: { athleteId } });
  const entryIds = useMemo(
    () => Array.from(new Set((seats.data ?? []).map((s) => s.entryId))),
    [seats.data],
  );
  const entries = useList('entries', { in: { id: entryIds } }, { enabled: entryIds.length > 0 });
  const eventIds = useMemo(
    () => Array.from(new Set((entries.data ?? []).flatMap((e) => (e.eventId ? [e.eventId] : [])))),
    [entries.data],
  );
  const events = useList('events', { in: { id: eventIds } }, { enabled: eventIds.length > 0 });
  const regattas = useList('regattas');
  const teams = useList('teams');

  const groups = useMemo<RegattaGroup[]>(() => {
    const regattaById = new Map((regattas.data ?? []).map((r) => [r.id, r]));
    const eventById = new Map((events.data ?? []).map((e) => [e.id, e]));
    const seatByEntry = new Map((seats.data ?? []).map((s) => [s.entryId, s.seat]));
    const byRegatta = new Map<string, EntryLine[]>();
    for (const entry of entries.data ?? []) {
      const seat = seatByEntry.get(entry.id);
      if (!seat) continue;
      const list = byRegatta.get(entry.regattaId) ?? [];
      list.push({
        entry,
        seat,
        event: entry.eventId ? (eventById.get(entry.eventId) ?? null) : null,
      });
      byRegatta.set(entry.regattaId, list);
    }
    const out: RegattaGroup[] = [];
    for (const [regattaId, lines] of byRegatta) {
      const regatta = regattaById.get(regattaId);
      if (!regatta) continue;
      const past = (regatta.endDate || regatta.startDate) < todayIn(regatta.timezone);
      lines.sort((a, b) => {
        const ta = a.event?.scheduledAt ?? '9999';
        const tb = b.event?.scheduledAt ?? '9999';
        return ta.localeCompare(tb) || SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat);
      });
      out.push({ regatta, past, lines });
    }
    // Upcoming soonest first, then past most recent first.
    return out.sort((a, b) =>
      a.past !== b.past
        ? Number(a.past) - Number(b.past)
        : a.past
          ? b.regatta.startDate.localeCompare(a.regatta.startDate)
          : a.regatta.startDate.localeCompare(b.regatta.startDate),
    );
  }, [entries.data, events.data, regattas.data, seats.data]);

  const teamById = new Map((teams.data ?? []).map((t) => [t.id, t]));
  const loading =
    seats.isPending ||
    regattas.isPending ||
    (entryIds.length > 0 && entries.isPending) ||
    (eventIds.length > 0 && events.isPending);
  const error = seats.error ?? entries.error ?? events.error ?? regattas.error;

  return (
    <section aria-labelledby={`entries-${athleteId}`} className="flex flex-col gap-3">
      <h3 id={`entries-${athleteId}`} className="font-display text-md font-semibold">
        Regattas
      </h3>
      {error ? (
        <ErrorState
          title="Entries did not load."
          error={error}
          onRetry={() => {
            void seats.refetch();
            void regattas.refetch();
            if (entryIds.length > 0) void entries.refetch();
            if (eventIds.length > 0) void events.refetch();
          }}
        />
      ) : loading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading entries">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-base leading-prose text-ink-2">
          Not in any entries yet. Seat them from a regatta’s Lineups page.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {groups.map((g, i) => (
            <li key={g.regatta.id} className="flex flex-col gap-1.5">
              {g.past && (i === 0 || !groups[i - 1]!.past) && (
                <p className="text-sm text-ink-2">Past regattas</p>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <Link
                  to={`/regattas/${g.regatta.id}`}
                  className="font-medium text-ink hover:text-accent hover:underline"
                >
                  {g.regatta.name}
                </Link>
                <span className="text-sm text-ink-2 tabular-nums">
                  {formatDayRange(g.regatta.startDate, g.regatta.endDate)}
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
                {g.lines.map(({ entry, seat, event }) => {
                  const entryTeam = teamById.get(entry.teamId);
                  const multiDay = g.regatta.endDate && g.regatta.endDate !== g.regatta.startDate;
                  const when = event?.scheduledAt
                    ? `${multiDay && event.day ? `${formatWeekday(event.day)}, ` : ''}${clockAt(event.scheduledAt, g.regatta.timezone)}`
                    : event
                      ? 'Time to be set'
                      : 'No event yet';
                  return (
                    <li key={entry.id}>
                      <Link
                        to={`/regattas/${g.regatta.id}/lineups/${entry.teamId}`}
                        className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 hover:bg-surface-2"
                      >
                        {entryTeam && entry.teamId !== homeTeamId && (
                          <TeamChip team={entryTeam} short size="sm" />
                        )}
                        <span className="font-medium">{entry.label}</span>
                        {event && (
                          <span className="text-ink-2">
                            {event.eventNumber ? `Event ${event.eventNumber}` : event.name}
                          </span>
                        )}
                        <span className="text-ink-2 tabular-nums">{when}</span>
                        <span className="ml-auto text-sm text-ink-2">
                          {seat === 'cox' ? 'Cox' : `Seat ${seat}`}
                        </span>
                        {entry.status === 'scratched' && (
                          <span className="text-sm text-ink-2">Scratched</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delete

function DeleteAthleteDialog({
  athlete,
  open,
  onOpenChange,
  onDeleted,
}: {
  athlete: Athlete;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const remove = useDelete('athletes');
  const update = useUpdate('athletes');
  const seats = useList('entry_seats', { where: { athleteId: athlete.id } }, { enabled: open });
  const name = athleteName(athlete);
  const seatCount = seats.data?.length ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Delete ${name}?`}
        description={
          seatCount > 0
            ? `This removes ${name} from the roster and empties ${seatCount === 1 ? 'the seat' : `${seatCount} seats`} they hold in lineups. Marking them inactive keeps their history instead.`
            : `This removes ${name} from the roster. Marking them inactive keeps their history instead.`
        }
      >
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {athlete.status === 'active' && (
            <Button
              onClick={() => {
                update.mutate({ id: athlete.id, patch: { status: 'inactive' } });
                toast.success(`${name} marked inactive`);
                onOpenChange(false);
              }}
            >
              Mark inactive
            </Button>
          )}
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(athlete.id, {
                onSuccess: () => {
                  toast.success(`${name} deleted`);
                  onOpenChange(false);
                  onDeleted();
                },
              })
            }
          >
            Delete athlete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
