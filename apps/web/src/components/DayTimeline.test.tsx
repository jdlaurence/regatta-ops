import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  effectiveSettings,
  findConflicts,
  zonedToInstant,
  type ConflictInput,
} from '@regatta-ops/domain';
import { buildSeedWorld } from '@regatta-ops/seed';
import { DayTimeline } from './DayTimeline';
import { axisMinutes, buildTimeline, timeToX } from './timeline-lib';

const { world } = buildSeedWorld();
const hotl = world.regattas.find((r) => r.name === 'Head of the Lake')!;
const DAY = '2026-11-01';

function hotlInput(): ConflictInput {
  const entries = world.entries.filter((e) => e.regattaId === hotl.id);
  const ids = new Set(entries.map((e) => e.id));
  return {
    settings: effectiveSettings(hotl, world.club_settings[0]),
    timezone: hotl.timezone,
    seasonYear: 2026,
    events: world.events.filter((e) => e.regattaId === hotl.id),
    entries,
    seats: world.entry_seats.filter((s) => ids.has(s.entryId)),
    athletes: world.athletes,
    availability: [],
    shells: world.shells,
    oarSets: world.oar_sets,
    teams: world.teams,
  };
}

const input = hotlInput();
const findings = findConflicts(input);
const bars = () => screen.getAllByRole('button').filter((b) => b.hasAttribute('data-entry-id'));

describe('DayTimeline', () => {
  it('draws a labelled bar per scheduled entry, with hot seats and conflicts in the names', () => {
    render(<DayTimeline input={input} findings={findings} day={DAY} onBarClick={() => {}} />);
    const timeline = screen.getByRole('group', { name: `Timeline for ${DAY}` });
    expect(bars()).toHaveLength(24);
    expect(within(timeline).getByText('Shell')).toBeInTheDocument();
    expect(within(timeline).getByText('9:00')).toBeInTheDocument();
    // Kokanee: Boys V4+ at 11:15 and Evening M4+ at 11:45 collide.
    const boys = screen.getByRole('button', { name: /^Boys V4\+, .*at 11:15, Kokanee/ });
    expect(boys).toHaveAccessibleName(/conflict with Evening M4\+$/);
    // Hendo: a hot seat between Girls V8 B and 5am W8.
    expect(screen.getByRole('button', { name: /^5am W8, .*Hendo/ })).toHaveAccessibleName(
      /hot seat with Girls V8 B, 25 minutes$/,
    );
    expect(screen.getByRole('list', { name: 'Timeline key' })).toBeInTheDocument();
  });

  it('is one tab stop, with arrow keys moving between bars and Enter opening one', async () => {
    const user = userEvent.setup();
    const onBarClick = vi.fn();
    render(<DayTimeline input={input} findings={findings} day={DAY} onBarClick={onBarClick} />);
    expect(bars().filter((b) => b.tabIndex === 0)).toHaveLength(1);
    await user.tab();
    const first = document.activeElement as HTMLElement;
    expect(first.dataset.entryId).toBeTruthy();
    await user.keyboard('{ArrowRight}');
    const second = document.activeElement as HTMLElement;
    expect(second).not.toBe(first);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(first);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(bars().find((b) => b.tabIndex === 0));
    await user.keyboard('{Enter}');
    expect(onBarClick).toHaveBeenCalledTimes(1);
    const [entryId, bar] = onBarClick.mock.calls[0]!;
    expect(entryId).toBe((document.activeElement as HTMLElement).dataset.entryId);
    expect(bar.teamId).toBeTruthy();
  });

  it('opens an entry on click', async () => {
    const user = userEvent.setup();
    const onBarClick = vi.fn();
    render(<DayTimeline input={input} findings={findings} day={DAY} onBarClick={onBarClick} />);
    await user.click(screen.getByRole('button', { name: /^Boys V4\+, .*at 11:15/ }));
    expect(onBarClick.mock.calls[0]![1]).toMatchObject({ label: 'Boys V4+', raceClock: '11:15' });
  });

  it('draws the now-line only on race day, inside the day', () => {
    const now = zonedToInstant(DAY, '10:05', hotl.timezone);
    const { rerender } = render(
      <DayTimeline input={input} findings={findings} day={DAY} now={now} />,
    );
    expect(screen.getByText('Now: 10:05.')).toBeInTheDocument();
    rerender(
      <DayTimeline
        input={input}
        findings={findings}
        day={DAY}
        now={zonedToInstant('2026-11-02', '10:05', hotl.timezone)}
      />,
    );
    expect(screen.queryByText(/^Now:/)).toBeNull();
  });

  it('groups rows by team or oar set', () => {
    const { rerender } = render(
      <DayTimeline input={input} findings={findings} day={DAY} groupBy="team" />,
    );
    expect(screen.getByText('Team')).toBeInTheDocument();
    expect(screen.getAllByText('Boys').length).toBeGreaterThan(0);
    rerender(<DayTimeline input={input} findings={findings} day={DAY} groupBy="oar_set" />);
    expect(screen.getByText('Oar set')).toBeInTheDocument();
  });

  it('says so when the day has nothing scheduled', () => {
    render(
      <DayTimeline input={input} findings={findings} day="2026-11-02" emptyText="Nothing today." />,
    );
    expect(screen.getByRole('group', { name: 'Timeline for 2026-11-02' })).toHaveTextContent(
      'Nothing today.',
    );
  });

  it('has a compact mode for the overview, clickable when given a handler', async () => {
    const user = userEvent.setup();
    const onBarClick = vi.fn();
    const { rerender } = render(
      <DayTimeline input={input} findings={findings} day={DAY} mini label="Day at a glance" />,
    );
    const group = screen.getByRole('group', { name: 'Day at a glance' });
    expect(within(group).queryAllByRole('button')).toHaveLength(0);
    expect(within(group).getByText('9:00')).toBeInTheDocument();
    rerender(
      <DayTimeline
        input={input}
        findings={findings}
        day={DAY}
        mini
        label="Day at a glance"
        onBarClick={onBarClick}
      />,
    );
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(24);
    await user.click(buttons[0]!);
    expect(onBarClick).toHaveBeenCalledTimes(1);
  });
  it('shows a hover card for the bar under the pointer in the compact mode', () => {
    const model = buildTimeline(input, findings, { day: DAY });
    const minutes = axisMinutes(model.axis!);
    // The first row's first bar, in lane 0 (the mini row pads 1 px, then a 7 px lane).
    const bar = model.bars.find((b) => b.rowId === model.rows[0]!.id && b.lane === 0)!;
    render(<DayTimeline input={input} findings={findings} day={DAY} mini onBarClick={() => {}} />);
    const svg = document.querySelector('svg[viewBox]') as SVGSVGElement;
    // One px per minute, so plot x is the pointer's clientX.
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: minutes, height: 100, right: minutes, bottom: 100 }) as DOMRect;
    const mid = (timeToX(bar.busyStart, model.axis!, 1) + timeToX(bar.busyEnd, model.axis!, 1)) / 2;
    fireEvent.pointerMove(svg, { clientX: mid, clientY: 4, pointerType: 'mouse' });
    const card = document.querySelector('[data-slot="timeline-hover-card"]') as HTMLElement;
    expect(card).toHaveTextContent(bar.details.name);
    expect(card).toHaveTextContent(`Busy${bar.details.busy}`);
    expect(card).toHaveTextContent('Click to open the entry');
    fireEvent.pointerLeave(svg);
    expect(document.querySelector('[data-slot="timeline-hover-card"]')).toBeNull();
  });

  it('shows the hover card on keyboard focus, with the bar’s conflicts and hot seats', async () => {
    const user = userEvent.setup();
    render(<DayTimeline input={input} findings={findings} day={DAY} mini onBarClick={() => {}} />);
    await user.tab();
    const card = () => document.querySelector('[data-slot="timeline-hover-card"]');
    expect(card()).not.toBeNull();
    const boys = screen.getByRole('button', { name: /^Boys V4\+, .*at 11:15, Kokanee/ });
    expect(boys).toHaveAccessibleName(/conflict with Evening M4\+$/);
    act(() => boys.focus());
    expect(card()).toHaveTextContent('Boys V4+');
    expect(card()).toHaveTextContent('ShellKokanee');
    expect(card()).toHaveTextContent('Conflict with Evening M4+');
    await user.keyboard('{Escape}');
    expect(card()).toBeNull();
  });
});
