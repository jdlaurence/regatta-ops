import { beforeAll, describe, expect, it } from 'vitest';
import {
  REAR_FLAG_THRESHOLD_CM,
  effectiveShelvesFor,
  overrideRule,
  type Id,
  type LoadPlacement,
  type World,
} from '@regatta-ops/domain';
import {
  BOYS_SHELF_IDS,
  SEED_REGATTA_IDS,
  SEED_TEAM_IDS,
  SEED_TRAILER_IDS,
  buildSeedWorld,
  seedShellId,
} from '@regatta-ops/seed';
import {
  LOCK_RULE_ID,
  assignTrailers,
  bestSpot,
  boatsForPack,
  buildTrailerPageModel,
  checkDrop,
  dropWrites,
  effectiveRules,
  flaggedPlacements,
  formatScore,
  lockNote,
  lockPlacement,
  lockedBy,
  metricsSummary,
  newPlanData,
  overhangText,
  packAll,
  packOne,
  packOps,
  placementWhere,
  refusalText,
  unlockPlacement,
  whyHere,
  type TrailerPageModel,
} from './lib';
import { planViewGeometry } from '@/components/trailer/plan';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const HOTL = SEED_REGATTA_IDS.headOfTheLake2026;
const BOYS = SEED_TRAILER_IDS.boys;
const GIRLS = SEED_TRAILER_IDS.girls;
const HANS = seedShellId('Hans Struzyna');
const FOWLER = seedShellId('Fowler');
const PEGGY = seedShellId("Peggy's Delight");

let seed: World;
beforeAll(() => {
  seed = buildSeedWorld().world;
});

function working(regattaId: Id, edit?: (w: World) => void) {
  const w = structuredClone(seed);
  edit?.(w);
  const plans = w.load_plans.filter((p) => p.regattaId === regattaId);
  const planIds = new Set(plans.map((p) => p.id));
  return {
    shells: w.shells,
    entries: w.entries.filter((e) => e.regattaId === regattaId),
    events: w.events.filter((e) => e.regattaId === regattaId),
    teams: [...w.teams].sort((a, b) => a.sortOrder - b.sortOrder),
    trailers: w.trailers,
    shelves: w.trailer_shelves,
    compartments: w.trailer_compartments,
    loadPlans: plans,
    placements: w.load_placements.filter((p) => planIds.has(p.loadPlanId)),
  };
}

function model(regattaId: Id, edit?: (w: World) => void): TrailerPageModel {
  return buildTrailerPageModel(working(regattaId, edit));
}

function trailer(m: TrailerPageModel, id: Id) {
  return m.trailers.find((t) => t.trailer.id === id)!;
}

describe('buildTrailerPageModel', () => {
  it('lists the boats still to load across both plans', () => {
    const m = model(NW);
    expect(m.trailers.map((t) => t.trailer.name)).toEqual(['Boys trailer', 'Girls trailer']);
    expect(m.toLoad.map((b) => b.shellId).sort()).toEqual([FOWLER, HANS].sort());
    expect(trailer(m, BOYS).records).toHaveLength(12);
    expect(trailer(m, GIRLS).records).toHaveLength(11);
    // Placed shells no entry uses ride as spares and still count as boats.
    expect(m.spareIds.size).toBeGreaterThan(0);
    for (const id of m.spareIds) expect(m.boatById.has(id)).toBe(true);
    expect(trailer(m, BOYS).boats).toHaveLength(12);
  });

  it('merges regatta overrides over the trailer defaults', () => {
    const w = working(NW);
    const t = w.trailers.find((x) => x.id === BOYS)!;
    const plan = w.loadPlans.find((p) => p.trailerId === BOYS)!;
    const heavy = t.defaultRules.find((r) => r.type === 'heavy-low')!;
    const off = overrideRule(heavy, { enabled: false });
    const rules = effectiveRules(t, { ...plan, rules: [off] });
    expect(rules).toHaveLength(t.defaultRules.length);
    expect(rules.find((r) => r.id === heavy.id)).toMatchObject({
      enabled: false,
      origin: 'regatta',
    });
    expect(effectiveRules(t, null)).toEqual(t.defaultRules);
  });
});

describe('assignTrailers', () => {
  it('sends teams to the trailer that shares their name and the rest where there is room', () => {
    const m = model(HOTL);
    expect(m.trailers.every((t) => !t.plan)).toBe(true);
    const byTeam = new Map<Id, Set<Id>>();
    for (const b of m.toLoad) {
      const set = byTeam.get(b.teamId) ?? new Set();
      set.add(m.assignment.get(b.shellId)!);
      byTeam.set(b.teamId, set);
    }
    expect([...byTeam.get(SEED_TEAM_IDS.boys)!]).toEqual([BOYS]);
    expect([...byTeam.get(SEED_TEAM_IDS.girls)!]).toEqual([GIRLS]);
    // Each masters team rides whole on one trailer.
    for (const teamId of [SEED_TEAM_IDS.fiveAm, SEED_TEAM_IDS.evening]) {
      expect(byTeam.get(teamId)?.size ?? 1).toBe(1);
    }
  });

  it('is empty without trailers', () => {
    expect(assignTrailers([], [], [])).toEqual(new Map());
  });
});

describe('drops and locks', () => {
  it('locks and unlocks with the name of who did it', () => {
    const p = { locked: false, reasons: [{ ruleId: 'fit', text: 'Fits', hard: true }] };
    const locked = lockPlacement(p, 'Sam W.');
    expect(locked.locked).toBe(true);
    expect(locked.reasons[0]).toEqual({
      ruleId: LOCK_RULE_ID,
      text: 'Locked by Sam W.',
      hard: true,
    });
    expect(lockedBy(locked)).toBe('Locked by Sam W.');
    const again = lockPlacement(locked, 'Kim');
    expect(again.reasons.filter((r) => r.ruleId === LOCK_RULE_ID)).toHaveLength(1);
    const unlocked = unlockPlacement(again);
    expect(unlocked).toEqual({ locked: false, reasons: p.reasons });
    // "Why here?" ends the name's initial with one period, not two.
    expect(lockNote(lockedBy(locked)!)).toBe('Locked by Sam W. Auto pack keeps it here.');
    expect(lockNote('Locked by Sam')).toBe('Locked by Sam. Auto pack keeps it here.');
    expect(lockedBy(unlocked)).toBeNull();
  });

  it('says why a spot refuses a boat', () => {
    expect(
      refusalText([{ ruleId: 'fit', text: '19.9 m is longer than the 17.7 m shelf', hard: true }]),
    ).toBe("Doesn't fit: 19.9 m is longer than the 17.7 m shelf");
    expect(
      refusalText([{ ruleId: 'fit', text: 'Does not fit end to end with Peggy', hard: true }]),
    ).toBe("Doesn't fit end to end with Peggy");
    expect(refusalText([{ ruleId: 'r_x', text: 'Top rack holds only 8+', hard: true }], [])).toBe(
      'Not allowed: Top rack holds only 8+',
    );
  });

  it('refuses an eight on a low level and places it on an empty high lane', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const hans = m.boatById.get(HANS)!;
    const low = checkDrop(boys, hans, { shelfId: BOYS_SHELF_IDS.l1!, lane: 0 });
    expect(low.ok).toBe(false);
    expect(low.reason).toMatch(/^Doesn't fit: 19\.9 m/);

    const four = m.boatById.get(FOWLER)!;
    const ok = checkDrop(boys, four, { shelfId: BOYS_SHELF_IDS.l1!, lane: 0 });
    expect(ok.ok).toBe(true);
    expect(ok.result.placement).toMatchObject({ shellId: FOWLER, locked: true });
  });

  it('writes a drop from "To load" as a create, locked by the coach', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const check = checkDrop(boys, m.boatById.get(FOWLER)!, {
      shelfId: BOYS_SHELF_IDS.l1!,
      lane: 0,
    });
    const w = dropWrites({
      result: check.result,
      target: { id: boys.plan!.id },
      targetRecords: boys.records,
      from: null,
      userName: 'Sam W.',
    });
    expect(w.guarded).toEqual([]);
    expect(w.batch).toHaveLength(1);
    expect(w.batch[0]).toMatchObject({
      op: 'create',
      collection: 'load_placements',
      data: {
        loadPlanId: boys.plan!.id,
        shellId: FOWLER,
        locked: true,
      },
    });
    const data = (w.batch[0] as { data: LoadPlacement }).data;
    expect(data.reasons[0]).toEqual({ ruleId: LOCK_RULE_ID, text: 'Locked by Sam W.', hard: true });
  });

  it('writes a move within the plan as a guarded update', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const rec = boys.records.find((r) => r.shellId === PEGGY)!;
    const check = checkDrop(boys, m.boatById.get(PEGGY)!, { shelfId: BOYS_SHELF_IDS.l1!, lane: 0 });
    // An eight on level 1 is refused, but the move is still described (a flagged drop).
    expect(check.ok).toBe(false);
    const w = dropWrites({
      result: check.result,
      target: { id: boys.plan!.id },
      targetRecords: boys.records,
      from: rec,
      userName: 'Sam W.',
    });
    expect(w.batch).toEqual([]);
    expect(w.guarded[0]).toMatchObject({
      id: rec.id,
      patch: { shelfId: BOYS_SHELF_IDS.l1, lane: 0, locked: true },
    });
    expect(w.guarded[0]!.patch.reasons![0]!.ruleId).toBe(LOCK_RULE_ID);
    expect(w.guarded[0]!.patch.reasons!.some((r) => /longer than/.test(r.text))).toBe(true);
  });

  it('moves a boat to another trailer by deleting and creating in one batch', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const girls = trailer(m, GIRLS);
    const rec = boys.records.find((r) => r.shellId === PEGGY)!;
    const target = girls.def.shelves.find((s) => s.tier === 3 && s.columnKey === 'right')!;
    const check = checkDrop(girls, m.boatById.get(PEGGY)!, { shelfId: target.id, lane: 1 });
    const w = dropWrites({
      result: check.result,
      target: { id: girls.plan!.id },
      targetRecords: girls.records,
      from: rec,
      userName: 'Sam W.',
    });
    expect(w.guarded).toEqual([]);
    expect(w.batch.map((op) => `${op.op}:${op.collection}`)).toEqual([
      'delete:load_placements',
      'create:load_placements',
    ]);
  });

  it('starts the plan in the same batch when the trailer has none', () => {
    const m = model(HOTL);
    const boys = trailer(m, BOYS);
    const boat = m.toLoad.find((b) => b.cls === '4+')!;
    const cell = { shelfId: BOYS_SHELF_IDS.l2!, lane: 0 };
    const check = checkDrop(boys, boat, cell);
    expect(check.ok).toBe(true);
    const w = dropWrites({
      result: check.result,
      target: { id: 'newplan00000001', create: newPlanData(HOTL, boys.trailer) },
      targetRecords: [],
      from: null,
      userName: 'Sam W.',
    });
    expect(w.batch[0]).toMatchObject({
      op: 'create',
      collection: 'load_plans',
      data: { id: 'newplan00000001', regattaId: HOTL, trailerId: BOYS, status: 'draft' },
    });
    expect((w.batch[0] as { data: { rules: unknown } }).data.rules).toEqual(
      boys.trailer.defaultRules,
    );
    expect(w.batch[1]).toMatchObject({ op: 'create', data: { loadPlanId: 'newplan00000001' } });
  });
});

describe('packing', () => {
  it('turns a pack result into updates, creates, deletes, and the packed stamp', () => {
    const records: LoadPlacement[] = [
      rec('rec1', 'a', 's1', 0),
      rec('rec2', 'b', 's1', 1),
      rec('rec3', 'c', 's2', 0),
    ];
    const ops = packOps({
      plan: { id: 'plan1' },
      records,
      result: {
        placements: [
          { ...place(records[0]!) }, // unchanged
          { ...place(records[1]!), shelfId: 's2' }, // moved
          {
            shellId: 'd',
            shelfId: 's3',
            lane: 0,
            offsetCm: 0,
            bowForward: false,
            locked: false,
            reasons: [],
          },
        ],
      },
      packedAt: '2026-10-31T16:00:00.000Z',
    });
    expect(ops.map((op) => `${op.op}:${op.collection}:${'id' in op ? op.id : ''}`)).toEqual([
      'update:load_placements:rec2',
      'create:load_placements:',
      'delete:load_placements:rec3',
      'update:load_plans:plan1',
    ]);
    expect(ops[3]).toMatchObject({ patch: { packedAt: '2026-10-31T16:00:00.000Z' } });
  });

  it('keeps locked placements where they are and places the boats headed for the trailer', () => {
    const m0 = model(NW);
    const lockedId = trailer(m0, BOYS).records.find((r) => r.shellId === PEGGY)!.id;
    const m = model(NW, (w) => {
      const r = w.load_placements.find((x) => x.id === lockedId)!;
      r.locked = true;
      r.shelfId = BOYS_SHELF_IDS.r4!;
      r.lane = 1;
      // De Reckoning sat there; send it to the list.
      w.load_placements = w.load_placements.filter(
        (x) => !(x.shelfId === BOYS_SHELF_IDS.r4 && x.lane === 1 && x.id !== lockedId),
      );
    });
    const boys = trailer(m, BOYS);
    expect(boatsForPack(m, boys).map((b) => b.shellId)).toEqual(
      expect.arrayContaining([HANS, FOWLER]),
    );
    const result = packOne(m, boys);
    const peggy = result.placements.find((p) => p.shellId === PEGGY)!;
    expect(peggy).toMatchObject({ shelfId: BOYS_SHELF_IDS.r4, lane: 1, locked: true });
    expect(result.placements.map((p) => p.shellId)).toEqual(expect.arrayContaining([HANS, FOWLER]));
    const ops = packOps({
      plan: { id: boys.plan!.id },
      records: boys.records,
      result,
      packedAt: '2026-10-31T16:00:00.000Z',
    });
    // The locked record is not rewritten.
    expect(ops.some((op) => op.op !== 'create' && op.id === lockedId)).toBe(false);
  });

  it('packs both trailers with every boat when there is room', () => {
    const m = model(HOTL);
    const results = packAll(m);
    const placed = [...results.values()].flatMap((r) => r.placements.map((p) => p.shellId));
    expect(new Set(placed).size).toBe(placed.length);
    expect(placed.sort()).toEqual(m.toLoad.map((b) => b.shellId).sort());
    for (const r of results.values()) expect(r.unplaced).toEqual([]);
  });

  it('puts overflow on the other trailer without moving what is there', () => {
    // Turn off most of the girls' trailer: its boats spill onto the boys' trailer.
    const m = model(HOTL, (w) => {
      for (const s of w.trailer_shelves) {
        if (s.trailerId === GIRLS && s.tier < 5) s.active = false;
      }
    });
    const results = packAll(m);
    const girls = results.get(GIRLS)!;
    const boys = results.get(BOYS)!;
    expect(girls.unplaced.length + girls.placements.length).toBeLessThanOrEqual(
      m.toLoad.filter((b) => m.assignment.get(b.shellId) === GIRLS).length,
    );
    const headedGirls = new Set(
      m.toLoad.filter((b) => m.assignment.get(b.shellId) === GIRLS).map((b) => b.shellId),
    );
    expect(boys.placements.some((p) => headedGirls.has(p.shellId))).toBe(true);
    const alone = packOne(m, trailer(m, BOYS));
    for (const p of alone.placements) {
      const after = boys.placements.find((x) => x.shellId === p.shellId)!;
      expect({ shelfId: after.shelfId, lane: after.lane }).toEqual({
        shelfId: p.shelfId,
        lane: p.lane,
      });
    }
  });

  it('finds the best free spot, or the rule that rejected every one', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const fowler = bestSpot(boys, m.boatById.get(FOWLER)!);
    expect(fowler.ok).toBe(true);
    const hans = bestSpot(boys, m.boatById.get(HANS)!);
    expect(hans.ok).toBe(false);
    if (!hans.ok) expect(hans.reasons[0]!.text).toMatch(/^Every active shelf rejected this boat/);
  });
});

describe('"Why here?" and the metrics', () => {
  it('explains a placed boat with rule sentences, scores, lock, and notes', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const why = whyHere(boys, PEGGY)!;
    expect(why.broken).toEqual([]);
    expect(why.lock).toBeNull();
    expect(why.reasons[0]).toMatchObject({
      hard: true,
      text: expect.stringMatching(/^Fits: 19\.9 m/),
    });
    expect(why.reasons.find((r) => r.text === 'Prefer eights on levels 5 and 4')?.score).toBe(30);
    expect(why.notes).toEqual(['Where the 2026 Regionals trailer sheet put it']);
    expect(
      placementWhere(
        boys,
        boys.placements.find((p) => p.shellId === PEGGY)!,
      ),
    ).toBe('Level 5, narrow side');
    expect(whyHere(boys, HANS)).toBeNull();
    expect(formatScore(30)).toBe('+30');
    expect(formatScore(-10.8)).toBe('−10.8');
  });

  it('flags a placement that breaks a hard rule', () => {
    const m = model(NW, (w) => {
      const plan = w.load_plans.find((p) => p.regattaId === NW && p.trailerId === BOYS)!;
      w.load_placements.push({
        id: 'flagged00000001',
        loadPlanId: plan.id,
        shellId: HANS,
        shelfId: BOYS_SHELF_IDS.l1!,
        lane: 0,
        offsetCm: 0,
        bowForward: false,
        locked: true,
        reasons: [],
      });
    });
    const boys = trailer(m, BOYS);
    const flags = flaggedPlacements(boys);
    expect(Object.keys(flags)).toEqual([HANS]);
    expect(whyHere(boys, HANS)!.broken.length).toBeGreaterThan(0);
  });

  it('sums weight per side, overhang per level, and warnings', () => {
    const m = model(NW);
    const metrics = metricsSummary(trailer(m, BOYS));
    expect(metrics.leftName).toBe('narrow side');
    expect(metrics.rightName).toBe('wide side');
    expect(metrics.leftKg + metrics.rightKg).toBeGreaterThan(0);
    expect(metrics.tolerancePct).toBe(15);
    expect(metrics.withinTolerance).toBe(metrics.balancePct <= 15);
    expect(metrics.tiers.map((t) => t.tier)).toEqual([5, 4, 3, 2]);
    const top = metrics.tiers[0]!;
    expect(top.needsFlag).toBe(top.rearCm > REAR_FLAG_THRESHOLD_CM);
    expect(overhangText(top)).toMatch(/^5\.0 m front, 2\.7 m rear$/);
    expect(overhangText({ frontCm: 0, rearCm: 0 })).toBe('No overhang');
    expect(metrics.warnings.some((w) => /needs a flag/.test(w))).toBe(true);
  });
});

describe('planViewGeometry', () => {
  it('draws lanes to scale with the frame, overhang, and the flag line', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const shelves = effectiveShelvesFor(boys.def, boys.rules);
    const g = planViewGeometry({
      def: boys.def,
      shelves,
      placements: boys.placements,
      boats: m.boatById,
      tier: 5,
      width: 800,
    });
    // Wide side outer lane first, then inner, then the narrow side.
    expect(g.lanes.map((l) => l.label)).toEqual([
      'Wide side, outer lane',
      'Wide side, inner lane',
      'Narrow side',
    ]);
    expect(g.dividers).toHaveLength(1);
    const frameLen = boys.def.frameLengthCm;
    expect(g.frame.x2 - g.frame.x1).toBeCloseTo(frameLen * g.pxPerCm, 5);
    expect(g.flagX - g.frame.x2).toBeCloseTo(REAR_FLAG_THRESHOLD_CM * g.pxPerCm, 5);
    const peggy = g.lanes[2]!.boats[0]!;
    expect(peggy.shellId).toBe(PEGGY);
    expect(peggy.width).toBeCloseTo(1990 * g.pxPerCm, 5);
    expect(peggy.frontCm).toBe(500);
    expect(peggy.rearCm).toBe(270);
    expect(g.lanes[2]!.frontOverhangCm).toBe(500);
    expect(g.lanes[2]!.rearOverhangCm).toBe(270);
    // Everything fits across the drawing.
    for (const l of g.lanes) {
      expect(l.frontMaxX).toBeGreaterThanOrEqual(g.gutter);
      expect(l.rearMaxX).toBeLessThanOrEqual(g.width);
    }
  });

  it('pairs small boats end to end in a lane', () => {
    const m = model(NW);
    const boys = trailer(m, BOYS);
    const shelf = BOYS_SHELF_IDS.l1!;
    const placements = [
      {
        shellId: 'single1',
        shelfId: shelf,
        lane: 0,
        offsetCm: 0,
        bowForward: false,
        locked: false,
        reasons: [],
      },
      {
        shellId: 'single2',
        shelfId: shelf,
        lane: 0,
        offsetCm: 850,
        bowForward: false,
        locked: false,
        reasons: [],
      },
    ];
    const boats = new Map([
      ['single1', { name: 'One', cls: '1x' as const, lengthCm: 820, teamId: '' }],
      ['single2', { name: 'Two', cls: '1x' as const, lengthCm: 820, teamId: '' }],
    ]);
    const g = planViewGeometry({
      def: boys.def,
      shelves: effectiveShelvesFor(boys.def, boys.rules),
      placements,
      boats,
      tier: 1,
      width: 800,
    });
    const lane = g.lanes.find((l) => l.shelfId === shelf && l.lane === 0)!;
    expect(lane.paired).toBe(true);
    expect(lane.boats.map((b) => b.name)).toEqual(['One', 'Two']);
    expect(lane.boats[1]!.x).toBeGreaterThan(lane.boats[0]!.x + lane.boats[0]!.width);
    expect(lane.rearOverhangCm).toBe(850 + 820 - boys.def.frameLengthCm);
  });
});

function rec(id: string, shellId: string, shelfId: string, lane: number): LoadPlacement {
  return {
    id,
    loadPlanId: 'plan1',
    shellId,
    shelfId,
    lane,
    offsetCm: 0,
    bowForward: false,
    locked: false,
    reasons: [],
  };
}

function place(r: LoadPlacement) {
  return {
    shellId: r.shellId,
    shelfId: r.shelfId,
    lane: r.lane,
    offsetCm: r.offsetCm,
    bowForward: r.bowForward,
    locked: r.locked,
    reasons: r.reasons,
  };
}
