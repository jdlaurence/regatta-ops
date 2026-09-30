import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './styles/globals.css';
import { createStore } from './data/create-store';
import { createIdbPersister } from './data/persist';
import { AppProviders, createQueryClient, networkProbeFor } from './app/providers';
import { createAppRouter } from './app/router';
import { UpdatePrompt } from './pwa/UpdatePrompt';

const store = createStore();
const queryClient = createQueryClient({ mode: store.mode });
// Offline reads (PLAN.md §10.4): the query cache is saved on this device, and the app checks
// that it can reach the server before offering edits.
const persister = createIdbPersister();
const probe = networkProbeFor(store);
const router = createAppRouter({ store, queryClient });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders store={store} queryClient={queryClient} persister={persister} probe={probe}>
      <RouterProvider router={router} />
      <UpdatePrompt />
    </AppProviders>
  </StrictMode>,
);
