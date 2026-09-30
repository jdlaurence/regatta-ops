import { describe, expect, it } from 'vitest';
import {
  athleteName,
  athleteShortName,
  effectiveSettings,
  formatWeight,
  hash32,
  oarSetLabel,
  parseCsvObjects,
  parseDelimited,
  parseWeightClassLabel,
  shellFullLabel,
  shellLabel,
  stableId,
  toCsv,
  detectDelimiter,
  SRA_BOYS_TRAILER,
  SRA_GIRLS_TRAILER,
  boatClassSpec,
} from '../src';

describe('ids', () => {
  it('stableId is 15 lowercase alphanumerics and deterministic', () => {
    const a = stableId('shell:Peggy');
    expect(a).toMatch(/^[a-z0-9]{15}$/);
    expect(stableId('shell:Peggy')).toBe(a);
    expect(stableId('shell:Waltar')).not.toBe(a);
    expect(hash32('x')).toHaveLength(8);
  });
});

describe('csv', () => {
  it('parses quotes and CRLF', () => {
    expect(parseDelimited('a,"b,c","d ""q"""\r\n1,2,3\n')).toEqual([
      ['a', 'b,c', 'd "q"'],
      ['1', '2', '3'],
    ]);
  });
  it('detects tabs', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a,b')).toBe(',');
  });
  it('parses objects and writes csv', () => {
    expect(parseCsvObjects('name,count\nBlue, 8\n')).toEqual([{ name: 'Blue', count: '8' }]);
    expect(toCsv(['a', 'b'], [['x,y', 1]])).toBe('a,b\n"x,y",1\n');
  });
});

describe('format', () => {
  it('names', () => {
    expect(athleteName({ firstName: 'Ava', lastName: 'Chen' })).toBe('Ava Chen');
    expect(athleteName({ firstName: 'Avery', lastName: 'Chen', preferredName: 'AJ' })).toBe(
      'AJ Chen',
    );
    expect(athleteShortName({ firstName: 'Ava', lastName: 'Chen' })).toBe('Ava C.');
    expect(shellLabel({ name: 'Live.Laugh.Love', nickname: 'LLL' })).toBe('LLL');
    expect(shellFullLabel({ name: 'Live.Laugh.Love', nickname: 'LLL' })).toBe(
      'Live.Laugh.Love (LLL)',
    );
    expect(shellFullLabel({ name: 'Waltar' })).toBe('Waltar');
    expect(oarSetLabel({ name: '24-C', color: 'yellow-white' })).toBe('24-C · yellow-white');
  });
  it('weights', () => {
    expect(formatWeight(80, 'lb')).toBe('176 lb');
    expect(formatWeight(80, 'kg')).toBe('80 kg');
    expect(formatWeight(null, 'kg')).toBe('');
    const r = parseWeightClassLabel('165-200');
    expect(Math.round(r.minKg!)).toBe(75);
    expect(Math.round(r.maxKg!)).toBe(91);
    expect(parseWeightClassLabel('<240').minKg).toBeNull();
    expect(Math.round(parseWeightClassLabel('LWT').maxKg!)).toBe(73);
    expect(parseWeightClassLabel('')).toEqual({ minKg: null, maxKg: null });
  });
});

describe('settings', () => {
  it('overlays overrides on defaults and head format', () => {
    expect(effectiveSettings({ format: 'sprint', settings: {} }).launchLeadMin).toBe(40);
    expect(effectiveSettings({ format: 'head', settings: {} }).raceDurationMin).toBe(20);
    expect(effectiveSettings({ format: 'sprint', settings: { returnMin: 20 } }).returnMin).toBe(20);
  });
});

describe('SRA trailers', () => {
  it('have five levels of one narrow and one wide shelf', () => {
    for (const t of [SRA_BOYS_TRAILER, SRA_GIRLS_TRAILER]) {
      expect(t.shelves).toHaveLength(10);
      expect(t.shelves.filter((s) => s.laneAccess === 'outer_first')).toHaveLength(5);
    }
  });
  it('top levels are long enough for an eight', () => {
    const eight = boatClassSpec('8+').defaultLengthCm;
    for (const t of [SRA_BOYS_TRAILER, SRA_GIRLS_TRAILER]) {
      const top = t.shelves.filter((s) => s.tier >= 4);
      for (const s of top) {
        expect(s.lengthCm + s.frontOverhangMaxCm + s.rearOverhangMaxCm).toBeGreaterThanOrEqual(
          eight,
        );
      }
    }
  });
});
