// /print/regattas/:id/load/:trailerId (PLAN.md §4.8, §4.11, §6.12): the load sheet. The trailer
// end view, then shelf by shelf from the top level down with the boats the regatta's load plan
// puts there, then the bed's zones front to back with what rides in each (§4.9), then the
// checklist of what rides on this trailer with empty Loaded and Returned boxes to tick at the
// boathouse.

import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  BOAT_CLASS_SPECS,
  placementFromRecord,
  shellLabel,
  trailerDefFromRecords,
  type LoadPlacement,
} from '@srt/domain';
import { useRegattaWorkingSet, type RegattaWorkingSet } from '@/data';
import { TrailerEndView, type EndViewBoat } from '@/components/trailer';
import { effectiveRules } from '@/features/trailer/lib';
import { useRegattaId, useTrailerIdParam } from '@/app/params';
import { regattaPath } from '@/app/nav-items';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { formatDayRange } from '@/lib/dates';
import { teamStyle } from '@/lib/team-colors';
import { PrintFrame, PrintSheet, SheetHeader, TableScroll, ToolbarField } from './PrintFrame';
import { loadSheet, placementShellText, type LoadSheet } from './derive';
import { printedText, instantText } from './format';
import { TickBox, usePrintedAt } from './parts';

/**
 * The trailer end view at print size (WP-M): the plan's boats on the racks, in team colors,
 * above the shelf-by-shelf table. Hidden when the trailer has no load plan.
 */
export function TrailerDiagramSlot({
  ws,
  sheet,
  placements,
}: {
  ws: RegattaWorkingSet;
  sheet: LoadSheet;
  placements: LoadPlacement[];
}) {
  const { trailer, plan } = sheet;
  const def = useMemo(
    () => trailerDefFromRecords(trailer, ws.shelves, ws.compartments),
    [trailer, ws.shelves, ws.compartments],
  );
  const rules = useMemo(() => effectiveRules(trailer, plan), [trailer, plan]);
  const boats = useMemo((): EndViewBoat[] => {
    const teamOf = new Map(
      sheet.shelves.flatMap((s) => s.placements.map((p) => [p.placement.shellId, p.teams[0]])),
    );
    return placements.flatMap((p) => {
      const shell = ws.byId.shells.get(p.shellId);
      if (!shell) return [];
      const team = teamOf.get(p.shellId);
      return [
        {
          shellId: shell.id,
          name: shellLabel(shell),
          cls: shell.boatClass,
          beamCm: shell.beamCm ?? BOAT_CLASS_SPECS[shell.boatClass].defaultBeamCm,
          teamColor: team?.colorKey ?? null,
          teamName: team?.name,
        },
      ];
    });
  }, [placements, sheet, ws.byId.shells]);
  if (!plan) return null;
  return (
    <div data-slot="trailer-end-view" className="mb-4 break-inside-avoid">
      <TableScroll label="End view">
        <TrailerEndView
          trailer={def}
          rules={rules}
          placements={placements.map(placementFromRecord)}
          boats={boats}
          width={680}
          label={`${trailer.name}, end view, seen from the back`}
        />
      </TableScroll>
    </div>
  );
}

const th = 'border-b-2 border-ink px-1.5 py-1 text-left text-sm font-medium text-ink-2';
const td = 'border-b border-line px-1.5 py-1.5 align-top';

function ShelvesTable({ sheet }: { sheet: LoadSheet }) {
  return (
    <TableScroll label="Shelves">
      <table className="w-full min-w-[560px] border-collapse text-base">
        <caption className="pb-1 text-left font-display text-md font-semibold">Shelves</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(th, 'w-[72px]')}>
              Level
            </th>
            <th scope="col" className={th}>
              Side
            </th>
            <th scope="col" className={cn(th, 'w-[88px]')}>
              Lane
            </th>
            <th scope="col" className={th}>
              Shell
            </th>
            <th scope="col" className={cn(th, 'w-[56px]')}>
              Class
            </th>
            <th scope="col" className={th}>
              Team
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.shelves.map(({ shelf, levelText, sideText, placements }) => {
            const first = (
              <>
                <th
                  scope="row"
                  className={cn(td, 'text-left font-display font-semibold tabular-nums')}
                >
                  {levelText}
                </th>
                <td className={td}>{sideText}</td>
              </>
            );
            if (placements.length === 0) {
              return (
                <tr key={shelf.id} className="break-inside-avoid">
                  {first}
                  <td colSpan={4} className={cn(td, 'text-ink-2')}>
                    {shelf.active ? 'Empty' : 'Not in use'}
                  </td>
                </tr>
              );
            }
            return placements.map((p, i) => (
              <tr key={p.placement.id} className="break-inside-avoid">
                {i === 0 ? (
                  first
                ) : (
                  <>
                    <td className={td} aria-hidden />
                    <td className={td} aria-hidden />
                  </>
                )}
                <td className={cn(td, 'tabular-nums')}>{p.laneText}</td>
                <td className={cn(td, 'font-medium')}>{placementShellText(p.shell)}</td>
                <td className={cn(td, 'font-display font-semibold')}>{p.shell?.boatClass ?? ''}</td>
                <td className={td}>
                  <span className="flex flex-wrap gap-x-2">
                    {p.teams.map((t) => (
                      <span
                        key={t.id}
                        style={teamStyle(t.colorKey)}
                        className="border-l-[3px] border-team pl-1.5"
                      >
                        {t.shortName || t.name}
                      </span>
                    ))}
                  </span>
                </td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </TableScroll>
  );
}

/** The bed's zones, front to back, and what rides in each (riggers at the back on SRA's). */
function BedTable({ sheet }: { sheet: LoadSheet }) {
  if (sheet.bed.length === 0) return null;
  return (
    <div className="mt-6">
      <TableScroll label="Bed">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-base">
          <caption className="pb-1 text-left font-display text-md font-semibold">
            Bed, front to back
          </caption>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[26%]" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={th}>
                Zone
              </th>
              <th scope="col" className={th}>
                Where
              </th>
              <th scope="col" className={th}>
                What rides there
              </th>
            </tr>
          </thead>
          <tbody>
            {sheet.bed.map((z) => (
              <tr key={z.id} className="break-inside-avoid">
                <th scope="row" className={cn(td, 'text-left font-medium')}>
                  {z.name}
                </th>
                <td className={td}>
                  {z.extent[0]!.toUpperCase() + z.extent.slice(1)}
                  {z.length && <span className="text-ink-2 tabular-nums"> ({z.length})</span>}
                </td>
                <td className={td}>
                  {z.rows.length === 0 ? (
                    <span className="text-ink-2">Nothing assigned yet</span>
                  ) : (
                    z.rows
                      .map((r) => (r.quantity > 1 ? `${r.label} × ${r.quantity}` : r.label))
                      .join(', ')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function Checklist({ sheet }: { sheet: LoadSheet }) {
  if (sheet.groups.length === 0) {
    return <p className="text-base text-ink-2">Nothing on the load list for this trailer yet.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sheet.groups.map((g) => (
        <TableScroll key={g.kind} label={g.title}>
          <table className="w-full min-w-[560px] table-fixed border-collapse text-base">
            <caption className="pb-1 text-left font-display text-md font-semibold">
              {g.title}
            </caption>
            <colgroup>
              <col className="w-[64px]" />
              <col className="w-[72px]" />
              <col />
              <col className="w-[48px]" />
              <col className="w-[36%]" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={cn(th, 'text-center')}>
                  Loaded
                </th>
                <th scope="col" className={cn(th, 'text-center')}>
                  Returned
                </th>
                <th scope="col" className={th}>
                  Item
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  Qty
                </th>
                <th scope="col" className={th}>
                  Where
                </th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.key} className="break-inside-avoid">
                  <td className={cn(td, 'text-center')}>
                    <TickBox />
                  </td>
                  <td className={cn(td, 'text-center')}>
                    <TickBox />
                  </td>
                  <td className={cn(td, 'font-medium')}>
                    {r.label}
                    {(r.orphaned || r.spare) && (
                      <span className="font-normal text-ink-2"> (spare, no entry uses it)</span>
                    )}
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>{r.quantity}</td>
                  <td
                    className={cn(td, r.unassigned ? 'font-medium text-warn print:text-ink' : '')}
                  >
                    {r.where}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ))}
    </div>
  );
}

export default function PrintLoadPage() {
  const regattaId = useRegattaId();
  const trailerId = useTrailerIdParam();
  const navigate = useNavigate();
  const ws = useRegattaWorkingSet(regattaId);
  const data = ws.data;
  const printedAt = usePrintedAt();
  const sheet = useMemo(
    () => (data && trailerId ? loadSheet(data, trailerId) : null),
    [data, trailerId],
  );
  const title = sheet ? `Load sheet: ${sheet.trailer.name}` : 'Load sheet';

  const controls = data && data.trailers.length > 1 && trailerId && (
    <ToolbarField label="Trailer">
      <Select
        label="Trailer"
        value={trailerId}
        onValueChange={(v) => navigate(`/print/regattas/${regattaId}/load/${v}`, { replace: true })}
        options={data.trailers.map((t) => ({ value: t.id, label: t.name }))}
        className="h-8 min-w-40"
      />
    </ToolbarField>
  );

  let body: ReactNode = null;
  if (data && !sheet) {
    body = (
      <p className="w-full max-w-[210mm] rounded-card border border-line bg-surface p-5 text-ink-2">
        This trailer does not exist. Go back and pick another.
      </p>
    );
  } else if (data && sheet) {
    const tz = data.regatta.timezone;
    const placements = sheet.plan
      ? data.placements.filter((p) => p.loadPlanId === sheet.plan!.id)
      : [];
    const placed = sheet.shelves.reduce((n, s) => n + s.placements.length, 0);
    body = (
      <PrintSheet label={`${sheet.trailer.name} load sheet`}>
        <SheetHeader
          title={`${sheet.trailer.name} load sheet`}
          subtitle={`${data.regatta.name} · ${formatDayRange(data.regatta.startDate, data.regatta.endDate)}`}
          meta={
            <>
              <span className="block font-medium text-ink">
                {sheet.plan
                  ? `Load plan: ${sheet.plan.status === 'final' ? 'final' : 'draft'}, ${placed} ${placed === 1 ? 'boat' : 'boats'}`
                  : 'No load plan yet'}
              </span>
              {sheet.plan?.packedAt && (
                <span className="block">Packed {instantText(sheet.plan.packedAt, tz)}</span>
              )}
              <span className="block">Printed {printedText(printedAt, tz)}</span>
            </>
          }
        />
        <TrailerDiagramSlot ws={data} sheet={sheet} placements={placements} />
        {!sheet.plan && (
          <p className="mb-4 text-base text-ink-2">
            No boats are placed on this trailer for this regatta. Pack the trailer on the Trailer
            page, then print again.
          </p>
        )}
        <ShelvesTable sheet={sheet} />
        <BedTable sheet={sheet} />
        <section aria-label="Checklist" className="mt-6">
          <h3 className="mb-2 font-display text-lg font-semibold">Checklist</h3>
          <Checklist sheet={sheet} />
          {sheet.elsewhere.length > 0 && (
            <p className="mt-3 text-sm text-ink-2">
              Loaded elsewhere: {sheet.elsewhere.map((e) => `${e.where} (${e.count})`).join(', ')}.
              See the load list.
            </p>
          )}
        </section>
      </PrintSheet>
    );
  }

  return (
    <PrintFrame
      title={title}
      backTo={regattaPath(regattaId, trailerId ? `trailer/${trailerId}` : 'trailer')}
      controls={controls || undefined}
      state={ws}
    >
      {body}
    </PrintFrame>
  );
}
