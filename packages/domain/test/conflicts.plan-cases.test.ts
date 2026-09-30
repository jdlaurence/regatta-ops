// PLAN.md §9.2 test cases 1–15, one `it` each (numbered as in the plan).

import { describe, expect, it } from 'vitest';
import {
  entryStats,
  findConflicts,
  hotSeatFingerprint,
  juniorAgeGroup,
  mastersCategory,
  unboatedAthletes,
} from '../src';
import { DAY1, DAY2, athleteId, codes, ofCode, one, patchEntry, retime, world } from './fixtures';

const pairCodes = (input: Parameters<typeof findConflicts>[0]) =>
  codes(findConflicts(input)).filter((c) =>
    ['SHELL_CONFLICT', 'SHELL_HOT_SEAT', 'RERIG_NEEDED'].includes(c),
  );

function twoOnMonahan(first: string, second: string) {
  return world()
    .shell('Monahan', '8+')
    .entry({ id: 'a', label: 'V8', at: first, shell: 'Monahan' })
    .entry({ id: 'b', label: 'V8', team: 'Girls', at: second, shell: 'Monahan' })
    .build();
}

describe('PLAN.md §9.2 test cases', () => {
  it('1. same shell, races 3 h apart: no finding', () => {
    expect(pairCodes(twoOnMonahan('09:00', '12:00'))).toEqual([]);
  });

  it('2. same shell, races 45 min apart: SHELL_HOT_SEAT with gapMin 20', () => {
    const f = one(findConflicts(twoOnMonahan('09:00', '09:45')), 'SHELL_HOT_SEAT');
    expect(f.gapMin).toBe(20);
    expect(f.severity).toBe('warning');
    expect(f.acknowledged).toBe(false);
    expect(f.entryIds).toEqual(['a', 'b']);
    expect(f.resource).toEqual({ type: 'shell', id: 'sh_monahan' });
    expect(f.day).toBe(DAY1);
    expect(f.message).toBe(
      'Monahan is used by Boys V8 at 9:00 and also by Girls V8 at 9:45; 20 minutes between the ' +
        'boat landing and the next race, less than the 40 minute launch lead.',
    );
  });

  it('3. same shell, races 20 min apart: SHELL_CONFLICT', () => {
    const f = one(findConflicts(twoOnMonahan('09:00', '09:20')), 'SHELL_CONFLICT');
    expect(f.severity).toBe('error');
    expect(f.gapMin).toBe(-5);
    expect(f.message).toBe(
      'Monahan is used by Boys V8 at 9:00 and also by Girls V8 at 9:20; the boat is not back ' +
        'until 5 minutes after that race starts.',
    );
  });

  it('4. same shell, three races: only consecutive pairs are reported', () => {
    const input = world()
      .shell('Monahan', '8+')
      .entry({ id: 'a', at: '09:00', shell: 'Monahan' })
      .entry({ id: 'c', at: '10:30', shell: 'Monahan' })
      .entry({ id: 'b', at: '09:45', shell: 'Monahan' })
      .build();
    const hot = ofCode(findConflicts(input), 'SHELL_HOT_SEAT');
    expect(hot.map((f) => f.entryIds)).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);
    expect(ofCode(findConflicts(input), 'SHELL_CONFLICT')).toEqual([]);
  });

  it('5. a scratched entry is ignored and produces no findings', () => {
    const input = world()
      .shell('Monahan', '8+')
      .entry({ id: 'a', at: '09:00', shell: 'Monahan' })
      .entry({ id: 'b', at: '09:05', shell: 'Monahan', status: 'scratched' })
      .build();
    const findings = findConflicts(input);
    expect(findings.some((f) => f.entryIds.includes('b'))).toBe(false);
    expect(pairCodes(input)).toEqual([]);
  });

  it('6. an unscheduled entry yields UNSCHEDULED only', () => {
    const input = world()
      .shell('Monahan', '8+')
      .oars('24-C', 'sweep', 8)
      .event('E1', { at: null, cls: '8+', name: 'Youth Mens 8+', number: '14' })
      .entry({ id: 'a', label: 'V8', event: 'E1', shell: 'Monahan', oars: '24-C', crew: 'full' })
      .entry({ id: 'b', label: '2V8', shell: 'Monahan', oars: '24-C', crew: 'full' })
      .build();
    const findings = findConflicts(input);
    expect(codes(findings)).toEqual(['UNSCHEDULED', 'UNSCHEDULED']);
    expect(findings.map((f) => f.message)).toEqual([
      'Boys V8 is entered in Event 14 (Youth Mens 8+), which has no time yet.',
      'Boys 2V8 has no event yet.',
    ]);
  });

  it('7. athlete in two entries 10 min apart: ATHLETE_DOUBLE_BOOKED', () => {
    const input = world()
      .athlete('Rowan Vale', { side: 'port' })
      .entry({ id: 'a', label: 'V8', at: '09:00', crew: { '2': 'Rowan Vale' } })
      .entry({ id: 'b', label: '2V4+', cls: '4+', at: '09:10', crew: { '2': 'Rowan Vale' } })
      .build();
    const f = one(findConflicts(input), 'ATHLETE_DOUBLE_BOOKED');
    expect(f.severity).toBe('error');
    expect(f.gapMin).toBe(-15);
    expect(f.resource).toEqual({ type: 'athlete', id: athleteId('Rowan Vale') });
    expect(f.message).toBe(
      'Rowan Vale races in Boys V8 at 9:00 and Boys 2V4+ at 9:10; the first boat is not back ' +
        'until 15 minutes after the second race starts.',
    );
  });

  it('8. convertible 4+/4- shell in a 4- event: no CLASS_MISMATCH; non-convertible: error', () => {
    const convertible = world()
      .shell('Alma', '4+', { rigging: 'convertible' })
      .entry({ id: 'a', cls: '4-', label: 'V4-', at: '09:00', shell: 'Alma' })
      .build();
    expect(ofCode(findConflicts(convertible), 'CLASS_MISMATCH')).toEqual([]);

    const fixed = world()
      .shell('Alma', '4+')
      .entry({ id: 'a', cls: '4-', label: 'V4-', at: '09:00', shell: 'Alma' })
      .build();
    const f = one(findConflicts(fixed), 'CLASS_MISMATCH');
    expect(f.severity).toBe('error');
    expect(f.message).toBe('Alma is a 4+ and cannot race as a 4- in Boys V4-.');
  });

  it('9. sweep oars on a 4x: RIGGING_MISMATCH', () => {
    const input = world()
      .oars('24-C', 'sweep', 8)
      .entry({ id: 'a', cls: '4x', label: 'V4x', at: '09:00', oars: '24-C' })
      .build();
    const f = one(findConflicts(input), 'RIGGING_MISMATCH');
    expect(f.severity).toBe('error');
    expect(f.resource).toEqual({ type: 'oar_set', id: 'oa_24-c' });
    expect(f.message).toBe('Oar set 24-C is sweep oars, but Boys V4x is a sculling boat.');
  });

  it('10. unavailable athlete seated: ATHLETE_UNAVAILABLE; per-day only fires on that day', () => {
    const regattaWide = world()
      .athlete('Rowan Vale')
      .availabilityFor('Rowan Vale', 'unavailable', undefined, 'college visit')
      .entry({ id: 'a', label: 'V8', at: '09:00', crew: { '3': 'Rowan Vale' } })
      .build();
    const f = one(findConflicts(regattaWide), 'ATHLETE_UNAVAILABLE');
    expect(f.severity).toBe('error');
    expect(f.message).toBe(
      'Rowan Vale is seated in Boys V8 but is unavailable for this regatta (college visit).',
    );

    const perDay = world()
      .athlete('Rowan Vale')
      .availabilityFor('Rowan Vale', 'available', { [DAY2]: 'unavailable' })
      .entry({ id: 'fri', label: 'V8', at: '09:00', day: DAY1, crew: { '3': 'Rowan Vale' } })
      .entry({ id: 'sat', label: 'V8', at: '09:00', day: DAY2, crew: { '3': 'Rowan Vale' } })
      .build();
    const hits = ofCode(findConflicts(perDay), 'ATHLETE_UNAVAILABLE');
    expect(hits.map((h) => h.entryIds)).toEqual([['sat']]);
    expect(hits[0]!.day).toBe(DAY2);
    expect(hits[0]!.message).toBe('Rowan Vale is seated in Boys V8 but is unavailable on May 17.');
  });

  it('11. acknowledged hot seat with matching fingerprint is info; a time change reopens it', () => {
    const input = twoOnMonahan('09:00', '09:45');
    const hot = one(findConflicts(input), 'SHELL_HOT_SEAT');
    const fp = hotSeatFingerprint(hot, input);
    expect(fp).toBe(
      `shell:sh_monahan|a@${input.events[0]!.scheduledAt}|b@${input.events[1]!.scheduledAt}`,
    );

    const acked = patchEntry(input, 'b', { hotSeatAckBy: 'u_coach', hotSeatFingerprint: fp });
    const after = one(findConflicts(acked), 'SHELL_HOT_SEAT');
    expect(after.acknowledged).toBe(true);
    expect(after.severity).toBe('info');
    expect(after.id).toBe(hot.id);

    const moved = retime(acked, 'a', '08:55');
    const reopened = one(findConflicts(moved), 'SHELL_HOT_SEAT');
    expect(reopened.acknowledged).toBe(false);
    expect(reopened.severity).toBe('warning');
    expect(reopened.id).toBe(hot.id);
  });

  it('12. multi-day: entries on different days never pair', () => {
    const input = world()
      .shell('Monahan', '8+')
      .athlete('Rowan Vale')
      .oars('24-C', 'sweep', 8)
      .entry({
        id: 'a',
        at: '23:50',
        day: DAY1,
        shell: 'Monahan',
        oars: '24-C',
        crew: { '1': 'Rowan Vale' },
      })
      .entry({
        id: 'b',
        at: '00:05',
        day: DAY2,
        shell: 'Monahan',
        oars: '24-C',
        crew: { '1': 'Rowan Vale' },
      })
      .build();
    const pairish = codes(findConflicts(input)).filter((c) =>
      /CONFLICT|HOT_SEAT|DOUBLE|TIGHT|RERIG/.test(c),
    );
    expect(pairish).toEqual([]);
  });

  it('13. unboatedAthletes excludes unavailable athletes and includes borrowed-out athletes', () => {
    const input = world()
      .athlete('Rowan Vale')
      .athlete('Emery Stone')
      .athlete('Quinn Marsh')
      .athlete('Jules Park', { status: 'inactive' })
      .athlete('Sky Hollis', { team: 'Girls' })
      .availabilityFor('Emery Stone', 'unavailable')
      .entry({ id: 'boys', label: 'V8', at: '09:00', crew: { '1': 'Rowan Vale' } })
      .entry({ id: 'girls', label: 'V8', team: 'Girls', at: '10:00', crew: { '1': 'Quinn Marsh' } })
      .build();
    const names = (list: ReturnType<typeof unboatedAthletes>) => list.map((a) => a.firstName);
    // Quinn is lent to the girls' boat but is still on the boys' roster and unboated for boys.
    expect(names(unboatedAthletes(input, 'tm_boys'))).toEqual(['Quinn']);
    // Counting every team's entries, Quinn is boated.
    expect(names(unboatedAthletes(input, 'tm_boys', { anyTeam: true }))).toEqual([]);
    expect(names(unboatedAthletes(input, 'tm_girls'))).toEqual(['Sky']);
  });

  it('14. convertible shell as 4+ then 4x+: re-rig time counts toward the gap', () => {
    const lundberg = (second: string) =>
      world()
        .shell('Lundberg', '4+', { rigging: 'convertible', compatibleClasses: ['4x+'] })
        .entry({ id: 'a', cls: '4+', label: 'N4+', at: '10:00', shell: 'Lundberg' })
        .entry({ id: 'b', cls: '4x+', label: 'U16 4x+', at: second, shell: 'Lundberg' })
        .build();

    const tight = findConflicts(lundberg('11:00'));
    const conflict = one(tight, 'SHELL_CONFLICT');
    expect(conflict.gapMin).toBe(5);
    expect(conflict.message).toBe(
      'Lundberg is used by Boys N4+ at 10:00 and also by Boys U16 4x+ at 11:00; only 5 minutes ' +
        'between the boat landing and the next race, counting 30 minutes to re-rig.',
    );
    const rerig = one(tight, 'RERIG_NEEDED');
    expect(rerig.severity).toBe('info');
    expect(rerig.message).toBe(
      'Lundberg is rigged as a 4+ for Boys N4+ at 10:00 and as a 4x+ for Boys U16 4x+ at 11:00; ' +
        'bring the second rigger set.',
    );

    const roomy = findConflicts(lundberg('11:30'));
    expect(one(roomy, 'SHELL_HOT_SEAT').gapMin).toBe(35);
    expect(ofCode(roomy, 'RERIG_NEEDED')).toHaveLength(1);
    expect(ofCode(roomy, 'CLASS_MISMATCH')).toEqual([]);
  });

  it('15. juniorAgeGroup and mastersCategory boundaries, with the season year', () => {
    expect(juniorAgeGroup(2011, 2025)).toBe('U15');
    expect(juniorAgeGroup(2010, 2025)).toBe('U16');
    expect(juniorAgeGroup(2009, 2025)).toBe('U17');
    expect(juniorAgeGroup(2008, 2025)).toBe('U19');
    expect(juniorAgeGroup(2007, 2025)).toBe('U19');
    expect(juniorAgeGroup(2006, 2025)).toBe('open');
    expect(juniorAgeGroup(2009, 2026)).toBe('U19');
    expect(mastersCategory(26.99)).toBe('AA');
    expect(mastersCategory(27)).toBe('A');
    expect(mastersCategory(42.5)).toBe('B');
    expect(mastersCategory(43)).toBe('C');

    const input = world({ seasonYear: 2026 })
      .athlete('Rowan Vale', { birthYear: 1980, side: 'port' })
      .athlete('Emery Stone', { birthYear: 1990, side: 'starboard' })
      .athlete('Quinn Marsh', { birthYear: 2012, canCox: true })
      .entry({
        id: 'a',
        cls: '2+',
        at: '09:00',
        crew: { '1': 'Emery Stone', '2': 'Rowan Vale', cox: 'Quinn Marsh' },
      })
      .build();
    const stats = entryStats(input.entries[0]!, input.seats, input.athletes, 2026);
    expect(stats).toEqual({
      avgAge: 41,
      mastersCategory: 'B',
      ageGroup: 'open',
      portCount: 1,
      starboardCount: 1,
    });
  });
});
