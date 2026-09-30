// Phase 3 pieces for the component gallery (/dev/components): the comments thread on a seeded
// target, the load checklist row, and the share links dialog on a seeded regatta (in demo
// mode, the quickest way to make a link and open its page).

import { useMemo, useState, type ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { applyTick, useList, type ShareLoadItem } from '@/data';
import { CommentCount, CommentsThread } from '@/components/CommentsThread';
import { ShareLinksDialog } from '@/components/ShareLinksDialog';
import { EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ChecklistRow } from './ChecklistRow';
import type { TickField } from './offline-queue';

function GallerySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const TZ = 'America/Los_Angeles';

const SAMPLE_LINES: (ShareLoadItem & { pending?: TickField[] })[] = [
  {
    id: 'g1',
    kind: 'shell',
    label: 'Live.Laugh.Love (LLL)',
    quantity: 1,
    container: 'Boys trailer',
    trailerName: 'Boys trailer',
    loaded: true,
    loadedAt: '2025-05-15T23:14:00.000Z',
    loadedBy: 'Sam',
    returned: false,
    returnedAt: null,
    returnedBy: null,
  },
  {
    id: 'g2',
    kind: 'oar_set',
    label: '24-C · yellow-white',
    quantity: 9,
    container: 'Boys trailer bed',
    trailerName: 'Boys trailer',
    loaded: false,
    loadedAt: null,
    loadedBy: null,
    returned: false,
    returnedAt: null,
    returnedBy: null,
  },
  {
    id: 'g3',
    kind: 'gear',
    label: 'Slings',
    quantity: 12,
    container: 'Truck 1 bed',
    trailerName: null,
    loaded: true,
    loadedAt: '2025-05-15T23:45:00.000Z',
    loadedBy: 'Casey Coach',
    returned: true,
    returnedAt: '2025-05-19T01:40:00.000Z',
    returnedBy: 'Jo',
    pending: ['returned'],
  },
];

function ChecklistSample() {
  const [lines, setLines] = useState(SAMPLE_LINES);
  return (
    <ul className="grid max-w-3xl gap-2 md:grid-cols-2">
      {lines.map((line) => (
        <ChecklistRow
          key={line.id}
          line={line}
          detail={line.container}
          timeZone={TZ}
          onTick={(field, value) =>
            setLines((all) =>
              all.map((l) =>
                l.id === line.id
                  ? { ...applyTick(l, { [field]: value, by: 'Sam' }), pending: [] }
                  : l,
              ),
            )
          }
        />
      ))}
    </ul>
  );
}

function CommentsSample() {
  const comments = useList('comments', { sort: ['created', 'id'] });
  const target = useMemo(() => {
    const list = comments.data ?? [];
    return list.find((c) => c.body.includes('@')) ?? list[0] ?? null;
  }, [comments.data]);
  if (!target) {
    return (
      <EmptyState
        title="No comments in this dataset"
        description="Demo mode seeds a few; sign in to the demo to see them here."
      />
    );
  }
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-ink-2">
        Count badge:
        <CommentCount targetType={target.targetType} targetId={target.targetId} />
        <CommentCount
          targetType={target.targetType}
          targetId={target.targetId}
          count={0}
          showZero
        />
      </div>
      <div className="rounded-card border border-line bg-surface p-4">
        <CommentsThread targetType={target.targetType} targetId={target.targetId} />
      </div>
    </div>
  );
}

function ShareLinksSample() {
  const regattas = useList('regattas', { sort: 'startDate' });
  const [open, setOpen] = useState(false);
  const regatta =
    regattas.data?.find((r) => r.name.includes('Northwest')) ?? regattas.data?.[0] ?? null;
  if (!regatta) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={() => setOpen(true)}>
        <Link2 aria-hidden />
        Share links
      </Button>
      <span className="text-sm text-ink-2">For {regatta.name}</span>
      <ShareLinksDialog regattaId={regatta.id} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function ShareGallery() {
  return (
    <>
      <GallerySection title="Comments">
        <CommentsSample />
      </GallerySection>
      <GallerySection title="Load checklist row">
        <ChecklistSample />
      </GallerySection>
      <GallerySection title="Share links">
        <ShareLinksSample />
      </GallerySection>
    </>
  );
}
