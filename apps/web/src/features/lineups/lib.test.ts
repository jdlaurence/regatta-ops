import { describe, expect, it } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  findConflicts,
  hotSeatAckPatch,
  unboatedAthletes,
  type RegattaEvent,
  type Seat,
} from '@srt/domain';
import { buildConflictInput } from '@/data';
import type { MemoryStore } from '@/data/memory-store';
import { IDS } from '@/test/fixtures';
import {
  athleteMatrix,
  autoLabel,
  baseLabel,
  buildIndex,
  clearOps,
  equipmentHints,
  groupEntries,
  hotSeatPlans,
  labelPrefix,
  matchesFilters,
  normalizeEventName,
  oarOptions,
  placementOps,
  planCopy,
  rosterView,
  seatCandidates,
  seatConflicts,
  sheetOrder,
  shellOptions,
  stripFits,
  stripNeed,
  stripOrder,
  EMPTY_FILTERS,
} from './lib';
import {
  BOYS,
  BOYS_COX,
  BOYS_OUT,
  GIRLS,
  L,
  entry,
  lineupData,
  lineupIndex,
  lineupStore,
  lineupWorld,
  seat,
} from './test-world';

describe('groupEntries', () => {
  it('groups a team’s entries under events in schedule order, unscheduled last', () => {
    const w = lineupWorld();
    entry(w, { id: 'entryunsched001', teamId: IDS.boys, label: 'V2x', boatClass: '2x' });
    const g = groupEntries(buildIndex(lineupData(w)), IDS.boys);
    expect(g.days).toHaveLength(1);
    expect(g.days[0]!.events.map((e) => e.event.eventNumber)).toEqual(['12', '15']);
    expect(g.unscheduled.map((e) => e.label)).toEqual(['V2x']);
    expect(g.ordered.map((e) => e.id)).toEqual([IDS.entry1, L.boysEight, 'entryunsched001']);
  });

  it('shows every race with showAll', () => {
    const g = groupEntries(lineupIndex(), IDS.boys, { showAll: true });
    expect(g.days[0]!.events.map((e) => e.event.eventNumber)).toEqual([
      '12',
      '14',
      '15',
      '16',
      '20',
    ]);
  });
});

describe('rosterView', () => {
  it('groups available athletes by level and counts the crossed-off roster', () => {
    const idx = lineupIndex();
    const r = rosterView(idx, IDS.boys);
    expect(r.levels.map((l) => l.label)).toEqual(['Experienced', 'Novice']);
    // Rowan and Emery (fixture), 8 rowers, the cox; Jay is unavailable.
    expect(r.total).toBe(11);
    // Rowan (V4+), Arlo, Beck, and Ike (V8).
    expect(r.boated).toBe(4);
    expect(r.unavailable.map((a) => a.athlete.id)).toEqual([BOYS_OUT]);
    expect(r.unavailable[0]!.reason).toBe('Family trip');
    // The masters athlete in seat 2 of the V4+ is borrowed.
    expect(r.borrowed.map((a) => a.athlete.firstName)).toEqual(['Jules']);
    expect(r.levels[0]!.athletes.find((a) => a.athlete.id === BOYS[0])!.entryCount).toBe(1);
  });

  it('agrees with the engine’s unboated list', () => {
    const w = lineupWorld();
    const data = lineupData(w);
    const r = rosterView(buildIndex(data), IDS.boys);
    const input = {
      timezone: 'America/Los_Angeles',
      seasonYear: 2026,
      ...data,
    };
    expect(r.total - r.boated).toBe(unboatedAthletes(input, IDS.boys).length);
  });

  it('does not count scratched entries as boated', () => {
    const w = lineupWorld();
    w.entries.find((e) => e.id === L.boysEight)!.status = 'scratched';
    expect(rosterView(buildIndex(lineupData(w)), IDS.boys).boated).toBe(1);
  });

  it('filters by side, sculling, coxing, unboated, and name', () => {
    const r = rosterView(lineupIndex(), IDS.boys);
    const all = r.levels.flatMap((l) => l.athletes);
    const names = (f: Partial<typeof EMPTY_FILTERS>) =>
      all
        .filter((a) => matchesFilters(a, { ...EMPTY_FILTERS, ...f }))
        .map((a) => a.athlete.firstName);
    expect(names({ side: 'starboard' })).toEqual(['Arlo', 'Cole', 'Eli', 'Gus']);
    expect(names({ scullers: true })).toEqual(['Arlo', 'Beck', 'Emery', 'Rowan']);
    expect(names({ coxswains: true })).toEqual(['Ike']);
    // Experienced first, then novice (Hal).
    expect(names({ unboated: true, side: 'port' })).toEqual(['Dax', 'Finn', 'Emery', 'Hal']);
    expect(names({ query: 'row co' })).toEqual(['Cole']);
  });
});

describe('seatCandidates', () => {
  it('puts side matches first, then the team, then other teams to borrow, then unavailable', () => {
    const idx = lineupIndex();
    const eight = idx.entryById.get(L.boysEight)!;
    // Seat 4 of a standard rig is port.
    const c = seatCandidates(idx, eight, '4');
    const groups = Array.from(new Set(c.map((x) => x.group)));
    expect(groups).toEqual([
      'Port side',
      'Junior boys',
      'Borrow from Junior girls',
      'Borrow from 5am masters',
      'Unavailable',
    ]);
    const port = c.filter((x) => x.group === 'Port side').map((x) => x.athlete.firstName);
    // Unboated first: Beck sits in seat 2 of this boat, Rowan is in the V4+.
    expect(port.slice(0, 4)).toEqual(['Dax', 'Finn', 'Hal', 'Emery']);
    expect(c.find((x) => x.athlete.id === BOYS[1])!.inThisEntry).toBe('2');
    expect(c.at(-1)!.unavailable).toBe('Family trip');
  });

  it('offers coxswains for the cox seat and scullers for a quad', () => {
    const idx = lineupIndex();
    const eight = idx.entryById.get(L.boysEight)!;
    const cox = seatCandidates(idx, eight, 'cox');
    expect(cox[0]!.group).toBe('Coxswains');
    expect(cox[0]!.athlete.id).toBe(BOYS_COX);
    const quad = { ...eight, id: 'entryquad000001', boatClass: '4x' as const, eventId: L.event5 };
    const q = seatCandidates(idx, quad, '1');
    // Unboated first (Emery), then the scullers already racing.
    expect(q.filter((x) => x.rank === 0).map((x) => x.athlete.firstName)).toEqual([
      'Emery',
      'Arlo',
      'Beck',
      'Rowan',
    ]);
  });

  it('flags a clash with another race the same day', () => {
    const w = lineupWorld();
    // Rowan races the V4+ at 9:40 (busy until 10:15). A crew at 10:20 leaves 5 minutes.
    entry(w, { id: 'entryclash00001', teamId: IDS.boys, eventId: IDS.event2, label: '2V8' });
    const idx = buildIndex(lineupData(w));
    const c = seatCandidates(idx, idx.entryById.get('entryclash00001')!, '1');
    const rowan = c.find((x) => x.athlete.id === 'athboys00000001')!;
    expect(rowan.clash).toEqual({
      severity: 'warning',
      text: 'Races Boys V4+ at 9:40, 5 min between',
    });
  });
});

describe('equipmentHints and shellOptions', () => {
  it('reads a busy shell, a hot seat, and a plain share like the engine does', () => {
    const w = lineupWorld();
    entry(w, { id: 'entryhot0000001', teamId: IDS.boys, eventId: L.event4, label: 'U17 8' });
    const idx = buildIndex(lineupData(w));
    // Girls V8 has Monahan at 10:20; head race: busy until 10:55.
    const at11 = equipmentHints(idx, idx.entryById.get(L.boysEight)!, 'shell', IDS.shell2);
    expect(at11).toEqual([
      { entryId: L.girlsEntry, tone: 'conflict', text: 'Busy: Girls V8 at 10:20', gapMin: 5 },
    ]);
    const at1130 = equipmentHints(idx, idx.entryById.get('entryhot0000001')!, 'shell', IDS.shell2);
    expect(at1130[0]).toMatchObject({
      tone: 'hot_seat',
      text: 'Also used by Girls V8 at 10:20 (hot seat)',
      gapMin: 35,
    });
  });

  it('matches the engine: taking the hinted shell produces the finding the hint promised', () => {
    const w = lineupWorld();
    entry(w, { id: 'entryhot0000001', teamId: IDS.boys, eventId: L.event4, label: 'U17 8' });
    w.entries.find((e) => e.id === 'entryhot0000001')!.shellId = IDS.shell2;
    const data = lineupData(w);
    const findings = findConflicts({
      ...data,
      timezone: 'America/Los_Angeles',
      seasonYear: 2026,
    });
    expect(findings.find((f) => f.code === 'SHELL_HOT_SEAT')?.gapMin).toBe(35);
  });

  it('treats two crews that fit one oar set together as a split', () => {
    const w = lineupWorld();
    // Girls V8 uses 25-A (9 oars). A 1x cannot split with an eight on 9 oars, but 4+ can't either.
    entry(w, {
      id: 'entrypair000001',
      teamId: IDS.boys,
      eventId: L.event3,
      label: 'V2-',
      boatClass: '2-',
    });
    const idx = buildIndex(lineupData(w));
    const hints = equipmentHints(
      idx,
      idx.entryById.get('entrypair000001')!,
      'oar_set',
      L.girlsOars,
    );
    // 8 + 2 = 10 > 9: they cannot split, and 5 minutes is a conflict.
    expect(hints[0]!.tone).toBe('conflict');
    const w2 = lineupWorld();
    w2.oar_sets.find((o) => o.id === L.girlsOars)!.count = 10;
    entry(w2, {
      id: 'entrypair000001',
      teamId: IDS.boys,
      eventId: L.event3,
      label: 'V2-',
      boatClass: '2-',
    });
    const idx2 = buildIndex(lineupData(w2));
    expect(
      equipmentHints(idx2, idx2.entryById.get('entrypair000001')!, 'oar_set', L.girlsOars)[0],
    ).toMatchObject({ tone: 'shared', text: 'Also used by Girls V8 at 10:20 (split)' });
  });

  it('lists compatible shells, this team first, with out-of-service disabled', () => {
    const idx = lineupIndex();
    const eight = idx.entryById.get(L.boysEight)!;
    const opts = shellOptions(idx, eight);
    expect(opts.map((o) => [o.item.name, o.group])).toEqual([
      ['Monahan', 'Junior boys'],
      ['Old Faithful', 'Junior girls'],
    ]);
    expect(opts[1]!.disabledReason).toMatch(/^Out of service\./);
    expect(opts[0]!.hints[0]!.text).toBe('Busy: Girls V8 at 10:20');
    const all = shellOptions(idx, eight, true);
    expect(all.filter((o) => o.group === 'Other classes').map((o) => o.item.name)).toEqual([
      'Spencer',
      'Susan',
    ]);
  });

  it('runs in well under 5 ms for a picker open', () => {
    const idx = lineupIndex();
    const eight = idx.entryById.get(L.boysEight)!;
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) shellOptions(idx, eight, true);
    expect((performance.now() - t0) / 20).toBeLessThan(5);
  });
});

describe('oarOptions', () => {
  it('filters to the rigging, puts short sets after, and hides the other rigging', () => {
    const idx = lineupIndex();
    const eight = idx.entryById.get(L.boysEight)!;
    const opts = oarOptions(idx, eight);
    expect(opts.map((o) => [o.item.name, o.group])).toEqual([
      ['24-C', 'Club boats'],
      ['25-A', 'Junior girls'],
      ['21-B', 'Short sets'],
    ]);
    expect(opts[2]!.detail).toBe('7 sweep oars; this boat needs 8');
    expect(oarOptions(idx, eight, true).at(-1)!.group).toBe('Other rigging');
  });
});

describe('labels', () => {
  const ev = (name: string, category = ''): Pick<RegattaEvent, 'name' | 'category'> => ({
    name,
    category,
  });
  it('derives the club’s prefixes from the event', () => {
    expect(labelPrefix(ev("Men's Youth 8+", "Men's Youth U19"))).toBe('V');
    expect(labelPrefix(ev("2V Men's 8+", "Men's 2nd Varsity U19"))).toBe('2V');
    expect(labelPrefix(ev("Men's U17 8+", "Men's U17"))).toBe('U17');
    expect(labelPrefix(ev("Novice Men's 4+"))).toBe('N');
    expect(labelPrefix(ev("Women's Masters 8+", "Women's Masters"))).toBe('W');
    expect(labelPrefix(ev('Mixed Masters 4x', 'Mixed Masters'))).toBe('Mixed');
    expect(labelPrefix(null, 'masters')).toBe('');
    expect(labelPrefix(null, 'juniors')).toBe('V');
  });

  it('joins prefix and class the way the sheets do', () => {
    expect(baseLabel('V', '8+')).toBe('V8');
    expect(baseLabel('2V', '4+')).toBe('2V4+');
    expect(baseLabel('U17', '8+')).toBe('U17 8');
    expect(baseLabel('Mixed', '4x')).toBe('Mixed 4x');
    expect(baseLabel('', '1x')).toBe('1x');
  });

  it('adds a crew letter when the label is taken in the event', () => {
    const e = ev("Men's Youth 8+");
    expect(autoLabel(e, '8+', [])).toBe('V8');
    expect(autoLabel(e, '8+', ['V8'])).toBe('V8 B');
    expect(autoLabel(e, '8+', ['V8 A', 'V8 B'])).toBe('V8 C');
    expect(autoLabel(e, '8+', ['V8 B'])).toBe('V8 A');
    expect(autoLabel(e, '8+', ['2V8'])).toBe('V8');
  });
});

describe('placementOps', () => {
  it('creates a seat record on first set and updates it afterwards', () => {
    const idx = lineupIndex();
    const { ops } = placementOps(idx, { entryId: L.boysEight, seat: '4' }, BOYS[3]!);
    expect(ops).toEqual([
      {
        op: 'create',
        collection: 'entry_seats',
        data: { entryId: L.boysEight, seat: '4', athleteId: BOYS[3] },
      },
    ]);
  });

  it('replaces the occupant when the athlete comes from the roster', () => {
    const idx = lineupIndex();
    const r = placementOps(idx, { entryId: L.boysEight, seat: '1' }, BOYS[4]!);
    expect(r.displaced).toBe(BOYS[0]);
    expect(r.ops).toHaveLength(1);
    expect(r.ops[0]).toMatchObject({ op: 'update', patch: { athleteId: BOYS[4] } });
  });

  it('swaps within an entry: clear, then set both seats', () => {
    const idx = lineupIndex();
    const r = placementOps(idx, { entryId: L.boysEight, seat: '1' }, BOYS[1]!);
    expect(r.swappedIn).toBe(BOYS[0]);
    expect(r.ops.map((o) => [o.op, 'patch' in o ? o.patch : null])).toEqual([
      ['update', { athleteId: null }],
      ['update', { athleteId: null }],
      ['update', { athleteId: BOYS[1] }],
      ['update', { athleteId: BOYS[0] }],
    ]);
  });

  it('moves between entries and swaps the target’s occupant back', () => {
    const idx = lineupIndex();
    const r = placementOps(idx, { entryId: IDS.entry1, seat: '1' }, BOYS[0]!, {
      entryId: L.boysEight,
      seat: '1',
    });
    expect(r.swappedIn).toBe('athboys00000001');
    expect(r.ops).toHaveLength(2);
  });

  it('moves into an empty seat and leaves the source empty', () => {
    const idx = lineupIndex();
    const r = placementOps(idx, { entryId: L.boysEight, seat: '5' }, BOYS[0]!, {
      entryId: L.boysEight,
      seat: '1',
    });
    expect(r.ops.map((o) => o.op)).toEqual(['update', 'create']);
    expect(r.ops[0]).toMatchObject({ patch: { athleteId: null } });
  });

  it('does nothing for a drop on the same seat, and clears a seat', () => {
    const idx = lineupIndex();
    const same = { entryId: L.boysEight, seat: '1' as const };
    expect(placementOps(idx, same, BOYS[0]!, same).ops).toEqual([]);
    expect(placementOps(idx, same, BOYS[0]!).ops).toEqual([]);
    expect(clearOps(idx, same)).toEqual([
      {
        op: 'update',
        collection: 'entry_seats',
        id: expect.any(String),
        patch: { athleteId: null },
      },
    ]);
    expect(clearOps(idx, { entryId: L.boysEight, seat: '8' })).toEqual([]);
  });
});

describe('placement batches against the MemoryStore unique index', () => {
  type Ref = { entryId: string; seat: Seat };
  async function run(store: MemoryStore, target: Ref, athleteId: string, from?: Ref) {
    const idx = buildIndex(lineupData(store.snapshot()));
    await store.batch(placementOps(idx, target, athleteId, from).ops);
  }
  const at = (store: MemoryStore, entryId: string, seat: Seat) =>
    store.snapshot().entry_seats.find((s) => s.entryId === entryId && s.seat === seat)?.athleteId ??
    null;
  const eight = (seat: Seat) => ({ entryId: L.boysEight, seat });
  const four = (seat: Seat) => ({ entryId: IDS.entry1, seat });

  it('swaps within an entry, from a drag or from the picker', async () => {
    const store = lineupStore();
    await run(store, eight('1'), BOYS[1]!, eight('2'));
    expect([at(store, L.boysEight, '1'), at(store, L.boysEight, '2')]).toEqual([BOYS[1], BOYS[0]]);
    await run(store, eight('1'), BOYS[0]!);
    expect([at(store, L.boysEight, '1'), at(store, L.boysEight, '2')]).toEqual([BOYS[0], BOYS[1]]);
  });

  it('swaps across entries', async () => {
    const store = lineupStore();
    await run(store, eight('1'), 'athboys00000001', four('1'));
    expect(at(store, L.boysEight, '1')).toBe('athboys00000001');
    expect(at(store, IDS.entry1, '1')).toBe(BOYS[0]);
  });

  it('leaves the source empty when the occupant already sits in the source entry', async () => {
    const store = lineupStore();
    await run(store, four('3'), BOYS[0]!);
    await run(store, eight('1'), 'athboys00000001', four('1'));
    expect(at(store, L.boysEight, '1')).toBe('athboys00000001');
    expect(at(store, IDS.entry1, '1')).toBeNull();
    expect(at(store, IDS.entry1, '3')).toBe(BOYS[0]);
  });

  it('moves an athlete out of their old seat in the target entry', async () => {
    const store = lineupStore();
    await run(store, four('3'), BOYS[0]!);
    await run(store, eight('5'), BOYS[0]!, four('3'));
    expect(at(store, L.boysEight, '5')).toBe(BOYS[0]);
    expect(at(store, L.boysEight, '1')).toBeNull();
    expect(at(store, IDS.entry1, '3')).toBeNull();
  });
});

describe('hotSeatPlans', () => {
  it('shows an acknowledged plan on both entries of the pair', () => {
    const w = lineupWorld();
    // Boys U17 8 takes Monahan at 11:30 after the girls' 10:20: a hot seat (35 min).
    entry(w, {
      id: 'entryhot0000001',
      teamId: IDS.boys,
      eventId: L.event4,
      label: 'U17 8',
      shellId: IDS.shell2,
    });
    const data = lineupData(w);
    const input = { ...data, timezone: 'America/Los_Angeles', seasonYear: 2026 };
    const hot = findConflicts(input).find((f) => f.code === 'SHELL_HOT_SEAT')!;
    const patch = hotSeatAckPatch(hot, input)!;
    const later = w.entries.find((e) => e.id === patch.entryId)!;
    Object.assign(later, {
      hotSeatFingerprint: patch.hotSeatFingerprint,
      hotSeatAckBy: IDS.coach,
      hotSeatPlan: 'Girls cox meets the U17 crew at dock B',
    });
    const after = findConflicts({
      ...lineupData(w),
      timezone: 'America/Los_Angeles',
      seasonYear: 2026,
    });
    const idx = buildIndex(lineupData(w));
    for (const id of [L.girlsEntry, 'entryhot0000001']) {
      const mine = after.filter((f) => f.entryIds.includes(id));
      expect(mine.find((f) => f.code === 'SHELL_HOT_SEAT')?.severity).toBe('info');
      expect(hotSeatPlans(mine, idx.entryById)).toEqual(['Girls cox meets the U17 crew at dock B']);
    }
  });
});

describe('stripFits', () => {
  it('keeps an eight as a strip only where short names still fit', () => {
    expect(stripFits('8+', 720)).toBe(true);
    expect(stripFits('8+', 648)).toBe(false);
    expect(stripFits('4+', 358)).toBe(false);
    expect(stripFits('2x', 358)).toBe(true);
    expect(stripFits('1x', 200)).toBe(true);
  });

  it('says how wide a column each class needs (the builder puts the roster beside it)', () => {
    expect(stripNeed('8+')).toBe(696);
    expect(stripNeed('4+')).toBe(448);
    expect(stripNeed('1x')).toBeLessThan(stripNeed('2x'));
  });
});

describe('seat order and seat findings', () => {
  it('orders strips bow to stroke and sheets cox then stroke to bow', () => {
    expect(stripOrder('4+')).toEqual(['1', '2', '3', '4', 'cox']);
    expect(stripOrder('4+', 'bow')).toEqual(['cox', '1', '2', '3', '4']);
    expect(sheetOrder('4+')).toEqual(['cox', '4', '3', '2', '1']);
    expect(sheetOrder('2x')).toEqual(['2', '1']);
  });

  it('maps athlete findings to their seats', () => {
    const w = lineupWorld();
    seat(w, L.boysEight, '3', BOYS_OUT);
    const data = lineupData(w);
    const idx = buildIndex(data);
    const findings = findConflicts({ ...data, timezone: 'America/Los_Angeles', seasonYear: 2026 });
    expect(seatConflicts(findings, idx, L.boysEight)['3']).toBe('error');
  });
});

describe('athleteMatrix', () => {
  it('lays athletes against the team’s events and counts races', () => {
    const w = lineupWorld();
    entry(w, { id: 'entryu17000001x', teamId: IDS.boys, eventId: L.event4, label: 'U17 8' });
    seat(w, 'entryu17000001x', '1', BOYS[0]!);
    const m = athleteMatrix(buildIndex(lineupData(w)), IDS.boys);
    expect(m.columns.map((c) => c.event?.eventNumber)).toEqual(['12', '15', '16']);
    const arlo = m.rows.find((r) => r.athlete.id === BOYS[0])!;
    expect(arlo.races).toBe(2);
    expect(arlo.cells.get(L.event4)![0]!.seat).toBe('1');
    expect(m.rows.find((r) => r.borrowed)!.athlete.firstName).toBe('Jules');
  });
});

describe('planCopy', () => {
  it('matches events by name, then category, then a lone class', () => {
    expect(normalizeEventName('Event 9 · Mens Youth 8+')).toBe(
      normalizeEventName("Men's Youth 8+"),
    );
    const w = lineupWorld();
    const data = lineupData(w);
    const source = [
      { ...data.events.find((e) => e.id === L.event3)!, id: 'srcev1', name: 'Mens Youth 8+' },
      { ...data.events.find((e) => e.id === L.event4)!, id: 'srcev2', name: 'U17 Eights' },
      { ...data.events.find((e) => e.id === IDS.event1)!, id: 'srcev3', name: 'Coxed fours' },
    ];
    const entries = [
      { ...data.entries.find((e) => e.id === L.boysEight)!, id: 'src1', eventId: 'srcev1' },
      {
        ...data.entries.find((e) => e.id === L.boysEight)!,
        id: 'src2',
        eventId: 'srcev2',
        label: 'U17 8',
      },
      { ...data.entries.find((e) => e.id === IDS.entry1)!, id: 'src3', eventId: 'srcev3' },
    ];
    const rows = planCopy({
      sourceEntries: entries,
      sourceEvents: source,
      sourceSeats: [
        { id: 's1', entryId: 'src1', seat: '1', athleteId: BOYS[0] },
        { id: 's2', entryId: 'src1', seat: '2', athleteId: 'gone00000000001' },
      ],
      targetEvents: data.events,
      targetEntries: data.entries.filter((e) => e.teamId === IDS.boys),
      athletes: new Map(data.athletes.map((a) => [a.id, a])),
    });
    expect(rows.map((r) => [r.source.id, r.target?.eventNumber, r.match])).toEqual([
      ['src3', '12', 'class'],
      ['src1', '15', 'name'],
      ['src2', '16', 'category'],
    ]);
    const v8 = rows.find((r) => r.source.id === 'src1')!;
    expect(v8.seats).toEqual([{ seat: '1', athleteId: BOYS[0] }]);
    expect(v8.skipped).toBe(1);
    // The boys already have a V8 in event 15: not suggested.
    expect(v8.duplicate?.id).toBe(L.boysEight);
    expect(v8.suggested).toBe(false);
    expect(rows.find((r) => r.source.id === 'src2')!.suggested).toBe(true);
  });
});

it('keeps the girls’ athletes out of the boys’ side groups', () => {
  const idx = lineupIndex();
  const c = seatCandidates(idx, idx.entryById.get(L.boysEight)!, '3');
  const girl = c.find((x) => x.athlete.id === GIRLS[1])!;
  expect(girl.rank).toBe(2);
  expect(buildConflictInput).toBeTypeOf('function');
});
