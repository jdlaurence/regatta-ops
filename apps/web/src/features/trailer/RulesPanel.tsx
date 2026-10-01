// The rules panel (PLAN.md §4.10, §6.6 right column): the plan's loading rules in the shared
// RulesEditor, regatta mode. Changes are this regatta's overrides (the first one starts the
// trailer's load plan); they never repack by themselves ("Rules changed · Auto pack to apply").
// The panel folds under its heading and starts closed; the heading shows the override count and
// "Changed" so a closed panel still says what matters.

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import type { PackBoat, Rule, Team } from '@regatta-ops/domain';
import { RulesEditor } from '@/components/trailer/RulesEditor';
import { cn } from '@/lib/cn';
import type { TrailerModel } from './lib';

export function RulesPanel({
  tm,
  boats,
  teams,
  canEdit,
  dirty,
  onChange,
  className,
}: {
  tm: TrailerModel;
  boats: readonly PackBoat[];
  teams: readonly Team[];
  canEdit: boolean;
  /** Rules were edited since the last pack. */
  dirty: boolean;
  onChange: (rules: Rule[]) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const overrides = tm.rules.filter((r) => r.origin === 'regatta').length;
  const body = (
    <div className="flex flex-col gap-3">
      {dirty && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-control border border-accent/40 bg-accent-tint px-3 py-2 text-sm font-medium text-ink"
        >
          <Info aria-hidden className="size-4 shrink-0 text-accent" />
          Rules changed · Auto pack to apply
        </p>
      )}
      <RulesEditor
        rules={tm.rules}
        defaults={tm.defaults}
        onChange={onChange}
        trailer={tm.def}
        mode="regatta"
        readOnly={!canEdit}
        shells={boats.map((b) => ({ id: b.shellId, name: b.name, cls: b.cls }))}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        title="Rules for this regatta"
        headingLevel={3}
      />
    </div>
  );
  return (
    <section className={cn('rounded-card border border-line bg-surface', className)}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left"
        >
          <span className="font-display text-lg font-semibold">Loading rules</span>
          <span className="flex items-center gap-2 text-sm text-ink-2">
            {overrides > 0 && `${overrides} for this regatta`}
            {dirty && <span className="font-medium text-accent">Changed</span>}
            <ChevronDown
              aria-hidden
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </span>
        </button>
      </h2>
      {open && <div className="border-t border-line p-3">{body}</div>}
    </section>
  );
}
