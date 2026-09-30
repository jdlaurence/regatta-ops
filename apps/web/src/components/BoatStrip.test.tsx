import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BOAT_CLASSES, isCoxed, rowingSeats, type BoatClass } from '@srt/domain';
import { BoatSeat, BoatStrip, boatStripSeats, seatLabel } from './BoatStrip';

const EXPECTED: Record<BoatClass, { rowers: number; cox: boolean; sweep: boolean }> = {
  '1x': { rowers: 1, cox: false, sweep: false },
  '2x': { rowers: 2, cox: false, sweep: false },
  '2-': { rowers: 2, cox: false, sweep: true },
  '2+': { rowers: 2, cox: true, sweep: true },
  '4x': { rowers: 4, cox: false, sweep: false },
  '4x+': { rowers: 4, cox: true, sweep: false },
  '4+': { rowers: 4, cox: true, sweep: true },
  '4-': { rowers: 4, cox: false, sweep: true },
  '8+': { rowers: 8, cox: true, sweep: true },
};

function seatsIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-seat]')].map((el) => el.getAttribute('data-seat')!);
}

describe('BoatStrip', () => {
  it.each(BOAT_CLASSES)('draws %s with its seats bow to stroke and the cox at the stern', (cls) => {
    const { container } = render(<BoatStrip boatClass={cls} />);
    const want = EXPECTED[cls];
    const rowing = Array.from({ length: want.rowers }, (_, i) => String(i + 1));
    expect(seatsIn(container)).toEqual(want.cox ? [...rowing, 'cox'] : rowing);
    expect(rowingSeats(cls)).toHaveLength(want.rowers);
    expect(isCoxed(cls)).toBe(want.cox);
    const group = screen.getByRole('group');
    expect(group).toHaveAccessibleName(
      `${cls} boat, 0 of ${want.rowers + (want.cox ? 1 : 0)} seats filled`,
    );
  });

  it.each(BOAT_CLASSES)('gives %s sweep seats a side and sculling seats none', (cls) => {
    const seats = boatStripSeats(cls);
    for (const s of seats) {
      if (s.isCox || !EXPECTED[cls].sweep) expect(s.side).toBeNull();
      else expect(s.side).toBe(Number(s.seat) % 2 === 0 ? 'port' : 'starboard');
    }
  });

  it('puts the cox at the bow for a bow-loaded shell', () => {
    const { container } = render(<BoatStrip boatClass="4+" coxPosition="bow" />);
    expect(seatsIn(container)).toEqual(['cox', '1', '2', '3', '4']);
  });

  it('labels seats for screen readers', () => {
    render(
      <BoatStrip
        boatClass="4+"
        label="Boys V4+"
        seats={{
          '3': { name: 'Lena Kim', shortName: 'Lena K.' },
          cox: { name: 'Ari Lee' },
        }}
        seatConflicts={{ '1': 'warning' }}
        conflict="error"
      />,
    );
    const group = screen.getByRole('group', { name: 'Boys V4+, 2 of 5 seats filled, has errors' });
    const text = within(group)
      .getAllByText(/^(Seat|Cox)/)
      .map((el) => el.textContent);
    expect(text).toEqual([
      'Seat 1, empty, has a warning',
      'Seat 2, empty',
      'Seat 3, Lena Kim, starboard',
      'Seat 4, empty',
      'Cox, Ari Lee',
    ]);
    expect(seatLabel('3', { name: 'Lena Kim' }, 'starboard')).toBe('Seat 3, Lena Kim, starboard');
    expect(seatLabel('3', null, 'starboard')).toBe('Seat 3, empty');
    expect(seatLabel('2', { name: 'Maya Park' }, null)).toBe('Seat 2, Maya Park');
  });

  it('shows short names at small sizes and full names at md', () => {
    const seats = { '1': { name: 'Ava Chen', shortName: 'Ava C.' } };
    const { rerender } = render(<BoatStrip boatClass="1x" size="sm" seats={seats} />);
    expect(screen.getByText('Ava C.')).toBeInTheDocument();
    rerender(<BoatStrip boatClass="1x" size="md" seats={seats} />);
    expect(screen.getByText('Ava Chen')).toBeInTheDocument();
    expect(screen.queryByText('Ava C.')).not.toBeInTheDocument();
  });

  it('makes seats buttons with click and keyboard callbacks', async () => {
    const user = userEvent.setup();
    const onSeatClick = vi.fn();
    const onSeatKeyDown = vi.fn();
    render(
      <BoatStrip
        boatClass="2-"
        seats={{ '2': { id: 'a1', name: 'Maya Park' } }}
        selectedSeat="2"
        onSeatClick={onSeatClick}
        onSeatKeyDown={onSeatKeyDown}
      />,
    );
    const seat2 = screen.getByRole('button', { name: 'Seat 2, Maya Park, port' });
    expect(seat2).toHaveAttribute('aria-pressed', 'true');
    await user.click(seat2);
    expect(onSeatClick.mock.calls[0]![0]).toMatchObject({ seat: '2', occupant: { id: 'a1' } });
    const seat1 = screen.getByRole('button', { name: 'Seat 1, empty' });
    seat1.focus();
    await user.keyboard('{Delete}');
    expect(onSeatKeyDown.mock.calls[0]![0]).toMatchObject({ seat: '1' });
    expect(onSeatKeyDown.mock.calls[0]![1].key).toBe('Delete');
  });

  it('lets renderSeat wrap each seat without forking the look', () => {
    const refs: string[] = [];
    render(
      <BoatStrip
        boatClass="4x"
        interactive
        renderSeat={(seat, props) => (
          <BoatSeat
            key={seat.seat}
            {...props}
            highlighted={seat.seat === '3'}
            data-droppable={seat.seat}
            ref={(el) => {
              if (el) refs.push(seat.seat);
            }}
          />
        )}
      />,
    );
    expect(refs).toEqual(['1', '2', '3', '4']);
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(document.querySelector('[data-droppable="3"]')).toHaveClass('bg-accent-tint');
  });
});
