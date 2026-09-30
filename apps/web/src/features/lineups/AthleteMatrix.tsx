// The by-athlete view (PLAN.md §4.4 Views): athletes as rows, the team's events as columns,
// seats as cells. Athletes racing three or more times are marked, since that is what coaches
// scan this view for. Clicking a cell opens that entry in the by-event view.

import { athleteName } from '@srt/domain';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { EmptyState } from '@/components/states';
import { TeamChip } from '@/components/chips';
import { useInspector } from '@/components/Inspector';
import { ScrollRegion } from '@/components/ScrollRegion';
import { useLineup } from './context';
import { athleteMatrix, eventTitle } from './lib';
import { AthleteBadges } from './Seats';
import { useLineupUi } from './store';

const BUSY = 3;
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

export function AthleteMatrix({ onShowEntry }: { onShowEntry: (entryId: string) => void }) {
  const { index, team, ws } = useLineup();
  const { setOpen } = useInspector();
  const { columns, rows } = athleteMatrix(index, team.id);
  const multiDay = index.days.length > 1;
  if (columns.length === 0) {
    return (
      <EmptyState
        title="No entries yet"
        description="Add entries in the by-event view, then come back here to see who races when."
      />
    );
  }
  const busy = rows.filter((r) => r.races >= BUSY).length;
  return (
    <div className="flex flex-col gap-3" style={teamStyle(team.colorKey)}>
      <p className="text-base text-ink-2">
        {busy > 0
          ? `${busy} ${busy === 1 ? 'athlete races' : 'athletes race'} ${BUSY} or more times.`
          : `No one races ${BUSY} or more times.`}
      </p>
      <ScrollRegion
        label="Athletes by event"
        className="max-w-full overflow-x-auto rounded-card border border-line bg-surface"
      >
        <table className="w-max min-w-full border-collapse text-base">
          <caption className="sr-only">
            {team.name} athletes by event. Cells show the entry and seat.
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-sm font-medium text-ink-2"
              >
                Athlete
              </th>
              <th scope="col" className="px-2 py-2 text-right text-sm font-medium text-ink-2">
                Races
              </th>
              {columns.map((c) => {
                const t = c.event ? eventTitle(c.event, ws.regatta.timezone) : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className="min-w-24 border-l border-line px-2 py-2 text-left align-bottom text-sm font-medium"
                  >
                    {t ? (
                      <span className="flex flex-col">
                        <span className="text-ink-2 tabular-nums">
                          {multiDay && c.event
                            ? `${WEEKDAY.format(new Date(`${c.event.day}T12:00:00Z`))} `
                            : ''}
                          {t.time ?? 'No time'}
                        </span>
                        <span>{t.number ?? t.name}</span>
                      </span>
                    ) : (
                      'Unscheduled'
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const many = r.races >= BUSY;
              const home = r.borrowed ? index.teamById.get(r.athlete.teamId) : null;
              return (
                <tr
                  key={r.athlete.id}
                  className={cn('border-b border-line last:border-b-0', many && 'bg-accent-tint')}
                >
                  <th
                    scope="row"
                    className={cn(
                      'sticky left-0 z-10 px-3 py-1.5 text-left font-normal',
                      many ? 'bg-accent-tint' : 'bg-surface',
                    )}
                  >
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className={cn(!r.available && 'text-ink-2 line-through')}>
                        {athleteName(r.athlete)}
                      </span>
                      <AthleteBadges athlete={r.athlete} />
                      {home && <TeamChip team={home} short size="sm" />}
                    </span>
                  </th>
                  <td
                    className={cn(
                      'px-2 py-1.5 text-right font-display tabular-nums',
                      many ? 'font-semibold text-ink' : 'text-ink-2',
                    )}
                  >
                    {r.races}
                    {many && <span className="sr-only">, racing {BUSY} or more times</span>}
                  </td>
                  {columns.map((c) => {
                    const cells = r.cells.get(c.key) ?? [];
                    return (
                      <td key={c.key} className="border-l border-line px-1 py-1">
                        <span className="flex flex-col gap-0.5">
                          {cells.map((cell) => (
                            <button
                              key={cell.entry.id}
                              type="button"
                              onClick={() => {
                                useLineupUi.getState().select(cell.entry.id);
                                setOpen(true);
                                onShowEntry(cell.entry.id);
                              }}
                              className={cn(
                                'flex h-7 items-center gap-1.5 rounded-control border-l-[3px] border-team bg-team-tint px-1.5 text-left text-sm whitespace-nowrap hover:brightness-95 pointer-coarse:h-11',
                                cell.entry.status === 'scratched' && 'line-through opacity-60',
                              )}
                            >
                              <span className="font-medium">{cell.entry.label}</span>
                              <span className="font-display text-ink-2 tabular-nums">
                                {cell.seat === 'cox' ? 'Cox' : cell.seat}
                              </span>
                            </button>
                          ))}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
