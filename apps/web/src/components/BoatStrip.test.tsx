import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BOAT_CLASSES, isCoxed, rowingSeats, type BoatClass } from '@srt/domain';
import {
  BoatSeat,
  BoatStrip,
  boatStripSeats,
  seatLabel,
  stripSeatOrder,
  type BoatStripOrientation,
} from './BoatStrip';

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

const ORIENTATIONS: BoatStripOrientation[] = ['horizontal', 'vertical'];

function seatsIn(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-seat]')].map((el) => el.getAttribute('data-seat')!);
}

/** Cox first, then stroke (the highest seat) down to bow (1). */
function coxThenStrokeToBow(cls: BoatClass): string[] {
  const want = EXPECTED[cls];
  const rowing = Array.from({ length: want.rowers }, (_, i) => String(want.rowers - i));
  return want.cox ? ['cox', ...rowing] : rowing;
}

describe('BoatStrip', () => {
  describe.each(ORIENTATIONS)('%s', (orientation) => {
    it.each(BOAT_CLASSES)('draws %s with the cox first, then stroke down to bow', (cls) => {
      const { container } = render(<BoatStrip boatClass={cls} orientation={orientation} />);
      const want = EXPECTED[cls];
      expect(seatsIn(container)).toEqual(coxThenStrokeToBow(cls));
      expect(rowingSeats(cls)).toHaveLength(want.rowers);
      expect(isCoxed(cls)).toBe(want.cox);
      const group = screen.getByRole('group');
      expect(group).toHaveAttribute('data-orientation', orientation);
      expect(group).toHaveAccessibleName(
        `${cls} boat, 0 of ${want.rowers + (want.cox ? 1 : 0)} seats filled`,
      );
    });

    it('keeps the cox first for a bow-loaded shell, as the club sheets list it', () => {
      const { container } = render(
        <BoatStrip boatClass="4+" coxPosition="bow" orientation={orientation} />,
      );
      expect(seatsIn(container)).toEqual(['cox', '4', '3', '2', '1']);
    });

    it('labels seats for screen readers in reading order', () => {
      render(
        <BoatStrip
          boatClass="4+"
          orientation={orientation}
          label="Boys V4+"
          seats={{
            '3': { name: 'Lena Kim', shortName: 'Lena K.' },
            cox: { name: 'Ari Lee' },
          }}
          seatConflicts={{ '1': 'warning' }}
          conflict="error"
        />,
      );
      const group = screen.getByRole('group', {
        name: 'Boys V4+, 2 of 5 seats filled, has errors',
      });
      const text = within(group)
        .getAllByText(/^(Seat|Cox)/)
        .map((el) => el.textContent);
      expect(text).toEqual([
        'Cox, Ari Lee',
        'Seat 4, empty',
        'Seat 3, Lena Kim, starboard',
        'Seat 2, empty',
        'Seat 1, empty, has a warning',
      ]);
    });

    it('marks empty seats and shows their numbers', () => {
      const { container } = render(
        <BoatStrip
          boatClass="2-"
          orientation={orientation}
          seats={{ '2': { name: 'Maya Park' } }}
        />,
      );
      const empty = container.querySelector('[data-seat="1"]')!;
      expect(empty).toHaveAttribute('data-empty', '');
      expect(within(empty as HTMLElement).getByText('1')).toBeInTheDocument();
      expect(container.querySelector('[data-seat="2"]')).not.toHaveAttribute('data-empty');
    });

    it('makes seats buttons with click and keyboard callbacks', async () => {
      const user = userEvent.setup();
      const onSeatClick = vi.fn();
      const onSeatKeyDown = vi.fn();
      render(
        <BoatStrip
          boatClass="2-"
          orientation={orientation}
          seats={{ '2': { id: 'a1', name: 'Maya Park' } }}
          selectedSeat="2"
          onSeatClick={onSeatClick}
          onSeatKeyDown={onSeatKeyDown}
        />,
      );
      expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
        'Seat 2, Maya Park, port',
        'Seat 1, empty',
      ]);
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
      const orientations: (BoatStripOrientation | undefined)[] = [];
      render(
        <BoatStrip
          boatClass="4x"
          orientation={orientation}
          interactive
          renderSeat={(seat, props) => {
            orientations.push(props.orientation);
            return (
              <BoatSeat
                key={seat.seat}
                {...props}
                highlighted={seat.seat === '3'}
                data-droppable={seat.seat}
                ref={(el) => {
                  if (el) refs.push(seat.seat);
                }}
              />
            );
          }}
        />,
      );
      expect(refs).toEqual(['4', '3', '2', '1']);
      expect(orientations).toEqual([orientation, orientation, orientation, orientation]);
      expect(screen.getAllByRole('button')).toHaveLength(4);
      expect(document.querySelector('[data-droppable="3"]')).toHaveClass('bg-accent-tint');
    });
  });

  it.each(BOAT_CLASSES)('gives %s sweep seats a side and sculling seats none', (cls) => {
    const seats = boatStripSeats(cls);
    expect(seats.map((s) => s.seat)).toEqual(stripSeatOrder(cls));
    expect(seats.map((s) => s.index)).toEqual(seats.map((_, i) => i));
    for (const s of seats) {
      if (s.isCox || !EXPECTED[cls].sweep) expect(s.side).toBeNull();
      else expect(s.side).toBe(Number(s.seat) % 2 === 0 ? 'port' : 'starboard');
    }
  });

  it('draws rigger ticks on the side they are on, as seen from above', () => {
    // Horizontal, bow to the right: port is the top edge. Vertical, bow down: port is the right.
    const { container, rerender } = render(<BoatStrip boatClass="2-" />);
    const tick = (seat: string) =>
      container.querySelector(`[data-seat="${seat}"] > span.bg-team`) as HTMLElement;
    expect(tick('2')).toHaveClass('top-0');
    expect(tick('1')).toHaveClass('bottom-0');
    rerender(<BoatStrip boatClass="2-" orientation="vertical" />);
    expect(tick('2')).toHaveClass('right-0');
    expect(tick('1')).toHaveClass('left-0');
  });

  it('keeps labels the same in both orientations', () => {
    expect(seatLabel('3', { name: 'Lena Kim' }, 'starboard')).toBe('Seat 3, Lena Kim, starboard');
    expect(seatLabel('3', null, 'starboard')).toBe('Seat 3, empty');
    expect(seatLabel('2', { name: 'Maya Park' }, null)).toBe('Seat 2, Maya Park');
    expect(seatLabel('cox', { name: 'Ari Lee' }, null, 'info')).toBe('Cox, Ari Lee, has a note');
  });

  it('shows short names at small sizes and full names at md', () => {
    const seats = { '1': { name: 'Ava Chen', shortName: 'Ava C.' } };
    const { rerender } = render(<BoatStrip boatClass="1x" size="sm" seats={seats} />);
    expect(screen.getByText('Ava C.')).toBeInTheDocument();
    rerender(<BoatStrip boatClass="1x" size="md" seats={seats} />);
    expect(screen.getByText('Ava Chen')).toBeInTheDocument();
    expect(screen.queryByText('Ava C.')).not.toBeInTheDocument();
    rerender(<BoatStrip boatClass="1x" size="md" orientation="vertical" seats={seats} />);
    expect(screen.getByText('Ava Chen')).toBeInTheDocument();
  });

  it('shows the conflict icon in the stern of a vertical hull, or not at all', () => {
    const { container, rerender } = render(
      <BoatStrip boatClass="4x" orientation="vertical" conflict="warning" />,
    );
    expect(container.querySelectorAll('svg.text-warn')).toHaveLength(1);
    rerender(
      <BoatStrip
        boatClass="4x"
        orientation="vertical"
        conflict="warning"
        showConflictIcon={false}
      />,
    );
    expect(container.querySelectorAll('svg.text-warn')).toHaveLength(0);
    expect(screen.getByRole('group')).toHaveAccessibleName(/has warnings$/);
  });
});
