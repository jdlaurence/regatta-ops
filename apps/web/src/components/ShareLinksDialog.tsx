// Share links for a regatta (PLAN.md §2, §4.11): coaches and admins list, create, copy,
// and revoke the read-only links athletes and parents open without signing in. Revoking is
// permanent; a new link is the way back.
//
// Placement: the regatta overview's header actions ("Share") and the lineup page's toolbar
// (pass defaultTeamId so a new link starts scoped to that team). Hide the trigger for viewers
// with useCan('regatta.edit'); the dialog also says so if a viewer opens it.
//
//   const [open, setOpen] = useState(false);
//   <Button onClick={() => setOpen(true)}><Link2 aria-hidden />Share</Button>
//   <ShareLinksDialog regattaId={id} open={open} onOpenChange={setOpen} defaultTeamId={teamId} />

import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Link2Off, Plus } from 'lucide-react';
import type { ShareLink, Team } from '@regatta-ops/domain';
import { sharePath, useCan, useList, useStoreMutation, useUpdate, type CreateInput } from '@/data';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/cn';
import { TeamChip } from './chips';
import { EmptyState, ErrorState, SkeletonRows } from './states';
import { toast } from './toast';
import { Button } from './ui/button';
import { Checkbox } from './ui/controls';
import { Dialog, DialogContent } from './ui/dialog';
import { Input, Label } from './ui/input';
import { Select } from './ui/select';

export interface ShareLinksDialogProps {
  regattaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Start new links scoped to this team (the lineup page passes its team). */
  defaultTeamId?: string | null;
}

const WHOLE = 'regatta';

/** The full address of a share link's page, for copying into a message. */
export function shareLinkUrl(token: string, origin = window.location.origin): string {
  // BASE_URL is '/' except on the published demo, which lives under /<repository>/.
  return `${origin}${import.meta.env.BASE_URL.replace(/\/+$/, '')}${sharePath(token)}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Link copied');
  } catch {
    toast.error('Copying did not work in this browser. Select the link and copy it.');
  }
}

function LinkRow({
  link,
  team,
  creator,
  fresh,
}: {
  link: ShareLink;
  team: Team | undefined;
  creator: string | undefined;
  fresh: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const revoke = useUpdate('share_links', {
    onSuccess: () => toast.success('Link revoked'),
  });
  const url = shareLinkUrl(link.token);
  const revoked = !!link.revokedAt;
  const inputId = `share-url-${link.id}`;
  const created = link.created ? relativeTime(link.created) : '';

  return (
    <li
      className={cn(
        'flex flex-col gap-2.5 rounded-card border border-line p-3',
        fresh ? 'border-accent bg-accent-tint' : 'bg-surface',
        revoked && 'bg-surface-2',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {team ? (
          <TeamChip team={team} size="sm" />
        ) : (
          <span className="text-base font-medium text-ink">Whole regatta</span>
        )}
        {link.canCheckLoad && <span className="text-sm text-ink-2">· Can tick the load list</span>}
        {revoked && (
          <span className="text-sm font-medium text-ink-2">
            · Revoked {link.revokedAt ? relativeTime(link.revokedAt) : ''}
          </span>
        )}
      </div>
      <p className="text-sm text-ink-2">
        {[creator ? `Created by ${creator}` : 'Created', created].filter(Boolean).join(' · ')}
      </p>
      {!revoked && (
        <>
          <Label htmlFor={inputId} className="sr-only">
            Link address
          </Label>
          <Input
            id={inputId}
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            className="text-sm text-ink-2"
          />
          {confirming ? (
            <div
              role="group"
              aria-label="Revoke link"
              className="flex flex-col gap-2 rounded-control border border-danger/40 bg-danger-tint p-3"
            >
              <p className="text-base leading-prose text-ink">
                Revoke this link? Anyone who has it loses access, and it cannot be turned back on.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={revoke.isPending}
                  onClick={() =>
                    revoke.mutate(
                      { id: link.id, patch: { revokedAt: new Date().toISOString() } },
                      { onSettled: () => setConfirming(false) },
                    )
                  }
                >
                  Revoke link
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep link
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={fresh ? 'primary' : 'secondary'}
                onClick={() => void copyToClipboard(url)}
                autoFocus={fresh}
              >
                <Copy aria-hidden />
                Copy link
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={sharePath(link.token)} target="_blank" rel="noreferrer">
                  <ExternalLink aria-hidden />
                  Open
                </a>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => setConfirming(true)}
              >
                <Link2Off aria-hidden />
                Revoke
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}

function CreateLinkForm({
  regattaId,
  teams,
  defaultTeamId,
  onCreated,
}: {
  regattaId: string;
  teams: Team[];
  defaultTeamId: string | null;
  onCreated: (link: ShareLink) => void;
}) {
  const [scope, setScope] = useState<string>(
    defaultTeamId && teams.some((t) => t.id === defaultTeamId) ? defaultTeamId : WHOLE,
  );
  const [canCheckLoad, setCanCheckLoad] = useState(false);
  const create = useStoreMutation<CreateInput<ShareLink>, ShareLink>({
    // The server makes the token, so there is nothing to show before it answers.
    mutationFn: (store, data) => store.create('share_links', data),
    invalidate: ['share_links'],
    onSuccess: (link) => {
      toast.success('Link created');
      onCreated(link);
    },
  });
  const selectId = 'share-link-scope';
  const checkId = 'share-link-load';
  return (
    <form
      className="flex flex-col gap-3 rounded-card border border-line bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate({
          regattaId,
          teamId: scope === WHOLE ? null : scope,
          canCheckLoad,
          token: '',
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={selectId}>Shows</Label>
        <Select
          id={selectId}
          value={scope}
          onValueChange={setScope}
          options={[
            { value: WHOLE, label: 'Whole regatta, every team' },
            ...teams.map((t) => ({ value: t.id, label: `${t.name} only` })),
          ]}
          className="w-full"
        />
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={checkId}
          checked={canCheckLoad}
          onCheckedChange={(v) => setCanCheckLoad(v === true)}
          className="mt-0.5 pointer-coarse:size-6"
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={checkId}>Loading crew can tick the load list</Label>
          <p className="text-sm text-ink-2">
            For the phones at the trailer. Anyone with the link can mark items loaded or returned.
          </p>
        </div>
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          <Plus aria-hidden />
          Create link
        </Button>
      </div>
    </form>
  );
}

function ShareLinksBody({
  regattaId,
  defaultTeamId,
}: Pick<ShareLinksDialogProps, 'regattaId' | 'defaultTeamId'>) {
  const [freshId, setFreshId] = useState<string | null>(null);
  const links = useList('share_links', { where: { regattaId }, sort: ['-created', 'id'] });
  const regattaTeams = useList('regatta_teams', { where: { regattaId } });
  const allTeams = useList('teams', { sort: ['sortOrder', 'name'] });
  const users = useList('users');

  const teamsById = useMemo(
    () => new Map((allTeams.data ?? []).map((t) => [t.id, t])),
    [allTeams.data],
  );
  const participating = useMemo(() => {
    const ids = new Set((regattaTeams.data ?? []).map((rt) => rt.teamId));
    return (allTeams.data ?? []).filter((t) => ids.has(t.id));
  }, [regattaTeams.data, allTeams.data]);
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const sorted = useMemo(
    () => [...(links.data ?? [])].sort((a, b) => Number(!!a.revokedAt) - Number(!!b.revokedAt)),
    [links.data],
  );

  return (
    <div className="flex flex-col gap-4">
      {regattaTeams.isPending || allTeams.isPending ? (
        <SkeletonRows rows={2} />
      ) : (
        <CreateLinkForm
          regattaId={regattaId}
          teams={participating}
          defaultTeamId={defaultTeamId ?? null}
          onCreated={(link) => setFreshId(link.id)}
        />
      )}
      <section aria-labelledby="share-links-list" className="flex flex-col gap-2">
        <h3 id="share-links-list" className="text-md font-medium">
          Links for this regatta
        </h3>
        {links.isPending ? (
          <SkeletonRows rows={3} />
        ) : links.isError ? (
          <ErrorState
            title="The links did not load."
            error={links.error}
            onRetry={() => void links.refetch()}
          />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No share links yet"
            description="Create one above, then copy it into the team's message thread."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                team={link.teamId ? teamsById.get(link.teamId) : undefined}
                creator={link.createdBy ? names.get(link.createdBy) : undefined}
                fresh={link.id === freshId}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ShareLinksDialog({
  regattaId,
  open,
  onOpenChange,
  defaultTeamId,
}: ShareLinksDialogProps) {
  const canManage = useCan('regatta.edit');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Share links"
        description="Anyone with a link sees published lineups and the day schedule without signing in. Links never show notes, emails, or unpublished changes."
        className="max-w-xl"
      >
        {canManage ? (
          <ShareLinksBody regattaId={regattaId} defaultTeamId={defaultTeamId} />
        ) : (
          <p className="text-base leading-prose text-ink-2">
            Only coaches and admins can make share links. Ask one to send you a link.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
