import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/app/providers';
import type { MemoryStore } from '@/data/memory-store';
import { IDS } from '@/test/fixtures';
import { testQueryClient } from '@/test/render';
import { SHARE_IDS, TOKENS, shareStore } from '@/test/share-fixtures';
import { ShareLinksDialog, shareLinkUrl } from './ShareLinksDialog';

function renderDialog(store: MemoryStore, props: { defaultTeamId?: string } = {}) {
  const onOpenChange = vi.fn();
  render(
    <AppProviders store={store} queryClient={testQueryClient()}>
      <ShareLinksDialog
        regattaId={IDS.regatta}
        open
        onOpenChange={onOpenChange}
        defaultTeamId={props.defaultTeamId}
      />
    </AppProviders>,
  );
  return { onOpenChange };
}

const rows = () => within(screen.getByRole('dialog')).getAllByRole('listitem');

describe('ShareLinksDialog', () => {
  it("lists the regatta's links, live ones first", async () => {
    renderDialog(shareStore({ signedIn: IDS.coach }));
    await waitFor(() => expect(rows()).toHaveLength(5));
    const last = rows()[4]!;
    expect(within(last).getByText(/Revoked/)).toBeInTheDocument();
    expect(within(last).queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Junior boys')).toBeInTheDocument();
    expect(within(dialog).getByText('· Can tick the load list')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/^Created by Casey Coach/)).toHaveLength(5);
    expect(within(dialog).getByDisplayValue(shareLinkUrl(TOKENS.wide))).toBeInTheDocument();
  });

  it('creates a link that can tick the load list, and copies it', async () => {
    const user = userEvent.setup();
    const store = shareStore({ signedIn: IDS.coach });
    renderDialog(store);
    await waitFor(() => expect(rows()).toHaveLength(5));

    await user.click(screen.getByRole('checkbox', { name: 'Loading crew can tick the load list' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => expect(rows()).toHaveLength(6));
    const links = await store.list('share_links', { where: { regattaId: IDS.regatta } });
    const created = links.find((l) => !Object.values(SHARE_IDS).includes(l.id))!;
    expect(created).toMatchObject({ teamId: null, canCheckLoad: true, createdBy: IDS.coach });
    expect(created.token).toHaveLength(40);
    expect(await screen.findByText('Link created')).toBeInTheDocument();

    // The new link is first and ready to copy.
    const fresh = rows()[0]!;
    expect(within(fresh).getByDisplayValue(shareLinkUrl(created.token))).toBeInTheDocument();
    await user.click(within(fresh).getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(shareLinkUrl(created.token));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('starts new links scoped to the team it was opened for', async () => {
    const user = userEvent.setup();
    const store = shareStore({ signedIn: IDS.coach });
    renderDialog(store, { defaultTeamId: IDS.girls });
    const scope = await screen.findByRole('combobox', { name: 'Shows' });
    expect(scope).toHaveTextContent('Junior girls only');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(async () => {
      const links = await store.list('share_links', { where: { teamId: IDS.girls } });
      expect(links).toHaveLength(2);
    });
  });

  it('revokes a link after a confirmation', async () => {
    const user = userEvent.setup();
    const store = shareStore({ signedIn: IDS.coach });
    renderDialog(store);
    await waitFor(() => expect(rows()).toHaveLength(5));
    const boys = rows().find((r) => within(r).queryByText('Junior boys'))!;
    await user.click(within(boys).getByRole('button', { name: 'Revoke' }));
    expect(within(boys).getByText(/cannot be turned back on/)).toBeInTheDocument();
    await user.click(within(boys).getByRole('button', { name: 'Keep link' }));
    expect(within(boys).queryByText(/cannot be turned back on/)).not.toBeInTheDocument();

    await user.click(within(boys).getByRole('button', { name: 'Revoke' }));
    await user.click(within(boys).getByRole('button', { name: 'Revoke link' }));
    await waitFor(async () =>
      expect((await store.get('share_links', SHARE_IDS.boysLink))!.revokedAt).toBeTruthy(),
    );
    expect(await screen.findByText('Link revoked')).toBeInTheDocument();
  });

  it('tells viewers that only coaches make links', async () => {
    renderDialog(shareStore({ signedIn: IDS.viewer }));
    expect(
      await screen.findByText(/Only coaches and admins can make share links/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument();
  });
});
