// The schedule toolbar (PLAN.md §6.3): day, view, rows (timeline), and filters.

import { useMemo, useState } from 'react';
import { ChartNoAxesGantt, List, ListFilter, X } from 'lucide-react';
import { shellLabel, type BoatClass } from '@srt/domain';
import type { RegattaWorkingSet } from '@/data';
import { cn } from '@/lib/cn';
import { formatWeekday } from '@/lib/dates';
import type { TimelineGroupBy } from '@/components/timeline-lib';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { SegmentedControl, Switch } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { hasFilters, type ScheduleFilters } from './lib';
import { groupParam, rememberShowEntries, type ScheduleView } from './hooks';

const CLASS_ORDER: BoatClass[] = ['8+', '4+', '4-', '4x+', '4x', '2+', '2-', '2x', '1x'];

export interface ScheduleToolbarProps {
  ws: RegattaWorkingSet;
  days: string[];
  day: string;
  view: ScheduleView;
  groupBy: TimelineGroupBy;
  filters: ScheduleFilters;
  /** List view: entries listed under their races. */
  showEntries: boolean;
  onChange: (patch: Record<string, string | null>) => void;
}

export function ScheduleToolbar({
  ws,
  days,
  day,
  view,
  groupBy,
  filters,
  showEntries,
  onChange,
}: ScheduleToolbarProps) {
  const classes = useMemo(() => {
    const present = new Set<BoatClass>();
    for (const e of ws.events) if (e.boatClass) present.add(e.boatClass);
    for (const e of ws.entries) present.add(e.boatClass);
    return CLASS_ORDER.filter((c) => present.has(c));
  }, [ws.events, ws.entries]);

  const shellOptions = useMemo(() => {
    const used = new Set(ws.entries.map((e) => e.shellId).filter((id): id is string => !!id));
    return ws.shells
      .filter((s) => used.has(s.id))
      .map((s) => ({
        value: s.id,
        label: shellLabel(s),
        keywords: [s.name, s.boatClass],
        hint: s.nickname && s.nickname !== s.name ? `${s.name} · ${s.boatClass}` : s.boatClass,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [ws.entries, ws.shells]);

  const teams = ws.participatingTeams;
  const active = [filters.teamId, filters.boatClass, filters.shellId].filter(Boolean).length;
  const [filtersOpen, setFiltersOpen] = useState(active > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {days.length > 1 &&
          (days.length <= 4 ? (
            <SegmentedControl
              label="Day"
              value={day}
              onValueChange={(d) => onChange({ day: d })}
              options={days.map((d) => ({ value: d, label: formatWeekday(d) }))}
              className="max-w-full overflow-x-auto"
            />
          ) : (
            <Select
              label="Day"
              value={day}
              onValueChange={(d) => onChange({ day: d })}
              options={days.map((d) => ({ value: d, label: formatWeekday(d) }))}
              className="w-40"
            />
          ))}
        <SegmentedControl<ScheduleView>
          label="View"
          value={view}
          onValueChange={(v) => onChange({ view: v === 'list' ? null : v })}
          options={[
            { value: 'list', label: 'List', icon: <List aria-hidden /> },
            { value: 'timeline', label: 'Timeline', icon: <ChartNoAxesGantt aria-hidden /> },
          ]}
        />
        {view === 'list' && (
          <div className="flex items-center gap-2">
            <Switch
              id="schedule-show-entries"
              checked={showEntries}
              onCheckedChange={(on) => {
                rememberShowEntries(on);
                onChange({ entries: on ? 'show' : 'hide' });
              }}
            />
            <Label htmlFor="schedule-show-entries" className="text-base">
              Show entries
            </Label>
          </div>
        )}
        {view === 'timeline' && (
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-sm text-ink-2">
              Rows by
            </span>
            <SegmentedControl<TimelineGroupBy>
              label="Rows by"
              value={groupBy}
              onValueChange={(g) => onChange({ group: g === 'shell' ? null : groupParam(g) })}
              size="sm"
              options={[
                { value: 'shell', label: 'Shell' },
                { value: 'team', label: 'Team' },
                { value: 'oar_set', label: 'Oars' },
              ]}
            />
          </div>
        )}
      </div>
      {/* Phones show the filters on request; wider screens always. */}
      {(teams.length > 1 || classes.length > 1 || shellOptions.length > 0) && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start sm:hidden"
          aria-expanded={filtersOpen}
          aria-controls="schedule-filters"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <ListFilter aria-hidden />
          Filters{active > 0 && <span className="tabular-nums">({active})</span>}
        </Button>
      )}
      <div
        id="schedule-filters"
        className={cn('flex-wrap items-center gap-2 sm:flex', filtersOpen ? 'flex' : 'hidden')}
      >
        {teams.length > 1 && (
          <Select
            label="Team"
            value={filters.teamId ?? 'all'}
            onValueChange={(v) => onChange({ team: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All teams' },
              ...teams.map((t) => ({ value: t.id, label: t.name })),
            ]}
            className="w-[calc(50%-4px)] sm:w-40"
          />
        )}
        {classes.length > 1 && (
          <Select
            label="Boat class"
            value={filters.boatClass ?? 'all'}
            onValueChange={(v) => onChange({ class: v === 'all' ? null : v })}
            options={[
              { value: 'all', label: 'All classes' },
              ...classes.map((c) => ({ value: c, label: c })),
            ]}
            className="w-[calc(50%-4px)] sm:w-36"
          />
        )}
        {shellOptions.length > 0 && (
          <Combobox
            label="Shell"
            value={filters.shellId}
            onValueChange={(v) => onChange({ shell: v })}
            options={shellOptions}
            placeholder="All shells"
            searchPlaceholder="Find a shell…"
            clearable="All shells"
            className="w-full sm:w-44"
          />
        )}
        {hasFilters(filters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ team: null, class: null, shell: null })}
          >
            <X aria-hidden />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}
