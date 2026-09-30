// CSV import with a column-mapping step (PLAN.md §4.2, §4.7): paste or upload, match the
// file's columns to fields (guessed from the headers), preview every row with its problems,
// then create the good rows. The feature supplies the fields, the row check, and the write.
//
//   <CsvImportDialog
//     open={open} onOpenChange={setOpen}
//     title="Import shells" noun={['shell', 'shells']}
//     fields={SHELL_CSV_FIELDS} previewFields={['name', 'boatClass']}
//     check={(rows) => rows.map(checkShellRow)}
//     onImport={(records) => createAll(records)}
//   />

import { useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, TriangleAlert, Upload } from 'lucide-react';
import { detectDelimiter, parseDelimited } from '@srt/domain';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Pure helpers

export interface CsvField {
  /** The record field this column fills ('boatClass'). */
  key: string;
  /** Sentence-case name shown in the mapping step ('Boat class'). */
  label: string;
  required?: boolean;
  /**
   * Header spellings that mean this field, most specific first. Compared without case, spaces,
   * or punctuation, so 'weight_class_lb', 'Weight class (lb)' and 'weightClassLb' are one.
   * The key and label always count. Two fields may read the same column.
   */
  aliases?: string[];
}

/** Column index for each field key; null when the file has no such column. */
export type CsvMapping = Record<string, number | null>;

export interface CsvTable {
  headers: string[];
  rows: string[][];
}

/** One row's outcome: a record to create, or what is wrong with it. */
export interface CsvRowCheck<T> {
  record: T | null;
  /** Sentences; any error skips the row. */
  errors: string[];
  /** Sentences shown in the preview; the row is still imported. */
  warnings?: string[];
}

/** Lowercase letters and digits only: 'Weight class (lb)' → 'weightclasslb'. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Parse pasted or uploaded text: comma- or tab-separated, first row is the header. */
export function readCsvTable(text: string): CsvTable {
  const clean = text.replace(/^\uFEFF/, ''); // byte-order mark from spreadsheet exports
  const [header = [], ...body] = parseDelimited(clean, detectDelimiter(clean));
  const headers = header.map((h) => h.trim());
  const rows = body.map((r) => headers.map((_, i) => (r[i] ?? '').trim()));
  return { headers, rows };
}

/**
 * Guess which column fills each field. Exact matches on the key, label, and aliases first (in
 * that order of preference); then a header that starts with a candidate of four or more
 * letters ('weight_class_lb' for 'weight class'), using each column once.
 */
export function guessMapping(headers: readonly string[], fields: readonly CsvField[]): CsvMapping {
  const normalized = headers.map(normalizeHeader);
  const candidates = (f: CsvField) =>
    [f.key, f.label, ...(f.aliases ?? [])].map(normalizeHeader).filter(Boolean);
  const mapping: CsvMapping = {};
  const used = new Set<number>();
  for (const f of fields) {
    mapping[f.key] = null;
    for (const c of candidates(f)) {
      const i = normalized.indexOf(c);
      if (i >= 0) {
        mapping[f.key] = i;
        used.add(i);
        break;
      }
    }
  }
  for (const f of fields) {
    if (mapping[f.key] != null) continue;
    for (const c of candidates(f)) {
      if (c.length < 4) continue;
      const i = normalized.findIndex((h, idx) => !used.has(idx) && h.startsWith(c));
      if (i >= 0) {
        mapping[f.key] = i;
        used.add(i);
        break;
      }
    }
  }
  return mapping;
}

/** One row as field key → cell text ('' for unmapped fields). */
export function mapRow(
  cells: readonly string[],
  mapping: CsvMapping,
  fields: readonly CsvField[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const i = mapping[f.key];
    out[f.key] = i == null ? '' : (cells[i] ?? '').trim();
  }
  return out;
}

/** Fields marked required that no column fills. */
export function missingRequired(mapping: CsvMapping, fields: readonly CsvField[]): CsvField[] {
  return fields.filter((f) => f.required && mapping[f.key] == null);
}

/** Start a download of text as a file (CSV export). */
export function downloadText(fileName: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------------------
// Dialog

export interface CsvImportDialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Import shells" */
  title: string;
  /** Singular and plural: ['shell', 'shells']. */
  noun: readonly [string, string];
  fields: readonly CsvField[];
  /** Field keys shown as preview columns; a function picks them from the mapping. */
  previewFields: readonly string[] | ((mapping: CsvMapping) => readonly string[]);
  /**
   * Check every mapped row at once (so duplicates inside the file can be caught). `ctx` has the
   * parsed file and the mapping, for checks that read a header (a unit in "Weight (kg)").
   */
  check: (rows: Record<string, string>[], ctx: CsvContext) => CsvRowCheck<T>[];
  /** Create the records. Throw to keep the dialog open; the caller shows its own error. */
  onImport: (records: T[]) => Promise<void>;
  /** A line under the paste box saying which columns work. */
  hint?: ReactNode;
  /** Extra controls under the mapping (a unit choice), given the file and the mapping. */
  options?: (ctx: CsvContext) => ReactNode;
  /** A mapping rule beyond `required` ("first name or full name"): the problem, or null. */
  checkMapping?: (mapping: CsvMapping) => string | null;
}

/** The parsed file and the current mapping, for feature callbacks. */
export interface CsvContext {
  table: CsvTable;
  mapping: CsvMapping;
}

type Step = 'source' | 'map' | 'preview';

const NOT_IN_FILE = '__none';

/** Paste or upload → map columns → preview → import. */
export function CsvImportDialog<T>(props: CsvImportDialogProps<T>) {
  const { open, onOpenChange } = props;
  // Remount on every open so a new import starts clean.
  const [session, setSession] = useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSession((s) => s + 1);
        onOpenChange(next);
      }}
    >
      {open && <CsvImportBody key={session} {...props} />}
    </Dialog>
  );
}

function CsvImportBody<T>({
  onOpenChange,
  title,
  noun,
  fields,
  previewFields,
  check,
  onImport,
  hint,
  options,
  checkMapping,
}: CsvImportDialogProps<T>) {
  const id = useId();
  const [step, setStep] = useState<Step>('source');
  const [text, setText] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const missing = missingRequired(mapping, fields);
  const mappingProblem = missing.length === 0 && checkMapping ? checkMapping(mapping) : null;
  const previewKeys = typeof previewFields === 'function' ? previewFields(mapping) : previewFields;
  const results = useMemo(() => {
    if (step !== 'preview' || !table) return [];
    const mapped = table.rows.map((r) => mapRow(r, mapping, fields));
    return check(mapped, { table, mapping }).map((res, i) => ({
      ...res,
      row: mapped[i]!,
      line: i + 2,
    }));
  }, [step, table, mapping, fields, check]);
  const ready = results.filter((r) => r.record && r.errors.length === 0);

  const readSource = (source = text) => {
    const parsed = readCsvTable(source);
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setSourceError('Paste a header row and at least one row of data, or choose a CSV file.');
      return;
    }
    setSourceError(null);
    setTable(parsed);
    setMapping(guessMapping(parsed.headers, fields));
    setStep('map');
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    e.target.value = '';
    setText(content);
    readSource(content);
  };

  const runImport = async () => {
    const records = ready.map((r) => r.record!) as T[];
    setBusy(true);
    try {
      await onImport(records);
      toast.success(`${records.length} ${records.length === 1 ? noun[0] : noun[1]} imported`);
      onOpenChange(false);
    } catch {
      // The caller's mutation already said what went wrong.
    } finally {
      setBusy(false);
    }
  };

  const unusedColumns = table
    ? table.headers.filter((_, i) => !Object.values(mapping).includes(i))
    : [];
  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  return (
    <DialogContent
      title={title}
      description={
        step === 'source'
          ? 'Paste rows copied from a spreadsheet, or choose a CSV file. The first row must be the column names.'
          : step === 'map'
            ? 'Match each field to a column in your file. Columns were matched by name; check them before going on.'
            : `${ready.length} of ${results.length} rows are ready. Rows with problems are skipped.`
      }
      className="max-w-3xl"
    >
      {step === 'source' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-paste`}>Rows to import</Label>
            <Textarea
              id={`${id}-paste`}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSourceError(null);
              }}
              aria-invalid={!!sourceError || undefined}
              aria-describedby={sourceError ? `${id}-error` : hint ? `${id}-hint` : undefined}
              rows={8}
              spellCheck={false}
              className="font-mono text-sm"
            />
            {hint && !sourceError && (
              <p id={`${id}-hint`} className="text-sm text-ink-2">
                {hint}
              </p>
            )}
            {sourceError && (
              <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                {sourceError}
              </p>
            )}
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              hidden
              onChange={(e) => void onFile(e)}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <Upload aria-hidden />
              Choose a CSV file
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => readSource()} disabled={!text.trim()}>
              Match columns
            </Button>
          </DialogFooter>
        </div>
      )}

      {step === 'map' && table && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {fields.map((f) => {
              const col = mapping[f.key];
              const sample = col == null ? '' : (table.rows.find((r) => r[col])?.[col] ?? '');
              const selectId = `${id}-map-${f.key}`;
              return (
                <div key={f.key} className="flex min-w-0 flex-col gap-1">
                  <Label htmlFor={selectId}>
                    {f.label}
                    {f.required && <span className="font-normal text-ink-2"> (required)</span>}
                  </Label>
                  <Select
                    id={selectId}
                    value={col == null ? NOT_IN_FILE : String(col)}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [f.key]: v === NOT_IN_FILE ? null : Number(v) }))
                    }
                    options={[
                      { value: NOT_IN_FILE, label: 'Not in the file' },
                      ...table.headers.map((h, i) => ({
                        value: String(i),
                        label: h || `Column ${i + 1}`,
                      })),
                    ]}
                    className="w-full"
                  />
                  <p className="truncate text-sm text-ink-2">
                    {col == null ? ' ' : sample ? `First value: ${sample}` : 'Empty column'}
                  </p>
                </div>
              );
            })}
          </div>
          {unusedColumns.length > 0 && (
            <p className="text-sm leading-prose text-ink-2">
              Not imported: {unusedColumns.map((h) => h || 'unnamed column').join(', ')}.
            </p>
          )}
          {options && <div className="flex flex-col gap-3">{options({ table, mapping })}</div>}
          {missing.length > 0 && (
            <p role="alert" className="text-sm text-danger">
              Choose a column for {missing.map((f) => f.label.toLowerCase()).join(' and ')}.
            </p>
          )}
          {mappingProblem && (
            <p role="alert" className="text-sm text-danger">
              {mappingProblem}
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setStep('source')}>Back</Button>
            <Button
              variant="primary"
              onClick={() => setStep('preview')}
              disabled={missing.length > 0 || !!mappingProblem}
            >
              Preview rows
            </Button>
          </DialogFooter>
        </div>
      )}

      {step === 'preview' && (
        <div className="flex flex-col gap-4">
          <div className="max-h-[50dvh] overflow-auto rounded-card border border-line">
            <table className="w-full border-collapse text-sm" aria-label="Rows to import">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-ink-2">
                  <th scope="col" className="h-8 px-2 font-medium">
                    Row
                  </th>
                  <th scope="col" className="h-8 px-2 font-medium">
                    Result
                  </th>
                  {previewKeys.map((k) => (
                    <th key={k} scope="col" className="h-8 px-2 font-medium whitespace-nowrap">
                      {fieldLabel(k)}
                    </th>
                  ))}
                  <th scope="col" className="h-8 px-2 font-medium">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const ok = !!r.record && r.errors.length === 0;
                  const notes = [...r.errors, ...(r.warnings ?? [])];
                  return (
                    <tr key={r.line} className="border-b border-line align-top last:border-b-0">
                      <td className="px-2 py-1.5 text-ink-2 tabular-nums">{r.line}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {ok ? (
                          <span className="inline-flex items-center gap-1 text-ok">
                            <CircleCheck className="size-3.5" aria-hidden />
                            <span className="text-ink">Ready</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-danger">
                            <CircleAlert className="size-3.5" aria-hidden />
                            <span className="text-ink">Skipped</span>
                          </span>
                        )}
                      </td>
                      {previewKeys.map((k) => (
                        <td key={k} className="max-w-48 truncate px-2 py-1.5">
                          {r.row[k]}
                        </td>
                      ))}
                      <td className="min-w-48 px-2 py-1.5">
                        {notes.length > 0 && (
                          <ul className="flex flex-col gap-0.5">
                            {r.errors.map((e) => (
                              <li key={e} className="text-danger">
                                {e}
                              </li>
                            ))}
                            {(r.warnings ?? []).map((w) => (
                              <li key={w} className="flex items-start gap-1 text-ink-2">
                                <TriangleAlert
                                  className="mt-px size-3.5 shrink-0 text-warn"
                                  aria-hidden
                                />
                                {w}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button onClick={() => setStep('map')} disabled={busy}>
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => void runImport()}
              disabled={busy || ready.length === 0}
            >
              Import {ready.length} {ready.length === 1 ? noun[0] : noun[1]}
            </Button>
          </DialogFooter>
        </div>
      )}
    </DialogContent>
  );
}
