import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  SRA_GIRLS_TRAILER,
  type TrailerDef,
} from '@srt/domain';
import { bedPlanGeometry } from './plan';
import { PlanView, type PlanLevel } from './PlanView';

describe('bedPlanGeometry', () => {
  it('draws the frame with the zones along it, to scale, front at the left', () => {
    const g = bedPlanGeometry({ def: SRA_BOYS_TRAILER, width: 800 });
    expect(g.frame.x2 - g.frame.x1).toBeCloseTo(1220 * g.pxPerCm, 5);
    expect(g.zones.map((z) => [z.label, z.note, z.startCm, z.endCm])).toEqual([
      ['Slings', null, 0, 300],
      ['Oars', null, 300, 700],
      ['Riggers', 'back of the bed, full width', 700, 1220],
    ]);
    const [slings, oars, riggers] = g.zones;
    // Front to back, inside the frame, each across the bed's full width.
    expect(slings!.x).toBeGreaterThan(g.frame.x1);
    expect(oars!.x).toBeGreaterThan(slings!.x + slings!.width);
    expect(riggers!.x).toBeGreaterThan(oars!.x + oars!.width);
    expect(riggers!.x + riggers!.width).toBeLessThan(g.frame.x2);
    expect(riggers!.width).toBeCloseTo(520 * g.pxPerCm - 5, 5);
    for (const z of g.zones) {
      expect(z.y).toBeCloseTo(g.frame.y1 + 4, 5);
      expect(z.height).toBeCloseTo(g.frame.y2 - g.frame.y1 - 8, 5);
      expect(z.shared).toBe(false);
    }
    expect(riggers!.words).toBe('Riggers, from 7.0 m to the back (5.2 m)');
    expect(g.width).toBe(800);
  });

  it('keeps the zones legible on a phone', () => {
    const g = bedPlanGeometry({ def: SRA_GIRLS_TRAILER, width: 334 });
    expect(g.gutter).toBe(64);
    // The shortest zone still fits its name and length.
    expect(Math.min(...g.zones.map((z) => z.width))).toBeGreaterThan(48);
    expect(g.zones[2]!.x + g.zones[2]!.width).toBeLessThanOrEqual(g.width);
  });

  it('stacks compartments that share the bed and says which run the whole length', () => {
    const def: TrailerDef = {
      ...SRA_BOYS_TRAILER,
      compartments: [
        { id: 'box', kind: 'oar_box', label: 'Oar box', capacity: 64 },
        {
          id: 'rig',
          kind: 'rigger_rack',
          label: 'Riggers',
          capacity: 40,
          startCm: 900,
          endCm: 1220,
        },
      ],
    };
    const g = bedPlanGeometry({ def, width: 800 });
    const [box, rig] = g.zones;
    expect(box).toMatchObject({ note: 'whole length', positioned: false, shared: true });
    expect(rig).toMatchObject({ note: 'back of the bed', shared: true });
    expect(rig!.y).toBeGreaterThan(box!.y + box!.height);
  });
});

function Harness({ trailer = SRA_BOYS_TRAILER }: { trailer?: TrailerDef }) {
  const [level, setLevel] = useState<PlanLevel>(5);
  return (
    <PlanView
      trailer={trailer}
      rules={SRA_DEFAULT_RULES}
      placements={[]}
      boatById={new Map()}
      teamColors={new Map()}
      selectedShellId={null}
      onSelect={() => {}}
      level={level}
      onLevelChange={setLevel}
    />
  );
}

describe('PlanView', () => {
  it('offers the bed below the levels and draws its zones with their lengths', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const levels = screen.getByRole('radiogroup', { name: 'Level to show' });
    expect(
      within(levels)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Level 5', 'Level 4', 'Level 3', 'Level 2', 'Level 1', 'Bed']);
    expect(screen.getByRole('group', { name: 'Level 5 from above' })).toBeInTheDocument();

    await user.click(within(levels).getByRole('radio', { name: 'Bed' }));
    const bed = screen.getByRole('group', { name: 'Bed from above' });
    expect(within(bed).getByText('Riggers')).toBeInTheDocument();
    expect(within(bed).getByText('Back of the bed, full width')).toBeInTheDocument();
    expect(within(bed).getByText('5.2 m')).toBeInTheDocument();
    expect(within(bed).getByText('Slings')).toBeInTheDocument();
    expect(within(bed).getByText('3.0 m')).toBeInTheDocument();
    expect(within(bed).getByText('Frame 12.2 m')).toBeInTheDocument();
    // Screen readers get each zone in words, front to back.
    expect(
      within(bed)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Slings, from the front to 3.0 m (3.0 m)',
      'Oars, 3.0 to 7.0 m from the front (4.0 m)',
      'Riggers, from 7.0 m to the back (5.2 m), back of the bed, full width',
    ]);
    expect(screen.getByText(/Each zone spans the bed’s full width/)).toBeInTheDocument();
  });

  it('says what to do when nothing rides in the bed', async () => {
    const user = userEvent.setup();
    render(<Harness trailer={{ ...SRA_BOYS_TRAILER, compartments: [] }} />);
    await user.click(screen.getByRole('radio', { name: 'Bed' }));
    expect(screen.getByText(/Nothing is set to ride in the bed yet/)).toBeInTheDocument();
  });
});
