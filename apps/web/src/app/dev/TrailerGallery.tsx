// Gallery sections for the trailer visuals: the end view in all three styles with the 2026
// Regionals layouts from the coaches' sheet, its states, thumbs, and rule cards; and the
// isometric view with packed sample loads.

import { useMemo, useState, type ReactNode } from 'react';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  SRA_GIRLS_TRAILER,
  THREE_WIDE_EXAMPLE_RULE,
  makeRule,
  packTrailer,
  type Id,
  type Rule,
  type TrailerDef,
} from '@regatta-ops/domain';
import { TrailerEndView } from '@/components/trailer/TrailerEndView';
import { TrailerIsometric } from '@/components/trailer/TrailerIsometric';
import {
  BOYS_2026_LOAD,
  GIRLS_2026_LOAD,
  RATED_LOAD,
  sampleEndViewBoats,
  samplePackBoats,
  sampleSheetPlacements,
} from '@/components/trailer/samples';
import { RuleCard } from '@/components/trailer/RuleCard';
import { RulesEditor } from '@/components/trailer/RulesEditor';
import { defaultRulesFor, presetByKey } from '@/features/trailers-admin/presets';

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

const GOALPOST: TrailerDef = presetByKey('goalpost').build({
  id: 'gallery-goalpost',
  name: '41 ft goalpost',
  newId: counter('gp'),
});
const CENTER: TrailerDef = presetByKey('center-post').build({
  id: 'gallery-center',
  name: 'Borrowed center post',
  newId: counter('cp'),
});

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-base font-medium text-ink">{title}</h3>
      {children}
    </div>
  );
}

function SheetLayout({ trailer, load }: { trailer: TrailerDef; load: typeof BOYS_2026_LOAD }) {
  const [selected, setSelected] = useState<Id | null>(null);
  const boats = useMemo(() => sampleEndViewBoats(load), [load]);
  const placements = useMemo(() => sampleSheetPlacements(load, trailer), [load, trailer]);
  return (
    <TrailerEndView
      trailer={trailer}
      rules={SRA_DEFAULT_RULES}
      placements={placements}
      boats={boats}
      selectedShellId={selected}
      onChipClick={(id) => setSelected((s) => (s === id ? null : id))}
    />
  );
}

function Packed({
  trailer,
  load,
  rules,
}: {
  trailer: TrailerDef;
  load: typeof RATED_LOAD;
  rules: Rule[];
}) {
  const result = useMemo(
    () => packTrailer(trailer, samplePackBoats(load), rules, []),
    [trailer, load, rules],
  );
  return (
    <TrailerEndView
      trailer={trailer}
      rules={rules}
      placements={result.placements}
      boats={sampleEndViewBoats(load)}
    />
  );
}

export function TrailerEndViewGallery() {
  const boysPlacements = useMemo(() => sampleSheetPlacements(BOYS_2026_LOAD, SRA_BOYS_TRAILER), []);
  const boysBoats = useMemo(() => sampleEndViewBoats(BOYS_2026_LOAD), []);
  const offRules = useMemo(
    () => [...SRA_DEFAULT_RULES, makeRule('shelf-off', { shelfIds: ['l1', 'r1'] }, 'regatta')],
    [],
  );
  const goalpostRules = useMemo(() => defaultRulesFor([1, 2, 3, 4, 5]), []);
  const centerRules = useMemo(() => defaultRulesFor([1, 2, 3, 4]), []);
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <Block title="Boys trailer, 2026 Regionals sheet (click a boat)">
          <SheetLayout trailer={SRA_BOYS_TRAILER} load={BOYS_2026_LOAD} />
        </Block>
        <Block title="Girls trailer, 2026 Regionals sheet">
          <SheetLayout trailer={SRA_GIRLS_TRAILER} load={GIRLS_2026_LOAD} />
        </Block>
        <Block title="Goalpost, packed with the rated load">
          <Packed trailer={GOALPOST} load={RATED_LOAD} rules={goalpostRules} />
        </Block>
        <Block title="Center post, packed with the girls' load">
          <Packed trailer={CENTER} load={GIRLS_2026_LOAD} rules={centerRules} />
        </Block>
      </div>
      <div className="grid gap-8 xl:grid-cols-2">
        <Block title="Drop target, refused drop, a flagged boat, level 1 off for this regatta">
          <TrailerEndView
            trailer={SRA_BOYS_TRAILER}
            rules={offRules}
            placements={boysPlacements}
            boats={boysBoats}
            highlightCell={{ shelfId: 'l1', lane: 0 }}
            invalidCell={{
              shelfId: 'r1',
              lane: 1,
              reason:
                '19.9 m is longer than the 17.7 m level 1, wide side takes, including overhang',
            }}
            flagged={{ [boysBoats[9]!.shellId]: 'Prefer fours on levels 3 and 2' }}
            onLaneClick={() => {}}
          />
        </Block>
        <Block title="Three fours squeezed onto level 3, wide side (a regatta rule)">
          <TrailerEndView
            trailer={SRA_BOYS_TRAILER}
            rules={[...SRA_DEFAULT_RULES, THREE_WIDE_EXAMPLE_RULE]}
            placements={boysPlacements.map((p) =>
              p.shellId === boysBoats[10]!.shellId ? { ...p, shelfId: 'r3', lane: 2 } : p,
            )}
            boats={boysBoats}
          />
        </Block>
      </div>
      <Block title="Thumbs, for lists">
        <div className="flex flex-wrap items-end gap-6">
          <TrailerEndView
            trailer={SRA_BOYS_TRAILER}
            rules={SRA_DEFAULT_RULES}
            placements={boysPlacements}
            boats={boysBoats}
            size="thumb"
          />
          <TrailerEndView trailer={SRA_GIRLS_TRAILER} rules={SRA_DEFAULT_RULES} size="thumb" />
          <TrailerEndView trailer={GOALPOST} rules={goalpostRules} size="thumb" />
          <TrailerEndView trailer={CENTER} rules={centerRules} size="thumb" />
        </div>
      </Block>
      <Block title="At phone width (358 px)">
        <div className="w-[358px] max-w-full rounded-card border border-line bg-surface p-3">
          <TrailerEndView
            trailer={SRA_BOYS_TRAILER}
            rules={SRA_DEFAULT_RULES}
            placements={boysPlacements}
            boats={boysBoats}
          />
        </div>
      </Block>
    </div>
  );
}

function PackedIsometric({
  trailer,
  load,
  rules,
  selected,
  width,
}: {
  trailer: TrailerDef;
  load: typeof RATED_LOAD;
  rules: Rule[];
  selected?: string;
  width?: number;
}) {
  const result = useMemo(
    () => packTrailer(trailer, samplePackBoats(load), rules, []),
    [trailer, load, rules],
  );
  const boats = useMemo(() => sampleEndViewBoats(load), [load]);
  return (
    <TrailerIsometric
      trailer={trailer}
      rules={rules}
      placements={result.placements}
      boats={boats}
      selectedShellId={selected ? boats.find((b) => b.name === selected)?.shellId : null}
      width={width}
    />
  );
}

export function TrailerIsometricGallery() {
  const goalpostRules = useMemo(() => defaultRulesFor([1, 2, 3, 4, 5]), []);
  const centerRules = useMemo(() => defaultRulesFor([1, 2, 3, 4]), []);
  const offRules = useMemo(
    () => [...SRA_DEFAULT_RULES, makeRule('shelf-off', { shelfIds: ['l1', 'r1'] }, 'regatta')],
    [],
  );
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 xl:grid-cols-2">
        <Block title="Boys trailer, packed with the boys' 2026 Regionals load (Peggy selected)">
          <PackedIsometric
            trailer={SRA_BOYS_TRAILER}
            load={BOYS_2026_LOAD}
            rules={SRA_DEFAULT_RULES}
            selected="Peggy"
          />
        </Block>
        <Block title="Girls trailer, packed with the girls' 2026 Regionals load">
          <PackedIsometric
            trailer={SRA_GIRLS_TRAILER}
            load={GIRLS_2026_LOAD}
            rules={SRA_DEFAULT_RULES}
          />
        </Block>
        <Block title="Goalpost, packed with the rated load">
          <PackedIsometric trailer={GOALPOST} load={RATED_LOAD} rules={goalpostRules} />
        </Block>
        <Block title="Center post, packed with the girls' load">
          <PackedIsometric trailer={CENTER} load={GIRLS_2026_LOAD} rules={centerRules} />
        </Block>
        <Block title="Empty boys trailer, level 1 off for this regatta">
          <TrailerIsometric trailer={SRA_BOYS_TRAILER} rules={offRules} />
        </Block>
        <Block title="At phone width (358 px)">
          <div className="w-[358px] max-w-full rounded-card border border-line bg-surface p-3">
            <PackedIsometric
              trailer={SRA_BOYS_TRAILER}
              load={BOYS_2026_LOAD}
              rules={SRA_DEFAULT_RULES}
            />
          </div>
        </Block>
      </div>
    </div>
  );
}

export function RuleCardGallery() {
  const [rules, setRules] = useState<Rule[]>(() => [...SRA_DEFAULT_RULES, THREE_WIDE_EXAMPLE_RULE]);
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Block title="Rule cards">
        <div className="flex flex-col gap-2">
          {[SRA_DEFAULT_RULES[0]!, SRA_DEFAULT_RULES[1]!, THREE_WIDE_EXAMPLE_RULE].map((r) => (
            <RuleCard key={r.id} rule={r} trailer={SRA_BOYS_TRAILER} />
          ))}
          <RuleCard
            rule={{ ...SRA_DEFAULT_RULES[3]!, enabled: false }}
            trailer={SRA_BOYS_TRAILER}
            readOnly
          />
        </div>
      </Block>
      <Block title="Rules editor, regatta mode">
        <RulesEditor
          rules={rules}
          onChange={setRules}
          trailer={SRA_BOYS_TRAILER}
          defaults={SRA_DEFAULT_RULES}
          mode="regatta"
          headingLevel={3}
          shells={sampleEndViewBoats(BOYS_2026_LOAD).map((b) => ({
            id: b.shellId,
            name: b.name,
            cls: b.cls,
          }))}
        />
      </Block>
    </div>
  );
}
