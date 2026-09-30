// The live diagram of the draft trailer, with a test pack (PLAN.md §6.9, §15 Q1): the end view,
// the plan view (a level, or the bed's zones along the length), or the isometric view, drawn
// from the unsaved measurements as they are typed. Pack a sample load or a regatta's boats onto
// them to see whether the numbers make sense before saving. Nothing is written.

import { useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  packTrailer,
  type Id,
  type PackBoat,
  type Rule,
  type TeamColorKey,
  type TrailerDef,
} from '@srt/domain';
import { useList } from '@/data';
import { toEndViewBoats } from '@/components/trailer/boats';
import { sideNamesOf, tierLabel } from '@/components/trailer/labels';
import { SAMPLE_LOADS, sampleEndViewBoats, samplePackBoats } from '@/components/trailer/samples';
import { TrailerEndView, type EndViewBoat } from '@/components/trailer/TrailerEndView';
import { TrailerIsometric } from '@/components/trailer/TrailerIsometric';
import { PlanView, type PlanLevel } from '@/components/trailer/PlanView';
import { SegmentedControl } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { capacitySummary, trailerCapacity } from './capacity';
import { usePlanShellIds, useRegattaBoats, useTrailerLoadPlans } from './hooks';

const NONE = 'none';

/** The end view (default), the plan view, or the isometric view (PLAN.md §4.10). */
type PreviewView = 'end' | 'plan' | 'iso';

const VIEW_TITLES: Record<PreviewView, { title: string; note: string }> = {
  end: { title: 'End view', note: 'Seen from the back' },
  plan: { title: 'Plan view', note: 'One level at a time, or the bed' },
  iso: { title: 'Isometric view', note: 'Seen from behind, on the right side' },
};

function parseChoice(v: string): { kind: 'none' | 'sample' | 'regatta' | 'plan'; id: string } {
  const [kind, ...rest] = v.split(':');
  if (kind === 'sample' || kind === 'regatta' || kind === 'plan')
    return { kind, id: rest.join(':') };
  return { kind: 'none', id: '' };
}

export function TrailerPreview({
  trailer,
  rules,
  savedTrailerId,
  className,
}: {
  trailer: TrailerDef;
  rules: Rule[];
  /** The stored trailer's id, for its regattas' load plans; null for a new one. */
  savedTrailerId: Id | null;
  className?: string;
}) {
  const [choice, setChoice] = useState(NONE);
  const [selected, setSelected] = useState<Id | null>(null);
  const [view, setView] = useState<PreviewView>('end');
  const [level, setLevel] = useState<PlanLevel>(() =>
    Math.max(1, ...trailer.shelves.map((s) => s.tier)),
  );
  const parsed = parseChoice(choice);

  const regattas = useList('regattas', { sort: '-startDate' });
  const plans = useTrailerLoadPlans(savedTrailerId ?? undefined);
  const plan = parsed.kind === 'plan' ? plans.data?.find((p) => p.id === parsed.id) : undefined;
  const planShellIds = usePlanShellIds(plan?.id ?? null);
  const regattaId = parsed.kind === 'regatta' ? parsed.id : (plan?.regattaId ?? null);
  const regatta = useRegattaBoats(regattaId, planShellIds);

  const sample =
    parsed.kind === 'sample' ? SAMPLE_LOADS.find((l) => l.id === parsed.id) : undefined;

  const { boats, viewBoats } = useMemo((): {
    boats: PackBoat[] | null;
    viewBoats: EndViewBoat[];
  } => {
    if (sample) return { boats: samplePackBoats(sample), viewBoats: sampleEndViewBoats(sample) };
    if (parsed.kind === 'regatta' && regatta.boats) {
      return {
        boats: regatta.boats,
        viewBoats: toEndViewBoats(regatta.boats, regatta.teams ?? []),
      };
    }
    if (parsed.kind === 'plan' && regatta.boats && planShellIds) {
      const onPlan = new Set(planShellIds);
      const list = regatta.boats.filter((b) => onPlan.has(b.shellId));
      return { boats: list, viewBoats: toEndViewBoats(list, regatta.teams ?? []) };
    }
    return { boats: null, viewBoats: [] };
  }, [sample, parsed.kind, regatta.boats, regatta.teams, planShellIds]);

  const pack = useMemo(
    () => (boats ? packTrailer(trailer, boats, rules, []) : null),
    [trailer, boats, rules],
  );
  const capacity = useMemo(() => trailerCapacity(trailer, rules), [trailer, rules]);
  const boatById = useMemo(() => new Map((boats ?? []).map((b) => [b.shellId, b])), [boats]);
  const teamColors = useMemo(() => {
    const colorOf = new Map(viewBoats.map((b) => [b.shellId, b.teamColor]));
    const out = new Map<Id, TeamColorKey>();
    for (const b of boats ?? []) {
      const color = colorOf.get(b.shellId);
      if (color && b.teamId) out.set(b.teamId, color);
    }
    return out;
  }, [boats, viewBoats]);
  const nameOf = new Map(viewBoats.map((b) => [b.shellId, b.name]));
  const selectedPlacement = pack?.placements.find((p) => p.shellId === selected);
  const regattaName = new Map((regattas.data ?? []).map((r) => [r.id, r.name]));

  const options = [
    { value: NONE, label: 'No boats' },
    ...SAMPLE_LOADS.map((l) => ({ value: `sample:${l.id}`, label: l.label })),
    ...(plans.data ?? []).map((p) => ({
      value: `plan:${p.id}`,
      label: `${regattaName.get(p.regattaId) ?? 'A regatta'}: this trailer’s load plan`,
    })),
    ...(regattas.data ?? [])
      .filter((r) => r.status !== 'archived')
      .map((r) => ({ value: `regatta:${r.id}`, label: `${r.name}: every boat racing` })),
  ];
  const sides = sideNamesOf(trailer);
  // The unplaced boats have their own list, with reasons.
  const warnings = (pack?.warnings ?? []).filter((w) => !/\bnot placed:/.test(w));
  const loading = parsed.kind !== 'none' && parsed.kind !== 'sample' && !boats;

  return (
    <section aria-label="Trailer diagram and test pack" className={className}>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-semibold">{VIEW_TITLES[view].title}</h2>
            <p className="text-sm text-ink-2">{VIEW_TITLES[view].note}</p>
          </div>
          <SegmentedControl
            size="sm"
            label="Trailer view"
            value={view}
            onValueChange={setView}
            options={[
              { value: 'end', label: 'End view' },
              { value: 'plan', label: 'Plan view' },
              { value: 'iso', label: 'Isometric' },
            ]}
          />
        </div>
        <p className="text-sm text-ink-2">{capacitySummary(capacity)}</p>
        {view === 'end' ? (
          <TrailerEndView
            trailer={trailer}
            rules={rules}
            placements={pack?.placements ?? []}
            boats={viewBoats}
            selectedShellId={selected}
            onChipClick={(id) => setSelected((s) => (s === id ? null : id))}
            animateMoves
          />
        ) : view === 'plan' ? (
          <PlanView
            trailer={trailer}
            rules={rules}
            placements={pack?.placements ?? []}
            boatById={boatById}
            teamColors={teamColors}
            selectedShellId={selected}
            onSelect={(id) => setSelected((s) => (s === id ? null : id))}
            level={level}
            onLevelChange={setLevel}
          />
        ) : (
          <TrailerIsometric
            trailer={trailer}
            rules={rules}
            placements={pack?.placements ?? []}
            boats={viewBoats}
            selectedShellId={selected}
          />
        )}

        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <Label htmlFor="test-load">Test pack</Label>
          <Select
            id="test-load"
            value={choice}
            onValueChange={(v) => {
              setChoice(v);
              setSelected(null);
            }}
            options={options}
            className="w-full"
          />
          <p className="text-sm text-ink-2">
            Packs the boats onto the measurements and rules on this page, saved or not. Nothing is
            written.
          </p>
        </div>

        {loading && <p className="text-sm text-ink-2">Loading the boats…</p>}
        {pack && boats && (
          <div className="flex flex-col gap-3" aria-live="polite">
            <p className="text-base text-ink">
              <span className="font-display font-semibold tabular-nums">
                {pack.placements.length} of {boats.length}
              </span>{' '}
              {boats.length === 1 ? 'boat' : 'boats'} placed.
              {boats.length > 0 && (
                <span className="text-ink-2">
                  {' '}
                  {capitalize(sides.left)} {Math.round(pack.metrics.leftWeightKg)} kg, {sides.right}{' '}
                  {Math.round(pack.metrics.rightWeightKg)} kg.
                </span>
              )}
            </p>
            {pack.unplaced.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium text-ink">Did not fit</h3>
                <ul className="flex flex-col gap-1 text-sm">
                  {pack.unplaced.map((u) => (
                    <li key={u.shellId}>
                      <span className="font-medium">{nameOf.get(u.shellId) ?? 'A boat'}</span>
                      <span className="text-ink-2">
                        : {u.reasons[0]?.text ?? 'No shelf takes it.'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {warnings.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm text-ink">
                {warnings.map((w) => (
                  <li key={w} className="flex items-start gap-1.5">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            )}
            {selectedPlacement ? (
              <div className="flex flex-col gap-1 rounded-control bg-surface-2 p-3">
                <h3 className="text-sm font-medium text-ink">
                  Why here? {nameOf.get(selectedPlacement.shellId)},{' '}
                  {tierLabel(
                    trailer,
                    trailer.shelves.find((s) => s.id === selectedPlacement.shelfId)?.tier ?? 0,
                  ).toLowerCase()}
                </h3>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {selectedPlacement.reasons.map((r) => (
                    <li key={r.ruleId + r.text} className="flex justify-between gap-3">
                      <span>
                        {r.text}
                        <span className="text-ink-2"> ({r.hard ? 'must' : 'prefer'})</span>
                      </span>
                      {r.score !== undefined && (
                        <span className="shrink-0 text-ink-2 tabular-nums">
                          {r.score > 0 ? `+${r.score}` : r.score}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              pack.placements.length > 0 && (
                <p className="text-sm text-ink-2">Select a boat to see why it went there.</p>
              )
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
