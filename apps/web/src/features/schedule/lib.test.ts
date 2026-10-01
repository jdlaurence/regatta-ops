import { describe, expect, it } from 'vitest';
import { zonedToInstant, type Entry, type RegattaEvent, type Team } from '@regatta-ops/domain';
import {
  defaultDay,
  entriesWithoutEvent,
  leavesDay,
  NO_FILTERS,
  orderDay,
  planShift,
  regattaDays,
  scheduleItems,
} from './lib';

const TZ = 'America/Los_Angeles';
const DAY = '2025-05-16';
const at = (hhmm: string, day = DAY) => zonedToInstant(day, hhmm, TZ);

function ev(
  id: string,
  sortOrder: number,
  hhmm: string | null,
  extra: Partial<RegattaEvent> = {},
): RegattaEvent {
  return {
    id,
    regattaId: 'regatta00000001',
    kind: 'race',
    name: id,
    boatClass: '8+',
    day: DAY,
    scheduledAt: hhmm ? at(hhmm) : null,
    sortOrder,
    ...extra,
  };
}

const logistics = (id: string, sortOrder: number, extra: Partial<RegattaEvent> = {}) =>
  ev(id, sortOrder, null, { kind: 'logistics', boatClass: null, ...extra });

function en(id: string, eventId: string | null, teamId: string, extra: Partial<Entry> = {}): Entry {
  return {
    id,
    regattaId: 'regatta00000001',
    eventId,
    teamId,
    label: id,
    boatClass: '8+',
    shellId: null,
    status: 'planned',
    ...extra,
  };
}

const TEAMS = new Map<string, Team>(
  (
    [
      ['boys', 1],
      ['girls', 2],
    ] as const
  ).map(([id, sortOrder]) => [
    id,
    {
      id,
      name: id,
      shortName: id,
      program: 'juniors',
      colorKey: 'navy',
      sortOrder,
      archived: false,
    },
  ]),
);

describe('orderDay', () => {
  it('runs timed events by time, keeps untimed logistics lines in place, and puts TBD last', () => {
    const events = [
      ev('tbd', 5, null),
      logistics('bus-early', 10),
      ev('race-830', 30, '08:30'),
      ev('race-800', 20, '08:00'),
      logistics('lunch', 35),
      ev('race-1200', 40, '12:00'),
      logistics('awards', 90),
      ev('shuttle-1100', 38, '11:00', { kind: 'logistics' }),
    ];
    expect(orderDay(events).map((e) => e.id)).toEqual([
      'bus-early',
      'race-800',
      'race-830',
      'lunch',
      'shuttle-1100',
      'race-1200',
      'awards',
      'tbd',
    ]);
  });

  it('places an untimed line before the first timed event that followed it when published', () => {
    // Race 40 was 12:00 and is now 10:00, before the 11:00 race with sortOrder 30.
    const events = [
      ev('r20', 20, '09:00'),
      ev('r30', 30, '11:00'),
      logistics('lunch', 35),
      ev('r40', 40, '10:00'),
    ];
    expect(orderDay(events).map((e) => e.id)).toEqual(['r20', 'lunch', 'r40', 'r30']);
  });
});

describe('scheduleItems', () => {
  const events = [
    logistics('bus-boys', 1, { teamFilter: ['boys'] }),
    ev('e8', 10, '08:00'),
    ev('e4', 20, '09:00', { boatClass: '4+' }),
    ev('e-empty', 30, '10:00'),
    logistics('lunch', 40),
    ev('other-day', 50, '08:00', { day: '2025-05-17' }),
  ];
  const entries = [
    en('girls-v8', 'e8', 'girls', { shellId: 'hendo' }),
    en('boys-v8', 'e8', 'boys', { shellId: 'lll' }),
    en('boys-v4', 'e4', 'boys', { boatClass: '4+', shellId: 'alma' }),
    en('loose', null, 'girls'),
    en('orphan', 'deleted-event', 'boys'),
  ];

  it('nests entries under their race, in team order, with logistics lines between', () => {
    const items = scheduleItems(events, entries, DAY, NO_FILTERS, TEAMS);
    expect(
      items.map((i) => [i.event.id, i.kind === 'race' ? i.entries.map((e) => e.id) : '-']),
    ).toEqual([
      ['bus-boys', '-'],
      ['e8', ['boys-v8', 'girls-v8']],
      ['e4', ['boys-v4']],
      ['e-empty', []],
      ['lunch', '-'],
    ]);
  });

  it('filters by team: races without its entries drop out, its logistics lines stay', () => {
    const items = scheduleItems(events, entries, DAY, { ...NO_FILTERS, teamId: 'girls' }, TEAMS);
    expect(items.map((i) => i.event.id)).toEqual(['e8', 'lunch']);
    const boys = scheduleItems(events, entries, DAY, { ...NO_FILTERS, teamId: 'boys' }, TEAMS);
    expect(boys.map((i) => i.event.id)).toEqual(['bus-boys', 'e8', 'e4', 'lunch']);
  });

  it('filters by boat class and by shell without logistics lines', () => {
    const fours = scheduleItems(events, entries, DAY, { ...NO_FILTERS, boatClass: '4+' }, TEAMS);
    expect(fours.map((i) => i.event.id)).toEqual(['e4']);
    const eights = scheduleItems(events, entries, DAY, { ...NO_FILTERS, boatClass: '8+' }, TEAMS);
    // A race of the class stays even without entries.
    expect(eights.map((i) => i.event.id)).toEqual(['e8', 'e-empty']);
    const lll = scheduleItems(events, entries, DAY, { ...NO_FILTERS, shellId: 'lll' }, TEAMS);
    expect(lll.map((i) => [i.event.id, i.kind === 'race' && i.entries.map((e) => e.id)])).toEqual([
      ['e8', ['boys-v8']],
    ]);
  });

  it('lists entries that have no event on the schedule', () => {
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(entriesWithoutEvent(entries, byId, NO_FILTERS, TEAMS).map((e) => e.id)).toEqual([
      'orphan',
      'loose',
    ]);
    expect(
      entriesWithoutEvent(entries, byId, { ...NO_FILTERS, teamId: 'girls' }, TEAMS).map(
        (e) => e.id,
      ),
    ).toEqual(['loose']);
  });
});

describe('days', () => {
  it('covers the date range plus any event outside it', () => {
    expect(
      regattaDays({ startDate: '2025-05-16', endDate: '2025-05-18' }, [{ day: '2025-05-19' }]),
    ).toEqual(['2025-05-16', '2025-05-17', '2025-05-18', '2025-05-19']);
    expect(regattaDays({ startDate: '2026-11-01', endDate: '' }, [])).toEqual(['2026-11-01']);
  });

  it('opens on today during the regatta, else the first day', () => {
    const days = ['2025-05-16', '2025-05-17'];
    expect(defaultDay(days, '2025-05-17')).toBe('2025-05-17');
    expect(defaultDay(days, '2026-09-29')).toBe('2025-05-16');
  });
});

describe('planShift', () => {
  const events = [
    ev('r900', 1, '09:00'),
    ev('r1100', 2, '11:00'),
    ev('r1120', 3, '11:20'),
    logistics('lunch-timed', 4, { scheduledAt: at('12:00') }),
    ev('tbd', 5, null),
    ev('next-day', 6, '11:30', { day: '2025-05-17', scheduledAt: at('11:30', '2025-05-17') }),
  ];

  it('moves every timed event on the day at or after the start time', () => {
    const changes = planShift(events, { day: DAY, from: '11:00', minutes: 20 }, TZ);
    expect(changes.map((c) => c.event.id)).toEqual(['r1100', 'r1120', 'lunch-timed']);
    expect(changes[0]!.before).toBe(at('11:00'));
    expect(changes[0]!.after).toBe(at('11:20'));
    expect(changes[2]!.after).toBe(at('12:20'));
  });

  it('moves events earlier with negative minutes, and nothing for zero', () => {
    const changes = planShift(events, { day: DAY, from: '09:30', minutes: -15 }, TZ);
    expect(changes.map((c) => c.after)).toEqual([at('10:45'), at('11:05'), at('11:45')]);
    expect(planShift(events, { day: DAY, from: '09:30', minutes: 0 }, TZ)).toEqual([]);
    expect(planShift(events, { day: DAY, from: '', minutes: 10 }, TZ)).toEqual([]);
  });

  it('notices a shift past midnight', () => {
    const late = [ev('late', 1, '23:50')];
    const [change] = planShift(late, { day: DAY, from: '23:00', minutes: 20 }, TZ);
    expect(leavesDay(change!, TZ)).toBe(true);
    const [fine] = planShift(late, { day: DAY, from: '23:00', minutes: 5 }, TZ);
    expect(leavesDay(fine!, TZ)).toBe(false);
  });
});
