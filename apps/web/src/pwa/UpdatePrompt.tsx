// Registers the service worker (vite-plugin-pwa, PLAN.md §7.1) and offers new versions with a
// quiet toast instead of reloading under someone's hands. The service worker precaches the app
// shell so SRT opens with no connection; data offline comes from the saved query cache
// (data/persist.ts), never from the service worker.

import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from '@/components/toast';

/** How often an open tab checks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => {
        if (navigator.onLine) void registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast('A new version is ready', {
      id: 'srt-update',
      duration: Infinity,
      action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
