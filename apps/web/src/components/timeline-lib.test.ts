import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMING,
  effectiveSettings,
  findConflicts,
  hotSeatAckPatch,
  shellLabel,
  zonedToInstant,
  type ConflictInput,
  type Entry,
  type OarSet,
  type RegattaEvent,
  type Shell,
  type Team,
} from '@srt/domain';
import { buildSeedWorld } from '@srt/seed';
import {
  buildTimeline,
  conflictRegion,
  dayAxis,
  fitText,
  hotSeatLink,
  NO_RESOURCE,
  nowOnAxis,
  overlaps,
  packLanes,
  timelineDays,
  timeToX,
} from './timeline-lib';

const TZ = 'America/Los_Angeles';
const DAY = '2026-11-01';
const at = (hhmm: string, day = DAY) => zonedToInstant(day, hhmm, TZ);
const ms = (hhmm: string, day = DAY) => Date.parse(at(hhmm, day));

const team = (id: string, shortName: string, sortOrder: number): Team => ({
  id,
  name: `Junior ${shortName.toLowerCase()}`,
  shortName,
  program: 'juniors',
  colorKey: sortOrder === 1 ? 'navy' : 'raspberry',
  sortOrder,
  archived: false,
});

const shell = (id: string, name: string, homeTeamId: string | null = null): Shell => ({
  id,
  name,
  boatClass: '8+',
  compatibleClasses: [],
  rigging: 'sweep',
  riggerType: 'side',
  genderAffinity: 'any',
  homeTeamId,
  status: 'in_service',
  isPrivate: false,
});

const oars: OarSet = {
  id: 'oarsets00000001',
  name: '24-C',
  type: 'sweep',
  color: 'yellow-white',
  count: 8,
  genderAffinity: 'any',
  status: 'in_service',
};

const event = (id: string, hhmm: string | null, day = DAY): RegattaEvent => ({
  id,
  regattaId: 'regatta00000001',
  kind: 'race',
  name: `Race ${id}`,
  boatClass: '8+',
  day,
  scheduledAt: hhmm ? at(hhmm, day) : null,
  sortOrder: 0,
});

const entry = (
  id: string,
  teamId: string,
  eventId: string,
  shellId: string | null,
  extra: Partial<Entry> = {},
): Entry => ({
  id,
  regattaId: 'regatta00000001',
  eventId,
  teamId,
  label: `V8 ${id}`,
  boatClass: '8+',
  shellId,
  oarSetId: null,
  status: 'planned',
  ...extra,
});

/**
 * Defaults: launch lead 40, race 10, return 15, hot seat minimum 15. On shell A:
 * boys at 9:00, girls at 9:45 (gap 20: hot seat), boys at 10:00 (back 10:10: conflict).
 * Shell B: girls at 9:00 with oars. Plus entries the timeline must skip.
 */
function world(overrides: Partial<ConflictInput> = {}): ConflictInput {
  return {
    settings: DEFAULT_TIMING,
    timezone: TZ,
    seasonYear: 2026,
    teams: [team('teamboys0000001', 'Boys', 1), team('teamgirls000001', 'Girls', 2)],
    shells: [
      shell('shella000000001', 'Alpha', 'teamgirls000001'),
      shell('shellb000000001', 'Bravo'),
    ],
    oarSets: [oars],
    athletes: [],
    availability: [],
    seats: [],
    events: [
      event('ev1', '09:00'),
      event('ev2', '09:45'),
      event('ev3', '10:00'),
      event('evtbd', null),
      event('evday2', '09:00', '2026-11-02'),
    ],
    entries: [
      entry('n1', 'teamboys0000001', 'ev1', 'shella000000001'),
      entry('n2', 'teamgirls000001', 'ev2', 'shella000000001'),
      entry('n3', 'teamboys0000001', 'ev3', 'shella000000001'),
      entry('n4', 'teamgirls000001', 'ev1', 'shellb000000001', { oarSetId: oars.id }),
      entry('n5', 'teamgirls000001', 'ev3', null),
      entry('scratched', 'teamgirls000001', 'ev1', 'shellb000000001', { status: 'scratched' }),
      entry('tbd', 'teamboys0000001', 'evtbd', 'shellb000000001'),
      entry('day2', 'teamboys0000001', 'evday2', 'shella000000001'),
    ],
    ...overrides,
  };
}

describe('axis', () => {
  it('runs from the hour before the first busy start to the hour after the last busy end', () => {
    const axis = dayAxis(ms('07:20'), ms('10:35'), TZ);
    expect(axis.start).toBe(ms('07:00'));
    expect(axis.end).toBe(ms('11:00'));
    // A tick every 15 minutes, both ends included; labels on the hour only.
    expect(axis.ticks).toHaveLength(17);
    expect(axis.ticks.filter((t) => t.hour).map((t) => t.label)).toEqual([
      '7:00',
      '8:00',
      '9:00',
      '10:00',
      '11:00',
    ]);
    expect(axis.ticks[1]).toEqual({ t: ms('07:15'), hour: false });
  });

  it('keeps an end that falls on the hour and never collapses to nothing', () => {
    expect(dayAxis(ms('08:00'), ms('10:00'), TZ).end).toBe(ms('10:00'));
    const one = dayAxis(ms('08:00'), ms('08:00'), TZ);
    expect(one.end - one.start).toBe(60 * 60_000);
  });

  it('maps time to x at a given scale', () => {
    const axis = dayAxis(ms('07:20'), ms('10:35'), TZ);
    expect(timeToX(ms('07:00'), axis, 2.5)).toBe(0);
    expect(timeToX(ms('07:30'), axis, 2.5)).toBe(75);
    expect(timeToX(ms('09:15'), axis, 2)).toBe(270);
  });

  it('says whether the now-line belongs on the axis', () => {
    const axis = dayAxis(ms('07:20'), ms('10:35'), TZ);
    expect(nowOnAxis(ms('09:10'), axis, DAY, TZ)).toBe(true);
    expect(nowOnAxis(ms('12:00'), axis, DAY, TZ)).toBe(false);
    expect(nowOnAxis(ms('09:10', '2026-11-02'), axis, DAY, TZ)).toBe(false);
    expect(nowOnAxis(null, axis, DAY, TZ)).toBe(false);
  });
});

describe('lanes and marks', () => {
  it('packs overlapping spans into separate lanes and reuses freed lanes', () => {
    const { lanes, count } = packLanes([
      { id: 'c', start: 10, end: 20 },
      { id: 'a', start: 0, end: 10 },
      { id: 'b', start: 5, end: 15 },
      { id: 'd', start: 15, end: 30 },
    ]);
    expect(Object.fromEntries(lanes)).toEqual({ a: 0, b: 1, c: 0, d: 1 });
    expect(count).toBe(2);
    expect(packLanes([]).count).toBe(1);
  });

  it('treats touching spans as not overlapping', () => {
    expect(overlaps({ start: 0, end: 10 }, { start: 10, end: 20 })).toBe(false);
    expect(overlaps({ start: 0, end: 11 }, { start: 10, end: 20 })).toBe(true);
  });

  it('hatches the intersection of a conflict, or the gap when the windows do not meet', () => {
    const a = { busyStart: 0, raceStart: 40, busyEnd: 65 };
    const b = { busyStart: 50, raceStart: 90, busyEnd: 115 };
    expect(conflictRegion(a, b)).toEqual({ start: 50, end: 65 });
    const late = { busyStart: 70, raceStart: 72, busyEnd: 100 };
    expect(conflictRegion(a, late)).toEqual({ start: 65, end: 72 });
  });

  it('links a hot seat from the earlier boat landing to the later race start', () => {
    expect(
      hotSeatLink(
        { busyStart: 0, raceStart: 40, busyEnd: 65 },
        { busyStart: 45, raceStart: 85, busyEnd: 110 },
      ),
    ).toEqual({ start: 65, end: 85 });
  });

  it('fits labels to the room on a bar', () => {
    expect(fitText('Boys 2V8', 100)).toBe('Boys 2V8');
    expect(fitText('Evening Mixed 4x', 64)).toBe('Evening M…');
    expect(fitText('Boys 2V8', 6)).toBe('');
  });
});

describe('buildTimeline', () => {
  const input = world();
  const findings = findConflicts(input);

  it('draws one bar per scheduled entry of the day, spanning its busy window', () => {
    const model = buildTimeline(input, findings, { day: DAY });
    expect(model.bars.map((b) => b.entryId).sort()).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    const n1 = model.bars.find((b) => b.entryId === 'n1')!;
    expect(n1.busyStart).toBe(ms('08:20'));
    expect(n1.raceStart).toBe(ms('09:00'));
    expect(n1.raceEnd).toBe(ms('09:10'));
    expect(n1.busyEnd).toBe(ms('09:25'));
    expect(n1.label).toBe('Boys V8 n1');
    expect(n1.raceClock).toBe('9:00');
    expect(n1.teamColor).toBe('navy');
    expect(n1.description).toBe('Boys V8 n1, Race ev1 at 9:00, Alpha, busy 8:20 to 9:25');
    expect(n1.details).toMatchObject({
      name: 'Boys V8 n1',
      event: 'Race ev1 at 9:00',
      shell: 'Alpha',
      busy: '8:20 to 9:25',
    });
    expect(model.axis).toMatchObject({ start: ms('08:00'), end: ms('11:00') });
  });

  it('groups by shell in order of first use, with entries without a shell last', () => {
    const model = buildTimeline(input, findings, { day: DAY });
    expect(model.rows.map((r) => [r.label, r.lanes])).toEqual([
      ['Alpha (8+)', 3],
      ['Bravo (8+)', 1],
      ['No shell', 1],
    ]);
    expect(model.rows[0]!.shell?.name).toBe('Alpha');
    // A shell row takes its home team's color; a club boat has none.
    expect(model.rows.map((r) => r.teamColor)).toEqual(['raspberry', null, null]);
    expect(model.rows[2]!.id).toBe(NO_RESOURCE);
    // All three overlap in their busy windows (n3 needs the shell at 9:20, before n1 is back
    // at 9:25), so each takes its own lane.
    const lane = (id: string) => model.bars.find((b) => b.entryId === id)!.lane;
    expect([lane('n1'), lane('n2'), lane('n3')]).toEqual([0, 1, 2]);
  });

  it('marks the hot seat as a link and the conflict as a hatched intersection', () => {
    const model = buildTimeline(input, findings, { day: DAY });
    expect(model.marks.map((m) => [m.kind, m.fromEntryId, m.toEntryId])).toEqual(
      expect.arrayContaining([
        ['hot_seat', 'n1', 'n2'],
        ['conflict', 'n2', 'n3'],
      ]),
    );
    expect(model.marks).toHaveLength(2);
    const hot = model.marks.find((m) => m.kind === 'hot_seat')!;
    expect([hot.start, hot.end]).toEqual([ms('09:25'), ms('09:45')]);
    expect(hot.gapMin).toBe(20);
    expect(hot.acknowledged).toBe(false);
    const conflict = model.marks.find((m) => m.kind === 'conflict')!;
    // n3 needs the shell from 9:20; n2 has it until 10:10.
    expect([conflict.start, conflict.end]).toEqual([ms('09:20'), ms('10:10')]);
  });

  it('shows an acknowledged hot seat as acknowledged', () => {
    const hot = findings.find((f) => f.code === 'SHELL_HOT_SEAT')!;
    const patch = hotSeatAckPatch(hot, input)!;
    const acked = world({
      entries: input.entries.map((e) =>
        e.id === patch.entryId
          ? { ...e, hotSeatAckBy: 'usercoach000001', hotSeatFingerprint: patch.hotSeatFingerprint }
          : e,
      ),
    });
    const model = buildTimeline(acked, findConflicts(acked), { day: DAY });
    expect(model.marks.find((m) => m.kind === 'hot_seat')!.acknowledged).toBe(true);
  });

  it('groups by team in team order, naming the shell on each bar', () => {
    const model = buildTimeline(input, findings, { day: DAY, groupBy: 'team' });
    expect(model.rows.map((r) => r.label)).toEqual(['Junior boys', 'Junior girls']);
    expect(model.rows.map((r) => r.team?.shortName)).toEqual(['Boys', 'Girls']);
    expect(model.bars.find((b) => b.entryId === 'n1')!.label).toBe('V8 n1 · Alpha');
    expect(model.bars.find((b) => b.entryId === 'n5')!.label).toBe('V8 n5');
    // The shell pairs cross teams, so no mark has both bars on one row.
    expect(model.marks).toEqual([]);
  });

  it('groups by oar set, with entries without oars last', () => {
    const model = buildTimeline(input, findings, { day: DAY, groupBy: 'oar_set' });
    expect(model.rows.map((r) => r.label)).toEqual(['24-C · yellow-white', 'No oars']);
    expect(model.rows[0]!.oarSet?.id).toBe(oars.id);
    expect(model.marks).toEqual([]);
  });

  it('applies the filter, dropping marks whose other bar is hidden', () => {
    const model = buildTimeline(input, findings, {
      day: DAY,
      includeEntry: (e) => e.teamId === 'teamboys0000001',
    });
    expect(model.bars.map((b) => b.entryId).sort()).toEqual(['n1', 'n3']);
    expect(model.marks).toEqual([]);
  });

  it('has no axis for a day without scheduled entries', () => {
    const model = buildTimeline(input, findings, { day: '2026-11-03' });
    expect(model.bars).toEqual([]);
    expect(model.axis).toBeNull();
    expect(timelineDays(input)).toEqual(['2026-11-01', '2026-11-02']);
  });
});

describe('the seed world', () => {
  const { world: seed } = buildSeedWorld();
  function inputFor(name: string): ConflictInput {
    const r = seed.regattas.find((x) => x.name === name)!;
    const entries = seed.entries.filter((e) => e.regattaId === r.id);
    const ids = new Set(entries.map((e) => e.id));
    return {
      settings: effectiveSettings(r, seed.club_settings[0]),
      timezone: r.timezone,
      seasonYear: Number(r.startDate.slice(0, 4)),
      events: seed.events.filter((e) => e.regattaId === r.id),
      entries,
      seats: seed.entry_seats.filter((s) => ids.has(s.entryId)),
      athletes: seed.athletes,
      availability: seed.availability.filter((a) => a.regattaId === r.id),
      shells: seed.shells,
      oarSets: seed.oar_sets,
      teams: seed.teams,
    };
  }

  it('shows Head of the Lake with one shell conflict and one hot seat', () => {
    const input = inputFor('Head of the Lake');
    const model = buildTimeline(input, findConflicts(input), { day: '2026-11-01' });
    const byKind = (k: string) =>
      model.marks
        .filter((m) => m.kind === k)
        .map((m) => shellLabel(model.rows.find((r) => r.id === m.rowId)!.shell!));
    expect(byKind('conflict')).toEqual(['Kokanee']);
    expect(byKind('hot_seat')).toEqual(['Hendo']);
  });

  it('shows the Northwest Youth hot seats on shells and on oars', () => {
    const input = inputFor('2025 USRowing Northwest Youth Championships');
    const findings = findConflicts(input);
    const shells = buildTimeline(input, findings, { day: '2025-05-16' });
    expect(
      shells.marks.map((m) => shellLabel(shells.rows.find((r) => r.id === m.rowId)!.shell!)).sort(),
    ).toEqual(['Alma', 'LLL']);
    const oarRows = buildTimeline(input, findings, { day: '2025-05-16', groupBy: 'oar_set' });
    expect(
      oarRows.marks.map((m) => oarRows.rows.find((r) => r.id === m.rowId)!.oarSet!.name).sort(),
    ).toEqual(['23-D', '24-D']);
    expect(timelineDays(input)).toEqual(['2025-05-16', '2025-05-17', '2025-05-18']);
  });
});
