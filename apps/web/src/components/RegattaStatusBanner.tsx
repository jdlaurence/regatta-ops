// The banner a regatta page shows for its status: "final" asks for confirmation on edits but does
// not lock; "archived" is hidden from the default list. Planning shows nothing. Edits on a final
// regatta confirm through useConfirmFinalEdit (features/regattas).

import type { ReactNode } from 'react';
import { Archive, Lock } from 'lucide-react';
import type { RegattaStatus } from '@regatta-ops/domain';
import { cn } from '@/lib/cn';

const COPY: Record<Exclude<RegattaStatus, 'planning'>, { icon: typeof Lock; text: string }> = {
  final: { icon: Lock, text: 'This regatta is final. Changes need confirmation.' },
  archived: {
    icon: Archive,
    text: 'This regatta is archived. It is hidden from the regattas list; change its status in Settings to bring it back.',
  },
};

export function RegattaStatusBanner({
  status,
  action,
  className,
}: {
  status: RegattaStatus;
  /** Optional control at the end of the banner ("Settings"). */
  action?: ReactNode;
  className?: string;
}) {
  if (status === 'planning') return null;
  const { icon: Icon, text } = COPY[status];
  return (
    <div
      role="note"
      data-print="hide"
      className={cn(
        'flex items-start gap-2.5 rounded-card border px-4 py-3 text-base leading-prose',
        status === 'final' ? 'border-info/40 bg-info-tint' : 'border-line bg-surface-2',
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', status === 'final' ? 'text-info' : 'text-ink-2')}
      />
      <p className="min-w-0 flex-1">{text}</p>
      {action && <div className="-my-1 shrink-0">{action}</div>}
    </div>
  );
}
