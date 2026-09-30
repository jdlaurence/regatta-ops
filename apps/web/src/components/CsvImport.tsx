// Generic CSV import (PLAN.md §4.2, §4.11): paste or upload, match columns to fields, preview
// with the problems in each row, then write. Feature code supplies the fields, the per-row
// parsing and validation, and the write; the roster import (features/teams) is the first user
// and the fleet tables can use the same steps.
//
//   <CsvImportDialog
//     open={open} onOpenChange={setOpen} title="Import roster"
//     fields={ROSTER_FIELDS}
//     buildPreview={(table, mapping) => ...}      // rows with errors, warnings, and parsed data
//     importLabel={(n) => `Add ${n} athletes`}
//     onImport={async (rows) => 'Added 24 athletes.'}
//   />

import { useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CircleCheck, CircleX, FileUp } from 'lucide-react';
import { detectDelimiter, parseDelimited } from '@srt/domain';
import { cn } from '@/lib/cn';
import { Button } from './ui/button';
import { Checkbox, Switch } from './ui/controls';
import { Dialog, DialogContent, DialogFooter } from './ui/dialog';
import { Label, Textarea } from './ui/input';
import { Select } from './ui/select';

// ---------------------------------------------------------------------------
// Pure helpers

export interface CsvField<K extends string = string> {
  key: K;
  /** What the mapping step calls the field: "First name". */
  label: string;
  /** Header names that mean this field, compared after normalizeHeader(). */
  aliases: readonly string[];
}

/** A parsed file: header names and data rows, every row as wide as the header. */
export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** The field each column holds, by column index; null skips the column. */
export type CsvMapping<K extends string = string> = (K | null)[];

/** Lowercase, no accents, punctuation to spaces (except / & +): "Weight (lbs)" → "weight lbs". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}/&+ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse pasted or uploaded text (comma or tab separated) into a table. */
export function readCsvTable(text: string, hasHeader = true): CsvTable {
  const rows = parseDelimited(text, detectDelimiter(text)).map((r) => r.map((c) => c.trim()));
  if (rows.length === 0) return { headers: [], rows: [] };
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill('')];
  const numbered = (i: number) => `Column ${i + 1}`;
  if (!hasHeader) {
    return { headers: Array.from({ length: width }, (_, i) => numbered(i)), rows: rows.map(pad) };
  }
  const [head = [], ...body] = rows;
  return { headers: pad(head).map((h, i) => h || numbered(i)), rows: body.map(pad) };
}

function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Guess which field each column holds from its header. Exact matches (label or alias) win;
 * then the longest alias found inside the header as whole words. Each field is used once.
 */
export function guessColumns<K extends string>(
  headers: readonly string[],
  fields: readonly CsvField<K>[],
): CsvMapping<K> {
  const norm = headers.map(normalizeHeader);
  const out: CsvMapping<K> = headers.map(() => null);
  const used = new Set<K>();
  const names = (f: CsvField<K>) => [f.label, ...f.aliases].map(normalizeHeader);
  norm.forEach((h, i) => {
    const f = fields.find((f) => !used.has(f.key) && names(f).includes(h));
    if (f) {
      out[i] = f.key;
      used.add(f.key);
    }
  });
  norm.forEach((h, i) => {
    if (out[i] || !h) return;
    let best: { key: K; len: number } | null = null;
    for (const f of fields) {
      if (used.has(f.key)) continue;
      for (const a of names(f)) {
        if (a.length < 2 || !containsWords(h, a)) continue;
        if (!best || a.length > best.len) best = { key: f.key, len: a.length };
      }
    }
    if (best) {
      out[i] = best.key;
      used.add(best.key);
    }
  });
  return out;
}

/** Assign `key` to column `index`; any other column holding it is skipped instead. */
export function assignColumn<K extends string>(
  mapping: CsvMapping<K>,
  index: number,
  key: K | null,
): CsvMapping<K> {
  return mapping.map((m, i) => (i === index ? key : key !== null && m === key ? null : m));
}

// ---------------------------------------------------------------------------
// The dialog

export interface CsvPreviewRow<T> {
  id: string;
  /** "Row 3", counting data rows from 1. */
  label: string;
  /** Display text for each preview column. */
  cells: ReactNode[];
  errors: string[];
  warnings: string[];
  /** Left out on purpose (a duplicate, say); not an error. */
  skipped?: boolean;
  /** The parsed record; null when the row has errors. */
  data: T | null;
}

export interface CsvPreview<T> {
  columns: string[];
  rows: CsvPreviewRow<T>[];
}

/** The rows that will be written: no errors, not skipped. */
export function readyRows<T>(preview: CsvPreview<T>): T[] {
  return preview.rows.flatMap((r) =>
    r.errors.length === 0 && !r.skipped && r.data ? [r.data] : [],
  );
}

export interface CsvImportDialogProps<K extends string, T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Import roster". */
  title: string;
  /** Under the paste box: which columns work. */
  sourceHint?: ReactNode;
  placeholder?: string;
  fields: readonly CsvField<K>[];
  /** Defaults to guessColumns(headers, fields). */
  guess?: (headers: string[]) => CsvMapping<K>;
  /** Extra controls on the mapping step (weight unit, duplicates), given the current mapping. */
  options?: (ctx: { table: CsvTable; mapping: CsvMapping<K> }) => ReactNode;
  /** Why the mapping cannot work yet ("Choose a column for first names."), or null. */
  checkMapping?: (mapping: CsvMapping<K>) => string | null;
  buildPreview: (table: CsvTable, mapping: CsvMapping<K>) => CsvPreview<T>;
  /** The import button: "Add 24 athletes". */
  importLabel: (count: number) => string;
  /** Write the ready rows; resolve to the summary sentence for the last step. */
  onImport: (rows: T[], preview: CsvPreview<T>) => Promise<ReactNode>;
}

type Step = 'source' | 'mapping' | 'preview' | 'done';

const SKIP = '__skip';

export function CsvImportDialog<K extends string, T>({
  open,
  onOpenChange,
  title,
  sourceHint,
  placeholder = 'Paste rows copied from a spreadsheet, with the column names in the first row.',
  fields,
  guess,
  options,
  checkMapping,
  buildPreview,
  importLabel,
  onImport,
}: CsvImportDialogProps<K, T>) {
  const [step, setStep] = useState<Step>('source');
  const [text, setText] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping<K>>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ReactNode>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uid = useId();

  const reset = () => {
    setStep('source');
    setText('');
    setTable(null);
    setMapping([]);
    setSourceError(null);
    setProblemsOnly(false);
    setSummary(null);
    setBusy(false);
  };

  const close = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const readText = (raw: string, header = hasHeader) => {
    const t = readCsvTable(raw, header);
    if (t.rows.length === 0) {
      setSourceError(
        header
          ? 'No rows found under the column names. Paste the column names first, then one row per line.'
          : 'No rows found. Paste one row per line.',
      );
      return;
    }
    setSourceError(null);
    setTable(t);
    setMapping(
      header ? (guess ?? ((h) => guessColumns(h, fields)))(t.headers) : t.headers.map(() => null),
    );
    setStep('mapping');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const raw = await file.text();
    setText(raw);
    readText(raw);
    if (fileRef.current) fileRef.current.value = '';
  };

  const mappingProblem =
    step === 'mapping' && mapping.every((m) => m === null)
      ? 'Choose what at least one column holds.'
      : step === 'mapping'
        ? (checkMapping?.(mapping) ?? null)
        : null;

  const preview = step === 'preview' && table ? buildPreview(table, mapping) : null;
  const ready = preview ? readyRows(preview) : [];
  const withErrors = preview ? preview.rows.filter((r) => r.errors.length > 0).length : 0;
  const skipped = preview
    ? preview.rows.filter((r) => r.skipped && r.errors.length === 0).length
    : 0;
  const withWarnings = preview
    ? preview.rows.filter((r) => r.warnings.length > 0 && r.errors.length === 0 && !r.skipped)
        .length
    : 0;

  const runImport = async () => {
    if (!preview || ready.length === 0) return;
    setBusy(true);
    try {
      const result = await onImport(ready, preview);
      setSummary(result);
      setStep('done');
    } catch {
      // The write reports its own error (a toast); stay on the preview to try again.
    } finally {
      setBusy(false);
    }
  };

  const stepText: Record<Step, string> = {
    source: 'Step 1 of 3. Paste rows or choose a CSV file.',
    mapping: 'Step 2 of 3. Check what each column holds.',
    preview: 'Step 3 of 3. Check the rows before adding them.',
    done: 'Done.',
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title={title} description={stepText[step]} className="max-w-3xl">
        {step === 'source' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${uid}-text`}>Rows to import</Label>
              <Textarea
                id={`${uid}-text`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={placeholder}
                spellCheck={false}
                aria-invalid={!!sourceError || undefined}
                aria-describedby={sourceError ? `${uid}-err` : `${uid}-hint`}
                className="min-h-40 font-mono text-sm"
              />
              {sourceHint && !sourceError && (
                <p id={`${uid}-hint`} className="text-sm leading-prose text-ink-2">
                  {sourceHint}
                </p>
              )}
              {sourceError && (
                <p id={`${uid}-err`} className="text-sm text-danger">
                  {sourceError}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 text-base">
              <Checkbox
                checked={hasHeader}
                onCheckedChange={(v) => setHasHeader(v === true)}
                aria-label="The first row has the column names"
              />
              The first row has the column names
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <DialogFooter className="justify-between">
              <Button onClick={() => fileRef.current?.click()}>
                <FileUp aria-hidden />
                Choose a file
              </Button>
              <Button variant="primary" disabled={!text.trim()} onClick={() => readText(text)}>
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'mapping' && table && (
          <div className="flex flex-col gap-4">
            <p className="text-base text-ink-2">
              {table.rows.length === 1 ? '1 row' : `${table.rows.length} rows`} found.
            </p>
            <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
              {table.headers.map((header, i) => {
                const samples = table.rows
                  .map((r) => r[i] ?? '')
                  .filter((v) => v !== '')
                  .slice(0, 3);
                const selectId = `${uid}-col-${i}`;
                return (
                  <li
                    key={i}
                    className="grid grid-cols-1 items-center gap-2 px-3 py-2 sm:grid-cols-[1fr_200px]"
                  >
                    <div className="flex min-w-0 flex-col">
                      <label htmlFor={selectId} className="truncate font-medium text-ink">
                        {header}
                      </label>
                      <span className="truncate text-sm text-ink-2">
                        {samples.length > 0 ? samples.join(', ') : 'Empty'}
                      </span>
                    </div>
                    <Select
                      id={selectId}
                      value={mapping[i] ?? SKIP}
                      onValueChange={(v) =>
                        setMapping((m) => assignColumn(m, i, v === SKIP ? null : (v as K)))
                      }
                      options={[
                        { value: SKIP, label: 'Skip this column' },
                        ...fields.map((f) => ({ value: f.key as string, label: f.label })),
                      ]}
                      className={cn('w-full', mapping[i] === null && 'text-ink-2')}
                    />
                  </li>
                );
              })}
            </ul>
            {options && <div className="flex flex-col gap-3">{options({ table, mapping })}</div>}
            {mappingProblem && (
              <p role="alert" className="text-sm text-danger">
                {mappingProblem}
              </p>
            )}
            <DialogFooter>
              <Button onClick={() => setStep('source')}>Back</Button>
              <Button
                variant="primary"
                disabled={!!mappingProblem}
                onClick={() => setStep('preview')}
              >
                Preview rows
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="flex flex-col gap-3">
            <PreviewSummary
              ready={ready.length}
              withErrors={withErrors}
              skipped={skipped}
              withWarnings={withWarnings}
            />
            {withErrors + withWarnings + skipped > 0 && (
              <label className="flex items-center gap-2 text-base">
                <Switch
                  checked={problemsOnly}
                  onCheckedChange={setProblemsOnly}
                  aria-label="Show only rows with problems"
                />
                Show only rows with problems
              </label>
            )}
            <PreviewTable preview={preview} problemsOnly={problemsOnly} />
            <DialogFooter>
              <Button onClick={() => setStep('mapping')} disabled={busy}>
                Back
              </Button>
              <Button
                variant="primary"
                disabled={ready.length === 0 || busy}
                onClick={() => void runImport()}
              >
                {busy ? 'Adding…' : importLabel(ready.length)}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'done' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 text-base leading-prose">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
              <div>{summary}</div>
            </div>
            <DialogFooter>
              <Button onClick={reset}>Import another file</Button>
              <Button variant="primary" onClick={() => close(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewSummary({
  ready,
  withErrors,
  skipped,
  withWarnings,
}: {
  ready: number;
  withErrors: number;
  skipped: number;
  withWarnings: number;
}) {
  const rows = (n: number) => (n === 1 ? '1 row' : `${n} rows`);
  return (
    <ul className="flex flex-col gap-1 text-base" aria-live="polite">
      <li className="flex items-center gap-2">
        <CircleCheck className="size-4 shrink-0 text-ok" aria-hidden />
        {ready === 0 ? 'No rows are ready to add.' : `${rows(ready)} ready to add.`}
      </li>
      {withWarnings > 0 && (
        <li className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
          {rows(withWarnings)} with a note to check; they will be added.
        </li>
      )}
      {skipped > 0 && (
        <li className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
          {rows(skipped)} skipped.
        </li>
      )}
      {withErrors > 0 && (
        <li className="flex items-center gap-2">
          <CircleX className="size-4 shrink-0 text-danger" aria-hidden />
          {rows(withErrors)} with problems will be left out. Fix them in the file and import again,
          or add them by hand.
        </li>
      )}
    </ul>
  );
}

function PreviewTable<T>({
  preview,
  problemsOnly,
}: {
  preview: CsvPreview<T>;
  problemsOnly: boolean;
}) {
  const rows = problemsOnly
    ? preview.rows.filter((r) => r.errors.length > 0 || r.warnings.length > 0 || r.skipped)
    : preview.rows;
  const width = preview.columns.length + 2;
  return (
    <div className="max-h-[50dvh] overflow-auto rounded-card border border-line">
      <table className="w-full border-collapse text-sm" aria-label="Rows to import">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-line">
            <th scope="col" className="h-8 px-2 text-left font-medium whitespace-nowrap text-ink-2">
              Row
            </th>
            <th scope="col" className="h-8 px-2 text-left font-medium text-ink-2">
              <span className="sr-only">Status</span>
            </th>
            {preview.columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="h-8 px-2 text-left font-medium whitespace-nowrap text-ink-2"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        {rows.map((r) => {
          const bad = r.errors.length > 0;
          const note = !bad && (r.skipped || r.warnings.length > 0);
          const messages = [...r.errors, ...r.warnings];
          return (
            <tbody key={r.id} className="border-b border-line last:border-b-0">
              <tr className={cn(bad && 'bg-danger-tint', !bad && r.skipped && 'text-ink-2')}>
                <th
                  scope="row"
                  className="h-8 px-2 text-left font-normal whitespace-nowrap text-ink-2 tabular-nums"
                >
                  {r.label}
                </th>
                <td className="px-2">
                  {bad ? (
                    <CircleX className="size-4 text-danger" aria-label="Has problems" />
                  ) : note ? (
                    <AlertTriangle
                      className="size-4 text-warn"
                      aria-label={r.skipped ? 'Skipped' : 'Check this row'}
                    />
                  ) : (
                    <CircleCheck className="size-4 text-ok" aria-label="Ready" />
                  )}
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className="max-w-48 truncate px-2 whitespace-nowrap">
                    {c}
                  </td>
                ))}
              </tr>
              {messages.length > 0 && (
                <tr className={cn(bad && 'bg-danger-tint')}>
                  <td colSpan={width} className="px-2 pb-2">
                    <ul className="flex flex-col gap-0.5 pl-6">
                      {r.errors.map((m) => (
                        <li key={m} className="text-danger">
                          {m}
                        </li>
                      ))}
                      {r.warnings.map((m) => (
                        <li key={m} className="text-warn">
                          {m}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        {rows.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={width} className="px-2 py-6 text-center text-ink-2">
                No rows with problems.
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
