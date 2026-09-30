import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { ActivityEntry } from '@srt/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { ActivityFeed, activityLink } from './ActivityFeed';

function wrap(store: MemoryStore) {
  const Data = dataWrapper(store);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter>
        <Data>{children}</Data>
      </MemoryRouter>
    );
  };
}

function tickingStore() {
  let t = 0;
  return fixtureStore({ now: () => new Date(Date.now() - 600_000 + 1000 * t++).toISOString() });
}

const row = (p: Partial<ActivityEntry>): ActivityEntry => ({
  id: 'activity0000001',
  regattaId: IDS.regatta,
  actorId: IDS.admin,
  action: 'update',
  targetType: 'entries',
  targetId: IDS.entry1,
  summary: 'did something',
  ...p,
});

describe('activityLink', () => {
  const base = `/regattas/${IDS.regatta}`;
  const lookups = {
    entries: new Map([[IDS.entry1, { id: IDS.entry1, teamId: IDS.boys }]]),
    seats: new Map([['seatentry1s0001', { id: 'seatentry1s0001', entryId: IDS.entry1 }]]),
    loadPlans: new Map([[IDS.plan, { id: IDS.plan, trailerId: IDS.trailer }]]),
    placements: new Map([['placement000001', { id: 'placement000001', loadPlanId: IDS.plan }]]),
  };

  it('opens an entry or a seat on its team’s lineups', () => {
    const lineup = {
      href: `${base}/lineups/${IDS.boys}?entry=${IDS.entry1}`,
      label: 'Open lineup',
    };
    expect(activityLink(row({}), lookups)).toEqual(lineup);
    expect(activityLink(row({ targetType: 'entry' }), lookups)).toEqual(lineup);
    expect(
      activityLink(row({ targetType: 'entry_seats', targetId: 'seatentry1s0001' }), lookups),
    ).toEqual(lineup);
    // A deleted seat is found through its diff.
    expect(
      activityLink(
        row({
          action: 'delete',
          targetType: 'entry_seats',
          targetId: 'seatgone0000001',
          diff: { entryId: { from: IDS.entry1, to: null } },
        }),
        lookups,
      ),
    ).toEqual(lineup);
  });

  it('has no link when the target is gone', () => {
    expect(activityLink(row({ action: 'delete' }), lookups)).toBeNull();
    expect(activityLink(row({ targetId: 'entrygone000001' }), lookups)).toBeNull();
    expect(activityLink(row({ targetType: 'comments' }), lookups)).toBeNull();
  });

  it('opens the schedule, trailer, load list, availability, and fleet', () => {
    expect(activityLink(row({ targetType: 'events', targetId: IDS.event1 }))).toEqual({
      href: `${base}/schedule?event=${IDS.event1}`,
      label: 'Open schedule',
    });
    expect(
      activityLink(row({ targetType: 'load_placements', targetId: 'placement000001' }), lookups),
    ).toEqual({ href: `${base}/trailer/${IDS.trailer}`, label: 'Open trailer' });
    expect(activityLink(row({ targetType: 'load_placements', targetId: 'x' }))!.href).toBe(
      `${base}/trailer`,
    );
    expect(activityLink(row({ targetType: 'load_items' }))!.href).toBe(`${base}/load`);
    expect(activityLink(row({ targetType: 'availability' }))!.href).toBe(`${base}/availability`);
    expect(activityLink(row({ targetType: 'shells', regattaId: null }))!.href).toBe(
      '/fleet/shells',
    );
  });
});

describe('ActivityFeed', () => {
  it('lists a regatta’s changes newest first, with names, times, and links', async () => {
    const store = tickingStore();
    await store.update('entries', IDS.entry1, { shellId: IDS.shell2 });
    await store.update('events', IDS.event2, { name: "Men's Junior 8+ final" });
    render(<ActivityFeed regattaId={IDS.regatta} />, { wrapper: wrap(store) });

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Casey Coach renamed Event 14 to Men's Junior 8+ final");
    expect(within(items[0]!).getByRole('link', { name: 'Open schedule' })).toHaveAttribute(
      'href',
      `/regattas/${IDS.regatta}/schedule?event=${IDS.event2}`,
    );
    expect(items[1]).toHaveTextContent('Casey Coach set the shell of Boys V4+ to Monahan');
    expect(within(items[1]!).getByRole('link', { name: 'Open lineup' })).toHaveAttribute(
      'href',
      `/regattas/${IDS.regatta}/lineups/${IDS.boys}?entry=${IDS.entry1}`,
    );
    expect(items[1]!.querySelector('time')).toHaveTextContent('10 min ago');
  });

  it('pages with "Show more" and updates live', async () => {
    const store = tickingStore();
    for (const label of ['A', 'B', 'C']) await store.update('entries', IDS.entry1, { label });
    render(<ActivityFeed regattaId={IDS.regatta} pageSize={2} />, { wrapper: wrap(store) });
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();

    await act(() => store.update('entries', IDS.entry1, { status: 'confirmed' }));
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(4));
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('marked entry Boys C confirmed');
  });

  it('says what to do when nothing has happened yet', async () => {
    const store = fixtureStore();
    render(<ActivityFeed regattaId={IDS.regatta} />, { wrapper: wrap(store) });
    expect(
      await screen.findByText(/No changes yet\. Edits to entries, events, availability/),
    ).toBeVisible();
  });

  it('names the regatta in the club-wide feed', async () => {
    const store = tickingStore();
    await store.update('events', IDS.event1, { name: 'Renamed' });
    render(<ActivityFeed regattaId={null} title="Recent changes" />, { wrapper: wrap(store) });
    expect(await screen.findByRole('heading', { name: 'Recent changes' })).toBeVisible();
    const [item] = await screen.findAllByRole('listitem');
    await waitFor(() => expect(item).toHaveTextContent('Head of the Lake'));
  });
});
