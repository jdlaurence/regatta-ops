import { describe, expect, it } from 'vitest';
import {
  zonedToInstant,
  type Entry,
  type Regatta,
  type RegattaEvent,
  type Shell,
} from '@regatta-ops/domain';
import {
  activeFilterCount,
  applyClassChange,
  applyCompatibleChange,
  applyRiggerTypeChange,
  classDefaults,
  crewRangeFromLabel,
  crewRangeText,
  DEFAULT_SHELL_FILTERS,
  distinctLocations,
  eventText,
  filterShells,
  newShellInput,
  oarCountText,
  shellGroup,
  sortShells,
  suggestedRigging,
  upcomingUsage,
} from './lib';

function shell(id: string, over: Partial<Shell> = {}): Shell {
  return { id, ...newShellInput(over.boatClass ?? '8+'), name: id, ...over };
}

describe('class defaults (§16.1)', () => {
  it('fills a new shell from its class', () => {
    expect(classDefaults('8+')).toMatchObject({
      rigging: 'sweep',
      coxPosition: 'stern',
      lengthCm: 1990,
      beamCm: 57,
      weightKg: 96,
      riggerType: 'side',
      riggerCount: 8,
    });
    const quad = newShellInput('4x');
    expect(quad).toMatchObject({
      boatClass: '4x',
      rigging: 'scull',
      coxPosition: null,
      strokeSide: null,
      riggerCount: 8,
      status: 'in_service',
      isPrivate: false,
    });
    expect(classDefaults('1x', 'wing').riggerCount).toBe(1);
  });

  it('moves fields still at the old default to the new class and keeps typed values', () => {
    const eight = { ...newShellInput('8+'), beamCm: 55 };
    const four = applyClassChange(eight, '4+');
    expect(four.lengthCm).toBe(1340);
    expect(four.weightKg).toBe(51);
    expect(four.beamCm).toBe(55); // typed, kept
    expect(four.riggerCount).toBe(4);
    expect(four.coxPosition).toBe('stern');
    expect(four.rigging).toBe('sweep');

    const quad = applyClassChange(four, '4x');
    expect(quad.rigging).toBe('scull');
    expect(quad.coxPosition).toBeNull();
    expect(quad.riggerCount).toBe(8);

    const blank = applyClassChange({ ...newShellInput('2x'), lengthCm: null }, '1x');
    expect(blank.lengthCm).toBe(820);
  });

  it('keeps a hand-set rigger count and rigging through a class change', () => {
    const custom = { ...newShellInput('8+'), riggerCount: 9, rigging: 'convertible' as const };
    const out = applyClassChange(custom, '4+');
    expect(out.riggerCount).toBe(9);
    expect(out.rigging).toBe('convertible');
  });

  it('drops the new class from the compatible list', () => {
    const lundberg = { ...newShellInput('4+'), compatibleClasses: ['4x+' as const] };
    expect(applyClassChange(lundberg, '4x+').compatibleClasses).toEqual([]);
  });

  it('halves the rigger count for wing riggers unless it was set by hand', () => {
    const eight = newShellInput('8+');
    expect(applyRiggerTypeChange(eight, 'wing').riggerCount).toBe(4);
    expect(applyRiggerTypeChange(eight, 'none').riggerCount).toBe(0);
    expect(applyRiggerTypeChange({ ...eight, riggerCount: 10 }, 'wing').riggerCount).toBe(10);
  });

  it('marks convertible hulls from their compatible classes', () => {
    expect(suggestedRigging('4x', ['4-'])).toBe('convertible');
    expect(suggestedRigging('4+', ['4x+'])).toBe('convertible');
    expect(suggestedRigging('4+', ['4-'])).toBe('convertible'); // coxed and coxless
    expect(suggestedRigging('8+', [])).toBe('sweep');
    const quad = applyCompatibleChange(newShellInput('4x'), ['4-', '4x']);
    expect(quad.compatibleClasses).toEqual(['4-']);
    expect(quad.rigging).toBe('convertible');
    expect(applyCompatibleChange(quad, []).rigging).toBe('scull');
  });
});

describe('crew weight', () => {
  it('parses the club label and shows it in the viewer unit', () => {
    const r = crewRangeFromLabel('165-200');
    expect(crewRangeText(r, 'lb')).toBe('165–200 lb');
    expect(crewRangeText(r, 'kg')).toBe('75–91 kg');
    expect(crewRangeText(crewRangeFromLabel('<240'), 'lb')).toBe('Up to 240 lb');
    expect(crewRangeText(crewRangeFromLabel('LWT'), 'lb')).toBe('Up to 160 lb');
    expect(crewRangeText(crewRangeFromLabel('>200'), 'lb')).toBe('200 lb and up');
    expect(crewRangeText(crewRangeFromLabel(''), 'lb')).toBeNull();
  });
});

describe('oar counts', () => {
  it('says oars for sweep sets and pairs for sculls', () => {
    expect(oarCountText({ type: 'sweep', count: 9 })).toBe('9 oars');
    expect(oarCountText({ type: 'scull', count: 6 })).toBe('6 sculls, 3 pairs');
    expect(oarCountText({ type: 'scull', count: 1 })).toBe('1 scull');
  });
});

describe('shell filters', () => {
  const shells = [
    shell('Monahan', { genderAffinity: 'men', homeTeamId: 'boys', location: 'C5', serial: 'QVU1' }),
    shell('Lundberg', {
      boatClass: '4+',
      compatibleClasses: ['4+', '4x+'],
      genderAffinity: 'women',
      location: 'Meadow',
      model: 'Vespoli D4',
    }),
    shell('Old Blue', { status: 'retired', genderAffinity: 'any', level: 'beginner' }),
    shell('Dinghy', { boatClass: '1x', level: 'beginner', location: 'Berm' }),
  ];
  const run = (f: Partial<typeof DEFAULT_SHELL_FILTERS>) =>
    filterShells(shells, { ...DEFAULT_SHELL_FILTERS, ...f }).map((s) => s.id);

  it('hides retired shells unless asked', () => {
    expect(run({})).toEqual(['Monahan', 'Lundberg', 'Dinghy']);
    expect(run({ showRetired: true })).toContain('Old Blue');
    expect(run({ status: 'retired' })).toEqual(['Old Blue']);
  });

  it('matches a class through compatible classes', () => {
    expect(run({ boatClass: '4x+' })).toEqual(['Lundberg']);
    expect(run({ boatClass: '8+' })).toEqual(['Monahan']);
  });

  it('filters by team, location, affinity, and level', () => {
    expect(run({ teamId: 'boys' })).toEqual(['Monahan']);
    expect(run({ teamId: 'none' })).toEqual(['Lundberg', 'Dinghy']);
    expect(run({ location: 'Berm' })).toEqual(['Dinghy']);
    expect(run({ genderAffinity: 'women' })).toEqual(['Lundberg']);
    expect(run({ level: 'beginner', showRetired: true })).toEqual(['Old Blue', 'Dinghy']);
  });

  it('searches name, nickname, model, and serial', () => {
    expect(run({ search: 'qvu1' })).toEqual(['Monahan']);
    expect(run({ search: 'vespoli' })).toEqual(['Lundberg']);
    expect(run({ search: 'lund d4' })).toEqual(['Lundberg']);
    expect(run({ search: 'nothing' })).toEqual([]);
  });

  it('counts active filters, not the search', () => {
    expect(
      activeFilterCount({ ...DEFAULT_SHELL_FILTERS, search: 'x' }, DEFAULT_SHELL_FILTERS),
    ).toBe(0);
    expect(
      activeFilterCount(
        { ...DEFAULT_SHELL_FILTERS, boatClass: '8+', showRetired: true },
        DEFAULT_SHELL_FILTERS,
      ),
    ).toBe(2);
  });

  it("sorts and groups like the club's list", () => {
    expect(sortShells(shells).map((s) => s.id)).toEqual([
      'Lundberg',
      'Monahan',
      'Old Blue',
      'Dinghy',
    ]);
    expect(shellGroup(shells[1]!)).toEqual({ key: 'women|4+', label: "Women's 4+" });
    expect(shellGroup(shells[2]!).label).toBe('Any squad 8+');
  });

  it('lists locations in natural order', () => {
    expect(
      distinctLocations([{ location: 'C10' }, { location: 'C5' }, { location: 'Berm' }, {}]),
    ).toEqual(['Berm', 'C5', 'C10']);
  });
});

describe('upcoming use', () => {
  const tz = 'America/Los_Angeles';
  const regatta = (id: string, over: Partial<Regatta>): Regatta => ({
    id,
    name: id,
    venue: '',
    city: '',
    startDate: '2026-11-01',
    endDate: '2026-11-01',
    timezone: tz,
    format: 'head',
    status: 'planning',
    settings: {},
    ...over,
  });
  const event = (
    id: string,
    regattaId: string,
    day: string,
    hhmm: string | null,
  ): RegattaEvent => ({
    id,
    regattaId,
    kind: 'race',
    eventNumber: id.slice(-2),
    name: "Men's Junior 8+",
    boatClass: '8+',
    day,
    scheduledAt: hhmm ? zonedToInstant(day, hhmm, tz) : null,
    sortOrder: 0,
  });
  const entry = (
    id: string,
    regattaId: string,
    eventId: string | null,
    over: Partial<Entry> = {},
  ): Entry => ({
    id,
    regattaId,
    eventId,
    teamId: 'boys',
    label: id,
    boatClass: '8+',
    shellId: 'monahan',
    status: 'planned',
    ...over,
  });

  const regattas = [
    regatta('hotl', { name: 'Head of the Lake' }),
    regatta('tail', { name: 'Tail of the Lake', startDate: '2026-10-18', endDate: '2026-10-18' }),
    regatta('past', { startDate: '2025-05-16', endDate: '2025-05-18' }),
    regatta('archived', { status: 'archived', startDate: '2026-12-01', endDate: '2026-12-01' }),
  ];
  const events = [
    event('ev14', 'hotl', '2026-11-01', '10:20'),
    event('ev12', 'hotl', '2026-11-01', '09:40'),
    event('ev03', 'tail', '2026-10-18', null),
    event('ev01', 'past', '2025-05-16', '08:16'),
  ];
  const entries = [
    entry('V8', 'hotl', 'ev14'),
    entry('2V8', 'hotl', 'ev12'),
    entry('spare', 'hotl', null),
    entry('scratched', 'hotl', 'ev12', { status: 'scratched' }),
    entry('tail8', 'tail', 'ev03'),
    entry('old', 'past', 'ev01'),
    entry('gone', 'archived', null),
  ];

  it('lists entries in upcoming, live regattas, soonest first', () => {
    const groups = upcomingUsage({ entries, regattas, events, today: '2026-09-29' });
    expect(groups.map((g) => g.regatta.id)).toEqual(['tail', 'hotl']);
    const hotl = groups[1]!;
    expect(hotl.rows.map((r) => r.entry.id)).toEqual(['2V8', 'V8', 'spare']);
    expect(hotl.rows.map((r) => r.time)).toEqual(['9:40', '10:20', null]);
    expect(groups[0]!.rows[0]!.time).toBeNull(); // TBD
  });

  it('keeps a regatta through its last day', () => {
    const groups = upcomingUsage({ entries, regattas, events, today: '2026-11-01' });
    expect(groups.map((g) => g.regatta.id)).toEqual(['hotl']);
    expect(upcomingUsage({ entries, regattas, events, today: '2026-11-02' })).toEqual([]);
  });

  it('names events for the list', () => {
    expect(eventText(events[0]!)).toBe("Event 14 · Men's Junior 8+");
    expect(eventText({ name: 'Lunch' })).toBe('Lunch');
    expect(eventText(null)).toBe('Unscheduled');
  });
});
