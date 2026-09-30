// Roster import from CSV (PLAN.md §4.2) on the shared CsvImportDialog: paste or upload, match
// columns (guessed from the headers), pick the weight unit, preview each row's problems, then
// add the good rows in batches.

import { useState } from 'react';
import type { Athlete, Team } from '@srt/domain';
import { batchOp, useBatch } from '@/data';
import { CsvImportDialog, type CsvContext } from '@/components/CsvImport';
import { Checkbox, SegmentedControl } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import {
  buildRosterImport,
  checkRosterMapping,
  guessWeightUnit,
  ROSTER_FIELDS,
  type AthleteInput,
  type WeightUnit,
} from './lib';

/** PocketBase takes up to 200 writes per batch request; 100 leaves room. */
const CHUNK = 100;

const PREVIEW = ['firstName', 'lastName', 'fullName', 'side', 'weight', 'birthYear', 'level'];

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
  const { mutateAsync } = useBatch({
    errorMessage: 'The import did not finish. Check the roster, then import the missing rows.',
  });

  const unitFor = ({ table, mapping }: CsvContext) =>
    unitOverride ?? guessWeightUnit(table.headers, mapping) ?? defaultUnit;

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setUnitOverride(null);
      setSkipDuplicates(true);
    }
  };

  return (
    <CsvImportDialog<AthleteInput>
      open={open}
      onOpenChange={close}
      title="Import roster"
      noun={['athlete', 'athletes']}
      fields={ROSTER_FIELDS}
      previewFields={(mapping) => PREVIEW.filter((k) => mapping[k] != null)}
      checkMapping={checkRosterMapping}
      hint="SRT recognizes first and last name (or one name column), side (P, S, Both, Cox), can scull, can cox, weight, birth year, graduation year, gender, level, status, and notes."
      options={(ctx) => (
        <>
          {ctx.mapping.weight != null && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Weights are in</span>
              <SegmentedControl<WeightUnit>
                label="Weight unit"
                value={unitFor(ctx)}
                onValueChange={setUnitOverride}
                options={[
                  { value: 'lb', label: 'Pounds' },
                  { value: 'kg', label: 'Kilograms' },
                ]}
                size="sm"
              />
              {!unitOverride && guessWeightUnit(ctx.table.headers, ctx.mapping) && (
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
      )}
      check={(rows, ctx) =>
        buildRosterImport(rows, {
          teamId: team.id,
          weightUnit: unitFor(ctx),
          existing: roster,
          skipDuplicates,
          seasonYear,
        }).map((r) => ({ record: r.athlete, errors: r.errors, warnings: r.warnings }))
      }
      onImport={async (athletes) => {
        for (let i = 0; i < athletes.length; i += CHUNK) {
          await mutateAsync(athletes.slice(i, i + CHUNK).map((a) => batchOp.create('athletes', a)));
        }
      }}
    />
  );
}
