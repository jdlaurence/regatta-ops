// "Updated by Sarah W. just now" toasts. Mounted once per open regatta (the regatta layout). The
// data itself is already fresh: RealtimeProvider refetches on every change; this only tells the
// coach that someone else moved things under them.

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ChangeCoalescer, remoteChange, type ChangeNotice } from './change-coalescer';
import { useCurrentUser, useList } from './hooks';
import { useRealtimeEvents } from './realtime';

function showChangeToast(notice: ChangeNotice) {
  toast(notice.title, { id: notice.id, description: notice.description });
}

/**
 * Toast other people's changes to the open regatta's working set, one toast per burst. Never
 * toasts the signed-in user's own writes. `show` is for tests.
 */
export function useChangeToasts(
  regattaId: string | null | undefined,
  show: (notice: ChangeNotice) => void = showChangeToast,
) {
  const me = useCurrentUser();
  // Same key as the working set's users list, so this is a cache hit on regatta pages.
  const users = useList('users', { sort: 'name' });
  const names = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u.name])), [users.data]);
  const [coalescer] = useState(() => new ChangeCoalescer((n) => show(n)));
  useEffect(() => () => coalescer.dispose(), [coalescer]);
  useRealtimeEvents((event) => {
    const change = remoteChange(event, { regattaId: regattaId ?? null, meId: me?.id, names });
    if (change) coalescer.push(change);
  });
}
