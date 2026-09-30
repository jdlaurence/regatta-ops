// The roster table (PLAN.md §6.10): one row per athlete, grouped by level like the boys'
// sheet, with spreadsheet-style inline editing for coaches. On a phone it keeps the name,
// badges, and weight; the drawer holds the rest.

import { useMemo, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { athleteName, type Athlete, type Program } from '@srt/domain';
import type { Patch } from '@/data';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { SideBadge } from '@/components/chips';
import { InlineCheckbox, InlineInput, InlineSelect } from './InlineCells';
import { AgeBadgeView, InactiveTag } from './RosterBadges';
import {
  ageBadge,
  displayWeight,
  LEVEL_LABELS,
  LEVEL_ORDER,
  nameSortKey,
  parseWeight,
  parseYear,
  SIDE_LABELS,
  STATUS_LABELS,
  type WeightUnit,
} from './lib';

export interface RosterTableProps {
  athletes: Athlete[];
  program: Program;
  canEdit: boolean;
  unit: WeightUnit;
  seasonYear: number;
  /** Phone layout: name with badges, and weight. */
  compact: boolean;
  grouped: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  activeId: string | null;
  onOpen: (athlete: Athlete) => void;
  onUpdate: (athlete: Athlete, patch: Patch<Athlete>) => void;
  empty: ReactNode;
}

const SIDE_OPTIONS = (['port', 'starboard', 'both', 'none'] as const).map((s) => ({
  value: s,
  label: SIDE_LABELS[s],
}));
const LEVEL_OPTIONS = LEVEL_ORDER.map((l) => ({ value: l, label: LEVEL_LABELS[l] }));
const STATUS_OPTIONS = (['active', 'inactive'] as const).map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));

function YesMark({ on, label }: { on: boolean; label: string }) {
  return on ? (
    <>
      <Check className="size-4 text-ink-2" aria-hidden />
      <span className="sr-only">{label}</span>
    </>
  ) : null;
}

export function RosterTable({
  athletes,
  program,
  canEdit,
  unit,
  seasonYear,
  compact,
  grouped,
  selectedIds,
  onSelectionChange,
  activeId,
  onOpen,
  onUpdate,
  empty,
}: RosterTableProps) {
  const columns = useMemo<ColumnDef<Athlete, unknown>[]>(() => {
    const name = (a: Athlete) => athleteName(a);
    const nameColumn: ColumnDef<Athlete, unknown> = {
      id: 'name',
      header: 'Name',
      accessorFn: nameSortKey,
      cell: ({ row }) => {
        const a = row.original;
        const legal = `${a.firstName} ${a.lastName}`.trim();
        const badge = ageBadge(a.birthYear, program, seasonYear);
        return (
          <div className="flex min-w-0 flex-col gap-0.5 py-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpen(a)}
                title={a.preferredName?.trim() ? legal : undefined}
                className="-mx-1 truncate rounded-control px-1 text-left font-medium text-ink hover:text-accent hover:underline"
              >
                {name(a)}
              </button>
              {a.status === 'inactive' && <InactiveTag />}
            </div>
            {compact && (
              <div className="flex flex-wrap items-center gap-1.5">
                <SideBadge side={a.side} canScull={a.canScull} />
                {a.canScull && a.side !== 'none' && (
                  <span className="text-xs text-ink-2">Sculls</span>
                )}
                {a.canCox && <span className="text-xs text-ink-2">Cox</span>}
                {badge && <AgeBadgeView badge={badge} />}
              </div>
            )}
          </div>
        );
      },
    };

    const weightColumn: ColumnDef<Athlete, unknown> = {
      id: 'weight',
      header: `Weight (${unit})`,
      accessorFn: (a) => a.weightKg ?? -1,
      size: 88,
      cell: ({ row }) => {
        const a = row.original;
        const shown = displayWeight(a.weightKg, unit);
        if (!canEdit) return <span className="tabular-nums">{shown ?? ''}</span>;
        return (
          <InlineInput<number | null>
            key={`${a.id}:${a.weightKg ?? ''}:${unit}`}
            value={shown == null ? '' : String(shown)}
            label={`Weight in ${unit} for ${name(a)}`}
            inputMode="decimal"
            maxLength={7}
            className="w-16 tabular-nums"
            parse={(t) => {
              const r = parseWeight(t, unit);
              return r.error ? { ok: false, error: r.error } : { ok: true, value: r.kg ?? null };
            }}
            onCommit={(kg) => onUpdate(a, { weightKg: kg })}
          />
        );
      },
    };

    if (compact) return [nameColumn, weightColumn];

    const cols: ColumnDef<Athlete, unknown>[] = [
      nameColumn,
      {
        id: 'side',
        header: 'Side',
        accessorFn: (a) => a.side,
        size: 120,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return <SideBadge side={a.side} canScull={a.canScull} />;
          return (
            <InlineSelect
              value={a.side}
              label={`Side for ${name(a)}`}
              options={SIDE_OPTIONS}
              onChange={(side) => onUpdate(a, { side })}
              className="w-[104px]"
            />
          );
        },
      },
      {
        id: 'canScull',
        header: 'Scull',
        enableSorting: false,
        accessorFn: (a) => (a.canScull ? 1 : 0),
        size: 56,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return <YesMark on={a.canScull} label="Can scull" />;
          return (
            <InlineCheckbox
              checked={a.canScull}
              label={`${name(a)} can scull`}
              onChange={(canScull) => onUpdate(a, { canScull })}
            />
          );
        },
      },
      {
        id: 'canCox',
        header: 'Cox',
        enableSorting: false,
        accessorFn: (a) => (a.canCox ? 1 : 0),
        size: 56,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return <YesMark on={a.canCox} label="Can cox" />;
          return (
            <InlineCheckbox
              checked={a.canCox}
              label={`${name(a)} can cox`}
              onChange={(canCox) => onUpdate(a, { canCox })}
            />
          );
        },
      },
      weightColumn,
      {
        id: 'birthYear',
        header: 'Born',
        accessorFn: (a) => a.birthYear ?? 0,
        size: 112,
        cell: ({ row }) => {
          const a = row.original;
          const badge = ageBadge(a.birthYear, program, seasonYear);
          return (
            <div className="flex items-center gap-1.5">
              {canEdit ? (
                <InlineInput<number | null>
                  key={`${a.id}:${a.birthYear ?? ''}`}
                  value={a.birthYear ? String(a.birthYear) : ''}
                  label={`Birth year for ${name(a)}`}
                  inputMode="numeric"
                  maxLength={4}
                  className="w-14 tabular-nums"
                  parse={(t) => {
                    const r = parseYear(t, { min: 1900, max: seasonYear, label: 'birth year' });
                    return r.error
                      ? { ok: false, error: r.error }
                      : { ok: true, value: r.value ?? null };
                  }}
                  onCommit={(birthYear) => onUpdate(a, { birthYear })}
                />
              ) : (
                <span className="w-10 tabular-nums">{a.birthYear ?? ''}</span>
              )}
              {badge && <AgeBadgeView badge={badge} />}
            </div>
          );
        },
      },
    ];

    if (program === 'juniors') {
      cols.push({
        id: 'gradYear',
        header: 'Grad',
        accessorFn: (a) => a.gradYear ?? 0,
        size: 76,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return <span className="tabular-nums">{a.gradYear ?? ''}</span>;
          return (
            <InlineInput<number | null>
              key={`${a.id}:${a.gradYear ?? ''}`}
              value={a.gradYear ? String(a.gradYear) : ''}
              label={`Graduation year for ${name(a)}`}
              inputMode="numeric"
              maxLength={4}
              className="w-16 tabular-nums"
              parse={(t) => {
                const r = parseYear(t, {
                  min: 1950,
                  max: seasonYear + 12,
                  label: 'graduation year',
                });
                return r.error
                  ? { ok: false, error: r.error }
                  : { ok: true, value: r.value ?? null };
              }}
              onCommit={(gradYear) => onUpdate(a, { gradYear })}
            />
          );
        },
      });
    }

    // Grouped, the group headings already say the level; the drawer still edits it.
    if (!grouped) {
      cols.push({
        id: 'level',
        header: 'Level',
        accessorFn: (a) => a.level,
        size: 144,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return LEVEL_LABELS[a.level];
          return (
            <InlineSelect
              value={a.level}
              label={`Level for ${name(a)}`}
              options={LEVEL_OPTIONS}
              onChange={(level) => onUpdate(a, { level })}
              className="w-32"
            />
          );
        },
      });
    }

    cols.push(
      {
        id: 'status',
        header: 'Status',
        accessorFn: (a) => a.status,
        size: 108,
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) return STATUS_LABELS[a.status];
          return (
            <InlineSelect
              value={a.status}
              label={`Status for ${name(a)}`}
              options={STATUS_OPTIONS}
              onChange={(status) => onUpdate(a, { status })}
              className="w-[92px]"
            />
          );
        },
      },
      {
        id: 'notes',
        header: 'Notes',
        accessorFn: (a) => a.notes ?? '',
        cell: ({ row }) => {
          const a = row.original;
          if (!canEdit) {
            return <span className="line-clamp-2 min-w-40 text-ink-2">{a.notes}</span>;
          }
          return (
            <InlineInput<string>
              key={`${a.id}:${a.notes ?? ''}`}
              value={a.notes ?? ''}
              label={`Notes for ${name(a)}`}
              className="min-w-24"
              parse={(t) => ({ ok: true, value: t.trim() })}
              onCommit={(notes) => onUpdate(a, { notes })}
            />
          );
        },
      },
    );
    return cols;
  }, [canEdit, compact, grouped, onOpen, onUpdate, program, seasonYear, unit]);

  return (
    <DataTable
      label="Roster"
      data={athletes}
      columns={columns}
      getRowId={(a) => a.id}
      initialSorting={[{ id: 'name', desc: false }]}
      selectable={canEdit}
      selectedIds={selectedIds}
      onSelectionChange={onSelectionChange}
      activeRowId={activeId}
      isMuted={(a) => a.status === 'inactive'}
      groupBy={grouped ? (a) => a.level : undefined}
      groupOrder={LEVEL_ORDER}
      groupLabel={(key, count) => (
        <span>
          {LEVEL_LABELS[key as keyof typeof LEVEL_LABELS] ?? key}{' '}
          <span className="font-normal tabular-nums">· {count}</span>
        </span>
      )}
      empty={empty}
    />
  );
}
