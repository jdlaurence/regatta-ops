// The load list on a phone, through a share link that can check it off (PLAN.md §4.8, §12.1
// Phase 3: "the loading crew ticks the checklist on phones"). Works with no signal: ticks wait
// on the device and sync when the connection is back (§10.4).

import { useSearchParams } from 'react-router';
import { CloudOff, RefreshCw } from 'lucide-react';
import type { ShareView } from '@/data';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { ChecklistRow } from './ChecklistRow';
import { ChoiceChips } from './ChoiceChips';
import { groupChecklist, KIND_LABELS, whereItRides, type ChecklistGrouping } from './share-view';
import { useLoadChecklist, useRememberedName } from './useLoadChecklist';

function changes(n: number): string {
  return `${n} ${n === 1 ? 'change' : 'changes'} waiting to sync`;
}

function SyncStatus({
  waiting,
  online,
  syncing,
  onSync,
}: {
  waiting: number;
  online: boolean;
  syncing: boolean;
  onSync: () => void;
}) {
  // Always mounted, so screen readers hear the change when the status appears.
  const text = !online
    ? waiting > 0
      ? `Offline. ${changes(waiting)}.`
      : 'Offline. Ticks stay on this device and sync when the connection is back.'
    : waiting > 0
      ? `${changes(waiting)}.`
      : '';
  return (
    <div role="status">
      {text && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line bg-surface-2 px-4 py-3">
          <p className="flex items-center gap-2 text-base text-ink">
            <CloudOff className="size-4 shrink-0 text-ink-2" aria-hidden />
            {text}
          </p>
          {online && waiting > 0 && (
            <Button size="sm" onClick={onSync} disabled={syncing}>
              <RefreshCw aria-hidden />
              {syncing ? 'Syncing' : 'Sync now'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function LoadChecklist({ token, view }: { token: string; view: ShareView }) {
  const [name, setName] = useRememberedName();
  const { lines, tick, waiting, online, syncing, syncNow } = useLoadChecklist(
    token,
    view.loadItems,
    name,
  );
  const [params, setParams] = useSearchParams();
  const grouping: ChecklistGrouping = params.get('group') === 'container' ? 'container' : 'kind';
  const setGrouping = (g: ChecklistGrouping) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (g === 'kind') next.delete('group');
        else next.set('group', g);
        return next;
      },
      { replace: true },
    );

  const tz = view.regatta.timezone;
  const loaded = lines.filter((l) => l.loaded).length;
  const returned = lines.filter((l) => l.returned).length;
  const groups = groupChecklist(lines, grouping);

  return (
    <section aria-labelledby="load-list-title" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="load-list-title" className="font-display text-lg font-semibold">
          Load list
        </h2>
        {lines.length > 0 && (
          <p className="text-base text-ink-2 tabular-nums">
            <span className="font-medium text-ink">
              {loaded} of {lines.length}
            </span>{' '}
            loaded · {returned} returned
          </p>
        )}
      </div>

      <SyncStatus waiting={waiting} online={online} syncing={syncing} onSync={syncNow} />

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <Field
          id="share-your-name"
          label="Your name"
          hint="Shown next to what you tick. Kept on this device."
          className="md:w-72"
        >
          <Input
            id="share-your-name"
            value={name}
            maxLength={60}
            autoComplete="given-name"
            placeholder="First name"
            aria-describedby="share-your-name-hint"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {lines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span aria-hidden className="text-sm font-medium text-ink">
              Group by
            </span>
            <ChoiceChips
              label="Group by"
              value={grouping}
              onValueChange={setGrouping}
              choices={[
                { value: 'kind', label: 'Kind' },
                { value: 'container', label: 'Container' },
              ]}
            />
          </div>
        )}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          title="The load list is empty"
          description="Ask a coach to add the shells, oars, and gear for this regatta. They show up here as soon as they are added."
        />
      ) : (
        groups.map((g) => {
          const done = g.lines.filter((l) => l.loaded).length;
          return (
            <section key={g.key || 'none'} aria-label={g.title} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-md font-medium text-ink">{g.title}</h3>
                <span className="text-sm text-ink-2 tabular-nums">
                  {done} of {g.lines.length} loaded
                </span>
              </div>
              <ul className="grid gap-2 md:grid-cols-2">
                {g.lines.map((line) => (
                  <ChecklistRow
                    key={line.id}
                    line={line}
                    timeZone={tz}
                    detail={
                      grouping === 'kind'
                        ? whereItRides(line)
                        : (KIND_LABELS[line.kind]?.one ?? line.kind)
                    }
                    onTick={(field, value) => tick(line.id, field, value)}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
