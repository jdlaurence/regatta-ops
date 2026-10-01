// The lineup sheet: one page per team per day, entries in time order, each with its event, stage,
// time, shell and oars, and its crew, then a roster footer listing who is unboated. The crew is a
// boat stood on end, as on the lineup page (cards in a grid, cox on top, stroke down to bow), or
// a names list in the same order. Hot seat plans print under the crew.

import {
  athleteName,
  entrySeatSides,
  type Athlete,
  type PublishedEntry,
  type Seat,
} from '@regatta-ops/domain';
import type { RegattaWorkingSet } from '@/data';
import { BoatStrip, type SeatOccupant } from '@/components/BoatStrip';
import { teamStyle } from '@/lib/team-colors';
import { PrintSheet, SheetHeader } from './PrintFrame';
import type { SheetPage } from './derive';
import {
  dayHeading,
  eventText,
  oarText,
  paperSeatOrder,
  seatText,
  stageText,
  timeText,
} from './format';
import { SourceMeta } from './parts';

export type BoatsStyle = 'strip' | 'names';

function occupants(entry: PublishedEntry): Partial<Record<Seat, SeatOccupant>> {
  const out: Partial<Record<Seat, SeatOccupant>> = {};
  for (const s of entry.seats) {
    if (!s.athleteId) continue;
    out[s.seat] = { id: s.athleteId, name: s.athleteName ?? 'Unknown athlete' };
  }
  return out;
}

function NamesList({ entry }: { entry: PublishedEntry }) {
  const bySeat = new Map(entry.seats.map((s) => [s.seat, s]));
  const order = paperSeatOrder(entry.boatClass);
  return (
    <ol
      className="flex flex-wrap gap-x-4 gap-y-0.5 text-base"
      aria-label="Crew, cox first, then stroke to bow"
    >
      {order.map((seat) => {
        const s = bySeat.get(seat);
        return (
          <li key={seat} className="flex items-baseline gap-1.5">
            <span className="font-display text-xs font-semibold text-ink-2 tabular-nums">
              {seatText(seat)}
            </span>
            {s?.athleteId ? (
              <span className="font-medium">{s.athleteName ?? 'Unknown athlete'}</span>
            ) : (
              <span className="text-ink-2">empty</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function HotSeatPlans({ entry }: { entry: PublishedEntry }) {
  const plans = (entry.hotSeatPlan ?? '').split('\n').filter((p) => p.trim());
  return plans.map((plan) => (
    <p key={plan} className="mt-1.5 text-sm">
      <span className="font-medium">Hot seat:</span> {plan}
    </p>
  ));
}

/** One entry as a row: time, label, event, equipment, then the crew as a names list. */
export function EntryBlock({ entry, ws }: { entry: PublishedEntry; ws: RegattaWorkingSet }) {
  const tz = ws.regatta.timezone;
  const oars = oarText(entry, ws.byId.oarSets);
  const stage = stageText(entry.stage);
  return (
    <article
      aria-label={`${entry.label}, ${timeText(entry.scheduledAt, tz)}`}
      className="break-inside-avoid border-b border-line py-2.5 last:border-b-0"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="w-[84px] shrink-0 font-display text-md font-semibold whitespace-nowrap tabular-nums">
          {entry.day ? timeText(entry.scheduledAt, tz) : ''}
        </span>
        <span className="font-display text-md font-semibold">{entry.label}</span>
        <span className="min-w-0 text-ink-2">
          {eventText(entry)}
          {stage && ` · ${stage}`}
        </span>
        <span className="ml-auto text-sm">
          <span className="text-ink-2">Shell </span>
          <span className="font-medium">{entry.shellName ?? 'none'}</span>
          <span className="text-ink-2"> · Oars </span>
          <span className="font-medium">{oars || 'none'}</span>
        </span>
      </div>
      <div className="mt-1.5">
        <NamesList entry={entry} />
      </div>
      <HotSeatPlans entry={entry} />
    </article>
  );
}

/**
 * One entry as a card: time and label, event, shell, oars, then the boat stood on end. The lines
 * above the boat have fixed heights, so boats side by side start level.
 */
export function EntryCardPrint({ entry, ws }: { entry: PublishedEntry; ws: RegattaWorkingSet }) {
  const tz = ws.regatta.timezone;
  const live = ws.byId.entries.get(entry.entryId);
  const shell = entry.shellId ? ws.byId.shells.get(entry.shellId) : undefined;
  const oars = oarText(entry, ws.byId.oarSets);
  const stage = stageText(entry.stage);
  const event = `${eventText(entry)}${stage ? ` · ${stage}` : ''}`;
  return (
    <article
      aria-label={`${entry.label}, ${timeText(entry.scheduledAt, tz)}`}
      className="flex min-w-0 break-inside-avoid flex-col"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-display text-md font-semibold">{entry.label}</span>
        <span className="shrink-0 font-display text-md font-semibold whitespace-nowrap tabular-nums">
          {entry.day ? timeText(entry.scheduledAt, tz) : ''}
        </span>
      </div>
      <p className="line-clamp-2 h-[2lh] text-sm text-ink-2" title={event}>
        {event}
      </p>
      <p className="truncate text-sm">
        <span className="text-ink-2">Shell </span>
        <span className="font-medium">{entry.shellName ?? 'none'}</span>
      </p>
      <p className="truncate text-sm">
        <span className="text-ink-2">Oars </span>
        <span className="font-medium">{oars || 'none'}</span>
      </p>
      <div className="mt-2">
        <BoatStrip
          size="print"
          orientation="vertical"
          boatClass={entry.boatClass}
          seats={occupants(entry)}
          seatSides={entrySeatSides(
            { boatClass: entry.boatClass, seatSides: live?.seatSides ?? null },
            shell,
          )}
          label={`${entry.label}, ${entry.shellName ?? entry.boatClass}`}
        />
      </div>
      <HotSeatPlans entry={entry} />
    </article>
  );
}

export function RosterFooter({ unboated }: { unboated: Athlete[] }) {
  return (
    <footer className="mt-4 break-inside-avoid border-t-2 border-ink pt-2 text-sm">
      {unboated.length === 0 ? (
        <p>Everyone coming to this regatta is boated.</p>
      ) : (
        <p>
          <span className="font-medium">Unboated ({unboated.length}):</span>{' '}
          {unboated.map((a) => athleteName(a)).join(', ')}
        </p>
      )}
    </footer>
  );
}

export function LineupSheetPage({
  page,
  ws,
  boats,
  unboated,
  printedAt,
}: {
  page: SheetPage;
  ws: RegattaWorkingSet;
  boats: BoatsStyle;
  unboated: Athlete[];
  printedAt: string;
}) {
  const { team } = page.lineups;
  const day = dayHeading(page.day);
  return (
    <PrintSheet label={`${team.name} lineups, ${day}`}>
      <SheetHeader
        title={`${team.name} lineups`}
        subtitle={`${ws.regatta.name} · ${day}`}
        accent={teamStyle(team.colorKey)}
        meta={
          <SourceMeta lineups={page.lineups} timeZone={ws.regatta.timezone} printedAt={printedAt} />
        }
      />
      {page.entries.length === 0 ? (
        <p className="py-4 text-base text-ink-2">
          {page.day
            ? `No ${team.name} entries on ${day}.`
            : `No ${team.name} entries yet. Add them on the Lineups page, then print again.`}
        </p>
      ) : boats === 'strip' ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] items-start gap-x-5 gap-y-6 pt-1">
          {page.entries.map((e) => (
            <EntryCardPrint key={e.entryId} entry={e} ws={ws} />
          ))}
        </div>
      ) : (
        <div>
          {page.entries.map((e) => (
            <EntryBlock key={e.entryId} entry={e} ws={ws} />
          ))}
        </div>
      )}
      <RosterFooter unboated={unboated} />
    </PrintSheet>
  );
}
