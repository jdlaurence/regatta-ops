import { describe, expect, it } from 'vitest';
import {
  clockAt,
  zonedToInstant,
  type Regatta,
  type RegattaEvent,
  type RegattaTeam,
} from '@srt/domain';
import {
  chunk,
  dayDelta,
  duplicateBatches,
  planDuplicate,
  regattaDays,
  shiftDay,
  suggestDuplicate,
} from './duplicate';

const TZ = 'America/Los_Angeles';

const source: Regatta = {
  id: 'regattasource01',
  name: '2025 Spring Sprints',
  venue: 'Vancouver Lake',
  city: 'Vancouver, WA',
  startDate: '2025-05-16',
  endDate: '2025-05-18',
  timezone: TZ,
  format: 'sprint',
  notes: 'Long row to the start.',
  status: 'final',
  settings: { launchLeadMin: 75 },
};

const event = (id: string, day: string, time: string | null, extra: Partial<RegattaEvent> = {}) =>
  ({
    id,
    regattaId: source.id,
    kind: 'race',
    eventNumber: id.slice(-2),
    name: "Men's Junior 8+",
    boatClass: '8+',
    day,
    scheduledAt: time ? zonedToInstant(day, time, TZ) : null,
    stage: 'final',
    sortOrder: Number(id.slice(-2)),
    ...extra,
  }) satisfies RegattaEvent;

const events: RegattaEvent[] = [
  event('eventsource0001', '2025-05-16', '08:16'),
  event('eventsource0002', '2025-05-18', '13:04', { progressionGroup: 'Event 2' }),
  event('eventsource0003', '2025-05-17', null, {
    kind: 'logistics',
    name: 'Bus departs hotel',
    boatClass: null,
    stage: null,
    teamFilter: ['teamboys0000001'],
  }),
  // Another regatta's event is never copied.
  { ...event('eventother00004', '2025-05-16', '09:00'), regattaId: 'someotherregat1' },
];

const regattaTeams: RegattaTeam[] = [
  {
    id: 'rtsource0000001',
    regattaId: source.id,
    teamId: 'teamboys0000001',
    notes: 'Bring the tent',
    publishedAt: '2025-05-14T04:00:00.000Z',
    publishedSnapshot: { publishedAt: '2025-05-14T04:00:00.000Z', entries: [] },
  },
  { id: 'rtsource0000002', regattaId: source.id, teamId: 'teamgirls000001' },
];

function ids() {
  let n = 0;
  return () => `newid${String(++n).padStart(10, '0')}`;
}

describe('day arithmetic', () => {
  it('shifts days and measures deltas across months and years', () => {
    expect(shiftDay('2025-05-30', 3)).toBe('2025-06-02');
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
    expect(dayDelta('2025-05-16', '2026-05-15')).toBe(364);
    expect(dayDelta('2025-05-16', '2025-05-10')).toBe(-6);
    expect(regattaDays(source)).toEqual(['2025-05-16', '2025-05-17', '2025-05-18']);
  });

  it('suggests the same weekday next year and moves the year in the name', () => {
    expect(suggestDuplicate(source)).toEqual({
      name: '2026 Spring Sprints',
      startDate: '2026-05-15',
    });
    expect(suggestDuplicate({ name: 'Head of the Lake', startDate: '2026-11-01' }).name).toBe(
      'Head of the Lake',
    );
  });
});

describe('planDuplicate', () => {
  const plan = planDuplicate(source, events, regattaTeams, {
    name: '  2026 Spring Sprints ',
    startDate: '2026-05-15',
    newId: ids(),
  });

  it('copies the regatta settings as a new planning regatta on the new dates', () => {
    expect(plan.regatta).toEqual({
      id: 'newid0000000001',
      name: '2026 Spring Sprints',
      venue: 'Vancouver Lake',
      city: 'Vancouver, WA',
      startDate: '2026-05-15',
      endDate: '2026-05-17',
      timezone: TZ,
      format: 'sprint',
      status: 'planning',
      settings: { launchLeadMin: 75 },
      notes: 'Long row to the start.',
    });
    // The settings object is a copy, not shared with the source.
    expect(plan.regatta.settings).not.toBe(source.settings);
  });

  it('moves events with the dates and keeps their clock times', () => {
    expect(plan.events).toHaveLength(3);
    const [a, b, c] = plan.events;
    expect(a!.regattaId).toBe(plan.regatta.id);
    expect(a!.day).toBe('2026-05-15');
    expect(clockAt(a!.scheduledAt!, TZ)).toBe('8:16');
    expect(b!.day).toBe('2026-05-17');
    expect(clockAt(b!.scheduledAt!, TZ)).toBe('13:04');
    expect(b!.progressionGroup).toBe('Event 2');
    expect(c).toMatchObject({
      kind: 'logistics',
      day: '2026-05-16',
      scheduledAt: null,
      teamFilter: ['teamboys0000001'],
    });
    expect(new Set(plan.events.map((e) => e.id)).size).toBe(3);
  });

  it('keeps wall-clock times across a daylight saving change', () => {
    const fall = planDuplicate(
      { ...source, startDate: '2025-10-25', endDate: '2025-10-25' },
      [event('eventsource0009', '2025-10-25', '09:40')],
      [],
      { name: 'Fall', startDate: '2025-11-08', newId: ids() },
    );
    expect(fall.events[0]!.day).toBe('2025-11-08');
    expect(clockAt(fall.events[0]!.scheduledAt!, TZ)).toBe('9:40');
  });

  it('copies participating teams but not their published lineups', () => {
    expect(plan.regattaTeams).toEqual([
      {
        id: expect.any(String),
        regattaId: plan.regatta.id,
        teamId: 'teamboys0000001',
        notes: 'Bring the tent',
      },
      { id: expect.any(String), regattaId: plan.regatta.id, teamId: 'teamgirls000001' },
    ]);
  });

  it('puts the regatta first in batches of at most 200 writes', () => {
    const batches = duplicateBatches(plan);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.map((op) => `${op.op}:${op.collection}`)).toEqual([
      'create:regattas',
      'create:regatta_teams',
      'create:regatta_teams',
      'create:events',
      'create:events',
      'create:events',
    ]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
