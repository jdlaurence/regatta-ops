import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  makeRule,
  packTrailer,
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  type Placement,
  type TrailerDef,
} from '@srt/domain';
import { presetByKey } from '@/features/trailers-admin/presets';
import {
  boatLengthCm,
  hullProfile,
  isometricGeometry,
  overhangSummary,
  overhangWords,
  type IsometricBoat,
} from './isometric';
import { BOYS_2026_LOAD, sampleEndViewBoats, samplePackBoats } from './samples';
import type { EndViewPlacement } from './TrailerEndView';
import { TrailerIsometric } from './TrailerIsometric';

const BOATS: IsometricBoat[] = [
  { shellId: 'peggy', name: 'Peggy', cls: '8+', beamCm: 60, lengthCm: 1990, teamColor: 'navy' },
  { shellId: 'spencer', name: 'Spencer', cls: '4+', beamCm: 52, teamColor: 'navy' },
  { shellId: 'snoopy', name: 'Snoopy', cls: '4x', beamCm: 52, lengthCm: 1300 },
];

// Level 5: Peggy on the narrow side, 5 m in front of the frame. Level 3: Spencer by the post
// and Snoopy outside it on the wide side, both within the frame.
const PLACEMENTS: EndViewPlacement[] = [
  { shellId: 'peggy', shelfId: 'l5', lane: 0, offsetCm: -500 },
  { shellId: 'spencer', shelfId: 'r3', lane: 0, offsetCm: 0 },
  { shellId: 'snoopy', shelfId: 'r3', lane: 1, offsetCm: -80 },
];

const geometry = (placements = PLACEMENTS, width = 800, trailer: TrailerDef = SRA_BOYS_TRAILER) =>
  isometricGeometry({ trailer, placements, boats: BOATS, width });

describe('isometric geometry', () => {
  it('puts the front up and to the right of the back', () => {
    const g = geometry();
    const [front, back] = [g.bedTop[0]!, g.bedTop[1]!]; // left side at the front, then the back
    expect(front.x).toBeGreaterThan(back.x);
    expect(front.y).toBeLessThan(back.y);
    expect(g.front.x).toBeGreaterThan(front.x);
    // The right side is nearer: lower on screen than the left at the same point along.
    expect(g.bedTop[2]!.y).toBeGreaterThan(g.bedTop[1]!.y);
  });

  it('draws hulls from their offset and length, with class lengths when unknown', () => {
    const g = geometry();
    const byId = new Map(g.hulls.map((h) => [h.shellId, h]));
    expect(byId.get('peggy')).toMatchObject({ tier: 5, startCm: -500, endCm: 1490 });
    expect(byId.get('spencer')!.endCm).toBe(boatLengthCm({ cls: '4+' }));
    expect(boatLengthCm({ cls: '8+', lengthCm: 0 })).toBe(1990);
    expect(boatLengthCm(null)).toBe(1200);
    // Lanes across the width follow the end view: narrow side, then by the post, then outside.
    expect(byId.get('peggy')!.wCm).toBeLessThan(byId.get('spencer')!.wCm);
    expect(byId.get('spencer')!.wCm).toBeLessThan(byId.get('snoopy')!.wCm);
    expect(hullProfile(0)).toBe(0);
    expect(hullProfile(0.5)).toBe(1);
  });

  it('paints low levels first and far lanes before near ones', () => {
    const g = geometry();
    const order = g.items.filter((i) => i.kind === 'hull').map((i) => i.hull.shellId);
    expect(order).toEqual(['spencer', 'snoopy', 'peggy']);
    // Every arm of a level comes before that level's hulls.
    const firstHull = g.items.findIndex((i) => i.kind === 'hull');
    const level3Arms = g.items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === 'arm' && item.arm.shelfId.endsWith('3'));
    expect(Math.max(...level3Arms.map((a) => a.index))).toBeLessThan(firstHull);
  });

  it('fits the width and keeps every point inside the drawing', () => {
    for (const width of [358, 800]) {
      const g = geometry(PLACEMENTS, width);
      expect(g.width).toBeLessThanOrEqual(width);
      const pts = [
        ...g.bedTop,
        ...g.bedSide,
        ...g.hitch,
        ...g.hulls.flatMap((h) => [...h.top, ...h.keel]),
      ];
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(g.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(g.height);
      }
    }
    // Wider drawings give thicker hulls; names show only where they fit.
    expect(geometry(PLACEMENTS, 800).hulls[0]!.label.thickness).toBeGreaterThan(
      geometry(PLACEMENTS, 358).hulls[0]!.label.thickness,
    );
  });

  it('measures overhang past each end of the frame', () => {
    const g = geometry();
    expect(g.overhang.front).toMatchObject({ cm: 500, shellId: 'peggy' });
    // Peggy: 1990 cm from −500 ends at 1490, 270 cm past the 1220 cm frame.
    expect(g.overhang.rear).toMatchObject({ cm: 270, shellId: 'peggy' });
    // A four is 13.4 m, longer than the frame too.
    expect(overhangSummary(g)).toBe(
      '3 boats stick out, up to 5.0 m past the front and 2.7 m past the back of the frame.',
    );
    expect(overhangSummary(geometry(PLACEMENTS.slice(1, 2)))).toBe(
      'Spencer sticks out 1.2 m past the back of the frame.',
    );
    expect(
      overhangSummary(geometry([{ shellId: 'snoopy', shelfId: 'r3', lane: 1, offsetCm: 0 }])),
    ).toBe('Snoopy sticks out 0.8 m past the back of the frame.');
    expect(overhangSummary(geometry([]))).toBeNull();
    expect(overhangWords(0, 0)).toBeNull();
  });

  it('draws goalpost top bars and shelves that are off', () => {
    let n = 0;
    const goalpost = presetByKey('goalpost').build({
      id: 'gp',
      name: 'Goalpost',
      newId: () => `gp${++n}`,
    });
    const g = isometricGeometry({ trailer: goalpost, width: 600 });
    expect(g.topBars.length).toBeGreaterThan(0);
    expect(geometry().topBars).toEqual([]);

    const off = isometricGeometry({
      trailer: SRA_BOYS_TRAILER,
      width: 600,
      shelves: SRA_BOYS_TRAILER.shelves.map((def) => ({
        def,
        active: def.tier !== 1,
        laneSlots: 1,
      })),
    });
    const arms = off.items.filter((i) => i.kind === 'arm').map((i) => i.arm);
    expect(arms.filter((a) => !a.active).every((a) => a.shelfId.endsWith('1'))).toBe(true);
    expect(arms.some((a) => !a.active)).toBe(true);
  });
});

describe('TrailerIsometric', () => {
  it('describes the load for screen readers and says what sticks out', () => {
    render(
      <TrailerIsometric
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={PLACEMENTS}
        boats={BOATS}
        width={800}
        selectedShellId="peggy"
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Boys trailer, isometric view' });
    expect(within(figure).getByText('Boys trailer, isometric view: 3 boats.')).toBeInTheDocument();
    const levels = within(figure)
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(levels).toEqual([
      'Level 5: Peggy (8+, 5.0 m past the front and 2.7 m past the back)',
      'Level 4: empty',
      'Level 3: Spencer (4+, 1.2 m past the back); Snoopy (4x, 0.8 m past the front)',
      'Level 2: empty',
      'Level 1: empty',
    ]);
    expect(
      within(figure).getByText(
        '3 boats stick out, up to 5.0 m past the front and 2.7 m past the back of the frame.',
      ),
    ).toBeInTheDocument();
    // The drawing itself is hidden from screen readers; the selected hull is outlined.
    const svg = figure.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.querySelector('[data-shell="peggy"] polygon.stroke-accent')).not.toBeNull();
    expect(svg.querySelector('[data-shell="spencer"] polygon.stroke-accent')).toBeNull();
    // Names go on hulls wide enough to hold them.
    expect(within(svg as unknown as HTMLElement).getByText('Peggy')).toBeInTheDocument();
  });

  it('draws a packed sample load and an empty trailer', () => {
    const boats = samplePackBoats(BOYS_2026_LOAD);
    const pack = packTrailer(SRA_BOYS_TRAILER, boats, SRA_DEFAULT_RULES, []);
    const { rerender } = render(
      <TrailerIsometric
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={pack.placements as Placement[]}
        boats={sampleEndViewBoats(BOYS_2026_LOAD)}
        width={640}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'Boys trailer, isometric view' });
    expect(figure.querySelectorAll('[data-shell]')).toHaveLength(pack.placements.length);

    rerender(
      <TrailerIsometric
        trailer={SRA_BOYS_TRAILER}
        rules={[...SRA_DEFAULT_RULES, makeRule('shelf-off', { shelfIds: ['l1'] }, 'regatta')]}
        width={640}
        label="Spare trailer"
      />,
    );
    const empty = screen.getByRole('figure', { name: 'Spare trailer' });
    expect(within(empty).getByText('Spare trailer: no boats.')).toBeInTheDocument();
    expect(empty.querySelector('figcaption')).toBeNull();
    expect(empty.querySelectorAll('line[stroke-dasharray]').length).toBeGreaterThan(0);
  });
});
