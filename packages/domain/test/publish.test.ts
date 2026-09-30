import { describe, expect, it } from 'vitest';
import {
  buildPublishedSnapshot,
  compareEntriesBySchedule,
  hotSeatPlansFor,
  snapshotChanges,
  sortPublishedEntries,
  type ConflictInput,
  type Entry,
  type PublishedSnapshot,
} from '../src';
import {
  DAY1,
  DAY2,
  athleteId,
  eventId,
  instant,
  oarSetId,
  shellId,
  teamId,
  world,
} from './fixtures';

const BOYS = teamId('Boys');
const AT = '2025-05-14T04:00:00.000Z';

/** Two days of racing for the boys, one girls' entry, and a hot seat between them. */
function base(): ConflictInput {
  return world()
    .shell('Monahan', '8+')
    .shell('Live.Laugh.Love', '8+', { nickname: 'LLL' })
    .shell('Spencer', '4+')
    .oars('24-C', 'sweep', 9, { color: 'yellow-white' })
    .oars('24-D', 'sweep', 9)
    .athlete('Sam Lee')
    .athlete('Ava Chen')
    .athlete('Noor Haddad')
    .athlete('Ari Stone', { canCox: true })
    .athlete('Kai Brandt')
    .athlete('Gia Moreno', { team: 'Girls' })
    .event('v8tt', { at: '08:00', cls: '8+', name: "Youth Men's 8+", number: '5' })
    .event('v4tt', { at: '09:40', cls: '4+', name: "Youth Men's 4+" })
    .event('v8f', { at: '08:30', cls: '8+', name: "Youth Men's 8+ Final A", day: DAY2 })
    .event('late', { at: null, cls: '8+', name: 'Exhibition 8+' })
    .event('w8', { at: '09:00', cls: '8+', name: "Youth Women's 8+" })
    .entry({
      id: 'v4',
      label: 'V4+',
      event: 'v4tt',
      shell: 'Spencer',
      oars: '24-D',
      crew: { '1': 'Kai Brandt', cox: 'Ari Stone' },
    })
    .entry({
      id: 'v8',
      label: 'V8',
      event: 'v8tt',
      shell: 'Live.Laugh.Love',
      oars: '24-C',
      crew: { '1': 'Sam Lee', '2': 'Ava Chen', '3': 'Noor Haddad', cox: 'Ari Stone' },
    })
    .entry({ id: 'v8final', label: 'V8', event: 'v8f', shell: 'Monahan' })
    .entry({ id: 'exh', label: 'Exh 8', event: 'late' })
    .entry({ id: 'loose', label: '2V8', cls: '8+' })
    .entry({ id: 'gone', label: '3V8', event: 'v8tt', status: 'scratched' })
    .entry({
      id: 'girls',
      team: 'Girls',
      label: 'W8',
      event: 'w8',
      shell: 'Live.Laugh.Love',
      crew: { '1': 'Gia Moreno' },
    })
    .build();
}

function publish(input: ConflictInput, publishedAt = AT): PublishedSnapshot {
  return buildPublishedSnapshot({ ...input, teamId: BOYS, publishedAt, publishedBy: 'user1' });
}

function patch(input: ConflictInput, id: string, p: Partial<Entry>): ConflictInput {
  return { ...input, entries: input.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) };
}

function setSeat(input: ConflictInput, entry: string, seat: string, name: string | null) {
  const others = input.seats.filter((s) => !(s.entryId === entry && s.seat === seat));
  const seats = name
    ? [
        ...others,
        {
          id: `se_${entry}_${seat}`,
          entryId: entry,
          seat: seat as never,
          athleteId: athleteId(name),
        },
      ]
    : others;
  return { ...input, seats };
}

describe('buildPublishedSnapshot', () => {
  it("keeps the team's non-scratched entries in schedule order", () => {
    const snap = publish(base());
    expect(snap.publishedAt).toBe(AT);
    expect(snap.publishedBy).toBe('user1');
    // Day 1 by time (8:00, 9:40), the day's untimed event, day 2, then no event at all.
    expect(snap.entries.map((e) => e.entryId)).toEqual(['v8', 'v4', 'exh', 'v8final', 'loose']);
  });

  it('bakes in event, shell, oar, and athlete names, with every seat of the class', () => {
    const v8 = publish(base()).entries[0]!;
    expect(v8).toMatchObject({
      label: 'V8',
      boatClass: '8+',
      status: 'planned',
      eventId: eventId('v8tt'),
      eventName: "Youth Men's 8+",
      eventNumber: '5',
      day: DAY1,
      scheduledAt: instant(DAY1, '08:00'),
      stage: 'race',
      shellId: shellId('Live.Laugh.Love'),
      shellName: 'LLL',
      oarSetId: oarSetId('24-C'),
      oarSetName: '24-C',
    });
    expect(v8.seats.map((s) => s.seat)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'cox']);
    expect(v8.seats[0]).toEqual({
      seat: '1',
      athleteId: athleteId('Sam Lee'),
      athleteName: 'Sam Lee',
    });
    expect(v8.seats[3]).toEqual({ seat: '4', athleteId: null });
    expect(v8.seats[8]!.athleteName).toBe('Ari Stone');
  });

  it('leaves optional fields out so a JSON round trip is lossless', () => {
    const snap = publish(base());
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    const loose = snap.entries.find((e) => e.entryId === 'loose')!;
    expect(loose.eventId).toBeNull();
    expect('eventName' in loose).toBe(false);
    expect('shellName' in loose).toBe(false);
    expect('hotSeatPlan' in loose).toBe(false);
    expect(loose.seats.every((s) => s.athleteId === null)).toBe(true);
    const noBy = buildPublishedSnapshot({ ...base(), teamId: BOYS, publishedAt: AT });
    expect('publishedBy' in noBy).toBe(false);
  });

  it('prints hot seat plans on both entries of an acknowledged pair', () => {
    const fp = `shell:${shellId('Live.Laugh.Love')}|v8@${instant(DAY1, '08:00')}|girls@${instant(DAY1, '09:00')}`;
    const input = patch(base(), 'girls', {
      hotSeatAckBy: 'coach',
      hotSeatFingerprint: fp,
      hotSeatPlan: 'Girls cox meets Boys V8 at dock B',
    });
    const v8 = publish(input).entries.find((e) => e.entryId === 'v8')!;
    expect(v8.hotSeatPlan).toBe('Girls cox meets Boys V8 at dock B');
    const girls = buildPublishedSnapshot({ ...input, teamId: teamId('Girls'), publishedAt: AT });
    expect(girls.entries[0]!.hotSeatPlan).toBe('Girls cox meets Boys V8 at dock B');
  });

  it('ignores plans that were never acknowledged, and joins two distinct plans', () => {
    const e = { id: 'x', hotSeatPlan: 'Own plan', hotSeatAckBy: null };
    expect(hotSeatPlansFor(e, [])).toEqual([]);
    const own = { id: 'x', hotSeatPlan: 'Own plan', hotSeatAckBy: 'u' };
    const later = {
      id: 'y',
      hotSeatPlan: 'Later plan',
      hotSeatAckBy: 'u',
      hotSeatFingerprint: 'oar_set:o|x@2025-05-16T15:00:00.000Z|y@2025-05-16T16:00:00.000Z',
    };
    const unrelated = { ...later, id: 'z', hotSeatFingerprint: 'shell:s|q@t|z@t' };
    expect(hotSeatPlansFor(own, [own, later, unrelated])).toEqual(['Own plan', 'Later plan']);
  });
});

describe('compareEntriesBySchedule and sortPublishedEntries', () => {
  it('breaks ties by label with numbers in order, then id', () => {
    const events = new Map();
    const a = { id: 'b', label: '10V8', eventId: null };
    const b = { id: 'a', label: '2V8', eventId: null };
    const c = { id: 'c', label: '2V8', eventId: null };
    expect(
      [a, c, b].sort((x, y) => compareEntriesBySchedule(x, y, events)).map((e) => e.id),
    ).toEqual(['a', 'c', 'b']);
  });

  it('sorts published entries by day and time, stable on ties', () => {
    const rows = [
      { id: 1, day: undefined, scheduledAt: null },
      { id: 2, day: DAY2, scheduledAt: instant(DAY2, '08:00') },
      { id: 3, day: DAY1, scheduledAt: null },
      { id: 4, day: DAY1, scheduledAt: instant(DAY1, '09:00') },
      { id: 5, day: DAY1, scheduledAt: instant(DAY1, '09:00') },
    ];
    expect(sortPublishedEntries(rows).map((r) => r.id)).toEqual([4, 5, 3, 2, 1]);
  });
});

describe('snapshotChanges', () => {
  const texts = (published: PublishedSnapshot, input: ConflictInput, scratched: string[] = []) =>
    snapshotChanges(published, publish(input, 'draft'), { scratchedEntryIds: scratched }).map(
      (c) => c.text,
    );

  it('finds nothing when the draft matches, and nothing without a published snapshot', () => {
    const input = base();
    expect(snapshotChanges(publish(input), publish(input, 'later'))).toEqual([]);
    expect(snapshotChanges(null, publish(input))).toEqual([]);
    expect(snapshotChanges(undefined, publish(input))).toEqual([]);
  });

  it('names a changed seat with the people before and after', () => {
    const published = publish(base());
    const input = setSeat(base(), 'v8', '3', 'Kai Brandt');
    const changes = snapshotChanges(published, publish(input, 'draft'));
    expect(changes).toEqual([
      {
        kind: 'seat',
        entryId: 'v8',
        text: 'Seat 3 of V8 (Fri 8:00 AM): Noor Haddad → Kai Brandt',
      },
    ]);
  });

  it('reports filled and emptied seats, including the cox', () => {
    const published = publish(base());
    let input = setSeat(base(), 'v4', 'cox', null);
    input = setSeat(input, 'v4', '2', 'Noor Haddad');
    expect(texts(published, input)).toEqual([
      'Seat 2 of V4+: empty → Noor Haddad',
      'Cox of V4+: Ari Stone → empty',
    ]);
  });

  it('reports a swap of two seats as one change', () => {
    const published = publish(base());
    let input = setSeat(base(), 'v8', '1', 'Ava Chen');
    input = setSeat(input, 'v8', '2', 'Sam Lee');
    const changes = snapshotChanges(published, publish(input, 'draft'));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      kind: 'swap',
      text: 'Seats 1 and 2 of V8 (Fri 8:00 AM) swapped (Sam Lee, Ava Chen)',
    });
    let withCox = setSeat(base(), 'v8', 'cox', 'Noor Haddad');
    withCox = setSeat(withCox, 'v8', '3', 'Ari Stone');
    expect(texts(published, withCox)).toEqual([
      'Seat 3 and cox of V8 (Fri 8:00 AM) swapped (Noor Haddad, Ari Stone)',
    ]);
  });

  it('reports time moves, day moves, TBD, and moves to another event', () => {
    const published = publish(base());
    const retimed = {
      ...base(),
      events: base().events.map((e) =>
        e.id === eventId('v4tt') ? { ...e, scheduledAt: instant(DAY1, '10:20') } : e,
      ),
    };
    expect(texts(published, retimed)).toEqual(['V4+ moved to 10:20 AM']);

    const nextDay = {
      ...base(),
      events: base().events.map((e) =>
        e.id === eventId('v4tt') ? { ...e, day: DAY2, scheduledAt: instant(DAY2, '07:30') } : e,
      ),
    };
    expect(texts(published, nextDay)).toEqual(['V4+ moved to Sat 7:30 AM']);

    const tbd = {
      ...base(),
      events: base().events.map((e) =>
        e.id === eventId('v4tt') ? { ...e, scheduledAt: null } : e,
      ),
    };
    expect(texts(published, tbd)).toEqual(['V4+ time is now TBD']);

    expect(texts(published, patch(base(), 'v4', { eventId: eventId('w8') }))).toEqual([
      "V4+ moved to Youth Women's 8+, 9:00 AM",
    ]);
    expect(texts(published, patch(base(), 'v4', { eventId: eventId('v8tt') }))).toEqual([
      'V4+ moved to Event 5, 8:00 AM',
    ]);
    expect(texts(published, patch(base(), 'v4', { eventId: eventId('v8f') }))).toEqual([
      "V4+ moved to Youth Men's 8+ Final A, Sat 8:30 AM",
    ]);
    expect(texts(published, patch(base(), 'v4', { eventId: null }))).toEqual([
      'V4+ moved to unscheduled',
    ]);
  });

  it('reports shell, oar, label, and class changes', () => {
    const published = publish(base());
    const input = patch(base(), 'v8', {
      shellId: shellId('Monahan'),
      oarSetId: null,
      label: '1V8',
    });
    expect(texts(published, input)).toEqual([
      'V8 (Fri 8:00 AM) renamed 1V8',
      'V8 (Fri 8:00 AM) shell: LLL → Monahan',
      'V8 (Fri 8:00 AM) oars: 24-C → no oars',
    ]);
    expect(
      texts(published, patch(base(), 'v4', { shellId: null, oarSetId: oarSetId('24-C') })),
    ).toEqual(['V4+ shell: Spencer → no shell', 'V4+ oars: 24-D → 24-C']);
    // A 4+ rigged as a 4- loses its cox seat.
    expect(texts(published, patch(base(), 'v4', { boatClass: '4-' }))).toEqual([
      'V4+ is now a 4-',
      'Cox of V4+: Ari Stone → empty',
    ]);
  });

  it('reports added, removed, and scratched entries', () => {
    const published = publish(base());
    const added = {
      ...base(),
      entries: [
        ...base().entries,
        {
          id: 'new',
          regattaId: 'rg_test',
          teamId: BOYS,
          label: '4V8',
          boatClass: '8+' as const,
          eventId: eventId('v8tt'),
          status: 'draft' as const,
        },
      ],
    };
    expect(texts(published, added)).toEqual(['4V8 added']);

    const removed = { ...base(), entries: base().entries.filter((e) => e.id !== 'exh') };
    expect(texts(published, removed)).toEqual(['Exh 8 removed']);

    const scratched = patch(base(), 'loose', { status: 'scratched' });
    expect(texts(published, scratched, ['loose'])).toEqual(['2V8 scratched']);
  });

  it('treats scratched entries inside an older snapshot as absent', () => {
    const published = publish(base());
    published.entries.push({ ...published.entries[0]!, entryId: 'old', status: 'scratched' });
    expect(snapshotChanges(published, publish(base(), 'draft'))).toEqual([]);
  });

  it('lists changes in schedule order, one per seat, with times in the given zone', () => {
    const published = publish(base());
    let input = setSeat(base(), 'v8final', '1', 'Sam Lee');
    input = setSeat(input, 'v4', '1', null);
    const changes = snapshotChanges(published, publish(input, 'draft'), { timeZone: 'UTC' });
    expect(changes.map((c) => [c.entryId, c.text])).toEqual([
      ['v4', 'Seat 1 of V4+: Kai Brandt → empty'],
      ['v8final', 'Seat 1 of V8 (Sat 3:30 PM): empty → Sam Lee'],
    ]);
  });

  it('matches the seed shape: seats listed cox first, empty seats absent', () => {
    const published = publish(base());
    for (const e of published.entries) {
      e.seats = e.seats.filter((s) => s.athleteId).reverse();
    }
    expect(snapshotChanges(published, publish(base(), 'draft'))).toEqual([]);
  });
});
