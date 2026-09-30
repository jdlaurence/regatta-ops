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
  bedSummary,
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

describe('isometric bed zones', () => {
  it('lays the zones along the bed, front to back, each across its full width', () => {
    const g = geometry([], 800);
    expect(g.zones.map((z) => [z.label, z.startCm, z.endCm])).toEqual([
      ['Slings', 0, 300],
      ['Oars', 300, 700],
      ['Riggers', 700, 1220],
    ]);
    const [slings, oars, riggers] = g.zones;
    // Along the length: the front is up and to the right, so each zone ahead is further right.
    expect(slings!.top[0]!.x).toBeGreaterThan(oars!.top[0]!.x);
    expect(oars!.top[0]!.x).toBeGreaterThan(riggers!.top[0]!.x);
    // Across the full width: from near the far edge of the bed to near its near edge.
    const bedDepth = g.bedTop[3]!.y - g.bedTop[0]!.y;
    expect(riggers!.top[3]!.y - riggers!.top[0]!.y).toBeGreaterThan(bedDepth * 0.9);
    // A divider down the near side between zones, none at the back.
    expect(slings!.divider).not.toBeNull();
    expect(riggers!.divider).toBeNull();
    // Names hang under the frame clear of the wheels (behind them, for the riggers).
    const wheel = g.wheels[1]!;
    expect(riggers!.name!.at.x).toBeLessThan(wheel.cx - wheel.r);
    for (const z of g.zones) expect(z.name!.at.y + 18).toBeLessThanOrEqual(g.height);
    expect(bedSummary(g.zones)).toBe(
      'Bed, front to back: slings (3.0 m), oars (4.0 m), and riggers (5.2 m).',
    );
    expect(bedSummary([])).toBeNull();
  });

  it('draws the zone names that fit, and shares the width between whole-length boxes', () => {
    render(<TrailerIsometric trailer={SRA_BOYS_TRAILER} rules={SRA_DEFAULT_RULES} width={800} />);
    const svg = screen.getByRole('figure').querySelector('svg')!;
    expect(svg.querySelectorAll('[data-zone]')).toHaveLength(3);
    for (const name of ['Slings', 'Oars', 'Riggers']) {
      expect(within(svg as unknown as HTMLElement).getByText(name)).toBeInTheDocument();
    }

    const two: TrailerDef = {
      ...SRA_BOYS_TRAILER,
      compartments: [
        { id: 'a', kind: 'oar_box', label: 'Oar box', capacity: 64 },
        { id: 'b', kind: 'rigger_rack', label: 'Rigger rack', capacity: 40 },
      ],
    };
    const g = isometricGeometry({ trailer: two, width: 800 });
    const [a, b] = g.zones;
    // Side by side across the width: the second (nearer) one lower on screen at the same point.
    expect(b!.top[0]!.y).toBeGreaterThan(a!.top[3]!.y - 1);
    expect(a!.name).toBeNull();
    expect(b!.name).not.toBeNull();
    expect(bedSummary(g.zones)).toBe(
      'Bed, front to back: oar box (whole length) and rigger rack (whole length).',
    );
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
    // No overhang to report; the caption names the bed's zones.
    expect(empty.querySelector('figcaption')).toHaveTextContent(
      /^Bed, front to back: slings \(3\.0 m\), oars \(4\.0 m\), and riggers \(5\.2 m\)\.$/,
    );
    expect(empty.querySelectorAll('line[stroke-dasharray]').length).toBeGreaterThan(0);
  });
});
