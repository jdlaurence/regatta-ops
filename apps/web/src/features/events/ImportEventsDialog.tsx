// Paste import (PLAN.md §9.5): paste rows from a published schedule (RegattaCentral, a PDF, a
// spreadsheet) or upload a CSV, confirm what each column is while a preview shows the parsed
// events, choose the day for rows without one, and create them all in one batch. Used by the
// schedule page for "Import events" and by the regatta overview.

import { useId, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import {
  formatClock,
  type ColumnGuess,
  type ColumnRole,
  type SchedulePaste,
} from '@regatta-ops/domain';
import { batchOp, useBatch, useList, useRecord } from '@/data';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';
import { ConflictIcon } from '@/components/ConflictBadge';
import { ErrorState, SkeletonRows } from '@/components/states';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field, Label, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BATCH_LIMIT, chunk, regattaDays } from '@/features/regattas/duplicate';
import { useConfirmFinalEdit } from '@/features/regattas/useConfirmFinalEdit';
import { ScrollRegion } from '@/components/ScrollRegion';
import { nextSortOrder, STAGE_LABELS } from './event-form';
import {
  importCountText,
  importDay,
  importRecords,
  parsePaste,
  remap,
  ROLE_LABELS,
  rowIssues,
  setColumnRole,
} from './import-model';

export interface ImportEventsDialogProps {
  regattaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the number of events created. */
  onImported?: (count: number) => void;
}

const ROLE_ORDER: ColumnRole[] = [
  'eventNumber',
  'time',
  'day',
  'name',
  'boatClass',
  'category',
  'stage',
  'ignore',
];

const SAMPLE_ROWS = 4;

function ColumnsTable({
  parsed,
  columns,
  onRoleChange,
}: {
  parsed: SchedulePaste;
  columns: ColumnGuess[];
  onRoleChange: (index: number, role: ColumnRole) => void;
}) {
  const samples = parsed.raw.slice(0, SAMPLE_ROWS);
  return (
    <ScrollRegion
      label="Columns in the paste"
      className="overflow-x-auto rounded-card border border-line"
    >
      <table className="w-full border-collapse text-sm" aria-label="Columns in the paste">
        <thead>
          <tr className="border-b border-line bg-surface-2/60">
            {columns.map((c) => (
              <th
                key={c.index}
                scope="col"
                className="min-w-36 px-2 py-2 text-left align-top font-normal"
              >
                <Select
                  value={c.role}
                  onValueChange={(role) => onRoleChange(c.index, role)}
                  label={`Column ${c.index + 1}${c.header ? `, ${c.header}` : ''}`}
                  className={cn('w-full', c.role === 'ignore' && 'text-ink-2')}
                  options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                />
                <span className="mt-1 block truncate px-1 text-xs font-normal text-ink-2">
                  {c.header ? `Header: ${c.header}` : `Column ${c.index + 1}`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {samples.map((row, r) => (
            <tr key={r} className="border-b border-line last:border-b-0">
              {columns.map((c) => (
                <td
                  key={c.index}
                  className={cn(
                    'max-w-56 truncate px-3 py-1.5',
                    c.role === 'ignore' ? 'text-ink-2' : 'text-ink',
                  )}
                >
                  {row[c.index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function PasteStep({
  text,
  setText,
  error,
  onRead,
  onFile,
  onCancel,
}: {
  text: string;
  setText: (t: string) => void;
  error: string | null;
  onRead: () => void;
  onFile: (file: File) => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <div className="flex flex-col gap-4">
      <Field
        id={`${id}-paste`}
        label="Schedule"
        hint="Copy rows from RegattaCentral, a PDF, or a spreadsheet and paste them here. A header row helps."
        error={error ?? undefined}
      >
        <Textarea
          id={`${id}-paste`}
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-paste-error` : `${id}-paste-hint`}
          className="min-h-48 font-sans text-sm tabular-nums"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden />
          Upload a CSV file
        </Button>
        <span className="text-sm text-ink-2">CSV or tab-separated text.</span>
      </div>
      <DialogFooter>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onRead} disabled={!text.trim()}>
          Read schedule
        </Button>
      </DialogFooter>
    </div>
  );
}

function ImportFlow({
  regattaId,
  onImported,
  onDone,
}: {
  regattaId: string;
  onImported?: (count: number) => void;
  onDone: () => void;
}) {
  const regatta = useRecord('regattas', regattaId);
  const events = useList('events', {
    where: { regattaId },
    sort: ['day', 'scheduledAt', 'sortOrder'],
  });
  const batch = useBatch({ errorMessage: 'The events were not imported. Try again.' });
  const finalEdit = useConfirmFinalEdit(regatta.data);
  const [text, setText] = useState('');
  const [source, setSource] = useState('paste');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<SchedulePaste | null>(null);
  const [columns, setColumns] = useState<ColumnGuess[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const dayId = useId();

  const days = useMemo(() => (regatta.data ? regattaDays(regatta.data) : []), [regatta.data]);
  const fallbackDay = chosenDay && days.includes(chosenDay) ? chosenDay : days[0]!;
  const rows = useMemo(
    () => (parsed ? remap(parsed.raw, columns, { days }) : []),
    [parsed, columns, days],
  );

  if (regatta.isPending || events.isPending) return <SkeletonRows rows={4} />;
  if (regatta.isError || events.isError || !regatta.data) {
    return (
      <ErrorState
        title="The import did not load."
        error={regatta.error ?? events.error}
        onRetry={() => {
          void regatta.refetch();
          void events.refetch();
        }}
      />
    );
  }
  const r = regatta.data;

  const read = (value: string, from: string) => {
    const result = parsePaste(value, { days });
    if (remap(result.raw, result.columns, { days }).length === 0) {
      setError('No schedule lines found. Paste rows with a time, an event number, or a class.');
      return;
    }
    setError(null);
    setSource(from);
    setParsed(result);
    setColumns(result.columns);
    setExcluded(new Set());
  };

  const onFile = async (file: File) => {
    const value = await file.text();
    setText(value);
    read(value, file.name);
  };

  if (!parsed) {
    return (
      <PasteStep
        text={text}
        setText={setText}
        error={error}
        onRead={() => read(text, 'paste')}
        onFile={(f) => void onFile(f)}
        onCancel={onDone}
      />
    );
  }

  const rawIndex = (row: string[]) => parsed.raw.indexOf(row);
  const included = rows.map((p) => !excluded.has(rawIndex(p.raw)));
  const chosen = rows.filter((_, i) => included[i]);
  const needsDay = rows.some((p) => importDay(p, days, '') === '');
  const lowConfidence = parsed.confidence < 0.6;

  const toggle = (row: string[], on: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      const k = rawIndex(row);
      if (on) next.delete(k);
      else next.add(k);
      return next;
    });

  const onImport = async () => {
    const records = importRecords(rows, included, {
      regattaId: r.id,
      timezone: r.timezone,
      days,
      fallbackDay,
      startSortOrder: nextSortOrder(events.data ?? []),
      source,
    });
    if (records.length === 0) return;
    if (!(await finalEdit.confirm('Import events'))) return;
    try {
      for (const part of chunk(records, BATCH_LIMIT)) {
        await batch.mutateAsync(part.map((rec) => batchOp.create('events', rec)));
      }
      toast.success(
        records.length === 1 ? '1 event imported' : `${records.length} events imported`,
      );
      onImported?.(records.length);
      onDone();
    } catch {
      // The mutation's toast explains; the dialog stays open.
    }
  };

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="text-base leading-prose">
          Found {importCountText(rows)}. Check what each column is; the preview updates as you go.
        </p>
        {lowConfidence && (
          <p className="flex items-start gap-2 text-sm leading-prose text-warn">
            <ConflictIcon severity="warning" className="mt-px" />
            The columns are a guess. Check each one before importing.
          </p>
        )}
      </div>

      <section aria-labelledby={`${dayId}-cols`} className="flex flex-col gap-2">
        <h3 id={`${dayId}-cols`} className="text-md font-medium">
          Columns
        </h3>
        <ColumnsTable
          parsed={parsed}
          columns={columns}
          onRoleChange={(index, role) => setColumns((cols) => setColumnRole(cols, index, role))}
        />
      </section>

      {days.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <Label htmlFor={`${dayId}-day`}>
            {needsDay ? 'Rows without a day go on' : 'Rows without a regatta day go on'}
          </Label>
          <Select
            id={`${dayId}-day`}
            value={fallbackDay}
            onValueChange={setChosenDay}
            options={days.map((d) => ({ value: d, label: formatWeekday(d) }))}
            className="w-44"
          />
        </div>
      )}

      <section aria-labelledby={`${dayId}-preview`} className="flex min-h-0 flex-col gap-2">
        <h3 id={`${dayId}-preview`} className="text-md font-medium">
          Preview{' '}
          <span className="font-normal text-ink-2 tabular-nums">
            {chosen.length} of {rows.length} selected
          </span>
        </h3>
        <ScrollRegion
          label="Events to import"
          className="max-h-[42dvh] overflow-auto rounded-card border border-line"
        >
          <table className="w-full border-collapse text-sm" aria-label="Events to import">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line text-left text-ink-2">
                <th scope="col" className="w-10 px-3 py-2 font-medium">
                  <span className="sr-only">Import</span>
                </th>
                {days.length > 1 && (
                  <th scope="col" className="px-2 py-2 font-medium">
                    Day
                  </th>
                )}
                <th scope="col" className="px-2 py-2 font-medium">
                  Time
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  Event
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  Name
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  Class
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  Stage
                </th>
                <th scope="col" className="min-w-48 px-2 py-2 font-medium">
                  Check
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const issues = rowIssues(p, columns, { days }, fallbackDay);
                const has = (f: string) => issues.some((x) => x.field === f);
                const on = included[i]!;
                const label = `${p.eventNumber ? `Event ${p.eventNumber} ` : ''}${p.name}`;
                return (
                  <tr
                    key={rawIndex(p.raw)}
                    className={cn(
                      'border-b border-line align-top last:border-b-0',
                      !on && 'text-ink-2',
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(v) => toggle(p.raw, v === true)}
                        aria-label={`Import ${label}`}
                      />
                    </td>
                    {days.length > 1 && (
                      <td
                        className={cn(
                          'px-2 py-1.5 whitespace-nowrap tabular-nums',
                          has('day') && 'text-warn',
                        )}
                      >
                        {formatWeekday(importDay(p, days, fallbackDay))}
                      </td>
                    )}
                    <td
                      className={cn(
                        'px-2 py-1.5 whitespace-nowrap tabular-nums',
                        has('time') && 'text-warn',
                        !p.time && !has('time') && 'text-ink-2',
                      )}
                    >
                      {p.time ? formatClock(p.time, true) : 'TBD'}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">{p.eventNumber ?? ''}</td>
                    <td className="min-w-48 px-2 py-1.5">{p.name}</td>
                    <td
                      className={cn(
                        'px-2 py-1.5 whitespace-nowrap',
                        p.kind === 'logistics' && 'text-ink-2',
                        has('boatClass') && 'text-warn',
                      )}
                    >
                      {p.kind === 'logistics' ? 'Logistics' : (p.boatClass ?? 'None')}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-ink-2">
                      {p.kind === 'race' && p.stage ? STAGE_LABELS[p.stage] : ''}
                    </td>
                    <td className="px-2 py-1.5">
                      {issues.length > 0 && (
                        <ul className="flex flex-col gap-0.5">
                          {issues.map((x) => (
                            <li key={x.field} className="flex items-start gap-1.5 text-ink">
                              <ConflictIcon severity="warning" className="mt-px size-3" />
                              <span>{x.message}</span>
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
        </ScrollRegion>
      </section>

      <DialogFooter className="justify-between">
        <Button onClick={() => setParsed(null)}>Back to the paste</Button>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => void onImport()}
            disabled={chosen.length === 0 || batch.isPending}
          >
            {chosen.length === 1 ? 'Import 1 event' : `Import ${chosen.length} events`}
          </Button>
        </div>
      </DialogFooter>
      {finalEdit.dialog}
    </div>
  );
}

export function ImportEventsDialog({
  regattaId,
  open,
  onOpenChange,
  onImported,
}: ImportEventsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Import events"
        description="Races and logistics lines from a published schedule."
        className="max-w-4xl"
      >
        <ImportFlow
          regattaId={regattaId}
          onImported={onImported}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
