import { beforeAll, describe, expect, it } from 'vitest';
import type { Id, LoadItem, World } from '@srt/domain';
import {
  SEED_REGATTA_IDS,
  SEED_TRAILER_IDS,
  SEED_USER_IDS,
  buildSeedWorld,
  seedGearId,
  seedShellId,
} from '@srt/seed';
import {
  buildLoadRows,
  containerPicks,
  countRows,
  filterRows,
  firstName,
  groupRows,
  newItemData,
  planForContainer,
  rowWrite,
  tickPatch,
  tickTime,
  tickedBy,
  type LoadRow,
} from './lib';

const NW = SEED_REGATTA_IDS.nwYouth2025;
const TZ = 'America/Los_Angeles';

let seed: World;
beforeAll(() => {
  seed = buildSeedWorld().world;
});

function source(regattaId: Id, edit?: (w: World) => void) {
  const w = structuredClone(seed);
  edit?.(w);
  const plans = w.load_plans.filter((p) => p.regattaId === regattaId);
  const ids = new Set(plans.map((p) => p.id));
  return {
    entries: w.entries.filter((e) => e.regattaId === regattaId),
    shells: w.shells,
    oarSets: w.oar_sets,
    gear: w.gear_items,
    loadItems: w.load_items.filter((i) => i.regattaId === regattaId),
    loadPlans: plans,
    placements: w.load_placements.filter((p) => ids.has(p.loadPlanId)),
    trailers: w.trailers,
  };
}

const row = (rows: LoadRow[], kind: string, refId: string) =>
  rows.find((r) => r.kind === kind && r.refId === refId)!;

describe('buildLoadRows', () => {
  it('merges derived lines with stored rows and keeps their ticks', () => {
    const rows = buildLoadRows(source(NW));
    const peggy = row(rows, 'shell', seedShellId("Peggy's Delight"));
    expect(peggy.stored).not.toBeNull();
    expect(peggy.loaded).toBe(true);
    expect(peggy.returned).toBe(true);
    expect(peggy.label).toBe("Peggy's Delight (Peggy)");
    const lll = row(rows, 'shell', seedShellId('Live.Laugh.Love'));
    expect(lll.loaded).toBe(true);
    expect(lll.returned).toBe(false);
    // Nothing stored yet: a line to save, and where it rides comes from the trailer.
    const alma = row(rows, 'shell', seedShellId('Alma Marie'));
    expect(alma.stored).toBeNull();
    expect(alma.suggestedContainer).toBe('Boys trailer');
    expect(alma.loadPlanId).not.toBeNull();
    const almaRiggers = row(rows, 'riggers', seedShellId('Alma Marie'));
    expect(almaRiggers.suggestedContainer).toBe('Boys trailer bed');
  });

  it('flags shells with no trailer spot, spares on a trailer, and rows nothing needs', () => {
    const rows = buildLoadRows(
      source(NW, (w) => {
        w.load_items.push({
          id: 'orphanitem00001',
          regattaId: NW,
          kind: 'oar_set',
          refId: 'gonegonegone001',
          label: 'An old oar set',
          quantity: 8,
          container: '',
        });
      }),
    );
    expect(row(rows, 'shell', seedShellId('Hans Struzyna')).notOnTrailer).toBe(true);
    expect(row(rows, 'shell', seedShellId('Fowler')).notOnTrailer).toBe(true);
    const spare = rows.filter((r) => r.kind === 'shell' && r.spare);
    expect(spare.length).toBeGreaterThan(0);
    for (const s of spare) expect(s.notOnTrailer).toBe(false);
    expect(rows.some((r) => r.kind === 'riggers' && r.spare)).toBe(true);
    const orphan = rows.find((r) => r.stored?.id === 'orphanitem00001')!;
    expect(orphan.orphaned).toBe(true);
    // Extras a coach added are never orphans.
    expect(rows.find((r) => r.kind === 'extra')!.orphaned).toBe(false);
  });

  it('groups by kind in the checklist order and counts what is loaded', () => {
    const rows = buildLoadRows(source(NW));
    const groups = groupRows(rows);
    expect(groups.map((g) => g.title)).toEqual(['Shells', 'Riggers', 'Oars', 'Gear', 'Extras']);
    const counts = countRows(rows);
    expect(counts.total).toBe(rows.length);
    expect(counts.loaded).toBe(rows.filter((r) => r.loaded).length);
    expect(counts.unsaved).toBe(rows.filter((r) => !r.stored).length);
    expect(counts.notOnTrailer).toBe(2);
    expect(filterRows(rows, 'not-loaded').every((r) => !r.loaded)).toBe(true);
    expect(filterRows(rows, 'not-returned').every((r) => !r.returned)).toBe(true);
    expect(filterRows(rows, 'all')).toHaveLength(rows.length);
  });
});

describe('writes', () => {
  it('ticks with who and when, and unticks cleanly', () => {
    expect(tickPatch('loaded', true, 'user1', '2026-10-31T13:42:00.000Z')).toEqual({
      loadedAt: '2026-10-31T13:42:00.000Z',
      loadedBy: 'user1',
      loadedByName: '',
    });
    expect(tickPatch('returned', false, 'user1', 'x')).toEqual({
      returnedAt: null,
      returnedBy: null,
      returnedByName: '',
    });
  });

  it('creates the stored row on the first tick, and updates it after', () => {
    const rows = buildLoadRows(source(NW));
    const alma = row(rows, 'shell', seedShellId('Alma Marie'));
    const patch = tickPatch('loaded', true, 'user1', '2026-10-31T13:42:00.000Z');
    const first = rowWrite(alma, NW, patch);
    expect(first).toMatchObject({
      op: 'create',
      data: {
        regattaId: NW,
        kind: 'shell',
        refId: alma.refId,
        label: 'Alma Marie (Alma)',
        quantity: 1,
        loadPlanId: alma.loadPlanId,
        loadedAt: '2026-10-31T13:42:00.000Z',
        loadedBy: 'user1',
      },
    });
    const peggy = row(rows, 'shell', seedShellId("Peggy's Delight"));
    expect(rowWrite(peggy, NW, patch)).toEqual({ op: 'update', id: peggy.stored!.id, patch });
    expect(newItemData(alma, NW)).toMatchObject({ container: '', loadedAt: null });
  });

  it('ties a typed container to its trailer’s plan', () => {
    const src = source(NW);
    const boysPlan = src.loadPlans.find((p) => p.trailerId === SEED_TRAILER_IDS.boys)!;
    expect(planForContainer('Boys trailer bed', src.trailers, src.loadPlans)).toBe(boysPlan.id);
    expect(planForContainer('boys trailer', src.trailers, src.loadPlans)).toBe(boysPlan.id);
    expect(planForContainer('Truck 1 bed', src.trailers, src.loadPlans)).toBeNull();
    expect(planForContainer('  ', src.trailers, src.loadPlans)).toBeNull();
    expect(containerPicks([{ name: 'Boys trailer' }])).toEqual([
      'Boys trailer',
      'Boys trailer bed',
      'Truck 1 bed',
      'Truck 2 bed',
    ]);
  });
});

describe('who and when', () => {
  const now = new Date('2026-10-31T20:00:00.000Z');
  const users = new Map([[SEED_USER_IDS.coachBoys, { name: 'Sam Whitaker' }]]);
  const item = (patch: Partial<LoadItem>): LoadItem => ({
    id: 'item00000000001',
    regattaId: NW,
    kind: 'gear',
    refId: seedGearId('slings'),
    label: 'Slings',
    quantity: 12,
    ...patch,
  });

  it('reads "Sam · 6:42 AM" today and adds the date otherwise', () => {
    expect(
      tickedBy(
        item({ loadedAt: '2026-10-31T13:42:00.000Z', loadedBy: SEED_USER_IDS.coachBoys }),
        'loaded',
        users,
        TZ,
        now,
      ),
    ).toBe('Sam · 6:42 AM');
    expect(tickTime('2026-10-30T23:10:00.000Z', TZ, now)).toBe('Oct 30, 4:10 PM');
    expect(
      tickedBy(
        item({ returnedAt: '2026-10-31T13:42:00.000Z', returnedByName: 'Riley' }),
        'returned',
        users,
        TZ,
        now,
      ),
    ).toBe('Riley · 6:42 AM');
    expect(tickedBy(item({}), 'loaded', users, TZ, now)).toBeNull();
    expect(tickedBy(null, 'loaded', users, TZ, now)).toBeNull();
    expect(firstName('  ')).toBe('Someone');
  });
});
