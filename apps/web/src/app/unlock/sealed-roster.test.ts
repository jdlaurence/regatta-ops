import { describe, expect, it } from 'vitest';
import type { RosterAthlete } from '@regatta-ops/seed';
import {
  deriveKey,
  openRoster,
  openWithRememberedKey,
  rememberKey,
  sealRoster,
  shortenLastNames,
} from './sealed-roster';

const athlete = (
  firstName: string,
  lastName: string,
  team: RosterAthlete['team'] = 'girls',
): RosterAthlete => ({
  team,
  firstName,
  lastName,
  birthYear: 2010,
  level: 'experienced',
  cox: false,
});

// Few rounds, to keep the tests quick; the file records them.
const ROUNDS = 1_000;

describe('shortenLastNames', () => {
  it('keeps one letter when the first name is unique', () => {
    expect(shortenLastNames([athlete('Wren', 'Halvorsen')]).map((a) => a.lastName)).toEqual(['H.']);
  });

  it('adds letters until teammates with the same first name differ', () => {
    const out = shortenLastNames([
      athlete('Avery', 'Rosgaard'),
      athlete('Avery', 'Rudvik'),
      athlete('Avery', 'Tamsin'),
    ]);
    expect(out.map((a) => a.lastName)).toEqual(['Ro.', 'Ru.', 'T.']);
  });

  it('does not count athletes on the other team', () => {
    const out = shortenLastNames([
      athlete('Avery', 'Rosgaard'),
      athlete('Avery', 'Rudvik', 'boys'),
    ]);
    expect(out.map((a) => a.lastName)).toEqual(['R.', 'R.']);
  });

  it('keeps a whole last name that is a prefix of another', () => {
    const out = shortenLastNames([athlete('Avery', 'Li'), athlete('Avery', 'Lindqvist')]);
    expect(out.map((a) => a.lastName)).toEqual(['Li', 'Lin.']);
  });
});

describe('sealRoster', () => {
  const roster = [athlete('Wren', 'H.'), athlete('Avery', 'Ro.', 'boys')];

  it('opens with the password it was sealed with', async () => {
    const sealed = await sealRoster(roster, 'harbor-oarlock', ROUNDS);
    expect(sealed.data).not.toContain('Wren');
    expect(await openRoster(sealed, await deriveKey('harbor-oarlock', sealed))).toEqual(roster);
  });

  it('rejects another password', async () => {
    const sealed = await sealRoster(roster, 'harbor-oarlock', ROUNDS);
    await expect(openRoster(sealed, await deriveKey('harbor-oarlocks', sealed))).rejects.toThrow();
  });

  it('opens with the remembered key until it is sealed again', async () => {
    const sealed = await sealRoster(roster, 'harbor-oarlock', ROUNDS);
    expect(await openWithRememberedKey(sealed)).toBeNull();
    await rememberKey(await deriveKey('harbor-oarlock', sealed));
    expect(await openWithRememberedKey(sealed)).toEqual(roster);
    const resealed = await sealRoster(roster, 'harbor-oarlock', ROUNDS);
    expect(await openWithRememberedKey(resealed)).toBeNull();
  });
});
