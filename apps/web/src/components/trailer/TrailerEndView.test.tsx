import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SRA_BOYS_TRAILER,
  SRA_DEFAULT_RULES,
  makeRule,
  packTrailer,
  type PackBoat,
  type Team,
} from '@srt/domain';
import { toEndViewBoats } from './boats';
import {
  BOYS_2026_LOAD,
  sampleEndViewBoats,
  samplePackBoats,
  sampleSheetPlacements,
} from './samples';
import { TrailerChip, TrailerEndView, laneKey } from './TrailerEndView';

const WIDTH = 640;
const boats = sampleEndViewBoats(BOYS_2026_LOAD);
const sheet = sampleSheetPlacements(BOYS_2026_LOAD, SRA_BOYS_TRAILER);
const idOf = (name: string) => boats.find((b) => b.name === name)!.shellId;

describe('TrailerEndView', () => {
  it('draws every shelf and a chip for each placement of a pack result', () => {
    const result = packTrailer(
      SRA_BOYS_TRAILER,
      samplePackBoats(BOYS_2026_LOAD),
      SRA_DEFAULT_RULES,
      [],
    );
    expect(result.unplaced).toEqual([]);
    const { container } = render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={result.placements}
        boats={boats}
        width={WIDTH}
      />,
    );
    expect(container.querySelectorAll('[data-shell]')).toHaveLength(12);
    const table = screen.getByRole('table');
    // 5 levels x (1 narrow + 2 wide) lanes, plus the bed row.
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 15 + 1);
    const eights = within(table).getAllByText(/, 8\+/);
    expect(eights.length).toBeGreaterThan(0);
    expect(screen.getByRole('group', { name: 'Boys trailer, end view' })).toBeInTheDocument();
    // Tier labels, captions, and the bed.
    // Drawn once, and once per lane in the description table.
    expect(screen.getAllByText('Level 5')).toHaveLength(1 + 3);
    expect(screen.getByText('Wide side (outer first)')).toBeInTheDocument();
    expect(screen.getByText('Riggers')).toBeInTheDocument();
    expect(screen.getByText('Oars and slings ahead')).toBeInTheDocument();
    expect(
      within(table).getByRole('row', { name: /^Bed Front to back: Slings/ }),
    ).toHaveTextContent(
      'Front to back: Slings, from the front to 3.0 m (3.0 m); Oars, 3.0 to 7.0 m from the front (4.0 m); Riggers, from 7.0 m to the back (5.2 m)',
    );
  });

  it('labels chips by where they sit and reports clicks', async () => {
    const onChipClick = vi.fn();
    render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={sheet}
        boats={boats}
        width={WIDTH}
        selectedShellId={idOf('Peggy')}
        onChipClick={onChipClick}
      />,
    );
    const waltar = screen.getByRole('button', {
      name: 'Level 5, wide side, outer lane: Waltar, 8+',
    });
    await userEvent.click(waltar);
    expect(onChipClick).toHaveBeenCalledWith(idOf('Waltar'), expect.anything());
    expect(screen.getByRole('button', { name: 'Level 5, narrow side: Peggy, 8+' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(waltar).toHaveAttribute('aria-pressed', 'false');
  });

  it('draws chips as pictures when nothing is clickable', () => {
    render(
      <TrailerEndView trailer={SRA_BOYS_TRAILER} placements={sheet} boats={boats} width={WIDTH} />,
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('cell', { name: 'Waltar, 8+' })).toBeInTheDocument();
  });

  it('offers lanes as buttons, and shows a refused drop with its reason', async () => {
    const onLaneClick = vi.fn();
    render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={sheet}
        boats={boats}
        width={WIDTH}
        onLaneClick={onLaneClick}
        laneActionLabel={(lane) => `Move here: ${lane.label}`}
        invalidCell={{ shelfId: 'r1', lane: 1, reason: 'Too long for level 1' }}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Move here: Level 1, wide side, inner lane' }),
    );
    expect(onLaneClick).toHaveBeenCalledWith({ shelfId: 'r1', lane: 0 }, expect.anything());
    expect(screen.getByRole('status')).toHaveTextContent('Too long for level 1');
  });

  it('hands lanes and chips to render props for drag and drop', () => {
    const renderLane = vi.fn((lane) => <div key={laneKey(lane)} data-testid="drop" />);
    const renderChip = vi.fn((chip, props) => (
      <TrailerChip key={chip.shellId} {...props} data-testid="drag" />
    ));
    render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={sheet}
        boats={boats}
        width={WIDTH}
        renderLane={renderLane}
        renderChip={renderChip}
      />,
    );
    expect(screen.getAllByTestId('drop')).toHaveLength(15);
    expect(screen.getAllByTestId('drag')).toHaveLength(12);
    const peggy = renderChip.mock.calls.find(([chip]) => chip.shellId === idOf('Peggy'))![0];
    expect(peggy.lane.label).toBe('Level 5, narrow side');
    expect(peggy.rect.width).toBeGreaterThan(40);
    // Render-prop chips are interactive: they get a button and a label.
    expect(
      screen.getByRole('button', { name: 'Level 5, narrow side: Peggy, 8+' }),
    ).toBeInTheDocument();
  });

  it('says when a shelf is not in use and flags a placement that breaks a rule', () => {
    render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={[...SRA_DEFAULT_RULES, makeRule('shelf-off', { shelfIds: ['l1', 'r1'] })]}
        placements={sheet}
        boats={boats}
        width={WIDTH}
        flagged={{ [idOf('Dan')]: 'Prefer fours on levels 3 and 2' }}
        onChipClick={() => {}}
      />,
    );
    // Drawn on both shelves, and in the description table for each of their three lanes.
    expect(screen.getAllByText('Not in use')).toHaveLength(2 + 3);
    expect(
      screen.getByRole('button', {
        name: 'Level 2, narrow side: Dan, 4+, breaks a rule: Prefer fours on levels 3 and 2',
      }),
    ).toBeInTheDocument();
  });

  it('draws a thumb as one labelled picture', () => {
    render(
      <TrailerEndView
        trailer={SRA_BOYS_TRAILER}
        rules={SRA_DEFAULT_RULES}
        placements={sheet}
        boats={boats}
        size="thumb"
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Boys trailer, end view: 5 levels, 15 lanes, 12 boats' }),
    ).toBeInTheDocument();
  });
});

describe('toEndViewBoats', () => {
  it('takes the team color from the team', () => {
    const packBoats: PackBoat[] = samplePackBoats(BOYS_2026_LOAD)
      .slice(0, 1)
      .map((b) => ({
        ...b,
        teamId: 'boys',
      }));
    const teams: Pick<Team, 'id' | 'name' | 'colorKey'>[] = [
      { id: 'boys', name: 'Junior boys', colorKey: 'navy' },
    ];
    expect(toEndViewBoats(packBoats, teams)[0]).toMatchObject({
      name: 'Peggy',
      cls: '8+',
      teamColor: 'navy',
      teamName: 'Junior boys',
    });
  });
});
