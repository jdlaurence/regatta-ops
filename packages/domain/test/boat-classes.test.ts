import { describe, expect, it } from 'vitest';
import {
  BOAT_CLASSES,
  boatClassSpec,
  defaultRiggerCount,
  isCompatible,
  juniorAgeGroup,
  mastersCategory,
  parseBoatClass,
  seatSide,
  seatsFor,
  shellClasses,
  shellFits,
  starboardRigSides,
} from '../src';

describe('seatsFor', () => {
  it('lists bow to stroke then cox', () => {
    expect(seatsFor('4+')).toEqual(['1', '2', '3', '4', 'cox']);
    expect(seatsFor('8+')).toHaveLength(9);
    expect(seatsFor('1x')).toEqual(['1']);
    expect(seatsFor('4x')).toEqual(['1', '2', '3', '4']);
  });
  it('covers every class', () => {
    for (const c of BOAT_CLASSES) expect(seatsFor(c).length).toBeGreaterThan(0);
  });
});

describe('seatSide', () => {
  it('uses the standard rig: even port, odd starboard, stroke of an eight is port', () => {
    expect(seatSide('8+', '8')).toBe('port');
    expect(seatSide('8+', '1')).toBe('starboard');
    expect(seatSide('4-', '2')).toBe('port');
  });
  it('returns null for sculling seats and the cox', () => {
    expect(seatSide('4x', '1')).toBeNull();
    expect(seatSide('8+', 'cox')).toBeNull();
  });
  it('honors overrides', () => {
    expect(seatSide('8+', '8', { '8': 'starboard' })).toBe('starboard');
    expect(seatSide('4+', '4', starboardRigSides('4+'))).toBe('starboard');
  });
});

describe('isCompatible', () => {
  it('own class always fits', () => {
    expect(isCompatible(['8+'], '8+')).toBe(true);
  });
  it('4+ and 4- swap only when convertible', () => {
    expect(isCompatible(['4+'], '4-')).toBe(false);
    expect(isCompatible(['4+'], '4-', true)).toBe(true);
    expect(isCompatible(['4x'], '4x+', true)).toBe(true);
    expect(isCompatible(['4x'], '4+', true)).toBe(false);
  });
  it('shellClasses uses explicit lists first', () => {
    expect(shellClasses({ boatClass: '4x', compatibleClasses: ['4-'] })).toEqual(['4x', '4-']);
    expect(
      shellClasses({ boatClass: '4+', compatibleClasses: [], rigging: 'convertible' }),
    ).toEqual(['4+', '4-']);
    expect(shellFits({ boatClass: '8+', compatibleClasses: [] }, '4+')).toBe(false);
  });
});

describe('specs', () => {
  it('oars needed', () => {
    expect(boatClassSpec('4x').oarsNeeded).toBe(8);
    expect(boatClassSpec('8+').oarsNeeded).toBe(8);
    expect(boatClassSpec('1x').oarsNeeded).toBe(2);
  });
  it('rigger counts: side vs wing', () => {
    expect(defaultRiggerCount('8+', 'side')).toBe(8);
    expect(defaultRiggerCount('8+', 'wing')).toBe(4);
    expect(defaultRiggerCount('1x', 'wing')).toBe(1);
    expect(defaultRiggerCount('4x', 'none')).toBe(0);
  });
});

describe('juniorAgeGroup', () => {
  it('matches the club fall sheet for 2026', () => {
    expect(juniorAgeGroup(2009, 2026)).toBe('U19');
    expect(juniorAgeGroup(2010, 2026)).toBe('U17');
    expect(juniorAgeGroup(2011, 2026)).toBe('U16');
    expect(juniorAgeGroup(2012, 2026)).toBe('U15');
    expect(juniorAgeGroup(2013, 2026)).toBe('U15');
    expect(juniorAgeGroup(2008, 2026)).toBe('U19');
    expect(juniorAgeGroup(2007, 2026)).toBe('open');
  });
  it('depends on the season year', () => {
    expect(juniorAgeGroup(2010, 2025)).toBe('U16');
  });
});

describe('mastersCategory', () => {
  it('bands', () => {
    expect(mastersCategory(21)).toBe('AA');
    expect(mastersCategory(26.9)).toBe('AA');
    expect(mastersCategory(27)).toBe('A');
    expect(mastersCategory(35.99)).toBe('A');
    expect(mastersCategory(36)).toBe('B');
    expect(mastersCategory(43)).toBe('C');
    expect(mastersCategory(50)).toBe('D');
    expect(mastersCategory(55)).toBe('E');
    expect(mastersCategory(60)).toBe('F');
    expect(mastersCategory(65)).toBe('G');
    expect(mastersCategory(70)).toBe('H');
    expect(mastersCategory(75)).toBe('I');
    expect(mastersCategory(80)).toBe('J');
    expect(mastersCategory(85)).toBe('K');
    expect(mastersCategory(99)).toBe('K');
  });
});

describe('parseBoatClass', () => {
  it.each([
    ['4+', '4+'],
    ['4x+', '4x+'],
    ['Coxed Four', '4+'],
    ['V8', '8+'],
    ['JV4+', '4+'],
    ['1x', '1x'],
    ["U17 Men's 8+ A", '8+'],
    ["2V Men's 4+", '4+'],
    ['Quad', '4x'],
    ['Coxed Quad', '4x+'],
    ['Double', '2x'],
    ['Single', '1x'],
    ['Pair', '2-'],
    ['Straight four', '4-'],
    ["Women's Eight", '8+'],
    ['4-', '4-'],
  ])('%s → %s', (text, cls) => {
    expect(parseBoatClass(text)).toBe(cls);
  });
  it('returns null when nothing matches', () => {
    expect(parseBoatClass('Lunch')).toBeNull();
  });
});
