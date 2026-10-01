// The rules editor: loading rules as sentences, grouped Must then Prefer, each with a toggle, a
// weight, and an edit form; "Add rule" from the gallery; "Reset to defaults".
//
// Controlled: it shows `rules` and reports every change through `onChange(rules)`.
// - mode 'trailer' (the trailers admin page) edits a trailer's default rules in place.
// - mode 'regatta' (the trailer page) edits a load plan's effective rules: every change to a
//   default becomes a regatta override (same id, origin 'regatta', "This regatta" tag), new
//   rules are regatta rules, defaults are turned off rather than deleted, and a change that
//   lands back on the default drops the override. Pass the trailer's `defaults` so it can tell.

import { useId, useMemo, useRef, useState } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import {
  RULE_CATALOG,
  type ExplainContext,
  type Rule,
  type RuleType,
  type TrailerDef,
} from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { RuleCard } from './RuleCard';
import { RuleForm, focusFirst, type RuleShellOption, type RuleTeamOption } from './RuleForm';
import {
  canDelete,
  defaultFor,
  isChangedDefault,
  newRule,
  replaceRule,
  sameRules,
  settleChange,
  type RulesMode,
} from './rule-utils';

export interface RulesEditorProps {
  rules: readonly Rule[];
  onChange: (rules: Rule[]) => void;
  trailer: TrailerDef;
  mode: RulesMode;
  /**
   * What "Reset to defaults" restores. Trailer mode: a starter set for the trailer. Regatta
   * mode: the trailer's default rules (also used to tell overrides from regatta-only rules).
   */
  defaults?: readonly Rule[];
  /** Shell and team names for pin and team sentences (merged with `shells` and `teams`). */
  context?: ExplainContext;
  /** Shells the "Pin a shell to a spot" rule can pick. */
  shells?: readonly RuleShellOption[];
  /** Teams "Keep a team's boats together" can name. */
  teams?: readonly RuleTeamOption[];
  readOnly?: boolean;
  title?: string;
  /** Heading level of the title; group headings are one below. */
  headingLevel?: 2 | 3;
  className?: string;
}

const GALLERY = RULE_CATALOG.filter((e) => e.inGallery);

function hasNeeds(type: RuleType): boolean {
  const n = RULE_CATALOG.find((e) => e.type === type)!.needs;
  return !!(n.shelf || n.tiers || n.classes || n.shell || n.numbers.length > 0 || n.teams);
}

export function RulesEditor({
  rules,
  onChange,
  trailer,
  mode,
  defaults,
  context,
  shells = [],
  teams = [],
  readOnly = false,
  title = 'Loading rules',
  headingLevel = 2,
  className,
}: RulesEditorProps) {
  const headingId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<Rule | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const justAdded = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);

  const nameContext = useMemo<ExplainContext>(
    () => ({
      shellNames: {
        ...Object.fromEntries(shells.map((s) => [s.id, s.name])),
        ...context?.shellNames,
      },
      teamNames: {
        ...Object.fromEntries(teams.map((t) => [t.id, t.name])),
        ...context?.teamNames,
      },
    }),
    [shells, teams, context],
  );

  const H = headingLevel === 2 ? 'h2' : 'h3';
  const G = headingLevel === 2 ? 'h3' : 'h4';
  const resetTarget =
    defaults ?? (mode === 'regatta' ? rules.filter((r) => r.origin === 'trailer') : []);
  const atDefaults = sameRules(rules, resetTarget);
  const takenIds = [...rules.map((r) => r.id), ...(defaults ?? []).map((r) => r.id)];

  const change = (rule: Rule, changes: Partial<Omit<Rule, 'id' | 'type'>>) =>
    onChange(replaceRule(rules, settleChange(rule, changes, mode, defaults)));

  const add = (type: RuleType) => {
    setEditingId(null);
    const entry = RULE_CATALOG.find((e) => e.type === type)!;
    if (!hasNeeds(type)) {
      onChange([...rules, newRule(type, {}, mode, takenIds)]);
      return;
    }
    setPending(newRule(type, entry.defaultParams as never, mode, takenIds));
    justAdded.current = true;
  };

  const renderCard = (rule: Rule, isPending = false) => {
    const editing = isPending || editingId === rule.id;
    return (
      <li key={isPending ? '__pending' : rule.id} data-pending-rule={isPending || undefined}>
        <RuleCard
          rule={rule}
          trailer={trailer}
          context={nameContext}
          readOnly={readOnly || isPending}
          editing={editing}
          onEnabledChange={(enabled) => change(rule, { enabled })}
          onWeightChange={(weight) => change(rule, { weight })}
          onEdit={
            hasNeeds(rule.type)
              ? () => {
                  setPending(null);
                  setEditingId((id) => (id === rule.id ? null : rule.id));
                }
              : undefined
          }
          onDelete={
            canDelete(rule, mode, defaults)
              ? () => onChange(rules.filter((r) => r.id !== rule.id))
              : undefined
          }
          onRevert={
            isChangedDefault(rule, mode, defaults)
              ? () => onChange(replaceRule(rules, defaultFor(rule, defaults)!))
              : undefined
          }
        >
          <RuleForm
            rule={rule}
            trailer={trailer}
            context={nameContext}
            shells={shells}
            teams={teams}
            saveLabel={isPending ? 'Add rule' : 'Save rule'}
            onCancel={() => (isPending ? setPending(null) : setEditingId(null))}
            onSave={(draft) => {
              if (isPending) {
                onChange([
                  ...rules,
                  newRule(draft.type, draft.params as never, mode, takenIds, {
                    hard: draft.hard,
                    weight: draft.weight,
                  }),
                ]);
                setPending(null);
              } else {
                change(rule, { params: draft.params, hard: draft.hard } as Partial<Rule>);
                setEditingId(null);
              }
            }}
          />
        </RuleCard>
      </li>
    );
  };

  const groups: { key: string; label: string; hard: boolean }[] = [
    { key: 'must', label: 'Must', hard: true },
    { key: 'prefer', label: 'Prefer', hard: false },
  ];

  return (
    <section
      ref={sectionRef}
      aria-labelledby={headingId}
      className={cn('flex min-w-0 flex-col gap-3', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H id={headingId} className="font-display text-lg font-semibold text-ink">
          {title}
        </H>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={atDefaults}
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw aria-hidden />
              Reset to defaults
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus aria-hidden />
                  Add rule
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-80 max-w-[calc(100vw-32px)]"
                onCloseAutoFocus={(e) => {
                  // The new rule's form takes focus instead of the menu button.
                  if (!justAdded.current) return;
                  justAdded.current = false;
                  e.preventDefault();
                  focusFirst(sectionRef.current?.querySelector('[data-pending-rule] form') ?? null);
                }}
              >
                {GALLERY.map((entry) => {
                  const present = !hasNeeds(entry.type) && rules.some((r) => r.type === entry.type);
                  return (
                    <DropdownMenuItem
                      key={entry.type}
                      disabled={present}
                      onSelect={() => add(entry.type)}
                      className="h-auto min-h-9 justify-between gap-3 py-1.5"
                    >
                      <span className="min-w-0">{entry.title}</span>
                      <span className="shrink-0 text-xs text-ink-2">
                        {present ? 'In the list' : entry.hard ? 'Must' : 'Prefer'}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      <p className="text-sm leading-prose text-ink-2">
        {mode === 'trailer'
          ? 'Every load plan for this trailer starts from these rules. Coaches can change them for one regatta.'
          : 'Changes here apply to this regatta only. Auto pack the trailer again to use them.'}
      </p>
      {rules.length === 0 && !pending ? (
        <p className="rounded-card border border-dashed border-line-strong/60 px-4 py-4 text-base text-ink-2">
          No loading rules yet. {readOnly ? '' : 'Add one with Add rule, or reset to the defaults.'}
        </p>
      ) : (
        groups.map((g) => {
          const list = rules.filter((r) => r.hard === g.hard);
          const pendingHere = pending && pending.hard === g.hard ? pending : null;
          if (list.length === 0 && !pendingHere) return null;
          return (
            <div key={g.key} className="flex flex-col gap-2">
              <G className="text-sm font-medium text-ink-2">{g.label}</G>
              <ul className="flex flex-col gap-2">
                {list.map((r) => renderCard(r))}
                {pendingHere && renderCard(pendingHere, true)}
              </ul>
            </div>
          );
        })
      )}

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          title="Reset to defaults?"
          description={
            mode === 'trailer'
              ? 'The rules go back to the standard set for this trailer’s levels. Your changes to them are replaced.'
              : 'Every change made for this regatta is removed and the trailer’s own rules apply again.'
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button>Keep my rules</Button>
            </DialogClose>
            <Button
              variant="primary"
              onClick={() => {
                onChange(resetTarget.map((r) => structuredClone(r)));
                setEditingId(null);
                setPending(null);
                setConfirmReset(false);
              }}
            >
              Reset to defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
