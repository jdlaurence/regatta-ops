// The lineup grid (PLAN.md §4.11), the layout the club publishes today: events as columns with
// their time trial and final times in the header rows, seats as rows (cox, then stroke down to
// bow), names in cells. One grid for eights, one for fours and smaller boats. Landscape.

import type { RegattaWorkingSet } from '@/data';
import { teamStyle } from '@/lib/team-colors';
import { cn } from '@/lib/cn';
import { ScrollRegion } from '@/components/ScrollRegion';
import { PrintSheet, SheetHeader } from './PrintFrame';
import { chunkColumns, type GridTable, type TeamLineups } from './derive';
import { seatText, stageText } from './format';
import { SourceMeta } from './parts';

/** Columns per table on a landscape page before the grid continues below. */
export const GRID_COLUMNS_PER_TABLE = 11;

const cell = 'border border-line-strong px-1.5 py-1 align-top';

function GridTableView({ table, part }: { table: GridTable; part: string }) {
  return (
    <table className="w-full min-w-[720px] table-fixed break-inside-avoid border-collapse text-xs">
      <caption className="pb-1 text-left font-display text-md font-semibold">
        {table.title}
        {part}
      </caption>
      <colgroup>
        <col className="w-20" />
        {table.columns.map((c) => (
          <col key={c.key} />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={cn(cell, 'text-left font-medium text-ink-2')}>
            Crew
          </th>
          {table.columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={cn(cell, 'text-left font-display text-base font-semibold')}
            >
              {c.label}
              <span className="block text-xs font-normal font-sans text-ink-2">{c.event}</span>
            </th>
          ))}
        </tr>
        {table.stages.map((stage) => (
          <tr key={stage}>
            <th scope="row" className={cn(cell, 'text-left font-medium text-ink-2')}>
              {stageText(stage)}
            </th>
            {table.columns.map((c) => (
              <td key={c.key} className={cn(cell, 'font-medium tabular-nums')}>
                {c.times[stage] ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.seats.map((seat) => (
          <tr key={seat} className="break-inside-avoid">
            <th
              scope="row"
              className={cn(cell, 'text-left font-display font-semibold tabular-nums')}
            >
              {seatText(seat)}
              {seat === table.seats.find((s) => s !== 'cox') && table.kind === 'eights' && (
                <span className="font-sans font-normal text-ink-2"> stroke</span>
              )}
              {seat === '1' && <span className="font-sans font-normal text-ink-2"> bow</span>}
            </th>
            {table.columns.map((c) => {
              const v = c.cells[seat];
              return (
                <td
                  key={c.key}
                  className={cn(cell, v === undefined && 'bg-surface-2 print:bg-surface')}
                >
                  {v === undefined ? (
                    <span className="sr-only">No such seat</span>
                  ) : v === null ? (
                    <span className="text-ink-2">empty</span>
                  ) : (
                    v
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" className={cn(cell, 'text-left font-medium text-ink-2')}>
            Shell
          </th>
          {table.columns.map((c) => (
            <td key={c.key} className={cn(cell, 'font-medium')}>
              {c.shell}
            </td>
          ))}
        </tr>
        <tr>
          <th scope="row" className={cn(cell, 'text-left font-medium text-ink-2')}>
            Oars
          </th>
          {table.columns.map((c) => (
            <td key={c.key} className={cell}>
              {c.oars}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

export function LineupGridSheet({
  lineups,
  tables,
  ws,
  dayLabel,
  printedAt,
}: {
  lineups: TeamLineups;
  tables: GridTable[];
  ws: RegattaWorkingSet;
  dayLabel: string;
  printedAt: string;
}) {
  const { team } = lineups;
  return (
    <PrintSheet label={`${team.name} lineup grid, ${dayLabel}`} orientation="landscape">
      <SheetHeader
        title={`${team.name} lineups`}
        subtitle={`${ws.regatta.name} · ${dayLabel}`}
        accent={teamStyle(team.colorKey)}
        meta={<SourceMeta lineups={lineups} timeZone={ws.regatta.timezone} printedAt={printedAt} />}
      />
      {tables.length === 0 ? (
        <p className="py-4 text-base text-ink-2">No {team.name} entries to print.</p>
      ) : (
        <ScrollRegion
          label="Lineup grid"
          className="flex flex-col gap-5 overflow-x-auto print:overflow-visible"
        >
          {tables.flatMap((t) => {
            const chunks = chunkColumns(t.columns, GRID_COLUMNS_PER_TABLE);
            return chunks.map((columns, i) => (
              <GridTableView
                key={`${t.kind}:${i}`}
                table={{ ...t, columns }}
                part={chunks.length > 1 ? ` (${i + 1} of ${chunks.length})` : ''}
              />
            ));
          })}
        </ScrollRegion>
      )}
    </PrintSheet>
  );
}
