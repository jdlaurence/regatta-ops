// "Copy lineups from" a previous regatta for the same team (PLAN.md §4.4 Copy and move): pick
// the regatta, preview how its entries map onto this regatta's events (by name, then category,
// then a lone event of the class), untick what you do not want, and create them as drafts.

import { useId, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { shellLabel, type Regatta } from '@srt/domain';
import { useList } from '@/data';
import { formatDayRange } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { useLineup } from './context';
import { eventTitleText, planCopy, type CopyRow } from './lib';
import { useLineupUi } from './store';

const MATCH_TEXT: Record<CopyRow['match'], string> = {
  name: 'Same event name',
  category: 'Same category',
  class: 'Only event of this class',
  none: 'No matching event; copies as unscheduled',
};

function Preview({ source }: { source: Regatta }) {
  const { ws, index, team, actions } = useLineup();
  const ui = useLineupUi.getState;
  const events = useList('events', { where: { regattaId: source.id } });
  const entries = useList('entries', { where: { regattaId: source.id, teamId: team.id } });
  const entryIds = useMemo(() => (entries.data ?? []).map((e) => e.id), [entries.data]);
  const seats = useList('entry_seats', { in: { entryId: entryIds } }, { enabled: !!entries.data });
  const rows = useMemo(() => {
    if (!events.data || !entries.data || !seats.data) return null;
    return planCopy({
      sourceEntries: entries.data,
      sourceEvents: events.data,
      sourceSeats: seats.data,
      targetEvents: ws.events,
      targetEntries: ws.entries.filter((e) => e.teamId === team.id),
      athletes: index.athleteById,
    });
  }, [events.data, entries.data, seats.data, ws, team.id, index]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const checked =
    picked ?? new Set((rows ?? []).filter((r) => r.suggested).map((r) => r.source.id));

  const failed = [events, entries, seats].find((q) => q.isError);
  if (failed) {
    return (
      <ErrorState
        title="That regatta's entries did not load."
        error={failed.error}
        onRetry={() => [events, entries, seats].forEach((q) => void q.refetch())}
      />
    );
  }
  if (!rows) return <SkeletonRows rows={4} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing to copy"
        description={`${team.name} has no entries at ${source.name}. Pick another regatta.`}
      />
    );
  }
  const toggle = (id: string, on: boolean) => {
    const next = new Set(checked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };
  const chosen = rows.filter((r) => checked.has(r.source.id));
  const sourceEvents = new Map((events.data ?? []).map((e) => [e.id, e]));
  return (
    <>
      <ul className="flex max-h-[50dvh] flex-col divide-y divide-line overflow-y-auto rounded-control border border-line">
        {rows.map((r) => {
          const id = `copy-${r.source.id}`;
          const shell = r.source.shellId ? index.shellById.get(r.source.shellId) : null;
          const srcEvent = r.source.eventId ? sourceEvents.get(r.source.eventId) : null;
          return (
            <li key={r.source.id} className="flex items-start gap-3 px-3 py-2.5">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={checked.has(r.source.id)}
                onCheckedChange={(v) => toggle(r.source.id, v === true)}
              />
              <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2 text-base font-medium">
                  {r.source.label}
                  <ArrowRight aria-hidden className="size-3.5 text-ink-2" />
                  <span className="sr-only">to</span>
                  <span className="font-normal">
                    {r.target ? eventTitleText(r.target, ws.regatta.timezone) : 'Unscheduled'}
                  </span>
                </span>
                <span className="text-sm text-ink-2">
                  {srcEvent ? `From ${srcEvent.name}. ` : ''}
                  {MATCH_TEXT[r.match]}. {r.seats.length}{' '}
                  {r.seats.length === 1 ? 'athlete' : 'athletes'}
                  {r.skipped > 0 && ` (${r.skipped} no longer on a roster)`}
                  {shell ? ` · ${shellLabel(shell)}` : ''}
                  {r.source.status === 'scratched' ? ' · was scratched' : ''}
                </span>
                {r.duplicate && (
                  <span className="text-sm text-warn">
                    This event already has a {r.duplicate.label}; copying adds a second crew.
                  </span>
                )}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-2">
        Copies start as drafts. Shells and oars carry over; check the conflict badges after.
      </p>
      <DialogFooter>
        <Button onClick={() => ui().openDialog(null)}>Cancel</Button>
        <Button
          variant="primary"
          disabled={chosen.length === 0}
          onClick={() => {
            void actions.copyRows(chosen);
            ui().openDialog(null);
          }}
        >
          {chosen.length === 1 ? 'Copy 1 entry' : `Copy ${chosen.length} entries`}
        </Button>
      </DialogFooter>
    </>
  );
}

export function CopyFromDialog() {
  const { ws, team } = useLineup();
  const selectId = useId();
  const regattas = useList('regattas');
  const racing = useList('regatta_teams', { where: { teamId: team.id } });
  // The team's entries everywhere (a few hundred at most), to count what each regatta offers.
  const teamEntries = useList('entries', { where: { teamId: team.id } });
  const currentId = ws.regatta.id;
  const choices = useMemo(() => {
    if (!regattas.data || !racing.data || !teamEntries.data) return null;
    const ids = new Set(racing.data.map((rt) => rt.regattaId));
    const counts = new Map<string, number>();
    for (const e of teamEntries.data) counts.set(e.regattaId, (counts.get(e.regattaId) ?? 0) + 1);
    return regattas.data
      .filter((r) => r.id !== currentId && ids.has(r.id))
      .map((r) => ({ regatta: r, entries: counts.get(r.id) ?? 0 }))
      .sort((a, b) => b.regatta.startDate.localeCompare(a.regatta.startDate));
  }, [regattas.data, racing.data, teamEntries.data, currentId]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  // Default: the most recent regatta the team has entries at.
  const fallback = choices?.find((c) => c.entries > 0) ?? choices?.[0];
  const source =
    choices?.find((c) => c.regatta.id === (sourceId ?? fallback?.regatta.id))?.regatta ?? null;
  const loadFailed = regattas.isError || racing.isError || teamEntries.isError;

  return (
    <DialogContent
      title="Copy lineups from another regatta"
      description={`${team.name}'s entries from the regatta you pick are matched to this regatta's events.`}
      className="max-w-2xl"
    >
      {loadFailed && (
        <ErrorState
          title="Regattas did not load."
          error={regattas.error ?? racing.error ?? teamEntries.error}
          onRetry={() => {
            void regattas.refetch();
            void racing.refetch();
            void teamEntries.refetch();
          }}
        />
      )}
      {!choices && !loadFailed && <SkeletonRows rows={2} />}
      {choices && choices.length === 0 && (
        <EmptyState
          title="No other regattas for this team"
          description={`${team.name} has not raced another regatta in SRT yet. Build these lineups from the roster instead.`}
        />
      )}
      {choices && source && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={selectId}>Copy from</Label>
            <Select
              id={selectId}
              value={source.id}
              onValueChange={setSourceId}
              options={choices.map(({ regatta: r, entries }) => ({
                value: r.id,
                label: `${r.name} · ${formatDayRange(r.startDate, r.endDate)} · ${
                  entries === 1 ? '1 entry' : `${entries} entries`
                }`,
              }))}
            />
          </div>
          <Preview key={source.id} source={source} />
        </>
      )}
    </DialogContent>
  );
}
