import { describe, expect, it } from 'vitest';
import {
  deriveLoadList,
  loadItemKey,
  mergeLoadItems,
  type Entry,
  type GearItem,
  type LoadItem,
  type OarSet,
  type Shell,
} from '../src';

const shell = (id: string, name: string, extra: Partial<Shell> = {}): Shell => ({
  id,
  name,
  boatClass: '8+',
  compatibleClasses: [],
  rigging: 'sweep',
  riggerType: 'side',
  genderAffinity: 'any',
  status: 'in_service',
  isPrivate: false,
  ...extra,
});

const oars = (id: string, name: string, extra: Partial<OarSet> = {}): OarSet => ({
  id,
  name,
  type: 'sweep',
  count: 8,
  genderAffinity: 'any',
  status: 'in_service',
  ...extra,
});

const entry = (
  id: string,
  shellId: string | null,
  oarSetId: string | null,
  extra: Partial<Entry> = {},
): Entry => ({
  id,
  regattaId: 'r',
  teamId: 't',
  label: id,
  boatClass: '8+',
  shellId,
  oarSetId,
  status: 'planned',
  ...extra,
});

const gear = (
  id: string,
  name: string,
  category: GearItem['category'],
  defaultLoad: boolean,
): GearItem => ({
  id,
  name,
  category,
  quantity: 2,
  defaultLoad,
});

const fleet = {
  shells: [
    shell('s_mon', 'Monahan'),
    shell('s_lll', 'Live.Laugh.Love', { nickname: 'LLL', riggerType: 'wing' }),
    shell('s_one', 'Spinner', { boatClass: '1x', rigging: 'scull', riggerType: 'none' }),
    shell('s_alm', 'Alma', { boatClass: '4+', riggerCount: 5 }),
    shell('s_unused', 'Unused'),
  ],
  oarSets: [
    oars('o_24c', '24-C', { color: 'yellow-white' }),
    oars('o_blue', 'Blue', { type: 'scull', count: 6 }),
  ],
  gear: [
    gear('g_slings', 'Slings', 'slings', true),
    gear('g_box', 'Cox box A', 'cox_box', true),
    gear('g_tent', 'Tent', 'tent', false),
  ],
};

describe('deriveLoadList', () => {
  const list = deriveLoadList({
    ...fleet,
    entries: [
      entry('e1', 's_mon', 'o_24c'),
      entry('e2', 's_mon', 'o_24c'),
      entry('e3', 's_lll', 'o_blue'),
      entry('e4', 's_one', null),
      entry('e5', 's_alm', null),
      entry('e6', 's_unused', 'o_24c', { status: 'scratched' }),
      entry('e7', null, null),
      entry('e8', 's_ghost', 'o_ghost'),
    ],
    extras: [
      { label: 'Spare single', refId: 's_unused' },
      { label: 'Tool kit', quantity: 2 },
    ],
  });

  it('lists shells, riggers, oar sets, default-load gear, then extras', () => {
    expect(list).toEqual([
      { kind: 'shell', refId: 's_alm', label: 'Alma', quantity: 1 },
      { kind: 'shell', refId: 's_lll', label: 'Live.Laugh.Love (LLL)', quantity: 1 },
      { kind: 'shell', refId: 's_mon', label: 'Monahan', quantity: 1 },
      { kind: 'shell', refId: 's_one', label: 'Spinner', quantity: 1 },
      { kind: 'riggers', refId: 's_alm', label: 'Riggers for Alma', quantity: 5 },
      { kind: 'riggers', refId: 's_lll', label: 'Riggers for LLL', quantity: 4 },
      { kind: 'riggers', refId: 's_mon', label: 'Riggers for Monahan', quantity: 8 },
      { kind: 'oar_set', refId: 'o_24c', label: '24-C · yellow-white', quantity: 8 },
      { kind: 'oar_set', refId: 'o_blue', label: 'Blue', quantity: 6 },
      { kind: 'gear', refId: 'g_box', label: 'Cox box A', quantity: 2 },
      { kind: 'gear', refId: 'g_slings', label: 'Slings', quantity: 2 },
      { kind: 'extra', refId: 's_unused', label: 'Spare single', quantity: 1 },
      { kind: 'extra', refId: '', label: 'Tool kit', quantity: 2 },
    ]);
  });

  it('is deterministic regardless of entry order', () => {
    const reversed = deriveLoadList({
      ...fleet,
      entries: [entry('e3', 's_lll', 'o_blue'), entry('e1', 's_mon', 'o_24c')],
    });
    const forward = deriveLoadList({
      ...fleet,
      entries: [entry('e1', 's_mon', 'o_24c'), entry('e3', 's_lll', 'o_blue')],
    });
    expect(reversed).toEqual(forward);
  });

  it('is empty for no entries and no default gear', () => {
    expect(deriveLoadList({ entries: [], shells: [], oarSets: [], gear: [] })).toEqual([]);
  });
});

describe('mergeLoadItems', () => {
  const stored = (
    id: string,
    kind: LoadItem['kind'],
    refId: string,
    label: string,
    extra: Partial<LoadItem> = {},
  ): LoadItem => ({
    id,
    regattaId: 'r',
    kind,
    refId,
    label,
    quantity: 1,
    ...extra,
  });

  it('keeps checkbox state, adds new rows, flags orphans, and never orphans extras', () => {
    const derived = deriveLoadList({
      ...fleet,
      entries: [entry('e1', 's_mon', 'o_24c')],
    });
    const loaded = stored('li1', 'shell', 's_mon', 'Old name', {
      loadedAt: '2025-05-15T20:00:00.000Z',
      loadedBy: 'u1',
      container: 'Boys trailer',
    });
    const orphan = stored('li2', 'shell', 's_lll', 'Live.Laugh.Love (LLL)');
    const dupe = stored('li3', 'shell', 's_mon', 'Monahan');
    const extra = stored('li4', 'extra', '', 'Spare tool kit');
    const merged = mergeLoadItems(derived, [orphan, loaded, extra, dupe]);

    const mon = merged.rows.find((r) => r.key === 'shell:s_mon')!;
    expect(mon.stored).toBe(loaded);
    expect(mon.label).toBe('Monahan');
    expect(mon.derived).toBe(true);

    expect(merged.added.map((a) => loadItemKey(a))).toEqual([
      'riggers:s_mon',
      'oar_set:o_24c',
      'gear:g_box',
      'gear:g_slings',
    ]);
    expect(merged.orphaned).toEqual([orphan, dupe]);
    expect(merged.rows.map((r) => [r.key, r.derived, r.orphaned])).toEqual([
      ['shell:s_mon', true, false],
      ['riggers:s_mon', true, false],
      ['oar_set:o_24c', true, false],
      ['gear:g_box', true, false],
      ['gear:g_slings', true, false],
      ['extra:label:spare tool kit', true, false],
      ['shell:s_lll', false, true],
      ['shell:s_mon', false, true],
    ]);
  });

  it('matches derived extras to stored extras by refId or label', () => {
    const derived = deriveLoadList({
      entries: [],
      shells: [],
      oarSets: [],
      gear: [],
      extras: [
        { label: 'Tool kit' },
        { label: 'Spare single', refId: 's1' },
        { label: 'Tool kit' },
      ],
    });
    const merged = mergeLoadItems(derived, [
      stored('x1', 'extra', '', 'tool kit ', { loadedAt: '2025-05-15T20:00:00.000Z' }),
      stored('x2', 'extra', 's1', 'Spare single'),
    ]);
    expect(merged.added).toEqual([]);
    expect(merged.rows).toHaveLength(2);
    expect(merged.rows[0]!.stored!.id).toBe('x1');
    expect(merged.orphaned).toEqual([]);
  });
});
