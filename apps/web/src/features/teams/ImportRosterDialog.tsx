// Roster import from CSV (PLAN.md §4.2): paste or upload, match columns (guessed from the
// headers), pick the weight unit, preview each row's problems, then add the good rows in one
// batch.

import { useState } from 'react';
import { athleteName, type Athlete, type Team } from '@srt/domain';
import { batchOp, useBatch } from '@/data';
import {
  CsvImportDialog,
  type CsvMapping,
  type CsvPreview,
  type CsvTable,
} from '@/components/CsvImport';
import { Checkbox, SegmentedControl } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import {
  buildRosterImport,
  checkRosterMapping,
  displayWeight,
  guessRosterMapping,
  guessWeightUnit,
  LEVEL_LABELS,
  ROSTER_FIELDS,
  SIDE_LABELS,
  STATUS_LABELS,
  type AthleteInput,
  type RosterField,
  type WeightUnit,
} from './lib';

/** PocketBase takes up to 200 writes per batch request. */
const BATCH_LIMIT = 200;

export function ImportRosterDialog({
  open,
  onOpenChange,
  team,
  roster,
  defaultUnit,
  seasonYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team;
  /** Every athlete on the team, active or not, for duplicate checks. */
  roster: readonly Athlete[];
  defaultUnit: WeightUnit;
  seasonYear: number;
}) {
  const [unitOverride, setUnitOverride] = useState<WeightUnit | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const batch = useBatch({ errorMessage: 'The athletes were not added. Try again.' });

  const unitFor = (table: CsvTable, mapping: CsvMapping<RosterField>) =>
    unitOverride ?? guessWeightUnit(table.headers, mapping) ?? defaultUnit;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setUnitOverride(null);
      setSkipDuplicates(true);
    }
  };

  const buildPreview = (
    table: CsvTable,
    mapping: CsvMapping<RosterField>,
  ): CsvPreview<AthleteInput> => {
    const unit = unitFor(table, mapping);
    const rows = buildRosterImport(table, mapping, {
      teamId: team.id,
      weightUnit: unit,
      existing: roster,
      skipDuplicates,
      seasonYear,
    });
    const has = (f: RosterField) => mapping.includes(f);
    const cols: { label: string; show: boolean; cell: (a: AthleteInput) => string }[] = [
      { label: 'Name', show: true, cell: (a) => athleteName(a) },
      {
        label: 'Side',
        show: has('side'),
        cell: (a) => (a.side === 'none' ? '' : SIDE_LABELS[a.side]),
      },
      {
        label: 'Scull',
        show: has('canScull') || has('side'),
        cell: (a) => (a.canScull ? 'Yes' : ''),
      },
      { label: 'Cox', show: has('canCox') || has('side'), cell: (a) => (a.canCox ? 'Yes' : '') },
      {
        label: `Weight (${unit})`,
        show: has('weight'),
        cell: (a) => String(displayWeight(a.weightKg, unit) ?? ''),
      },
      {
        label: 'Born',
        show: has('birthYear') || has('birthdate'),
        cell: (a) => String(a.birthYear ?? ''),
      },
      { label: 'Grad', show: has('gradYear'), cell: (a) => String(a.gradYear ?? '') },
      { label: 'Level', show: true, cell: (a) => LEVEL_LABELS[a.level] },
      { label: 'Status', show: has('status'), cell: (a) => STATUS_LABELS[a.status] },
      { label: 'Notes', show: has('notes'), cell: (a) => a.notes ?? '' },
    ];
    const shown = cols.filter((c) => c.show);
    return {
      columns: shown.map((c) => c.label),
      rows: rows.map((r) => {
        const raw = r.values;
        const rawName =
          [raw.firstName, raw.lastName].filter(Boolean).join(' ') || raw.fullName || '';
        return {
          id: String(r.row),
          label: `Row ${r.row}`,
          cells: shown.map((c, i) => (r.athlete ? c.cell(r.athlete) : i === 0 ? rawName : '')),
          errors: r.errors,
          warnings: r.warnings,
          skipped: r.skipped,
          data: r.athlete,
        };
      }),
    };
  };

  const onImport = async (athletes: AthleteInput[], preview: CsvPreview<AthleteInput>) => {
    for (let i = 0; i < athletes.length; i += BATCH_LIMIT) {
      const chunk = athletes.slice(i, i + BATCH_LIMIT);
      await batch.mutateAsync(chunk.map((a) => batchOp.create('athletes', a)));
    }
    const left = preview.rows.filter((r) => r.errors.length > 0).length;
    const skipped = preview.rows.filter((r) => r.skipped && r.errors.length === 0).length;
    const n = athletes.length;
    const parts = [`Added ${n === 1 ? '1 athlete' : `${n} athletes`} to ${team.name}.`];
    if (skipped > 0) {
      parts.push(
        `Skipped ${skipped === 1 ? '1 athlete' : `${skipped} athletes`} already on the roster.`,
      );
    }
    if (left > 0) {
      parts.push(`Left out ${left === 1 ? '1 row' : `${left} rows`} with problems.`);
    }
    return parts.join(' ');
  };

  return (
    <CsvImportDialog<RosterField, AthleteInput>
      open={open}
      onOpenChange={close}
      title="Import roster"
      sourceHint={
        <>
          Include a header row. SRT recognizes first and last name (or one name column), side (P, S,
          Both, Cox), can scull, can cox, weight, birth year, graduation year, gender, level,
          status, and notes. Other columns can be skipped.
        </>
      }
      placeholder={'First name,Last name,Side,Weight,Birth year\nWren,Castell,P,150,2010'}
      fields={ROSTER_FIELDS}
      guess={(headers) => guessRosterMapping(headers)}
      checkMapping={checkRosterMapping}
      options={({ table, mapping }) => {
        const guessed = guessWeightUnit(table.headers, mapping);
        return (
          <>
            {mapping.includes('weight') && (
              <div className="flex flex-wrap items-center gap-3">
                <span id="import-unit" className="text-sm font-medium">
                  Weights are in
                </span>
                <SegmentedControl<WeightUnit>
                  label="Weight unit"
                  value={unitFor(table, mapping)}
                  onValueChange={setUnitOverride}
                  options={[
                    { value: 'lb', label: 'Pounds' },
                    { value: 'kg', label: 'Kilograms' },
                  ]}
                  size="sm"
                />
                {guessed && !unitOverride && (
                  <span className="text-sm text-ink-2">From the column name.</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="import-skip-dupes"
                checked={skipDuplicates}
                onCheckedChange={(v) => setSkipDuplicates(v === true)}
              />
              <Label htmlFor="import-skip-dupes" className="font-normal">
                Skip athletes already on this roster (same first and last name)
              </Label>
            </div>
          </>
        );
      }}
      buildPreview={buildPreview}
      importLabel={(n) => (n === 1 ? 'Add 1 athlete' : `Add ${n} athletes`)}
      onImport={onImport}
    />
  );
}
