import { describe, expect, it } from 'vitest';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  SRA_GIRLS_TRAILER,
  trailerDefFromRecords,
  type TrailerDef,
} from '@srt/domain';
import type { BatchOp } from '@/data';
import {
  addLevel,
  addShelf,
  defFromDraft,
  draftFromDef,
  draftFromRecords,
  duplicateShelf,
  removeShelf,
  removedShelfIds,
  saveOps,
  sameDraft,
  updateShelf,
  validateDraft,
  type SavedTrailer,
} from './draft';
import { capacitySummary, trailerCapacity } from './capacity';
import { TRAILER_PRESETS, defaultRulesFor } from './presets';

/** Stored records for a packer definition, as the seed makes them. */
function recordsFor(def: TrailerDef): SavedTrailer {
  return {
    trailer: {
      id: def.id,
      name: def.name,
      style: def.style,
      frameLengthCm: def.frameLengthCm,
      widthCm: def.widthCm,
      postOffsetPct: def.postOffsetPct ?? null,
      bowForwardDefault: def.bowForwardDefault ?? false,
      notes: '',
      defaultRules: SRA_DEFAULT_RULES,
    },
    shelves: def.shelves.map((s, i) => ({
      ...s,
      trailerId: def.id,
      allowedClasses: s.allowedClasses ?? [],
      lanesOverride: s.lanesOverride ?? null,
      maxBoats: s.maxBoats ?? null,
      maxWeightKg: s.maxWeightKg ?? null,
      sortOrder: i + 1,
    })),
    compartments: def.compartments.map((c) => ({
      ...c,
      trailerId: def.id,
      capacityUnit: c.kind === 'oar_rack' ? 'oars' : 'loads',
    })),
  };
}

const saved = recordsFor(SRA_BOYS_TRAILER);
let n = 0;
const newId = () => `new${++n}`;

describe('trailer draft', () => {
  it('turns stored records into the same packer definition the regatta pages use', () => {
    const draft = draftFromRecords(saved);
    expect(defFromDraft(draft)).toEqual(
      trailerDefFromRecords(saved.trailer, saved.shelves, saved.compartments),
    );
    expect(sameDraft(draft, draftFromRecords(saved))).toBe(true);
  });

  it('saves nothing when nothing changed, and only the changed field otherwise', () => {
    const draft = draftFromRecords(saved);
    expect(saveOps(saved, draft)).toEqual([]);
    const wider = updateShelf(draft, 'r3', { widthCm: 170 });
    expect(saveOps(saved, wider)).toEqual<BatchOp[]>([
      { op: 'update', collection: 'trailer_shelves', id: 'r3', patch: { widthCm: 170 } },
    ]);
    const renamed = { ...draft, name: 'Big trailer', frameLengthCm: 1250 };
    expect(saveOps(saved, renamed)).toEqual<BatchOp[]>([
      {
        op: 'update',
        collection: 'trailers',
        id: 'trl_boys',
        patch: { name: 'Big trailer', frameLengthCm: 1250 },
      },
    ]);
  });

  it('deletes removed shelves and creates new ones in the same batch', () => {
    const draft = addShelf(removeShelf(draftFromRecords(saved), 'l1'), newId);
    const ops = saveOps(saved, draft);
    expect(ops.filter((o) => o.op === 'delete')).toEqual([
      { op: 'delete', collection: 'trailer_shelves', id: 'l1' },
    ]);
    const created = ops.filter((o) => o.op === 'create');
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      collection: 'trailer_shelves',
      data: { trailerId: 'trl_boys', tier: 5, columnKey: 'right', laneAccess: 'outer_first' },
    });
    // Sort order follows the table, so every later shelf moves up one.
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(9);
    expect(removedShelfIds(saved, draft)).toEqual(['l1']);
  });

  it('creates a whole trailer from a preset', () => {
    const preset = TRAILER_PRESETS.find((p) => p.key === 'goalpost')!;
    const def = preset.build({ id: 'trlnew', name: 'Borrowed', newId });
    const draft = draftFromDef(def, defaultRulesFor(def.shelves.map((s) => s.tier)));
    const ops = saveOps(null, draft);
    expect(ops[0]).toMatchObject({ op: 'create', collection: 'trailers', data: { id: 'trlnew' } });
    expect(ops.filter((o) => o.collection === 'trailer_shelves')).toHaveLength(5);
    expect(ops.filter((o) => o.collection === 'trailer_compartments')).toHaveLength(2);
    expect(validateDraft(draft)).toEqual({});
  });

  it('adds a level by copying the top one, one tier up', () => {
    const draft = addLevel(draftFromRecords(saved), newId);
    const added = draft.shelves.slice(-2);
    expect(added.map((s) => [s.label, s.tier, s.accessRank, s.columnKey, s.widthCm])).toEqual([
      ['Level 6, narrow side', 6, 6, 'left', 75],
      ['Level 6, wide side', 6, 6, 'right', 150],
    ]);
    expect(defFromDraft(draft).shelves.filter((s) => s.tier === 6)).toHaveLength(2);
  });

  it('duplicates a shelf next to itself', () => {
    const draft = duplicateShelf(draftFromRecords(saved), 'l2', newId);
    const i = draft.shelves.findIndex((s) => s.id === 'l2');
    expect(draft.shelves[i + 1]).toMatchObject({ label: 'Level 2, narrow side (copy)', tier: 2 });
  });

  it('flags fields that cannot be saved', () => {
    let draft = draftFromRecords(saved);
    draft = { ...draft, name: ' ', postOffsetPct: 120 };
    draft = updateShelf(draft, 'r1', { widthCm: null, tier: 1.5, lanesOverride: 12 });
    expect(validateDraft(draft)).toEqual({
      name: 'Enter a name.',
      postOffsetPct: 'Enter a percentage between 1 and 99.',
      'shelf:r1:tier': 'Level is a whole number, 1 at the bottom.',
      'shelf:r1:widthCm': 'Width must be more than 0 cm.',
      'shelf:r1:lanesOverride': 'Lanes is blank or a whole number from 1 to 8.',
    });
    // The diagram leaves a shelf out until it has a level.
    expect(defFromDraft(draft).shelves.some((s) => s.id === 'r1')).toBe(false);
  });
});

describe('capacity', () => {
  it('counts lanes and the lanes long enough for an eight', () => {
    const boys = trailerCapacity(SRA_BOYS_TRAILER, SRA_DEFAULT_RULES);
    expect(boys).toEqual({ levels: 5, shelves: 10, lanes: 15, eightLanes: 9 });
    expect(capacitySummary(boys)).toBe('5 levels, 15 lanes, 9 long enough for an eight');
    expect(trailerCapacity(SRA_GIRLS_TRAILER, SRA_DEFAULT_RULES).eightLanes).toBe(12);
  });
});

describe('defaultRulesFor', () => {
  it('matches SRA’s set on a five-level trailer and adapts to fewer levels', () => {
    expect(defaultRulesFor([1, 2, 3, 4, 5])).toEqual(SRA_DEFAULT_RULES);
    const three = defaultRulesFor([1, 2, 3]);
    expect(three.find((r) => r.id === 'r_eights_top')!.params).toMatchObject({ tiers: [3] });
    expect(three.find((r) => r.id === 'r_fours_mid')!.params).toMatchObject({ tiers: [2, 1] });
  });
});
