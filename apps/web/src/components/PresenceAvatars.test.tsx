import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fixtureStore, IDS } from '@/test/fixtures';
import { dataWrapper } from '@/test/render';
import type { MemoryStore } from '@/data/memory-store';
import { TooltipProvider } from './ui/menu';
import { PresenceAvatars } from './PresenceAvatars';

function wrap(store: MemoryStore) {
  const Data = dataWrapper(store);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Data>
        <TooltipProvider>{children}</TooltipProvider>
      </Data>
    );
  };
}

async function arrive(store: MemoryStore, userId: string, page = 'schedule', teamId?: string) {
  await store.create('presence', {
    userId,
    regattaId: IDS.regatta,
    page,
    teamId: teamId ?? null,
    seenAt: new Date().toISOString(),
  });
}

const EXTRA = ['Pat Quill', 'Robin Sato', 'Jordan Vance', 'Kai Lund'];

async function addUsers(store: MemoryStore) {
  const ids: string[] = [];
  for (const [i, name] of EXTRA.entries()) {
    const u = await store.create('users', {
      id: `userextra00000${i}`,
      name,
      email: `extra${i}@srt.local`,
      role: 'coach',
      preferences: {},
    });
    ids.push(u.id);
  }
  return ids;
}

describe('PresenceAvatars', () => {
  it('shows nothing when the coach is alone', async () => {
    const store = fixtureStore();
    await arrive(store, IDS.coach); // me
    const { container } = render(<PresenceAvatars regattaId={IDS.regatta} />, {
      wrapper: wrap(store),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('names everyone else in its label and lists them on click', async () => {
    const store = fixtureStore();
    await arrive(store, IDS.admin, 'lineups', IDS.girls);
    await arrive(store, IDS.viewer, 'schedule');
    render(<PresenceAvatars regattaId={IDS.regatta} />, { wrapper: wrap(store) });
    const button = await screen.findByRole('button', {
      name: /2 other people on this regatta: Alex A\., editing Girls lineups; Vic V\., viewing the schedule/,
    });
    expect(button).toHaveTextContent('AA');
    expect(button).toHaveTextContent('VV');

    await userEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'On this regatta now' })).toBeVisible();
    expect(screen.getByText('Alex Admin')).toBeVisible();
    expect(screen.getByText(/editing Girls lineups · just now/)).toBeVisible();
  });

  it('shows four avatars and then a count', async () => {
    const store = fixtureStore();
    const extra = await addUsers(store);
    for (const id of [IDS.admin, IDS.viewer, ...extra]) await arrive(store, id);
    render(<PresenceAvatars regattaId={IDS.regatta} />, { wrapper: wrap(store) });
    const button = await screen.findByRole('button', { name: /^6 other people/ });
    expect(button).toHaveTextContent('+2');
    // Name order: Alex, Jordan, Kai, Pat, then +2 (Robin, Vic).
    expect(button.textContent).toBe('AAJVKLPQ+2');
  });

  it('shows only a count when compact', async () => {
    const store = fixtureStore();
    await arrive(store, IDS.admin);
    render(<PresenceAvatars regattaId={IDS.regatta} compact />, { wrapper: wrap(store) });
    const button = await screen.findByRole('button', { name: /^1 other person on this regatta/ });
    expect(button.textContent).toBe('1');
  });

  it('updates live as people come and go', async () => {
    const store = fixtureStore();
    render(<PresenceAvatars regattaId={IDS.regatta} />, { wrapper: wrap(store) });
    await arrive(store, IDS.admin);
    await screen.findByRole('button', { name: /^1 other person/ });
    const row = (await store.list('presence')).find((r) => r.userId === IDS.admin)!;
    await store.delete('presence', row.id);
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });
});
