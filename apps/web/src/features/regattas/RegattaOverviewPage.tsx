// Regatta overview (PLAN.md §4.1, §6.2): participating teams with entries, boated counts,
// conflicts by severity, and load plan status; the day at a glance; recent activity. The
// layout above (app/shell/RegattaLayout) shows the name, dates, place, tabs, and status banner.

import { useMemo, useState } from 'react';
import { Copy, Settings, Share2 } from 'lucide-react';
import { useCan, useFindings } from '@/data';
import { useRegattaId } from '@/app/params';
import { formatDayRange } from '@/lib/dates';
import { PageHeader } from '@/components/PageHeader';
import { ShareLinksDialog } from '@/components/ShareLinksDialog';
import { ErrorState, Skeleton, SkeletonRows } from '@/components/states';
import { Button } from '@/components/ui/button';
import { EventFormDialog } from '@/features/events/EventFormDialog';
import { ImportEventsDialog } from '@/features/events/ImportEventsDialog';
import { DayAtAGlance } from './DayAtAGlance';
import { DuplicateRegattaDialog } from './DuplicateRegattaDialog';
import { RecentActivity } from './RecentActivity';
import { RegattaSettingsDialog } from './RegattaSettingsDialog';
import { RegattaTeams } from './RegattaTeams';
import { teamSummaries } from './summary';
import { useConfirmFinalEdit } from './useConfirmFinalEdit';

type OpenDialog = 'settings' | 'duplicate' | 'import' | 'event' | 'share' | null;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-display text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function RegattaOverviewPage() {
  const regattaId = useRegattaId();
  const canEdit = useCan('regatta.edit');
  const {
    findings,
    input,
    workingSet: ws,
    isLoading,
    isError,
    error,
    refetch,
  } = useFindings(regattaId);
  const finalEdit = useConfirmFinalEdit(ws?.regatta);
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const summaries = useMemo(
    () => (ws && input ? teamSummaries(ws, input, findings) : []),
    [ws, input, findings],
  );
  const setOpen = (d: OpenDialog) => (open: boolean) => setDialog(open ? d : null);

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Overview" />
        <ErrorState title="This regatta did not load." error={error} onRetry={refetch} />
      </div>
    );
  }
  if (isLoading || !ws) {
    return (
      <div className="flex flex-col gap-8" role="status" aria-label="Loading overview">
        <PageHeader title="Overview" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-32" />
          <SkeletonRows rows={4} />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const regatta = ws.regatta;
  const place = [regatta.venue, regatta.city].filter(Boolean).join(', ');

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Overview"
        description={
          <span className="tabular-nums md:hidden">
            {formatDayRange(regatta.startDate, regatta.endDate)}
            {place && ` · ${place}`}
          </span>
        }
        actions={
          canEdit && (
            <>
              <Button onClick={() => setDialog('share')}>
                <Share2 aria-hidden />
                Share
              </Button>
              <Button onClick={() => setDialog('duplicate')}>
                <Copy aria-hidden />
                Duplicate
              </Button>
              <Button onClick={() => setDialog('settings')}>
                <Settings aria-hidden />
                Settings
              </Button>
            </>
          )
        }
      />

      <Section id="overview-teams" title="Teams">
        <RegattaTeams
          regatta={regatta}
          summaries={summaries}
          allTeams={ws.teams}
          finalEdit={finalEdit}
        />
      </Section>

      <Section id="overview-day" title="Day at a glance">
        <DayAtAGlance
          regatta={regatta}
          events={ws.events}
          canEdit={canEdit}
          onImport={() => setDialog('import')}
          onAddEvent={() => setDialog('event')}
        />
      </Section>

      <Section id="overview-activity" title="Recent activity">
        <RecentActivity regattaId={regatta.id} users={ws.users} />
      </Section>

      {canEdit && (
        <>
          <ShareLinksDialog
            regattaId={regatta.id}
            open={dialog === 'share'}
            onOpenChange={setOpen('share')}
          />
          <RegattaSettingsDialog
            regatta={regatta}
            clubSettings={ws.clubSettings}
            events={ws.events}
            open={dialog === 'settings'}
            onOpenChange={setOpen('settings')}
          />
          <DuplicateRegattaDialog
            regatta={regatta}
            events={ws.events}
            regattaTeams={ws.regattaTeams}
            open={dialog === 'duplicate'}
            onOpenChange={setOpen('duplicate')}
          />
          <ImportEventsDialog
            regattaId={regatta.id}
            open={dialog === 'import'}
            onOpenChange={setOpen('import')}
          />
          <EventFormDialog
            regattaId={regatta.id}
            open={dialog === 'event'}
            onOpenChange={setOpen('event')}
          />
        </>
      )}
      {finalEdit.dialog}
    </div>
  );
}
