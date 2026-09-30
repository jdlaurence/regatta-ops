import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { TooltipProvider } from '@/components/ui/menu';
import type { MemoryStore } from '@/data/memory-store';
import { dataWrapper } from '@/test/render';
import { IDS, fixtureStore, flush } from '@/test/fixtures';
import TrailerEditPage from './TrailerEditPage';
import TrailersListPage from './TrailersListPage';

function renderAt(path: string, store: MemoryStore) {
  const router = createMemoryRouter(
    [
      { path: '/trailers', Component: TrailersListPage },
      { path: '/trailers/:id', Component: TrailerEditPage },
    ],
    { initialEntries: [path] },
  );
  const Wrapper = dataWrapper(store);
  render(
    <Wrapper>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </Wrapper>,
  );
  return router;
}

describe('Trailer edit page', () => {
  it('edits a shelf and saves trailer, shelves, and compartments in one batch', async () => {
    const store = fixtureStore({ signedIn: IDS.admin });
    const batch = vi.spyOn(store, 'batch');
    const user = userEvent.setup();
    renderAt(`/trailers/${IDS.trailer}`, store);

    const width = await screen.findByRole('textbox', { name: 'Level 5, left: width in cm' });
    const save = screen.getByRole('button', { name: 'Save trailer' });
    expect(save).toBeDisabled();
    await user.clear(width);
    await user.type(width, '150');
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add level' }));
    await user.click(screen.getByRole('button', { name: 'Add compartment' }));
    await user.type(screen.getByRole('textbox', { name: 'Compartment 1: label' }), 'Oar box');
    await user.click(save);

    await waitFor(() => expect(batch).toHaveBeenCalledTimes(1));
    const shelves = await store.list('trailer_shelves', { where: { trailerId: IDS.trailer } });
    expect(shelves.find((s) => s.id === IDS.shelf)!.widthCm).toBe(150);
    const added = shelves.find((s) => s.tier === 6)!;
    expect(added).toMatchObject({ label: 'Level 6, left', widthCm: 150, sortOrder: 2 });
    const comps = await store.list('trailer_compartments', { where: { trailerId: IDS.trailer } });
    expect(comps).toMatchObject([{ label: 'Oar box', kind: 'storage' }]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save trailer' })).toBeDisabled(),
    );
  }, 15_000);

  it('refuses to save a shelf without a width and says why', async () => {
    const store = fixtureStore({ signedIn: IDS.admin });
    const user = userEvent.setup();
    renderAt(`/trailers/${IDS.trailer}`, store);
    const width = await screen.findByRole('textbox', { name: 'Level 5, left: width in cm' });
    await user.clear(width);
    expect(width).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Fix 1 field to save.')).toBeInTheDocument();
    expect(screen.getByText('Level 5, left: Width must be more than 0 cm.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save trailer' })).toBeDisabled();
  });

  it('updates the live end view from the unsaved draft', async () => {
    const store = fixtureStore({ signedIn: IDS.admin });
    const user = userEvent.setup();
    renderAt(`/trailers/${IDS.trailer}`, store);
    const view = await screen.findByRole('group', { name: 'Boys trailer, end view' });
    expect(within(view).getAllByRole('row')).toHaveLength(1 + 1);
    await user.click(screen.getByRole('button', { name: 'Add level' }));
    expect(within(view).getAllByRole('row')).toHaveLength(1 + 2);
    await user.clear(screen.getByRole('textbox', { name: 'Name' }));
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Spare trailer');
    expect(screen.getByRole('group', { name: 'Spare trailer, end view' })).toBeInTheDocument();
  });

  it('switches the preview between the end view and the isometric view', async () => {
    const store = fixtureStore({ signedIn: IDS.coach });
    const user = userEvent.setup();
    renderAt(`/trailers/${IDS.trailer}`, store);
    await screen.findByRole('group', { name: 'Boys trailer, end view' });
    await user.click(screen.getByRole('radio', { name: 'Isometric' }));
    expect(screen.getByRole('heading', { name: 'Isometric view' })).toBeInTheDocument();
    const iso = screen.getByRole('figure', { name: 'Boys trailer, isometric view' });
    expect(within(iso).getByText('Boys trailer, isometric view: no boats.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Boys trailer, end view' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'End view' }));
    expect(screen.getByRole('group', { name: 'Boys trailer, end view' })).toBeInTheDocument();
  });

  it('places compartments along the frame, checks them, and saves where they sit', async () => {
    const store = fixtureStore({ signedIn: IDS.admin });
    const user = userEvent.setup();
    renderAt(`/trailers/${IDS.trailer}`, store);
    await screen.findByRole('textbox', { name: 'Level 5, left: width in cm' });

    // The live preview's plan view, on the bed.
    await user.click(screen.getByRole('radio', { name: 'Plan view' }));
    expect(screen.getByRole('heading', { name: 'Plan view' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Bed' }));
    const bed = screen.getByRole('group', { name: 'Bed from above' });
    expect(screen.getByText(/Nothing is set to ride in the bed yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add compartment' }));
    await user.type(screen.getByRole('textbox', { name: 'Compartment 1: label' }), 'Riggers');
    const from = screen.getByRole('textbox', { name: 'Riggers: from front in cm' });
    const to = screen.getByRole('textbox', { name: 'Riggers: to in cm' });
    expect(to).toHaveAttribute('placeholder', '1220');
    await user.type(from, '700');
    await user.type(to, '1300');
    // Past the back of the frame: marked, listed, and Save is off.
    expect(to).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Riggers: To is more than 0 and at most 1220 cm, the back of the frame.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save trailer' })).toBeDisabled();
    await user.clear(to);
    await user.type(to, '600');
    expect(
      screen.getByText('Riggers: To must be further back than From front.'),
    ).toBeInTheDocument();
    await user.clear(to);
    await user.type(to, '1220');
    expect(to).not.toHaveAttribute('aria-invalid');
    // The preview follows as you type: the zone at the back, across the full width.
    expect(within(bed).getByText('Riggers')).toBeInTheDocument();
    expect(within(bed).getByText('Back of the bed, full width')).toBeInTheDocument();
    expect(within(bed).getByText('5.2 m')).toBeInTheDocument();

    // An overlap is a warning, not an error.
    await user.click(screen.getByRole('button', { name: 'Add compartment' }));
    await user.type(screen.getByRole('textbox', { name: 'Compartment 2: label' }), 'Oars');
    await user.type(screen.getByRole('textbox', { name: 'Oars: from front in cm' }), '300');
    await user.type(screen.getByRole('textbox', { name: 'Oars: to in cm' }), '800');
    const checks = screen.getByRole('list', { name: 'Compartments to check' });
    expect(checks).toHaveTextContent('Riggers and Oars overlap by 100 cm.');
    await user.clear(screen.getByRole('textbox', { name: 'Oars: to in cm' }));
    await user.type(screen.getByRole('textbox', { name: 'Oars: to in cm' }), '700');
    expect(screen.queryByRole('list', { name: 'Compartments to check' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Save trailer' }));
    await waitFor(async () => {
      const comps = await store.list('trailer_compartments', {
        where: { trailerId: IDS.trailer },
      });
      expect(comps.map((c) => [c.label, c.startCm, c.endCm])).toEqual([
        ['Riggers', 700, 1220],
        ['Oars', 300, 700],
      ]);
    });
  }, 20_000);

  it('shows a trailer read only to coaches', async () => {
    const store = fixtureStore({ signedIn: IDS.coach });
    renderAt(`/trailers/${IDS.trailer}`, store);
    expect(await screen.findByText('Only admins change trailers.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save trailer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /width in cm/ })).not.toBeInTheDocument();
    expect(screen.getByText('Level 5, left')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
  });

  it('says so when the trailer does not exist', async () => {
    renderAt('/trailers/nosuchtrailer00', fixtureStore({ signedIn: IDS.admin }));
    expect(await screen.findByText('Trailer not found')).toBeInTheDocument();
  });
});

describe('Trailers list', () => {
  it('lists trailers with what they hold and adds one from a preset', async () => {
    const store = fixtureStore({ signedIn: IDS.admin });
    const user = userEvent.setup();
    const router = renderAt('/trailers', store);
    const link = await screen.findByRole('link', { name: /Boys trailer/ });
    expect(link).toHaveTextContent('Offset post, 12.2 m frame');
    expect(link).toHaveTextContent('1 level, 1 lane, 1 long enough for an eight');

    await user.click(screen.getByRole('button', { name: 'New trailer' }));
    const dialog = screen.getByRole('dialog', { name: 'New trailer' });
    await user.click(within(dialog).getByRole('button', { name: 'Add trailer' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Borrowed trailer');
    await user.click(within(dialog).getByRole('radio', { name: /Center post/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Add trailer' }));

    await waitFor(() => expect(router.state.location.pathname).not.toBe('/trailers'));
    await flush();
    const trailers = await store.list('trailers');
    const created = trailers.find((t) => t.name === 'Borrowed trailer')!;
    expect(created).toMatchObject({ style: 'center_post', frameLengthCm: 1220 });
    expect(created.defaultRules.length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe(`/trailers/${created.id}`);
    const shelves = await store.list('trailer_shelves', { where: { trailerId: created.id } });
    expect(shelves).toHaveLength(8);
  });

  it('tells a coach who adds trailers when there are none', async () => {
    const store = fixtureStore({ signedIn: IDS.coach });
    await store.delete('trailers', IDS.trailer);
    renderAt('/trailers', store);
    expect(await screen.findByText('No trailers yet')).toBeInTheDocument();
    expect(screen.getByText(/An admin adds trailers/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New trailer' })).not.toBeInTheDocument();
  });
});
