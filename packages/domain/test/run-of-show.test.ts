import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMING, effectiveSettings, runOfShowTimes, strokeSide } from '../src';

const RACE = '2026-10-04T17:00:00.000Z';

describe('runOfShowTimes', () => {
  it('suggests launch, boat meeting, and warm-up in a chain back from the race', () => {
    const t = runOfShowTimes(RACE, {}, DEFAULT_TIMING)!;
    expect(t.launch).toEqual({ at: '2026-10-04T16:20:00.000Z', typed: false });
    expect(t.boatMeeting).toEqual({ at: '2026-10-04T16:05:00.000Z', typed: false });
    expect(t.warmUp).toEqual({ at: '2026-10-04T15:35:00.000Z', typed: false });
  });

  it('keeps typed times as minutes before the race and chains suggestions off them', () => {
    const t = runOfShowTimes(RACE, { launchBeforeRaceMin: 60 }, DEFAULT_TIMING)!;
    expect(t.launch).toEqual({ at: '2026-10-04T16:00:00.000Z', typed: true });
    expect(t.boatMeeting).toEqual({ at: '2026-10-04T15:45:00.000Z', typed: false });

    const moved = runOfShowTimes(
      '2026-10-04T17:20:00.000Z',
      { launchBeforeRaceMin: 60, boatMeetingBeforeRaceMin: 90, warmUpBeforeRaceMin: 120 },
      DEFAULT_TIMING,
    )!;
    expect(moved.launch.at).toBe('2026-10-04T16:20:00.000Z');
    expect(moved.boatMeeting).toEqual({ at: '2026-10-04T15:50:00.000Z', typed: true });
    expect(moved.warmUp).toEqual({ at: '2026-10-04T15:20:00.000Z', typed: true });
  });

  it('has nothing to suggest before the race has a time', () => {
    expect(runOfShowTimes(null, {}, DEFAULT_TIMING)).toBeNull();
  });

  it('fills settings a stored club record lacks from the defaults', () => {
    const club = {
      timingDefaults: { launchLeadMin: 50 } as typeof DEFAULT_TIMING,
      headRaceDurationMin: 20,
    };
    const s = effectiveSettings({ format: 'sprint', settings: {} }, club);
    expect(s.launchLeadMin).toBe(50);
    expect(s.boatMeetingLeadMin).toBe(DEFAULT_TIMING.boatMeetingLeadMin);
  });
});

describe('strokeSide', () => {
  it('follows the shell rig, then the entry override', () => {
    expect(strokeSide({ boatClass: '8+' })).toBe('port');
    expect(strokeSide({ boatClass: '4+' }, { strokeSide: 'starboard' })).toBe('starboard');
    expect(strokeSide({ boatClass: '4+', seatSides: { '4': 'starboard' } })).toBe('starboard');
  });

  it('is null for sculling boats', () => {
    expect(strokeSide({ boatClass: '4x' })).toBeNull();
    expect(strokeSide({ boatClass: '1x' })).toBeNull();
  });
});
