import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/app/providers';
import { MemoryStore } from '@/data/memory-store';
import { fixtureWorld, IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import { CommentCount, CommentsThread, mentionAtCaret, suggestUsers } from './CommentsThread';

function storeWithComments(signedIn: string = IDS.coach) {
  const w = fixtureWorld();
  w.comments.push(
    {
      id: 'comment00000002',
      targetType: 'entry',
      targetId: IDS.entry1,
      authorId: IDS.viewer,
      body: '@Casey Coach can Rowan swap to bow?',
      created: '2025-10-20T18:00:00.000Z',
      updated: '2025-10-20T18:00:00.000Z',
    },
    {
      id: 'comment00000001',
      targetType: 'entry',
      targetId: IDS.entry1,
      authorId: IDS.admin,
      body: 'Spencer needs its bow ball replaced first.',
      created: '2025-10-19T18:00:00.000Z',
      updated: '2025-10-19T18:00:00.000Z',
    },
    {
      id: 'comment00000003',
      targetType: 'entry',
      targetId: IDS.entry1,
      authorId: IDS.coach,
      body: 'Will do.',
      created: '2025-10-21T18:00:00.000Z',
      updated: '2025-10-21T18:00:00.000Z',
    },
    {
      id: 'comment00000004',
      targetType: 'event',
      targetId: IDS.event1,
      authorId: IDS.coach,
      body: 'Not this one.',
      created: '2025-10-21T18:00:00.000Z',
    },
  );
  return new MemoryStore({ world: w, userId: signedIn });
}

function renderThread(store: MemoryStore, targetId: string = IDS.entry1) {
  render(
    <AppProviders store={store} queryClient={testQueryClient()}>
      <CommentsThread targetType="entry" targetId={targetId} />
      <CommentCount targetType="entry" targetId={targetId} />
    </AppProviders>,
  );
  return { store };
}

const items = () => within(screen.getByRole('list')).getAllByRole('listitem');
const box = () => screen.getByRole('textbox', { name: 'Add a comment' });

describe('CommentsThread', () => {
  it('lists comments oldest first with authors, and highlights mentions', async () => {
    renderThread(storeWithComments());
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(items().map((li) => li.textContent)).toEqual([
      expect.stringContaining('Alex Admin'),
      expect.stringContaining('Vic Viewer'),
      expect.stringContaining('Casey Coach'),
    ]);
    // No `mentions` stored on the seeded comment: resolved from the text.
    const mention = items()[1]!.querySelector(`[data-mention="${IDS.coach}"]`);
    expect(mention).toHaveTextContent('@Casey Coach');
    expect(screen.getByRole('heading', { name: 'Comments 3' })).toBeInTheDocument();
    expect(screen.getByText('3 comments')).toBeInTheDocument();
  });

  it('posts with the button and with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const { store } = renderThread(storeWithComments());
    await waitFor(() => expect(items()).toHaveLength(3));

    await user.type(box(), 'Bow ball is on order.');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(items()).toHaveLength(4));
    expect(box()).toHaveValue('');

    await user.type(box(), 'Arrives Friday.');
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(items()).toHaveLength(5));
    expect(items()[4]).toHaveTextContent('Arrives Friday.');

    const saved = await store.list('comments', { where: { targetId: IDS.entry1 } });
    expect(saved.filter((c) => c.authorId === IDS.coach).map((c) => c.body)).toEqual(
      expect.arrayContaining(['Bow ball is on order.', 'Arrives Friday.']),
    );
  });

  it('suggests people after @ and inserts the full name', async () => {
    const user = userEvent.setup();
    const { store } = renderThread(storeWithComments());
    await waitFor(() => expect(items()).toHaveLength(3));

    await user.type(box(), 'Thanks @vi');
    const list = screen.getByRole('listbox', { name: 'People to mention' });
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['VVVic Viewer']);
    await user.keyboard('{Enter}');
    expect(box()).toHaveValue('Thanks @Vic Viewer ');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // Arrow keys move through everyone when only "@" is typed.
    await user.type(box(), 'and @');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(3);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(box()).toHaveValue('Thanks @Vic Viewer and @Casey Coach ');

    // Escape closes the list without touching the text.
    await user.type(box(), '@A');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await user.keyboard('{Backspace}{Backspace}');

    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(async () => {
      const [c] = await store.list('comments', {
        where: { body: 'Thanks @Vic Viewer and @Casey Coach' },
      });
      expect(c?.mentions).toEqual([IDS.viewer, IDS.coach]);
    });
    const posted = items()[3]!;
    expect(posted.querySelector(`[data-mention="${IDS.viewer}"]`)).toHaveTextContent('@Vic Viewer');
  });

  it('edits and deletes your own comments, not other people’s', async () => {
    const user = userEvent.setup();
    const { store } = renderThread(storeWithComments());
    await waitFor(() => expect(items()).toHaveLength(3));
    expect(
      within(items()[0]!).queryByRole('button', { name: /Comment actions/ }),
    ).not.toBeInTheDocument();

    const mine = items()[2]!;
    await user.click(within(mine).getByRole('button', { name: /Comment actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit comment' }));
    const edit = within(mine).getByRole('textbox', { name: 'Edit comment' });
    await user.clear(edit);
    await user.type(edit, 'Will do after practice.');
    await user.click(within(mine).getByRole('button', { name: 'Save comment' }));
    await waitFor(() => expect(items()[2]).toHaveTextContent('Will do after practice.'));
    expect((await store.get('comments', 'comment00000003'))!.body).toBe('Will do after practice.');

    await user.click(within(items()[2]!).getByRole('button', { name: /Comment actions/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete comment' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(await store.get('comments', 'comment00000003')).toBeNull();
  });

  it('lets viewers comment, and invites the first comment when there are none', async () => {
    const user = userEvent.setup();
    const { store } = renderThread(storeWithComments(IDS.viewer), IDS.entry1);
    await waitFor(() => expect(items()).toHaveLength(3));
    await user.type(box(), 'Viewer here.');
    await user.click(screen.getByRole('button', { name: 'Post comment' }));
    await waitFor(async () =>
      expect(
        (await store.list('comments', { where: { authorId: IDS.viewer } })).map((c) => c.body),
      ).toContain('Viewer here.'),
    );
  });

  it('shows an empty state and no count for a target without comments', async () => {
    renderThread(storeWithComments(), 'entrynone000001');
    expect(await screen.findByText('No comments yet')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+ comments?$/)).not.toBeInTheDocument();
  });
});

describe('mention helpers', () => {
  it('finds the @ being typed at the caret', () => {
    expect(mentionAtCaret('Hi @Ca', 6)).toEqual({ start: 3, query: 'Ca' });
    expect(mentionAtCaret('Hi @Casey Co', 12)).toEqual({ start: 3, query: 'Casey Co' });
    expect(mentionAtCaret('mail a@b', 8)).toBeNull();
    expect(mentionAtCaret('@Casey\nnext', 11)).toBeNull();
    expect(mentionAtCaret('no mention', 10)).toBeNull();
  });

  it('suggests prefix matches first, then word matches', () => {
    const users = [
      { id: '1', name: 'Casey Coach' },
      { id: '2', name: 'Alex Casey' },
      { id: '3', name: 'Vic Viewer' },
    ];
    expect(suggestUsers(users, 'ca').map((u) => u.id)).toEqual(['1', '2']);
    expect(suggestUsers(users, 'casey c').map((u) => u.id)).toEqual(['1']);
    expect(suggestUsers(users, '').map((u) => u.id)).toEqual(['2', '1', '3']);
  });
});
