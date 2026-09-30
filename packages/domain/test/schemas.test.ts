// Zod schemas: records shaped like the stub seed world parse (built inline; nothing is
// imported from @srt/seed), bad input is rejected with readable messages, and every
// collection has a schema. Type drift is caught at compile time in schemas/entities.ts.

import { describe, expect, it } from 'vitest';
import {
  COLLECTION_NAMES,
  DEFAULT_CLUB_SETTINGS,
  SRA_DEFAULT_RULES,
  THREE_WIDE_EXAMPLE_RULE,
  athleteInputSchema,
  athleteSchema,
  availabilitySchema,
  clubSettingsSchema,
  collectionSchemas,
  entrySchema,
  entrySeatSchema,
  loadPlacementSchema,
  oarSetSchema,
  regattaEventInputSchema,
  regattaEventSchema,
  regattaInputSchema,
  regattaSchema,
  regattaTeamSchema,
  ruleSchema,
  shellInputSchema,
  shellSchema,
  stableId,
  teamSchema,
  trailerSchema,
  userSchema,
  zonedToInstant,
  type Athlete,
  type Entry,
  type Regatta,
  type Shell,
} from '../src';

const id = stableId;
const boys = id('team:boys');
const regattaId = id('regatta:stub');

const team = {
  id: boys,
  name: 'Junior boys',
  shortName: 'Boys',
  program: 'juniors',
  colorKey: 'navy',
  sortOrder: 1,
  archived: false,
} as const;

const athlete: Athlete = {
  id: id('athlete:stub:0'),
  teamId: boys,
  firstName: 'Rowan',
  lastName: 'Test',
  side: 'port',
  canScull: true,
  canCox: false,
  birthYear: 2009,
  level: 'experienced',
  status: 'active',
};

const shell: Shell = {
  id: id('shell:Spencer'),
  name: 'Spencer',
  boatClass: '4+',
  compatibleClasses: [],
  rigging: 'sweep',
  riggerType: 'side',
  riggerCount: 4,
  genderAffinity: 'men',
  homeTeamId: boys,
  status: 'in_service',
  isPrivate: false,
};

const regatta: Regatta = {
  id: regattaId,
  name: 'Stub regatta',
  venue: 'Lake Sammamish',
  city: 'Redmond, WA',
  startDate: '2026-11-01',
  endDate: '2026-11-01',
  timezone: 'America/Los_Angeles',
  format: 'sprint',
  status: 'planning',
  settings: {},
  createdBy: id('user:admin'),
};

const entry: Entry = {
  id: id('entry:stub:1'),
  regattaId,
  eventId: id('event:stub:1'),
  teamId: boys,
  label: 'V4+',
  boatClass: '4+',
  shellId: shell.id,
  oarSetId: id('oars:24-C'),
  status: 'planned',
};

describe('seed-shaped records parse', () => {
  it('parses team, athlete, shell, oar set, regatta, event, entry, seat, trailer, settings, user', () => {
    expect(teamSchema.parse(team)).toEqual(team);
    expect(athleteSchema.parse(athlete)).toEqual(athlete);
    expect(shellSchema.parse(shell)).toEqual(shell);
    expect(
      oarSetSchema.parse({
        id: id('oars:24-C'),
        name: '24-C',
        type: 'sweep',
        color: 'yellow-white',
        count: 8,
        genderAffinity: 'men',
        homeTeamId: boys,
        status: 'in_service',
      }).count,
    ).toBe(8);
    expect(regattaSchema.parse(regatta)).toEqual(regatta);
    expect(
      regattaTeamSchema.parse({ id: id('rt:stub:boys'), regattaId, teamId: boys }).teamId,
    ).toBe(boys);
    expect(
      regattaEventSchema.parse({
        id: id('event:stub:1'),
        regattaId,
        kind: 'race',
        eventNumber: '1',
        name: "Men's Junior 4+",
        boatClass: '4+',
        day: '2026-11-01',
        scheduledAt: zonedToInstant('2026-11-01', '09:40', 'America/Los_Angeles'),
        stage: 'race',
        sortOrder: 1,
      }).scheduledAt,
    ).toBe('2026-11-01T17:40:00.000Z');
    expect(entrySchema.parse(entry)).toEqual(entry);
    expect(
      entrySeatSchema.parse({
        id: id('seat:stub:1'),
        entryId: entry.id,
        seat: '1',
        athleteId: athlete.id,
      }).seat,
    ).toBe('1');
    expect(
      trailerSchema.parse({
        id: id('trailer:boys'),
        name: 'Boys trailer',
        style: 'offset_post',
        frameLengthCm: 1220,
        widthCm: 240,
        postOffsetPct: 33,
        bowForwardDefault: false,
        defaultRules: SRA_DEFAULT_RULES,
      }).defaultRules,
    ).toHaveLength(SRA_DEFAULT_RULES.length);
    expect(clubSettingsSchema.parse({ id: id('club'), ...DEFAULT_CLUB_SETTINGS }).weightUnit).toBe(
      'lb',
    );
    expect(
      userSchema.parse({
        id: id('user:admin'),
        name: 'Alex Admin',
        email: 'admin@srt.local',
        role: 'admin',
        preferences: {},
      }).role,
    ).toBe('admin');
  });

  it('accepts PocketBase-style instants, per-day availability, seat overrides, and reasons', () => {
    expect(
      availabilitySchema.parse({
        id: 'av1',
        regattaId,
        athleteId: athlete.id,
        status: 'available',
        days: { '2025-05-17': 'unavailable' },
        created: '2025-05-01 10:00:00.000Z',
      }).days,
    ).toEqual({ '2025-05-17': 'unavailable' });
    expect(entrySchema.parse({ ...entry, seatSides: { '4': 'starboard' } }).seatSides).toEqual({
      '4': 'starboard',
    });
    expect(
      loadPlacementSchema.parse({
        id: 'lp1',
        loadPlanId: 'plan',
        shellId: shell.id,
        shelfId: 'r3',
        lane: 1,
        offsetCm: -250,
        bowForward: false,
        locked: true,
        reasons: [{ ruleId: 'r_fit', text: 'Fits with 15 cm to spare.', hard: true, score: 1 }],
      }).reasons,
    ).toHaveLength(1);
  });
});

describe('rules', () => {
  it('parses every default rule and the three-wide example', () => {
    for (const r of [...SRA_DEFAULT_RULES, THREE_WIDE_EXAMPLE_RULE]) {
      expect(ruleSchema.parse(r)).toEqual(r);
    }
  });
  it('rejects unknown types, bad weights, and stray params', () => {
    const fit = SRA_DEFAULT_RULES[0]!;
    expect(ruleSchema.safeParse({ ...fit, type: 'teleport' }).success).toBe(false);
    expect(ruleSchema.safeParse({ ...fit, weight: 4 }).success).toBe(false);
    expect(
      ruleSchema.safeParse({ ...SRA_DEFAULT_RULES[3]!, params: { anything: 1 } }).success,
    ).toBe(false);
    expect(ruleSchema.safeParse({ ...fit, params: { clearanceCm: -1, gapCm: 30 } }).success).toBe(
      false,
    );
  });
});

describe('validation messages', () => {
  const messageFor = (
    r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } },
    path: string,
  ) => r.error?.issues.find((i) => i.path.join('.') === path)?.message;

  it('rejects bad enums, days, and blanks with sentence-case messages', () => {
    const bad = athleteSchema.safeParse({ ...athlete, firstName: '  ', birthdate: '2009-13-45' });
    expect(bad.success).toBe(false);
    expect(messageFor(bad, 'firstName')).toBe('Enter a first name');
    expect(messageFor(bad, 'birthdate')).toBe('Enter a real date');
    const cls = shellSchema.safeParse({ ...shell, boatClass: '6+' });
    expect(messageFor(cls, 'boatClass')).toBe('Choose a boat class');
    expect(teamSchema.safeParse({ ...team, shortName: 'A very long short name' }).success).toBe(
      false,
    );
    expect(
      userSchema.safeParse({ id: 'u', name: 'X', email: 'nope', role: 'coach', preferences: {} })
        .success,
    ).toBe(false);
  });

  it('input schemas drop id and check cross-field rules', () => {
    const { id: _id, ...fields } = athlete;
    expect(athleteInputSchema.parse(fields)).toEqual(fields);
    expect('id' in athleteInputSchema.shape).toBe(false);

    const { id: _rid, ...r } = regatta;
    expect(regattaInputSchema.safeParse(r).success).toBe(true);
    const backwards = regattaInputSchema.safeParse({ ...r, endDate: '2026-10-31' });
    expect(messageFor(backwards, 'endDate')).toBe('Choose an end date on or after the start date');

    const race = { regattaId, kind: 'race', name: 'Race', day: '2026-11-01', sortOrder: 1 };
    expect(messageFor(regattaEventInputSchema.safeParse(race), 'boatClass')).toBe(
      'Choose a boat class for a race',
    );
    expect(regattaEventInputSchema.safeParse({ ...race, kind: 'logistics' }).success).toBe(true);

    const { id: _sid, ...s } = shell;
    expect(
      shellInputSchema.safeParse({ ...s, crewWeightMinKg: 90, crewWeightMaxKg: 80 }).success,
    ).toBe(false);
    expect(
      shellInputSchema.safeParse({ ...s, crewWeightMinKg: 75, crewWeightMaxKg: 91 }).success,
    ).toBe(true);
  });
});

describe('collectionSchemas', () => {
  it('has a schema for every collection', () => {
    for (const name of COLLECTION_NAMES) expect(collectionSchemas[name]).toBeDefined();
    expect(collectionSchemas.teams.parse(team)).toEqual(team);
  });
});
