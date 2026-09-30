// The small form that edits one rule, driven by what its type needs (RULE_CATALOG[type].needs):
// shelves, tiers, boat classes, a shell, a lane, teams, and numbers. The sentence at the top
// updates as the fields change, so the coach sees what the rule will say.

import { useId, useMemo, useState, type ReactNode } from 'react';
import {
  BOAT_CLASSES,
  RULE_CATALOG,
  effectiveShelvesFor,
  explain,
  type BoatClass,
  type ExplainContext,
  type Id,
  type Rule,
  type RuleNumberField,
  type TrailerDef,
} from '@srt/domain';
import { Button } from '@/components/ui/button';
import { Checkbox, SegmentedControl } from '@/components/ui/controls';
import { Combobox } from '@/components/ui/combobox';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { laneLabel, tierLabel } from './labels';

export interface RuleShellOption {
  id: Id;
  name: string;
  cls?: BoatClass;
}

export interface RuleTeamOption {
  id: Id;
  name: string;
}

export interface RuleFormProps {
  rule: Rule;
  trailer: TrailerDef;
  context?: ExplainContext;
  shells?: readonly RuleShellOption[];
  teams?: readonly RuleTeamOption[];
  onSave: (rule: Rule) => void;
  onCancel: () => void;
  saveLabel?: string;
  /** Focus the first field when the form appears (a rule just added from the gallery). */
  autoFocus?: boolean;
}

type Params = Record<string, unknown>;

const UNIT_TEXT: Record<RuleNumberField['unit'], string> = {
  cm: 'cm',
  '%': '%',
  boats: 'boats',
  lanes: 'boats',
};

function toggle<T>(list: readonly T[], item: T, on: boolean): T[] {
  return on ? (list.includes(item) ? [...list] : [...list, item]) : list.filter((x) => x !== item);
}

/** What is missing before the rule can be saved, as sentences. */
export function ruleProblems(
  rule: Rule,
  trailer: TrailerDef,
  shells?: readonly RuleShellOption[],
): string[] {
  const entry = RULE_CATALOG.find((e) => e.type === rule.type);
  if (!entry) return [];
  const p = rule.params as Params;
  const needs = entry.needs;
  const out: string[] = [];
  const shelfIds = new Set(trailer.shelves.map((s) => s.id));
  if (needs.shell && (!p.shellId || (shells && !shells.some((s) => s.id === p.shellId)))) {
    out.push('Pick a shell.');
  }
  if (needs.shelf === 'one' && (!p.shelfId || !shelfIds.has(p.shelfId as string))) {
    out.push('Pick a shelf.');
  }
  if (
    needs.shelf === 'many' &&
    !((p.shelfIds as Id[] | undefined) ?? []).some((id) => shelfIds.has(id))
  ) {
    out.push('Pick at least one shelf.');
  }
  if (needs.tiers && ((p.tiers as number[] | undefined) ?? []).length === 0) {
    out.push('Pick at least one level.');
  }
  if (needs.classes === 'required' && ((p.classes as BoatClass[] | undefined) ?? []).length === 0) {
    out.push('Pick at least one boat class.');
  }
  for (const f of needs.numbers) {
    const v = p[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`Enter ${f.label.toLowerCase()}.`);
    else if (v < f.min || (f.max !== undefined && v > f.max)) {
      out.push(
        `${f.label} must be ${f.max !== undefined ? `between ${f.min} and ${f.max}` : `at least ${f.min}`}.`,
      );
    }
  }
  return out;
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-ink">
        {legend}
        {hint && <span className="font-normal text-ink-2"> {hint}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function CheckItem({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-h-8 items-center gap-2 pointer-coarse:min-h-11">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id} className="cursor-pointer text-base text-ink">
        {children}
      </label>
    </div>
  );
}

export function RuleForm({
  rule,
  trailer,
  context,
  shells = [],
  teams = [],
  onSave,
  onCancel,
  saveLabel = 'Save rule',
  autoFocus = false,
}: RuleFormProps) {
  const uid = useId();
  const [params, setParams] = useState<Params>(() => structuredClone(rule.params) as Params);
  const [hard, setHard] = useState(rule.hard);
  const entry = RULE_CATALOG.find((e) => e.type === rule.type)!;
  const needs = entry.needs;
  const draft = { ...rule, hard, params } as Rule;
  const problems = ruleProblems(draft, trailer, shells.length > 0 ? shells : undefined);
  const set = (key: string, value: unknown) =>
    setParams((p) => {
      const next = { ...p };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });

  const effective = useMemo(() => effectiveShelvesFor(trailer, []), [trailer]);
  const tiers = useMemo(
    () => [...new Set(trailer.shelves.map((s) => s.tier))].sort((a, b) => b - a),
    [trailer],
  );
  const shelfOptions = trailer.shelves.map((s) => ({ value: s.id, label: s.label || s.id }));
  const nameContext: ExplainContext = {
    ...context,
    shellNames: {
      ...Object.fromEntries(shells.map((s) => [s.id, s.name])),
      ...context?.shellNames,
    },
    teamNames: { ...Object.fromEntries(teams.map((t) => [t.id, t.name])), ...context?.teamNames },
  };

  const shelfId = params.shelfId as Id | undefined;
  const laneSlots = effective.find((s) => s.def.id === shelfId)?.laneSlots ?? 1;

  return (
    <form
      ref={autoFocus ? focusFirst : undefined}
      className="flex flex-col gap-4 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (problems.length === 0) onSave(draft);
      }}
    >
      <p className="text-sm text-ink-2">
        Reads as: <span className="text-ink">{explain(draft, trailer, nameContext)}</span>
      </p>

      {rule.type === 'class-tier' && (
        <SegmentedControl<'prefer' | 'must'>
          size="sm"
          label="Must or prefer"
          value={hard ? 'must' : 'prefer'}
          onValueChange={(v) => setHard(v === 'must')}
          options={[
            { value: 'prefer', label: 'Prefer' },
            { value: 'must', label: 'Must' },
          ]}
          className="self-start"
        />
      )}

      {needs.shell && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">Shell</span>
          <Combobox
            label="Shell"
            options={shells.map((s) => ({
              value: s.id,
              label: s.name,
              keywords: s.cls ? [s.cls] : [],
              hint: s.cls,
            }))}
            value={(params.shellId as string) || null}
            onValueChange={(v) => set('shellId', v ?? '')}
            placeholder="Choose a shell"
            emptyText={shells.length === 0 ? 'No shells to pick from.' : 'No matches.'}
            className="w-full"
          />
        </div>
      )}

      {needs.shelf === 'one' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-shelf`}>Shelf</Label>
          <Select
            id={`${uid}-shelf`}
            value={shelfId ?? ''}
            onValueChange={(v) => {
              set('shelfId', v);
              if (needs.lane) set('lane', undefined);
            }}
            options={shelfOptions}
            placeholder="Choose a shelf"
            className="w-full"
          />
        </div>
      )}

      {needs.lane && shelfId && laneSlots > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${uid}-lane`}>Lane</Label>
          <Select
            id={`${uid}-lane`}
            value={params.lane == null ? 'any' : String(params.lane)}
            onValueChange={(v) => set('lane', v === 'any' ? undefined : Number(v))}
            options={[
              { value: 'any', label: 'Any lane' },
              ...Array.from({ length: laneSlots }, (_, i) => ({
                value: String(i),
                label: capitalize(laneLabel(i, laneSlots) ?? `lane ${i + 1}`),
              })),
            ]}
            className="w-full"
          />
        </div>
      )}

      {needs.shelf === 'many' && (
        <Fieldset legend="Shelves">
          <div className="grid gap-x-4 sm:grid-cols-2">
            {trailer.shelves.map((s) => (
              <CheckItem
                key={s.id}
                checked={((params.shelfIds as Id[]) ?? []).includes(s.id)}
                onChange={(on) =>
                  set('shelfIds', toggle((params.shelfIds as Id[]) ?? [], s.id, on))
                }
              >
                {s.label || s.id}
              </CheckItem>
            ))}
          </div>
        </Fieldset>
      )}

      {needs.tiers && (
        <Fieldset legend="Levels">
          <div className="flex flex-wrap gap-x-4">
            {tiers.map((t) => (
              <CheckItem
                key={t}
                checked={((params.tiers as number[]) ?? []).includes(t)}
                onChange={(on) =>
                  set(
                    'tiers',
                    toggle((params.tiers as number[]) ?? [], t, on).sort((a, b) => b - a),
                  )
                }
              >
                {tierLabel(trailer, t)}
              </CheckItem>
            ))}
          </div>
        </Fieldset>
      )}

      {needs.classes && (
        <Fieldset
          legend="Boat classes"
          hint={needs.classes === 'optional' ? '(leave blank for any)' : undefined}
        >
          <div className="flex flex-wrap gap-x-4">
            {BOAT_CLASSES.map((c) => (
              <CheckItem
                key={c}
                checked={((params.classes as BoatClass[]) ?? []).includes(c)}
                onChange={(on) => {
                  const next = BOAT_CLASSES.filter((x) =>
                    x === c ? on : ((params.classes as BoatClass[]) ?? []).includes(x),
                  );
                  set(
                    'classes',
                    needs.classes === 'optional' && next.length === 0 ? undefined : next,
                  );
                }}
              >
                <span className="font-display font-semibold tabular-nums">{c}</span>
              </CheckItem>
            ))}
          </div>
        </Fieldset>
      )}

      {needs.teams && teams.length > 0 && (
        <Fieldset legend="Teams" hint="(leave blank for every team)">
          <div className="flex flex-wrap gap-x-4">
            {teams.map((t) => (
              <CheckItem
                key={t.id}
                checked={((params.teamIds as Id[]) ?? []).includes(t.id)}
                onChange={(on) => {
                  const next = toggle((params.teamIds as Id[]) ?? [], t.id, on);
                  set('teamIds', next.length === 0 ? undefined : next);
                }}
              >
                {t.name}
              </CheckItem>
            ))}
          </div>
        </Fieldset>
      )}

      {needs.numbers.length > 0 && (
        <div className="flex flex-wrap gap-4">
          {needs.numbers.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-${f.key}`}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${uid}-${f.key}`}
                  inputMode="numeric"
                  className="w-24 tabular-nums"
                  value={
                    params[f.key] == null || Number.isNaN(params[f.key])
                      ? ''
                      : String(params[f.key])
                  }
                  aria-invalid={problems.some((p) => p.includes(f.label)) || undefined}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    set(f.key, t === '' ? Number.NaN : Number(t));
                  }}
                />
                <span className="text-sm text-ink-2">{UNIT_TEXT[f.unit]}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <p className="text-sm text-ink-2" id={`${uid}-problems`}>
          {problems.join(' ')}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          disabled={problems.length > 0}
          aria-describedby={problems.length > 0 ? `${uid}-problems` : undefined}
        >
          {saveLabel}
        </Button>
      </div>
    </form>
  );
}

export function focusFirst(form: HTMLElement | null) {
  form
    ?.querySelector<HTMLElement>('button:not([disabled]), input:not([disabled]), [role="checkbox"]')
    ?.focus();
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
