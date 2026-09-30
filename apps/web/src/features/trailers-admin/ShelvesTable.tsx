// The shelves table (PLAN.md §4.9, §6.9): one row per shelf, every field editable in place.
// The first column stays put while the table scrolls sideways on narrow screens.

import { useId } from 'react';
import { Copy, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { BOAT_CLASSES, type BoatClass, type ColumnKey, type LaneAccess } from '@srt/domain';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/menu';
import { Select } from '@/components/ui/select';
import { fieldKey, type DraftErrors, type NumberValue, type ShelfDraft } from './draft';
import { NumberInput, ReadValue } from './fields';

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  left: 'Left',
  right: 'Right',
  full: 'Full width',
};

export const ACCESS_LABELS: Record<LaneAccess, string> = {
  any: 'Any order',
  outer_first: 'Outer first',
};

type NumberField =
  | 'tier'
  | 'widthCm'
  | 'lengthCm'
  | 'frontOverhangMaxCm'
  | 'rearOverhangMaxCm'
  | 'lanesOverride'
  | 'maxBoats'
  | 'maxWeightKg'
  | 'accessRank';

interface NumberColumn {
  field: NumberField;
  header: string;
  /** Spoken after the shelf label: "Level 5, wide side: width in cm". */
  spoken: string;
  width: string;
  placeholder?: string;
}

const NUMBER_COLUMNS: NumberColumn[] = [
  { field: 'widthCm', header: 'Width, cm', spoken: 'width in cm', width: 'w-20' },
  { field: 'lengthCm', header: 'Length, cm', spoken: 'length in cm', width: 'w-20' },
  {
    field: 'frontOverhangMaxCm',
    header: 'Front overhang, cm',
    spoken: 'most front overhang in cm',
    width: 'w-20',
  },
  {
    field: 'rearOverhangMaxCm',
    header: 'Rear overhang, cm',
    spoken: 'most rear overhang in cm',
    width: 'w-20',
  },
];

const LIMIT_COLUMNS: NumberColumn[] = [
  {
    field: 'maxBoats',
    header: 'Most boats',
    spoken: 'most boats',
    width: 'w-20',
    placeholder: 'Any',
  },
  {
    field: 'maxWeightKg',
    header: 'Most weight, kg',
    spoken: 'most weight in kg',
    width: 'w-20',
    placeholder: 'Any',
  },
  { field: 'accessRank', header: 'Access rank', spoken: 'access rank', width: 'w-16' },
];

function fmt(v: NumberValue, empty = '—'): string {
  return v === null || Number.isNaN(v) ? empty : String(v);
}

function ClassesCell({
  shelf,
  name,
  onChange,
  readOnly,
}: {
  shelf: ShelfDraft;
  name: string;
  onChange: (classes: BoatClass[]) => void;
  readOnly: boolean;
}) {
  const id = useId();
  const text = shelf.allowedClasses.length === 0 ? 'Any' : shelf.allowedClasses.join(', ');
  if (readOnly) return <ReadValue>{text}</ReadValue>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          className="h-9 w-28 justify-start truncate font-normal"
          aria-label={`${name}: boat classes allowed, ${text}`}
        >
          <span className="truncate">{text}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            Classes allowed on {name || 'this shelf'}
          </legend>
          <div className="grid grid-cols-3 gap-x-2">
            {BOAT_CLASSES.map((c) => (
              <div key={c} className="flex min-h-8 items-center gap-2 pointer-coarse:min-h-11">
                <Checkbox
                  id={`${id}-${c}`}
                  checked={shelf.allowedClasses.includes(c)}
                  onCheckedChange={(v) =>
                    onChange(
                      BOAT_CLASSES.filter((x) =>
                        x === c ? v === true : shelf.allowedClasses.includes(x),
                      ),
                    )
                  }
                />
                <label
                  htmlFor={`${id}-${c}`}
                  className="font-display text-base font-semibold tabular-nums"
                >
                  {c}
                </label>
              </div>
            ))}
          </div>
          <p className="text-sm text-ink-2">Leave all unchecked for any class.</p>
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

export interface ShelvesTableProps {
  shelves: ShelfDraft[];
  errors: DraftErrors;
  readOnly: boolean;
  onChange: (id: string, patch: Partial<ShelfDraft>) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onAddShelf: () => void;
  onAddLevel: () => void;
}

export function ShelvesTable({
  shelves,
  errors,
  readOnly,
  onChange,
  onDuplicate,
  onRemove,
  onAddShelf,
  onAddLevel,
}: ShelvesTableProps) {
  const headingId = useId();
  const th = 'h-9 px-2 text-left text-sm font-medium whitespace-nowrap text-ink-2';
  const td = 'px-2 py-1.5 align-middle';
  const problems = shelves.flatMap((s) =>
    Object.entries(errors)
      .filter(([k]) => k.startsWith(`shelf:${s.id}:`))
      .map(([k, msg]) => ({
        key: k,
        text: `${s.label.trim() || 'A shelf with no label'}: ${msg}`,
      })),
  );

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="font-display text-lg font-semibold">
            Shelves
          </h2>
          <p className="text-sm text-ink-2">
            One row per rack level and side; level 1 is the bottom. Lanes left blank are worked out
            from the width. Outer first: the lane by the post loads first and comes off last.
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onAddShelf}>
              <Plus aria-hidden />
              Add shelf
            </Button>
            <Button size="sm" onClick={onAddLevel}>
              <Plus aria-hidden />
              Add level
            </Button>
          </div>
        )}
      </div>

      {shelves.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong/60 px-4 py-5 text-base text-ink-2">
          No shelves yet.{' '}
          {readOnly
            ? ''
            : 'Add a level to start: it adds the usual shelves for this style of trailer.'}
        </p>
      ) : (
        <div className="relative overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-base" aria-labelledby={headingId}>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={cn(th, 'sticky left-0 z-[1] bg-surface')}>
                  Label
                </th>
                <th scope="col" className={th}>
                  Level
                </th>
                <th scope="col" className={th}>
                  Side
                </th>
                {NUMBER_COLUMNS.map((c) => (
                  <th key={c.field} scope="col" className={th}>
                    {c.header}
                  </th>
                ))}
                <th scope="col" className={th}>
                  Classes
                </th>
                <th scope="col" className={th}>
                  Lanes
                </th>
                <th scope="col" className={th}>
                  Lane access
                </th>
                {LIMIT_COLUMNS.map((c) => (
                  <th key={c.field} scope="col" className={th}>
                    {c.header}
                  </th>
                ))}
                <th scope="col" className={th}>
                  In use
                </th>
                {!readOnly && (
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {shelves.map((s, i) => {
                const name = s.label.trim() || `Shelf ${i + 1}`;
                const err = (f: keyof ShelfDraft) => errors[fieldKey.shelf(s.id, f)];
                const number = (c: NumberColumn) =>
                  readOnly ? (
                    <ReadValue>{fmt(s[c.field], c.placeholder ?? '—')}</ReadValue>
                  ) : (
                    <NumberInput
                      value={s[c.field]}
                      onValueChange={(v) => onChange(s.id, { [c.field]: v })}
                      error={err(c.field)}
                      placeholder={c.placeholder}
                      aria-label={`${name}: ${c.spoken}`}
                      className={c.width}
                    />
                  );
                const newTier = i > 0 && shelves[i - 1]!.tier !== s.tier;
                return (
                  <tr
                    key={s.id}
                    className={cn(
                      'border-b border-line last:border-b-0',
                      newTier && 'border-t border-t-line-strong/50',
                      !s.active && 'text-ink-2',
                    )}
                  >
                    <td className={cn(td, 'sticky left-0 z-[1] bg-surface')}>
                      {readOnly ? (
                        <ReadValue className="whitespace-nowrap">{s.label}</ReadValue>
                      ) : (
                        <Input
                          value={s.label}
                          onChange={(e) => onChange(s.id, { label: e.target.value })}
                          aria-label={`Shelf ${i + 1}: label`}
                          aria-invalid={err('label') ? true : undefined}
                          title={err('label')}
                          className="w-44 sm:w-52"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{fmt(s.tier)}</ReadValue>
                      ) : (
                        <NumberInput
                          value={s.tier}
                          onValueChange={(v) => onChange(s.id, { tier: v })}
                          error={err('tier')}
                          aria-label={`${name}: level`}
                          className="w-14"
                        />
                      )}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{COLUMN_LABELS[s.columnKey]}</ReadValue>
                      ) : (
                        <Select<ColumnKey>
                          value={s.columnKey}
                          onValueChange={(v) => onChange(s.id, { columnKey: v })}
                          label={`${name}: side`}
                          options={(['left', 'right', 'full'] as const).map((k) => ({
                            value: k,
                            label: COLUMN_LABELS[k],
                          }))}
                          className="w-32"
                        />
                      )}
                    </td>
                    {NUMBER_COLUMNS.map((c) => (
                      <td key={c.field} className={td}>
                        {number(c)}
                      </td>
                    ))}
                    <td className={td}>
                      <ClassesCell
                        shelf={s}
                        name={name}
                        readOnly={readOnly}
                        onChange={(allowedClasses) => onChange(s.id, { allowedClasses })}
                      />
                    </td>
                    <td className={td}>
                      {number({
                        field: 'lanesOverride',
                        header: 'Lanes',
                        spoken: 'lanes, blank to work out from the width',
                        width: 'w-16',
                        placeholder: 'Auto',
                      })}
                    </td>
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue className="whitespace-nowrap">
                          {ACCESS_LABELS[s.laneAccess]}
                        </ReadValue>
                      ) : (
                        <Select<LaneAccess>
                          value={s.laneAccess}
                          onValueChange={(v) => onChange(s.id, { laneAccess: v })}
                          label={`${name}: lane access`}
                          options={(['any', 'outer_first'] as const).map((k) => ({
                            value: k,
                            label: ACCESS_LABELS[k],
                          }))}
                          className="w-32"
                        />
                      )}
                    </td>
                    {LIMIT_COLUMNS.map((c) => (
                      <td key={c.field} className={td}>
                        {number(c)}
                      </td>
                    ))}
                    <td className={td}>
                      {readOnly ? (
                        <ReadValue>{s.active ? 'Yes' : 'No'}</ReadValue>
                      ) : (
                        <Switch
                          checked={s.active}
                          onCheckedChange={(v) => onChange(s.id, { active: v })}
                          aria-label={`${name}: in use`}
                        />
                      )}
                    </td>
                    {!readOnly && (
                      <td className={cn(td, 'pr-3')}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${name}`}
                            >
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => onDuplicate(s.id)}>
                              <Copy aria-hidden />
                              Duplicate shelf
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => onRemove(s.id)}>
                              <Trash2 aria-hidden />
                              Remove shelf
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-danger" aria-label="Shelf fields to fix">
          {problems.map((p) => (
            <li key={p.key}>{p.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
