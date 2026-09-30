// One test (or more) per finding code and per severity path (PLAN.md §9.2, §13).

import { describe, expect, it } from 'vitest';
import { findConflicts, type ConflictInput } from '../src';
import { DAY1, codes, ofCode, one, world } from './fixtures';

const run = (input: ConflictInput) => findConflicts(input);

describe('shell pairs: severity boundaries (defaults: lead 40, race 10, return 15, hot seat 15)', () => {
  const pair = (first: string, second: string) =>
    world()
      .shell('Peggy', '8+', { nickname: 'Peg' })
      .entry({ id: 'a', label: 'V8', at: first, shell: 'Peggy' })
      .entry({ id: 'b', label: '2V8', at: second, shell: 'Peggy' })
      .build();

  it('gap equal to the launch lead is fine', () => {
    // 09:00 + 25 = 09:25 landing; 10:05 − 09:25 = 40.
    const f = run(pair('09:00', '10:05'));
    expect(codes(f).filter((c) => c.startsWith('SHELL_'))).toEqual([]);
  });
  it('one minute under the launch lead is a hot seat', () => {
    expect(one(run(pair('09:00', '10:04')), 'SHELL_HOT_SEAT').gapMin).toBe(39);
  });
  it('gap equal to the hot-seat minimum is still a hot seat', () => {
    expect(one(run(pair('09:00', '09:40')), 'SHELL_HOT_SEAT').gapMin).toBe(15);
  });
  it('one minute under the hot-seat minimum is a conflict, with the positive-gap sentence', () => {
    const f = one(run(pair('09:00', '09:39')), 'SHELL_CONFLICT');
    expect(f.gapMin).toBe(14);
    expect(f.severity).toBe('error');
    expect(f.message).toBe(
      'Peg is used by Boys V8 at 9:00 and also by Boys 2V8 at 9:39; only 14 minutes between the ' +
        'boat landing and the next race.',
    );
  });
  it('a zero gap reads as landing just as the race starts', () => {
    expect(one(run(pair('09:00', '09:25')), 'SHELL_CONFLICT').message).toContain(
      'the boat lands just as that race starts',
    );
  });
  it('two entries at the same time pair in id order', () => {
    const f = one(run(pair('09:00', '09:00')), 'SHELL_CONFLICT');
    expect(f.entryIds).toEqual(['a', 'b']);
    expect(f.gapMin).toBe(-25);
  });
  it('honors regatta timing overrides', () => {
    const input = world({ settings: { launchLeadMin: 30, returnMin: 10 } })
      .shell('Peggy', '8+')
      .entry({ id: 'a', at: '09:00', shell: 'Peggy' })
      .entry({ id: 'b', at: '09:45', shell: 'Peggy' })
      .build();
    // landing 09:20, gap 25 < 30 → hot seat.
    expect(one(run(input), 'SHELL_HOT_SEAT').gapMin).toBe(25);
  });
  it('entries with an unknown shell id take no part in pairs', () => {
    const input = world().entry({ id: 'a', at: '09:00' }).entry({ id: 'b', at: '09:05' }).build();
    input.entries = input.entries.map((e) => ({ ...e, shellId: 'sh_ghost' }));
    const f = run(input);
    expect(codes(f).filter((c) => c.startsWith('SHELL_'))).toEqual([]);
    expect(ofCode(f, 'NO_SHELL')).toHaveLength(2);
  });
});

describe('RERIG_NEEDED', () => {
  it('fires on a class change even when the gap is generous', () => {
    const input = world()
      .shell('Lundberg', '4+', { rigging: 'convertible', compatibleClasses: ['4x+'] })
      .entry({ id: 'a', cls: '4+', at: '09:00', shell: 'Lundberg' })
      .entry({ id: 'b', cls: '4x+', at: '14:00', shell: 'Lundberg' })
      .build();
    const f = run(input);
    expect(one(f, 'RERIG_NEEDED').resource).toEqual({ type: 'shell', id: 'sh_lundberg' });
    expect(codes(f).filter((c) => c.startsWith('SHELL_'))).toEqual([]);
  });
  it('does not fire when both entries use the same class', () => {
    const input = world()
      .shell('Lundberg', '4+', { rigging: 'convertible' })
      .entry({ id: 'a', cls: '4+', at: '09:00', shell: 'Lundberg' })
      .entry({ id: 'b', cls: '4+', at: '14:00', shell: 'Lundberg' })
      .build();
    expect(ofCode(run(input), 'RERIG_NEEDED')).toEqual([]);
  });
  it('uses "an" before 8+', () => {
    const input = world()
      .shell('Swing', '8+', { compatibleClasses: ['4+'] })
      .entry({ id: 'a', cls: '8+', label: 'V8', at: '09:00', shell: 'Swing' })
      .entry({ id: 'b', cls: '4+', label: 'V4', at: '14:00', shell: 'Swing' })
      .build();
    expect(one(run(input), 'RERIG_NEEDED').message).toBe(
      'Swing is rigged as an 8+ for Boys V8 at 9:00 and as a 4+ for Boys V4 at 14:00; bring the ' +
        'second rigger set.',
    );
  });
});

describe('oar-set pairs', () => {
  const pair = (second: string) =>
    world()
      .oars('24-C', 'sweep', 8, { color: 'yellow-white' })
      .entry({ id: 'a', label: 'V8', at: '09:00', oars: '24-C' })
      .entry({ id: 'b', label: 'V8', team: 'Girls', at: second, oars: '24-C' })
      .build();

  it('OARS_HOT_SEAT', () => {
    const f = one(run(pair('09:45')), 'OARS_HOT_SEAT');
    expect(f.severity).toBe('warning');
    expect(f.gapMin).toBe(20);
    expect(f.acknowledged).toBe(false);
    expect(f.resource).toEqual({ type: 'oar_set', id: 'oa_24-c' });
    expect(f.teamIds).toEqual(['tm_boys', 'tm_girls']);
    expect(f.message).toBe(
      'Oar set 24-C is used by Boys V8 at 9:00 and also by Girls V8 at 9:45; 20 minutes between ' +
        'the oars landing and the next race, less than the 40 minute launch lead.',
    );
  });
  it('OARS_CONFLICT', () => {
    const f = one(run(pair('09:30')), 'OARS_CONFLICT');
    expect(f.severity).toBe('error');
    expect(f.message).toBe(
      'Oar set 24-C is used by Boys V8 at 9:00 and also by Girls V8 at 9:30; only 5 minutes ' +
        'between the oars landing and the next race.',
    );
    expect(one(run(pair('09:10')), 'OARS_CONFLICT').message).toContain(
      'the oars are not back until 15 minutes after that race starts',
    );
    expect(one(run(pair('09:25')), 'OARS_CONFLICT').message).toContain(
      'the oars land just as that race starts',
    );
  });
  it('no finding when the gap covers the launch lead', () => {
    expect(codes(run(pair('10:30'))).filter((c) => c.startsWith('OARS_'))).toEqual([]);
  });
});

describe('athlete pairs (athlete minimum gap 30)', () => {
  const pair = (second: string) =>
    world()
      .athlete('Rowan Vale', { side: 'port' })
      .entry({ id: 'a', label: 'V8', at: '09:00', crew: { '2': 'Rowan Vale' } })
      .entry({ id: 'b', label: '2V8', at: second, crew: { '2': 'Rowan Vale' } })
      .build();

  it('gap equal to the minimum is fine', () => {
    // landing 09:25; 09:55 − 09:25 = 30.
    expect(codes(run(pair('09:55'))).filter((c) => c.startsWith('ATHLETE_'))).toEqual([]);
  });
  it('ATHLETE_TIGHT when 0 ≤ gap < minimum', () => {
    const f = one(run(pair('09:50')), 'ATHLETE_TIGHT');
    expect(f.severity).toBe('warning');
    expect(f.gapMin).toBe(25);
    expect(f.message).toBe(
      'Rowan Vale races in Boys V8 at 9:00 and Boys 2V8 at 9:50; only 25 minutes between ' +
        'landing and the next race, less than the 30 minute minimum.',
    );
    const zero = one(run(pair('09:25')), 'ATHLETE_TIGHT');
    expect(zero.gapMin).toBe(0);
    expect(zero.message).toContain('the first boat lands just as the second race starts');
  });
  it('ATHLETE_DOUBLE_BOOKED when gap < 0', () => {
    const f = one(run(pair('09:24')), 'ATHLETE_DOUBLE_BOOKED');
    expect(f.gapMin).toBe(-1);
    expect(f.message).toContain('not back until 1 minute after the second race starts');
  });
  it('an unknown athlete id still double-books, named generically', () => {
    const input = world()
      .entry({ id: 'a', at: '09:00' })
      .entry({ id: 'b', at: '09:05' })
      .seat('a', '1', 'Ghost Rower')
      .seat('b', '1', 'Ghost Rower')
      .build();
    expect(one(run(input), 'ATHLETE_DOUBLE_BOOKED').message).toMatch(/^An athlete races in/);
  });
});

describe('static checks', () => {
  it('CLASS_MISMATCH is skipped for compatible classes listed on the shell', () => {
    const input = world()
      .shell('Dan', '4x', { compatibleClasses: ['4-'] })
      .entry({ cls: '4-', at: '09:00', shell: 'Dan' })
      .build();
    expect(ofCode(run(input), 'CLASS_MISMATCH')).toEqual([]);
  });

  it('RIGGING_MISMATCH for sculls on a sweep boat', () => {
    const input = world()
      .oars('Blue', 'scull', 8)
      .entry({ cls: '8+', label: 'V8', at: '09:00', oars: 'Blue' })
      .build();
    expect(one(run(input), 'RIGGING_MISMATCH').message).toBe(
      'Oar set Blue is sculls, but Boys V8 is a sweep boat.',
    );
  });

  it('OARS_SHORT when the set has fewer oars than the class needs', () => {
    const input = world()
      .oars('Blue', 'scull', 6)
      .entry({ cls: '4x+', label: 'U16 4x+', at: '09:00', oars: 'Blue' })
      .build();
    const f = one(run(input), 'OARS_SHORT');
    expect(f.severity).toBe('warning');
    expect(f.message).toBe('Oar set Blue has 6 oars; Boys U16 4x+ needs 8.');
  });

  it('SHELL_OUT_OF_SERVICE for out of service and retired shells', () => {
    const input = world()
      .shell('Hans', '8+', { status: 'out_of_service' })
      .shell('Old Gold', '8+', { status: 'retired' })
      .entry({ id: 'a', label: 'N8', at: '09:00', shell: 'Hans' })
      .entry({ id: 'b', label: 'N8B', at: '11:00', shell: 'Old Gold' })
      .build();
    const f = ofCode(run(input), 'SHELL_OUT_OF_SERVICE');
    expect(f.map((x) => x.severity)).toEqual(['error', 'error']);
    expect(f.map((x) => x.message)).toEqual([
      'Hans is out of service, but Boys N8 is using it.',
      'Old Gold is retired, but Boys N8B is using it.',
    ]);
  });

  it('SHELL_LIMITED is info', () => {
    const input = world()
      .shell('Woodman', '8+', { status: 'limited' })
      .entry({ label: 'U16 8+', at: '09:00', shell: 'Woodman' })
      .build();
    const f = one(run(input), 'SHELL_LIMITED');
    expect(f.severity).toBe('info');
    expect(f.message).toBe(
      'Woodman is in limited service; check its notes before Boys U16 8+ races.',
    );
  });

  it('ATHLETE_UNAVAILABLE: maybe counts as available; a per-day available overrides the regatta', () => {
    const input = world()
      .athlete('Rowan Vale')
      .athlete('Emery Stone')
      .availabilityFor('Rowan Vale', 'maybe')
      .availabilityFor('Emery Stone', 'unavailable', { [DAY1]: 'available' })
      .entry({ at: '09:00', crew: { '1': 'Rowan Vale', '2': 'Emery Stone' } })
      .build();
    expect(ofCode(run(input), 'ATHLETE_UNAVAILABLE')).toEqual([]);
  });

  it('ATHLETE_UNAVAILABLE for an entry with no event uses the regatta-wide status', () => {
    const input = world()
      .athlete('Rowan Vale')
      .availabilityFor('Rowan Vale', 'unavailable')
      .entry({ label: 'V8', crew: { '1': 'Rowan Vale' } })
      .build();
    const f = one(run(input), 'ATHLETE_UNAVAILABLE');
    expect(f.day).toBeUndefined();
    expect(f.message).toBe('Rowan Vale is seated in Boys V8 but is unavailable for this regatta.');
  });

  it('ATHLETE_BORROWED names the home team', () => {
    const input = world()
      .athlete('Sky Hollis', { team: 'Girls', canCox: true })
      .entry({ label: 'V8', at: '09:00', crew: { cox: 'Sky Hollis' } })
      .build();
    const f = one(run(input), 'ATHLETE_BORROWED');
    expect(f.severity).toBe('info');
    expect(f.resource).toEqual({ type: 'athlete', id: 'at_sky-hollis' });
    expect(f.message).toBe('Sky Hollis is borrowed from Girls for Boys V8.');
  });

  it('SEATS_EMPTY counts empty seats, cox included', () => {
    const input = world()
      .athlete('Rowan Vale')
      .entry({ cls: '4+', label: 'V4', at: '09:00', crew: { '1': 'Rowan Vale' } })
      .seat('en_1', '2', null)
      .build();
    const f = one(run(input), 'SEATS_EMPTY');
    expect(f.severity).toBe('warning');
    expect(f.message).toBe('Boys V4 has 4 empty seats.');
    const single = world().entry({ cls: '1x', label: '1x', at: '09:00' }).build();
    expect(one(run(single), 'SEATS_EMPTY').message).toBe('Boys 1x has 1 empty seat.');
  });

  it('seats outside the class template are ignored', () => {
    const input = world()
      .entry({ cls: '2x', label: '2x', at: '09:00', crew: 'full' })
      .seat('en_1', '5', 'Stray Rower')
      .build();
    expect(ofCode(run(input), 'SEATS_EMPTY')).toEqual([]);
  });

  it('NO_SHELL and NO_OARS', () => {
    const input = world().entry({ label: 'V8', at: '09:00', crew: 'full' }).build();
    const f = run(input);
    expect(one(f, 'NO_SHELL').message).toBe('Boys V8 has no shell yet.');
    expect(one(f, 'NO_OARS').message).toBe('Boys V8 has no oars yet.');
    expect(one(f, 'NO_SHELL').severity).toBe('warning');
  });

  it('SIDE_MISMATCH on a standard rig; both/none never mismatch', () => {
    const input = world()
      .athlete('Rowan Vale', { side: 'starboard' })
      .athlete('Emery Stone', { side: 'both' })
      .athlete('Quinn Marsh', { side: 'none' })
      .athlete('Jules Park', { side: 'port' })
      .entry({
        cls: '4-',
        label: 'V4-',
        at: '09:00',
        crew: { '4': 'Rowan Vale', '2': 'Emery Stone', '3': 'Quinn Marsh', '1': 'Jules Park' },
      })
      .build();
    const f = ofCode(run(input), 'SIDE_MISMATCH');
    expect(f.map((x) => x.message).sort()).toEqual([
      'Jules Park rows port but sits in seat 1 of Boys V4-, a starboard seat.',
      'Rowan Vale rows starboard but sits in seat 4 of Boys V4-, a port seat.',
    ]);
    expect(f[0]!.severity).toBe('info');
  });

  it('SIDE_MISMATCH honors entry seat-side overrides, then the shell rig', () => {
    const override = world()
      .athlete('Rowan Vale', { side: 'starboard' })
      .entry({
        cls: '2-',
        at: '09:00',
        crew: { '2': 'Rowan Vale' },
        seatSides: { '2': 'starboard' },
      })
      .build();
    expect(ofCode(run(override), 'SIDE_MISMATCH')).toEqual([]);

    const starboardRig = world()
      .shell('Sharon', '4-', { strokeSide: 'starboard' })
      .athlete('Rowan Vale', { side: 'starboard' })
      .athlete('Jules Park', { side: 'port' })
      .entry({
        cls: '4-',
        at: '09:00',
        shell: 'Sharon',
        crew: { '4': 'Rowan Vale', '3': 'Jules Park' },
      })
      .build();
    expect(ofCode(run(starboardRig), 'SIDE_MISMATCH')).toEqual([]);
  });

  it('COX_NOT_COX for a cox seat holder without can cox', () => {
    const input = world()
      .athlete('Rowan Vale', { canCox: false })
      .entry({ cls: '4+', label: 'V4', at: '09:00', crew: { cox: 'Rowan Vale' } })
      .build();
    const f = one(run(input), 'COX_NOT_COX');
    expect(f.severity).toBe('info');
    expect(f.message).toBe(
      'Rowan Vale is in the cox seat of Boys V4 but is not marked as a coxswain.',
    );
  });

  it('SCULLER_NOT_SCULLER only on scull entries and rowing seats', () => {
    const input = world()
      .athlete('Rowan Vale', { canScull: false })
      .athlete('Quinn Marsh', { canScull: false, canCox: true })
      .entry({
        cls: '4x+',
        label: 'U16 4x+',
        at: '09:00',
        crew: { '3': 'Rowan Vale', cox: 'Quinn Marsh' },
      })
      .entry({ cls: '8+', label: 'V8', at: '13:00', crew: { '3': 'Rowan Vale' } })
      .build();
    const f = one(run(input), 'SCULLER_NOT_SCULLER');
    expect(f.message).toBe(
      'Rowan Vale is in seat 3 of Boys U16 4x+ but is not marked as a sculler.',
    );
  });

  it('CREW_WEIGHT above the maximum, below the minimum, and silent without weights or range', () => {
    const base = (weights: (number | null)[], range: { min?: number; max?: number }) => {
      const w = world().shell('Alma', '4+', {
        crewWeightMinKg: range.min ?? null,
        crewWeightMaxKg: range.max ?? null,
        weightClassLabel: '165-200',
      });
      weights.forEach((kg, i) => w.athlete(`Rower ${i + 1}`, { weightKg: kg }));
      w.athlete('Cox Light', { weightKg: 40, canCox: true });
      const crew: Record<string, string> = { cox: 'Cox Light' };
      weights.forEach((_, i) => (crew[String(i + 1)] = `Rower ${i + 1}`));
      return w.entry({ cls: '4+', label: 'V4', at: '09:00', shell: 'Alma', crew }).build();
    };
    expect(one(run(base([95, 95, 95, 95], { min: 75, max: 91 })), 'CREW_WEIGHT').message).toBe(
      'Boys V4 averages 95 kg a rower, above the 91 kg limit for Alma (165-200).',
    );
    // The 40 kg cox does not pull the average down.
    expect(one(run(base([70, 72, null, 74], { min: 75, max: 91 })), 'CREW_WEIGHT').message).toBe(
      'Boys V4 averages 72 kg a rower, below the 75 kg minimum for Alma (165-200).',
    );
    expect(ofCode(run(base([80, 80, 80, 80], { min: 75, max: 91 })), 'CREW_WEIGHT')).toEqual([]);
    expect(ofCode(run(base([null, null, null, null], { max: 60 })), 'CREW_WEIGHT')).toEqual([]);
    expect(ofCode(run(base([95, 95, 95, 95], {})), 'CREW_WEIGHT')).toEqual([]);
  });

  it('UNSCHEDULED when the event id points nowhere', () => {
    const input = world().entry({ label: 'V8' }).build();
    input.entries[0]!.eventId = 'ev_missing';
    expect(one(run(input), 'UNSCHEDULED').message).toBe('Boys V8 has no event yet.');
  });

  it('NOT_ON_TRAILER only when placements are given, one per shell', () => {
    const w = () =>
      world()
        .shell('Monahan', '8+')
        .shell('Alma', '4+')
        .entry({ id: 'a', label: 'V8', at: '09:00', shell: 'Monahan' })
        .entry({ id: 'b', label: 'V8', team: 'Girls', at: '13:00', shell: 'Monahan' })
        .entry({ id: 'c', label: '3V8', at: '08:00', shell: 'Monahan' })
        .entry({ id: 'd', label: 'V4', at: '10:00', shell: 'Alma' })
        .entry({ id: 'e', label: 'V4', shell: 'Alma', status: 'scratched' });
    expect(ofCode(run(w().build()), 'NOT_ON_TRAILER')).toEqual([]);
    const f = one(run(w().onTrailer('Alma').build()), 'NOT_ON_TRAILER');
    expect(f.severity).toBe('warning');
    expect(f.entryIds).toEqual(['c', 'a', 'b']);
    expect(f.teamIds).toEqual(['tm_boys', 'tm_girls']);
    expect(f.day).toBe(DAY1);
    expect(f.message).toBe(
      'Monahan is used by Boys 3V8, Boys V8, and Girls V8 but is not on a trailer.',
    );
    const two = world()
      .shell('Monahan', '8+')
      .entry({ id: 'a', label: 'V8', shell: 'Monahan' })
      .entry({ id: 'b', label: '2V8', shell: 'Monahan' })
      .onTrailer()
      .build();
    const g = one(run(two), 'NOT_ON_TRAILER');
    expect(g.message).toBe('Monahan is used by Boys V8 and Boys 2V8 but is not on a trailer.');
    expect(g.day).toBeUndefined();
  });

  it('AGE_GROUP from the category or the name; open athletes are past junior age', () => {
    const input = world({ seasonYear: 2026 })
      .athlete('Rowan Vale', { birthYear: 2009 }) // U19 in 2026
      .athlete('Emery Stone', { birthYear: 2010 }) // U17
      .athlete('Quinn Marsh', { birthYear: 2006 }) // open
      .athlete('Jules Park') // no birth year
      .event('u17', { at: '09:00', name: "Men's 8+ A", category: 'U17 Men' })
      .event('u16', { at: '11:00', name: "U16 Men's 8+" })
      .event('open', { at: '13:00', name: "Youth Men's 8+" })
      .entry({
        id: 'a',
        label: 'U17 8+',
        event: 'u17',
        crew: { '1': 'Rowan Vale', '2': 'Emery Stone', '3': 'Jules Park' },
      })
      .entry({ id: 'b', label: 'U16 8+', event: 'u16', crew: { '1': 'Quinn Marsh' } })
      .entry({ id: 'c', label: 'Youth 8+', event: 'open', crew: { '1': 'Quinn Marsh' } })
      .build();
    const f = ofCode(run(input), 'AGE_GROUP');
    expect(f.map((x) => x.message)).toEqual([
      'Boys U17 8+ is in a U17 event, but Rowan Vale is U19.',
      'Boys U16 8+ is in a U16 event, but Quinn Marsh is past junior age.',
    ]);
  });
});
