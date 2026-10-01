// My preferences (PLAN.md §4.12): theme, weight unit, and default team for the signed-in
// user. Changes save right away and follow the user to other devices.

import { useId } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { User, UserPreferences } from '@regatta-ops/domain';
import { useCurrentUser, useList, useUpdate } from '@/data';
import { useTheme, type ThemeChoice } from '@/app/theme';
import { toast } from '@/components/toast';
import { SegmentedControl } from '@/components/ui/controls';
import { Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useClubSettings } from './hooks';

const CLUB = 'club';
const NONE = '__none';

export function PreferencesSection() {
  const user = useCurrentUser();
  if (!user) return null;
  return <Preferences user={user} />;
}

function Preferences({ user }: { user: User }) {
  const uid = useId();
  const { choice, setChoice } = useTheme();
  const { settings } = useClubSettings();
  const teams = useList('teams', { sort: ['sortOrder', 'name'] });
  const update = useUpdate('users');
  const clubUnit = settings.weightUnit === 'kg' ? 'kilograms' : 'pounds';

  const savePreferences = (next: UserPreferences) =>
    update.mutate(
      { id: user.id, patch: { preferences: next } },
      { onSuccess: () => toast.success('Preferences saved') },
    );

  const setUnit = (value: 'lb' | 'kg' | typeof CLUB) => {
    const { weightUnit: _old, ...rest } = user.preferences ?? {};
    savePreferences(value === CLUB ? rest : { ...rest, weightUnit: value });
  };

  const setTeam = (teamId: string | null) =>
    update.mutate(
      { id: user.id, patch: { defaultTeamId: teamId } },
      { onSuccess: () => toast.success('Preferences saved') },
    );

  return (
    <div className="flex max-w-2xl flex-col gap-7">
      <div className="flex flex-col gap-1.5">
        <span id={`${uid}-theme`} className="text-sm font-medium">
          Theme
        </span>
        <SegmentedControl<ThemeChoice>
          label="Theme"
          value={choice}
          onValueChange={setChoice}
          options={[
            { value: 'light', label: 'Light', icon: <Sun aria-hidden /> },
            { value: 'dark', label: 'Dark', icon: <Moon aria-hidden /> },
            { value: 'system', label: 'Match system', icon: <Monitor aria-hidden /> },
          ]}
          className="w-fit"
        />
        <p className="text-sm text-ink-2">
          Match system follows your device’s light or dark setting.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Weight unit</span>
        <SegmentedControl<'lb' | 'kg' | typeof CLUB>
          label="Weight unit"
          value={user.preferences?.weightUnit ?? CLUB}
          onValueChange={setUnit}
          options={[
            { value: CLUB, label: 'Club default' },
            { value: 'lb', label: 'Pounds' },
            { value: 'kg', label: 'Kilograms' },
          ]}
          className="w-fit"
        />
        <p className="text-sm text-ink-2">
          Crew weight ranges on shells show in this unit. The club default is {clubUnit}.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-team`}>Default team</Label>
        <Select
          id={`${uid}-team`}
          value={user.defaultTeamId ?? NONE}
          onValueChange={(v) => setTeam(v === NONE ? null : v)}
          options={[
            { value: NONE, label: 'None' },
            ...(teams.data ?? [])
              .filter((t) => !t.archived || t.id === user.defaultTeamId)
              .map((t) => ({ value: t.id, label: t.name })),
          ]}
          className="w-full sm:w-72"
        />
        <p className="text-sm text-ink-2">Lineups open to this team first.</p>
      </div>
    </div>
  );
}
