// Users and roles (PLAN.md §2, §4.12): everyone with an account, their role, and their default
// team. Admins change roles and default teams; everyone else reads.

import { useState } from 'react';
import type { Role, User } from '@regatta-ops/domain';
import { ROLE_LABELS, useCan, useCurrentUser, useList, useUpdate } from '@/data';
import { Avatar } from '@/app/shell/UserMenu';
import { EmptyState, ErrorState, SkeletonRows } from '@/components/states';
import { TeamDot } from '@/components/chips';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';

const ROLES: Role[] = ['admin', 'coach', 'viewer'];
const NONE = '__none';

const ROLE_HELP: Record<Role, string> = {
  admin: 'Everything, plus users, teams, trailers, and club defaults.',
  coach: 'Regattas, lineups, rosters, availability, the fleet, and load plans.',
  viewer: 'Reads everything and comments.',
};

function withArticle(role: Role): string {
  return role === 'admin' ? 'an admin' : `a ${ROLE_LABELS[role].toLowerCase()}`;
}

export function UsersSection() {
  const canManage = useCan('users.manage');
  const me = useCurrentUser();
  const users = useList('users', { sort: 'name' });
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });
  const update = useUpdate('users');
  const [confirm, setConfirm] = useState<{ user: User; role: Role } | null>(null);

  const list = users.data ?? [];
  const adminCount = list.filter((u) => u.role === 'admin').length;
  const teamList = teams.data ?? [];

  const applyRole = (user: User, role: Role) => {
    update.mutate(
      { id: user.id, patch: { role } },
      { onSuccess: () => toast.success(`${user.name} is now ${withArticle(role)}`) },
    );
  };

  const changeRole = (user: User, role: Role) => {
    if (role === user.role) return;
    if (user.role === 'admin' && adminCount <= 1) {
      toast.error('Regatta Ops needs at least one admin. Make someone else an admin first.');
      return;
    }
    if (user.id === me?.id) {
      setConfirm({ user, role });
      return;
    }
    applyRole(user, role);
  };

  const changeTeam = (user: User, teamId: string | null) => {
    const team = teamList.find((t) => t.id === teamId);
    update.mutate(
      { id: user.id, patch: { defaultTeamId: teamId } },
      {
        onSuccess: () =>
          toast.success(
            team
              ? `${user.name}’s default team is now ${team.name}`
              : `Cleared ${user.name}’s default team`,
          ),
      },
    );
  };

  const error = users.error ?? teams.error;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div className="flex flex-col gap-3">
        <p className="max-w-prose text-base leading-prose text-ink-2">
          People get an account the first time they sign in with a club Google account, as coaches.{' '}
          {canManage ? 'Change roles here.' : 'Admins change roles here.'}
        </p>
        <dl className="grid gap-x-4 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
          {ROLES.map((r) => (
            <div key={r} className="contents">
              <dt className="font-medium">{ROLE_LABELS[r]}</dt>
              <dd className="mb-1 text-ink-2 sm:mb-0">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {error ? (
        <ErrorState
          title="Users did not load."
          error={error}
          onRetry={() => {
            void users.refetch();
            void teams.refetch();
          }}
        />
      ) : users.isPending ? (
        <SkeletonRows rows={5} />
      ) : list.length === 0 ? (
        <EmptyState
          title="No users yet"
          description="Accounts appear here after people sign in for the first time."
        />
      ) : (
        <ul
          aria-label="Users"
          className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface"
        >
          <li
            aria-hidden
            className="hidden px-4 py-2 text-sm font-medium text-ink-2 md:grid md:grid-cols-[1fr_160px_220px] md:gap-4"
          >
            <span>Name</span>
            <span>Role</span>
            <span>Default team</span>
          </li>
          {list.map((u) => {
            const team = teamList.find((t) => t.id === u.defaultTeamId);
            return (
              <li
                key={u.id}
                className="grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[1fr_160px_220px] md:gap-4"
              >
                <div className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
                  <Avatar name={u.name} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {u.name}
                      {u.id === me?.id && <span className="font-normal text-ink-2"> (you)</span>}
                    </span>
                    <span className="truncate text-sm text-ink-2">{u.email}</span>
                  </div>
                </div>
                {canManage ? (
                  <>
                    <Select<Role>
                      label={`Role for ${u.name}`}
                      value={u.role}
                      onValueChange={(r) => changeRole(u, r)}
                      options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
                      className="w-full"
                    />
                    <Select
                      label={`Default team for ${u.name}`}
                      value={u.defaultTeamId ?? NONE}
                      onValueChange={(v) => changeTeam(u, v === NONE ? null : v)}
                      options={[
                        { value: NONE, label: 'None' },
                        ...teamList
                          .filter((t) => !t.archived || t.id === u.defaultTeamId)
                          .map((t) => ({ value: t.id, label: t.name })),
                      ]}
                      className="w-full"
                    />
                  </>
                ) : (
                  <>
                    <span className="text-base">
                      <span className="sr-only">Role: </span>
                      {ROLE_LABELS[u.role]}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-base">
                      <span className="sr-only">Default team: </span>
                      {team ? (
                        <>
                          <TeamDot colorKey={team.colorKey} />
                          <span className="truncate">{team.name}</span>
                        </>
                      ) : (
                        <span className="text-ink-2">None</span>
                      )}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm && (
          <DialogContent
            title={`Make yourself ${withArticle(confirm.role)}?`}
            description="You will lose admin access right away, including this page’s role controls. Another admin can change it back."
          >
            <DialogFooter>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={() => {
                  applyRole(confirm.user, confirm.role);
                  setConfirm(null);
                }}
              >
                Change my role
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
