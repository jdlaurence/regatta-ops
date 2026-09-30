import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider } from 'react-router/dom';
import type { Seat } from '@srt/domain';
import { AppProviders } from '@/app/providers';
import { createTestRouter } from '@/app/router';
import type { MemoryStore } from '@/data/memory-store';
import { IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import { BOYS, L, lineupStore, lineupWorld } from './test-world';

const PATH = `/regattas/${IDS.regatta}/lineups/${IDS.boys}`;

function renderBuilder(path = PATH, store: MemoryStore = lineupStore()) {
  const queryClient = testQueryClient();
  const router = createTestRouter({ store, queryClient }, path);
  render(
    <AppProviders store={store} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { store, router, user: userEvent.setup() };
}

async function card(entryId: string): Promise<HTMLElement> {
  await screen.findByRole('heading', { level: 1, name: 'Junior boys lineups' });
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-lineup-entry="${entryId}"]`);
    if (!el) throw new Error('entry not rendered yet');
    return el;
  });
}

function seatButton(entryEl: HTMLElement, seat: Seat): HTMLElement {
  const el = entryEl.querySelector<HTMLElement>(`[data-lineup-seat$=":${seat}"]`);
  if (!el) throw new Error(`no seat ${seat}`);
  return el;
}

function occupant(store: MemoryStore, entryId: string, seat: Seat): string | null {
  return (
    store.snapshot().entry_seats.find((s) => s.entryId === entryId && s.seat === seat)?.athleteId ??
    null
  );
}

function boatedText(): string {
  const roster = screen.getByRole('complementary', { name: 'Roster' });
  const count = roster.querySelector('p[aria-live]');
  return (count?.textContent ?? '').replace(/(\d)of/, '$1 of').replace(/\s+/g, ' ');
}

describe('the lineup builder', () => {
  it('shows the roster crossed off with the boated count', async () => {
    renderBuilder();
    await card(L.boysEight);
    // Rowan (V4+), Arlo, Beck, and Ike (V8) of the 11 available boys.
    expect(boatedText()).toBe('4 of 11 boated');
    expect(screen.getByRole('button', { name: /^Arlo Rower, in 1 entry/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Dax Rower, not in a boat/ })).toBeInTheDocument();
    // Unavailable and borrowed athletes sit in collapsed groups.
    expect(screen.getByRole('button', { name: /^Unavailable\s*1$/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Borrowed\s*1$/ })).toBeInTheDocument();
  });

  it('fills a seat by typing a name, then moves down to the next seat', async () => {
    const { store, user } = renderBuilder();
    const eight = await card(L.boysEight);
    seatButton(eight, '3').focus();
    await user.keyboard('Dax');
    const search = await screen.findByRole('combobox', { name: /search seat 3/i });
    expect(search).toHaveValue('Dax');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(occupant(store, L.boysEight, '3')).toBe(BOYS[3]));
    // Boats read cox, stroke, ... bow from the top: the seat below seat 3 is seat 2.
    await waitFor(() => expect(document.activeElement).toBe(seatButton(eight, '2')));
    expect(boatedText()).toBe('5 of 11 boated');
  });

  it('draws each boat cox first, then stroke down to bow, with shell and oars above', async () => {
    renderBuilder();
    const eight = await card(L.boysEight);
    const seats = [...eight.querySelectorAll('[data-lineup-seat]')].map(
      (el) => el.getAttribute('data-lineup-seat')!.split(':')[1],
    );
    expect(seats).toEqual(['cox', '8', '7', '6', '5', '4', '3', '2', '1']);
    const boat = within(eight).getByRole('group', { name: /^V8, 3 of 9 seats filled/ });
    expect(boat).toHaveAttribute('data-orientation', 'vertical');
    const shell = within(eight).getByRole('button', { name: 'Shell: none' });
    expect(shell.compareDocumentPosition(boat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('moves between seats with the arrow keys: up and down in a boat, left and right across', async () => {
    const { user } = renderBuilder();
    const eight = await card(L.boysEight);
    const four = await card(IDS.entry1);
    seatButton(eight, '3').focus();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(seatButton(eight, '4'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(seatButton(eight, '2'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(seatButton(eight, 'cox'));
    // Nothing above the cox.
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(seatButton(eight, 'cox'));
    // The boat before this one (the V4+ at 9:40), same row: its cox.
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(seatButton(four, 'cox'));
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(document.activeElement).toBe(seatButton(eight, '8'));
    await user.keyboard('{End}{ArrowLeft}');
    // The four is shorter: its bottom row, bow.
    expect(document.activeElement).toBe(seatButton(four, '1'));
  });

  it('clears a seat with Delete and swaps two seats with Space', async () => {
    const { store, user } = renderBuilder();
    const eight = await card(L.boysEight);
    seatButton(eight, '1').focus();
    await user.keyboard(' ');
    seatButton(eight, '2').focus();
    await user.keyboard(' ');
    await waitFor(() => {
      expect(occupant(store, L.boysEight, '1')).toBe(BOYS[1]);
      expect(occupant(store, L.boysEight, '2')).toBe(BOYS[0]);
    });
    seatButton(eight, '2').focus();
    await user.keyboard('{Delete}');
    await waitFor(() => expect(occupant(store, L.boysEight, '2')).toBeNull());
    expect(seatButton(eight, '2')).toHaveAccessibleName('Seat 2, empty');
  });

  it('opens the picker on click with side matches first, and filters it', async () => {
    const { user } = renderBuilder();
    const eight = await card(L.boysEight);
    await user.click(seatButton(eight, '4'));
    const list = await screen.findByRole('listbox', { name: 'Seat 4' });
    expect(within(list).getByText('Port side')).toBeInTheDocument();
    expect(within(list).getByText('Borrow from Junior girls')).toBeInTheDocument();
    const options = within(list).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Dax Rower');
    await user.keyboard('fin');
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([expect.stringContaining('Finn Rower')]);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(seatButton(eight, '4')).toHaveAccessibleName(/Finn Rower/));
  });

  it('shows live conflict hints in the shell picker', async () => {
    const { user, store } = renderBuilder();
    const eight = await card(L.boysEight);
    await user.click(within(eight).getByRole('button', { name: 'Shell: none' }));
    const list = await screen.findByRole('listbox', { name: 'Shell' });
    const monahan = within(list).getByRole('option', { name: /Monahan/ });
    expect(monahan).toHaveTextContent('Busy: Girls V8 at 10:20');
    // The out-of-service eight is listed but cannot be picked.
    expect(within(list).getByRole('option', { name: /Faithful/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.click(monahan);
    await waitFor(() =>
      expect(store.snapshot().entries.find((e) => e.id === L.boysEight)?.shellId).toBe(IDS.shell2),
    );
  });

  it('adds an entry to an event with the next crew label', async () => {
    const { store, user } = renderBuilder();
    await card(L.boysEight);
    await user.click(screen.getByRole('button', { name: 'Add entry to Event 15' }));
    await waitFor(() =>
      expect(
        store
          .snapshot()
          .entries.filter((e) => e.eventId === L.event3)
          .map((e) => e.label)
          .sort(),
      ).toEqual(['V8', 'V8 B']),
    );
  });

  it('opens a linked entry in the inspector', async () => {
    renderBuilder(`${PATH}?entry=${L.boysEight}`);
    await card(L.boysEight);
    const panel = await screen.findByRole('complementary', { name: 'Entry details' });
    expect(within(panel).getByText('Boys V8')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Label')).toHaveValue('V8');
  });

  it('asks once before the first edit of a final regatta', async () => {
    const world = lineupWorld();
    world.regattas.find((r) => r.id === IDS.regatta)!.status = 'final';
    const { store, user } = renderBuilder(PATH, lineupStore({ world }));
    const eight = await card(L.boysEight);
    seatButton(eight, '1').focus();
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('dialog', { name: 'Edit a final regatta?' });
    expect(occupant(store, L.boysEight, '1')).toBe(BOYS[0]);
    await user.click(within(dialog).getByRole('button', { name: 'Edit this regatta' }));
    await waitFor(() => expect(occupant(store, L.boysEight, '1')).toBeNull());
    seatButton(eight, '2').focus();
    await user.keyboard('{Delete}');
    await waitFor(() => expect(occupant(store, L.boysEight, '2')).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Edit a final regatta?' })).toBeNull();
  });

  it('is read-only for viewers', async () => {
    renderBuilder(PATH, lineupStore({ signedIn: IDS.viewer }));
    const eight = await card(L.boysEight);
    expect(screen.queryByRole('button', { name: 'Add entry' })).toBeNull();
    expect(eight.querySelector('button[data-lineup-seat]')).toBeNull();
    expect(within(eight).queryByRole('button', { name: /^Shell:/ })).toBeNull();
    expect(
      within(eight).getByRole('group', { name: /V8, 3 of 9 seats filled/ }),
    ).toBeInTheDocument();
  });

  it('lists athletes against events in the by-athlete view', async () => {
    const { user } = renderBuilder();
    await card(L.boysEight);
    await user.click(screen.getByRole('radio', { name: 'By athlete' }));
    const table = await screen.findByRole('table');
    const arlo = within(table)
      .getByRole('rowheader', { name: /Arlo Rower/ })
      .closest('tr')!;
    expect(within(arlo).getByRole('button', { name: /V8/ })).toBeInTheDocument();
  });
});
