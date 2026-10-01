// The rule card: a loading rule as a sentence, a Must or Prefer tag, a toggle, the weight of a
// Prefer rule (Low, Medium, High), and edit and delete controls. A rule changed or added for one
// regatta carries a "This regatta" tag.

import { useId, type ReactNode } from 'react';
import { Pencil, Trash2, Undo2 } from 'lucide-react';
import {
  explain,
  isRegattaOverride,
  type ExplainContext,
  type Rule,
  type RuleWeight,
  type TrailerDef,
} from '@regatta-ops/domain';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { SegmentedControl, Switch } from '@/components/ui/controls';
import { Tooltip } from '@/components/ui/menu';
import { WEIGHT_LABELS } from './rule-utils';

export interface RuleCardProps {
  rule: Rule;
  trailer: TrailerDef;
  /** Shell and team names for pin and team sentences. */
  context?: ExplainContext;
  /** No controls: the sentence, tags, and state only. */
  readOnly?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
  onWeightChange?: (weight: RuleWeight) => void;
  /** Shows the edit button. */
  onEdit?: () => void;
  /** Shows the delete button. */
  onDelete?: () => void;
  /** Shows "Use trailer default" (a regatta change to a default). */
  onRevert?: () => void;
  /** The card is showing its edit form (`children`). */
  editing?: boolean;
  children?: ReactNode;
  className?: string;
}

export function RuleTag({ hard }: { hard: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-control px-1.5 text-xs font-medium',
        hard ? 'bg-ink text-bg' : 'border border-line-strong text-ink-2',
      )}
    >
      {hard ? 'Must' : 'Prefer'}
    </span>
  );
}

export function RegattaTag() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-control bg-accent-tint px-1.5 text-xs font-medium text-accent">
      This regatta
    </span>
  );
}

export function RuleCard({
  rule,
  trailer,
  context,
  readOnly = false,
  onEnabledChange,
  onWeightChange,
  onEdit,
  onDelete,
  onRevert,
  editing = false,
  children,
  className,
}: RuleCardProps) {
  const id = useId();
  const sentence = explain(rule, trailer, context);
  const alwaysOn = rule.type === 'fit';
  const showWeight = !rule.hard;
  const sentenceId = `${id}-sentence`;

  return (
    <article
      aria-labelledby={sentenceId}
      className={cn(
        'flex flex-col gap-2 rounded-card border border-line bg-surface px-3 py-2.5',
        editing && 'border-accent',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {!readOnly && onEnabledChange && !alwaysOn ? (
          <Switch
            checked={rule.enabled}
            onCheckedChange={(v) => onEnabledChange(v)}
            aria-label={`Use this rule: ${sentence}`}
            className="mt-0.5 before:absolute before:-inset-3 before:content-[''] pointer-coarse:before:-inset-x-2 pointer-coarse:before:-inset-y-3"
          />
        ) : null}
        <p
          id={sentenceId}
          className={cn(
            'min-w-0 flex-1 text-base leading-prose',
            rule.enabled ? 'text-ink' : 'text-ink-2',
          )}
        >
          {sentence}
          {!rule.enabled && <span className="text-ink-2"> (off)</span>}
        </p>
        {!readOnly && (onEdit || onDelete || onRevert) && (
          <div className="-my-1 -mr-1.5 flex shrink-0 items-center">
            {onRevert && (
              <Tooltip content="Use trailer default">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onRevert}
                  aria-label={`Use trailer default: ${sentence}`}
                >
                  <Undo2 aria-hidden />
                </Button>
              </Tooltip>
            )}
            {onEdit && (
              <Tooltip content="Edit rule">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onEdit}
                  aria-label={`Edit rule: ${sentence}`}
                  aria-expanded={editing}
                >
                  <Pencil aria-hidden />
                </Button>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip content="Delete rule">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onDelete}
                  aria-label={`Delete rule: ${sentence}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <RuleTag hard={rule.hard} />
          {isRegattaOverride(rule) && <RegattaTag />}
          {alwaysOn && <span className="text-xs text-ink-2">Always on</span>}
        </div>
        {showWeight &&
          (readOnly || !onWeightChange ? (
            <span className="text-xs text-ink-2">Weight: {WEIGHT_LABELS[rule.weight]}</span>
          ) : (
            <SegmentedControl<string>
              size="sm"
              label={`Weight: ${sentence}`}
              value={String(rule.weight)}
              onValueChange={(v) => onWeightChange(Number(v) as RuleWeight)}
              options={([1, 2, 3] as const).map((w) => ({
                value: String(w),
                label: WEIGHT_LABELS[w],
              }))}
              className={cn('ml-auto', !rule.enabled && 'opacity-60')}
            />
          ))}
      </div>
      {editing && children}
    </article>
  );
}
