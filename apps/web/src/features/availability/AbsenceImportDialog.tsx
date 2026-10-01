// "Import from absence form": paste or upload the Google Form's responses, check which columns
// hold the name and this regatta's answers and what each answer means, match the names to the
// roster, then review the changes and import them as one batch. The logic lives in
// absence-import.ts; every guess here can be corrected.

import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import {
  athleteName,
  type Athlete,
  type Availability,
  type AvailabilityStatus,
  type Regatta,
  type Team,
} from '@regatta-ops/domain';
import type { BatchOp } from '@/data';
import { formatWeekday } from '@/lib/dates';
import { TeamChip } from '@/components/chips';
import { CsvSource, readCsvTable } from '@/components/CsvImport';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { regattaDays } from '@/features/regattas/duplicate';
import {
  answerGroups,
  guessAnswer,
  guessNameColumns,
  guessRegattaColumn,
  planAbsenceImport,
  readAbsenceRows,
  resolveRows,
  SKIP,
  timestampColumn,
  type AbsenceTable,
  type AnswerChoice,
  type NameColumns,
  type ResolvedRow,
  type RowPick,
} from './absence-import';
import type { AvailabilityDraft } from './availability-model';

type Step = 'source' | 'columns' | 'match' | 'preview';

const NOT_IN_FILE = '__none';
const ALL_TEAMS = 'all';

const CHOICE_OPTIONS: { value: AnswerChoice; label: string }[] = [
  { value: 'available', label: 'Available' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'keep', label: 'Leave as is' },
];

const STATUS_TEXT: Record<AvailabilityStatus, string> = {
  available: 'Available',
  maybe: 'Maybe',
  unavailable: 'Unavailable',
};

/** "Available", or "Available, unavailable Sun" with per-day choices. */
export function draftText(d: AvailabilityDraft, days: readonly string[]): string {
  const overrides = days.filter((day) => d.days[day] && d.days[day] !== d.status);
  if (overrides.length === 0) return STATUS_TEXT[d.status];
  const parts = overrides.map(
    (day) => `${STATUS_TEXT[d.days[day]!].toLowerCase()} ${formatWeekday(day).split(',')[0]}`,
  );
  return `${STATUS_TEXT[d.status]}, ${parts.join(', ')}`;
}

export interface AbsenceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regatta: Regatta;
  /** The participating teams. */
  teams: readonly Team[];
  /** Active athletes on those teams: the names the form is matched against. */
  athletes: readonly Athlete[];
  byAthlete: ReadonlyMap<string, Availability>;
  /** The team to match on at first ('all' or a team id): the page's team filter. */
  defaultTeamId: string;
  /** Write the batch; resolves true when it was written (false when a confirmation said no). */
  onConfirm: (ops: BatchOp[]) => Promise<boolean>;
}

export function AbsenceImportDialog({ open, onOpenChange, ...props }: AbsenceImportDialogProps) {
  // Remount on every open so each import starts clean.
  const [session, setSession] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSession((s) => s + 1);
        onOpenChange(next);
      }}
    >
      {open && <AbsenceImportBody key={session} {...props} onDone={() => onOpenChange(false)} />}
    </Dialog>
  );
}

function AbsenceImportBody({
  regatta,
  teams,
  athletes,
  byAthlete,
  defaultTeamId,
  onConfirm,
  onDone,
}: Omit<AbsenceImportDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const id = useId();
  const [step, setStep] = useState<Step>('source');
  const [text, setText] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [table, setTable] = useState<AbsenceTable | null>(null);
  const [names, setNames] = useState<NameColumns>({ name: null, lastName: null });
  const [answerColumn, setAnswerColumn] = useState<number | null>(null);
  const [answerGuessed, setAnswerGuessed] = useState(false);
  const [teamId, setTeamId] = useState(
    teams.some((t) => t.id === defaultTeamId) ? defaultTeamId : ALL_TEAMS,
  );
  const [choices, setChoices] = useState<Record<string, AnswerChoice>>({});
  const [picks, setPicks] = useState<Record<number, RowPick>>({});
  const [unchecked, setUnchecked] = useState<ReadonlySet<number>>(new Set());

  const days = useMemo(() => regattaDays(regatta), [regatta]);
  const athleteById = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const pool = useMemo(
    () => (teamId === ALL_TEAMS ? athletes : athletes.filter((a) => a.teamId === teamId)),
    [athletes, teamId],
  );
  const stamp = table ? timestampColumn(table.headers) : null;

  const rows = useMemo(
    () =>
      table && names.name !== null && answerColumn !== null
        ? readAbsenceRows(table, { names, answerColumn, timestampColumn: stamp }, pool)
        : [],
    [table, names, answerColumn, stamp, pool],
  );
  const groups = useMemo(
    () =>
      answerGroups(
        rows.map((r) => [r.answer]),
        0,
      ),
    [rows],
  );
  const effectiveChoices = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.key, choices[g.key] ?? guessAnswer(g.label)])),
    [groups, choices],
  );
  const resolved = useMemo(() => resolveRows(rows, picks), [rows, picks]);
  const changes = useMemo(
    () =>
      planAbsenceImport(resolved, effectiveChoices, {
        regattaId: regatta.id,
        regattaDays: days,
        byAthlete,
      }),
    [resolved, effectiveChoices, regatta.id, days, byAthlete],
  );
  const selected = changes.filter((c) => !unchecked.has(c.line));

  const readSource = (source = text) => {
    const parsed = readCsvTable(source);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setSourceError('Paste the header row and at least one response, or choose the CSV file.');
      return;
    }
    const guessed = guessNameColumns(parsed.headers);
    const col = guessRegattaColumn(parsed.headers, regatta.name, [
      guessed.name,
      guessed.lastName,
      timestampColumn(parsed.headers),
    ]);
    setSourceError(null);
    setTable(parsed);
    setNames(guessed);
    setAnswerColumn(col);
    setAnswerGuessed(col !== null);
    setChoices({});
    setPicks({});
    setUnchecked(new Set());
    setStep('columns');
  };

  const run = async () => {
    const ops = selected.map((c) => c.op);
    onDone();
    try {
      if (await onConfirm(ops)) {
        toast.success(
          `${ops.length} ${ops.length === 1 ? 'change' : 'changes'} imported from the absence form`,
        );
      }
    } catch {
      // The mutation's toast says what went wrong.
    }
  };

  const descriptions: Record<Step, string> = {
    source:
      "Download the form's responses as a CSV file (in Google Sheets: File, Download, Comma-separated values), then paste them here or choose the file.",
    columns: `Check which columns hold the names and the answers for ${regatta.name}, and what each answer means.`,
    match: 'Names were matched to the roster. Check the close spellings and pick the rest.',
    preview:
      changes.length === 0
        ? 'Nothing to import.'
        : `${changes.length} ${changes.length === 1 ? 'athlete changes' : 'athletes change'}. Uncheck any you want to leave as they are.`,
  };

  return (
    <DialogContent
      title="Import from absence form"
      description={descriptions[step]}
      className="max-w-3xl"
    >
      {step === 'source' && (
        <div className="flex flex-col gap-3">
          <CsvSource
            label="Form responses"
            text={text}
            onTextChange={(t) => {
              setText(t);
              setSourceError(null);
            }}
            onFileText={(content) => {
              setText(content);
              readSource(content);
            }}
            error={sourceError}
            hint="One row per response: a timestamp, the athlete's name, and one column per regatta."
          />
          <DialogFooter>
            <Button onClick={onDone}>Cancel</Button>
            <Button variant="primary" onClick={() => readSource()} disabled={!text.trim()}>
              Match columns
            </Button>
          </DialogFooter>
        </div>
      )}

      {step === 'columns' && table && (
        <ColumnsStep
          id={id}
          regattaName={regatta.name}
          table={table}
          names={names}
          onNamesChange={setNames}
          answerColumn={answerColumn}
          answerGuessed={answerGuessed}
          onAnswerColumnChange={(c) => {
            setAnswerColumn(c);
            setAnswerGuessed(false);
          }}
          teams={teams}
          teamId={teamId}
          onTeamChange={(t) => {
            setTeamId(t);
            setPicks({});
          }}
          groups={groups}
          choiceOf={(key) => effectiveChoices[key] ?? 'keep'}
          onChoiceChange={(key, c) => setChoices((m) => ({ ...m, [key]: c }))}
          onBack={() => setStep('source')}
          onNext={() => setStep('match')}
        />
      )}

      {step === 'match' && (
        <MatchStep
          resolved={resolved}
          pool={pool}
          athleteById={athleteById}
          picks={picks}
          onPick={(line, pick) => setPicks((p) => ({ ...p, [line]: pick }))}
          onBack={() => setStep('columns')}
          onNext={() => {
            setUnchecked(new Set());
            setStep('preview');
          }}
        />
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          {changes.length === 0 ? (
            <p role="status" className="text-base leading-prose text-ink-2">
              Availability already matches the form for every matched athlete.
            </p>
          ) : (
            <div className="max-h-[50dvh] overflow-auto rounded-card border border-line">
              <table className="w-full border-collapse text-sm" aria-label="Changes to import">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-ink-2">
                    <th scope="col" className="h-8 w-10 px-2 font-medium">
                      <span className="sr-only">Import</span>
                    </th>
                    <th scope="col" className="h-8 px-2 font-medium">
                      Athlete
                    </th>
                    <th scope="col" className="h-8 px-2 font-medium">
                      Change
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => {
                    const a = athleteById.get(c.athleteId);
                    const name = a ? athleteName(a) : 'Unknown athlete';
                    const team = a ? teamById.get(a.teamId) : undefined;
                    const checked = !unchecked.has(c.line);
                    return (
                      <tr key={c.line} className="border-b border-line last:border-b-0">
                        <td className="px-2 py-1">
                          <label className="flex size-8 items-center justify-center pointer-coarse:size-11">
                            <Checkbox
                              checked={checked}
                              aria-label={`Import the change for ${name}`}
                              onCheckedChange={(v) =>
                                setUnchecked((s) => {
                                  const next = new Set(s);
                                  if (v === true) next.delete(c.line);
                                  else next.add(c.line);
                                  return next;
                                })
                              }
                            />
                          </label>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{name}</span>
                            {team && teams.length > 1 && <TeamChip team={team} short size="sm" />}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span className="text-ink-2">{draftText(c.before, days)}</span>
                            <ArrowRight aria-label="to" className="size-3.5 text-ink-2" />
                            <span className={c.after.status === 'unavailable' ? 'text-danger' : ''}>
                              {draftText(c.after, days)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setStep('match')}>Back</Button>
            {changes.length === 0 ? (
              <Button variant="primary" onClick={onDone}>
                Close
              </Button>
            ) : (
              <Button variant="primary" disabled={selected.length === 0} onClick={() => void run()}>
                Import {selected.length} {selected.length === 1 ? 'change' : 'changes'}
              </Button>
            )}
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}

// ---------------------------------------------------------------------------

function columnOptions(headers: readonly string[]) {
  return headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));
}

function firstValue(table: AbsenceTable, col: number | null): string {
  if (col === null) return '';
  return table.rows.find((r) => r[col]?.trim())?.[col]?.trim() ?? '';
}

function ColumnsStep({
  id,
  regattaName,
  table,
  names,
  onNamesChange,
  answerColumn,
  answerGuessed,
  onAnswerColumnChange,
  teams,
  teamId,
  onTeamChange,
  groups,
  choiceOf,
  onChoiceChange,
  onBack,
  onNext,
}: {
  id: string;
  regattaName: string;
  table: AbsenceTable;
  names: NameColumns;
  onNamesChange: (n: NameColumns) => void;
  answerColumn: number | null;
  answerGuessed: boolean;
  onAnswerColumnChange: (c: number | null) => void;
  teams: readonly Team[];
  teamId: string;
  onTeamChange: (t: string) => void;
  groups: { key: string; label: string; count: number }[];
  choiceOf: (key: string) => AnswerChoice;
  onChoiceChange: (key: string, c: AnswerChoice) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const options = columnOptions(table.headers);
  const sample = (col: number | null) => {
    const v = firstValue(table, col);
    return col === null ? undefined : v ? `First value: ${v}` : 'Empty column';
  };
  const problem =
    names.name === null
      ? "Choose the column with the athletes' names."
      : answerColumn === null
        ? `Choose the column with the answers for ${regattaName}.`
        : null;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Field
          id={`${id}-name`}
          label={names.lastName === null ? 'Name' : 'First name'}
          hint={sample(names.name)}
        >
          <Select
            id={`${id}-name`}
            value={names.name === null ? null : String(names.name)}
            placeholder="Choose a column"
            onValueChange={(v) => onNamesChange({ ...names, name: Number(v) })}
            options={options}
            className="w-full"
          />
        </Field>
        <Field
          id={`${id}-last`}
          label="Last name"
          hint={
            names.lastName === null
              ? 'Only when last names have a column of their own.'
              : sample(names.lastName)
          }
        >
          <Select
            id={`${id}-last`}
            value={names.lastName === null ? NOT_IN_FILE : String(names.lastName)}
            onValueChange={(v) =>
              onNamesChange({ ...names, lastName: v === NOT_IN_FILE ? null : Number(v) })
            }
            options={[{ value: NOT_IN_FILE, label: 'In the name column' }, ...options]}
            className="w-full"
          />
        </Field>
        <Field
          id={`${id}-answers`}
          label={`Answers for ${regattaName}`}
          hint={
            answerColumn === null
              ? 'No column is named like this regatta. Pick the one with its answers.'
              : answerGuessed
                ? 'Matched by the column name.'
                : sample(answerColumn)
          }
        >
          <Select
            id={`${id}-answers`}
            value={answerColumn === null ? null : String(answerColumn)}
            placeholder="Choose a column"
            onValueChange={(v) => onAnswerColumnChange(Number(v))}
            options={options}
            className="w-full"
          />
        </Field>
        {teams.length > 1 && (
          <Field
            id={`${id}-team`}
            label="Match names on"
            hint="Names are matched against this roster."
          >
            <Select
              id={`${id}-team`}
              value={teamId}
              onValueChange={onTeamChange}
              options={[
                { value: ALL_TEAMS, label: 'Every team in this regatta' },
                ...teams.map((t) => ({ value: t.id, label: t.name })),
              ]}
              className="w-full"
            />
          </Field>
        )}
      </div>

      {!problem && groups.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-medium">What the answers mean</h3>
          <div className="max-h-[40dvh] overflow-auto rounded-card border border-line">
            <table className="w-full border-collapse text-sm" aria-label="Answers">
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-line text-left text-ink-2">
                  <th scope="col" className="h-8 px-2 font-medium">
                    Answer
                  </th>
                  <th scope="col" className="h-8 px-2 text-right font-medium">
                    Responses
                  </th>
                  <th scope="col" className="h-8 px-2 font-medium">
                    Means
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key} className="border-b border-line last:border-b-0">
                    <td className="max-w-64 px-2 py-1.5 break-words">
                      {g.label || <span className="text-ink-2">No answer</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{g.count}</td>
                    <td className="px-2 py-1">
                      <Select
                        value={choiceOf(g.key)}
                        onValueChange={(v) => onChoiceChange(g.key, v)}
                        options={CHOICE_OPTIONS}
                        label={`Meaning of ${g.label ? `"${g.label}"` : 'no answer'}`}
                        className="h-8 w-36 sm:w-40"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      <DialogFooter>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext} disabled={!!problem}>
          Match athletes
        </Button>
      </DialogFooter>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MatchStep({
  resolved,
  pool,
  athleteById,
  picks,
  onPick,
  onBack,
  onNext,
}: {
  resolved: ResolvedRow[];
  pool: readonly Athlete[];
  athleteById: ReadonlyMap<string, Athlete>;
  picks: Readonly<Record<number, RowPick>>;
  onPick: (line: number, pick: RowPick) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const roster = useMemo(
    () =>
      [...pool].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'en') ||
          a.firstName.localeCompare(b.firstName, 'en'),
      ),
    [pool],
  );
  // Rows stay in their section after a pick, so the coach sees what they chose.
  const unmatched = resolved.filter((r) => !r.match);
  const close = resolved.filter((r) => r.match && r.match.score < 1);
  const exact = resolved.filter((r) => r.match?.score === 1);
  const superseded = resolved.filter((r) => r.supersededBy !== null && r.athleteId);
  const matched = resolved.filter((r) => r.athleteId).length;
  const name = (athleteId: string | null) => {
    const a = athleteId ? athleteById.get(athleteId) : undefined;
    return a ? athleteName(a) : '';
  };

  const picker = (r: ResolvedRow) => (
    <AthletePicker
      row={r}
      roster={roster}
      value={picks[r.line] === SKIP ? null : (r.athleteId ?? null)}
      onChange={(v) => onPick(r.line, v ?? SKIP)}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-base text-ink">
        <span className="font-display font-semibold tabular-nums">
          {matched} of {resolved.length}
        </span>{' '}
        {resolved.length === 1 ? 'response matches' : 'responses match'} an athlete.
        {resolved.length - matched > 0 && (
          <span className="text-ink-2">
            {' '}
            {resolved.length - matched} without an athlete will be skipped.
          </span>
        )}
      </p>

      {unmatched.length > 0 && (
        <MatchSection
          title={`No match on the roster (${unmatched.length})`}
          hint="Pick the athlete for each response, or leave it to be skipped."
        >
          {unmatched.map((r) => (
            <MatchRow key={r.line} row={r}>
              {picker(r)}
            </MatchRow>
          ))}
        </MatchSection>
      )}

      {close.length > 0 && (
        <MatchSection
          title={`Close spellings (${close.length})`}
          hint="Matched to the nearest name on the roster. Change any that are wrong."
        >
          {close.map((r) => (
            <MatchRow key={r.line} row={r}>
              {picker(r)}
            </MatchRow>
          ))}
        </MatchSection>
      )}

      {superseded.length > 0 && (
        <MatchSection
          title={`Answered more than once (${superseded.length})`}
          hint="Only each athlete's latest response is used."
        >
          {superseded.map((r) => (
            <li key={r.line} className="px-3 py-2 text-sm text-ink-2">
              {name(r.athleteId)}: row {r.line} is replaced by row {r.supersededBy}.
            </li>
          ))}
        </MatchSection>
      )}

      {exact.length > 0 && (
        <details className="rounded-card border border-line px-3 py-2">
          <summary className="cursor-pointer text-base font-medium">
            Exact matches ({exact.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {exact.map((r) => (
              <li key={r.line}>
                {r.name.text}
                <span className="text-ink-2"> · row {r.line}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <DialogFooter>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" onClick={onNext}>
          Preview changes
        </Button>
      </DialogFooter>
    </div>
  );
}

function MatchSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-medium">{title}</h3>
        <p className="text-sm text-ink-2">{hint}</p>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
        {children}
      </ul>
    </section>
  );
}

function MatchRow({ row, children }: { row: ResolvedRow; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium break-words">{row.name.text}</span>
        <span className="text-sm text-ink-2">
          Row {row.line} · {row.answer || 'No answer'}
          {row.supersededBy !== null && ` · replaced by row ${row.supersededBy}`}
        </span>
      </div>
      <div className="w-full sm:w-64">{children}</div>
    </li>
  );
}

function AthletePicker({
  row,
  roster,
  value,
  onChange,
}: {
  row: ResolvedRow;
  roster: readonly Athlete[];
  value: string | null;
  onChange: (athleteId: string | null) => void;
}) {
  const options = useMemo((): ComboboxOption[] => {
    const suggested = new Set(row.candidates.map((c) => c.athleteId));
    const byId = new Map(roster.map((a) => [a.id, a]));
    const option = (a: Athlete, group: string): ComboboxOption => ({
      value: a.id,
      label: athleteName(a),
      keywords: [a.firstName, a.lastName],
      group,
    });
    return [
      ...row.candidates
        .map((c) => byId.get(c.athleteId))
        .filter((a): a is Athlete => !!a)
        .map((a) => option(a, 'Close matches')),
      ...roster.filter((a) => !suggested.has(a.id)).map((a) => option(a, 'Everyone else')),
    ];
  }, [row.candidates, roster]);
  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={onChange}
      label={`Athlete for ${row.name.text}, row ${row.line}`}
      placeholder="Pick an athlete"
      searchPlaceholder="Search the roster"
      clearable="Skip this response"
      className="w-full"
    />
  );
}
