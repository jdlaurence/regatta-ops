import { describe, expect, it } from 'vitest';
import {
  camelToSnake,
  dependencyOrder,
  fieldFor,
  toPbRecord,
  type PbCollectionSchema,
} from '../seed/mapping';

const entries: PbCollectionSchema = {
  id: 'srt_entries',
  name: 'entries',
  type: 'base',
  fields: [
    { name: 'id', type: 'text' },
    { name: 'regatta', type: 'relation', maxSelect: 1, collectionId: 'srt_regattas' },
    { name: 'event', type: 'relation', maxSelect: 1, collectionId: 'srt_events' },
    { name: 'oar_set', type: 'relation', maxSelect: 1, collectionId: 'srt_oar_sets' },
    { name: 'hot_seat_ack_by', type: 'relation', maxSelect: 1, collectionId: '_pb_users_auth_' },
    { name: 'boat_class', type: 'select', maxSelect: 1 },
    { name: 'seat_sides', type: 'json' },
    { name: 'label', type: 'text' },
    { name: 'created', type: 'autodate' },
  ],
};

const events: PbCollectionSchema = {
  id: 'srt_events',
  name: 'events',
  type: 'base',
  fields: [
    { name: 'regatta', type: 'relation', maxSelect: 1, collectionId: 'srt_regattas' },
    { name: 'team_filter', type: 'relation', maxSelect: 999, collectionId: 'srt_teams' },
    { name: 'scheduled_at', type: 'date' },
    { name: 'sort_order', type: 'number' },
  ],
};

const shells: PbCollectionSchema = {
  id: 'srt_shells',
  name: 'shells',
  type: 'base',
  fields: [
    { name: 'compatible_classes', type: 'select', maxSelect: 9 },
    { name: 'is_private', type: 'bool' },
    { name: 'photo', type: 'file', maxSelect: 1 },
    { name: 'year', type: 'number' },
  ],
};

describe('camelToSnake', () => {
  it('converts domain keys', () => {
    expect(camelToSnake('oarSetId')).toBe('oar_set_id');
    expect(camelToSnake('hotSeatAckBy')).toBe('hot_seat_ack_by');
    expect(camelToSnake('name')).toBe('name');
  });
});

describe('fieldFor', () => {
  it('drops Id for relations only', () => {
    expect(fieldFor(entries, 'eventId')?.name).toBe('event');
    expect(fieldFor(entries, 'oarSetId')?.name).toBe('oar_set');
    expect(fieldFor(entries, 'hotSeatAckBy')?.name).toBe('hot_seat_ack_by');
    expect(fieldFor(entries, 'labelId')).toBeUndefined();
  });

  it('maps Url keys to file fields', () => {
    expect(fieldFor(shells, 'photoUrl')?.type).toBe('file');
  });
});

describe('toPbRecord', () => {
  it('maps keys and fills empty values the way PocketBase stores them', () => {
    const { data, unknown } = toPbRecord(entries, {
      id: 'abc123abc123abc',
      regattaId: 'r',
      eventId: null,
      oarSetId: undefined,
      boatClass: '4+',
      seatSides: { '1': 'port' },
      label: 'V4+',
      created: '2026-01-01T00:00:00.000Z',
      extra: 1,
    });
    expect(data).toEqual({
      id: 'abc123abc123abc',
      regatta: 'r',
      event: '',
      oar_set: '',
      boat_class: '4+',
      seat_sides: { '1': 'port' },
      label: 'V4+',
    });
    expect(unknown).toEqual(['extra']);
  });

  it('handles multi relations, dates, and numbers', () => {
    expect(
      toPbRecord(events, {
        regattaId: 'r',
        teamFilter: undefined,
        scheduledAt: null,
        sortOrder: null,
      }).data,
    ).toEqual({ regatta: 'r', team_filter: [], scheduled_at: '', sort_order: 0 });
    expect(toPbRecord(events, { teamFilter: ['a', 'b'] }).data).toEqual({
      team_filter: ['a', 'b'],
    });
  });

  it('skips files and fills bools and multi selects', () => {
    expect(
      toPbRecord(shells, {
        photoUrl: 'x.jpg',
        compatibleClasses: null,
        isPrivate: undefined,
        year: 2019,
      }),
    ).toEqual({ data: { compatible_classes: [], is_private: false, year: 2019 }, unknown: [] });
  });
});

describe('dependencyOrder', () => {
  it('puts relation targets first and ignores collections not asked for', () => {
    const regattas: PbCollectionSchema = {
      id: 'srt_regattas',
      name: 'regattas',
      type: 'base',
      fields: [],
    };
    const order = dependencyOrder(
      [entries, events, regattas, shells],
      ['entries', 'events', 'regattas'],
    );
    expect(order.indexOf('regattas')).toBeLessThan(order.indexOf('events'));
    expect(order.indexOf('events')).toBeLessThan(order.indexOf('entries'));
    expect(order).not.toContain('shells');
  });

  it('reports a cycle', () => {
    const a: PbCollectionSchema = {
      id: 'a',
      name: 'a',
      type: 'base',
      fields: [{ name: 'b', type: 'relation', collectionId: 'b' }],
    };
    const b: PbCollectionSchema = {
      id: 'b',
      name: 'b',
      type: 'base',
      fields: [{ name: 'a', type: 'relation', collectionId: 'a' }],
    };
    expect(() => dependencyOrder([a, b], ['a', 'b'])).toThrow(/cycle/);
  });
});
