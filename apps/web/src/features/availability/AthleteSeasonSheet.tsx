// One athlete's season, opened from a name on the team's availability sheet: every regatta in
// view with the full controls (available, maybe, unavailable; per-day toggles on multi-day
// regattas; a reason), and a link to any lineup that seats them on a day they are out.

import { Link } from 'react-router';
import {
  athleteName,
  type Athlete,
  type Availability,
  type Regatta,
  type Team,
} from '@regatta-ops/domain';
import { lineupEntryPath } from '@/app/nav-items';
import { formatDayRange } from '@/lib/dates';
import { SideBadge } from '@/components/chips';
import { ConflictIcon } from '@/components/ConflictBadge';
import { Sheet, SheetContent } from '@/components/ui/dialog';
import { draftOf, type AvailabilityDraft, type SeatProblem } from './availability-model';
import { AvailabilityControls } from './controls';

/** One regatta column of the sheet: its days and its availability records by athlete. */
export interface SeasonColumn {
  regatta: Regatta;
  days: string[];
  byAthlete: ReadonlyMap<string, Availability>;
}

export function AthleteSeasonSheet({
  athlete,
  team,
  columns,
  canEdit,
  problemsFor,
  onChange,
  onOpenChange,
}: {
  athlete: Athlete | null;
  team: Team;
  columns: SeasonColumn[];
  canEdit: boolean;
  problemsFor: (athleteId: string, col: SeasonColumn) => SeatProblem[];
  onChange: (athlete: Athlete, col: SeasonColumn, next: AvailabilityDraft) => void;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={!!athlete} onOpenChange={onOpenChange}>
      {athlete && (
        <SheetContent
          side="right"
          title={athleteName(athlete)}
          description={`Availability for each ${team.name} regatta in view.`}
          className="w-[min(100vw,440px)]"
        >
          <div className="flex items-center gap-2 px-4 pt-2">
            <SideBadge side={athlete.side} canScull={athlete.canScull} />
          </div>
          <ul className="flex flex-col">
            {columns.map((col) => {
              const subject = `${athleteName(athlete)} at ${col.regatta.name}`;
              const problems = problemsFor(athlete.id, col);
              return (
                <li
                  key={col.regatta.id}
                  className="flex flex-col gap-2 border-b border-line px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium">{col.regatta.name}</h3>
                    <span className="shrink-0 text-sm text-ink-2 tabular-nums">
                      {formatDayRange(col.regatta.startDate, col.regatta.endDate)}
                    </span>
                  </div>
                  <AvailabilityControls
                    subject={subject}
                    draft={draftOf(col.byAthlete.get(athlete.id))}
                    days={col.days}
                    canEdit={canEdit}
                    onChange={(next) => onChange(athlete, col, next)}
                  />
                  {problems.length > 0 && (
                    <p className="flex items-start gap-1.5 text-sm leading-prose">
                      <ConflictIcon severity="error" className="mt-px" />
                      <span>
                        Seated in{' '}
                        {problems.map(({ entry, event }, i) => (
                          <span key={entry.id}>
                            {i > 0 && ', '}
                            <Link
                              to={lineupEntryPath(col.regatta.id, entry.teamId, entry.id)}
                              className="text-accent underline-offset-4 hover:underline"
                            >
                              {entry.label}
                              {event?.eventNumber ? ` (Event ${event.eventNumber})` : ''}
                            </Link>
                          </span>
                        ))}{' '}
                        on a day they are out. Take them out of the boat or mark them available.
                      </span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      )}
    </Sheet>
  );
}
