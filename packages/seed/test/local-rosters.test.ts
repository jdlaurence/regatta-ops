// The roster workbook reader (src/local-rosters.ts) on synthetic workbooks shaped like the club's.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseNameCell, readLocalRosters } from '../src/local-rosters';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'regatta-ops-rosters-'));

  const boys = new ExcelJS.Workbook();
  boys.addWorksheet('Week 2');
  const ages = boys.addWorksheet('Age Groups');
  ages.getRow(1).getCell(1).value = 'FALL AGE GROUPS';
  ages.getRow(2).values = ['U19', '2 rowers/1 cox', null, 'U15', '1 rower'];
  ages.getRow(3).values = ['Alpha Test (cox)', 2008, null, 'Delta Test', 2012];
  ages.getRow(4).values = ['Bravo (Bee) Test', 2009, null, 'Echo Van Test', 2013];
  ages.getRow(5).values = ['Charlie Test (cox', 2009];
  ages.getCell('D4').font = { bold: true };
  await boys.xlsx.writeFile(join(dir, 'Jr. Boys 26-27 _ Roster.xlsx'));

  const girls = new ExcelJS.Workbook();
  const sheet = girls.addWorksheet('Fa26 Roster');
  sheet.getRow(2).values = [null, 'First Name', 'Last Name', 'Exp/Nov', 'DOB', 'Grade', 'Role'];
  sheet.getRow(3).values = [
    1,
    'Foxtrot',
    'Test',
    'Exp ',
    new Date(Date.UTC(2008, 4, 1)),
    '12th',
    'cox',
  ];
  sheet.getRow(4).values = [
    2,
    'Golf (G)',
    'Test-Two',
    'Nov',
    new Date(Date.UTC(2012, 0, 9)),
    '9th',
  ];
  await girls.xlsx.writeFile(join(dir, 'Fa26 SRA Girls Team Roster.xlsx'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parseNameCell', () => {
  it('reads coxswains and nicknames', () => {
    expect(parseNameCell('Alpha Test (cox)')).toEqual({ name: 'Alpha Test', cox: true });
    expect(parseNameCell('Alpha Test cox')).toEqual({ name: 'Alpha Test', cox: true });
    expect(parseNameCell('Bravo (Bee) Test')).toEqual({
      name: 'Bravo Test',
      preferredName: 'Bee',
      cox: false,
    });
  });
});

describe('readLocalRosters', () => {
  it('reads both teams from the workbooks in the folder', async () => {
    const rosters = await readLocalRosters(dir);
    const boys = rosters.find((r) => r.team === 'boys')!.athletes;
    expect(boys).toEqual([
      {
        team: 'boys',
        firstName: 'Alpha',
        lastName: 'Test',
        birthYear: 2008,
        level: 'experienced',
        cox: true,
      },
      {
        team: 'boys',
        firstName: 'Delta',
        lastName: 'Test',
        birthYear: 2012,
        level: 'experienced',
        cox: false,
      },
      {
        team: 'boys',
        firstName: 'Bravo',
        lastName: 'Test',
        preferredName: 'Bee',
        birthYear: 2009,
        level: 'experienced',
        cox: false,
      },
      {
        team: 'boys',
        firstName: 'Echo',
        lastName: 'Van Test',
        birthYear: 2013,
        level: 'novice',
        cox: false,
      },
      {
        team: 'boys',
        firstName: 'Charlie',
        lastName: 'Test',
        birthYear: 2009,
        level: 'experienced',
        cox: true,
      },
    ]);
    const girls = rosters.find((r) => r.team === 'girls')!.athletes;
    expect(girls).toEqual([
      {
        team: 'girls',
        firstName: 'Foxtrot',
        lastName: 'Test',
        birthYear: 2008,
        gradYear: 2027,
        level: 'experienced',
        cox: true,
      },
      {
        team: 'girls',
        firstName: 'Golf',
        lastName: 'Test-Two',
        preferredName: 'G',
        birthYear: 2012,
        gradYear: 2030,
        level: 'novice',
        cox: false,
      },
    ]);
  });

  it('is empty with no workbooks or with REGATTA_OPS_SEED_INVENTED', async () => {
    expect(await readLocalRosters(join(dir, 'missing'))).toEqual([]);
    process.env.REGATTA_OPS_SEED_INVENTED = '1';
    try {
      expect(await readLocalRosters(dir)).toEqual([]);
    } finally {
      delete process.env.REGATTA_OPS_SEED_INVENTED;
    }
  });
});
