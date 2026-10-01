// Settings: club defaults, users and roles, the signed-in user's preferences, and the activity
// log. The tab is in the URL (?tab=activity) so it can be linked.

import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/select';
import { ActivityLogSection } from './ActivityLogSection';
import { ClubDefaultsSection } from './ClubDefaultsSection';
import { PreferencesSection } from './PreferencesSection';
import { UsersSection } from './UsersSection';

const TABS = [
  { value: 'club', label: 'Club defaults', short: 'Club' },
  { value: 'users', label: 'Users and roles', short: 'Users' },
  { value: 'preferences', label: 'My preferences', short: 'Preferences' },
  { value: 'activity', label: 'Activity log', short: 'Activity' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const tab: TabValue = TABS.some((t) => t.value === asked) ? (asked as TabValue) : 'club';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      <Tabs
        value={tab}
        onValueChange={(v) => setParams(v === 'club' ? {} : { tab: v }, { replace: true })}
        className="flex flex-col gap-6"
      >
        <TabsList
          aria-label="Settings sections"
          className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0"
        >
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              aria-label={t.label}
              className="shrink-0 px-2.5 whitespace-nowrap sm:px-3"
            >
              <span className="sm:hidden">{t.short}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="club">
          <ClubDefaultsSection />
        </TabsContent>
        <TabsContent value="users">
          <UsersSection />
        </TabsContent>
        <TabsContent value="preferences">
          <PreferencesSection />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityLogSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
