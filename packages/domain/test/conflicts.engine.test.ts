// Engine-wide properties: every code reachable, ordering, ids, determinism, acknowledgment
// helper, busy windows, roster helpers, and the §13 performance budget.

import { describe, expect, it } from 'vitest';
import {
  FINDING_CODES,
  busyWindows,
  entryStats,
  eventAgeGroup,
  findConflicts,
  findingId,
  hash32,
  hotSeatAckPatch,
  hotSeatFingerprint,
  isComing,
  isHotSeat,
  unboatedAthletes,
  type BoatClass,
  type ConflictInput,
  type Finding,
} from '../src';
import { DAY1, DAY2, codes, instant, one, patchEntry, retime, world } from './fixtures';

/** A world that produces every finding code at least once. */
function kitchenSink(): ConflictInput {
  return (
    world({ seasonYear: 2026 })
      .shell('Monahan', '8+')
      .shell('Lundberg', '4+', { rigging: 'convertible', compatibleClasses: ['4x+'] })
      .shell('Hans', '8+', { status: 'out_of_service' })
      .shell('Woodman', '8+', { status: 'limited' })
      .oars('24-C', 'sweep', 8)
      .oars('23-D', 'sweep', 8)
      .oars('Blue', 'scull', 6)
      .athlete('Rowan Vale', { side: 'starboard', birthYear: 2009 })
      .athlete('Emery Stone', { canScull: false })
      .athlete('Sky Hollis', { team: 'Girls' })
      .athlete('Quinn Marsh')
      .availabilityFor('Quinn Marsh', 'unavailable')
      .event('u17', { at: '09:00', category: 'U17', name: "U17 Men's 8+" })
      // Shell hot seat + oars hot seat + athlete tight
      .entry({
        id: 'a',
        label: 'V8',
        event: 'u17',
        shell: 'Monahan',
        oars: '24-C',
        crew: { '4': 'Rowan Vale', cox: 'Sky Hollis' },
      })
      .entry({
        id: 'b',
        label: '2V8',
        at: '09:45',
        shell: 'Monahan',
        oars: '24-C',
        crew: { '1': 'Quinn Marsh', '3': 'Rowan Vale' },
      })
      // Shell conflict, oars conflict, athlete double-booked
      .entry({
        id: 'c',
        label: 'N8',
        at: '12:00',
        shell: 'Woodman',
        oars: '23-D',
        crew: { '2': 'Emery Stone' },
      })
      .entry({
        id: 'd',
        label: 'N8B',
        at: '12:10',
        shell: 'Woodman',
        oars: '23-D',
        crew: { '2': 'Emery Stone' },
      })
      // Re-rig, sculler, oars short, class mismatch, rigging mismatch
      .entry({ id: 'e', cls: '4+', label: 'N4', at: '14:00', shell: 'Lundberg', oars: 'Blue' })
      .entry({
        id: 'f',
        cls: '4x+',
        label: 'U16 4x+',
        at: '16:00',
        shell: 'Lundberg',
        oars: 'Blue',
        crew: { '1': 'Emery Stone' },
      })
      .entry({ id: 'g', cls: '4+', label: 'V4', at: '15:00', shell: 'Hans' })
      .entry({ id: 'h', label: 'Spare', day: DAY2 })
      .onTrailer('Lundberg')
      .build()
  );
}

const snapshot = (input: ConflictInput) => JSON.stringify(findConflicts(input));

describe('findConflicts', () => {
  it('can produce every finding code', () => {
    const produced = new Set(codes(findConflicts(kitchenSink())));
    expect([...FINDING_CODES].filter((c) => !produced.has(c))).toEqual([]);
  });

  it('writes sentences with names, never ids', () => {
    for (const f of findConflicts(kitchenSink())) {
      expect(f.message).toMatch(/^[A-Z].*\.$/);
      expect(f.message).not.toMatch(/\b(sh|oa|at|tm|ev|en)_[a-z0-9]/);
    }
  });

  it('sorts by severity, then day, then time, then code', () => {
    const findings = findConflicts(kitchenSink());
    const rank = { error: 0, warning: 1, info: 2 };
    for (let i = 1; i < findings.length; i++) {
      const [p, q] = [findings[i - 1]!, findings[i]!];
      expect(rank[p.severity]).toBeLessThanOrEqual(rank[q.severity]);
      if (p.severity === q.severity) {
        expect((p.day ?? '~') <= (q.day ?? '~')).toBe(true);
      }
    }
    const warnings = findings.filter((f) => f.severity === 'warning');
    // Day 1 warnings come before the day-2 and unscheduled ones.
    expect(warnings.at(-1)!.day ?? DAY2).not.toBe(DAY1);
  });

  it('is deterministic and independent of input order', () => {
    const input = kitchenSink();
    const reversed: ConflictInput = {
      ...input,
      entries: [...input.entries].reverse(),
      seats: [...input.seats].reverse(),
      events: [...input.events].reverse(),
      athletes: [...input.athletes].reverse(),
    };
    expect(snapshot(input)).toBe(snapshot(input));
    expect(snapshot(reversed)).toBe(snapshot(input));
  });

  it("uses 'f_' + hash32(code + sorted subject ids) for ids", () => {
    const f = one(findConflicts(kitchenSink()), 'SHELL_HOT_SEAT');
    expect(f.id).toBe(`f_${hash32(['SHELL_HOT_SEAT', 'a', 'b', 'sh_monahan'].join('|'))}`);
    expect(f.id).toBe(findingId('SHELL_HOT_SEAT', ['sh_monahan', 'b', 'a']));
    const ids = findConflicts(kitchenSink()).map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns nothing for an empty working set', () => {
    const input = world().build();
    expect(findConflicts(input)).toEqual([]);
  });

  it('meets the §13 budget: 40 entries, 120 athletes, 60 events well under 50 ms', () => {
    const w = world({ seasonYear: 2026 });
    const classes: BoatClass[] = ['8+', '4+', '4x', '2x', '1x'];
    for (let i = 0; i < 12; i++) w.shell(`Hull ${i}`, classes[i % classes.length]!);
    for (let i = 0; i < 8; i++) w.oars(`Set ${i}`, i % 2 ? 'scull' : 'sweep', 8);
    for (let i = 0; i < 120; i++) {
      w.athlete(`Athlete${i} Person${i}`, {
        team: i % 2 ? 'Girls' : 'Boys',
        side: i % 3 === 0 ? 'port' : 'starboard',
        birthYear: 2008 + (i % 4),
      });
    }
    for (let i = 0; i < 60; i++) {
      const h = 7 + Math.floor((i * 8) / 60);
      const m = (i * 8) % 60;
      w.event(`E${i}`, {
        at: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        cls: classes[i % classes.length],
        day: i % 2 ? DAY2 : DAY1,
        name: `U17 race ${i}`,
      });
    }
    for (let i = 0; i < 40; i++) {
      const cls = classes[i % classes.length]!;
      const crew: Record<string, string> = {};
      ['1', '2', '3', '4'].forEach((s, k) => {
        const n = (i * 3 + k) % 120;
        crew[s] = `Athlete${n} Person${n}`;
      });
      w.entry({
        id: `e${i}`,
        event: `E${i}`,
        cls,
        team: i % 2 ? 'Girls' : 'Boys',
        shell: `Hull ${i % 12}`,
        oars: `Set ${i % 8}`,
        crew,
      });
    }
    const input = w.build();
    findConflicts(input); // warm up Intl formatters
    const start = performance.now();
    const runs = 5;
    let findings: Finding[] = [];
    for (let i = 0; i < runs; i++) findings = findConflicts(input);
    const perRun = (performance.now() - start) / runs;
    expect(findings.length).toBeGreaterThan(0);
    expect(perRun).toBeLessThan(50);
  });
});

describe('hot-seat acknowledgment', () => {
  const handoff = () =>
    world()
      .shell('Monahan', '8+')
      .oars('24-C', 'sweep', 8)
      .entry({ id: 'a', label: 'V8', at: '09:00', shell: 'Monahan', oars: '24-C' })
      .entry({ id: 'b', label: 'V8', team: 'Girls', at: '09:45', shell: 'Monahan', oars: '24-C' })
      .build();

  it('acknowledging one hot seat covers the shell and the oars between the same crews', () => {
    const input = handoff();
    const shellHot = one(findConflicts(input), 'SHELL_HOT_SEAT');
    const patch = hotSeatAckPatch(shellHot, input)!;
    expect(patch.entryId).toBe('b');
    expect(patch.hotSeatFingerprint.split(' ')).toHaveLength(2);
    const acked = patchEntry(input, 'b', {
      hotSeatAckBy: 'u_coach',
      hotSeatFingerprint: patch.hotSeatFingerprint,
    });
    const after = findConflicts(acked).filter(isHotSeat);
    expect(after.map((f) => [f.code, f.acknowledged, f.severity])).toEqual([
      ['OARS_HOT_SEAT', true, 'info'],
      ['SHELL_HOT_SEAT', true, 'info'],
    ]);
  });

  it('a stored fingerprint without hotSeatAckBy does not acknowledge', () => {
    const input = handoff();
    const hot = one(findConflicts(input), 'SHELL_HOT_SEAT');
    const fp = hotSeatFingerprint(hot, input);
    const noAck = patchEntry(input, 'b', { hotSeatAckBy: null, hotSeatFingerprint: fp });
    expect(one(findConflicts(noAck), 'SHELL_HOT_SEAT').acknowledged).toBe(false);
    // Stored on the earlier entry instead of the later one: not acknowledged either.
    const wrongEntry = patchEntry(input, 'a', { hotSeatAckBy: 'u', hotSeatFingerprint: fp });
    expect(one(findConflicts(wrongEntry), 'SHELL_HOT_SEAT').acknowledged).toBe(false);
  });

  it('remove drops the pair; stale tokens are pruned on the next acknowledgment', () => {
    const input = handoff();
    const hot = one(findConflicts(input), 'SHELL_HOT_SEAT');
    const patch = hotSeatAckPatch(hot, input)!;
    const acked = patchEntry(input, 'b', {
      hotSeatAckBy: 'u',
      hotSeatFingerprint: `${patch.hotSeatFingerprint} shell:stale|x@y|z@w`,
    });
    expect(hotSeatAckPatch(hot, acked, { remove: true })).toEqual({
      entryId: 'b',
      hotSeatFingerprint: '',
    });
    expect(hotSeatAckPatch(hot, acked)!.hotSeatFingerprint).toBe(patch.hotSeatFingerprint);
  });

  it('a conflict stays an error even with a stored fingerprint, and cannot be acknowledged', () => {
    const input = retime(handoff(), 'b', '09:30');
    const conflict = one(findConflicts(input), 'SHELL_CONFLICT');
    expect(hotSeatAckPatch(conflict, input)).toBeNull();
    const fp = hotSeatFingerprint(conflict, input);
    expect(fp).toMatch(/^shell:sh_monahan\|a@/);
    const stored = patchEntry(input, 'b', { hotSeatAckBy: 'u', hotSeatFingerprint: fp });
    const again = one(findConflicts(stored), 'SHELL_CONFLICT');
    expect(again.severity).toBe('error');
    expect(again.acknowledged).toBeUndefined();
  });

  it('hotSeatFingerprint is empty for findings that are not equipment pairs', () => {
    const input = world()
      .athlete('Rowan Vale')
      .entry({ id: 'a', at: '09:00', crew: { '1': 'Rowan Vale' } })
      .entry({ id: 'b', at: '09:50', crew: { '1': 'Rowan Vale' } })
      .build();
    const f = findConflicts(input);
    const tight = one(f, 'ATHLETE_TIGHT');
    expect(hotSeatFingerprint(tight, input)).toBe('');
    expect(hotSeatAckPatch(tight, input)).toBeNull();
    expect(
      hotSeatFingerprint(
        f.find((x) => x.code === 'SEATS_EMPTY')!,
        input,
      ),
    ).toBe('');
  });

  it('hotSeatFingerprint does not depend on entryIds order, and is empty when data is missing', () => {
    const input = handoff();
    const hot = one(findConflicts(input), 'OARS_HOT_SEAT');
    const flipped = { ...hot, entryIds: [...hot.entryIds].reverse() };
    expect(hotSeatFingerprint(flipped, input)).toBe(hotSeatFingerprint(hot, input));
    const missing = { ...hot, entryIds: ['a', 'zzz'] };
    expect(hotSeatFingerprint(missing, input)).toBe('');
    expect(hotSeatAckPatch(missing, input)).toBeNull();
  });
});

describe('busyWindows', () => {
  it('spans launch lead to return, in time order', () => {
    const input = world()
      .entry({ id: 'late', at: '10:00' })
      .entry({ id: 'early', at: '09:00' })
      .entry({ id: 'tbd' })
      .build();
    expect(busyWindows(input)).toEqual([
      {
        entryId: 'early',
        day: DAY1,
        busyStart: instant(DAY1, '08:20'),
        raceStart: instant(DAY1, '09:00'),
        raceEnd: instant(DAY1, '09:10'),
        busyEnd: instant(DAY1, '09:25'),
      },
      {
        entryId: 'late',
        day: DAY1,
        busyStart: instant(DAY1, '09:20'),
        raceStart: instant(DAY1, '10:00'),
        raceEnd: instant(DAY1, '10:10'),
        busyEnd: instant(DAY1, '10:25'),
      },
    ]);
  });
});

describe('roster helpers', () => {
  it('unboatedAthletes: per-day availability counts as coming; scratched entries do not boat', () => {
    const input = world()
      .athlete('Rowan Vale')
      .athlete('Emery Stone')
      .athlete('Quinn Marsh')
      .athlete('Ava Zimmer')
      .availabilityFor('Rowan Vale', 'unavailable', { [DAY2]: 'available' })
      .availabilityFor('Emery Stone', 'available', { [DAY1]: 'unavailable' })
      .entry({ id: 'x', at: '09:00', status: 'scratched', crew: { '1': 'Quinn Marsh' } })
      .event('sat', { at: '09:00', day: DAY2 })
      .build();
    // Emery is out on day 1 only and the regatta has day-1 and day-2 events: still coming.
    expect(unboatedAthletes(input, 'tm_boys').map((a) => a.lastName)).toEqual([
      'Marsh',
      'Stone',
      'Vale',
      'Zimmer',
    ]);
  });

  it('isComing covers no record, no days, and all days out', () => {
    const av = {
      id: 'x',
      regattaId: 'r',
      athleteId: 'a',
      status: 'available' as const,
      days: { [DAY1]: 'unavailable' as const },
    };
    expect(isComing(undefined, [DAY1])).toBe(true);
    expect(isComing({ ...av, days: null, status: 'unavailable' }, [])).toBe(false);
    expect(isComing({ ...av, days: null, status: 'maybe' }, [])).toBe(true);
    expect(isComing(av, [DAY1])).toBe(false);
    expect(isComing(av, [DAY1, DAY2])).toBe(true);
  });

  it('entryStats without a season year, and with missing athletes and duplicate seats', () => {
    const input = world()
      .athlete('Rowan Vale', { side: 'port' })
      .athlete('Emery Stone', { side: 'both' })
      .entry({ id: 'a', cls: '2x', at: '09:00', crew: { '1': 'Rowan Vale', '2': 'Emery Stone' } })
      .seat('a', '1', 'Emery Stone')
      .seat('a', 'cox', 'Emery Stone')
      .seat('other', '1', 'Rowan Vale')
      .build();
    expect(entryStats(input.entries[0]!, input.seats, input.athletes)).toEqual({
      portCount: 1,
      starboardCount: 0,
    });
    expect(entryStats(input.entries[0]!, input.seats, [], 2026)).toEqual({
      portCount: 0,
      starboardCount: 0,
    });
  });

  it('eventAgeGroup reads U15–U19 and ignores other numbers', () => {
    expect(eventAgeGroup("U17 Men's 8+ A")).toBe('U17');
    expect(eventAgeGroup('Women u-16 4x')).toBe('U16');
    expect(eventAgeGroup('U19 W2x')).toBe('U19');
    expect(eventAgeGroup('U23 Men 8+')).toBeNull();
    expect(eventAgeGroup('U178 bus')).toBeNull();
    expect(eventAgeGroup('Youth 8+')).toBeNull();
  });
});
