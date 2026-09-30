// The lineup sheet (PLAN.md §4.11): one page per team per day, entries in time order, each with
// its event, stage, time, shell and oars, a compact boat strip (or a names list, cox first then
// stroke to bow), hot seat plans, and a roster footer listing who is unboated.

import {
  athleteName,
  entrySeatSides,
  type Athlete,
  type PublishedEntry,
  type Seat,
} from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';
import { BoatSeat, BoatStrip, type BoatSeatProps, type SeatOccupant } from '@/components/BoatStrip';
import { cn } from '@/lib/cn';
import { teamStyle } from '@/lib/team-colors';
import { PrintSheet, SheetHeader } from './PrintFrame';
import type { SheetPage } from './derive';
import {
  dayHeading,
  eventText,
  oarText,
  paperSeatOrder,
  seatText,
  shortName,
  stageText,
  timeText,
} from './format';
import { SourceMeta } from './parts';

export type BoatsStyle = 'strip' | 'names';

function occupants(entry: PublishedEntry): Partial<Record<Seat, SeatOccupant>> {
  const out: Partial<Record<Seat, SeatOccupant>> = {};
  // An eight's seats are narrow on a portrait page: first name and last initial fit.
  const tight = entry.boatClass === '8+';
  for (const s of entry.seats) {
    if (!s.athleteId) continue;
    const name = s.athleteName ?? 'Unknown athlete';
    out[s.seat] = {
      id: s.athleteId,
      name: tight ? shortName(name) : name,
      shortName: shortName(name),
    };
  }
  return out;
}

/**
 * A rowing seat on paper: the seat number above the name, so the name gets the seat's full
 * width (an eight's seats are about 70 px wide on a portrait page). Same hull look as BoatSeat:
 * dashed empty seats and a rigger tick on the seat's side. The cox keeps BoatSeat.
 */
function PrintSeat(props: BoatSeatProps) {
  const { seat } = props;
  if (seat.isCox) return <BoatSeat {...props} />;
  const o = seat.occupant;
  return (
    <div
      data-seat={seat.seat}
      data-empty={o ? undefined : ''}
      className={cn(
        'relative flex h-full min-w-0 flex-1 basis-0 flex-col justify-center border-l border-line px-1 first:border-l-0',
        !o && 'items-center',
      )}
    >
      <span className="sr-only">{seat.label}</span>
      {!o && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 inset-y-1.5 rounded-control border border-dashed border-line-strong"
        />
      )}
      <span
        aria-hidden
        className="relative font-display text-xs leading-none font-semibold text-ink-2 tabular-nums"
      >
        {seat.seat}
      </span>
      {o && (
        <span aria-hidden className="relative truncate text-xs leading-tight font-medium text-ink">
          {o.name}
        </span>
      )}
      {seat.side && (
        <span
          aria-hidden
          className={cn(
            'absolute left-1/2 h-[2px] w-2.5 -translate-x-1/2 bg-team',
            seat.side === 'port' ? 'bottom-0' : 'top-0',
          )}
        />
      )}
    </div>
  );
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

export function EntryBlock({
  entry,
  ws,
  boats,
}: {
  entry: PublishedEntry;
  ws: RegattaWorkingSet;
  boats: BoatsStyle;
}) {
  const tz = ws.regatta.timezone;
  const live = ws.byId.entries.get(entry.entryId);
  const shell = entry.shellId ? ws.byId.shells.get(entry.shellId) : undefined;
  const oars = oarText(entry, ws.byId.oarSets);
  const stage = stageText(entry.stage);
  const plans = (entry.hotSeatPlan ?? '').split('\n').filter((p) => p.trim());
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
        {boats === 'strip' ? (
          <>
            {/* On a phone screen an eight's seats are too narrow for names: list them there. */}
            <div className="hidden sm:block print:block">
              <BoatStrip
                size="print"
                boatClass={entry.boatClass}
                seats={occupants(entry)}
                coxPosition={shell?.coxPosition}
                seatSides={entrySeatSides(
                  { boatClass: entry.boatClass, seatSides: live?.seatSides ?? null },
                  shell,
                )}
                label={`${entry.label}, ${entry.shellName ?? entry.boatClass}`}
                renderSeat={(seat, props) => <PrintSeat key={seat.seat} {...props} />}
              />
            </div>
            <div className="sm:hidden print:hidden">
              <NamesList entry={entry} />
            </div>
          </>
        ) : (
          <NamesList entry={entry} />
        )}
      </div>
      {plans.map((plan) => (
        <p key={plan} className="mt-1.5 text-sm">
          <span className="font-medium">Hot seat:</span> {plan}
        </p>
      ))}
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
      ) : (
        <div>
          {page.entries.map((e) => (
            <EntryBlock key={e.entryId} entry={e} ws={ws} boats={boats} />
          ))}
        </div>
      )}
      <RosterFooter unboated={unboated} />
    </PrintSheet>
  );
}
