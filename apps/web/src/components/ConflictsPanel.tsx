// The conflicts panel (PLAN.md §4.4, §4.5, §5.3): every finding for a regatta, grouped by
// severity, filterable to one team, each with its message, the teams involved, one-click links
// to the entries, and "Acknowledge hot seat" for hot seats. Shown in the default inspector and
// on the schedule page (as a tab on narrow screens).

import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { clockAt, isHotSeat, type Finding, type Severity } from '@srt/domain';
import {
  countBySeverity,
  findingsForTeam,
  useCan,
  useFindings,
  type RegattaWorkingSet,
} from '@/data';
import { lineupEntryPath } from '@/app/nav-items';
import { cn } from '@/lib/cn';
import { AcknowledgeHotSeatDialog } from './AcknowledgeHotSeatDialog';
import { ConflictBadge, ConflictIcon } from './ConflictBadge';
import { TeamChip } from './chips';
import { useInspectorStore } from './Inspector';
import { ErrorState, Skeleton } from './states';
import { Button } from './ui/button';
import { Select } from './ui/select';

export interface ConflictsPanelProps {
  regattaId: string;
  /** Start filtered to this team (the lineups page passes its team). Key the panel to reset. */
  teamId?: string | null;
  /** Findings shown per severity before "Show more". Default 8. */
  limit?: number;
  /** Called after a link to an entry is followed. */
  onNavigate?: (entryId: string) => void;
  className?: string;
}

export const SEVERITY_GROUPS: { severity: Severity; heading: string }[] = [
  { severity: 'error', heading: 'Errors' },
  { severity: 'warning', heading: 'Warnings' },
  { severity: 'info', heading: 'Notes' },
];

const SEVERITY_WORD: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Note',
};

/** Findings split by severity, in the engine's order within each group. Pure; exported for tests. */
export function groupFindings(
  findings: readonly Finding[],
  teamId: string | null = null,
): Record<Severity, Finding[]> {
  const list = teamId ? findingsForTeam(findings, teamId) : findings;
  const out: Record<Severity, Finding[]> = { error: [], warning: [], info: [] };
  for (const f of list) out[f.severity].push(f);
  return out;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** "Boys 2V8 at 8:16" (with the weekday on multi-day regattas: "Boys 2V8, Fri 8:16"). */
export function entryLinkText(ws: RegattaWorkingSet, entryId: string): string {
  const entry = ws.byId.entries.get(entryId);
  if (!entry) return 'Entry';
  const team = ws.byId.teams.get(entry.teamId);
  const name = `${team?.shortName || team?.name || ''} ${entry.label}`.trim();
  const event = entry.eventId ? ws.byId.events.get(entry.eventId) : undefined;
  if (!event?.scheduledAt) return name;
  const time = clockAt(event.scheduledAt, ws.regatta.timezone);
  if (ws.regatta.startDate === ws.regatta.endDate) return `${name} at ${time}`;
  return `${name}, ${WEEKDAY.format(new Date(`${event.day}T12:00:00Z`))} ${time}`;
}

export function ConflictsPanel({
  regattaId,
  teamId = null,
  limit = 8,
  onNavigate,
  className,
}: ConflictsPanelProps) {
  const { findings, isLoading, isError, error, refetch, workingSet } = useFindings(regattaId);
  const [team, setTeam] = useState<string | null>(teamId);
  const [expanded, setExpanded] = useState<Partial<Record<Severity, boolean>>>({});
  const [acking, setAcking] = useState<Finding | null>(null);
  const canEdit = useCan('regatta.edit');
  const isDesktop = useInspectorStore((s) => s.isDesktop);
  const setInspectorOpen = useInspectorStore((s) => s.setOpen);

  const teams = workingSet?.participatingTeams ?? [];
  const activeTeam = team && workingSet?.byId.teams.has(team) ? team : null;
  const groups = useMemo(() => groupFindings(findings, activeTeam), [findings, activeTeam]);
  const shown = useMemo(() => [...groups.error, ...groups.warning, ...groups.info], [groups]);
  const counts = countBySeverity(shown);
  const teamName = activeTeam ? workingSet?.byId.teams.get(activeTeam)?.name : null;

  const followed = (entryId: string) => {
    // A slide-over would cover the page it just opened.
    if (!isDesktop) setInspectorOpen(false);
    onNavigate?.(entryId);
  };

  return (
    <section
      aria-labelledby={`conflicts-${regattaId}`}
      className={cn('flex flex-col gap-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`conflicts-${regattaId}`} className="text-md font-medium">
          Conflicts{' '}
          {!isLoading && !isError && (
            <span className="ml-0.5 text-ink-2 tabular-nums">{shown.length}</span>
          )}
        </h3>
        <div className="flex gap-1">
          {SEVERITY_GROUPS.map(({ severity }) =>
            counts[severity] > 0 ? (
              <ConflictBadge key={severity} severity={severity} count={counts[severity]} />
            ) : null,
          )}
        </div>
      </div>

      {teams.length > 1 && (
        <Select
          label="Show conflicts for"
          value={activeTeam ?? 'all'}
          onValueChange={(v) => setTeam(v === 'all' ? null : v)}
          options={[
            { value: 'all', label: 'All teams' },
            ...teams.map((t) => ({ value: t.id, label: t.name })),
          ]}
          className="w-full"
        />
      )}

      {isLoading && (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading conflicts">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      )}
      {isError && <ErrorState title="Conflicts did not load." error={error} onRetry={refetch} />}
      {!isLoading && !isError && shown.length === 0 && (
        <p className="text-base leading-prose text-ink-2">
          {teamName
            ? `No conflicts for ${teamName}. Its shells, oars, and athletes are clear.`
            : 'No conflicts. Shells, oars, and athletes are clear for every scheduled race.'}
        </p>
      )}

      {workingSet &&
        SEVERITY_GROUPS.map(({ severity, heading }) => {
          const list = groups[severity];
          if (list.length === 0) return null;
          const open = expanded[severity] ?? false;
          const visible = open ? list : list.slice(0, limit);
          const hidden = list.length - visible.length;
          return (
            <div key={severity} className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-sm font-medium text-ink-2">
                <ConflictIcon severity={severity} />
                {heading} <span className="tabular-nums">{list.length}</span>
              </h4>
              <ul className="flex flex-col gap-1.5">
                {visible.map((f) => (
                  <FindingItem
                    key={f.id}
                    finding={f}
                    ws={workingSet}
                    regattaId={regattaId}
                    canEdit={canEdit}
                    onAcknowledge={() => setAcking(f)}
                    onFollow={followed}
                  />
                ))}
              </ul>
              {hidden > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setExpanded((e) => ({ ...e, [severity]: true }))}
                >
                  Show {hidden} more
                </Button>
              )}
              {open && list.length > limit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  onClick={() => setExpanded((e) => ({ ...e, [severity]: false }))}
                >
                  Show fewer
                </Button>
              )}
            </div>
          );
        })}

      <AcknowledgeHotSeatDialog
        regattaId={regattaId}
        finding={acking}
        open={!!acking}
        onOpenChange={(o) => !o && setAcking(null)}
      />
    </section>
  );
}

function FindingItem({
  finding: f,
  ws,
  regattaId,
  canEdit,
  onAcknowledge,
  onFollow,
}: {
  finding: Finding;
  ws: RegattaWorkingSet;
  regattaId: string;
  canEdit: boolean;
  onAcknowledge: () => void;
  onFollow: (entryId: string) => void;
}) {
  const hotSeat = isHotSeat(f);
  const later = hotSeat && f.entryIds[1] ? ws.byId.entries.get(f.entryIds[1]) : undefined;
  const plan = f.acknowledged ? later?.hotSeatPlan?.trim() : '';
  const teams = f.teamIds.map((id) => ws.byId.teams.get(id)).filter((t) => !!t);
  const entries = f.entryIds.filter((id) => ws.byId.entries.has(id));

  return (
    <li
      data-finding-id={f.id}
      data-severity={f.severity}
      className="flex flex-col gap-2 rounded-control border border-line bg-surface px-2.5 py-2"
    >
      <div className="flex gap-2">
        <ConflictIcon severity={f.severity} className="mt-0.5" title={SEVERITY_WORD[f.severity]} />
        <p className="min-w-0 text-base leading-prose">{f.message}</p>
      </div>
      <div className="flex flex-col gap-1.5 pl-5.5">
        {teams.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {teams.map((t) => (
              <TeamChip key={t.id} team={t} short size="sm" />
            ))}
          </div>
        )}
        {entries.length > 0 && (
          <ul aria-label="Entries" className="flex flex-wrap gap-x-3 gap-y-0.5">
            {entries.map((id) => {
              const entry = ws.byId.entries.get(id)!;
              return (
                <li key={id}>
                  <Link
                    to={lineupEntryPath(regattaId, entry.teamId, id)}
                    onClick={() => onFollow(id)}
                    className="inline-flex min-h-7 items-center text-sm font-medium text-accent underline-offset-4 hover:underline pointer-coarse:min-h-11"
                  >
                    {entryLinkText(ws, id)}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {plan && (
          <p className="text-sm leading-prose text-ink-2">
            <span className="font-medium text-ink">Plan:</span> {plan}
          </p>
        )}
        {hotSeat && canEdit && (
          <Button
            size="sm"
            variant={f.acknowledged ? 'ghost' : 'secondary'}
            className="self-start"
            onClick={onAcknowledge}
          >
            {f.acknowledged ? 'Edit plan' : 'Acknowledge hot seat'}
          </Button>
        )}
      </div>
    </li>
  );
}
