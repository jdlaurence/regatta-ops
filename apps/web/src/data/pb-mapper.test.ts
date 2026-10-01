import { describe, expect, it } from 'vitest';
import {
  camelToSnake,
  chunkQuery,
  fromPb,
  fromPbField,
  snakeToCamel,
  toPb,
  toPbField,
  toPbListParams,
} from './pb-mapper';
import type { Entry, EntrySeat, RegattaEvent, Shell, User } from '@regatta-ops/domain';

describe('field names', () => {
  it('converts case both ways', () => {
    expect(camelToSnake('hotSeatAckBy')).toBe('hot_seat_ack_by');
    expect(camelToSnake('weightKg')).toBe('weight_kg');
    expect(snakeToCamel('crew_weight_min_kg')).toBe('crewWeightMinKg');
  });

  it('drops Id from relation fields and keeps text ids', () => {
    expect(toPbField('entries', 'eventId')).toBe('event');
    expect(toPbField('entries', 'oarSetId')).toBe('oar_set');
    expect(toPbField('entries', 'hotSeatAckBy')).toBe('hot_seat_ack_by');
    expect(toPbField('entries', 'createdBy')).toBe('created_by');
    expect(toPbField('shells', 'homeTeamId')).toBe('home_team');
    expect(toPbField('users', 'defaultTeamId')).toBe('default_team');
    expect(toPbField('load_placements', 'loadPlanId')).toBe('load_plan');
    expect(toPbField('load_items', 'refId')).toBe('ref_id');
    expect(toPbField('comments', 'targetId')).toBe('target_id');
    expect(toPbField('comments', 'authorId')).toBe('author');
    expect(toPbField('events', 'teamFilter')).toBe('team_filter');
    expect(toPbField('users', 'avatarUrl')).toBe('avatar');
    expect(toPbField('entries', 'id')).toBe('id');
  });

  it('reverses every mapping', () => {
    expect(fromPbField('entries', 'event')).toBe('eventId');
    expect(fromPbField('entries', 'oar_set')).toBe('oarSetId');
    expect(fromPbField('activity_log', 'actor')).toBe('actorId');
    expect(fromPbField('activity_log', 'target_id')).toBe('targetId');
    expect(fromPbField('presence', 'user')).toBe('userId');
    expect(fromPbField('events', 'scheduled_at')).toBe('scheduledAt');
    expect(fromPbField('entries', 'created')).toBe('created');
  });
});

describe('records', () => {
  it('maps a PocketBase entry to the domain shape', () => {
    const raw = {
      id: 'k2j3h4g5f6d7s8a',
      collectionId: 'pbc_123',
      collectionName: 'entries',
      created: '2026-10-01 12:00:00.000Z',
      updated: '2026-10-01 12:30:00.000Z',
      regatta: 'r00000000000001',
      event: '',
      team: 't00000000000001',
      label: 'V8',
      boat_class: '8+',
      shell: 's00000000000001',
      oar_set: '',
      status: 'draft',
      coach: '',
      hot_seat_ack_by: '',
      seat_sides: null,
      created_by: 'u00000000000001',
      expand: {},
    };
    const entry = fromPb<Entry>('entries', raw);
    expect(entry).toEqual({
      id: 'k2j3h4g5f6d7s8a',
      created: '2026-10-01T12:00:00.000Z',
      updated: '2026-10-01T12:30:00.000Z',
      regattaId: 'r00000000000001',
      eventId: null,
      teamId: 't00000000000001',
      label: 'V8',
      boatClass: '8+',
      shellId: 's00000000000001',
      oarSetId: null,
      status: 'draft',
      coachId: null,
      hotSeatAckBy: null,
      seatSides: null,
      createdBy: 'u00000000000001',
    });
  });

  it('normalizes dates, optional selects, numbers, and json', () => {
    const ev = fromPb<RegattaEvent>('events', {
      id: 'e00000000000001',
      regatta: 'r00000000000001',
      day: '2026-11-01',
      scheduled_at: '2026-11-01 17:40:00.000Z',
      stage: '',
      boat_class: '',
      team_filter: [],
    });
    expect(ev.scheduledAt).toBe('2026-11-01T17:40:00.000Z');
    expect(ev.day).toBe('2026-11-01');
    expect(ev.stage).toBeNull();
    expect(ev.boatClass).toBeNull();
    expect(ev.teamFilter).toEqual([]);
    expect(fromPb<RegattaEvent>('events', { id: 'x', scheduled_at: '' }).scheduledAt).toBeNull();

    const shell = fromPb<Shell>('shells', {
      id: 's00000000000001',
      weight_kg: 0,
      year: 2019,
      stroke_side: '',
      compatible_classes: [],
      home_team: '',
    });
    expect(shell.weightKg).toBeNull();
    expect(shell.year).toBe(2019);
    expect(shell.strokeSide).toBeNull();
    expect(shell.homeTeamId).toBeNull();

    const user = fromPb<User>('users', { id: 'u', preferences: null, default_team: '' });
    expect(user.preferences).toEqual({});
    expect(user.defaultTeamId).toBeNull();
  });

  it('leaves JSON contents in camelCase', () => {
    const r = fromPb<{ settings: object }>('regattas', {
      id: 'r',
      settings: { launchLeadMin: 45 },
    });
    expect(r.settings).toEqual({ launchLeadMin: 45 });
    expect(toPb('regattas', { settings: { launchLeadMin: 45 } })).toEqual({
      settings: { launchLeadMin: 45 },
    });
  });

  it('writes nulls as PocketBase empties and skips server fields', () => {
    const body = toPb('entries', {
      id: 'k2j3h4g5f6d7s8a',
      eventId: null,
      shellId: 's00000000000001',
      label: 'V8',
      notes: undefined,
      created: '2026-10-01T12:00:00.000Z',
      updated: '2026-10-01T12:00:00.000Z',
    } satisfies Partial<Entry>);
    expect(body).toEqual({
      id: 'k2j3h4g5f6d7s8a',
      event: '',
      shell: 's00000000000001',
      label: 'V8',
    });
    expect(toPb('shells', { weightKg: null, strokeSide: null, photoUrl: 'x' })).toEqual({
      weight_kg: 0,
      stroke_side: '',
    });
    expect(toPb('events', { scheduledAt: null, day: '2026-11-01' })).toEqual({
      scheduled_at: '',
      day: '2026-11-01',
    });
  });
});

describe('list parameters', () => {
  it('builds a filter with placeholders and a sort', () => {
    const p = toPbListParams<Entry>('entries', {
      where: { regattaId: 'r00000000000001', eventId: null },
      in: { teamId: ['t1', 't2'] },
      sort: ['label', '-updated'],
    });
    expect(p).toEqual({
      filter: 'regatta = {:p0} && event = {:p1} && (team = {:p2} || team = {:p3})',
      params: { p0: 'r00000000000001', p1: '', p2: 't1', p3: 't2' },
      sort: 'label,-updated',
    });
  });

  it('uses any-of for multi relations and returns null for an empty in list', () => {
    expect(
      toPbListParams<RegattaEvent>('events', { where: { teamFilter: 't1' as never } }),
    ).toMatchObject({
      filter: 'team_filter ?= {:p0}',
    });
    expect(toPbListParams<EntrySeat>('entry_seats', { in: { entryId: [] } })).toBeNull();
    expect(toPbListParams('teams')).toEqual({ filter: '', params: {}, sort: '' });
  });

  it('chunks long in lists', () => {
    const ids = Array.from({ length: 95 }, (_, i) => `id${i}`);
    const chunks = chunkQuery<EntrySeat>({ in: { entryId: ids }, sort: 'seat' }, 40);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.in!.entryId!.length)).toEqual([40, 40, 15]);
    expect(chunks[0]!.sort).toBe('seat');
    expect(chunkQuery<EntrySeat>({ in: { entryId: ['a'] } })).toHaveLength(1);
    expect(chunkQuery<EntrySeat>(undefined)).toEqual([{}]);
  });
});
