// Roster import from CSV on the shared CsvImportDialog: paste or upload, match columns (guessed
// from the headers), preview each row's problems, then add the good rows in batches.

import { useState } from 'react';
import type { Athlete, Team } from '@regatta-ops/domain';
import { batchOp, useBatch } from '@/data';
import { CsvImportDialog } from '@/components/CsvImport';
import { Checkbox } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { buildRosterImport, checkRosterMapping, ROSTER_FIELDS, type AthleteInput } from './lib';

/** PocketBase takes up to 200 writes per batch request; 100 leaves room. */
const CHUNK = 100;

const PREVIEW = ['firstName', 'lastName', 'fullName', 'side', 'birthYear', 'level'];

export function ImportRosterDialog({
  open,
  onOpenChange,
  team,
  roster,
  seasonYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team;
  /** Every athlete on the team, active or not, for duplicate checks. */
  roster: readonly Athlete[];
  seasonYear: number;
}) {
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const { mutateAsync } = useBatch({
    errorMessage: 'The import did not finish. Check the roster, then import the missing rows.',
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setSkipDuplicates(true);
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
      hint="Regatta Ops recognizes first and last name (or one name column), side (P, S, Both, Cox), can scull, can cox, birth year, graduation year, gender, level, status, and notes."
      options={() => (
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
      )}
      check={(rows) =>
        buildRosterImport(rows, {
          teamId: team.id,
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
