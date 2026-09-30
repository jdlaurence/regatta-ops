// Shell and oar pickers (PLAN.md §4.4): compatible equipment first, grouped by home team, with
// live conflict hints computed from the working set. Out-of-service equipment is listed but
// disabled with the reason; incompatible shells and other rigging sit behind "Show all".

import { useId, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { shellLabel, type Entry, type OarSet, type Shell } from '@srt/domain';
import { cn } from '@/lib/cn';
import { ClassBadge, OarChip, ShellChip } from '@/components/chips';
import { ConflictIcon } from '@/components/ConflictBadge';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Switch } from '@/components/ui/controls';
import { useLineup } from './context';
import { oarOptions, shellOptions, type EquipmentHint, type EquipmentOption } from './lib';

const MAX_HINTS = 2;

function HintLines({
  detail,
  hints,
  disabledReason,
}: {
  detail: string;
  hints: EquipmentHint[];
  disabledReason: string | null;
}) {
  const shown = hints.slice(0, MAX_HINTS);
  return (
    <span className="flex flex-col gap-0.5">
      {detail && <span>{detail}</span>}
      {disabledReason && <span className="text-danger">{disabledReason}</span>}
      {shown.map((h) => (
        <span
          key={h.entryId}
          className={cn(
            'inline-flex items-center gap-1',
            h.tone === 'conflict' && 'text-danger',
            h.tone === 'hot_seat' && 'text-warn',
          )}
        >
          {h.tone !== 'shared' && (
            <ConflictIcon
              severity={h.tone === 'conflict' ? 'error' : 'warning'}
              className="size-3"
            />
          )}
          {h.text}
        </span>
      ))}
      {hints.length > MAX_HINTS && <span>and {hints.length - MAX_HINTS} more</span>}
    </span>
  );
}

function toOption<T extends Shell | OarSet>(
  o: EquipmentOption<T>,
  name: string,
  badge: ReactNode,
  keywords: string[],
): ComboboxOption {
  return {
    value: o.item.id,
    label: name,
    keywords,
    group: o.group,
    disabled: !!o.disabledReason,
    render: (
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-medium">{name}</span>
        {badge}
      </span>
    ),
    hint: <HintLines detail={o.detail} hints={o.hints} disabledReason={o.disabledReason} />,
  };
}

/**
 * "Show all" and, when something is picked, a way to remove it. Removing lives here rather than
 * as the list's first row so Enter on a freshly opened picker never clears the entry.
 */
function Footer({
  label,
  checked,
  onChange,
  removeLabel,
  onRemove,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  removeLabel: string;
  onRemove?: () => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm">
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
        {label}
      </label>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 items-center rounded-control px-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink pointer-coarse:h-11"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}

function TriggerButton({
  children,
  label,
  empty,
  ...props
}: ComponentProps<'button'> & { label: string; empty: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex h-8 max-w-full min-w-0 items-center gap-1 rounded-control pr-1 text-left hover:bg-surface-2 pointer-coarse:h-11',
        empty && 'pl-0',
      )}
      {...props}
    >
      {children}
      <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-2" />
    </button>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-control border border-dashed border-line-strong px-2 text-sm text-ink-2">
      {children}
    </span>
  );
}

export function ShellPicker({ entry }: { entry: Entry }) {
  const { index, canEdit, actions } = useLineup();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const shell = entry.shellId ? (index.shellById.get(entry.shellId) ?? null) : null;
  const home = shell?.homeTeamId ? index.teamById.get(shell.homeTeamId) : null;
  const options = useMemo(
    () =>
      open
        ? shellOptions(index, entry, showAll).map((o) =>
            toOption(o, shellLabel(o.item), <ClassBadge boatClass={o.item.boatClass} />, [
              o.item.name,
              o.item.nickname ?? '',
              o.item.boatClass,
            ]),
          )
        : [],
    [open, index, entry, showAll],
  );
  const chip = shell ? (
    <ShellChip
      shell={shell}
      teamColor={home?.colorKey}
      showClass={shell.boatClass !== entry.boatClass}
    />
  ) : (
    <Placeholder>No shell</Placeholder>
  );
  if (!canEdit) return chip;
  return (
    <Combobox
      options={options}
      value={entry.shellId ?? null}
      onValueChange={(v) => actions.updateEntry(entry.id, { shellId: v })}
      label="Shell"
      searchPlaceholder="Shell name or nickname…"
      emptyText="No shells match. Try the full name, or show all shells."
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-[380px]"
      footer={
        <Footer
          label="Show all shells"
          checked={showAll}
          onChange={setShowAll}
          removeLabel="Remove shell"
          onRemove={
            shell
              ? () => {
                  actions.updateEntry(entry.id, { shellId: null });
                  setOpen(false);
                }
              : undefined
          }
        />
      }
      trigger={
        <TriggerButton label={`Shell: ${shell ? shellLabel(shell) : 'none'}`} empty={!shell}>
          {chip}
        </TriggerButton>
      }
    />
  );
}

export function OarPicker({ entry }: { entry: Entry }) {
  const { index, canEdit, actions } = useLineup();
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const oars = entry.oarSetId ? (index.oarSetById.get(entry.oarSetId) ?? null) : null;
  const options = useMemo(
    () =>
      open
        ? oarOptions(index, entry, showAll).map((o) => ({
            ...toOption(o, o.item.name, null, [
              o.item.name,
              o.item.color ?? '',
              o.item.blade ?? '',
            ]),
            // The color code is how people find oars at the trailer: show the chip.
            render: <OarChip oarSet={o.item} className="-my-0.5" />,
          }))
        : [],
    [open, index, entry, showAll],
  );
  const chip = oars ? <OarChip oarSet={oars} /> : <Placeholder>No oars</Placeholder>;
  if (!canEdit) return chip;
  return (
    <Combobox
      options={options}
      value={entry.oarSetId ?? null}
      onValueChange={(v) => actions.updateEntry(entry.id, { oarSetId: v })}
      label="Oars"
      searchPlaceholder="Oar set name or color…"
      emptyText="No oar sets match. Try the color code, or show all oar sets."
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-[360px]"
      footer={
        <Footer
          label="Show all oar sets"
          checked={showAll}
          onChange={setShowAll}
          removeLabel="Remove oars"
          onRemove={
            oars
              ? () => {
                  actions.updateEntry(entry.id, { oarSetId: null });
                  setOpen(false);
                }
              : undefined
          }
        />
      }
      trigger={
        <TriggerButton label={`Oars: ${oars ? oars.name : 'none'}`} empty={!oars}>
          {chip}
        </TriggerButton>
      }
    />
  );
}
