import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SEED_REGATTA_IDS, SEED_TEAM_IDS } from '@regatta-ops/seed';
import type { PublishedSnapshot } from '@regatta-ops/domain';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import { seedStore } from '@/features/print/test-helpers';
import { PublishStatus } from './PublishStatus';

describe('PublishStatus', () => {
  it('publishes a team for the first time after confirming', async () => {
    const user = userEvent.setup();
    const store = fixtureStore();
    render(<PublishStatus regattaId={IDS.regatta} teamId={IDS.boys} />, {
      wrapper: dataWrapper(store),
    });
    expect(await screen.findByText('Not published yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish lineups' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish lineups' });
    expect(within(dialog).getByText('This publishes 1 entry for Junior boys.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Publish lineups' }));

    await waitFor(async () => {
      const rt = await store.get('regatta_teams', 'rtboys000000001');
      expect(rt?.publishedAt).toBeTruthy();
    });
    const rt = (await store.get('regatta_teams', 'rtboys000000001'))!;
    const snap = rt.publishedSnapshot as PublishedSnapshot;
    expect(snap.publishedAt).toBe(rt.publishedAt);
    expect(snap.publishedBy).toBe(IDS.coach);
    expect(snap.entries.map((e) => e.label)).toEqual(['V4+']);
    expect(snap.entries[0]!.seats.find((s) => s.seat === '1')?.athleteName).toBe('Rowan Test');
    expect(await screen.findByText('just now')).toBeInTheDocument();
    expect(screen.getByText('no changes since')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // A seat changes in the draft: the count and the list follow.
    await store.update('entry_seats', 'seatentry1s0001', { athleteId: 'athboys00000002' });
    const trigger = await screen.findByRole('button', { name: '1 change since' });
    await user.click(trigger);
    expect(await screen.findByText('Seat 1 of V4+: Rowan Test → Emery Sample')).toBeInTheDocument();
  });

  it('shows the seeded changes since the boys published, and lists them in the dialog', async () => {
    const user = userEvent.setup();
    const store = seedStore(1); // the boys' coach
    render(<PublishStatus regattaId={SEED_REGATTA_IDS.nwYouth2025} teamId={SEED_TEAM_IDS.boys} />, {
      wrapper: dataWrapper(store),
    });
    const trigger = await screen.findByRole(
      'button',
      { name: '1 change since' },
      { timeout: 5000 },
    );
    expect(screen.getByText(/^Published/)).toBeInTheDocument();
    await user.hover(trigger);
    expect(await screen.findByText(/^Seat 1 of V8 \(Fri 8:00 AM\):/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Publish lineups' }));
    const dialog = await screen.findByRole('dialog', { name: 'Publish lineups' });
    expect(within(dialog).getByText('1 change since the last publish')).toBeInTheDocument();
    expect(within(dialog).getByText(/^Seat 1 of V8/)).toBeInTheDocument();
  });

  it('lets viewers see the status without the publish button', async () => {
    const store = fixtureStore({ signedIn: IDS.viewer });
    render(<PublishStatus regattaId={IDS.regatta} teamId={IDS.boys} />, {
      wrapper: dataWrapper(store),
    });
    expect(await screen.findByText('Not published yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish lineups' })).not.toBeInTheDocument();
  });

  it('renders nothing for a team that is not in the regatta', async () => {
    const store = fixtureStore();
    const { container } = render(<PublishStatus regattaId={IDS.regatta} teamId={IDS.masters} />, {
      wrapper: dataWrapper(store),
    });
    await waitFor(() => expect(container.querySelector('[aria-hidden]')).toBeNull());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
