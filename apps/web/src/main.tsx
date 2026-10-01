import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import type { RosterAthlete } from '@srt/seed';
import { SEED_EMAILS } from '@srt/seed';
import juniorRosters from 'virtual:srt-local-rosters';
import sealedRoster from 'virtual:srt-sealed-roster';
import './styles/globals.css';
import { createStore } from './data/create-store';
import { createIdbPersister } from './data/persist';
import { AppProviders, createQueryClient, networkProbeFor } from './app/providers';
import { createAppRouter } from './app/router';
import { openWithRememberedKey } from './app/unlock/sealed-roster';
import { UnlockPage } from './app/unlock/UnlockPage';
import { UpdatePrompt } from './pwa/UpdatePrompt';

const root = createRoot(document.getElementById('root')!);

function start(rosters: RosterAthlete[], { signInAsAdmin = false } = {}) {
  const store = createStore(rosters);
  // MemoryStore signs in at once, before the first render, so the app never shows sign-in.
  if (signInAsAdmin && !store.auth.user) void store.auth.signInWithPassword(SEED_EMAILS.admin, '');
  const queryClient = createQueryClient({ mode: store.mode });
  // Offline reads (PLAN.md §10.4): the query cache is saved on this device, and the app checks
  // that it can reach the server before offering edits.
  const persister = createIdbPersister();
  const probe = networkProbeFor(store);
  const router = createAppRouter({ store, queryClient });
  root.render(
    <StrictMode>
      <AppProviders store={store} queryClient={queryClient} persister={persister} probe={probe}>
        <RouterProvider router={router} />
        <UpdatePrompt />
      </AppProviders>
    </StrictMode>,
  );
}

// The published demo (`--mode pages`, PLAN.md §18) opens its sealed rosters first: with the key
// this device remembers, or with the password, after which it signs in as the admin.
if (sealedRoster) {
  const sealed = sealedRoster;
  void openWithRememberedKey(sealed).then((athletes) => {
    if (athletes) {
      start(athletes);
      return;
    }
    root.render(
      <StrictMode>
        <UnlockPage sealed={sealed} onUnlock={(opened) => start(opened, { signInAsAdmin: true })} />
      </StrictMode>,
    );
  });
} else {
  start(juniorRosters);
}
